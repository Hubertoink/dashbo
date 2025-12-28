const { getUserSetting } = require('./settingsService');

let cached = null;

function safeNumber(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function geocode({ apiKey, q }) {
  const url = new URL('https://api.openweathermap.org/geo/1.0/direct');
  url.searchParams.set('appid', apiKey);
  url.searchParams.set('q', q);
  url.searchParams.set('limit', '1');

  const resp = await fetch(url);
  if (!resp.ok) return null;
  const json = await resp.json();
  const first = Array.isArray(json) ? json[0] : null;
  if (!first) return null;
  if (typeof first.lat !== 'number' || typeof first.lon !== 'number') return null;
  return {
    lat: first.lat,
    lon: first.lon,
    name: first.name ?? null,
    country: first.country ?? null,
  };
}

async function geocodeOpenMeteo({ q, lang }) {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', q);
  url.searchParams.set('count', '1');
  url.searchParams.set('language', lang || 'de');
  url.searchParams.set('format', 'json');

  const resp = await fetch(url);
  if (!resp.ok) return null;
  const json = await resp.json();
  const first = Array.isArray(json?.results) ? json.results[0] : null;
  if (!first) return null;
  if (typeof first.latitude !== 'number' || typeof first.longitude !== 'number') return null;
  return {
    lat: first.latitude,
    lon: first.longitude,
    name: first.name ?? null,
    country: first.country_code ?? first.country ?? null
  };
}

function weatherCodeToGerman(code) {
  const c = typeof code === 'number' ? code : null;
  if (c == null) return null;

  // https://open-meteo.com/en/docs#weathervariables
  const table = {
    0: 'klar',
    1: 'überwiegend klar',
    2: 'teilweise bewölkt',
    3: 'bewölkt',
    45: 'Nebel',
    48: 'Reifnebel',
    51: 'leichter Nieselregen',
    53: 'mäßiger Nieselregen',
    55: 'starker Nieselregen',
    56: 'leichter gefrierender Nieselregen',
    57: 'starker gefrierender Nieselregen',
    61: 'leichter Regen',
    63: 'mäßiger Regen',
    65: 'starker Regen',
    66: 'leichter gefrierender Regen',
    67: 'starker gefrierender Regen',
    71: 'leichter Schneefall',
    73: 'mäßiger Schneefall',
    75: 'starker Schneefall',
    77: 'Schneekörner',
    80: 'leichte Regenschauer',
    81: 'Regenschauer',
    82: 'starke Regenschauer',
    85: 'leichte Schneeschauer',
    86: 'starke Schneeschauer',
    95: 'Gewitter',
    96: 'Gewitter mit Hagel',
    99: 'starkes Gewitter mit Hagel'
  };

  return table[c] ?? null;
}

async function getWeather({ userId }) {
  const apiKey = process.env.OWM_API_KEY;
  const envLat = process.env.OWM_LAT;
  const envLon = process.env.OWM_LON;
  const units = process.env.OWM_UNITS || 'metric';
  const lang = process.env.OWM_LANG || 'de';

  const weatherLocation = (await getUserSetting({ userId, key: 'weather.location' })) ?? '';

  let lat = safeNumber(envLat);
  let lon = safeNumber(envLon);
  let cityHint = null;

  const locationTrimmed = weatherLocation.trim();

  // Resolve location to lat/lon if missing
  if ((lat == null || lon == null) && locationTrimmed) {
    if (apiKey) {
      const geo = await geocode({ apiKey, q: locationTrimmed });
      if (geo) {
        lat = geo.lat;
        lon = geo.lon;
        cityHint = geo.name;
      }
    } else {
      const geo = await geocodeOpenMeteo({ q: locationTrimmed, lang });
      if (geo) {
        lat = geo.lat;
        lon = geo.lon;
        cityHint = geo.name;
      }
    }
  }

  const cacheSig = JSON.stringify({
    provider: apiKey ? 'openweather' : 'openmeteo',
    units,
    lang,
    lat,
    lon,
    location: locationTrimmed
  });

  // Cache to avoid hammering the APIs (but invalidate immediately if config changes)
  const now = Date.now();
  if (cached && cached.sig === cacheSig) {
    const ttl = cached.value?.ok ? 10 * 60 * 1000 : 60 * 1000;
    if (now - cached.cachedAt < ttl) return cached.value;
  }

  if (lat == null || lon == null) {
    const value = {
      ok: false,
      error: 'weather_not_configured',
      fetchedAt: new Date().toISOString(),
    };
    cached = { cachedAt: now, sig: cacheSig, value };
    return value;
  }

  if (apiKey) {
    const url = new URL('https://api.openweathermap.org/data/2.5/weather');
    url.searchParams.set('appid', apiKey);
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lon));
    url.searchParams.set('units', units);
    url.searchParams.set('lang', lang);

    const resp = await fetch(url);
    if (!resp.ok) {
      const value = {
        ok: false,
        error: 'weather_fetch_failed',
        status: resp.status,
        fetchedAt: new Date().toISOString(),
      };
      cached = { cachedAt: now, sig: cacheSig, value };
      return value;
    }

    const json = await resp.json();
    const weather = Array.isArray(json.weather) ? json.weather[0] : null;

    const value = {
      ok: true,
      temp: json?.main?.temp ?? null,
      description: weather?.description ?? null,
      icon: weather?.icon ?? null,
      city: json?.name ?? cityHint ?? (locationTrimmed || null),
      fetchedAt: new Date().toISOString(),
    };

    cached = { cachedAt: now, sig: cacheSig, value };
    return value;
  }

  // Fallback: Open-Meteo (no API key required)
  // Use current temperature and weather code
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('current', 'temperature_2m,weather_code');
  url.searchParams.set('timezone', 'auto');

  const resp = await fetch(url);
  if (!resp.ok) {
    const value = {
      ok: false,
      error: 'weather_fetch_failed',
      status: resp.status,
      fetchedAt: new Date().toISOString(),
    };
    cached = { cachedAt: now, sig: cacheSig, value };
    return value;
  }

  const json = await resp.json();
  const temp = json?.current?.temperature_2m ?? null;
  const code = json?.current?.weather_code ?? null;
  const desc = weatherCodeToGerman(typeof code === 'number' ? code : null);

  const value = {
    ok: true,
    temp: typeof temp === 'number' ? temp : null,
    description: desc ?? 'Wetter',
    icon: null,
    city: cityHint ?? (locationTrimmed || null),
    fetchedAt: new Date().toISOString(),
  };

  cached = { cachedAt: now, sig: cacheSig, value };
  return value;
}

// ───────────────────────────────────────────────────────────────
// 5-day forecast (Open-Meteo daily – no API key required)
// ───────────────────────────────────────────────────────────────
let forecastCached = null;

async function getForecast({ userId }) {
  const lang = process.env.OWM_LANG || 'de';
  const weatherLocation = (await getUserSetting({ userId, key: 'weather.location' })) ?? '';
  const locationTrimmed = weatherLocation.trim();

  let lat = safeNumber(process.env.OWM_LAT);
  let lon = safeNumber(process.env.OWM_LON);
  let cityHint = null;

  if ((lat == null || lon == null) && locationTrimmed) {
    const geo = await geocodeOpenMeteo({ q: locationTrimmed, lang });
    if (geo) {
      lat = geo.lat;
      lon = geo.lon;
      cityHint = geo.name;
    }
  }

  const cacheSig = JSON.stringify({ lat, lon, location: locationTrimmed });
  const now = Date.now();

  if (forecastCached && forecastCached.sig === cacheSig) {
    const ttl = forecastCached.value?.ok ? 30 * 60 * 1000 : 60 * 1000;
    if (now - forecastCached.cachedAt < ttl) return forecastCached.value;
  }

  if (lat == null || lon == null) {
    const value = { ok: false, error: 'weather_not_configured', fetchedAt: new Date().toISOString() };
    forecastCached = { cachedAt: now, sig: cacheSig, value };
    return value;
  }

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '5');

  const resp = await fetch(url);
  if (!resp.ok) {
    const value = { ok: false, error: 'forecast_fetch_failed', status: resp.status, fetchedAt: new Date().toISOString() };
    forecastCached = { cachedAt: now, sig: cacheSig, value };
    return value;
  }

  const json = await resp.json();
  const daily = json?.daily ?? {};
  const dates = daily.time ?? [];
  const codes = daily.weather_code ?? [];
  const maxs = daily.temperature_2m_max ?? [];
  const mins = daily.temperature_2m_min ?? [];

  const days = [];
  for (let i = 0; i < dates.length && i < 5; i++) {
    days.push({
      date: dates[i],
      tempMax: maxs[i] ?? null,
      tempMin: mins[i] ?? null,
      code: codes[i] ?? null,
      description: weatherCodeToGerman(codes[i])
    });
  }

  const value = { ok: true, city: cityHint ?? (locationTrimmed || null), days, fetchedAt: new Date().toISOString() };
  forecastCached = { cachedAt: now, sig: cacheSig, value };
  return value;
}

module.exports = { getWeather, getForecast };
