const { getPool } = require('../db');

async function getSetting(key) {
  const pool = getPool();
  const result = await pool.query('SELECT value FROM settings WHERE key = $1;', [key]);
  if (result.rowCount === 0) return null;
  return result.rows[0].value;
}

async function setSetting(key, value) {
  const pool = getPool();
  await pool.query(
    `
    INSERT INTO settings (key, value, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
    `,
    [key, value]
  );
}

module.exports = { getSetting, setSetting };
