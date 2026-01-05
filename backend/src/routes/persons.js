const express = require('express');
const { z } = require('zod');

const { requireAuth, attachUserContext } = require('../middleware/auth');
const { listPersons, createPerson, deletePerson } = require('../services/personsService');

const personsRouter = express.Router();

const colorKey = z.enum(['fuchsia', 'cyan', 'emerald', 'amber', 'rose', 'violet', 'sky', 'lime']);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const personColor = z.union([colorKey, hexColor]);

const createSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: personColor,
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
});

const idSchema = z.coerce.number().int().positive();

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

personsRouter.get('/', requireAuth, attachUserContext, async (req, res) => {
  const calendarId = Number(req.ctx?.calendarId);
  if (!Number.isFinite(calendarId) || calendarId <= 0) return res.status(400).json({ error: 'missing_calendar' });
  const people = await listPersons({ calendarId });
  res.json(people);
});

personsRouter.post('/', requireAuth, attachUserContext, validateBody(createSchema), async (req, res) => {
  const calendarId = Number(req.ctx?.calendarId);
  if (!Number.isFinite(calendarId) || calendarId <= 0) return res.status(400).json({ error: 'missing_calendar' });
  const userId = Number(req.ctx?.userId);
  const created = await createPerson({ calendarId, userId, ...req.validatedBody });
  res.status(201).json(created);
});

personsRouter.delete('/:id', requireAuth, attachUserContext, async (req, res) => {
  const parsedId = idSchema.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ error: 'invalid_id' });

  const calendarId = Number(req.ctx?.calendarId);
  if (!Number.isFinite(calendarId) || calendarId <= 0) return res.status(400).json({ error: 'missing_calendar' });
  const ok = await deletePerson({ calendarId, id: parsedId.data });
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

module.exports = { personsRouter, colorKey };
