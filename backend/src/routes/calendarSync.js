const express = require('express');

const { requireAuth, attachUserContext, requireAdmin } = require('../middleware/auth');
const {
  disableCalendarSyncFeed,
  enableCalendarSyncFeed,
  getCalendarIdForFeedToken,
  getCalendarSyncFeedStatus,
  regenerateCalendarSyncFeed,
  renderCalendarIcs,
} = require('../services/calendarSyncService');

const calendarSyncRouter = express.Router();

function requireCalendar(req, res) {
  const calendarId = Number(req.ctx?.calendarId);
  if (!Number.isFinite(calendarId) || calendarId <= 0) {
    res.status(400).json({ error: 'missing_calendar' });
    return null;
  }
  return calendarId;
}

calendarSyncRouter.get('/feed', requireAuth, attachUserContext, requireAdmin, async (req, res) => {
  const calendarId = requireCalendar(req, res);
  if (!calendarId) return;
  const status = await getCalendarSyncFeedStatus({ calendarId, req });
  res.json(status);
});

calendarSyncRouter.post('/feed', requireAuth, attachUserContext, requireAdmin, async (req, res) => {
  const calendarId = requireCalendar(req, res);
  if (!calendarId) return;
  const userId = Number(req.ctx?.userId ?? req.auth?.sub);
  const status = await enableCalendarSyncFeed({ calendarId, userId, req });
  res.status(201).json(status);
});

calendarSyncRouter.post('/feed/regenerate', requireAuth, attachUserContext, requireAdmin, async (req, res) => {
  const calendarId = requireCalendar(req, res);
  if (!calendarId) return;
  const userId = Number(req.ctx?.userId ?? req.auth?.sub);
  const status = await regenerateCalendarSyncFeed({ calendarId, userId, req });
  res.json(status);
});

calendarSyncRouter.delete('/feed', requireAuth, attachUserContext, requireAdmin, async (req, res) => {
  const calendarId = requireCalendar(req, res);
  if (!calendarId) return;
  const status = await disableCalendarSyncFeed({ calendarId });
  res.json(status);
});

calendarSyncRouter.get('/feeds/:token.ics', async (req, res) => {
  const token = String(req.params.token || '').trim();
  if (!token || token.length < 16) return res.status(404).type('text/plain').send('Not found');

  const calendarId = await getCalendarIdForFeedToken({ token });
  if (!calendarId) return res.status(404).type('text/plain').send('Not found');

  const body = await renderCalendarIcs({ calendarId });
  res.set({
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'inline; filename="dashbo.ics"',
    'Cache-Control': 'no-store, max-age=0',
  });
  res.send(body);
});

module.exports = { calendarSyncRouter };
