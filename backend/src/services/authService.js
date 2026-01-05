const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { getPool } = require('../db');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Dev-friendly fallback; set JWT_SECRET in production.
    return 'dashbo-dev-secret-change-me';
  }
  return secret;
}

function signToken(user) {
  const secret = getJwtSecret();
  const payload = {
    sub: String(user.id),
    email: user.email,
    name: user.name,
    isAdmin: Boolean(user.is_admin),
    role: user.role ?? (Boolean(user.is_admin) ? 'admin' : 'member'),
    calendarId: user.calendar_id != null ? Number(user.calendar_id) : null,
  };

  return jwt.sign(payload, secret, { expiresIn: '30d' });
}

function verifyToken(token) {
  const secret = getJwtSecret();
  return jwt.verify(token, secret);
}

async function login({ email, password }) {
  const pool = getPool();

  const identifier = String(email).trim();
  if (!identifier) return null;

  const result = await pool.query(
    'SELECT * FROM users WHERE lower(email) = lower($1) OR lower(name) = lower($1) LIMIT 1;',
    [identifier]
  );
  if (result.rowCount === 0) return null;

  const user = result.rows[0];
  if (!user.password_hash) return null;
  const ok = await bcrypt.compare(String(password), user.password_hash);
  if (!ok) return null;

  const token = signToken(user);

  return {
    token,
    user: {
      id: Number(user.id),
      email: user.email,
      name: user.name,
      isAdmin: Boolean(user.is_admin),
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    },
  };
}

module.exports = { login, verifyToken, signToken };
