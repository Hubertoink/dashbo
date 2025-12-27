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
  app.use('/weather', weatherRouter);
  app.use('/holidays', holidaysRouter);

  app.use((err, _req, res, _next) => {
    console.error('[dashbo-backend] error', err);
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}

module.exports = { createApp };
