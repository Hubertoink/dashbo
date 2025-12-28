const express = require('express');

const { listPlayers, playStream, setPlayState } = require('../services/heosService');

const heosRouter = express.Router();

heosRouter.get('/players', (req, res) => {
  (async () => {
    const players = await listPlayers();
    res.json({ ok: true, players });
  })().catch((err) => {
    res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'heos_error' });
  });
});

heosRouter.post('/play_stream', (req, res) => {
  (async () => {
    const pid = Number(req?.body?.pid);
    const url = String(req?.body?.url || '').trim();
    const name = req?.body?.name ? String(req.body.name) : undefined;

    if (!Number.isFinite(pid) || pid <= 0) return res.status(400).json({ ok: false, error: 'pid_required' });
    if (!url) return res.status(400).json({ ok: false, error: 'url_required' });

    const r = await playStream(pid, url, name);
    res.json({ ok: true, response: r });
  })().catch((err) => {
    res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'heos_error' });
  });
});

heosRouter.post('/play_state', (req, res) => {
  (async () => {
    const pid = Number(req?.body?.pid);
    const state = String(req?.body?.state || '').trim().toLowerCase();
    if (!Number.isFinite(pid) || pid <= 0) return res.status(400).json({ ok: false, error: 'pid_required' });
    if (!state) return res.status(400).json({ ok: false, error: 'state_required' });

    const r = await setPlayState(pid, state);
    res.json({ ok: true, response: r });
  })().catch((err) => {
    res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'heos_error' });
  });
});

module.exports = { heosRouter };
