const express = require('express');
const { z } = require('zod');

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

module.exports = { authRouter };
