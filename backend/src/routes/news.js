const express = require('express');

const { requireAuth } = require('../middleware/auth');
const { getUserSetting } = require('../services/settingsService');
const { fetchZeitRss } = require('../services/newsService');

const newsRouter = express.Router();

newsRouter.get('/', requireAuth, async (req, res) => {
  const userId = Number(req.auth?.sub);

  const enabledRaw = await getUserSetting({ userId, key: 'news.enabled' });
  const enabled = String(enabledRaw ?? '').toLowerCase() === 'true';

  if (!enabled) {
    return res.json({ enabled: false, source: 'zeit', items: [] });
  }

  try {
    const r = await fetchZeitRss({ limit: 4 });
    return res.json({ enabled: true, ...r });
  } catch (e) {
    console.error('[news] fetch failed', e);
    return res.json({ enabled: true, source: 'zeit', items: [], error: 'news_fetch_failed' });
  }
});

module.exports = { newsRouter };
