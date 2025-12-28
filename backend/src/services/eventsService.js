const { getPool } = require('../db');

function toDbEvent(row) {
  const tagId = row.tag_id != null ? Number(row.tag_id) : null;
  const personId = row.person_id != null ? Number(row.person_id) : null;
  const recurrenceFreq = row.recurrence_freq ? String(row.recurrence_freq) : null;
  const recurrenceInterval = row.recurrence_interval != null ? Number(row.recurrence_interval) : 1;
  const recurrenceUntil = row.recurrence_until ? new Date(row.recurrence_until).toISOString() : null;

  const startAt = new Date(row.start_at).toISOString();
  const endAt = row.end_at ? new Date(row.end_at).toISOString() : null;
  const createdAt = row.created_at ? new Date(row.created_at).toISOString() : null;
  const updatedAt = row.updated_at ? new Date(row.updated_at).toISOString() : null;

  const id = Number(row.id);

  return {
    id,
    occurrenceId: `${id}:${startAt}`,
    title: row.title,
    description: row.description,
    location: row.location,
    startAt,
    endAt,
    allDay: row.all_day,
    recurrence: recurrenceFreq
      ? {
          freq: recurrenceFreq,
          interval: Number.isFinite(recurrenceInterval) && recurrenceInterval > 0 ? recurrenceInterval : 1,
          until: recurrenceUntil,
        }
      : null,
    person: personId
      ? {
          id: personId,
          name: row.person_name,
          color: row.person_color,
        }
      : null,
    tag: tagId
      ? {
          id: tagId,
          name: row.tag_name,
          color: row.tag_color,
        }
      : null,
    createdAt,
    updatedAt,
  };
}

function clampDayOfMonth(year, monthIndex, day) {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return Math.min(day, lastDay);
}

function addMonthsUtcKeepingTime(base, monthsToAdd) {
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();
  const d = base.getUTCDate();

  const hours = base.getUTCHours();
  const minutes = base.getUTCMinutes();
  const seconds = base.getUTCSeconds();
  const ms = base.getUTCMilliseconds();

  const nextMonthIndex = m + monthsToAdd;
  const nextYear = y + Math.floor(nextMonthIndex / 12);
  const nextMonth = ((nextMonthIndex % 12) + 12) % 12;
  const nextDay = clampDayOfMonth(nextYear, nextMonth, d);

  return new Date(Date.UTC(nextYear, nextMonth, nextDay, hours, minutes, seconds, ms));
}

function expandRecurringEvent(baseEvent, from, to) {
  const rec = baseEvent.recurrence;
  if (!rec || (rec.freq !== 'weekly' && rec.freq !== 'monthly')) {
    return [baseEvent];
  }

  const baseStart = new Date(baseEvent.startAt);
  if (Number.isNaN(baseStart.getTime())) return [baseEvent];

  const until = rec.until ? new Date(rec.until) : null;
  const interval = Number.isFinite(rec.interval) && rec.interval > 0 ? rec.interval : 1;

  const durationMs = baseEvent.endAt ? new Date(baseEvent.endAt).getTime() - baseStart.getTime() : null;
  const maxInstances = 600;
  const out = [];

  let cursor;

  if (rec.freq === 'weekly') {
    const stepDays = 7 * interval;
    const stepMs = stepDays * 24 * 3600 * 1000;
    const fromMs = from.getTime();
    const baseMs = baseStart.getTime();

    if (fromMs <= baseMs) {
      cursor = new Date(baseMs);
    } else {
      const diffMs = fromMs - baseMs;
      const n = Math.floor(diffMs / stepMs);
      cursor = new Date(baseMs + n * stepMs);
      while (cursor.getTime() < fromMs) cursor = new Date(cursor.getTime() + stepMs);
    }

    for (let i = 0; i < maxInstances; i++) {
      const t = cursor.getTime();
      if (t > to.getTime()) break;
      if (until && t > until.getTime()) break;
      if (t >= from.getTime()) {
        const startIso = new Date(t).toISOString();
        out.push({
          ...baseEvent,
          startAt: startIso,
          endAt: durationMs != null ? new Date(t + durationMs).toISOString() : null,
          occurrenceId: `${baseEvent.id}:${startIso}`,
        });
      }
      cursor = new Date(t + stepMs);
    }

    return out;
  }

  // monthly
  const fromMs = from.getTime();
  const baseYearMonth = baseStart.getUTCFullYear() * 12 + baseStart.getUTCMonth();
  const fromYearMonth = from.getUTCFullYear() * 12 + from.getUTCMonth();
  const roughMonths = fromYearMonth - baseYearMonth;
  const n = roughMonths > 0 ? Math.floor(roughMonths / interval) : 0;
  cursor = addMonthsUtcKeepingTime(baseStart, n * interval);
  while (cursor.getTime() < fromMs) cursor = addMonthsUtcKeepingTime(cursor, interval);

  for (let i = 0; i < maxInstances; i++) {
    const t = cursor.getTime();
    if (t > to.getTime()) break;
    if (until && t > until.getTime()) break;

    if (t >= from.getTime()) {
      const startIso = new Date(t).toISOString();
      out.push({
        ...baseEvent,
        startAt: startIso,
        endAt: durationMs != null ? new Date(t + durationMs).toISOString() : null,
        occurrenceId: `${baseEvent.id}:${startIso}`,
      });
    }

    cursor = addMonthsUtcKeepingTime(cursor, interval);
  }

  return out;
}

async function getEventById({ userId, id }) {
  const pool = getPool();
  const result = await pool.query(
    `
    SELECT e.*, 
      t.id AS tag_id, t.name AS tag_name, t.color AS tag_color,
      p.id AS person_id, p.name AS person_name, p.color AS person_color
    FROM events e
    LEFT JOIN tags t ON t.id = e.tag_id
    LEFT JOIN persons p ON p.id = e.person_id
    WHERE e.id = $1 AND e.user_id = $2;
    `,
    [id, userId]
  );
  if (result.rowCount === 0) return null;
  return toDbEvent(result.rows[0]);
}

async function listEventsBetween({ userId, from, to }) {
  const pool = getPool();

  // If from/to not provided, return recent-ish events (next 30 days)
  const effectiveFrom = from || new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const effectiveTo = to || new Date(Date.now() + 30 * 24 * 3600 * 1000);

  const result = await pool.query(
    `
    SELECT e.*, 
      t.id AS tag_id, t.name AS tag_name, t.color AS tag_color,
      p.id AS person_id, p.name AS person_name, p.color AS person_color
    FROM events e
    LEFT JOIN tags t ON t.id = e.tag_id AND t.user_id = e.user_id
    LEFT JOIN persons p ON p.id = e.person_id
    WHERE e.user_id = $1 AND (
      -- Non-recurring events:
      -- If end_at is NULL, treat it as a point-in-time event at start_at.
      (
        e.recurrence_freq IS NULL
        AND (
          (e.end_at IS NULL AND e.start_at >= $2 AND e.start_at <= $3)
          OR (e.end_at IS NOT NULL AND e.start_at <= $3 AND e.end_at >= $2)
        )
      )
      OR (
        e.recurrence_freq IS NOT NULL
        AND e.start_at <= $3
        AND (e.recurrence_until IS NULL OR e.recurrence_until >= $2)
      )
    )
    ORDER BY e.start_at ASC;
    `,
    [userId, effectiveFrom.toISOString(), effectiveTo.toISOString()]
  );

  const baseEvents = result.rows.map(toDbEvent);
  const expanded = [];
  for (const e of baseEvents) {
    if (e.recurrence) {
      expanded.push(...expandRecurringEvent(e, effectiveFrom, effectiveTo));
    } else {
      // normalize occurrenceId for non-recurring too
      expanded.push({ ...e, occurrenceId: `${e.id}:${e.startAt}` });
    }
  }

  expanded.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  return expanded;
}

async function insertEvent({ userId, title, description, location, startAt, endAt, allDay, tagId, personId, recurrence }) {
  const pool = getPool();

  if (tagId != null) {
    const ok = await pool.query('SELECT 1 FROM tags WHERE id = $1 AND user_id = $2;', [tagId, userId]);
    if (ok.rowCount === 0) {
      const err = new Error('invalid_tag');
      err.status = 400;
      throw err;
    }
  }

  if (personId != null) {
    const ok = await pool.query('SELECT 1 FROM persons WHERE id = $1 AND user_id = $2;', [personId, userId]);
    if (ok.rowCount === 0) {
      const err = new Error('invalid_person');
      err.status = 400;
      throw err;
    }
  }

  const recurrenceFreq = recurrence ?? null;
  const recurrenceInterval = 1;
  const recurrenceUntil = null;

  const result = await pool.query(
    `
    INSERT INTO events (user_id, title, description, location, start_at, end_at, all_day, tag_id, person_id, recurrence_freq, recurrence_interval, recurrence_until)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *;
    `,
    [
      userId,
      title,
      description ?? null,
      location ?? null,
      new Date(startAt).toISOString(),
      endAt ? new Date(endAt).toISOString() : null,
      Boolean(allDay),
      tagId ?? null,
      personId ?? null,
      recurrenceFreq,
      recurrenceInterval,
      recurrenceUntil,
    ]
  );

  return getEventById({ userId, id: result.rows[0].id });
}

async function patchEvent({ userId, id, patch }) {
  const pool = getPool();

  const fields = [];
  const values = [];

  function add(field, value) {
    values.push(value);
    fields.push(`${field} = $${values.length}`);
  }

  if (patch.title !== undefined) add('title', patch.title);
  if (patch.description !== undefined) add('description', patch.description ?? null);
  if (patch.location !== undefined) add('location', patch.location ?? null);
  if (patch.startAt !== undefined) add('start_at', new Date(patch.startAt).toISOString());
  if (patch.endAt !== undefined) add('end_at', patch.endAt ? new Date(patch.endAt).toISOString() : null);
  if (patch.allDay !== undefined) add('all_day', Boolean(patch.allDay));
  if (patch.tagId !== undefined) {
    if (patch.tagId != null) {
      const ok = await pool.query('SELECT 1 FROM tags WHERE id = $1 AND user_id = $2;', [patch.tagId, userId]);
      if (ok.rowCount === 0) {
        const err = new Error('invalid_tag');
        err.status = 400;
        throw err;
      }
    }
    add('tag_id', patch.tagId ?? null);
  }

  if (patch.personId !== undefined) {
    if (patch.personId != null) {
      const ok = await pool.query('SELECT 1 FROM persons WHERE id = $1 AND user_id = $2;', [patch.personId, userId]);
      if (ok.rowCount === 0) {
        const err = new Error('invalid_person');
        err.status = 400;
        throw err;
      }
    }
    add('person_id', patch.personId ?? null);
  }
  if (patch.recurrence !== undefined) add('recurrence_freq', patch.recurrence ?? null);

  if (fields.length === 0) {
    return getEventById({ userId, id });
  }

  add('updated_at', new Date().toISOString());

  const result = await pool.query(
    `
    UPDATE events
    SET ${fields.join(', ')}
    WHERE id = $${values.length + 1} AND user_id = $${values.length + 2}
    RETURNING *;
    `,
    [...values, id, userId]
  );

  if (result.rowCount === 0) return null;
  return getEventById({ userId, id: result.rows[0].id });
}

async function removeEvent({ userId, id }) {
  const pool = getPool();
  const result = await pool.query('DELETE FROM events WHERE id = $1 AND user_id = $2;', [id, userId]);
  return result.rowCount > 0;
}

module.exports = { listEventsBetween, insertEvent, patchEvent, removeEvent };
