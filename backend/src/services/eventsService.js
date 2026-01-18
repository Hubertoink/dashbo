const { getPool } = require('../db');

function uniqueNumbers(input) {
  const out = [];
  const seen = new Set();
  for (const x of input) {
    const n = Number(x);
    if (!Number.isFinite(n)) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function normalizePersonIds({ personIds, personId }) {
  if (Array.isArray(personIds)) return uniqueNumbers(personIds).filter((n) => Number.isInteger(n) && n > 0);
  if (personId == null) return [];
  const n = Number(personId);
  return Number.isInteger(n) && n > 0 ? [n] : [];
}

async function assertPersonsBelongToCalendar({ pool, calendarId, personIds }) {
  if (!personIds || personIds.length === 0) return;
  const ids = uniqueNumbers(personIds);
  const r = await pool.query('SELECT id FROM persons WHERE calendar_id = $1 AND id = ANY($2::bigint[]);', [calendarId, ids]);
  if (r.rowCount !== ids.length) {
    const err = new Error('invalid_person');
    err.status = 400;
    throw err;
  }
}

function toEventFromRows(rows) {
  if (!rows || rows.length === 0) return null;
  const row0 = rows[0];

  const tagId = row0.tag_id != null ? Number(row0.tag_id) : null;
  const recurrenceFreq = row0.recurrence_freq ? String(row0.recurrence_freq) : null;
  const recurrenceInterval = row0.recurrence_interval != null ? Number(row0.recurrence_interval) : 1;
  const recurrenceUntil = row0.recurrence_until ? new Date(row0.recurrence_until).toISOString() : null;

  const startAt = new Date(row0.start_at).toISOString();
  const endAt = row0.end_at ? new Date(row0.end_at).toISOString() : null;
  const createdAt = row0.created_at ? new Date(row0.created_at).toISOString() : null;
  const updatedAt = row0.updated_at ? new Date(row0.updated_at).toISOString() : null;

  const id = Number(row0.id);

  const persons = [];
  const seen = new Set();
  for (const r of rows) {
    const pid = r.person_id != null ? Number(r.person_id) : null;
    if (!pid || seen.has(pid)) continue;
    seen.add(pid);
    persons.push({ id: pid, name: r.person_name, color: r.person_color });
  }

  return {
    id,
    occurrenceId: `${id}:${startAt}`,
    title: row0.title,
    description: row0.description,
    location: row0.location,
    startAt,
    endAt,
    allDay: row0.all_day,
    recurrence: recurrenceFreq
      ? {
          freq: recurrenceFreq,
          interval: Number.isFinite(recurrenceInterval) && recurrenceInterval > 0 ? recurrenceInterval : 1,
          until: recurrenceUntil,
        }
      : null,
    persons,
    // Backwards compatibility for old clients
    person: persons[0] ?? null,
    tag: tagId
      ? {
          id: tagId,
          name: row0.tag_name,
          color: row0.tag_color,
        }
      : null,
    createdAt,
    updatedAt,
  };
}

function groupEvents(rows) {
  /** @type {Map<number, any[]>} */
  const byId = new Map();
  for (const r of rows) {
    const id = Number(r.id);
    const arr = byId.get(id);
    if (arr) arr.push(r);
    else byId.set(id, [r]);
  }
  return Array.from(byId.values()).map(toEventFromRows).filter(Boolean);
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

function expandRecurringEvent(baseEvent, from, to, skipOccurrenceStartIsoSet) {
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
        if (skipOccurrenceStartIsoSet && skipOccurrenceStartIsoSet.has(startIso)) {
          cursor = new Date(t + stepMs);
          continue;
        }
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
      if (skipOccurrenceStartIsoSet && skipOccurrenceStartIsoSet.has(startIso)) {
        cursor = addMonthsUtcKeepingTime(cursor, interval);
        continue;
      }
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

async function getEventById({ calendarId, id }) {
  const pool = getPool();
  const result = await pool.query(
    `
    SELECT e.*, 
      t.id AS tag_id, t.name AS tag_name, t.color AS tag_color,
      p.id AS person_id, p.name AS person_name, p.color AS person_color
    FROM events e
    LEFT JOIN tags t ON t.id = e.tag_id AND t.calendar_id = e.calendar_id
    LEFT JOIN event_persons ep ON ep.event_id = e.id
    LEFT JOIN persons p ON p.id = ep.person_id AND p.calendar_id = e.calendar_id
    WHERE e.id = $1 AND e.calendar_id = $2;
    `,
    [id, calendarId]
  );
  if (result.rowCount === 0) return null;
  return toEventFromRows(result.rows);
}

async function listEventsBetween({ calendarId, from, to }) {
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
    LEFT JOIN tags t ON t.id = e.tag_id AND t.calendar_id = e.calendar_id
    LEFT JOIN event_persons ep ON ep.event_id = e.id
    LEFT JOIN persons p ON p.id = ep.person_id AND p.calendar_id = e.calendar_id
    WHERE e.calendar_id = $1 AND (
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
    ORDER BY e.start_at ASC, p.sort_order ASC, p.name ASC;
    `,
    [calendarId, effectiveFrom.toISOString(), effectiveTo.toISOString()]
  );

  const baseEvents = groupEvents(result.rows);

  const recurringIds = baseEvents.filter((e) => e && e.recurrence).map((e) => Number(e.id)).filter((n) => Number.isFinite(n));
  /** @type {Map<number, Set<string>>} */
  const skipByEventId = new Map();

  if (recurringIds.length > 0) {
    const ex = await pool.query(
      `
      SELECT event_id, occurrence_start_at
      FROM event_recurrence_exceptions
      WHERE calendar_id = $1
        AND event_id = ANY($2::bigint[])
        AND occurrence_start_at >= $3
        AND occurrence_start_at <= $4;
      `,
      [calendarId, recurringIds, effectiveFrom.toISOString(), effectiveTo.toISOString()]
    );
    for (const r of ex.rows) {
      const eventId = Number(r.event_id);
      const occIso = r.occurrence_start_at ? new Date(r.occurrence_start_at).toISOString() : null;
      if (!Number.isFinite(eventId) || !occIso) continue;
      const set = skipByEventId.get(eventId) ?? new Set();
      set.add(occIso);
      skipByEventId.set(eventId, set);
    }
  }

  const expanded = [];
  for (const e of baseEvents) {
    if (e.recurrence) {
      expanded.push(...expandRecurringEvent(e, effectiveFrom, effectiveTo, skipByEventId.get(Number(e.id)) ?? null));
    } else {
      // normalize occurrenceId for non-recurring too
      expanded.push({ ...e, occurrenceId: `${e.id}:${e.startAt}` });
    }
  }

  expanded.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  return expanded;
}

async function patchEventOccurrence({ calendarId, userId, id, occurrenceStartAt, patch }) {
  const pool = getPool();

  if (!occurrenceStartAt || Number.isNaN(new Date(occurrenceStartAt).getTime())) {
    const err = new Error('invalid_occurrence');
    err.status = 400;
    throw err;
  }

  const base = await getEventById({ calendarId, id });
  if (!base) return null;
  if (!base.recurrence) {
    const err = new Error('not_recurring');
    err.status = 400;
    throw err;
  }

  // Build a non-recurring replacement event for that single occurrence.
  const title = patch.title !== undefined ? patch.title : base.title;
  const description = patch.description !== undefined ? patch.description : base.description;
  const location = patch.location !== undefined ? patch.location : base.location;
  const allDay = patch.allDay !== undefined ? Boolean(patch.allDay) : Boolean(base.allDay);

  const occStartIso = new Date(occurrenceStartAt).toISOString();
  const startAt = patch.startAt !== undefined ? new Date(patch.startAt).toISOString() : occStartIso;
  const endAt = patch.endAt !== undefined ? (patch.endAt ? new Date(patch.endAt).toISOString() : null) : null;

  const personsProvided = patch.personIds !== undefined || patch.personId !== undefined;
  const normalizedPersonIds = personsProvided
    ? normalizePersonIds({ personIds: patch.personIds, personId: patch.personId })
    : normalizePersonIds({ personIds: base.persons?.map((p) => p.id) ?? [], personId: null });

  const tagId = patch.tagId !== undefined ? patch.tagId ?? null : base.tag?.id ?? null;

  if (tagId != null) {
    const ok = await pool.query('SELECT 1 FROM tags WHERE id = $1 AND calendar_id = $2;', [tagId, calendarId]);
    if (ok.rowCount === 0) {
      const err = new Error('invalid_tag');
      err.status = 400;
      throw err;
    }
  }

  await assertPersonsBelongToCalendar({ pool, calendarId, personIds: normalizedPersonIds });

  await pool.query('BEGIN;');
  try {
    const primaryPersonId = normalizedPersonIds[0] ?? null;
    const result = await pool.query(
      `
      INSERT INTO events (calendar_id, user_id, title, description, location, start_at, end_at, all_day, tag_id, person_id, recurrence_freq, recurrence_interval, recurrence_until)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id;
      `,
      [
        calendarId,
        userId ?? null,
        title,
        description ?? null,
        location ?? null,
        startAt,
        endAt,
        Boolean(allDay),
        tagId,
        primaryPersonId,
        null,
        1,
        null,
      ]
    );

    const replacementId = Number(result.rows[0].id);

    if (normalizedPersonIds.length > 0) {
      for (const pid of normalizedPersonIds) {
        await pool.query('INSERT INTO event_persons (event_id, person_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;', [replacementId, pid]);
      }
    }

    await pool.query(
      `
      INSERT INTO event_recurrence_exceptions (calendar_id, event_id, occurrence_start_at, replacement_event_id, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (event_id, occurrence_start_at)
      DO UPDATE SET replacement_event_id = EXCLUDED.replacement_event_id, updated_at = NOW();
      `,
      [calendarId, id, occStartIso, replacementId]
    );

    await pool.query('COMMIT;');
    return getEventById({ calendarId, id: replacementId });
  } catch (e) {
    await pool.query('ROLLBACK;');
    throw e;
  }
}

async function insertEvent({
  calendarId,
  createdByUserId,
  title,
  description,
  location,
  startAt,
  endAt,
  allDay,
  tagId,
  personId,
  personIds,
  recurrence,
}) {
  const pool = getPool();

  const normalizedPersonIds = normalizePersonIds({ personIds, personId });

  if (tagId != null) {
    const ok = await pool.query('SELECT 1 FROM tags WHERE id = $1 AND calendar_id = $2;', [tagId, calendarId]);
    if (ok.rowCount === 0) {
      const err = new Error('invalid_tag');
      err.status = 400;
      throw err;
    }
  }

  await assertPersonsBelongToCalendar({ pool, calendarId, personIds: normalizedPersonIds });

  const recurrenceFreq = recurrence ?? null;
  const recurrenceInterval = 1;
  const recurrenceUntil = null;

  await pool.query('BEGIN;');
  try {
    const primaryPersonId = normalizedPersonIds[0] ?? null;
    const result = await pool.query(
      `
      INSERT INTO events (calendar_id, user_id, title, description, location, start_at, end_at, all_day, tag_id, person_id, recurrence_freq, recurrence_interval, recurrence_until)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id;
      `,
      [
        calendarId,
        createdByUserId ?? null,
        title,
        description ?? null,
        location ?? null,
        new Date(startAt).toISOString(),
        endAt ? new Date(endAt).toISOString() : null,
        Boolean(allDay),
        tagId ?? null,
        primaryPersonId,
        recurrenceFreq,
        recurrenceInterval,
        recurrenceUntil,
      ]
    );

    const eventId = Number(result.rows[0].id);
    if (normalizedPersonIds.length > 0) {
      for (const pid of normalizedPersonIds) {
        await pool.query('INSERT INTO event_persons (event_id, person_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;', [eventId, pid]);
      }
    }

    await pool.query('COMMIT;');
    return getEventById({ calendarId, id: eventId });
  } catch (e) {
    await pool.query('ROLLBACK;');
    throw e;
  }
}

async function patchEvent({ calendarId, userId, id, patch }) {
  const pool = getPool();

  const personsProvided = patch.personIds !== undefined || patch.personId !== undefined;
  const normalizedPersonIds = personsProvided
    ? normalizePersonIds({ personIds: patch.personIds, personId: patch.personId })
    : null;

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
      const ok = await pool.query('SELECT 1 FROM tags WHERE id = $1 AND calendar_id = $2;', [patch.tagId, calendarId]);
      if (ok.rowCount === 0) {
        const err = new Error('invalid_tag');
        err.status = 400;
        throw err;
      }
    }
    add('tag_id', patch.tagId ?? null);
  }

  if (personsProvided) {
    await assertPersonsBelongToCalendar({ pool, calendarId, personIds: normalizedPersonIds });
    add('person_id', (normalizedPersonIds && normalizedPersonIds[0]) ?? null);
  }
  if (patch.recurrence !== undefined) add('recurrence_freq', patch.recurrence ?? null);

  if (fields.length === 0) {
    return getEventById({ calendarId, id });
  }

  add('updated_at', new Date().toISOString());

  await pool.query('BEGIN;');
  try {
    const result = await pool.query(
      `
      UPDATE events
      SET ${fields.join(', ')}
      WHERE id = $${values.length + 1} AND calendar_id = $${values.length + 2}
      RETURNING id;
      `,
      [...values, id, calendarId]
    );

    if (result.rowCount === 0) {
      await pool.query('ROLLBACK;');
      return null;
    }

    const eventId = Number(result.rows[0].id);

    if (personsProvided) {
      await pool.query('DELETE FROM event_persons WHERE event_id = $1;', [eventId]);
      if (normalizedPersonIds && normalizedPersonIds.length > 0) {
        for (const pid of normalizedPersonIds) {
          await pool.query('INSERT INTO event_persons (event_id, person_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;', [eventId, pid]);
        }
      }
    }

    await pool.query('COMMIT;');
    return getEventById({ calendarId, id: eventId });
  } catch (e) {
    await pool.query('ROLLBACK;');
    throw e;
  }
}

async function removeEvent({ calendarId, id }) {
  const pool = getPool();
  const result = await pool.query('DELETE FROM events WHERE id = $1 AND calendar_id = $2;', [id, calendarId]);
  return result.rowCount > 0;
}

async function removeEventOccurrence({ calendarId, id, occurrenceStartAt }) {
  const pool = getPool();

  if (!occurrenceStartAt || Number.isNaN(new Date(occurrenceStartAt).getTime())) {
    const err = new Error('invalid_occurrence');
    err.status = 400;
    throw err;
  }

  const base = await getEventById({ calendarId, id });
  if (!base) return false;
  if (!base.recurrence) {
    const err = new Error('not_recurring');
    err.status = 400;
    throw err;
  }

  const occStartIso = new Date(occurrenceStartAt).toISOString();

  await pool.query('BEGIN;');
  try {
    const existing = await pool.query(
      `
      SELECT replacement_event_id
      FROM event_recurrence_exceptions
      WHERE calendar_id = $1 AND event_id = $2 AND occurrence_start_at = $3
      LIMIT 1;
      `,
      [calendarId, id, occStartIso]
    );

    const replacementId =
      existing.rowCount > 0 && existing.rows[0].replacement_event_id != null ? Number(existing.rows[0].replacement_event_id) : null;

    if (replacementId && Number.isFinite(replacementId)) {
      await pool.query('DELETE FROM events WHERE id = $1 AND calendar_id = $2;', [replacementId, calendarId]);
    }

    await pool.query(
      `
      INSERT INTO event_recurrence_exceptions (calendar_id, event_id, occurrence_start_at, replacement_event_id, updated_at)
      VALUES ($1, $2, $3, NULL, NOW())
      ON CONFLICT (event_id, occurrence_start_at)
      DO UPDATE SET replacement_event_id = NULL, updated_at = NOW();
      `,
      [calendarId, id, occStartIso]
    );

    await pool.query('COMMIT;');
    return true;
  } catch (e) {
    await pool.query('ROLLBACK;');
    throw e;
  }
}

module.exports = { listEventsBetween, insertEvent, patchEvent, patchEventOccurrence, removeEventOccurrence, removeEvent };
