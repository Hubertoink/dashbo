const express = require('express');
const fs = require('fs');
const path = require('path');
const mm = require('music-metadata');
const nodeID3 = require('node-id3');

const { getMusicLibrary } = require('../services/musicLibrary');

const musicRouter = express.Router();

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
  const albumId = String(req.params.albumId || '');
  const abs = getMusicLibrary().resolveAlbumCoverAbsPath(albumId);
  if (!abs) return res.status(404).json({ error: 'no_cover' });

  const ext = path.extname(abs).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'private, max-age=300');
  fs.createReadStream(abs)
    .on('error', () => res.status(404).end())
    .pipe(res);
});

musicRouter.get('/tracks/:trackId/stream', async (req, res) => {
  const trackId = String(req.params.trackId || '');
  const abs = getMusicLibrary().resolveTrackAbsPath(trackId);
  if (!abs) return res.status(404).json({ error: 'not_found' });

  let stat;
  try {
    stat = await fs.promises.stat(abs);
  } catch {
    return res.status(404).json({ error: 'not_found' });
  }

  const size = stat.size;
  const ext = path.extname(abs).toLowerCase();
  const mime =
    ext === '.mp3'
      ? 'audio/mpeg'
      : ext === '.m4a'
        ? 'audio/mp4'
        : ext === '.aac'
          ? 'audio/aac'
          : ext === '.flac'
            ? 'audio/flac'
            : ext === '.ogg'
              ? 'audio/ogg'
              : ext === '.opus'
                ? 'audio/opus'
                : ext === '.wav'
                  ? 'audio/wav'
                  : 'application/octet-stream';

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', mime);

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
