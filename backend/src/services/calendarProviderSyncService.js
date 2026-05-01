const crypto = require('crypto');

const { getPool } = require('../db');
const { listEventsBetween } = require('./eventsService');
const { getValidAccessTokenForConnection } = require('./outlookService');
const { getValidGoogleAccessTokenForConnection } = require('./googleService');

const PROVIDERS = new Set(['outlook', 'google']);
const SYNC_PAST_DAYS = 365;
const SYNC_FUTURE_DAYS = 365 * 3;
const TARGET_CALENDAR_NAME = 'Dashbo';

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function payloadHash(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function dateOnly(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function dateTimeUtc(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function addUtcDaysToDateOnly(value, days) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return dateOnly(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days)));
}

function eventEndIso(event) {
  if (event.endAt) return dateTimeUtc(event.endAt);
  const start = new Date(event.startAt);
  if (Number.isNaN(start.getTime())) return dateTimeUtc(new Date());
  return dateTimeUtc(new Date(start.getTime() + 30 * 60 * 1000));
}

function allDayExclusiveEndDate(event) {
  if (event.endAt) return addUtcDaysToDateOnly(event.endAt, 1);
  return addUtcDaysToDateOnly(event.startAt, 1);
}

function syncKeyForEvent(event) {
  if (event.recurrence && event.occurrenceId) return `occurrence:${event.occurrenceId}`;
  return `event:${event.id}`;
}

function eventDescription(event, syncKey) {
  const parts = [];
  const description = String(event.description || '').trim();
  if (description) parts.push(description);
  if (event.tag?.name) parts.push(`Kategorie: ${event.tag.name}`);
  const persons = Array.isArray(event.persons) ? event.persons.map((person) => person.name).filter(Boolean) : [];
  if (persons.length > 0) parts.push(`Personen: ${persons.join(', ')}`);
  parts.push(`Dashbo Sync-ID: ${syncKey}`);
  return parts.join('\n\n');
}

function normalizeEventForSync(event) {
  const syncKey = syncKeyForEvent(event);
  return {
    syncKey,
    title: String(event.title || 'Dashbo Termin'),
    description: eventDescription(event, syncKey),
    location: event.location ? String(event.location) : '',
    startAt: event.startAt,
    endAt: event.endAt,
    allDay: Boolean(event.allDay),
  };
}

function makeOutlookPayload(normalized) {
  const payload = {
    subject: normalized.title,
    body: {
      contentType: 'text',
      content: normalized.description,
    },
    location: {
      displayName: normalized.location || '',
    },
    isAllDay: normalized.allDay,
  };

  if (normalized.allDay) {
    payload.start = { dateTime: `${dateOnly(normalized.startAt)}T00:00:00`, timeZone: 'UTC' };
    payload.end = { dateTime: `${allDayExclusiveEndDate(normalized)}T00:00:00`, timeZone: 'UTC' };
  } else {
    payload.start = { dateTime: dateTimeUtc(normalized.startAt), timeZone: 'UTC' };
    payload.end = { dateTime: eventEndIso(normalized), timeZone: 'UTC' };
  }

  return payload;
}

function makeGooglePayload(normalized) {
  const payload = {
    summary: normalized.title,
    description: normalized.description,
    location: normalized.location || undefined,
    extendedProperties: {
      private: {
        dashboSyncKey: normalized.syncKey,
      },
    },
  };

  if (normalized.allDay) {
    payload.start = { date: dateOnly(normalized.startAt) };
    payload.end = { date: allDayExclusiveEndDate(normalized) };
  } else {
    payload.start = { dateTime: dateTimeUtc(normalized.startAt), timeZone: 'UTC' };
    payload.end = { dateTime: eventEndIso(normalized), timeZone: 'UTC' };
  }

  return payload;
}

function makeHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  if (status === 404) error.code = 'not_found';
  return error;
}

async function fetchJson(url, options = {}) {
  const resp = await fetch(url, options);
  const text = await resp.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { error: text };
    }
  }
  if (!resp.ok) {
    const msg = json?.error?.message || json?.error_description || json?.error || `${resp.status}`;
    throw makeHttpError(String(msg), resp.status);
  }
  return json;
}

async function fetchEmpty(url, options = {}) {
  const resp = await fetch(url, options);
  if (!resp.ok && resp.status !== 404) {
    const text = await resp.text().catch(() => '');
    throw makeHttpError(text || `${resp.status}`, resp.status);
  }
  return resp.status !== 404;
}

async function fetchGraphJson(accessToken, path, options = {}) {
  return fetchJson(`https://graph.microsoft.com/v1.0${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'outlook.timezone="UTC"',
      ...(options.headers || {}),
    },
  });
}

async function fetchGraphEmpty(accessToken, path, options = {}) {
  return fetchEmpty(`https://graph.microsoft.com/v1.0${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  });
}

async function fetchGoogleJson(accessToken, path, options = {}) {
  return fetchJson(`https://www.googleapis.com/calendar/v3${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

async function fetchGoogleEmpty(accessToken, path, options = {}) {
  return fetchEmpty(`https://www.googleapis.com/calendar/v3${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  });
}

function hasScope(scope, required) {
  return String(scope || '').split(/\s+/).includes(required);
}

async function getOutlookConnection({ userId, connectionId }) {
  const pool = getPool();
  const result = await pool.query(
    'SELECT id, email, display_name, scope FROM outlook_connections WHERE user_id = $1 AND id = $2;',
    [userId, Number(connectionId)]
  );
  return result.rows[0] || null;
}

async function getGoogleConnection({ userId, connectionId }) {
  const pool = getPool();
  const result = await pool.query(
    'SELECT id, email, display_name, scope FROM google_connections WHERE user_id = $1 AND id = $2;',
    [userId, Number(connectionId)]
  );
  return result.rows[0] || null;
}

async function getProviderConnection({ provider, userId, connectionId }) {
  if (provider === 'outlook') return getOutlookConnection({ userId, connectionId });
  if (provider === 'google') return getGoogleConnection({ userId, connectionId });
  return null;
}

function connectionLabel(row, provider) {
  return (row?.display_name ? String(row.display_name) : null) || (row?.email ? String(row.email) : null) || provider;
}

async function getProviderAccessToken(target) {
  if (target.provider === 'outlook') {
    return getValidAccessTokenForConnection({ userId: target.provider_user_id, connectionId: target.provider_connection_id });
  }
  if (target.provider === 'google') {
    return getValidGoogleAccessTokenForConnection({ userId: target.provider_user_id, connectionId: target.provider_connection_id });
  }
  return null;
}

function assertProviderScope(provider, connection) {
  if (provider === 'outlook' && !hasScope(connection.scope, 'Calendars.ReadWrite')) {
    throw new Error('outlook_calendars_readwrite_required');
  }
  if (provider === 'google' && !hasScope(connection.scope, 'https://www.googleapis.com/auth/calendar')) {
    throw new Error('google_calendar_scope_required');
  }
}

async function ensureOutlookCalendar({ accessToken }) {
  const calendars = await fetchGraphJson(accessToken, '/me/calendars?$select=id,name&$top=100');
  const existing = (Array.isArray(calendars?.value) ? calendars.value : []).find((calendar) => String(calendar?.name || '') === TARGET_CALENDAR_NAME);
  if (existing?.id) return String(existing.id);

  const created = await fetchGraphJson(accessToken, '/me/calendars', {
    method: 'POST',
    body: JSON.stringify({ name: TARGET_CALENDAR_NAME }),
  });
  if (!created?.id) throw new Error('outlook_calendar_create_failed');
  return String(created.id);
}

async function ensureGoogleCalendar({ accessToken }) {
  const list = await fetchGoogleJson(accessToken, '/users/me/calendarList?minAccessRole=writer');
  const existing = (Array.isArray(list?.items) ? list.items : []).find((calendar) => String(calendar?.summary || '') === TARGET_CALENDAR_NAME);
  if (existing?.id) return String(existing.id);

  const created = await fetchGoogleJson(accessToken, '/calendars', {
    method: 'POST',
    body: JSON.stringify({ summary: TARGET_CALENDAR_NAME, timeZone: 'UTC' }),
  });
  if (!created?.id) throw new Error('google_calendar_create_failed');
  return String(created.id);
}

async function ensureProviderCalendar(target) {
  const accessToken = await getProviderAccessToken(target);
  if (!accessToken) throw new Error(`${target.provider}_access_token_missing`);
  if (target.provider === 'outlook') return ensureOutlookCalendar({ accessToken });
  if (target.provider === 'google') return ensureGoogleCalendar({ accessToken });
  throw new Error('invalid_provider');
}

async function upsertOutlookEvent({ target, accessToken, externalEventId, payload }) {
  if (externalEventId) {
    try {
      await fetchGraphJson(accessToken, `/me/calendars/${encodeURIComponent(target.external_calendar_id)}/events/${encodeURIComponent(externalEventId)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      return externalEventId;
    } catch (error) {
      if (error.code !== 'not_found') throw error;
    }
  }

  const created = await fetchGraphJson(accessToken, `/me/calendars/${encodeURIComponent(target.external_calendar_id)}/events`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!created?.id) throw new Error('outlook_event_create_failed');
  return String(created.id);
}

async function upsertGoogleEvent({ target, accessToken, externalEventId, payload }) {
  if (externalEventId) {
    try {
      await fetchGoogleJson(accessToken, `/calendars/${encodeURIComponent(target.external_calendar_id)}/events/${encodeURIComponent(externalEventId)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      return externalEventId;
    } catch (error) {
      if (error.code !== 'not_found') throw error;
    }
  }

  const created = await fetchGoogleJson(accessToken, `/calendars/${encodeURIComponent(target.external_calendar_id)}/events`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!created?.id) throw new Error('google_event_create_failed');
  return String(created.id);
}

async function deleteProviderEvent({ target, accessToken, externalEventId }) {
  if (!externalEventId) return;
  if (target.provider === 'outlook') {
    await fetchGraphEmpty(accessToken, `/me/calendars/${encodeURIComponent(target.external_calendar_id)}/events/${encodeURIComponent(externalEventId)}`, {
      method: 'DELETE',
    });
    return;
  }
  if (target.provider === 'google') {
    await fetchGoogleEmpty(accessToken, `/calendars/${encodeURIComponent(target.external_calendar_id)}/events/${encodeURIComponent(externalEventId)}`, {
      method: 'DELETE',
    });
  }
}

function providerPayload(provider, normalized) {
  if (provider === 'outlook') return makeOutlookPayload(normalized);
  if (provider === 'google') return makeGooglePayload(normalized);
  throw new Error('invalid_provider');
}

async function providerUpsertEvent({ target, accessToken, externalEventId, payload }) {
  if (target.provider === 'outlook') return upsertOutlookEvent({ target, accessToken, externalEventId, payload });
  if (target.provider === 'google') return upsertGoogleEvent({ target, accessToken, externalEventId, payload });
  throw new Error('invalid_provider');
}

async function desiredSyncEvents({ calendarId }) {
  const now = new Date();
  const from = addDays(now, -SYNC_PAST_DAYS);
  const to = addDays(now, SYNC_FUTURE_DAYS);
  const events = await listEventsBetween({ calendarId, from, to });
  const byKey = new Map();

  for (const event of events) {
    const normalized = normalizeEventForSync(event);
    if (!normalized.syncKey || !normalized.startAt) continue;
    byKey.set(normalized.syncKey, normalized);
  }

  return byKey;
}

async function getTargetById({ calendarId, targetId }) {
  const pool = getPool();
  const result = await pool.query(
    `
    SELECT *
    FROM calendar_sync_targets
    WHERE calendar_id = $1 AND id = $2;
    `,
    [calendarId, Number(targetId)]
  );
  return result.rows[0] || null;
}

async function getEnabledTargets({ calendarId, targetId = null }) {
  const pool = getPool();
  const values = [calendarId];
  let filter = '';
  if (targetId != null) {
    values.push(Number(targetId));
    filter = `AND id = $${values.length}`;
  }
  const result = await pool.query(
    `
    SELECT *
    FROM calendar_sync_targets
    WHERE calendar_id = $1 AND enabled = TRUE ${filter}
    ORDER BY id ASC;
    `,
    values
  );
  return result.rows;
}

async function syncOneTarget({ target, desired }) {
  const pool = getPool();
  const accessToken = await getProviderAccessToken(target);
  if (!accessToken) throw new Error(`${target.provider}_access_token_missing`);

  let externalCalendarId = target.external_calendar_id ? String(target.external_calendar_id) : '';
  if (!externalCalendarId) {
    externalCalendarId = await ensureProviderCalendar(target);
    await pool.query(
      `
      UPDATE calendar_sync_targets
      SET external_calendar_id = $2, external_calendar_name = $3, updated_at = NOW()
      WHERE id = $1;
      `,
      [Number(target.id), externalCalendarId, TARGET_CALENDAR_NAME]
    );
    target = { ...target, external_calendar_id: externalCalendarId, external_calendar_name: TARGET_CALENDAR_NAME };
  }

  const mappingResult = await pool.query(
    `
    SELECT sync_key, external_event_id, payload_hash
    FROM calendar_sync_event_mappings
    WHERE target_id = $1;
    `,
    [Number(target.id)]
  );
  const mappings = new Map(mappingResult.rows.map((row) => [String(row.sync_key), row]));

  for (const [syncKey, normalized] of desired.entries()) {
    const payload = providerPayload(target.provider, normalized);
    const hash = payloadHash(payload);
    const mapping = mappings.get(syncKey);
    if (mapping?.payload_hash === hash && mapping?.external_event_id) continue;

    const externalEventId = await providerUpsertEvent({
      target,
      accessToken,
      externalEventId: mapping?.external_event_id ? String(mapping.external_event_id) : null,
      payload,
    });

    await pool.query(
      `
      INSERT INTO calendar_sync_event_mappings (target_id, sync_key, external_event_id, payload_hash, last_synced_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (target_id, sync_key) DO UPDATE SET
        external_event_id = EXCLUDED.external_event_id,
        payload_hash = EXCLUDED.payload_hash,
        last_synced_at = NOW(),
        updated_at = NOW();
      `,
      [Number(target.id), syncKey, externalEventId, hash]
    );
  }

  for (const [syncKey, mapping] of mappings.entries()) {
    if (desired.has(syncKey)) continue;
    await deleteProviderEvent({ target, accessToken, externalEventId: String(mapping.external_event_id) });
    await pool.query('DELETE FROM calendar_sync_event_mappings WHERE target_id = $1 AND sync_key = $2;', [Number(target.id), syncKey]);
  }

  await pool.query(
    `
    UPDATE calendar_sync_targets
    SET last_synced_at = NOW(), last_error = NULL, updated_at = NOW()
    WHERE id = $1;
    `,
    [Number(target.id)]
  );

  return { ok: true, targetId: Number(target.id), synced: desired.size };
}

async function markTargetError({ targetId, error }) {
  const pool = getPool();
  const message = error instanceof Error ? error.message : String(error || 'sync_failed');
  await pool.query(
    `
    UPDATE calendar_sync_targets
    SET last_error = $2, updated_at = NOW()
    WHERE id = $1;
    `,
    [Number(targetId), message.slice(0, 2000)]
  );
  return message;
}

async function syncCalendarTargets({ calendarId, targetId = null }) {
  const targets = await getEnabledTargets({ calendarId, targetId });
  if (targets.length === 0) return [];
  const desired = await desiredSyncEvents({ calendarId });
  const results = [];

  for (const target of targets) {
    try {
      results.push(await syncOneTarget({ target, desired }));
    } catch (error) {
      const message = await markTargetError({ targetId: target.id, error });
      console.warn('[calendar-sync] provider sync failed', { targetId: Number(target.id), provider: target.provider, error: message });
      results.push({ ok: false, targetId: Number(target.id), error: message });
    }
  }

  return results;
}

function triggerCalendarSync({ calendarId }) {
  if (!Number.isFinite(Number(calendarId)) || Number(calendarId) <= 0) return;
  setTimeout(() => {
    syncCalendarTargets({ calendarId: Number(calendarId) }).catch((error) => {
      console.warn('[calendar-sync] async trigger failed', error?.message || error);
    });
  }, 0);
}

async function listCalendarSyncTargets({ calendarId }) {
  const pool = getPool();
  const result = await pool.query(
    `
    SELECT *
    FROM calendar_sync_targets
    WHERE calendar_id = $1
    ORDER BY provider ASC, id ASC;
    `,
    [calendarId]
  );

  const targets = [];
  for (const row of result.rows) {
    const connection = await getProviderConnection({
      provider: String(row.provider),
      userId: Number(row.provider_user_id),
      connectionId: Number(row.provider_connection_id),
    });
    targets.push({
      id: Number(row.id),
      provider: String(row.provider),
      providerConnectionId: Number(row.provider_connection_id),
      providerUserId: Number(row.provider_user_id),
      connectionLabel: connectionLabel(connection, String(row.provider)),
      connectionEmail: connection?.email ? String(connection.email) : null,
      externalCalendarId: row.external_calendar_id ? String(row.external_calendar_id) : null,
      externalCalendarName: row.external_calendar_name ? String(row.external_calendar_name) : TARGET_CALENDAR_NAME,
      enabled: Boolean(row.enabled),
      lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : null,
      lastError: row.last_error ? String(row.last_error) : null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    });
  }
  return targets;
}

async function enableCalendarSyncTarget({ calendarId, userId, provider, connectionId }) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  if (!PROVIDERS.has(normalizedProvider)) throw new Error('invalid_provider');

  const connection = await getProviderConnection({ provider: normalizedProvider, userId, connectionId });
  if (!connection) throw new Error('provider_connection_not_found');
  assertProviderScope(normalizedProvider, connection);

  const targetSeed = {
    provider: normalizedProvider,
    provider_user_id: Number(userId),
    provider_connection_id: Number(connectionId),
    external_calendar_id: null,
  };
  const externalCalendarId = await ensureProviderCalendar(targetSeed);

  const pool = getPool();
  const result = await pool.query(
    `
    INSERT INTO calendar_sync_targets (calendar_id, provider, provider_user_id, provider_connection_id, external_calendar_id, external_calendar_name, enabled, last_error, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, TRUE, NULL, NOW())
    ON CONFLICT (calendar_id, provider, provider_user_id, provider_connection_id) DO UPDATE SET
      external_calendar_id = EXCLUDED.external_calendar_id,
      external_calendar_name = EXCLUDED.external_calendar_name,
      enabled = TRUE,
      last_error = NULL,
      updated_at = NOW()
    RETURNING id;
    `,
    [calendarId, normalizedProvider, Number(userId), Number(connectionId), externalCalendarId, TARGET_CALENDAR_NAME]
  );

  await syncCalendarTargets({ calendarId, targetId: Number(result.rows[0].id) });
  return listCalendarSyncTargets({ calendarId });
}

async function deleteCalendarSyncTarget({ calendarId, targetId }) {
  const target = await getTargetById({ calendarId, targetId });
  if (!target) return { ok: false };

  try {
    const accessToken = await getProviderAccessToken(target);
    if (accessToken && target.external_calendar_id) {
      const pool = getPool();
      const mappings = await pool.query('SELECT external_event_id FROM calendar_sync_event_mappings WHERE target_id = $1;', [Number(target.id)]);
      for (const mapping of mappings.rows) {
        await deleteProviderEvent({ target, accessToken, externalEventId: String(mapping.external_event_id) }).catch(() => undefined);
      }
    }
  } catch (error) {
    console.warn('[calendar-sync] target cleanup failed', error?.message || error);
  }

  const pool = getPool();
  await pool.query('DELETE FROM calendar_sync_targets WHERE calendar_id = $1 AND id = $2;', [calendarId, Number(targetId)]);
  return { ok: true };
}

module.exports = {
  enableCalendarSyncTarget,
  deleteCalendarSyncTarget,
  listCalendarSyncTargets,
  syncCalendarTargets,
  triggerCalendarSync,
};
