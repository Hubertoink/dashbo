const crypto = require('crypto');
const { getPool } = require('../db');

function base64Url(buf) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

function generateToken() {
  return base64Url(crypto.randomBytes(32));
}

async function createCalendarInvite({ calendarId, createdByUserId, ttlSeconds = 7 * 24 * 60 * 60 } = {}) {
  const pool = getPool();
  const token = generateToken();
  const tokenHash = sha256(token);

  const expiresAt = new Date(Date.now() + Number(ttlSeconds) * 1000);

  await pool.query(
    `
    INSERT INTO calendar_invites (calendar_id, created_by_user_id, token_hash, expires_at)
    VALUES ($1, $2, $3, $4);
    `,
    [calendarId, createdByUserId ?? null, tokenHash, expiresAt]
  );

  return { token, expiresAt };
}

async function consumeCalendarInvite({ token } = {}) {
  const pool = getPool();
  const tokenHash = sha256(token);

  const res = await pool.query(
    `
    UPDATE calendar_invites
    SET used_at = NOW()
    WHERE token_hash = $1
      AND used_at IS NULL
      AND expires_at > NOW()
    RETURNING id, calendar_id;
    `,
    [tokenHash]
  );

  if (res.rowCount === 0) return null;
  return { inviteId: Number(res.rows[0].id), calendarId: Number(res.rows[0].calendar_id) };
}

module.exports = { createCalendarInvite, consumeCalendarInvite };
