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

async function listPersons({ userId }) {
  const pool = getPool();
  const result = await pool.query(
    `
    SELECT *
    FROM persons
    WHERE user_id = $1
    ORDER BY sort_order ASC, name ASC;
    `,
    [userId]
  );
  return result.rows.map(toPerson);
}

async function createPerson({ userId, name, color, sortOrder }) {
  const pool = getPool();
  const result = await pool.query(
    `
    INSERT INTO persons (user_id, name, color, sort_order)
    VALUES ($1, $2, $3, $4)
    RETURNING *;
    `,
    [userId, name, color, Number.isFinite(sortOrder) ? Number(sortOrder) : 0]
  );
  return toPerson(result.rows[0]);
}

async function deletePerson({ userId, id }) {
  const pool = getPool();
  const result = await pool.query('DELETE FROM persons WHERE id = $1 AND user_id = $2;', [id, userId]);
  return result.rowCount > 0;
}

module.exports = { listPersons, createPerson, deletePerson };
