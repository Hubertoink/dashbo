const { getPool } = require('../db');

function toPerson(row) {
  return {
    id: Number(row.id),
    name: row.name,
    color: row.color,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listPersons({ calendarId }) {
  const pool = getPool();
  const result = await pool.query(
    `
    SELECT *
    FROM persons
    WHERE calendar_id = $1
    ORDER BY sort_order ASC, name ASC;
    `,
    [calendarId]
  );
  return result.rows.map(toPerson);
}

async function createPerson({ calendarId, userId, name, color, sortOrder }) {
  const pool = getPool();
  const result = await pool.query(
    `
    INSERT INTO persons (calendar_id, user_id, name, color, sort_order)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
    `,
    [calendarId, userId ?? null, name, color, Number.isFinite(sortOrder) ? Number(sortOrder) : 0]
  );
  return toPerson(result.rows[0]);
}

async function deletePerson({ calendarId, id }) {
  const pool = getPool();
  const result = await pool.query('DELETE FROM persons WHERE id = $1 AND calendar_id = $2;', [id, calendarId]);
  return result.rowCount > 0;
}

module.exports = { listPersons, createPerson, deletePerson };
