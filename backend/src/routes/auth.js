const express = require('express');
const { z } = require('zod');

const { requireAuth, attachUserContext } = require('../middleware/auth');
const { login, signToken } = require('../services/authService');
const { createAuthToken, consumeAuthToken } = require('../services/authTokenService');
const { sendMail, isEnabled: isMailEnabled } = require('../services/mailService');
const bcrypt = require('bcryptjs');
const { getPool } = require('../db');

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

authRouter.post('/register', async (req, res) => {
  const schema = z.object({
    email: z.string().email().max(200),
    name: z.string().min(1).max(200),
    password: z.string().min(6).max(200),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const pool = getPool();
  const email = String(parsed.data.email).trim().toLowerCase();
  const name = String(parsed.data.name).trim();
  const passwordHash = await bcrypt.hash(String(parsed.data.password), 10);

  try {
    await pool.query('BEGIN');
    const cal = await pool.query('INSERT INTO calendars (name) VALUES ($1) RETURNING id;', [name]);
    const calendarId = Number(cal.rows[0].id);

    const u = await pool.query(
      `
      INSERT INTO users (email, name, password_hash, is_admin, role, calendar_id)
      VALUES ($1, $2, $3, TRUE, 'admin', $4)
      RETURNING *;
      `,
      [email, name, passwordHash, calendarId]
    );

    await pool.query('COMMIT');
    const user = u.rows[0];
    const token = signToken(user);
    return res.status(201).json({
      token,
      user: {
        id: Number(user.id),
        email: user.email,
        name: user.name,
        isAdmin: Boolean(user.is_admin),
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
    });
  } catch (e) {
    try {
      await pool.query('ROLLBACK');
    } catch {
      // ignore
    }
    // Likely duplicate email
    return res.status(409).json({ error: 'email_in_use' });
  }
});

// GET /auth/me - Return the authenticated user's identity/context
authRouter.get('/me', requireAuth, attachUserContext, async (req, res) => {
  if (!req.ctx?.userId) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const pool = getPool();
  const u = await pool.query('SELECT email_verified_at FROM users WHERE id = $1;', [req.ctx.userId]);
  const emailVerified = Boolean(u.rowCount && u.rows[0].email_verified_at);

  return res.json({
    id: req.ctx.userId,
    email: req.ctx.email,
    name: req.ctx.name,
    isAdmin: Boolean(req.ctx.isAdmin),
    role: req.ctx.role,
    calendarId: req.ctx.calendarId,
    emailVerified,
  });
});

authRouter.post('/request-password-reset', async (req, res) => {
  const schema = z.object({ email: z.string().email().max(200) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  // Always respond ok to avoid account enumeration
  const email = String(parsed.data.email).trim().toLowerCase();
  try {
    if (!isMailEnabled()) return res.json({ ok: true });

    const pool = getPool();
    const u = await pool.query('SELECT id, email FROM users WHERE lower(email) = lower($1) LIMIT 1;', [email]);
    if (u.rowCount === 0) return res.json({ ok: true });

    const userId = Number(u.rows[0].id);
    const { token } = await createAuthToken({ userId, kind: 'reset_password', ttlSeconds: 60 * 60 });

    const publicUrl = String(process.env.PUBLIC_APP_URL || '').replace(/\/$/, '');
    if (!publicUrl) return res.json({ ok: true });
    const link = `${publicUrl}/reset-password?token=${encodeURIComponent(token)}`;

    await sendMail({
      to: String(u.rows[0].email),
      subject: 'Passwort zurücksetzen',
      text:
        `Du hast ein neues Passwort für Dashbo angefordert.\n\n` +
        `Link zum Zurücksetzen: ${link}\n\n` +
        `Wenn du das nicht warst, kannst du diese Mail ignorieren.`,
    });
  } catch (e) {
    console.error('[auth] request-password-reset failed', e);
  }

  return res.json({ ok: true });
});

authRouter.post('/reset-password', async (req, res) => {
  const schema = z.object({ token: z.string().min(10).max(500), password: z.string().min(6).max(200) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const consumed = await consumeAuthToken({ kind: 'reset_password', token: parsed.data.token });
  if (!consumed) return res.status(400).json({ error: 'invalid_token' });

  const pool = getPool();
  const passwordHash = await bcrypt.hash(String(parsed.data.password), 10);
  await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2;', [passwordHash, consumed.userId]);
  return res.json({ ok: true });
});

authRouter.post('/request-email-verification', requireAuth, attachUserContext, async (req, res) => {
  if (!isMailEnabled()) return res.json({ ok: true });
  const userId = req.ctx?.userId;
  const email = String(req.ctx?.email || '').trim();
  if (!userId || !email) return res.status(400).json({ error: 'invalid_user' });

  const pool = getPool();
  const u = await pool.query('SELECT email_verified_at FROM users WHERE id = $1;', [userId]);
  if (u.rowCount && u.rows[0].email_verified_at) return res.json({ ok: true });

  const { token } = await createAuthToken({ userId, kind: 'verify_email', ttlSeconds: 7 * 24 * 60 * 60 });
  const publicUrl = String(process.env.PUBLIC_APP_URL || '').replace(/\/$/, '');
  if (!publicUrl) return res.json({ ok: true });
  const link = `${publicUrl}/verify-email?token=${encodeURIComponent(token)}`;

  try {
    await sendMail({
      to: email,
      subject: 'E-Mail bestätigen',
      text:
        `Bitte bestätige deine E-Mail-Adresse für Dashbo.\n\n` +
        `Link: ${link}\n\n` +
        `Wenn du das nicht warst, kannst du diese Mail ignorieren.`,
    });
  } catch (e) {
    console.error('[auth] request-email-verification failed', e);
  }

  return res.json({ ok: true });
});

authRouter.post('/verify-email', async (req, res) => {
  const schema = z.object({ token: z.string().min(10).max(500) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const consumed = await consumeAuthToken({ kind: 'verify_email', token: parsed.data.token });
  if (!consumed) return res.status(400).json({ error: 'invalid_token' });

  const pool = getPool();
  await pool.query('UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW() WHERE id = $1;', [consumed.userId]);
  return res.json({ ok: true });
});

authRouter.post('/accept-invite', async (req, res) => {
  const schema = z.object({
    token: z.string().min(10).max(500),
    password: z.string().min(6).max(200),
    name: z.string().min(1).max(200),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const consumed = await consumeAuthToken({ kind: 'accept_invite', token: parsed.data.token });
  if (!consumed) return res.status(400).json({ error: 'invalid_token' });

  const pool = getPool();
  const passwordHash = await bcrypt.hash(String(parsed.data.password), 10);
  await pool.query(
    'UPDATE users SET password_hash = $1, name = $2, email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW() WHERE id = $3;',
    [passwordHash, String(parsed.data.name), consumed.userId]
  );
  return res.json({ ok: true });
});

module.exports = { authRouter };
