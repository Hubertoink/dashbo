const heos = require('heos-api');

const DEFAULT_DISCOVERY_TIMEOUT_MS = 5000;
const DEFAULT_COMMAND_TIMEOUT_MS = 5000;

const DEFAULT_SCAN_TTL_MS = 10_000;

let connectionPromise = null;

let cachedPlayers = null;
let lastScanAt = null;
let lastError = null;

function getDiscoveryTimeoutMs() {
  const raw = Number(process.env.HEOS_DISCOVERY_TIMEOUT_MS || DEFAULT_DISCOVERY_TIMEOUT_MS);
  return Number.isFinite(raw) ? Math.max(1000, raw) : DEFAULT_DISCOVERY_TIMEOUT_MS;
}

function getCommandTimeoutMs() {
  const raw = Number(process.env.HEOS_COMMAND_TIMEOUT_MS || DEFAULT_COMMAND_TIMEOUT_MS);
  return Number.isFinite(raw) ? Math.max(500, raw) : DEFAULT_COMMAND_TIMEOUT_MS;
}

async function connectOnce() {
  const host = String(process.env.HEOS_HOST || '').trim();

  const conn = host
    ? await heos.connect(host)
    : await heos.discoverAndConnect(getDiscoveryTimeoutMs());

  conn.onClose(() => {
    connectionPromise = null;
  });

  conn.onError(() => {
    // keep connection cached; read operations will fail and trigger reconnect on next call
  });

  return conn;
}

async function getConnection() {
  if (!connectionPromise) {
    connectionPromise = connectOnce().catch((err) => {
      connectionPromise = null;
      throw err;
    });
  }
  return connectionPromise;
}

function waitForResponse(conn, commandGroup, command, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('HEOS timeout'));
    }, timeoutMs);

    conn.once({ commandGroup, command }, (msg) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      resolve(msg);
    });
  });
}

async function send(commandGroup, command, attributes, opts) {
  const timeoutMs = Math.max(500, Number(opts?.timeoutMs ?? getCommandTimeoutMs()));
  const conn = await getConnection();

  const responsePromise = waitForResponse(conn, commandGroup, command, timeoutMs);
  conn.write(commandGroup, command, attributes);

  return responsePromise;
}

async function scanPlayers(opts) {
  const force = Boolean(opts?.force);
  const ttlMs = Math.max(0, Number(opts?.ttlMs ?? DEFAULT_SCAN_TTL_MS));

  if (!force && cachedPlayers && lastScanAt && Date.now() - lastScanAt.getTime() < ttlMs) {
    return cachedPlayers;
  }

  try {
    const resp = await send('player', 'get_players');
    const payload = Array.isArray(resp?.payload) ? resp.payload : [];

    const players = payload
      .map((p) => ({
        pid: typeof p?.pid === 'number' ? p.pid : Number(p?.pid),
        name: String(p?.name || ''),
        model: p?.model ? String(p.model) : undefined,
        version: p?.version ? String(p.version) : undefined
      }))
      .filter((p) => Number.isFinite(p.pid) && p.pid > 0 && p.name);

    cachedPlayers = players;
    lastScanAt = new Date();
    lastError = null;
    return players;
  } catch (err) {
    const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : 'heos_error';
    lastScanAt = new Date();

    // Discovery might fail if there are simply no devices; treat as empty result.
    if (String(msg).toLowerCase().includes('no devices found')) {
      cachedPlayers = [];
      lastError = 'No devices found';
      return cachedPlayers;
    }

    lastError = msg;
    throw err;
  }
}

async function listPlayers() {
  return scanPlayers({ force: false });
}

function getStatus() {
  return {
    ok: true,
    lastScanAt: lastScanAt ? lastScanAt.toISOString() : null,
    lastError: lastError || null,
    playersCount: Array.isArray(cachedPlayers) ? cachedPlayers.length : 0
  };
}

async function playStream(pid, url, name) {
  const attrs = {
    pid: Number(pid),
    url: String(url || '').trim()
  };
  if (name) attrs.name = String(name);

  return send('browse', 'play_stream', attrs);
}

async function setPlayState(pid, state) {
  const s = String(state || '').toLowerCase();
  if (!['play', 'pause', 'stop'].includes(s)) {
    throw new Error('Invalid play state');
  }
  return send('player', 'set_play_state', { pid: Number(pid), state: s });
}

module.exports = {
  listPlayers,
  scanPlayers,
  getStatus,
  playStream,
  setPlayState
};
