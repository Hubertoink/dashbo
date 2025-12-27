const express = require('express');
const path = require('path');
const multer = require('multer');
const { z } = require('zod');

const { requireAuth, requireAdmin } = require('../middleware/auth');
const { ensureUploadDir, listImages } = require('../services/mediaService');
const { getSetting, setSetting } = require('../services/settingsService');

const settingsRouter = express.Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, ensureUploadDir());
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    cb(null, `bg_${stamp}_${Math.random().toString(16).slice(2)}${safeExt}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

settingsRouter.get('/', async (_req, res) => {
  const background = await getSetting('background');
  const weatherLocation = await getSetting('weather.location');
  const holidaysEnabledRaw = await getSetting('holidays.enabled');
  const images = listImages();

  const backgroundUrl = background ? `/media/${background}` : null;

  const holidaysEnabled = String(holidaysEnabledRaw ?? '').toLowerCase() === 'true';
  res.json({ background, backgroundUrl, images, weatherLocation, holidaysEnabled });
});

settingsRouter.post('/weather', requireAuth, requireAdmin, async (req, res) => {
  const schema = z.object({ location: z.string().trim().min(0).max(200) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const loc = parsed.data.location.trim();
  await setSetting('weather.location', loc);
  return res.json({ ok: true });
});

settingsRouter.post('/holidays', requireAuth, requireAdmin, async (req, res) => {
  const schema = z.object({ enabled: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  await setSetting('holidays.enabled', parsed.data.enabled ? 'true' : 'false');
  return res.json({ ok: true });
});

settingsRouter.post('/background', requireAuth, requireAdmin, async (req, res) => {
  const schema = z.object({ filename: z.string().min(1).max(500) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const images = listImages();
  if (!images.includes(parsed.data.filename)) {
    return res.status(404).json({ error: 'file_not_found' });
  }

  await setSetting('background', parsed.data.filename);
  return res.json({ ok: true });
});

settingsRouter.post(
  '/background/upload',
  requireAuth,
  requireAdmin,
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'missing_file' });

    await setSetting('background', req.file.filename);
    return res.status(201).json({
      filename: req.file.filename,
      url: `/media/${req.file.filename}`
    });
  }
);

module.exports = { settingsRouter };
