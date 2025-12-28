const express = require('express');
const cors = require('cors');

const { requireEdgeAuth } = require('./middleware/edgeAuth');
const { musicRouter } = require('./routes/music');
const { heosRouter } = require('./routes/heos');

const app = express();

const PORT = Number(process.env.PORT || 8787);
const allowedOriginsRaw = String(process.env.EDGE_ALLOWED_ORIGINS || 'https://dashbohub.de');
const allowedOrigins = allowedOriginsRaw
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.set('trust proxy', true);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, false);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['Content-Range', 'Accept-Ranges']
  })
);

app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'dashbo-edge', time: new Date().toISOString() });
});

// All API routes require the shared Edge token.
app.use('/api', requireEdgeAuth);

app.use('/api/music', musicRouter);
app.use('/api/heos', heosRouter);

app.use((err, req, res, next) => {
  console.error('[edge] unhandled error', err);
  res.status(500).json({ error: 'internal_error' });
});

app.listen(PORT, () => {
  console.log(`[edge] listening on :${PORT}`);
  console.log(`[edge] allowed origins: ${allowedOrigins.join(', ') || '(none)'}`);
});
