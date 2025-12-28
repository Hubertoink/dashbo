const express = require('express');

const { listPlayers, scanPlayers, getStatus, playStream, setPlayState } = require('../services/heosService');

const heosRouter = express.Router();

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

heosRouter.get('/players', (req, res) => {
  (async () => {
    const players = await listPlayers();
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
    const players = await scanPlayers({ force });
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

    const r = await playStream(pid, url, name);
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

    const r = await setPlayState(pid, state);
    res.json({ ok: true, response: r });
  })().catch((err) => {
    const error = normalizeHeosError(err);
    res.status(502).json({ ok: false, error });
  });
});

module.exports = { heosRouter };
