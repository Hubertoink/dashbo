const express = require('express');
const fs = require('fs');
const path = require('path');
const mm = require('music-metadata');
const nodeID3 = require('node-id3');

const { getMusicLibrary } = require('../services/musicLibrary');

const musicRouter = express.Router();

// In-memory mapping for HEOS stream requests.
// Key: heos pid -> { trackId, streamId, updatedAt, lastRequestedAt, requestCount, lastRange, lastUserAgent }
const heosPidToTrack = new Map();

function readQueryString(req, names) {
  for (const name of names) {
    const value = req?.query?.[name] ?? req?.params?.[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function readHeosPid(req) {
  const raw = req?.params?.heosPid ?? req?.params?.pid ?? req?.query?.heosPid ?? req?.query?.pid;
  const pid = Number(raw);
  return Number.isFinite(pid) && pid !== 0 ? pid : null;
}

function makeHeosTargetEntry(trackId, streamId) {
  return {
    trackId,
    streamId: streamId || null,
    updatedAt: Date.now(),
    lastRequestedAt: null,
    requestCount: 0,
    lastRange: null,
    lastUserAgent: null
  };
}

function markHeosStreamRequest(req, trackId) {
  const pid = readHeosPid(req);
  if (!pid) return { ok: true, tracked: false };

  const streamId = readQueryString(req, ['sid', 'streamId', 'session']);
  const existing = heosPidToTrack.get(pid) || null;

  if (existing?.streamId && streamId && existing.streamId !== streamId) {
    return { ok: false, stale: true, pid, reason: 'stream_id_mismatch' };
  }
  if (existing?.trackId && streamId && existing.trackId !== trackId) {
    return { ok: false, stale: true, pid, reason: 'track_id_mismatch' };
  }

  const entry = existing?.trackId === trackId ? existing : makeHeosTargetEntry(trackId, streamId);
  if (streamId && !entry.streamId) entry.streamId = streamId;
  entry.lastRequestedAt = Date.now();
  entry.requestCount = Number(entry.requestCount || 0) + 1;
  entry.lastRange = req?.headers?.range ? String(req.headers.range) : null;
  entry.lastUserAgent = req?.headers?.['user-agent'] ? String(req.headers['user-agent']).slice(0, 180) : null;
  heosPidToTrack.set(pid, entry);

  return { ok: true, tracked: true, pid, entry };
}

function getAudioMimeByExt(ext) {
  const e = String(ext || '').toLowerCase();
  return e === '.mp3'
    ? 'audio/mpeg'
    : e === '.m4a'
      ? 'audio/mp4'
      : e === '.aac'
        ? 'audio/aac'
        : e === '.flac'
          ? 'audio/flac'
          : e === '.ogg'
            ? 'audio/ogg'
            : e === '.opus'
              ? 'audio/opus'
              : e === '.wav'
                ? 'audio/wav'
                : 'application/octet-stream';
}

async function streamTrackAbsPath(abs, req, res) {
  if (!abs) return res.status(404).json({ error: 'not_found' });

  let stat;
  try {
    stat = await fs.promises.stat(abs);
  } catch {
    return res.status(404).json({ error: 'not_found' });
  }

  const size = stat.size;
  const ext = path.extname(abs).toLowerCase();
  const mime = getAudioMimeByExt(ext);

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'no-store');

  const range = String(req.headers.range || '');
  const m = range.match(/bytes=(\d+)-(\d+)?/);
  if (m) {
    const start = Number(m[1]);
    const end = m[2] ? Number(m[2]) : size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
      res.status(416).setHeader('Content-Range', `bytes */${size}`).end();
      return;
    }
    const cappedEnd = Math.min(end, size - 1);
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${cappedEnd}/${size}`);
    res.setHeader('Content-Length', String(cappedEnd - start + 1));
    fs.createReadStream(abs, { start, end: cappedEnd })
      .on('error', () => res.status(500).end())
      .pipe(res);
    return;
  }

  res.setHeader('Content-Length', String(size));
  fs.createReadStream(abs)
    .on('error', () => res.status(500).end())
    .pipe(res);
}

musicRouter.get('/status', (req, res) => {
  res.json(getMusicLibrary().getStatus());
});

musicRouter.post('/scan', (req, res) => {
  const force = String(req.query.force || '') === '1' || String(req.query.force || '').toLowerCase() === 'true';
  getMusicLibrary()
    .startScan({ force })
    .then((result) => res.json(result))
    .catch((err) => res.status(500).json({ error: 'scan_failed', message: err instanceof Error ? err.message : String(err) }));
});

musicRouter.get('/tracks', (req, res) => {
  const limit = Math.min(2000, Math.max(1, Number(req.query.limit || 100)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  res.json(getMusicLibrary().listTracks({ limit, offset, q }));
});

// Debug endpoint: list tracks that appear to be missing tags (title/album/artist)
musicRouter.get('/debug/missing-tags', (req, res) => {
  const limit = Math.min(5000, Math.max(1, Number(req.query.limit || 1000)));
  const all = getMusicLibrary().listTracks({ limit, offset: 0, q: '' });
  const bad = all.items.filter((t) => !t.title || !t.album || !t.artist);
  res.json({ ok: true, total: bad.length, items: bad.slice(0, limit) });
});

musicRouter.get('/albums', (req, res) => {
  const limit = Math.min(400, Math.max(1, Number(req.query.limit || 200)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const letter = typeof req.query.letter === 'string' ? req.query.letter : '';
  res.json(getMusicLibrary().listAlbums({ limit, offset, q, letter }));
});

musicRouter.get('/albums/:albumId', (req, res) => {
  const albumId = String(req.params.albumId || '');
  const a = getMusicLibrary().getAlbum(albumId);
  if (!a) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, album: a });
});

musicRouter.get('/albums/:albumId/cover', (req, res) => {
  (async () => {
    const albumId = String(req.params.albumId || '');
    const abs = await getMusicLibrary().resolveAlbumCoverAbsPath(albumId);
    if (!abs) return res.status(404).json({ error: 'no_cover' });

    const ext = path.extname(abs).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    fs.createReadStream(abs)
      .on('error', () => res.status(404).end())
      .pipe(res);
  })().catch(() => res.status(404).json({ error: 'no_cover' }));
});

musicRouter.get('/tracks/:trackId/stream', async (req, res) => {
  const trackId = String(req.params.trackId || '');
  const abs = getMusicLibrary().resolveTrackAbsPath(trackId);
  if (abs) {
    const tracked = markHeosStreamRequest(req, trackId);
    if (!tracked.ok && tracked.stale) {
      return res.status(409).json({ error: 'stale_heos_stream', pid: tracked.pid, reason: tracked.reason });
    }
  }
  await streamTrackAbsPath(abs, req, res);
});

musicRouter.get('/heos/target', (req, res) => {
  const pid = Number(req?.query?.pid);
  if (!Number.isFinite(pid) || pid === 0) return res.status(400).json({ ok: false, error: 'pid_required' });

  const entry = heosPidToTrack.get(pid) || null;
  res.json({ ok: true, pid, target: entry });
});

// Stable HEOS streaming: set which track a given HEOS pid should stream.
musicRouter.post('/heos/target', (req, res) => {
  const pid = Number(req?.body?.pid);
  const trackId = String(req?.body?.trackId || '').trim();
  const streamId = String(req?.body?.streamId || req?.body?.sid || '').trim();
  if (!Number.isFinite(pid) || pid === 0) return res.status(400).json({ ok: false, error: 'pid_required' });
  if (!trackId) return res.status(400).json({ ok: false, error: 'trackId_required' });

  const abs = getMusicLibrary().resolveTrackAbsPath(trackId);
  if (!abs) return res.status(404).json({ ok: false, error: 'not_found' });

  const entry = makeHeosTargetEntry(trackId, streamId);
  heosPidToTrack.set(pid, entry);
  res.json({ ok: true, pid, trackId, streamId: entry.streamId });
});

musicRouter.get('/heos/stream/:pid/:streamId/:trackId', async (req, res) => {
  const pid = readHeosPid(req);
  const trackId = String(req.params.trackId || '').trim();
  if (!pid) return res.status(400).json({ error: 'pid_required' });
  if (!trackId) return res.status(400).json({ error: 'trackId_required' });

  const entry = heosPidToTrack.get(pid);
  if (entry?.streamId && entry.streamId !== String(req.params.streamId || '').trim()) {
    return res.status(409).json({ error: 'stale_heos_stream', pid, reason: 'stream_id_mismatch' });
  }
  if (entry?.trackId && entry.trackId !== trackId) {
    return res.status(409).json({ error: 'stale_heos_stream', pid, reason: 'track_id_mismatch' });
  }

  const abs = getMusicLibrary().resolveTrackAbsPath(trackId);
  if (abs) {
    const tracked = markHeosStreamRequest(req, trackId);
    if (!tracked.ok && tracked.stale) {
      return res.status(409).json({ error: 'stale_heos_stream', pid: tracked.pid, reason: tracked.reason });
    }
  }
  await streamTrackAbsPath(abs, req, res);
});

// Backwards-compatible stable HEOS stream URL endpoint.
musicRouter.get('/heos/stream', async (req, res) => {
  const pid = Number(req?.query?.pid);
  if (!Number.isFinite(pid) || pid === 0) return res.status(400).json({ error: 'pid_required' });

  const entry = heosPidToTrack.get(pid);
  if (!entry || !entry.trackId) return res.status(409).json({ error: 'no_target', pid });
  const streamId = readQueryString(req, ['sid', 'streamId', 'session']);
  if (entry.streamId && streamId && entry.streamId !== streamId) {
    return res.status(409).json({ error: 'stale_heos_stream', pid, reason: 'stream_id_mismatch' });
  }

  const tracked = markHeosStreamRequest(req, entry.trackId);
  if (!tracked.ok && tracked.stale) {
    return res.status(409).json({ error: 'stale_heos_stream', pid: tracked.pid, reason: tracked.reason });
  }

  const abs = getMusicLibrary().resolveTrackAbsPath(entry.trackId);
  await streamTrackAbsPath(abs, req, res);
});

// debug endpoint: return parsed metadata via both parsers for a track
musicRouter.get('/tracks/:trackId/meta', async (req, res) => {
  const trackId = String(req.params.trackId || '');
  const abs = getMusicLibrary().resolveTrackAbsPath(trackId);
  if (!abs) return res.status(404).json({ error: 'not_found' });
  try {
    const mmMeta = await mm.parseFile(abs, { duration: true }).catch((e) => ({ error: String(e) }));
    const id3Meta = nodeID3.read(abs) || {};
    res.json({ ok: true, mm: mmMeta, id3: id3Meta });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

module.exports = { musicRouter };
