const express = require('express');
const { z } = require('zod');

const { requireAuth } = require('../middleware/auth');
const {
  completeGoogleCallback,
  createGoogleAuthUrl,
  disconnectGoogleConnection,
  getGoogleConfig,
  getGoogleStatus,
  listGoogleConnections,
} = require('../services/googleService');

const googleRouter = express.Router();

googleRouter.get('/status', requireAuth, async (req, res) => {
  const userId = Number(req.auth?.sub);
  const status = await getGoogleStatus({ userId });
  res.json(status);
});

googleRouter.post('/auth-url', requireAuth, async (req, res) => {
  try {
    getGoogleConfig();
  } catch (e) {
    return res.status(400).json({ error: 'google_not_configured', message: String(e?.message || e) });
  }

  const userId = Number(req.auth?.sub);
  const url = await createGoogleAuthUrl({ userId });
  res.json({ url });
});

googleRouter.get('/connections', requireAuth, async (req, res) => {
  const userId = Number(req.auth?.sub);
  const connections = await listGoogleConnections({ userId });
  res.json(connections);
});

googleRouter.post('/connections/:id/disconnect', requireAuth, async (req, res) => {
  const userId = Number(req.auth?.sub);
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' });
  const result = await disconnectGoogleConnection({ userId, connectionId: id });
  if (!result.ok) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

googleRouter.get('/callback', async (req, res) => {
  const schema = z.object({ code: z.string().min(1), state: z.string().min(8) });
  const parsed = schema.safeParse(req.query);

  const successRedirect = process.env.GOOGLE_SUCCESS_REDIRECT || '/settings';
  const errorRedirect = process.env.GOOGLE_ERROR_REDIRECT || '/settings?google=error';

  if (!parsed.success) return res.redirect(errorRedirect);

  try {
    await completeGoogleCallback({ code: parsed.data.code, state: parsed.data.state });
    return res.redirect(successRedirect);
  } catch (err) {
    console.warn('[dashbo-backend] google callback failed', err);
    return res.redirect(errorRedirect);
  }
});

module.exports = { googleRouter };
