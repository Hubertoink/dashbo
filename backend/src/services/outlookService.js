const crypto = require('crypto');

const { getPool } = require('../db');

function getOutlookConfig({ allowMissing = false } = {}) {
  const tenant = process.env.OUTLOOK_TENANT || 'consumers'; // private Outlook accounts
  const clientId = process.env.OUTLOOK_CLIENT_ID;
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;
  const redirectUri = process.env.OUTLOOK_REDIRECT_URI;
  const scopes = (process.env.OUTLOOK_SCOPES || 'offline_access Calendars.Read User.Read').trim();

  if (!clientId || !clientSecret || !redirectUri) {
    if (allowMissing) return null;
    throw new Error('Outlook OAuth not configured (OUTLOOK_CLIENT_ID/OUTLOOK_CLIENT_SECRET/OUTLOOK_REDIRECT_URI)');
  }

  const authority = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;
  return {
    tenant,
    clientId,
    clientSecret,
    redirectUri,
    scopes,
    authorizeUrl: `${authority}/authorize`,
    tokenUrl: `${authority}/token`,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function addSeconds(date, seconds) {
  return new Date(date.getTime() + seconds * 1000);
}

async function createOutlookAuthUrl({ userId }) {
  const cfg = getOutlookConfig();
  const pool = getPool();

  const state = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await pool.query(
    `
    INSERT INTO outlook_oauth_states (state, user_id, expires_at)
    VALUES ($1, $2, $3);
    `,
    [state, userId, expiresAt.toISOString()]
  );

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'code',
    redirect_uri: cfg.redirectUri,
    response_mode: 'query',
    scope: cfg.scopes,
    state,
    prompt: 'select_account',
  });

  return `${cfg.authorizeUrl}?${params.toString()}`;
}

async function exchangeCodeForToken({ code }) {
  const cfg = getOutlookConfig();

  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'authorization_code',
    code: String(code),
    redirect_uri: cfg.redirectUri,
    scope: cfg.scopes,
  });

  const resp = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = json?.error_description || json?.error || `token_exchange_failed (${resp.status})`;
    throw new Error(String(msg));
  }

  return json;
}

async function refreshToken({ refreshToken }) {
  const cfg = getOutlookConfig();

  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: String(refreshToken),
    redirect_uri: cfg.redirectUri,
    scope: cfg.scopes,
  });

  const resp = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = json?.error_description || json?.error || `refresh_failed (${resp.status})`;
    throw new Error(String(msg));
  }

  return json;
}

async function completeOutlookCallback({ code, state }) {
  const pool = getPool();

  const stateRow = await pool.query(
    `
    SELECT user_id, expires_at
    FROM outlook_oauth_states
    WHERE state = $1;
    `,
    [String(state)]
  );

  if (stateRow.rowCount === 0) {
    throw new Error('invalid_state');
  }

  const userId = Number(stateRow.rows[0].user_id);
  const expiresAt = new Date(stateRow.rows[0].expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    await pool.query('DELETE FROM outlook_oauth_states WHERE state = $1;', [String(state)]);
    throw new Error('state_expired');
  }

  const token = await exchangeCodeForToken({ code });

  const accessToken = String(token.access_token || '');
  const refreshTokenValue = token.refresh_token ? String(token.refresh_token) : null;
  const scope = token.scope ? String(token.scope) : null;
  const expiresIn = Number(token.expires_in || 0);

  if (!accessToken) throw new Error('missing_access_token');

  const expiresAtIso = expiresIn > 0 ? addSeconds(new Date(), Math.max(0, expiresIn - 60)).toISOString() : null;

  await pool.query(
    `
    INSERT INTO outlook_tokens (user_id, access_token, refresh_token, scope, expires_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, outlook_tokens.refresh_token),
      scope = EXCLUDED.scope,
      expires_at = EXCLUDED.expires_at,
      updated_at = NOW();
    `,
    [userId, accessToken, refreshTokenValue, scope, expiresAtIso]
  );

  await pool.query('DELETE FROM outlook_oauth_states WHERE state = $1;', [String(state)]);

  return { userId };
}

async function getOutlookStatus({ userId }) {
  const pool = getPool();
  const r = await pool.query('SELECT expires_at, scope FROM outlook_tokens WHERE user_id = $1;', [userId]);
  if (r.rowCount === 0) return { connected: false, expiresAt: null, scope: null };

  const expiresAt = r.rows[0].expires_at ? new Date(r.rows[0].expires_at).toISOString() : null;
  const scope = r.rows[0].scope ? String(r.rows[0].scope) : null;
  return { connected: true, expiresAt, scope };
}

async function disconnectOutlook({ userId }) {
  const pool = getPool();
  await pool.query('DELETE FROM outlook_tokens WHERE user_id = $1;', [userId]);
  return { ok: true };
}

async function getValidAccessToken({ userId }) {
  const cfg = getOutlookConfig({ allowMissing: true });
  if (!cfg) return null;

  const pool = getPool();
  const r = await pool.query('SELECT access_token, refresh_token, expires_at FROM outlook_tokens WHERE user_id = $1;', [userId]);
  if (r.rowCount === 0) return null;

  const row = r.rows[0];
  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  const needsRefresh = !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now() + 60_000;

  if (!needsRefresh) return String(row.access_token);

  if (!row.refresh_token) {
    return String(row.access_token || '');
  }

  const refreshed = await refreshToken({ refreshToken: row.refresh_token });
  const accessToken = String(refreshed.access_token || '');
  const refreshTokenValue = refreshed.refresh_token ? String(refreshed.refresh_token) : null;
  const expiresIn = Number(refreshed.expires_in || 0);
  const expiresAtIso = expiresIn > 0 ? addSeconds(new Date(), Math.max(0, expiresIn - 60)).toISOString() : null;

  if (!accessToken) throw new Error('refresh_missing_access_token');

  await pool.query(
    `
    UPDATE outlook_tokens
    SET access_token = $2,
        refresh_token = COALESCE($3, refresh_token),
        expires_at = $4,
        updated_at = NOW()
    WHERE user_id = $1;
    `,
    [userId, accessToken, refreshTokenValue, expiresAtIso]
  );

  return accessToken;
}

function parseGraphDateTime(dt) {
  if (!dt) return null;
  const dateTime = dt.dateTime ? String(dt.dateTime) : null;
  const timeZone = dt.timeZone ? String(dt.timeZone) : null;
  if (!dateTime) return null;

  // If Graph returns a naive datetime (no offset), Prefer header should make it UTC.
  if (/Z$|[+-]\d\d:\d\d$/.test(dateTime)) {
    const d = new Date(dateTime);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  if (timeZone && timeZone.toUpperCase() === 'UTC') {
    const d = new Date(`${dateTime}Z`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const d = new Date(dateTime);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function listOutlookEventsBetween({ userId, from, to }) {
  const cfg = getOutlookConfig({ allowMissing: true });
  if (!cfg) return [];

  const accessToken = await getValidAccessToken({ userId });
  if (!accessToken) return [];

  const startIso = new Date(from).toISOString();
  const endIso = new Date(to).toISOString();

  const params = new URLSearchParams({
    startDateTime: startIso,
    endDateTime: endIso,
    $top: '200',
    $orderby: 'start/dateTime',
    $select: 'id,subject,bodyPreview,location,start,end,isAllDay',
  });

  let url = `https://graph.microsoft.com/v1.0/me/calendarView?${params.toString()}`;
  const out = [];

  while (url) {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.timezone="UTC"',
      },
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      // Token revoked/expired etc. -> treat as disconnected for listing.
      console.warn('[dashbo-backend] outlook calendarView failed', resp.status, json?.error?.code || json?.error);
      return [];
    }

    const items = Array.isArray(json.value) ? json.value : [];
    for (const it of items) {
      const startAt = parseGraphDateTime(it.start);
      if (!startAt) continue;

      const endAt = parseGraphDateTime(it.end);
      const externalId = it.id ? String(it.id) : null;
      const title = it.subject ? String(it.subject) : 'Outlook Termin';
      const description = it.bodyPreview ? String(it.bodyPreview) : null;
      const location = it.location?.displayName ? String(it.location.displayName) : null;
      const allDay = Boolean(it.isAllDay);

      const occurrenceId = `outlook:${externalId || 'unknown'}:${startAt}`;
      out.push({
        id: 0,
        occurrenceId,
        source: 'outlook',
        externalId,
        title,
        description,
        location,
        startAt,
        endAt,
        allDay,
        tag: null,
        person: null,
        recurrence: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    }

    url = json['@odata.nextLink'] ? String(json['@odata.nextLink']) : '';
  }

  out.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  return out;
}

module.exports = {
  createOutlookAuthUrl,
  completeOutlookCallback,
  getOutlookStatus,
  disconnectOutlook,
  listOutlookEventsBetween,
  getOutlookConfig,
};
