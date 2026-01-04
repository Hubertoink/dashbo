const crypto = require('crypto');

const { getPool } = require('../db');

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function randomToken() {
  // URL-safe token
  return crypto.randomBytes(32).toString('base64url');
}

async function createAuthToken({ userId, kind, ttlSeconds, meta }) {
  const pool = getPool();

  const token = randomToken();
  const tokenHash = sha256Hex(token);
  const ttl = Number(ttlSeconds);
  const expiresAt = new Date(Date.now() + Math.max(60, ttl) * 1000).toISOString();

  await pool.query(
    `
    INSERT INTO auth_tokens (user_id, kind, token_hash, expires_at, meta)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [Number(userId), String(kind), tokenHash, expiresAt, meta ? JSON.stringify(meta) : null]
  );

  return { token, expiresAt };
}

async function consumeAuthToken({ kind, token }) {
  const pool = getPool();
  const tokenHash = sha256Hex(token);

  const result = await pool.query(
    `
    UPDATE auth_tokens
    SET used_at = NOW()
    WHERE kind = $1
      AND token_hash = $2
      AND used_at IS NULL
      AND expires_at > NOW()
    RETURNING user_id;
    `,
    [String(kind), tokenHash]
  );

  if (result.rowCount === 0) return null;
  return { userId: Number(result.rows[0].user_id) };
}

module.exports = { createAuthToken, consumeAuthToken };
