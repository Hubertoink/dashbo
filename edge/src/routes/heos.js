const express = require('express');

const {
  listPlayers,
  scanPlayers,
  getStatus,
  playStream,
  playNext,
  playPrevious,
  setPlayState,
  getPlayState,
  getVolume,
  setVolume,
  getNowPlayingMedia,
  getPlaybackSummary,
  getGroups,
  setGroup,
  unGroup
} = require('../services/heosService');
const { getMusicLibrary } = require('../services/musicLibrary');
const {
  clearHeosTarget,
  getHeosTarget,
  hasRequestedTarget,
  makeHeosStreamId,
  setHeosTarget
} = require('../services/heosStreamTargets');

const heosRouter = express.Router();

const DASHBO_STREAM_NAME_PREFIX = 'DashbO |';
const DEFAULT_DASHBO_STREAM_WAIT_MS = 18000;

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

function extractHeosParsedNumber(resp, key) {
  const v = resp?.heos?.message?.parsed?.[key];
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizePlaybackState(raw) {
  const state = String(raw || '').trim().toLowerCase();
  return state === 'play' || state === 'pause' || state === 'stop' ? state : 'unknown';
}

function extractPlaybackStateResponse(resp) {
  const parsed = resp?.heos?.message?.parsed;
  return normalizePlaybackState(parsed?.state ?? parsed?.play_state ?? parsed?.playState ?? resp?.payload?.state);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.floor(Number(ms) || 0))));
}

function getDashboPublicBaseUrl() {
  const publicBase = normalizePublicBaseUrl(process.env.EDGE_PUBLIC_BASE_URL || process.env.EDGE_STREAM_BASE_URL);
  if (!publicBase) throw new Error('edge_public_base_url_required');
  const u = new URL(publicBase);
  if (isLocalhostHostname(u.hostname)) throw new Error('edge_public_base_url_unreachable');
  return u.origin;
}

function getDashboStreamToken() {
  const token = String(process.env.EDGE_TOKEN || '').trim();
  if (!token) throw new Error('edge_token_not_configured');
  return token;
}

function buildDashboHeosStreamUrl(pid, trackId, streamId) {
  const publicBase = getDashboPublicBaseUrl();
  const token = getDashboStreamToken();
  return `${publicBase}/heos-stream/${encodeURIComponent(token)}/${encodeURIComponent(trackId)}/${encodeURIComponent(String(pid))}/${encodeURIComponent(streamId)}/stream.mp3`;
}

function buildDashboStreamName(track, fallbackName) {
  const rawTitle = fallbackName || track?.title || track?.name || 'Track';
  const title = String(rawTitle)
    .replace(/[&?=]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${DASHBO_STREAM_NAME_PREFIX} ${title || 'Track'}`.slice(0, 120);
}

function serializeDashboTarget(pid) {
  const target = getHeosTarget(pid);
  if (!target) return null;
  return {
    trackId: target.trackId,
    streamId: target.streamId,
    updatedAt: target.updatedAt,
    lastRequestedAt: target.lastRequestedAt,
    requestCount: target.requestCount,
    lastRange: target.lastRange,
    lastUserAgent: target.lastUserAgent
  };
}

async function waitForDashboStreamRequest(pid, trackId, streamId, timeoutMs) {
  const until = Date.now() + Math.max(0, Number(timeoutMs || 0));
  while (Date.now() <= until) {
    if (hasRequestedTarget(pid, trackId, streamId)) return true;
    await sleep(250);
  }
  return hasRequestedTarget(pid, trackId, streamId);
}

function readDashboTrack(trackId) {
  const id = String(trackId || '').trim();
  if (!id) throw new Error('trackId_required');
  const library = getMusicLibrary();
  const track = library.getTrack(id);
  if (!track || !library.resolveTrackAbsPath(id)) throw new Error('track_not_found');
  return track;
}

async function startDashboHeosTrack(opts) {
  const pid = Number(opts?.pid);
  if (!Number.isFinite(pid) || pid === 0) throw new Error('pid_required');

  const track = readDashboTrack(opts?.trackId);
  const trackId = String(track.id || opts.trackId).trim();
  const streamId = makeHeosStreamId(trackId);
  const streamUrl = buildDashboHeosStreamUrl(pid, trackId, streamId);
  const streamName = buildDashboStreamName(track, opts?.name);
  const hosts = opts?.hosts;
  const waitMs = Math.max(1000, Math.min(30000, Number(opts?.requestTimeoutMs || DEFAULT_DASHBO_STREAM_WAIT_MS)));

  const existing = getHeosTarget(pid);
  if (!opts?.stopFirst && existing?.trackId === trackId && Number(existing.requestCount || 0) > 0) {
    const resumeResponse = await setPlayState(pid, 'play', { hosts });
    await sleep(500);
    await setPlayState(pid, 'play', { hosts }).catch(() => undefined);
    return {
      ok: true,
      pid,
      trackId,
      streamId: existing.streamId,
      streamUrl: buildDashboHeosStreamUrl(pid, trackId, existing.streamId || streamId),
      streamName,
      started: true,
      resumed: true,
      reused: true,
      retried: false,
      target: serializeDashboTarget(pid),
      response: resumeResponse,
      debug: sanitizeUrlForDebug(buildDashboHeosStreamUrl(pid, trackId, existing.streamId || streamId))
    };
  }

  setHeosTarget(pid, trackId, streamId);

  if (opts?.stopFirst) {
    await setPlayState(pid, 'stop', { hosts }).catch(() => undefined);
    await sleep(250);
  }

  const playResponse = await playStream(pid, streamUrl, streamName, { hosts });
  await setPlayState(pid, 'play', { hosts }).catch(() => undefined);

  const firstWaitMs = Math.min(12000, waitMs);
  let started = await waitForDashboStreamRequest(pid, trackId, streamId, firstWaitMs);
  let retried = false;
  let retryResponse = null;

  if (!started && waitMs > firstWaitMs) {
    retried = true;
    retryResponse = await playStream(pid, streamUrl, streamName, { hosts });
    await setPlayState(pid, 'play', { hosts }).catch(() => undefined);
    started = await waitForDashboStreamRequest(pid, trackId, streamId, waitMs - firstWaitMs);
  }

  return {
    ok: true,
    pid,
    trackId,
    streamId,
    streamUrl,
    streamName,
    started,
    retried,
    target: serializeDashboTarget(pid),
    response: retryResponse || playResponse,
    debug: sanitizeUrlForDebug(streamUrl)
  };
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

heosRouter.post('/play_dashbo_track', (req, res) => {
  (async () => {
    const hosts = parseHeosHostsHeader(req);
    const result = await startDashboHeosTrack({
      pid: req?.body?.pid,
      trackId: req?.body?.trackId,
      name: req?.body?.name,
      stopFirst: Boolean(req?.body?.stopFirst),
      requestTimeoutMs: req?.body?.requestTimeoutMs,
      hosts
    });
    res.json(result);
  })().catch((err) => {
    const error = normalizeHeosError(err);
    const status = error === 'track_not_found' ? 404 : error.endsWith('_required') ? 400 : 502;
    res.status(status).json({ ok: false, error });
  });
});

heosRouter.post('/dashbo_play_state', (req, res) => {
  (async () => {
    const pid = Number(req?.body?.pid);
    const state = String(req?.body?.state || '').trim().toLowerCase();
    if (!Number.isFinite(pid) || pid === 0) return res.status(400).json({ ok: false, error: 'pid_required' });
    if (!['play', 'pause', 'stop'].includes(state)) return res.status(400).json({ ok: false, error: 'state_required' });

    const hosts = parseHeosHostsHeader(req);
    if (state === 'pause') {
      const r = await setPlayState(pid, 'pause', { hosts });
      return res.json({ ok: true, pid, state: 'pause', target: serializeDashboTarget(pid), response: r });
    }

    if (state === 'stop') {
      const r = await setPlayState(pid, 'stop', { hosts });
      clearHeosTarget(pid);
      return res.json({ ok: true, pid, state: 'stop', target: null, response: r });
    }

    const existing = getHeosTarget(pid);
    const trackId = String(req?.body?.trackId || existing?.trackId || '').trim();
    if (!trackId) return res.status(400).json({ ok: false, error: 'trackId_required' });

    const shouldRestart = Boolean(req?.body?.forceRestart) || !existing || !existing.lastRequestedAt || Number(existing.requestCount || 0) < 1;
    if (shouldRestart) {
      const result = await startDashboHeosTrack({
        pid,
        trackId,
        name: req?.body?.name,
        stopFirst: false,
        requestTimeoutMs: req?.body?.requestTimeoutMs,
        hosts
      });
      return res.json({ ...result, state: result.started ? 'play' : 'unknown', resumed: false, restarted: true });
    }

    const r = await setPlayState(pid, 'play', { hosts });
    await sleep(500);
    await setPlayState(pid, 'play', { hosts }).catch(() => undefined);

    let observedState = 'unknown';
    try {
      observedState = extractPlaybackStateResponse(await getPlayState(pid, { hosts }));
    } catch {
      observedState = 'unknown';
    }

    res.json({ ok: true, pid, state: 'play', resumed: true, restarted: false, observedState, target: serializeDashboTarget(pid), response: r });
  })().catch((err) => {
    const error = normalizeHeosError(err);
    const status = error === 'track_not_found' ? 404 : error.endsWith('_required') ? 400 : 502;
    res.status(status).json({ ok: false, error });
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

heosRouter.post('/next', (req, res) => {
  (async () => {
    const pid = Number(req?.body?.pid);
    if (!Number.isFinite(pid) || pid === 0) return res.status(400).json({ ok: false, error: 'pid_required' });
    const hosts = parseHeosHostsHeader(req);
    const r = await playNext(pid, { hosts });
    res.json({ ok: true, response: r });
  })().catch((err) => {
    const error = normalizeHeosError(err);
    res.status(502).json({ ok: false, error });
  });
});

heosRouter.post('/prev', (req, res) => {
  (async () => {
    const pid = Number(req?.body?.pid);
    if (!Number.isFinite(pid) || pid === 0) return res.status(400).json({ ok: false, error: 'pid_required' });
    const hosts = parseHeosHostsHeader(req);
    const r = await playPrevious(pid, { hosts });
    res.json({ ok: true, response: r });
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
    const level = extractHeosParsedNumber(r, 'level');
    res.json({ ok: true, level, response: r });
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
    const appliedLevel = extractHeosParsedNumber(r, 'level');
    res.json({ ok: true, level: appliedLevel, response: r });
  })().catch((err) => {
    const error = normalizeHeosError(err);
    res.status(502).json({ ok: false, error });
  });
});

heosRouter.get('/now_playing', (req, res) => {
  (async () => {
    const pid = Number(req?.query?.pid);
    if (!Number.isFinite(pid) || pid === 0) return res.status(400).json({ ok: false, error: 'pid_required' });
    const hosts = parseHeosHostsHeader(req);
    const r = await getNowPlayingMedia(pid, { hosts });
    res.json({ ok: true, response: r });
  })().catch((err) => {
    const error = normalizeHeosError(err);
    res.status(502).json({ ok: false, error });
  });
});

heosRouter.get('/playback_summary', (req, res) => {
  (async () => {
    const pid = Number(req?.query?.pid);
    if (!Number.isFinite(pid) || pid === 0) return res.status(400).json({ ok: false, error: 'pid_required' });
    const hosts = parseHeosHostsHeader(req);
    const summary = await getPlaybackSummary(pid, { hosts });
    res.json({ ok: true, summary });
  })().catch((err) => {
    const error = normalizeHeosError(err);
    res.status(502).json({ ok: false, error });
  });
});

heosRouter.get('/playback_summaries', (req, res) => {
  (async () => {
    const hosts = parseHeosHostsHeader(req);
    const players = await listPlayers({ hosts });

    const settled = await Promise.allSettled(
      players.map(async (player) => {
        const summary = await getPlaybackSummary(player.pid, { hosts });
        return {
          pid: player.pid,
          name: player.name,
          model: player.model || null,
          state: normalizePlaybackState(summary?.state),
          isPlaying: Boolean(summary?.isPlaying),
          isActive: Boolean(summary?.isActive),
          title: typeof summary?.title === 'string' ? summary.title : null,
          artist: typeof summary?.artist === 'string' ? summary.artist : null,
          album: typeof summary?.album === 'string' ? summary.album : null,
          imageUrl: typeof summary?.imageUrl === 'string' ? summary.imageUrl : null,
          source: typeof summary?.source === 'string' ? summary.source : null,
          url: typeof summary?.url === 'string' ? summary.url : null,
          error: null
        };
      })
    );

    const summaries = settled.map((result, index) => {
      if (result.status === 'fulfilled') return result.value;
      const player = players[index];
      return {
        pid: player.pid,
        name: player.name,
        model: player.model || null,
        state: 'unknown',
        isPlaying: false,
        isActive: false,
        title: null,
        artist: null,
        album: null,
        imageUrl: null,
        source: null,
        url: null,
        error: normalizeHeosError(result.reason)
      };
    });

    res.json({ ok: true, players, summaries, ...getStatus() });
  })().catch((err) => {
    const error = normalizeHeosError(err);
    if (String(error).toLowerCase().includes('no devices found')) {
      return res.json({ ok: true, players: [], summaries: [], ...getStatus() });
    }
    res.status(502).json({ ok: false, error, ...getStatus() });
  });
});

heosRouter.get('/groups', (req, res) => {
  (async () => {
    const hosts = parseHeosHostsHeader(req);
    const r = await getGroups({ hosts });
    res.json({ ok: true, response: r });
  })().catch((err) => {
    const error = normalizeHeosError(err);
    res.status(502).json({ ok: false, error });
  });
});

heosRouter.post('/group', (req, res) => {
  (async () => {
    const leaderPid = Number(req?.body?.leaderPid);
    const memberPids = Array.isArray(req?.body?.memberPids) ? req.body.memberPids : [];
    if (!Number.isFinite(leaderPid) || leaderPid === 0) return res.status(400).json({ ok: false, error: 'leaderPid_required' });
    const hosts = parseHeosHostsHeader(req);
    const r = await setGroup(leaderPid, memberPids, { hosts });
    res.json({ ok: true, response: r });
  })().catch((err) => {
    const error = normalizeHeosError(err);
    res.status(502).json({ ok: false, error });
  });
});

heosRouter.post('/ungroup', (req, res) => {
  (async () => {
    const pid = Number(req?.body?.pid);
    if (!Number.isFinite(pid) || pid === 0) return res.status(400).json({ ok: false, error: 'pid_required' });
    const hosts = parseHeosHostsHeader(req);
    const r = await unGroup(pid, { hosts });
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
