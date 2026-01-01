const SPOTIFY_ACCOUNTS_BASE = 'https://accounts.spotify.com';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

function isSpotifyConfigured() {
  return Boolean(
    String(process.env.SPOTIFY_CLIENT_ID || '').trim() &&
      String(process.env.SPOTIFY_CLIENT_SECRET || '').trim() &&
      String(process.env.SPOTIFY_REFRESH_TOKEN || '').trim()
  );
}

async function getSpotifyAccessToken() {
  const clientId = String(process.env.SPOTIFY_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.SPOTIFY_CLIENT_SECRET || '').trim();
  const refreshToken = String(process.env.SPOTIFY_REFRESH_TOKEN || '').trim();

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('spotify_not_configured');
  }

  const form = new URLSearchParams();
  form.set('grant_type', 'refresh_token');
  form.set('refresh_token', refreshToken);

  const res = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    // Spotify supports client_id/client_secret in body; avoids needing Basic auth.
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text ? `spotify_token_failed: ${text}` : `spotify_token_failed_${res.status}`);
  }

  const data = await res.json();
  const accessToken = typeof data?.access_token === 'string' ? data.access_token : '';
  if (!accessToken) throw new Error('spotify_token_missing');
  return accessToken;
}

function pickBestImage(images) {
  const arr = Array.isArray(images) ? images : [];
  if (arr.length === 0) return null;

  // Prefer largest image.
  const sorted = [...arr].sort((a, b) => {
    const aw = Number(a?.width) || 0;
    const bw = Number(b?.width) || 0;
    return bw - aw;
  });

  const url = sorted[0]?.url;
  return typeof url === 'string' && url.trim() ? url.trim() : null;
}

async function getSpotifyNowPlaying() {
  if (!isSpotifyConfigured()) {
    return { enabled: false, active: false, isPlaying: false, item: null, error: null };
  }

  const token = await getSpotifyAccessToken();

  const res = await fetch(`${SPOTIFY_API_BASE}/me/player/currently-playing`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (res.status === 204) {
    return { enabled: true, active: false, isPlaying: false, item: null, error: null };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text ? `spotify_now_playing_failed: ${text}` : `spotify_now_playing_failed_${res.status}`);
  }

  const data = await res.json();

  const isPlaying = Boolean(data?.is_playing);
  const item = data?.item;

  const title = typeof item?.name === 'string' ? item.name : null;
  const artistsArr = Array.isArray(item?.artists) ? item.artists : [];
  const artist = artistsArr.length
    ? artistsArr
        .map((a) => (typeof a?.name === 'string' ? a.name : ''))
        .filter(Boolean)
        .join(', ') || null
    : null;
  const album = typeof item?.album?.name === 'string' ? item.album.name : null;
  const imageUrl = pickBestImage(item?.album?.images);

  const deviceName = typeof data?.device?.name === 'string' ? data.device.name : null;
  const deviceType = typeof data?.device?.type === 'string' ? data.device.type : null;
  const progressMs = Number.isFinite(Number(data?.progress_ms)) ? Number(data.progress_ms) : null;

  const active = Boolean(isPlaying && (title || artist || album || imageUrl));

  return {
    enabled: true,
    active,
    isPlaying,
    item: {
      title,
      artist,
      album,
      imageUrl,
      source: 'Spotify',
      deviceName,
      deviceType,
      progressMs,
    },
    error: null,
  };
}

module.exports = {
  isSpotifyConfigured,
  getSpotifyNowPlaying,
};
