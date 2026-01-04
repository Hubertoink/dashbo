const { getPool } = require('../db');

const MAX_SCRIBBLES_PER_USER = 10;

/**
 * List all active scribbles for a user (newest first).
 * Automatically cleans up expired scribbles.
 */
async function listScribbles({ calendarId, limit = 10 }) {
  const pool = getPool();

  // Clean up expired scribbles first
  await pool.query(
    `DELETE FROM scribbles WHERE calendar_id = $1 AND expires_at IS NOT NULL AND expires_at < NOW()`,
    [calendarId]
  );

  const result = await pool.query(
    `SELECT id, user_id, image_data, author_name, created_at, expires_at, pinned
     FROM scribbles
     WHERE calendar_id = $1
     ORDER BY pinned DESC, created_at DESC
     LIMIT $2`,
    [calendarId, limit]
  );

  return result.rows.map(mapRow);
}

/**
 * Get a single scribble by ID.
 */
async function getScribble({ calendarId, scribbleId }) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, user_id, image_data, author_name, created_at, expires_at, pinned
     FROM scribbles
     WHERE id = $1 AND calendar_id = $2`,
    [scribbleId, calendarId]
  );

  if (result.rows.length === 0) return null;
  return mapRow(result.rows[0]);
}

/**
 * Create a new scribble. Enforces max limit per user.
 */
async function createScribble({ calendarId, userId, imageData, authorName, expiresAt }) {
  const pool = getPool();

  // Check current count and delete oldest if over limit
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS c FROM scribbles WHERE calendar_id = $1`,
    [calendarId]
  );
  const count = countResult.rows[0]?.c ?? 0;

  if (count >= MAX_SCRIBBLES_PER_USER) {
    // Delete oldest non-pinned scribble(s) to make room
    await pool.query(
      `DELETE FROM scribbles
       WHERE id IN (
         SELECT id FROM scribbles
         WHERE calendar_id = $1 AND pinned = FALSE
         ORDER BY created_at ASC
         LIMIT $2
       )`,
      [calendarId, count - MAX_SCRIBBLES_PER_USER + 1]
    );
  }

  const result = await pool.query(
    `INSERT INTO scribbles (calendar_id, user_id, image_data, author_name, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, image_data, author_name, created_at, expires_at, pinned`,
    [calendarId, userId, imageData, authorName || null, expiresAt || null]
  );

  return mapRow(result.rows[0]);
}

/**
 * Delete a scribble.
 */
async function deleteScribble({ calendarId, scribbleId }) {
  const pool = getPool();
  const result = await pool.query(
    `DELETE FROM scribbles WHERE id = $1 AND calendar_id = $2 RETURNING id`,
    [scribbleId, calendarId]
  );
  return result.rowCount > 0;
}

/**
 * Pin or unpin a scribble.
 */
async function pinScribble({ calendarId, scribbleId, pinned }) {
  const pool = getPool();
  const result = await pool.query(
    `UPDATE scribbles SET pinned = $3 WHERE id = $1 AND calendar_id = $2 RETURNING id`,
    [scribbleId, calendarId, pinned]
  );
  return result.rowCount > 0;
}

/**
 * Cleanup expired scribbles (can be called periodically).
 */
async function cleanupExpiredScribbles() {
  const pool = getPool();
  const result = await pool.query(
    `DELETE FROM scribbles WHERE expires_at IS NOT NULL AND expires_at < NOW()`
  );
  return result.rowCount;
}

function mapRow(row) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    imageData: row.image_data,
    authorName: row.author_name,
    createdAt: row.created_at?.toISOString() ?? null,
    expiresAt: row.expires_at?.toISOString() ?? null,
    pinned: Boolean(row.pinned),
  };
}

module.exports = {
  listScribbles,
  getScribble,
  createScribble,
  deleteScribble,
  pinScribble,
  cleanupExpiredScribbles,
  MAX_SCRIBBLES_PER_USER,
};
