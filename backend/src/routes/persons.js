const express = require('express');
const { z } = require('zod');

const { requireAuth } = require('../middleware/auth');
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

personsRouter.get('/', requireAuth, async (req, res) => {
  const userId = Number(req.auth?.sub);
  const people = await listPersons({ userId });
  res.json(people);
});

personsRouter.post('/', requireAuth, validateBody(createSchema), async (req, res) => {
  const userId = Number(req.auth?.sub);
  const created = await createPerson({ userId, ...req.validatedBody });
  res.status(201).json(created);
});

personsRouter.delete('/:id', requireAuth, async (req, res) => {
  const parsedId = idSchema.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ error: 'invalid_id' });

  const userId = Number(req.auth?.sub);
  const ok = await deletePerson({ userId, id: parsedId.data });
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

module.exports = { personsRouter, colorKey };
