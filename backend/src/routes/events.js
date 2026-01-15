const express = require('express');
const { z } = require('zod');

const { requireAuth, attachUserContext } = require('../middleware/auth');

const { listEvents, createEvent, updateEvent, deleteEvent } = require('../controllers/eventsController');

const eventsRouter = express.Router();

const isoDateTime = z.string().datetime({ offset: true }).or(z.string().datetime());

const recurrenceFreq = z.enum(['weekly', 'monthly']);

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  startAt: isoDateTime,
  endAt: isoDateTime.optional().nullable(),
  allDay: z.boolean().optional(),
  tagId: z.coerce.number().int().positive().optional().nullable(),
  personId: z.coerce.number().int().positive().optional().nullable(),
  personIds: z.array(z.coerce.number().int().positive()).max(20).optional().nullable(),
  recurrence: recurrenceFreq.optional().nullable(),
});

const updateSchema = createSchema.partial().extend({
  scope: z.enum(['series', 'occurrence']).optional(),
  occurrenceStartAt: isoDateTime.optional(),
});

function validateBody(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    req.validatedBody = parsed.data;
    next();
  };
}

eventsRouter.use(requireAuth);
eventsRouter.use(attachUserContext);
eventsRouter.get('/', listEvents);
eventsRouter.post('/', validateBody(createSchema), createEvent);
eventsRouter.put('/:id', validateBody(updateSchema), updateEvent);
eventsRouter.delete('/:id', deleteEvent);

module.exports = { eventsRouter };
