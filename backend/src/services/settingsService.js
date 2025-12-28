const { getPool } = require('../db');

async function getSetting(key) {
  const pool = getPool();
  const result = await pool.query('SELECT value FROM settings WHERE key = $1;', [key]);
  if (result.rowCount === 0) return null;
  return result.rows[0].value;
}

async function getUserSetting({ userId, key, fallbackToGlobal = true }) {
  const pool = getPool();
  const result = await pool.query('SELECT value FROM user_settings WHERE user_id = $1 AND key = $2;', [userId, key]);
  if (result.rowCount > 0) return result.rows[0].value;
  if (!fallbackToGlobal) return null;
  return getSetting(key);
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

async function setUserSetting({ userId, key, value }) {
  const pool = getPool();
  await pool.query(
    `
    INSERT INTO user_settings (user_id, key, value, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
    `,
    [userId, key, value]
  );
}

module.exports = { getSetting, setSetting, getUserSetting, setUserSetting };
