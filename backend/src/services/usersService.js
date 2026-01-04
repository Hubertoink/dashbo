const bcrypt = require('bcryptjs');
const { getPool } = require('../db');

const { createAuthToken } = require('./authTokenService');
const { sendMail, isEnabled: isMailEnabled } = require('./mailService');

function toUserDto(row) {
  return {
    id: Number(row.id),
    email: row.email,
    name: row.name,
    isAdmin: Boolean(row.is_admin),
    role: row.role ?? (Boolean(row.is_admin) ? 'admin' : 'member'),
    calendarId: row.calendar_id != null ? Number(row.calendar_id) : null,
    invited: row.password_hash == null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listUsers({ calendarId } = {}) {
  const pool = getPool();
  const result = await pool.query(
    `
    SELECT id, email, name, is_admin, role, calendar_id, password_hash, created_at, updated_at
    FROM users
    WHERE ($1::bigint IS NULL OR calendar_id = $1)
    ORDER BY created_at DESC;
    `,
    [calendarId ?? null]
  );
  return result.rows.map(toUserDto);
}

async function inviteUser({ email, name, isAdmin, calendarId } = {}) {
  const pool = getPool();
  const publicUrl = String(process.env.PUBLIC_APP_URL || '').replace(/\/$/, '');
  if (!publicUrl) {
    return { ok: false, reason: 'missing_public_app_url' };
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const displayName = String(name).trim();
  const effectiveIsAdmin = Boolean(isAdmin);
  const role = effectiveIsAdmin ? 'admin' : 'member';

  const existing = await pool.query(
    'SELECT id, calendar_id, password_hash FROM users WHERE lower(email) = lower($1) LIMIT 1;',
    [normalizedEmail]
  );

  let userRow;
  if (existing.rowCount > 0) {
    const ex = existing.rows[0];
    if (calendarId != null && Number(ex.calendar_id) !== Number(calendarId)) {
      return { ok: false, reason: 'email_in_use' };
    }
    if (ex.password_hash) {
      return { ok: false, reason: 'already_active' };
    }

    const updated = await pool.query(
      `
      UPDATE users
      SET name = $1, is_admin = $2, role = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING id, email, name, is_admin, role, calendar_id, password_hash, created_at, updated_at;
      `,
      [displayName, effectiveIsAdmin, role, Number(ex.id)]
    );
    userRow = updated.rows[0];
  } else {
    const inserted = await pool.query(
      `
      INSERT INTO users (email, name, password_hash, is_admin, role, calendar_id)
      VALUES ($1, $2, NULL, $3, $4, $5)
      RETURNING id, email, name, is_admin, role, calendar_id, password_hash, created_at, updated_at;
      `,
      [normalizedEmail, displayName, effectiveIsAdmin, role, calendarId]
    );
    userRow = inserted.rows[0];
  }

  const userId = Number(userRow.id);
  const { token } = await createAuthToken({ userId, kind: 'accept_invite', ttlSeconds: 7 * 24 * 60 * 60 });
  const link = `${publicUrl}/accept-invite?token=${encodeURIComponent(token)}`;

  let mailSent = false;
  if (isMailEnabled()) {
    try {
      await sendMail({
        to: normalizedEmail,
        subject: 'Einladung zu Dashbo',
        text:
          `Du wurdest zu einem Dashbo Kalender eingeladen.\n\n` +
          `Link zum Annehmen der Einladung: ${link}\n\n` +
          `Wenn du das nicht warst, kannst du diese Mail ignorieren.`,
      });
      mailSent = true;
    } catch (e) {
      console.error('[users] invite mail failed', e);
    }
  }

  return { ok: true, user: toUserDto(userRow), mailSent, link };
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

module.exports = { listUsers, createUser, inviteUser, deleteUser, resetPassword };
