const { z } = require('zod');
const {
  listEventsBetween,
  insertEvent,
  patchEvent,
  removeEvent,
} = require('../services/eventsService');

const { listOutlookEventsBetween } = require('../services/outlookService');

const idSchema = z.coerce.number().int().positive();

async function listEvents(req, res) {
  const userId = Number(req.auth?.sub);
  const from = req.query.from ? new Date(String(req.query.from)) : null;
  const to = req.query.to ? new Date(String(req.query.to)) : null;

  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
    return res.status(400).json({ error: 'invalid_query' });
  }

  const effectiveFrom = from || new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const effectiveTo = to || new Date(Date.now() + 30 * 24 * 3600 * 1000);

  try {
    const [rows, outlook] = await Promise.all([
      listEventsBetween({ userId, from, to }),
      listOutlookEventsBetween({ userId, from: effectiveFrom, to: effectiveTo }),
    ]);

    const merged = [...rows, ...outlook];
    merged.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

    res.json(merged);
  } catch (e) {
    // Express 4 does not reliably handle rejected promises from async handlers.
    // Never let this bubble up and crash the process.
    console.error('[events] listEvents failed', e);
    res.status(500).json({ error: 'internal_error' });
  }
}

async function createEvent(req, res) {
  const userId = Number(req.auth?.sub);
  const body = req.validatedBody;
  const created = await insertEvent({ userId, ...body });
  res.status(201).json(created);
}

async function updateEvent(req, res) {
  const parsedId = idSchema.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ error: 'invalid_id' });

  const userId = Number(req.auth?.sub);

  const updated = await patchEvent({ userId, id: parsedId.data, patch: req.validatedBody });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json(updated);
}

async function deleteEvent(req, res) {
  const parsedId = idSchema.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ error: 'invalid_id' });

  const userId = Number(req.auth?.sub);

  const ok = await removeEvent({ userId, id: parsedId.data });
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
}

module.exports = { listEvents, createEvent, updateEvent, deleteEvent };
