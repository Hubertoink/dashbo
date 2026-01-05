const express = require('express');
const { z } = require('zod');

const { requireAuth, attachUserContext } = require('../middleware/auth');
const {
  listScribbles,
  createScribble,
  deleteScribble,
  pinScribble,
  MAX_SCRIBBLES_PER_USER,
} = require('../services/scribblesService');

const scribblesRouter = express.Router();

// GET /scribbles - List all scribbles for the authenticated user
scribblesRouter.get('/', requireAuth, attachUserContext, async (req, res) => {
  const userId = req.ctx?.userId;
  const calendarId = req.ctx?.calendarId;

  if (!calendarId) {
    return res.status(400).json({ error: 'missing_calendar' });
  }

  try {
    const scribbles = await listScribbles({ calendarId, limit: MAX_SCRIBBLES_PER_USER });
    res.json({ scribbles, maxScribbles: MAX_SCRIBBLES_PER_USER });
  } catch (e) {
    console.error('[scribbles] list failed', { userId, calendarId }, e);
    res.status(500).json({ error: 'scribbles_error', message: 'Failed to list scribbles' });
  }
});

// POST /scribbles - Create a new scribble
scribblesRouter.post('/', requireAuth, attachUserContext, async (req, res) => {
  const userId = req.ctx?.userId;
  const calendarId = req.ctx?.calendarId;

  if (!calendarId) {
    return res.status(400).json({ error: 'missing_calendar' });
  }

  const schema = z.object({
    imageData: z.string().min(1).max(2 * 1024 * 1024), // Max ~2MB base64
    authorName: z.string().max(100).optional(),
    expiresInDays: z.number().int().min(1).max(30).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  }

  const { imageData, authorName, expiresInDays } = parsed.data;

  // Validate base64 image format
  if (!imageData.startsWith('data:image/')) {
    return res.status(400).json({ error: 'invalid_image', message: 'Image must be base64 encoded' });
  }

  let expiresAt = null;
  if (expiresInDays) {
    expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  }

  try {
    const scribble = await createScribble({ calendarId, userId, imageData, authorName, expiresAt });
    res.status(201).json({ scribble });
  } catch (e) {
    console.error('[scribbles] create failed', { userId, calendarId }, e);
    res.status(500).json({ error: 'scribbles_error', message: 'Failed to create scribble' });
  }
});

// DELETE /scribbles/:id - Delete a scribble
scribblesRouter.delete('/:id', requireAuth, attachUserContext, async (req, res) => {
  const userId = req.ctx?.userId;
  const calendarId = req.ctx?.calendarId;
  const scribbleId = Number(req.params.id);

  if (!calendarId) {
    return res.status(400).json({ error: 'missing_calendar' });
  }

  if (!Number.isFinite(scribbleId) || scribbleId <= 0) {
    return res.status(400).json({ error: 'invalid_id' });
  }

  try {
    const deleted = await deleteScribble({ calendarId, scribbleId });
    if (!deleted) {
      return res.status(404).json({ error: 'not_found' });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[scribbles] delete failed', { userId, calendarId, scribbleId }, e);
    res.status(500).json({ error: 'scribbles_error', message: 'Failed to delete scribble' });
  }
});

// PATCH /scribbles/:id/pin - Pin or unpin a scribble
scribblesRouter.patch('/:id/pin', requireAuth, attachUserContext, async (req, res) => {
  const userId = req.ctx?.userId;
  const calendarId = req.ctx?.calendarId;
  const scribbleId = Number(req.params.id);

  if (!calendarId) {
    return res.status(400).json({ error: 'missing_calendar' });
  }

  if (!Number.isFinite(scribbleId) || scribbleId <= 0) {
    return res.status(400).json({ error: 'invalid_id' });
  }

  const schema = z.object({
    pinned: z.boolean(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body' });
  }

  try {
    const updated = await pinScribble({ calendarId, scribbleId, pinned: parsed.data.pinned });
    if (!updated) {
      return res.status(404).json({ error: 'not_found' });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[scribbles] pin failed', { userId, calendarId, scribbleId }, e);
    res.status(500).json({ error: 'scribbles_error', message: 'Failed to update scribble' });
  }
});

module.exports = { scribblesRouter };
