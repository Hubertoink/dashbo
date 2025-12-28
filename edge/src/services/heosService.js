const heos = require('heos-api');
const net = require('net');

const DEFAULT_DISCOVERY_TIMEOUT_MS = 5000;
const DEFAULT_COMMAND_TIMEOUT_MS = 5000;

const DEFAULT_SCAN_TTL_MS = 10_000;

let connectionPromise = null;

let cachedPlayers = null;
let lastScanAt = null;
let lastError = null;
let lastScanMethod = null;

function getHeosHosts() {
  const host = String(process.env.HEOS_HOST || '').trim();
  if (host) return [host];

  const hostsRaw = String(process.env.HEOS_HOSTS || '').trim();
  if (!hostsRaw) return [];
  return hostsRaw
    .split(',')
    .map((s) => String(s).trim())
    .filter(Boolean);
}

function parseCidrV4(cidr) {
  const raw = String(cidr || '').trim();
  const m = raw.match(/^([0-9]{1,3}(?:\.[0-9]{1,3}){3})\/(\d{1,2})$/);
  if (!m) return null;
  const ip = m[1];
  const prefix = Number(m[2]);
  if (!Number.isFinite(prefix) || prefix < 16 || prefix > 30) return null;
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p) || p < 0 || p > 255)) return null;
  const ipInt = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = ipInt & mask;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  return { network, broadcast, prefix };
}

function intToIpV4(n) {
  return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
}

function tcpProbe(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const done = (ok) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));

    try {
      socket.connect(port, host);
    } catch {
      done(false);
    }
  });
}

async function findHostByPortScan(cidr, opts) {
  const parsed = parseCidrV4(cidr);
  if (!parsed) return null;

  const port = Math.max(1, Number(opts?.port ?? 1255));
  const timeoutMs = Math.max(50, Number(opts?.timeoutMs ?? 200));
  const concurrency = Math.max(1, Math.min(256, Number(opts?.concurrency ?? 64)));

  const first = parsed.network + 1;
  const last = parsed.broadcast - 1;
  if (first > last) return null;

  let current = first;
  let found = null;

  async function worker() {
    while (!found && current <= last) {
      const n = current;
      current += 1;
      const ip = intToIpV4(n >>> 0);
      const ok = await tcpProbe(ip, port, timeoutMs);
      if (ok) {
        found = ip;
        return;
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return found;
}

function getDiscoveryTimeoutMs() {
  const raw = Number(process.env.HEOS_DISCOVERY_TIMEOUT_MS || DEFAULT_DISCOVERY_TIMEOUT_MS);
  return Number.isFinite(raw) ? Math.max(1000, raw) : DEFAULT_DISCOVERY_TIMEOUT_MS;
}

function getCommandTimeoutMs() {
  const raw = Number(process.env.HEOS_COMMAND_TIMEOUT_MS || DEFAULT_COMMAND_TIMEOUT_MS);
  return Number.isFinite(raw) ? Math.max(500, raw) : DEFAULT_COMMAND_TIMEOUT_MS;
}

async function connectOnce() {
  const hosts = getHeosHosts();
  if (hosts.length > 0) {
    lastScanMethod = hosts.length === 1 && process.env.HEOS_HOST ? 'host' : 'hosts';
    let lastErr = null;
    for (const h of hosts) {
      try {
        const conn = await heos.connect(h);

        conn.onClose(() => {
          connectionPromise = null;
        });

        conn.onError(() => {
          // keep connection cached; read operations will fail and trigger reconnect on next call
        });

        return conn;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('HEOS connect failed');
  }

  try {
    lastScanMethod = 'ssdp';
    const conn = await heos.discoverAndConnect(getDiscoveryTimeoutMs());

    conn.onClose(() => {
      connectionPromise = null;
    });

    conn.onError(() => {
      // keep connection cached; read operations will fail and trigger reconnect on next call
    });

    return conn;
  } catch (err) {
    const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
    const cidr = String(process.env.HEOS_SCAN_CIDR || '').trim();
    if (cidr && String(msg).toLowerCase().includes('no devices found')) {
      const scannedHost = await findHostByPortScan(cidr, {
        port: 1255,
        timeoutMs: Number(process.env.HEOS_SCAN_TIMEOUT_MS || 200),
        concurrency: Number(process.env.HEOS_SCAN_CONCURRENCY || 64)
      });
      if (scannedHost) {
        lastScanMethod = 'tcp_scan';
        const conn = await heos.connect(scannedHost);

        conn.onClose(() => {
          connectionPromise = null;
        });

        conn.onError(() => {
          // keep connection cached; read operations will fail and trigger reconnect on next call
        });

        return conn;
      }
      lastScanMethod = 'tcp_scan';
      throw new Error('No devices found');
    }
    throw err;
  }
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

async function sendOnConn(conn, commandGroup, command, attributes, opts) {
  const timeoutMs = Math.max(500, Number(opts?.timeoutMs ?? getCommandTimeoutMs()));
  const responsePromise = waitForResponse(conn, commandGroup, command, timeoutMs);
  conn.write(commandGroup, command, attributes);
  return responsePromise;
}

async function sendWithHostsFallback(commandGroup, command, attributes, opts) {
  const hosts = getHeosHosts();
  if (hosts.length === 0) {
    return send(commandGroup, command, attributes, opts);
  }

  lastScanMethod = hosts.length === 1 && process.env.HEOS_HOST ? 'host' : 'hosts';
  let lastErr = null;
  let lastResponse = null;

  for (const host of hosts) {
    let conn = null;
    try {
      conn = await heos.connect(host);
      const resp = await sendOnConn(conn, commandGroup, command, attributes, opts);
      lastResponse = resp;
      const result = String(resp?.heos?.result || '').toLowerCase();
      if (!result || result === 'success') {
        return resp;
      }
      lastErr = new Error(resp?.heos?.message || 'HEOS command failed');
    } catch (e) {
      lastErr = e;
    } finally {
      try {
        if (conn && typeof conn.close === 'function') conn.close();
        else if (conn && typeof conn.end === 'function') conn.end();
        else if (conn && typeof conn.destroy === 'function') conn.destroy();
      } catch {
        // ignore
      }
    }
  }

  if (lastResponse?.heos?.message) throw new Error(String(lastResponse.heos.message));
  throw lastErr || new Error('heos_error');
}

function parsePlayersPayload(payload) {
  const arr = Array.isArray(payload) ? payload : [];
  return arr
    .map((p) => ({
      pid: typeof p?.pid === 'number' ? p.pid : Number(p?.pid),
      name: String(p?.name || ''),
      model: p?.model ? String(p.model) : undefined,
      version: p?.version ? String(p.version) : undefined
    }))
    .filter((p) => Number.isFinite(p.pid) && p.pid !== 0 && p.name);
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
    const hosts = getHeosHosts();

    let players = [];
    if (hosts.length > 1) {
      // Some setups (notably Docker on Windows) may return only the connected device.
      // Query each host and union the results to get a complete list.
      const byPid = new Map();
      for (const host of hosts) {
        let conn = null;
        try {
          conn = await heos.connect(host);
          const resp = await sendOnConn(conn, 'player', 'get_players');
          const parsed = parsePlayersPayload(resp?.payload);
          for (const p of parsed) byPid.set(p.pid, p);
        } catch {
          // ignore individual host failures
        } finally {
          try {
            if (conn && typeof conn.close === 'function') conn.close();
            else if (conn && typeof conn.end === 'function') conn.end();
            else if (conn && typeof conn.destroy === 'function') conn.destroy();
          } catch {
            // ignore
          }
        }
      }
      players = Array.from(byPid.values());
      lastScanMethod = 'hosts';
    } else {
      const resp = await sendWithHostsFallback('player', 'get_players');
      players = parsePlayersPayload(resp?.payload);
    }

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
    lastScanMethod: lastScanMethod || null,
    playersCount: Array.isArray(cachedPlayers) ? cachedPlayers.length : 0
  };
}

async function playStream(pid, url, name) {
  const attrs = {
    pid: Number(pid),
    url: String(url || '').trim()
  };
  if (name) attrs.name = String(name);

  return sendWithHostsFallback('browse', 'play_stream', attrs);
}

async function setPlayState(pid, state) {
  const s = String(state || '').toLowerCase();
  if (!['play', 'pause', 'stop'].includes(s)) {
    throw new Error('Invalid play state');
  }
  return sendWithHostsFallback('player', 'set_play_state', { pid: Number(pid), state: s });
}

module.exports = {
  listPlayers,
  scanPlayers,
  getStatus,
  playStream,
  setPlayState
};
