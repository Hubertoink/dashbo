const express = require('express');
const { z } = require('zod');

const { requireAuth, attachUserContext, requireAdmin } = require('../middleware/auth');
const { getHueStatus, listHueLights, setHueLightState, pairHueBridge } = require('../services/hueService');

const hueRouter = express.Router();

hueRouter.get('/status', requireAuth, async (_req, res) => {
  const status = await getHueStatus();
  res.json(status);
});

hueRouter.get('/lights', requireAuth, async (_req, res) => {
  const status = await getHueStatus();
  if (!status.configured) {
    return res.status(400).json({ error: 'hue_not_configured', message: status.error || 'Hue ist nicht konfiguriert.' });
  }
  if (!status.available) {
    return res.status(502).json({ error: 'hue_unavailable', message: status.error || 'Hue Bridge nicht erreichbar.' });
  }

  const lights = await listHueLights();
  res.json({ lights });
});

hueRouter.post('/pair', requireAuth, attachUserContext, requireAdmin, async (req, res) => {
  const schema = z.object({
    bridgeUrl: z.string().trim().min(1).max(255).optional(),
  });
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  try {
    const result = await pairHueBridge({ bridgeUrl: parsed.data.bridgeUrl });
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
});

hueRouter.post('/lights/:id/state', requireAuth, async (req, res) => {
  const schema = z
    .object({
      on: z.boolean().optional(),
      brightness: z.number().min(1).max(100).optional(),
      hexColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    })
    .refine((v) => typeof v.on === 'boolean' || typeof v.brightness === 'number' || typeof v.hexColor === 'string', {
      message: 'at_least_one_field_required',
    });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'invalid_id' });

  try {
    await setHueLightState({ id, ...parsed.data });
    return res.json({ ok: true });
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes('invalid_color')) return res.status(400).json({ error: 'invalid_color' });
    if (msg.includes('invalid_brightness')) return res.status(400).json({ error: 'invalid_brightness' });
    if (msg.includes('empty_state')) return res.status(400).json({ error: 'empty_state' });
    if (msg.includes('hue_not_configured')) return res.status(400).json({ error: 'hue_not_configured' });
    return res.status(502).json({ error: 'hue_error', message: msg });
  }
});

module.exports = { hueRouter };
