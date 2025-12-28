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

async function listTags({ userId }) {
  const pool = getPool();
  const result = await pool.query(
    `
    SELECT *
    FROM tags
    WHERE user_id = $1
    ORDER BY sort_order ASC, name ASC;
    `,
    [userId]
  );
  return result.rows.map(toTag);
}

async function createTag({ userId, name, color, sortOrder }) {
  const pool = getPool();
  const result = await pool.query(
    `
    INSERT INTO tags (user_id, name, color, sort_order)
    VALUES ($1, $2, $3, $4)
    RETURNING *;
    `,
    [userId, name, color, Number.isFinite(sortOrder) ? Number(sortOrder) : 0]
  );
  return toTag(result.rows[0]);
}

async function updateTag({ userId, id, patch }) {
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
    const existing = await pool.query('SELECT * FROM tags WHERE id = $1 AND user_id = $2;', [id, userId]);
    if (existing.rowCount === 0) return null;
    return toTag(existing.rows[0]);
  }

  add('updated_at', new Date().toISOString());

  const result = await pool.query(
    `
    UPDATE tags
    SET ${fields.join(', ')}
    WHERE id = $${values.length + 1} AND user_id = $${values.length + 2}
    RETURNING *;
    `,
    [...values, id, userId]
  );

  if (result.rowCount === 0) return null;
  return toTag(result.rows[0]);
}

async function deleteTag({ userId, id }) {
  const pool = getPool();
  const result = await pool.query('DELETE FROM tags WHERE id = $1 AND user_id = $2;', [id, userId]);
  return result.rowCount > 0;
}

module.exports = { listTags, createTag, updateTag, deleteTag };
