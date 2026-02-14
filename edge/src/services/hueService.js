const fs = require('fs/promises');
const path = require('path');
const http = require('http');
const https = require('https');

function parseBoolean(value, fallback = false) {
  if (value == null) return fallback;
  const v = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return fallback;
}

function normalizeBridgeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
    u.pathname = '/';
    u.search = '';
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function getConfigPath() {
  const raw = String(process.env.HUE_CONFIG_PATH || '').trim();
  if (raw) return raw;
  return '/var/lib/dashbo-edge/hue.json';
}

async function readStoredConfig() {
  const cfgPath = getConfigPath();
  try {
    const txt = await fs.readFile(cfgPath, 'utf8');
    const parsed = JSON.parse(txt);
    return {
      bridgeUrl: normalizeBridgeUrl(parsed?.bridgeUrl),
      appKey: String(parsed?.appKey || '').trim(),
      allowSelfSigned: parseBoolean(parsed?.allowSelfSigned, true)
    };
  } catch {
    return {
      bridgeUrl: '',
      appKey: '',
      allowSelfSigned: parseBoolean(process.env.HUE_ALLOW_SELF_SIGNED, parseBoolean(process.env.HUE_TLS_INSECURE, true))
    };
  }
}

async function writeStoredConfig(input) {
  const cfgPath = getConfigPath();
  const dir = path.dirname(cfgPath);
  await fs.mkdir(dir, { recursive: true });
  const payload = {
    bridgeUrl: normalizeBridgeUrl(input?.bridgeUrl),
    appKey: String(input?.appKey || '').trim(),
    allowSelfSigned: parseBoolean(input?.allowSelfSigned, true)
  };
  await fs.writeFile(cfgPath, JSON.stringify(payload, null, 2), 'utf8');
}

function requestJsonByUrl(url, { method = 'GET', body = null, headers = {}, timeoutMs = 8000, rejectUnauthorized = true } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const bodyText = body ? JSON.stringify(body) : null;

    const reqHeaders = {
      Accept: 'application/json',
      ...(bodyText
        ? {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyText)
          }
        : {}),
      ...headers
    };

    const opts = {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method,
      headers: reqHeaders,
      timeout: timeoutMs,
      ...(target.protocol === 'https:' ? { rejectUnauthorized } : {})
    };

    const transport = target.protocol === 'https:' ? https : http;
    const req = transport.request(opts, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        const status = Number(res.statusCode || 0);
        let parsed = null;
        if (raw) {
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = null;
          }
        }

        if (status >= 200 && status < 300) {
          resolve(parsed);
          return;
        }

        const msg = typeof parsed?.message === 'string' ? parsed.message : `http_${status}`;
        const err = new Error(msg);
        err.status = status;
        err.payload = parsed;
        reject(err);
      });
    });

    req.on('timeout', () => req.destroy(new Error('hue_timeout')));
    req.on('error', reject);

    if (bodyText) req.write(bodyText);
    req.end();
  });
}

async function getHueConfig() {
  const envBridgeUrl = normalizeBridgeUrl(process.env.HUE_BRIDGE_URL || process.env.HUE_BRIDGE_IP);
  const envAppKey = String(process.env.HUE_APP_KEY || '').trim();

  const stored = await readStoredConfig();

  const allowSelfSigned =
    stored.allowSelfSigned != null
      ? parseBoolean(stored.allowSelfSigned, true)
      : parseBoolean(process.env.HUE_ALLOW_SELF_SIGNED, parseBoolean(process.env.HUE_TLS_INSECURE, true));

  const bridgeUrl = stored.bridgeUrl || envBridgeUrl;
  const appKey = stored.appKey || envAppKey;
  const timeoutMs = Math.max(1000, Math.min(30000, Number(process.env.HUE_TIMEOUT_MS || 8000) || 8000));

  return {
    bridgeUrl,
    appKey,
    allowSelfSigned,
    timeoutMs,
    configured: Boolean(bridgeUrl && appKey),
    source: stored.bridgeUrl || stored.appKey ? 'storage' : 'env'
  };
}

async function requestHue(pathname, { method = 'GET', body = null } = {}) {
  const cfg = await getHueConfig();
  if (!cfg.configured) throw new Error('hue_not_configured');

  const url = new URL(pathname, cfg.bridgeUrl).toString();
  return requestJsonByUrl(url, {
    method,
    body,
    timeoutMs: cfg.timeoutMs,
    rejectUnauthorized: !cfg.allowSelfSigned,
    headers: { 'hue-application-key': cfg.appKey }
  });
}

async function discoverHueBridgeUrl() {
  try {
    const payload = await requestJsonByUrl('https://discovery.meethue.com/', {
      method: 'GET',
      timeoutMs: 4000,
      rejectUnauthorized: true
    });

    const first = Array.isArray(payload) ? payload[0] : null;
    const ip = String(first?.internalipaddress || '').trim();
    if (!ip) return '';
    return normalizeBridgeUrl(`https://${ip}`);
  } catch {
    return '';
  }
}

async function pairHueBridge({ bridgeUrl } = {}) {
  const cfg = await getHueConfig();
  const explicit = normalizeBridgeUrl(bridgeUrl);
  const discovered = explicit || (await discoverHueBridgeUrl()) || cfg.bridgeUrl;

  if (!discovered) throw new Error('hue_bridge_not_found');

  const payload = await requestJsonByUrl(`${discovered}/api`, {
    method: 'POST',
    body: { devicetype: 'dashbo#edge', generateclientkey: true },
    timeoutMs: cfg.timeoutMs,
    rejectUnauthorized: !cfg.allowSelfSigned
  });

  const rows = Array.isArray(payload) ? payload : [];
  const success = rows.find((x) => x?.success?.username);
  const username = String(success?.success?.username || '').trim();

  if (!username) {
    const linkError = rows.find((x) => Number(x?.error?.type) === 101);
    if (linkError) throw new Error('hue_link_button_required');
    throw new Error('hue_pair_failed');
  }

  await writeStoredConfig({
    bridgeUrl: discovered,
    appKey: username,
    allowSelfSigned: cfg.allowSelfSigned
  });

  return { ok: true, bridgeUrl: discovered };
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function hexToRgb(hex) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(String(hex || '').trim());
  if (!m) return null;
  const s = m[1];
  return {
    r: Number.parseInt(s.slice(0, 2), 16),
    g: Number.parseInt(s.slice(2, 4), 16),
    b: Number.parseInt(s.slice(4, 6), 16)
  };
}

function rgbToHex(r, g, b) {
  const rr = Math.max(0, Math.min(255, Math.round(r)));
  const gg = Math.max(0, Math.min(255, Math.round(g)));
  const bb = Math.max(0, Math.min(255, Math.round(b)));
  return `#${rr.toString(16).padStart(2, '0')}${gg.toString(16).padStart(2, '0')}${bb.toString(16).padStart(2, '0')}`.toUpperCase();
}

function hexToXy(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  const lin = [rgb.r, rgb.g, rgb.b].map((v) => {
    const n = v / 255;
    return n > 0.04045 ? Math.pow((n + 0.055) / (1 + 0.055), 2.4) : n / 12.92;
  });

  const [r, g, b] = lin;
  const X = r * 0.664511 + g * 0.154324 + b * 0.162028;
  const Y = r * 0.283881 + g * 0.668433 + b * 0.047685;
  const Z = r * 0.000088 + g * 0.07231 + b * 0.986039;
  const sum = X + Y + Z;
  if (sum <= 0) return { x: 0.3227, y: 0.329 };

  return {
    x: clamp01(X / sum),
    y: clamp01(Y / sum)
  };
}

function xyToHex(x, y) {
  const safeY = Number.isFinite(y) && y > 0 ? y : 0.329;
  const safeX = Number.isFinite(x) ? x : 0.3227;
  const z = 1.0 - safeX - safeY;
  const Y = 1.0;
  const X = (Y / safeY) * safeX;
  const Z = (Y / safeY) * z;

  let r = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
  let g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
  let b = X * 0.051713 - Y * 0.121364 + Z * 1.01153;

  r = r <= 0.0031308 ? 12.92 * r : (1 + 0.055) * Math.pow(r, 1 / 2.4) - 0.055;
  g = g <= 0.0031308 ? 12.92 * g : (1 + 0.055) * Math.pow(g, 1 / 2.4) - 0.055;
  b = b <= 0.0031308 ? 12.92 * b : (1 + 0.055) * Math.pow(b, 1 / 2.4) - 0.055;

  return rgbToHex(r * 255, g * 255, b * 255);
}

function mapLight(light) {
  const id = String(light?.id || '').trim();
  const name = String(light?.metadata?.name || light?.product_data?.product_name || id || 'Lampe').trim();
  const on = Boolean(light?.on?.on);
  const brightness = Number.isFinite(Number(light?.dimming?.brightness))
    ? Math.max(1, Math.min(100, Math.round(Number(light.dimming.brightness))))
    : null;
  const x = Number(light?.color?.xy?.x);
  const y = Number(light?.color?.xy?.y);
  const colorHex = Number.isFinite(x) && Number.isFinite(y) ? xyToHex(x, y) : null;

  return { id, name, on, brightness, colorHex };
}

async function getHueStatus() {
  const cfg = await getHueConfig();
  if (!cfg.configured) {
    return {
      configured: false,
      available: false,
      bridgeUrl: cfg.bridgeUrl || null,
      source: cfg.source,
      error: 'Hue nicht konfiguriert.'
    };
  }

  try {
    const payload = await requestHue('/clip/v2/resource/light');
    const count = Array.isArray(payload?.data) ? payload.data.length : 0;
    return {
      configured: true,
      available: true,
      bridgeUrl: cfg.bridgeUrl,
      source: cfg.source,
      lightsCount: count,
      error: null
    };
  } catch (e) {
    return {
      configured: true,
      available: false,
      bridgeUrl: cfg.bridgeUrl,
      source: cfg.source,
      error: String(e?.message || 'Hue Bridge nicht erreichbar.')
    };
  }
}

async function listHueLights() {
  const payload = await requestHue('/clip/v2/resource/light');
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows.map(mapLight).filter((x) => x.id).sort((a, b) => a.name.localeCompare(b.name));
}

function mapGroupedLight(gl) {
  const id = String(gl?.id || '').trim();
  const on = Boolean(gl?.on?.on);
  const brightness = Number.isFinite(Number(gl?.dimming?.brightness))
    ? Math.max(1, Math.min(100, Math.round(Number(gl.dimming.brightness))))
    : null;
  return { id, on, brightness };
}

function mapRoom(room, groupedLightsMap) {
  const id = String(room?.id || '').trim();
  const name = String(room?.metadata?.name || 'Zimmer').trim();
  const childLightIds = (Array.isArray(room?.children) ? room.children : [])
    .filter((c) => c?.rtype === 'device' || c?.rtype === 'light')
    .map((c) => String(c?.rid || ''));

  const groupedLightRef = (Array.isArray(room?.services) ? room.services : [])
    .find((s) => s?.rtype === 'grouped_light');
  const groupedLightId = String(groupedLightRef?.rid || '').trim();
  const gl = groupedLightsMap[groupedLightId] || {};

  return {
    id,
    name,
    groupedLightId: groupedLightId || null,
    on: Boolean(gl.on),
    brightness: gl.brightness ?? null,
    lightCount: childLightIds.length
  };
}

async function listHueRooms() {
  const [roomsPayload, groupedPayload] = await Promise.all([
    requestHue('/clip/v2/resource/room'),
    requestHue('/clip/v2/resource/grouped_light')
  ]);

  const groupedLights = Array.isArray(groupedPayload?.data) ? groupedPayload.data : [];
  const groupedMap = {};
  for (const gl of groupedLights) {
    const mapped = mapGroupedLight(gl);
    if (mapped.id) groupedMap[mapped.id] = mapped;
  }

  const rooms = Array.isArray(roomsPayload?.data) ? roomsPayload.data : [];
  return rooms
    .map((r) => mapRoom(r, groupedMap))
    .filter((r) => r.id && r.groupedLightId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function setHueRoomState({ id, on, brightness }) {
  const roomId = String(id || '').trim();
  if (!roomId) throw new Error('invalid_room_id');

  const body = {};
  if (typeof on === 'boolean') body.on = { on };
  if (brightness != null) {
    const b = Number(brightness);
    if (!Number.isFinite(b)) throw new Error('invalid_brightness');
    body.dimming = { brightness: Math.max(1, Math.min(100, b)) };
  }

  if (Object.keys(body).length === 0) throw new Error('empty_state');
  await requestHue(`/clip/v2/resource/grouped_light/${encodeURIComponent(roomId)}`, { method: 'PUT', body });
  return { ok: true };
}

async function setHueLightState({ id, on, brightness, hexColor }) {
  const lightId = String(id || '').trim();
  if (!lightId) throw new Error('invalid_light_id');

  const body = {};
  if (typeof on === 'boolean') body.on = { on };
  if (brightness != null) {
    const b = Number(brightness);
    if (!Number.isFinite(b)) throw new Error('invalid_brightness');
    body.dimming = { brightness: Math.max(1, Math.min(100, b)) };
  }
  if (hexColor != null) {
    const xy = hexToXy(hexColor);
    if (!xy) throw new Error('invalid_color');
    body.color = { xy };
  }

  if (Object.keys(body).length === 0) throw new Error('empty_state');
  await requestHue(`/clip/v2/resource/light/${encodeURIComponent(lightId)}`, { method: 'PUT', body });
  return { ok: true };
}

module.exports = {
  getHueStatus,
  listHueLights,
  setHueLightState,
  listHueRooms,
  setHueRoomState,
  pairHueBridge
};