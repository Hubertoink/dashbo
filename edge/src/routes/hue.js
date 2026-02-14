const express = require('express');

const { getHueStatus, listHueLights, setHueLightState, pairHueBridge } = require('../services/hueService');

const hueRouter = express.Router();

hueRouter.get('/status', (req, res) => {
  (async () => {
    const status = await getHueStatus();
    res.json(status);
  })().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err || 'hue_status_failed');
    res.status(502).json({ configured: false, available: false, bridgeUrl: null, error: msg });
  });
});

hueRouter.get('/lights', (req, res) => {
  (async () => {
    const status = await getHueStatus();
    if (!status.configured) {
      return res.status(400).json({ error: 'hue_not_configured', message: status.error || 'Hue ist nicht konfiguriert.' });
    }
    if (!status.available) {
      return res.status(502).json({ error: 'hue_unavailable', message: status.error || 'Hue Bridge nicht erreichbar.' });
    }

    const lights = await listHueLights();
    res.json({ lights });
  })().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err || 'hue_lights_failed');
    res.status(502).json({ error: 'hue_error', message: msg });
  });
});

hueRouter.post('/pair', (req, res) => {
  (async () => {
    const bridgeUrl = req?.body?.bridgeUrl ? String(req.body.bridgeUrl).trim() : undefined;
    try {
      const result = await pairHueBridge({ bridgeUrl });
      const status = await getHueStatus();
      return res.json({ ok: true, bridgeUrl: result.bridgeUrl, status });
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes('hue_link_button_required')) {
        return res.status(409).json({ error: 'hue_link_button_required', message: 'Bitte zuerst den Bridge-Button drücken.' });
      }
      if (msg.includes('hue_bridge_not_found')) {
        return res.status(404).json({ error: 'hue_bridge_not_found', message: 'Keine Hue Bridge im Netzwerk gefunden.' });
      }
      return res.status(502).json({ error: 'hue_pair_failed', message: msg });
    }
  })().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err || 'hue_pair_failed');
    res.status(502).json({ error: 'hue_pair_failed', message: msg });
  });
});

hueRouter.post('/lights/:id/state', (req, res) => {
  (async () => {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'invalid_id' });

    const body = req?.body || {};
    await setHueLightState({
      id,
      on: typeof body.on === 'boolean' ? body.on : undefined,
      brightness: body.brightness,
      hexColor: typeof body.hexColor === 'string' ? body.hexColor : undefined
    });
    return res.json({ ok: true });
  })().catch((e) => {
    const msg = String(e?.message || e);
    if (msg.includes('invalid_color')) return res.status(400).json({ error: 'invalid_color' });
    if (msg.includes('invalid_brightness')) return res.status(400).json({ error: 'invalid_brightness' });
    if (msg.includes('empty_state')) return res.status(400).json({ error: 'empty_state' });
    if (msg.includes('hue_not_configured')) return res.status(400).json({ error: 'hue_not_configured' });
    return res.status(502).json({ error: 'hue_error', message: msg });
  });
});

module.exports = { hueRouter };