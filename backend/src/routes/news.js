const express = require('express');

const { requireAuth } = require('../middleware/auth');
const { getUserSetting } = require('../services/settingsService');
const { fetchNewsFeeds } = require('../services/newsService');

const newsRouter = express.Router();

newsRouter.get('/', requireAuth, async (req, res) => {
  const userId = Number(req.auth?.sub);

  const enabledRaw = await getUserSetting({ userId, key: 'news.enabled' });
  const enabled = String(enabledRaw ?? '').toLowerCase() === 'true';

  if (!enabled) {
    return res.json({ enabled: false, source: 'zeit', items: [] });
  }

  let feeds = null;
  try {
    const raw = await getUserSetting({ userId, key: 'news.feeds' });
    if (raw && String(raw).trim()) {
      const parsed = JSON.parse(String(raw));
      if (Array.isArray(parsed)) feeds = parsed;
    }
  } catch {
    // ignore
  }

  try {
    const r = await fetchNewsFeeds({ feeds, limit: 12 });
    return res.json({ enabled: true, ...r });
  } catch (e) {
    console.error('[news] fetch failed', e);
    return res.json({ enabled: true, source: 'zeit', items: [], error: 'news_fetch_failed' });
  }
});

module.exports = { newsRouter };
