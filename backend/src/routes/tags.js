const express = require('express');
const { z } = require('zod');

const { requireAuth, requireAdmin } = require('../middleware/auth');
const { listTags, createTag, updateTag, deleteTag } = require('../services/tagsService');

const tagsRouter = express.Router();

const colorKey = z.enum(['fuchsia', 'cyan', 'emerald', 'amber', 'rose', 'violet', 'sky', 'lime']);

const createSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: colorKey,
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    color: colorKey.optional(),
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
  const tags = await listTags();
  res.json(tags);
});

// Admin management
tagsRouter.post('/', requireAuth, requireAdmin, validateBody(createSchema), async (req, res) => {
  const created = await createTag(req.validatedBody);
  res.status(201).json(created);
});

tagsRouter.put('/:id', requireAuth, requireAdmin, validateBody(updateSchema), async (req, res) => {
  const parsedId = idSchema.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ error: 'invalid_id' });

  const updated = await updateTag(parsedId.data, req.validatedBody);
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json(updated);
});

tagsRouter.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const parsedId = idSchema.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ error: 'invalid_id' });

  const ok = await deleteTag(parsedId.data);
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

module.exports = { tagsRouter, colorKey };
