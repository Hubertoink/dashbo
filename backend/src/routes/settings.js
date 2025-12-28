const express = require('express');
const path = require('path');
const multer = require('multer');
const { z } = require('zod');

const { requireAuth } = require('../middleware/auth');
const { ensureUserUploadDir, listImages, deleteImage } = require('../services/mediaService');
const { getUserSetting, setUserSetting } = require('../services/settingsService');
const { getTodoListName } = require('../services/todoService');

const settingsRouter = express.Router();

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const userId = Number(req.auth?.sub);
    cb(null, ensureUserUploadDir(userId));
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

settingsRouter.get('/', requireAuth, async (_req, res) => {
  const userId = Number(_req.auth?.sub);
  const backgroundRaw = await getUserSetting({ userId, key: 'background' });
  const background = backgroundRaw && String(backgroundRaw).trim() ? backgroundRaw : null;
  const rotateEnabledRaw = await getUserSetting({ userId, key: 'background.rotate' });
  const weatherLocation = await getUserSetting({ userId, key: 'weather.location' });
  const holidaysEnabledRaw = await getUserSetting({ userId, key: 'holidays.enabled' });
  const todoEnabledRaw = await getUserSetting({ userId, key: 'todo.enabled' });
  const newsEnabledRaw = await getUserSetting({ userId, key: 'news.enabled' });
  const images = listImages({ userId });

  const backgroundUrl = background ? `/media/${background}` : null;

  const holidaysEnabled = String(holidaysEnabledRaw ?? '').toLowerCase() === 'true';
  const backgroundRotateEnabled = String(rotateEnabledRaw ?? '').toLowerCase() === 'true';
  // Default to true for backwards compatibility
  const todoEnabled = todoEnabledRaw === null ? true : String(todoEnabledRaw).toLowerCase() === 'true';
  // Default to false
  const newsEnabled = String(newsEnabledRaw ?? '').toLowerCase() === 'true';
  const todoListName = getTodoListName();
  const refreshEnv = process.env.DASHBO_DATA_REFRESH_MS || process.env.DATA_REFRESH_MS || '';
  const dataRefreshMs = refreshEnv && Number.isFinite(Number(refreshEnv)) ? Number(refreshEnv) : null;
  res.json({ background, backgroundUrl, images, backgroundRotateEnabled, weatherLocation, holidaysEnabled, todoEnabled, newsEnabled, todoListName, dataRefreshMs });
});

settingsRouter.post('/background/rotate', requireAuth, async (req, res) => {
  const schema = z.object({ enabled: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const userId = Number(req.auth?.sub);
  await setUserSetting({ userId, key: 'background.rotate', value: parsed.data.enabled ? 'true' : 'false' });
  return res.json({ ok: true });
});

// NOTE: Background ids are returned as `u<userId>/<filename>`.
// Some proxies/servers decode `%2F` before routing; a simple `:filename` param would not match.
// Use a wildcard to capture the full remainder including slashes.
settingsRouter.delete('/background/*', requireAuth, async (req, res) => {
  const raw = typeof req.params[0] === 'string' ? req.params[0] : '';
  let filename = raw;
  try {
    filename = decodeURIComponent(raw);
  } catch {
    filename = raw;
  }

  const schema = z.string().min(1).max(500);
  const parsed = schema.safeParse(filename);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_params', details: parsed.error.flatten() });
  }

  const userId = Number(req.auth?.sub);

  const imagesBefore = listImages({ userId });
  if (!imagesBefore.includes(parsed.data)) {
    return res.status(404).json({ error: 'file_not_found' });
  }

  const deleted = deleteImage({ userId, filename: parsed.data });
  if (!deleted.ok) {
    return res.status(500).json({ error: deleted.error || 'delete_failed' });
  }

  const currentBgRaw = await getUserSetting({ userId, key: 'background' });
  const currentBg = currentBgRaw && String(currentBgRaw).trim() ? String(currentBgRaw) : null;
  const imagesAfter = listImages({ userId });
  if (currentBg && currentBg === parsed.data) {
    const next = imagesAfter[0] || '';
    await setUserSetting({ userId, key: 'background', value: next });
  }

  return res.json({ ok: true });
});

settingsRouter.post('/weather', requireAuth, async (req, res) => {
  const schema = z.object({ location: z.string().trim().min(0).max(200) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const loc = parsed.data.location.trim();
  const userId = Number(req.auth?.sub);
  await setUserSetting({ userId, key: 'weather.location', value: loc });
  return res.json({ ok: true });
});

settingsRouter.post('/holidays', requireAuth, async (req, res) => {
  const schema = z.object({ enabled: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const userId = Number(req.auth?.sub);
  await setUserSetting({ userId, key: 'holidays.enabled', value: parsed.data.enabled ? 'true' : 'false' });
  return res.json({ ok: true });
});

settingsRouter.post('/todo', requireAuth, async (req, res) => {
  const schema = z.object({ enabled: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const userId = Number(req.auth?.sub);
  await setUserSetting({ userId, key: 'todo.enabled', value: parsed.data.enabled ? 'true' : 'false' });
  return res.json({ ok: true });
});

settingsRouter.post('/news', requireAuth, async (req, res) => {
  const schema = z.object({ enabled: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const userId = Number(req.auth?.sub);
  await setUserSetting({ userId, key: 'news.enabled', value: parsed.data.enabled ? 'true' : 'false' });
  return res.json({ ok: true });
});

settingsRouter.post('/background', requireAuth, async (req, res) => {
  const schema = z.object({ filename: z.string().min(1).max(500) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const userId = Number(req.auth?.sub);

  const images = listImages({ userId });
  if (!images.includes(parsed.data.filename)) {
    return res.status(404).json({ error: 'file_not_found' });
  }

  await setUserSetting({ userId, key: 'background', value: parsed.data.filename });
  return res.json({ ok: true });
});

settingsRouter.post(
  '/background/upload',
  requireAuth,
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'missing_file' });

    const userId = Number(req.auth?.sub);

    const imageId = `u${userId}/${req.file.filename}`;

    await setUserSetting({ userId, key: 'background', value: imageId });
    return res.status(201).json({
      filename: imageId,
      url: `/media/${imageId}`
    });
  }
);

module.exports = { settingsRouter };
