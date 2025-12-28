const express = require('express');
const { z } = require('zod');

const { requireAuth } = require('../middleware/auth');
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

tagsRouter.get('/', requireAuth, async (_req, res) => {
  const userId = Number(_req.auth?.sub);
  const tags = await listTags({ userId });
  res.json(tags);
});

tagsRouter.post('/', requireAuth, validateBody(createSchema), async (req, res) => {
  const userId = Number(req.auth?.sub);
  const created = await createTag({ userId, ...req.validatedBody });
  res.status(201).json(created);
});

tagsRouter.put('/:id', requireAuth, validateBody(updateSchema), async (req, res) => {
  const parsedId = idSchema.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ error: 'invalid_id' });

  const userId = Number(req.auth?.sub);
  const updated = await updateTag({ userId, id: parsedId.data, patch: req.validatedBody });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json(updated);
});

tagsRouter.delete('/:id', requireAuth, async (req, res) => {
  const parsedId = idSchema.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ error: 'invalid_id' });

  const userId = Number(req.auth?.sub);
  const ok = await deleteTag({ userId, id: parsedId.data });
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

module.exports = { tagsRouter, colorKey };
