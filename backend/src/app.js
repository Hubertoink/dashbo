const express = require('express');
const cors = require('cors');

const { eventsRouter } = require('./routes/events');
const { weatherRouter } = require('./routes/weather');
const { holidaysRouter } = require('./routes/holidays');
const { authRouter } = require('./routes/auth');
const { usersRouter } = require('./routes/users');
const { settingsRouter } = require('./routes/settings');
const { tagsRouter } = require('./routes/tags');
const { personsRouter } = require('./routes/persons');
const { ensureUploadDir } = require('./services/mediaService');
const { outlookRouter } = require('./routes/outlook');
const { hueRouter } = require('./routes/hue');
const { todosRouter } = require('./routes/todos');
const { newsRouter } = require('./routes/news');
const { spotifyRouter } = require('./routes/spotify');
const { scribblesRouter } = require('./routes/scribbles');
const { ensureDbInitialized } = require('./db');

function createApp() {
  const app = express();

  const corsOrigin = process.env.CORS_ORIGIN || '*';
  app.use(
    cors({
      origin: corsOrigin === '*' ? true : corsOrigin,
    })
  );
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Self-heal after DB resets (e.g. lost volume / provider maintenance)
  app.use(async (req, _res, next) => {
    if (req.path === '/health') return next();
    try {
      await ensureDbInitialized();
      return next();
    } catch (e) {
      return next(e);
    }
  });

  // Serve uploaded images
  const uploadDir = ensureUploadDir();
  app.use('/media', express.static(uploadDir, { fallthrough: true }));

  app.use('/auth', authRouter);
  app.use('/users', usersRouter);
  app.use('/settings', settingsRouter);
  app.use('/tags', tagsRouter);
  app.use('/persons', personsRouter);
  app.use('/events', eventsRouter);
  app.use('/outlook', outlookRouter);
  app.use('/hue', hueRouter);
  app.use('/todos', todosRouter);
  app.use('/news', newsRouter);
  app.use('/spotify', spotifyRouter);
  app.use('/scribbles', scribblesRouter);
  app.use('/weather', weatherRouter);
  app.use('/holidays', holidaysRouter);

  app.use((err, _req, res, _next) => {
    console.error('[dashbo-backend] error', err);
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}

module.exports = { createApp };
