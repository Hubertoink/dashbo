const crypto = require('crypto');

const { getPool } = require('../db');

function getGoogleConfig({ allowMissing = false } = {}) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const scopes = (process.env.GOOGLE_SCOPES || 'openid email profile https://www.googleapis.com/auth/calendar').trim();

  if (!clientId || !clientSecret || !redirectUri) {
    if (allowMissing) return null;
    throw new Error('Google OAuth not configured (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REDIRECT_URI)');
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes,
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
  };
}

function addSeconds(date, seconds) {
  return new Date(date.getTime() + seconds * 1000);
}

async function createGoogleAuthUrl({ userId }) {
  const cfg = getGoogleConfig();
  const pool = getPool();
  const state = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await pool.query(
    `
    INSERT INTO google_oauth_states (state, user_id, expires_at)
    VALUES ($1, $2, $3);
    `,
    [state, userId, expiresAt.toISOString()]
  );

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'code',
    redirect_uri: cfg.redirectUri,
    scope: cfg.scopes,
    state,
    access_type: 'offline',
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
  });

  return `${cfg.authorizeUrl}?${params.toString()}`;
}

async function exchangeCodeForToken({ code }) {
  const cfg = getGoogleConfig();
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'authorization_code',
    code: String(code),
    redirect_uri: cfg.redirectUri,
  });

  const resp = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = json?.error_description || json?.error || `google_token_exchange_failed (${resp.status})`;
    throw new Error(String(msg));
  }
  return json;
}

async function refreshToken({ refreshToken }) {
  const cfg = getGoogleConfig();
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: String(refreshToken),
  });

  const resp = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = json?.error_description || json?.error || `google_refresh_failed (${resp.status})`;
    throw new Error(String(msg));
  }
  return json;
}

async function fetchGoogleMe({ accessToken }) {
  const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = json?.error_description || json?.error || `google_userinfo_failed (${resp.status})`;
    throw new Error(String(msg));
  }

  const googleUserId = json?.sub ? String(json.sub) : null;
  const email = json?.email ? String(json.email) : null;
  const displayName = json?.name ? String(json.name) : null;
  if (!googleUserId) throw new Error('google_userinfo_missing_sub');
  return { googleUserId, email, displayName };
}

async function completeGoogleCallback({ code, state }) {
  const pool = getPool();
  const stateRow = await pool.query(
    `
    SELECT user_id, expires_at
    FROM google_oauth_states
    WHERE state = $1;
    `,
    [String(state)]
  );

  if (stateRow.rowCount === 0) throw new Error('invalid_state');

  const userId = Number(stateRow.rows[0].user_id);
  const expiresAt = new Date(stateRow.rows[0].expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    await pool.query('DELETE FROM google_oauth_states WHERE state = $1;', [String(state)]);
    throw new Error('state_expired');
  }

  const token = await exchangeCodeForToken({ code });
  const accessToken = String(token.access_token || '');
  const refreshTokenValue = token.refresh_token ? String(token.refresh_token) : null;
  const scope = token.scope ? String(token.scope) : null;
  const expiresIn = Number(token.expires_in || 0);
  if (!accessToken) throw new Error('missing_access_token');

  const me = await fetchGoogleMe({ accessToken });
  const expiresAtIso = expiresIn > 0 ? addSeconds(new Date(), Math.max(0, expiresIn - 60)).toISOString() : null;

  await pool.query(
    `
    INSERT INTO google_connections (user_id, google_user_id, email, display_name, access_token, refresh_token, scope, expires_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (user_id, google_user_id) DO UPDATE SET
      email = COALESCE(EXCLUDED.email, google_connections.email),
      display_name = COALESCE(EXCLUDED.display_name, google_connections.display_name),
      access_token = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, google_connections.refresh_token),
      scope = EXCLUDED.scope,
      expires_at = EXCLUDED.expires_at,
      updated_at = NOW();
    `,
    [userId, me.googleUserId, me.email, me.displayName, accessToken, refreshTokenValue, scope, expiresAtIso]
  );

  await pool.query('DELETE FROM google_oauth_states WHERE state = $1;', [String(state)]);
  return { userId };
}

async function getGoogleStatus({ userId }) {
  const pool = getPool();
  const result = await pool.query(
    'SELECT COUNT(*)::int AS cnt, MAX(expires_at) AS expires_at, MAX(scope) AS scope FROM google_connections WHERE user_id = $1;',
    [userId]
  );
  const count = Number(result.rows?.[0]?.cnt || 0);
  return {
    connected: count > 0,
    expiresAt: result.rows?.[0]?.expires_at ? new Date(result.rows[0].expires_at).toISOString() : null,
    scope: result.rows?.[0]?.scope ? String(result.rows[0].scope) : null,
  };
}

async function listGoogleConnections({ userId }) {
  const pool = getPool();
  const result = await pool.query(
    `
    SELECT id, email, display_name, expires_at, scope
    FROM google_connections
    WHERE user_id = $1
    ORDER BY id ASC;
    `,
    [userId]
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    email: row.email ? String(row.email) : null,
    displayName: row.display_name ? String(row.display_name) : null,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    scope: row.scope ? String(row.scope) : null,
  }));
}

async function disconnectGoogleConnection({ userId, connectionId }) {
  const pool = getPool();
  await pool.query("DELETE FROM calendar_sync_targets WHERE provider = 'google' AND provider_user_id = $1 AND provider_connection_id = $2;", [userId, Number(connectionId)]);
  const result = await pool.query('DELETE FROM google_connections WHERE user_id = $1 AND id = $2;', [userId, Number(connectionId)]);
  return { ok: result.rowCount > 0 };
}

async function getValidGoogleAccessTokenForConnection({ userId, connectionId }) {
  const cfg = getGoogleConfig({ allowMissing: true });
  if (!cfg) return null;

  const pool = getPool();
  const result = await pool.query(
    'SELECT access_token, refresh_token, expires_at FROM google_connections WHERE user_id = $1 AND id = $2;',
    [userId, Number(connectionId)]
  );
  if (result.rowCount === 0) return null;

  const row = result.rows[0];
  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  const needsRefresh = !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now() + 60_000;
  if (!needsRefresh) return String(row.access_token);
  if (!row.refresh_token) return String(row.access_token || '');

  const refreshed = await refreshToken({ refreshToken: row.refresh_token });
  const accessToken = String(refreshed.access_token || '');
  const refreshTokenValue = refreshed.refresh_token ? String(refreshed.refresh_token) : null;
  const expiresIn = Number(refreshed.expires_in || 0);
  const expiresAtIso = expiresIn > 0 ? addSeconds(new Date(), Math.max(0, expiresIn - 60)).toISOString() : null;

  if (!accessToken) throw new Error('google_refresh_missing_access_token');

  await pool.query(
    `
    UPDATE google_connections
    SET access_token = $3,
        refresh_token = COALESCE($4, refresh_token),
        expires_at = $5,
        updated_at = NOW()
    WHERE user_id = $1 AND id = $2;
    `,
    [userId, Number(connectionId), accessToken, refreshTokenValue, expiresAtIso]
  );

  return accessToken;
}

module.exports = {
  createGoogleAuthUrl,
  completeGoogleCallback,
  getGoogleStatus,
  listGoogleConnections,
  disconnectGoogleConnection,
  getGoogleConfig,
  getValidGoogleAccessTokenForConnection,
};
