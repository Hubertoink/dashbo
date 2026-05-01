const crypto = require('crypto');

const { getPool } = require('../db');

function base64Url(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function generateToken() {
  return base64Url(crypto.randomBytes(32));
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizePublicBaseUrl(raw) {
  const value = String(raw || '').trim().replace(/\/+$/, '');
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function getRequestBaseUrl(req) {
  const configured = normalizePublicBaseUrl(process.env.PUBLIC_APP_URL || process.env.APP_PUBLIC_URL || process.env.FRONTEND_PUBLIC_URL);
  if (configured) return configured;

  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'http';
  const host = forwardedHost || req.get('host') || '';
  return host ? `${protocol}://${host}` : '';
}

function buildFeedLinks(req, token) {
  const path = `/api/calendar-sync/feeds/${encodeURIComponent(token)}.ics`;
  const baseUrl = getRequestBaseUrl(req);
  const url = baseUrl ? `${baseUrl}${path}` : path;
  const webcalUrl = url.replace(/^https?:/i, 'webcal:');
  return { url, webcalUrl };
}

function serializeFeed(row, req) {
  if (!row || row.disabled_at) {
    return { enabled: false, url: null, webcalUrl: null, createdAt: null, updatedAt: null, disabledAt: row ? toIsoOrNull(row.disabled_at) : null };
  }

  return {
    enabled: true,
    ...buildFeedLinks(req, String(row.token)),
    createdAt: toIsoOrNull(row.created_at),
    updatedAt: toIsoOrNull(row.updated_at),
    disabledAt: null,
  };
}

async function getCalendarSyncFeedStatus({ calendarId, req }) {
  const pool = getPool();
  const result = await pool.query(
    `
    SELECT token, created_at, updated_at, disabled_at
    FROM calendar_sync_feeds
    WHERE calendar_id = $1
    LIMIT 1;
    `,
    [calendarId]
  );
  return serializeFeed(result.rows[0] || null, req);
}

async function enableCalendarSyncFeed({ calendarId, userId, req }) {
  const pool = getPool();
  const token = generateToken();
  const result = await pool.query(
    `
    INSERT INTO calendar_sync_feeds (calendar_id, token, created_by_user_id, disabled_at, updated_at)
    VALUES ($1, $2, $3, NULL, NOW())
    ON CONFLICT (calendar_id) DO UPDATE SET
      token = CASE WHEN calendar_sync_feeds.disabled_at IS NULL THEN calendar_sync_feeds.token ELSE EXCLUDED.token END,
      created_by_user_id = COALESCE(calendar_sync_feeds.created_by_user_id, EXCLUDED.created_by_user_id),
      disabled_at = NULL,
      updated_at = NOW()
    RETURNING token, created_at, updated_at, disabled_at;
    `,
    [calendarId, token, userId ?? null]
  );
  return serializeFeed(result.rows[0], req);
}

async function regenerateCalendarSyncFeed({ calendarId, userId, req }) {
  const pool = getPool();
  const token = generateToken();
  const result = await pool.query(
    `
    INSERT INTO calendar_sync_feeds (calendar_id, token, created_by_user_id, disabled_at, updated_at)
    VALUES ($1, $2, $3, NULL, NOW())
    ON CONFLICT (calendar_id) DO UPDATE SET
      token = EXCLUDED.token,
      created_by_user_id = COALESCE(EXCLUDED.created_by_user_id, calendar_sync_feeds.created_by_user_id),
      disabled_at = NULL,
      updated_at = NOW()
    RETURNING token, created_at, updated_at, disabled_at;
    `,
    [calendarId, token, userId ?? null]
  );
  return serializeFeed(result.rows[0], req);
}

async function disableCalendarSyncFeed({ calendarId }) {
  const pool = getPool();
  await pool.query(
    `
    UPDATE calendar_sync_feeds
    SET disabled_at = NOW(), updated_at = NOW()
    WHERE calendar_id = $1 AND disabled_at IS NULL;
    `,
    [calendarId]
  );
  return { enabled: false, url: null, webcalUrl: null, createdAt: null, updatedAt: null, disabledAt: new Date().toISOString() };
}

async function getCalendarIdForFeedToken({ token }) {
  const pool = getPool();
  const result = await pool.query(
    `
    UPDATE calendar_sync_feeds
    SET last_accessed_at = NOW()
    WHERE token = $1 AND disabled_at IS NULL
    RETURNING calendar_id;
    `,
    [String(token || '').trim()]
  );
  if (result.rowCount === 0) return null;
  return Number(result.rows[0].calendar_id);
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatUtcDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`;
}

function utcDateOnly(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date, days) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function formatUtcDate(value) {
  const date = utcDateOnly(value);
  if (!date) return '';
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}`;
}

function escapeText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\n|\r/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function foldLine(line) {
  const maxLength = 74;
  if (line.length <= maxLength) return line;
  const chunks = [];
  let rest = line;
  while (rest.length > maxLength) {
    chunks.push(rest.slice(0, maxLength));
    rest = ` ${rest.slice(maxLength)}`;
  }
  chunks.push(rest);
  return chunks.join('\r\n');
}

function propertyLine(name, value) {
  if (value == null || value === '') return null;
  return foldLine(`${name}:${value}`);
}

function allDayEndExclusive(event) {
  const startDate = utcDateOnly(event.start_at);
  if (!startDate) return null;
  if (!event.end_at) return addUtcDays(startDate, 1);
  const inclusiveEndDate = utcDateOnly(event.end_at);
  return inclusiveEndDate ? addUtcDays(inclusiveEndDate, 1) : addUtcDays(startDate, 1);
}

function recurrenceLine(event) {
  const frequency = String(event.recurrence_freq || '').toLowerCase();
  if (frequency !== 'weekly' && frequency !== 'monthly') return null;

  const parts = [`FREQ=${frequency.toUpperCase()}`];
  const interval = Number(event.recurrence_interval || 1);
  if (Number.isFinite(interval) && interval > 1) parts.push(`INTERVAL=${Math.round(interval)}`);
  if (event.recurrence_until) {
    const until = event.all_day ? formatUtcDate(event.recurrence_until) : formatUtcDateTime(event.recurrence_until);
    if (until) parts.push(`UNTIL=${until}`);
  }
  return parts.join(';');
}

function eventDescription(event) {
  const description = String(event.description || '').trim();
  const details = [];
  if (description) details.push(description);
  if (event.tag_name) details.push(`Kategorie: ${event.tag_name}`);
  const persons = Array.isArray(event.persons) ? event.persons.map((person) => person.name).filter(Boolean) : [];
  if (persons.length > 0) details.push(`Personen: ${persons.join(', ')}`);
  return details.join('\n\n');
}

function renderEvent(event, calendarId, exceptionsByEventId) {
  const lines = ['BEGIN:VEVENT'];
  const uid = `dashbo-${calendarId}-${event.id}@dashbo`;
  const updatedAt = event.updated_at || event.created_at || new Date();

  lines.push(propertyLine('UID', uid));
  lines.push(propertyLine('DTSTAMP', formatUtcDateTime(updatedAt)));
  lines.push(propertyLine('LAST-MODIFIED', formatUtcDateTime(updatedAt)));
  lines.push(propertyLine('SUMMARY', escapeText(event.title || 'Dashbo Termin')));

  const description = eventDescription(event);
  if (description) lines.push(propertyLine('DESCRIPTION', escapeText(description)));
  if (event.location) lines.push(propertyLine('LOCATION', escapeText(event.location)));

  if (event.all_day) {
    lines.push(foldLine(`DTSTART;VALUE=DATE:${formatUtcDate(event.start_at)}`));
    const exclusiveEnd = allDayEndExclusive(event);
    if (exclusiveEnd) lines.push(foldLine(`DTEND;VALUE=DATE:${formatUtcDate(exclusiveEnd)}`));
  } else {
    lines.push(propertyLine('DTSTART', formatUtcDateTime(event.start_at)));
    if (event.end_at) lines.push(propertyLine('DTEND', formatUtcDateTime(event.end_at)));
  }

  const recurrence = recurrenceLine(event);
  if (recurrence) lines.push(propertyLine('RRULE', recurrence));

  const exceptions = exceptionsByEventId.get(Number(event.id)) || [];
  if (exceptions.length > 0) {
    const values = exceptions
      .map((exception) => (event.all_day ? formatUtcDate(exception) : formatUtcDateTime(exception)))
      .filter(Boolean);
    if (values.length > 0) {
      const name = event.all_day ? 'EXDATE;VALUE=DATE' : 'EXDATE';
      lines.push(foldLine(`${name}:${values.join(',')}`));
    }
  }

  lines.push(propertyLine('STATUS', 'CONFIRMED'));
  lines.push('END:VEVENT');
  return lines.filter(Boolean).join('\r\n');
}

async function listCalendarFeedEvents({ calendarId }) {
  const pool = getPool();
  const result = await pool.query(
    `
    SELECT
      e.id,
      e.title,
      e.description,
      e.location,
      e.start_at,
      e.end_at,
      e.all_day,
      e.recurrence_freq,
      e.recurrence_interval,
      e.recurrence_until,
      e.created_at,
      e.updated_at,
      t.name AS tag_name,
      COALESCE(
        json_agg(
          json_build_object('id', persons.id, 'name', persons.name, 'color', persons.color)
          ORDER BY persons.sort_order ASC, persons.name ASC
        ) FILTER (WHERE persons.id IS NOT NULL),
        '[]'::json
      ) AS persons
    FROM events e
    LEFT JOIN tags t ON t.id = e.tag_id AND t.calendar_id = e.calendar_id
    LEFT JOIN event_persons event_persons ON event_persons.event_id = e.id
    LEFT JOIN persons persons ON persons.id = event_persons.person_id AND persons.calendar_id = e.calendar_id
    WHERE e.calendar_id = $1
    GROUP BY e.id, t.name
    ORDER BY e.start_at ASC, e.id ASC;
    `,
    [calendarId]
  );
  return result.rows;
}

async function listCalendarFeedExceptions({ calendarId }) {
  const pool = getPool();
  const result = await pool.query(
    `
    SELECT event_id, occurrence_start_at
    FROM event_recurrence_exceptions
    WHERE calendar_id = $1
    ORDER BY occurrence_start_at ASC;
    `,
    [calendarId]
  );

  const exceptionsByEventId = new Map();
  for (const row of result.rows) {
    const eventId = Number(row.event_id);
    const occurrenceStartAt = row.occurrence_start_at ? new Date(row.occurrence_start_at) : null;
    if (!Number.isFinite(eventId) || !occurrenceStartAt || Number.isNaN(occurrenceStartAt.getTime())) continue;
    const bucket = exceptionsByEventId.get(eventId) || [];
    bucket.push(occurrenceStartAt);
    exceptionsByEventId.set(eventId, bucket);
  }
  return exceptionsByEventId;
}

async function renderCalendarIcs({ calendarId }) {
  const [events, exceptionsByEventId] = await Promise.all([
    listCalendarFeedEvents({ calendarId }),
    listCalendarFeedExceptions({ calendarId }),
  ]);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dashbo//Calendar//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    propertyLine('X-WR-CALNAME', escapeText('Dashbo')),
    propertyLine('X-WR-CALDESC', escapeText('Dashbo Termine')),
    propertyLine('REFRESH-INTERVAL;VALUE=DURATION', 'PT30M'),
    propertyLine('X-PUBLISHED-TTL', 'PT30M'),
    ...events.map((event) => renderEvent(event, calendarId, exceptionsByEventId)),
    'END:VCALENDAR',
  ];

  return `${lines.filter(Boolean).join('\r\n')}\r\n`;
}

module.exports = {
  getCalendarSyncFeedStatus,
  enableCalendarSyncFeed,
  regenerateCalendarSyncFeed,
  disableCalendarSyncFeed,
  getCalendarIdForFeedToken,
  renderCalendarIcs,
};
