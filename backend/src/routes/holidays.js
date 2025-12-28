const express = require('express');
const { z } = require('zod');

const { requireAuth } = require('../middleware/auth');
const { getHolidays } = require('../services/holidaysService');

const holidaysRouter = express.Router();

holidaysRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      from: z.string().datetime(),
      to: z.string().datetime()
    });

    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_query', details: parsed.error.flatten() });
    }

    const from = new Date(parsed.data.from);
    const to = new Date(parsed.data.to);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) {
      return res.status(400).json({ error: 'invalid_range' });
    }

    const userId = Number(req.auth?.sub);
    const data = await getHolidays({ userId, from, to });
    return res.json(data);
  } catch (err) {
    return next(err);
  }
});

module.exports = { holidaysRouter };
