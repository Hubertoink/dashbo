const { getUserSetting } = require('./settingsService');

// Nager.Date returns DE public holidays with optional `counties` like ["DE-BW"].
// We filter by the derived federal state (Bundesland) if available.

function normalizeKey(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const STATE_NAME_TO_CODE = {
  'baden-wurttemberg': 'BW',
  'bayern': 'BY',
  'berlin': 'BE',
  'brandenburg': 'BB',
  'bremen': 'HB',
  'hamburg': 'HH',
  'hessen': 'HE',
  'mecklenburg-vorpommern': 'MV',
  'niedersachsen': 'NI',
  'nordrhein-westfalen': 'NW',
  'rheinland-pfalz': 'RP',
  'saarland': 'SL',
  'sachsen': 'SN',
  'sachsen-anhalt': 'ST',
  'schleswig-holstein': 'SH',
  'thuringen': 'TH',
  'thueringen': 'TH'
};

async function fetchJsonWithTimeout(url, { timeoutMs = 5000 } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) return { ok: false, status: resp.status, data: null };
    const data = await resp.json();
    return { ok: true, status: resp.status, data };
  } catch (err) {
    return { ok: false, status: null, data: null, error: err };
  } finally {
    clearTimeout(t);
  }
}

async function geocodeForGermanState(location, lang) {
  const q = String(location || '').trim();
  if (!q) return { city: null, stateName: null, stateCode: null };

  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', q);
  url.searchParams.set('count', '1');
  url.searchParams.set('language', lang || 'de');
  url.searchParams.set('format', 'json');

  const r = await fetchJsonWithTimeout(url, { timeoutMs: 4500 });
  if (!r.ok) return { city: null, stateName: null, stateCode: null };

  const json = r.data;
  const first = Array.isArray(json?.results) ? json.results[0] : null;
  if (!first) return { city: null, stateName: null, stateCode: null };

  const country = String(first.country_code || first.country || '').toUpperCase();
  const city = first.name ?? null;
  const stateName = first.admin1 ?? null;

  if (country !== 'DE') return { city, stateName: null, stateCode: null };

  const code = STATE_NAME_TO_CODE[normalizeKey(stateName)] ?? null;
  return { city, stateName, stateCode: code };
}

const yearCache = new Map();

async function fetchHolidaysForYear(year) {
  const y = Number(year);
  if (!Number.isFinite(y) || y < 1900 || y > 3000) return [];
  const key = String(y);
  if (yearCache.has(key)) return yearCache.get(key);

  const url = `https://date.nager.at/api/v3/PublicHolidays/${y}/DE`;
  const r = await fetchJsonWithTimeout(url, { timeoutMs: 6000 });
  if (!r.ok) {
    yearCache.set(key, []);
    return [];
  }

  const json = r.data;
  const list = Array.isArray(json) ? json : [];
  yearCache.set(key, list);
  return list;
}

function listYearsBetween(from, to) {
  const years = new Set();
  for (let y = from.getFullYear(); y <= to.getFullYear(); y++) years.add(y);
  return Array.from(years).sort((a, b) => a - b);
}

function inRange(dateStr, from, to) {
  // dateStr is YYYY-MM-DD (local date). Compare via Date objects at noon to avoid tz edge cases.
  const d = new Date(`${dateStr}T12:00:00`);
  return d >= from && d <= to;
}

function appliesToState(counties, stateCode) {
  if (!Array.isArray(counties) || counties.length === 0) return true; // nationwide
  if (!stateCode) return false;
  const needle = `DE-${stateCode}`;
  return counties.includes(needle);
}

async function getHolidays({ userId, from, to }) {
  const holidaysEnabledRaw = await getUserSetting({ userId, key: 'holidays.enabled' });
  const enabled = String(holidaysEnabledRaw ?? '').toLowerCase() === 'true';

  const weatherLocation = (await getUserSetting({ userId, key: 'weather.location' })) ?? '';
  const lang = process.env.OWM_LANG || 'de';

  if (!enabled) {
    return {
      ok: true,
      enabled: false,
      location: String(weatherLocation || '').trim() || null,
      stateName: null,
      stateCode: null,
      holidays: []
    };
  }

  const locationTrimmed = String(weatherLocation || '').trim();
  const geo = await geocodeForGermanState(locationTrimmed, lang);

  const years = listYearsBetween(from, to);
  const out = [];

  for (const y of years) {
    const list = await fetchHolidaysForYear(y);
    for (const h of list) {
      const date = typeof h?.date === 'string' ? h.date : null;
      if (!date) continue;
      if (!inRange(date, from, to)) continue;
      if (!appliesToState(h?.counties, geo.stateCode)) continue;

      out.push({
        date,
        title: (h?.localName ?? h?.name ?? 'Feiertag')
      });
    }
  }

  out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

  return {
    ok: true,
    enabled: true,
    location: geo.city ?? (locationTrimmed || null),
    stateName: geo.stateName,
    stateCode: geo.stateCode,
    holidays: out
  };
}

module.exports = { getHolidays };
