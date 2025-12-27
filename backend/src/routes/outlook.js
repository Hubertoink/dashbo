const express = require('express');
const { z } = require('zod');

const { requireAuth } = require('../middleware/auth');
const {
  createOutlookAuthUrl,
  completeOutlookCallback,
  getOutlookStatus,
  disconnectOutlook,
  getOutlookConfig,
} = require('../services/outlookService');

const outlookRouter = express.Router();

outlookRouter.get('/status', requireAuth, async (req, res) => {
  const userId = Number(req.auth?.sub);
  const status = await getOutlookStatus({ userId });
  res.json(status);
});

outlookRouter.post('/auth-url', requireAuth, async (req, res) => {
  // Ensure config present; otherwise return a friendly error
  try {
    getOutlookConfig();
  } catch (e) {
    return res.status(400).json({ error: 'outlook_not_configured', message: String(e?.message || e) });
  }

  const userId = Number(req.auth?.sub);
  const url = await createOutlookAuthUrl({ userId });
  res.json({ url });
});

outlookRouter.post('/disconnect', requireAuth, async (req, res) => {
  const userId = Number(req.auth?.sub);
  await disconnectOutlook({ userId });
  res.json({ ok: true });
});

outlookRouter.get('/callback', async (req, res) => {
  const schema = z.object({ code: z.string().min(1), state: z.string().min(8) });
  const parsed = schema.safeParse(req.query);

  const successRedirect = process.env.OUTLOOK_SUCCESS_REDIRECT || '/settings';
  const errorRedirect = process.env.OUTLOOK_ERROR_REDIRECT || '/settings?outlook=error';

  if (!parsed.success) {
    return res.redirect(errorRedirect);
  }

  try {
    await completeOutlookCallback({ code: parsed.data.code, state: parsed.data.state });
    return res.redirect(successRedirect);
  } catch (err) {
    console.warn('[dashbo-backend] outlook callback failed', err);
    return res.redirect(errorRedirect);
  }
});

module.exports = { outlookRouter };
