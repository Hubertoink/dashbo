const express = require('express');
const { z } = require('zod');

const { requireAuth, requireAdmin, attachUserContext } = require('../middleware/auth');
const { listUsers, createUser, deleteUser, resetPassword } = require('../services/usersService');

const usersRouter = express.Router();

const createSchema = z
  .object({
    email: z.string().email(),
    name: z.string().min(1).max(200),
    password: z.string().min(6).max(200),
    // Support multiple field names for backwards compatibility between frontend/backend versions
    // (e.g. older clients may send `admin` or `is_admin`).
    isAdmin: z.boolean().optional(),
    admin: z.boolean().optional(),
    is_admin: z.boolean().optional(),
  })
  .transform((data) => ({
    email: data.email,
    name: data.name,
    password: data.password,
    isAdmin: data.isAdmin ?? data.admin ?? data.is_admin,
  }));

// GET /users/roster - List members of the current calendar (any authenticated user)
usersRouter.get('/roster', requireAuth, attachUserContext, async (req, res) => {
  const calendarId = req.ctx?.calendarId;
  if (!calendarId) return res.status(400).json({ error: 'missing_calendar' });

  const users = await listUsers({ calendarId });
  // Roster is intentionally limited.
  const roster = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isAdmin: u.isAdmin,
  }));
  res.json(roster);
});

// GET /users - Admin-only user management list (scoped to current calendar)
usersRouter.get('/', requireAuth, attachUserContext, requireAdmin, async (req, res) => {
  const calendarId = req.ctx?.calendarId;
  if (!calendarId) return res.status(400).json({ error: 'missing_calendar' });
  const users = await listUsers({ calendarId });
  res.json(users);
});

usersRouter.post('/', requireAuth, attachUserContext, requireAdmin, async (req, res) => {
  const calendarId = req.ctx?.calendarId;
  if (!calendarId) return res.status(400).json({ error: 'missing_calendar' });

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  try {
    const created = await createUser({ ...parsed.data, calendarId });
    return res.status(201).json(created);
  } catch (err) {
    // likely duplicate email
    return res.status(409).json({ error: 'user_create_failed' });
  }
});

usersRouter.delete('/:id', requireAuth, attachUserContext, requireAdmin, async (req, res) => {
  const calendarId = req.ctx?.calendarId;
  const actorUserId = req.ctx?.userId;
  if (!calendarId) return res.status(400).json({ error: 'missing_calendar' });

  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' });

  const result = await deleteUser({ id, calendarId, actorUserId });
  if (!result.ok && result.reason === 'not_found') return res.status(404).json({ error: 'not_found' });
  if (!result.ok && result.reason === 'last_admin') return res.status(409).json({ error: 'last_admin' });
  if (!result.ok && result.reason === 'self_delete') return res.status(409).json({ error: 'self_delete' });
  if (!result.ok) return res.status(400).json({ error: 'delete_failed' });
  return res.status(204).end();
});

usersRouter.post('/:id/reset-password', requireAuth, attachUserContext, requireAdmin, async (req, res) => {
  const calendarId = req.ctx?.calendarId;
  if (!calendarId) return res.status(400).json({ error: 'missing_calendar' });

  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' });

  const schema = z.object({ password: z.string().min(6).max(200) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const ok = await resetPassword({ id, newPassword: parsed.data.password, calendarId });
  if (!ok) return res.status(404).json({ error: 'not_found' });
  return res.json({ ok: true });
});

module.exports = { usersRouter };
