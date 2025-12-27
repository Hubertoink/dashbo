const bcrypt = require('bcryptjs');
const { getPool } = require('../db');

function toUserDto(row) {
  return {
    id: Number(row.id),
    email: row.email,
    name: row.name,
    isAdmin: Boolean(row.is_admin),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listUsers() {
  const pool = getPool();
  const result = await pool.query('SELECT id, email, name, is_admin, created_at, updated_at FROM users ORDER BY created_at DESC;');
  return result.rows.map(toUserDto);
}

async function createUser({ email, name, password, isAdmin }) {
  const pool = getPool();
  const passwordHash = await bcrypt.hash(String(password), 10);

  const result = await pool.query(
    `
    INSERT INTO users (email, name, password_hash, is_admin)
    VALUES ($1, $2, $3, $4)
    RETURNING id, email, name, is_admin, created_at, updated_at;
    `,
    [String(email).toLowerCase(), String(name), passwordHash, Boolean(isAdmin)]
  );

  return toUserDto(result.rows[0]);
}

async function countAdmins() {
  const pool = getPool();
  const result = await pool.query('SELECT COUNT(*)::int AS c FROM users WHERE is_admin = TRUE;');
  return result.rows?.[0]?.c ?? 0;
}

async function deleteUser(id) {
  const pool = getPool();

  const userRes = await pool.query('SELECT id, is_admin FROM users WHERE id = $1;', [id]);
  if (userRes.rowCount === 0) return { ok: false, reason: 'not_found' };

  const user = userRes.rows[0];
  if (user.is_admin) {
    const admins = await countAdmins();
    if (admins <= 1) return { ok: false, reason: 'last_admin' };
  }

  const res = await pool.query('DELETE FROM users WHERE id = $1;', [id]);
  return { ok: res.rowCount > 0 };
}

async function resetPassword(id, newPassword) {
  const pool = getPool();
  const passwordHash = await bcrypt.hash(String(newPassword), 10);
  const res = await pool.query(
    'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2;',
    [passwordHash, id]
  );
  return res.rowCount > 0;
}

module.exports = { listUsers, createUser, deleteUser, resetPassword };
