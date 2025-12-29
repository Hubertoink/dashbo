const Parser = require('rss-parser');

const DEFAULT_ZEIT_RSS_URL = 'https://newsfeed.zeit.de/index';
const DEFAULT_GUARDIAN_RSS_URL = 'https://www.theguardian.com/international/rss';
const DEFAULT_NEWYORKER_RSS_URL = 'https://www.newyorker.com/feed/rss';
const DEFAULT_SZ_RSS_URL = 'https://rss.sueddeutsche.de/rss/Topthemen';

const CACHE_TTL_MS = 10 * 60 * 1000;

/** @type {Map<string, { at: number, value: any }>} */
const cache = new Map();

function getCached(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function setCached(key, value) {
  cache.set(key, { at: Date.now(), value });
}

function toIso(dateValue) {
  if (!dateValue) return null;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function stripHtml(input) {
  const s = typeof input === 'string' ? input : '';
  return s
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstTextSnippet(item) {
  const candidates = [
    item?.contentSnippet,
    item?.summary,
    item?.content,
    item?.['content:encoded'],
    item?.['description'],
  ];
  for (const c of candidates) {
    const t = stripHtml(c);
    if (t && !/^none$/i.test(t)) return t;
  }
  return null;
}

function firstImageUrl(item) {
  const candidates = [
    item?.enclosure?.url,
    item?.image?.url,
    item?.image,
    item?.itunes?.image,
    item?.['media:thumbnail']?.url,
    item?.['media:content']?.url,
    item?.['media:content'],
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
    if (c && typeof c === 'object' && typeof c.url === 'string' && c.url.trim()) return c.url.trim();
  }

  // last resort: scan html for <img src="...">
  const html = typeof item?.content === 'string' ? item.content : typeof item?.['content:encoded'] === 'string' ? item['content:encoded'] : '';
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m && typeof m[1] === 'string' && m[1].trim()) return m[1].trim();
  return null;
}

function isNoiseItem(source, title) {
  const s = String(source || '').toLowerCase();
  const t = String(title || '').trim();
  if (!t) return false;

  // New Yorker feed often contains non-article entries (e.g. crosswords/puzzles).
  if (s === 'newyorker') {
    return /(crossword|cryptic|puzzle)/i.test(t);
  }

  return false;
}

function rankScore(it) {
  const hasImage = Boolean(it?.imageUrl);
  const hasTeaser = Boolean(it?.teaser);
  const titleLen = typeof it?.title === 'string' ? it.title.length : 0;
  return (hasImage ? 100 : 0) + (hasTeaser ? 15 : 0) + (titleLen >= 60 ? 2 : 0);
}

async function fetchZeitRss({ limit = 4 } = {}) {
  return fetchRss({ source: 'zeit', url: DEFAULT_ZEIT_RSS_URL, limit });
}

async function fetchRss({ source, url, limit = 4 } = {}) {
  const safeSource = String(source || '').trim().toLowerCase() || 'rss';
  const cacheKey = `${safeSource}:${url}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const parser = new Parser({
    headers: {
      'User-Agent': 'DashbO/1.0 (+https://github.com/)'
    }
  });

  const feed = await parser.parseURL(String(url));
  const items = Array.isArray(feed?.items) ? feed.items : [];

  const all = items
    .map((it) => {
      const title = typeof it?.title === 'string' ? it.title.trim() : '';
      const link = typeof it?.link === 'string' ? it.link.trim() : '';
      const publishedAt = toIso(it?.isoDate || it?.pubDate);
      const teaser = firstTextSnippet(it);
      const imageUrl = firstImageUrl(it);
      if (!title || !link) return null;
      if (isNoiseItem(safeSource, title) && !imageUrl) return null;
      return { source: safeSource, title, url: link, publishedAt, teaser, imageUrl };
    })
    .filter(Boolean);

  const max = Math.max(1, Math.min(20, Number(limit) || 4));
  const sorted = [...all].sort((a, b) => {
    const sa = rankScore(a);
    const sb = rankScore(b);
    if (sb !== sa) return sb - sa;
    const at = a?.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const bt = b?.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return bt - at;
  });
  const normalized = sorted.slice(0, max);

  const out = { source: safeSource, items: normalized };
  setCached(cacheKey, out);
  return out;
}

const FEEDS = {
  zeit: { url: DEFAULT_ZEIT_RSS_URL },
  guardian: { url: DEFAULT_GUARDIAN_RSS_URL },
  newyorker: { url: DEFAULT_NEWYORKER_RSS_URL },
  sz: { url: DEFAULT_SZ_RSS_URL },
};

async function fetchNewsFeeds({ feeds, limit = 4 } = {}) {
  const wanted = Array.isArray(feeds) ? feeds : [];
  const normalized = wanted
    .map((v) => String(v || '').trim().toLowerCase())
    .filter((v) => v in FEEDS);
  const unique = Array.from(new Set(normalized));
  const effective = unique.length ? unique : ['zeit'];

  const perFeedLimit = Math.max(4, Math.min(20, Number(limit) || 4));
  const results = await Promise.all(
    effective.map((id) => fetchRss({ source: id, url: FEEDS[id].url, limit: perFeedLimit }).catch(() => ({ source: id, items: [] })))
  );

  const seen = new Set();
  const merged = [];
  for (const r of results) {
    const items = Array.isArray(r?.items) ? r.items : [];
    for (const it of items) {
      const u = it?.url ? String(it.url) : '';
      if (!u || seen.has(u)) continue;
      seen.add(u);
      merged.push(it);
    }
  }

  merged.sort((a, b) => {
    const at = a?.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const bt = b?.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return bt - at;
  });

  const max = Math.max(1, Math.min(20, Number(limit) || 4));
  const source = effective.length === 1 ? effective[0] : 'mixed';
  return { source, items: merged.slice(0, max) };
}

module.exports = {
  fetchZeitRss,
  fetchNewsFeeds,
  DEFAULT_ZEIT_RSS_URL,
  DEFAULT_GUARDIAN_RSS_URL,
  DEFAULT_NEWYORKER_RSS_URL,
  DEFAULT_SZ_RSS_URL,
};
