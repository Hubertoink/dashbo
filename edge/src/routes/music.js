const express = require('express');

const { getMusicLibrary } = require('../services/musicLibrary');

const musicRouter = express.Router();

musicRouter.get('/status', (req, res) => {
  res.json(getMusicLibrary().getStatus());
});

musicRouter.post('/scan', (req, res) => {
  getMusicLibrary()
    .startScan()
    .then((result) => res.json(result))
    .catch((err) => res.status(500).json({ error: 'scan_failed', message: err instanceof Error ? err.message : String(err) }));
});

musicRouter.get('/tracks', (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  res.json(getMusicLibrary().listTracks({ limit, offset, q }));
});

module.exports = { musicRouter };
