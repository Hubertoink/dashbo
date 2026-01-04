const express = require('express');
const path = require('path');
const multer = require('multer');
const { z } = require('zod');

const { requireAuth, attachUserContext } = require('../middleware/auth');
const { ensureUserUploadDir, listImages, deleteImage } = require('../services/mediaService');
const { getUserSetting, setUserSetting, getCalendarSetting, setCalendarSetting } = require('../services/settingsService');
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

settingsRouter.get('/', requireAuth, attachUserContext, async (_req, res) => {
  const userId = Number(_req.auth?.sub);
  const calendarId = Number(_req.ctx?.calendarId);
  const backgroundRaw = await getUserSetting({ userId, key: 'background' });
  const background = backgroundRaw && String(backgroundRaw).trim() ? backgroundRaw : null;
  const rotateEnabledRaw = await getUserSetting({ userId, key: 'background.rotate' });
  const rotateImagesRaw = await getUserSetting({ userId, key: 'background.rotateImages' });
  const weatherLocation = await getUserSetting({ userId, key: 'weather.location' });
  const holidaysEnabledRaw = await getUserSetting({ userId, key: 'holidays.enabled' });
  const todoEnabledRaw = await getUserSetting({ userId, key: 'todo.enabled' });
  const todoListNamesRaw = await getUserSetting({ userId, key: 'todo.listNames' });
  const newsEnabledRaw = await getUserSetting({ userId, key: 'news.enabled' });
  const scribbleEnabledRaw = await getUserSetting({ userId, key: 'scribble.enabled' });
  const scribbleStandbySecondsRaw = await getUserSetting({ userId, key: 'scribble.standbySeconds' });
  const scribblePaperLookRaw = await getUserSetting({ userId, key: 'scribble.standbyPaperLook' });
  const newsFeedsRaw = await getUserSetting({ userId, key: 'news.feeds' });
  const clockStyleRaw = await getUserSetting({ userId, key: 'clock.style' });
  const images = listImages({ userId });

  const recurringSuggestionsEnabledRaw = Number.isFinite(calendarId) && calendarId > 0
    ? await getCalendarSetting({ calendarId, key: 'planner.recurringSuggestions' })
    : null;
  const recurringSuggestionsEnabled = String(recurringSuggestionsEnabledRaw ?? '').toLowerCase() === 'true';

  // Pattern type settings (default all to true if main toggle is enabled)
  const weeklyPatternRaw = Number.isFinite(calendarId) && calendarId > 0
    ? await getCalendarSetting({ calendarId, key: 'planner.recurringSuggestions.weekly', fallbackToGlobal: false })
    : null;
  const biweeklyPatternRaw = Number.isFinite(calendarId) && calendarId > 0
    ? await getCalendarSetting({ calendarId, key: 'planner.recurringSuggestions.biweekly', fallbackToGlobal: false })
    : null;
  const monthlyPatternRaw = Number.isFinite(calendarId) && calendarId > 0
    ? await getCalendarSetting({ calendarId, key: 'planner.recurringSuggestions.monthly', fallbackToGlobal: false })
    : null;
  const birthdayPatternRaw = Number.isFinite(calendarId) && calendarId > 0
    ? await getCalendarSetting({ calendarId, key: 'planner.recurringSuggestions.birthdays', fallbackToGlobal: false })
    : null;
  // Default to true if not explicitly set
  const recurringSuggestionsWeekly = weeklyPatternRaw === null ? true : String(weeklyPatternRaw).toLowerCase() === 'true';
  const recurringSuggestionsBiweekly = biweeklyPatternRaw === null ? true : String(biweeklyPatternRaw).toLowerCase() === 'true';
  const recurringSuggestionsMonthly = monthlyPatternRaw === null ? true : String(monthlyPatternRaw).toLowerCase() === 'true';
  const recurringSuggestionsBirthdays = birthdayPatternRaw === null ? true : String(birthdayPatternRaw).toLowerCase() === 'true';

  const recurringSuggestionsDismissedRaw = await getUserSetting({ userId, key: 'planner.recurringSuggestions.dismissed' });
  /** @type {string[]} */
  let recurringSuggestionsDismissed = [];
  if (recurringSuggestionsDismissedRaw && String(recurringSuggestionsDismissedRaw).trim()) {
    try {
      const parsed = JSON.parse(String(recurringSuggestionsDismissedRaw));
      if (Array.isArray(parsed)) {
        recurringSuggestionsDismissed = parsed
          .map((v) => String(v || '').trim())
          .filter(Boolean)
          .slice(0, 1000);
      }
    } catch {
      // ignore
    }
  }

  const backgroundUrl = background ? `/media/${background}` : null;

  const holidaysEnabled = String(holidaysEnabledRaw ?? '').toLowerCase() === 'true';
  const backgroundRotateEnabled = String(rotateEnabledRaw ?? '').toLowerCase() === 'true';

  let backgroundRotateImages = null;
  if (rotateImagesRaw && String(rotateImagesRaw).trim()) {
    try {
      const parsed = JSON.parse(String(rotateImagesRaw));
      if (Array.isArray(parsed)) {
        const normalized = parsed
          .map((v) => String(v || '').trim())
          .filter(Boolean)
          .filter((v) => images.includes(v));
        const unique = Array.from(new Set(normalized));
        if (unique.length > 0) backgroundRotateImages = unique;
      }
    } catch {
      // ignore
    }
  }
  // Default to true for backwards compatibility
  const todoEnabled = todoEnabledRaw === null ? true : String(todoEnabledRaw).toLowerCase() === 'true';
  // Default to false
  const newsEnabled = String(newsEnabledRaw ?? '').toLowerCase() === 'true';
  // Default to true for scribble notes
  const scribbleEnabled = scribbleEnabledRaw === null ? true : String(scribbleEnabledRaw).toLowerCase() === 'true';

  const scribbleStandbySeconds = (() => {
    // Default: 20s per note
    const v = Number(scribbleStandbySecondsRaw);
    if (!Number.isFinite(v)) return 20;
    const n = Math.round(v);
    if (n < 5) return 5;
    if (n > 300) return 300;
    return n;
  })();

  // Default to true for paper look
  const scribblePaperLook = scribblePaperLookRaw === null ? true : String(scribblePaperLookRaw).toLowerCase() === 'true';
  let todoListNames = null;
  if (todoListNamesRaw && String(todoListNamesRaw).trim()) {
    try {
      const parsed = JSON.parse(String(todoListNamesRaw));
      if (Array.isArray(parsed)) {
        todoListNames = parsed
          .map((v) => String(v || '').trim())
          .filter(Boolean)
          .slice(0, 20);
      }
    } catch {
      // ignore
    }
  }

  if (!todoListNames || todoListNames.length === 0) {
    todoListNames = [getTodoListName()];
  }

  const todoListName = todoListNames[0] || null;

  /** @type {Array<'zeit'|'guardian'|'newyorker'|'sz'>} */
  let newsFeeds = ['zeit'];
  if (newsFeedsRaw && String(newsFeedsRaw).trim()) {
    try {
      const parsed = JSON.parse(String(newsFeedsRaw));
      if (Array.isArray(parsed)) {
        const normalized = parsed
          .map((v) => String(v || '').trim().toLowerCase())
          .filter((v) => ['zeit', 'guardian', 'newyorker', 'sz'].includes(v));
        if (normalized.length > 0) newsFeeds = Array.from(new Set(normalized)).slice(0, 10);
      }
    } catch {
      // ignore
    }
  }

  const refreshEnv = process.env.DASHBO_DATA_REFRESH_MS || process.env.DATA_REFRESH_MS || '';
  const dataRefreshMs = refreshEnv && Number.isFinite(Number(refreshEnv)) ? Number(refreshEnv) : null;

  const clockStyle = (() => {
    const v = String(clockStyleRaw ?? '').trim().toLowerCase();
    // Backwards mapping from previous experimental styles
    if (v === 'soft') return 'elegant';
    if (v === 'bold') return 'modern';

    if (['modern', 'elegant', 'serif', 'mono'].includes(v)) return v;
    return 'modern';
  })();
  res.json({
    background,
    backgroundUrl,
    images,
    recurringSuggestionsEnabled,
    recurringSuggestionsWeekly,
    recurringSuggestionsBiweekly,
    recurringSuggestionsMonthly,
    recurringSuggestionsBirthdays,
    recurringSuggestionsDismissed,
    backgroundRotateEnabled,
    ...(backgroundRotateImages ? { backgroundRotateImages } : {}),
    weatherLocation,
    holidaysEnabled,
    todoEnabled,
    newsEnabled,
    scribbleEnabled,
    scribbleStandbySeconds,
    scribblePaperLook,
    todoListName,
    todoListNames,
    newsFeeds,
    dataRefreshMs,
    clockStyle,
  });
});

settingsRouter.post('/recurring-suggestions', requireAuth, attachUserContext, async (req, res) => {
  const schema = z.object({
    enabled: z.boolean().optional(),
    weekly: z.boolean().optional(),
    biweekly: z.boolean().optional(),
    monthly: z.boolean().optional(),
    birthdays: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const calendarId = Number(req.ctx?.calendarId);
  if (!Number.isFinite(calendarId) || calendarId <= 0) {
    return res.status(400).json({ error: 'missing_calendar' });
  }

  const { enabled, weekly, biweekly, monthly, birthdays } = parsed.data;

  if (typeof enabled === 'boolean') {
    await setCalendarSetting({
      calendarId,
      key: 'planner.recurringSuggestions',
      value: enabled ? 'true' : 'false',
    });
  }
  if (typeof weekly === 'boolean') {
    await setCalendarSetting({
      calendarId,
      key: 'planner.recurringSuggestions.weekly',
      value: weekly ? 'true' : 'false',
    });
  }
  if (typeof biweekly === 'boolean') {
    await setCalendarSetting({
      calendarId,
      key: 'planner.recurringSuggestions.biweekly',
      value: biweekly ? 'true' : 'false',
    });
  }
  if (typeof monthly === 'boolean') {
    await setCalendarSetting({
      calendarId,
      key: 'planner.recurringSuggestions.monthly',
      value: monthly ? 'true' : 'false',
    });
  }

  if (typeof birthdays === 'boolean') {
    await setCalendarSetting({
      calendarId,
      key: 'planner.recurringSuggestions.birthdays',
      value: birthdays ? 'true' : 'false',
    });
  }

  return res.json({ ok: true });
});

settingsRouter.post('/recurring-suggestions/dismiss', requireAuth, async (req, res) => {
  const schema = z.object({ key: z.string().trim().min(1).max(500) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const userId = Number(req.auth?.sub);
  const raw = await getUserSetting({ userId, key: 'planner.recurringSuggestions.dismissed', fallbackToGlobal: false });
  let arr = [];
  if (raw && String(raw).trim()) {
    try {
      const p = JSON.parse(String(raw));
      if (Array.isArray(p)) arr = p.map((v) => String(v || '').trim()).filter(Boolean);
    } catch {
      // ignore
    }
  }

  const next = [parsed.data.key, ...arr].map((v) => String(v || '').trim()).filter(Boolean);
  const unique = Array.from(new Set(next)).slice(0, 1000);
  await setUserSetting({ userId, key: 'planner.recurringSuggestions.dismissed', value: JSON.stringify(unique) });
  return res.json({ ok: true });
});

settingsRouter.post('/clock/style', requireAuth, async (req, res) => {
  const schema = z.object({ style: z.enum(['modern', 'elegant', 'serif', 'mono']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const userId = Number(req.auth?.sub);
  await setUserSetting({ userId, key: 'clock.style', value: parsed.data.style });
  return res.json({ ok: true });
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

settingsRouter.post('/background/rotate-images', requireAuth, async (req, res) => {
  const schema = z.object({ images: z.array(z.string().min(1).max(500)).max(500).default([]) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const userId = Number(req.auth?.sub);
  const available = listImages({ userId });
  const unique = Array.from(new Set(parsed.data.images.map((s) => String(s || '').trim()).filter(Boolean))).filter((v) =>
    available.includes(v)
  );

  // Empty selection means "no restriction" (use all images) for backwards compatibility.
  const value = unique.length > 0 ? JSON.stringify(unique) : '';
  await setUserSetting({ userId, key: 'background.rotateImages', value });
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

  // Keep rotate-images selection in sync
  const rotateImagesRaw = await getUserSetting({ userId, key: 'background.rotateImages' });
  if (rotateImagesRaw && String(rotateImagesRaw).trim()) {
    try {
      const parsed = JSON.parse(String(rotateImagesRaw));
      if (Array.isArray(parsed)) {
        const normalized = parsed.map((v) => String(v || '').trim()).filter(Boolean);
        const next = normalized.filter((v) => v !== filename);
        const unique = Array.from(new Set(next));
        await setUserSetting({ userId, key: 'background.rotateImages', value: unique.length > 0 ? JSON.stringify(unique) : '' });
      }
    } catch {
      // ignore
    }
  }
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

settingsRouter.post('/todo/list-names', requireAuth, async (req, res) => {
  const schema = z.object({
    listNames: z
      .array(z.string().trim().min(1).max(200))
      .max(20)
      .default([]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const userId = Number(req.auth?.sub);
  const unique = Array.from(new Set(parsed.data.listNames.map((s) => s.trim()).filter(Boolean))).slice(0, 20);
  await setUserSetting({ userId, key: 'todo.listNames', value: JSON.stringify(unique) });
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

settingsRouter.post('/scribble', requireAuth, async (req, res) => {
  const schema = z.object({ enabled: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const userId = Number(req.auth?.sub);
  await setUserSetting({ userId, key: 'scribble.enabled', value: parsed.data.enabled ? 'true' : 'false' });
  return res.json({ ok: true });
});

settingsRouter.post('/scribble/standby-seconds', requireAuth, async (req, res) => {
  const schema = z.object({ seconds: z.number().int().min(5).max(300) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const userId = Number(req.auth?.sub);
  await setUserSetting({ userId, key: 'scribble.standbySeconds', value: String(parsed.data.seconds) });
  return res.json({ ok: true });
});

settingsRouter.post('/scribble/paper-look', requireAuth, async (req, res) => {
  const schema = z.object({ enabled: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const userId = Number(req.auth?.sub);
  await setUserSetting({ userId, key: 'scribble.standbyPaperLook', value: parsed.data.enabled ? 'true' : 'false' });
  return res.json({ ok: true });
});

settingsRouter.post('/news/feeds', requireAuth, async (req, res) => {
  const feedId = z.enum(['zeit', 'guardian', 'newyorker', 'sz']);
  const schema = z.object({
    feeds: z.array(feedId).max(10).default(['zeit']),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const userId = Number(req.auth?.sub);
  const unique = Array.from(new Set(parsed.data.feeds)).slice(0, 10);
  await setUserSetting({ userId, key: 'news.feeds', value: JSON.stringify(unique.length ? unique : ['zeit']) });
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
