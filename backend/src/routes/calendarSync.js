const express = require('express');
const { z } = require('zod');

const { requireAuth, attachUserContext, requireAdmin } = require('../middleware/auth');
const {
  deleteCalendarSyncTarget,
  enableCalendarSyncTarget,
  listCalendarSyncTargets,
  syncCalendarTargets,
} = require('../services/calendarProviderSyncService');
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

calendarSyncRouter.get('/targets', requireAuth, attachUserContext, requireAdmin, async (req, res) => {
  const calendarId = requireCalendar(req, res);
  if (!calendarId) return;
  const targets = await listCalendarSyncTargets({ calendarId });
  res.json(targets);
});

calendarSyncRouter.post('/targets', requireAuth, attachUserContext, requireAdmin, async (req, res) => {
  const calendarId = requireCalendar(req, res);
  if (!calendarId) return;
  const schema = z.object({ provider: z.enum(['outlook', 'google']), connectionId: z.coerce.number().int().positive() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  try {
    const userId = Number(req.ctx?.userId ?? req.auth?.sub);
    const targets = await enableCalendarSyncTarget({ calendarId, userId, ...parsed.data });
    res.status(201).json(targets);
  } catch (error) {
    const message = String(error?.message || error);
    if (message.includes('not_found')) return res.status(404).json({ error: message });
    if (message.includes('scope_required') || message.includes('readwrite_required')) return res.status(409).json({ error: message });
    res.status(502).json({ error: message });
  }
});

calendarSyncRouter.post('/targets/:id/sync', requireAuth, attachUserContext, requireAdmin, async (req, res) => {
  const calendarId = requireCalendar(req, res);
  if (!calendarId) return;
  const targetId = Number(req.params.id);
  if (!Number.isFinite(targetId) || targetId <= 0) return res.status(400).json({ error: 'invalid_id' });
  const result = await syncCalendarTargets({ calendarId, targetId });
  res.json({ ok: true, result, targets: await listCalendarSyncTargets({ calendarId }) });
});

calendarSyncRouter.delete('/targets/:id', requireAuth, attachUserContext, requireAdmin, async (req, res) => {
  const calendarId = requireCalendar(req, res);
  if (!calendarId) return;
  const targetId = Number(req.params.id);
  if (!Number.isFinite(targetId) || targetId <= 0) return res.status(400).json({ error: 'invalid_id' });
  const result = await deleteCalendarSyncTarget({ calendarId, targetId });
  if (!result.ok) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, targets: await listCalendarSyncTargets({ calendarId }) });
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
