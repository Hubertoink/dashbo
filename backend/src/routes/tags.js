const express = require('express');
const { z } = require('zod');

const { requireAuth, attachUserContext } = require('../middleware/auth');
const { listTags, createTag, updateTag, deleteTag } = require('../services/tagsService');

const tagsRouter = express.Router();

const colorKey = z.enum(['fuchsia', 'cyan', 'emerald', 'amber', 'rose', 'violet', 'sky', 'lime']);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const tagColor = z.union([colorKey, hexColor]);

const createSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: tagColor,
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    color: tagColor.optional(),
    sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
  })
  .strict();

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

tagsRouter.get('/', requireAuth, attachUserContext, async (req, res) => {
  const calendarId = Number(req.ctx?.calendarId);
  if (!Number.isFinite(calendarId) || calendarId <= 0) return res.status(400).json({ error: 'missing_calendar' });
  const tags = await listTags({ calendarId });
  res.json(tags);
});

tagsRouter.post('/', requireAuth, attachUserContext, validateBody(createSchema), async (req, res) => {
  const calendarId = Number(req.ctx?.calendarId);
  if (!Number.isFinite(calendarId) || calendarId <= 0) return res.status(400).json({ error: 'missing_calendar' });
  const userId = Number(req.ctx?.userId);
  const created = await createTag({ calendarId, userId, ...req.validatedBody });
  res.status(201).json(created);
});

tagsRouter.put('/:id', requireAuth, attachUserContext, validateBody(updateSchema), async (req, res) => {
  const parsedId = idSchema.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ error: 'invalid_id' });

  const calendarId = Number(req.ctx?.calendarId);
  if (!Number.isFinite(calendarId) || calendarId <= 0) return res.status(400).json({ error: 'missing_calendar' });
  const updated = await updateTag({ calendarId, id: parsedId.data, patch: req.validatedBody });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json(updated);
});

tagsRouter.delete('/:id', requireAuth, attachUserContext, async (req, res) => {
  const parsedId = idSchema.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ error: 'invalid_id' });

  const calendarId = Number(req.ctx?.calendarId);
  if (!Number.isFinite(calendarId) || calendarId <= 0) return res.status(400).json({ error: 'missing_calendar' });
  const ok = await deleteTag({ calendarId, id: parsedId.data });
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

module.exports = { tagsRouter, colorKey };
