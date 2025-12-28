const express = require('express');

const { listPlayers, scanPlayers, getStatus, playStream, setPlayState, getPlayState, getVolume, setVolume } = require('../services/heosService');

const heosRouter = express.Router();

function parseHeosHostsHeader(req) {
  const raw = req.get('x-heos-hosts');
  if (!raw) return null;
  const hosts = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return hosts.length > 0 ? hosts : null;
}

function normalizeHeosError(err) {
  if (!err) return 'heos_error';
  if (typeof err === 'string') return err;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err.message === 'string') return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return 'heos_error';
  }
}

function isLocalhostHostname(hostname) {
  const h = String(hostname || '').toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0';
}

function normalizePublicBaseUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const withScheme = /^https?:\/\//i.test(s) ? s : `http://${s}`;
  try {
    const u = new URL(withScheme);
    return u.origin;
  } catch {
    return '';
  }
}

function rewriteStreamUrlForHeos(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url) return '';

  const publicBase = normalizePublicBaseUrl(process.env.EDGE_PUBLIC_BASE_URL || process.env.EDGE_STREAM_BASE_URL);

  // Allow passing relative URLs; rewrite to public base.
  if (url.startsWith('/')) {
    if (!publicBase) throw new Error('stream_url_is_relative; set EDGE_PUBLIC_BASE_URL');
    return `${publicBase}${url}`;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    // Not a URL and not a relative path => leave as-is.
    return url;
  }

  if (isLocalhostHostname(parsed.hostname)) {
    if (!publicBase) throw new Error('stream_url_is_localhost; set EDGE_PUBLIC_BASE_URL');
    const base = new URL(publicBase);
    base.pathname = parsed.pathname;
    base.search = parsed.search;
    return base.toString();
  }

  return parsed.toString();
}

function sanitizeUrlForDebug(rawUrl) {
  try {
    const u = new URL(String(rawUrl || ''));
    return { origin: u.origin, path: u.pathname };
  } catch {
    return null;
  }
}

heosRouter.get('/players', (req, res) => {
  (async () => {
    const hosts = parseHeosHostsHeader(req);
    const players = await listPlayers({ hosts });
    res.json({ ok: true, players, ...getStatus() });
  })().catch((err) => {
    const error = normalizeHeosError(err);
    if (String(error).toLowerCase().includes('no devices found')) {
      return res.json({ ok: true, players: [], ...getStatus() });
    }
    res.status(502).json({ ok: false, error, ...getStatus() });
  });
});

heosRouter.get('/status', (req, res) => {
  res.json({ ...getStatus() });
});

heosRouter.post('/scan', (req, res) => {
  (async () => {
    const force = Boolean(req?.query?.force) || Boolean(req?.body?.force);
    const hosts = parseHeosHostsHeader(req);
    const players = await scanPlayers({ force, hosts });
    res.json({ ok: true, players, ...getStatus() });
  })().catch((err) => {
    const error = normalizeHeosError(err);
    if (String(error).toLowerCase().includes('no devices found')) {
      return res.json({ ok: true, players: [], ...getStatus() });
    }
    res.status(502).json({ ok: false, error, ...getStatus() });
  });
});

heosRouter.post('/play_stream', (req, res) => {
  (async () => {
    const pid = Number(req?.body?.pid);
    const url = String(req?.body?.url || '').trim();
    const name = req?.body?.name ? String(req.body.name) : undefined;

    if (!Number.isFinite(pid) || pid === 0) return res.status(400).json({ ok: false, error: 'pid_required' });
    if (!url) return res.status(400).json({ ok: false, error: 'url_required' });

    const rewrittenUrl = rewriteStreamUrlForHeos(url);
    try {
      const u = new URL(rewrittenUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return res.status(400).json({
          ok: false,
          error: 'invalid_stream_url',
          hint: 'stream url must be http(s)'
        });
      }
      if (isLocalhostHostname(u.hostname)) {
        return res.status(400).json({
          ok: false,
          error: 'stream_url_unreachable',
          hint: 'HEOS cannot reach localhost; set EDGE_PUBLIC_BASE_URL to a LAN/public URL (e.g. http://192.168.178.27:8787)'
        });
      }
    } catch {
      return res.status(400).json({ ok: false, error: 'invalid_stream_url' });
    }

    const hosts = parseHeosHostsHeader(req);
    const r = await playStream(pid, rewrittenUrl, name, { hosts });
    res.json({ ok: true, response: r, debug: sanitizeUrlForDebug(rewrittenUrl) });
  })().catch((err) => {
    const error = normalizeHeosError(err);
    res.status(502).json({ ok: false, error });
  });
});

heosRouter.get('/play_state', (req, res) => {
  (async () => {
    const pid = Number(req?.query?.pid);
    if (!Number.isFinite(pid) || pid === 0) return res.status(400).json({ ok: false, error: 'pid_required' });
    const hosts = parseHeosHostsHeader(req);
    const r = await getPlayState(pid, { hosts });
    res.json({ ok: true, response: r });
  })().catch((err) => {
    const error = normalizeHeosError(err);
    res.status(502).json({ ok: false, error });
  });
});

heosRouter.get('/volume', (req, res) => {
  (async () => {
    const pid = Number(req?.query?.pid);
    if (!Number.isFinite(pid) || pid === 0) return res.status(400).json({ ok: false, error: 'pid_required' });
    const hosts = parseHeosHostsHeader(req);
    const r = await getVolume(pid, { hosts });
    res.json({ ok: true, response: r });
  })().catch((err) => {
    const error = normalizeHeosError(err);
    res.status(502).json({ ok: false, error });
  });
});

heosRouter.post('/volume', (req, res) => {
  (async () => {
    const pid = Number(req?.body?.pid);
    const level = Number(req?.body?.level);
    if (!Number.isFinite(pid) || pid === 0) return res.status(400).json({ ok: false, error: 'pid_required' });
    if (!Number.isFinite(level)) return res.status(400).json({ ok: false, error: 'level_required' });
    const hosts = parseHeosHostsHeader(req);
    const r = await setVolume(pid, level, { hosts });
    res.json({ ok: true, response: r });
  })().catch((err) => {
    const error = normalizeHeosError(err);
    res.status(502).json({ ok: false, error });
  });
});

heosRouter.post('/play_state', (req, res) => {
  (async () => {
    const pid = Number(req?.body?.pid);
    const state = String(req?.body?.state || '').trim().toLowerCase();
    if (!Number.isFinite(pid) || pid === 0) return res.status(400).json({ ok: false, error: 'pid_required' });
    if (!state) return res.status(400).json({ ok: false, error: 'state_required' });

    const hosts = parseHeosHostsHeader(req);
    const r = await setPlayState(pid, state, { hosts });
    res.json({ ok: true, response: r });
  })().catch((err) => {
    const error = normalizeHeosError(err);
    res.status(502).json({ ok: false, error });
  });
});

module.exports = { heosRouter };
