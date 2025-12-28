const Parser = require('rss-parser');

const DEFAULT_ZEIT_RSS_URL = 'https://newsfeed.zeit.de/index';

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
    if (t) return t;
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

async function fetchZeitRss({ limit = 4 } = {}) {
  const url = DEFAULT_ZEIT_RSS_URL;
  const cacheKey = `zeit:${url}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const parser = new Parser({
    headers: {
      'User-Agent': 'DashbO/1.0 (+https://github.com/)'
    }
  });

  const feed = await parser.parseURL(url);
  const items = Array.isArray(feed?.items) ? feed.items : [];

  const normalized = items
    .map((it) => {
      const title = typeof it?.title === 'string' ? it.title.trim() : '';
      const link = typeof it?.link === 'string' ? it.link.trim() : '';
      const publishedAt = toIso(it?.isoDate || it?.pubDate);
      const teaser = firstTextSnippet(it);
      const imageUrl = firstImageUrl(it);
      return title && link ? { title, url: link, publishedAt, teaser, imageUrl } : null;
    })
    .filter(Boolean)
    .slice(0, Math.max(1, Math.min(20, Number(limit) || 4)));

  const out = { source: 'zeit', items: normalized };
  setCached(cacheKey, out);
  return out;
}

module.exports = { fetchZeitRss, DEFAULT_ZEIT_RSS_URL };
