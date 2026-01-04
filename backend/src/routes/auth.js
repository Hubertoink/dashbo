const express = require('express');
const { z } = require('zod');

const { requireAuth, attachUserContext } = require('../middleware/auth');
const { login } = require('../services/authService');

const authRouter = express.Router();

const loginSchema = z.object({
  email: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const result = await login(parsed.data);
  if (!result) return res.status(401).json({ error: 'invalid_credentials' });

  return res.json(result);
});

// GET /auth/me - Return the authenticated user's identity/context
authRouter.get('/me', requireAuth, attachUserContext, async (req, res) => {
  if (!req.ctx?.userId) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  return res.json({
    id: req.ctx.userId,
    email: req.ctx.email,
    name: req.ctx.name,
    isAdmin: Boolean(req.ctx.isAdmin),
    role: req.ctx.role,
    calendarId: req.ctx.calendarId,
  });
});

module.exports = { authRouter };
