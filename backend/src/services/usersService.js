const bcrypt = require('bcryptjs');
const { getPool } = require('../db');

function toUserDto(row) {
  return {
    id: Number(row.id),
    email: row.email,
    name: row.name,
    isAdmin: Boolean(row.is_admin),
    role: row.role ?? (Boolean(row.is_admin) ? 'admin' : 'member'),
    calendarId: row.calendar_id != null ? Number(row.calendar_id) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listUsers({ calendarId } = {}) {
  const pool = getPool();
  const result = await pool.query(
    `
    SELECT id, email, name, is_admin, role, calendar_id, created_at, updated_at
    FROM users
    WHERE ($1::bigint IS NULL OR calendar_id = $1)
    ORDER BY created_at DESC;
    `,
    [calendarId ?? null]
  );
  return result.rows.map(toUserDto);
}

async function createUser({ email, name, password, isAdmin, calendarId }) {
  const pool = getPool();
  const passwordHash = await bcrypt.hash(String(password), 10);

  // Backwards compatibility: if no calendarId is provided, create one per user.
  let effectiveCalendarId = calendarId ?? null;
  if (!effectiveCalendarId) {
    const cal = await pool.query('INSERT INTO calendars (name) VALUES ($1) RETURNING id;', [String(name)]);
    effectiveCalendarId = Number(cal.rows[0].id);
  }

  const effectiveIsAdmin = Boolean(isAdmin);
  const role = effectiveIsAdmin ? 'admin' : 'member';

  const result = await pool.query(
    `
    INSERT INTO users (email, name, password_hash, is_admin, role, calendar_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, email, name, is_admin, role, calendar_id, created_at, updated_at;
    `,
    [String(email).toLowerCase(), String(name), passwordHash, effectiveIsAdmin, role, effectiveCalendarId]
  );

  return toUserDto(result.rows[0]);
}

async function countAdmins({ calendarId } = {}) {
  const pool = getPool();
  const result = await pool.query(
    'SELECT COUNT(*)::int AS c FROM users WHERE is_admin = TRUE AND ($1::bigint IS NULL OR calendar_id = $1);',
    [calendarId ?? null]
  );
  return result.rows?.[0]?.c ?? 0;
}

async function deleteUser({ id, calendarId, actorUserId } = {}) {
  const pool = getPool();

  if (actorUserId != null && Number(id) === Number(actorUserId)) {
    return { ok: false, reason: 'self_delete' };
  }

  const userRes = await pool.query(
    'SELECT id, is_admin, calendar_id FROM users WHERE id = $1;',
    [id]
  );
  if (userRes.rowCount === 0) return { ok: false, reason: 'not_found' };

  const user = userRes.rows[0];

  if (calendarId != null && Number(user.calendar_id) !== Number(calendarId)) {
    return { ok: false, reason: 'not_found' };
  }

  if (user.is_admin) {
    const admins = await countAdmins({ calendarId: calendarId ?? null });
    if (admins <= 1) return { ok: false, reason: 'last_admin' };
  }

  const res = await pool.query('DELETE FROM users WHERE id = $1;', [id]);
  return { ok: res.rowCount > 0 };
}

async function resetPassword({ id, newPassword, calendarId } = {}) {
  const pool = getPool();

  if (calendarId != null) {
    const u = await pool.query('SELECT id FROM users WHERE id = $1 AND calendar_id = $2;', [id, calendarId]);
    if (u.rowCount === 0) return false;
  }

  const passwordHash = await bcrypt.hash(String(newPassword), 10);
  const res = await pool.query(
    'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2;',
    [passwordHash, id]
  );
  return res.rowCount > 0;
}

module.exports = { listUsers, createUser, deleteUser, resetPassword };
