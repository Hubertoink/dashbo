const { getPool } = require('../db');

function toTag(row) {
  return {
    id: Number(row.id),
    name: row.name,
    color: row.color,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listTags({ calendarId }) {
  const pool = getPool();
  const result = await pool.query(
    `
    SELECT *
    FROM tags
    WHERE calendar_id = $1
    ORDER BY sort_order ASC, name ASC;
    `,
    [calendarId]
  );
  return result.rows.map(toTag);
}

async function createTag({ calendarId, userId, name, color, sortOrder }) {
  const pool = getPool();
  const result = await pool.query(
    `
    INSERT INTO tags (calendar_id, user_id, name, color, sort_order)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
    `,
    [calendarId, userId ?? null, name, color, Number.isFinite(sortOrder) ? Number(sortOrder) : 0]
  );
  return toTag(result.rows[0]);
}

async function updateTag({ calendarId, id, patch }) {
  const pool = getPool();

  const fields = [];
  const values = [];

  function add(field, value) {
    values.push(value);
    fields.push(`${field} = $${values.length}`);
  }

  if (patch.name !== undefined) add('name', patch.name);
  if (patch.color !== undefined) add('color', patch.color);
  if (patch.sortOrder !== undefined) add('sort_order', Number(patch.sortOrder) || 0);

  if (fields.length === 0) {
    const existing = await pool.query('SELECT * FROM tags WHERE id = $1 AND calendar_id = $2;', [id, calendarId]);
    if (existing.rowCount === 0) return null;
    return toTag(existing.rows[0]);
  }

  add('updated_at', new Date().toISOString());

  const result = await pool.query(
    `
    UPDATE tags
    SET ${fields.join(', ')}
    WHERE id = $${values.length + 1} AND calendar_id = $${values.length + 2}
    RETURNING *;
    `,
    [...values, id, calendarId]
  );

  if (result.rowCount === 0) return null;
  return toTag(result.rows[0]);
}

async function deleteTag({ calendarId, id }) {
  const pool = getPool();
  const result = await pool.query('DELETE FROM tags WHERE id = $1 AND calendar_id = $2;', [id, calendarId]);
  return result.rowCount > 0;
}

module.exports = { listTags, createTag, updateTag, deleteTag };
