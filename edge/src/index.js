const express = require('express');
const cors = require('cors');

const { requireEdgeAuth } = require('./middleware/edgeAuth');
const { musicRouter } = require('./routes/music');
const { heosRouter } = require('./routes/heos');

const app = express();

const PORT = Number(process.env.PORT || 8787);
const allowedOriginsRaw = String(process.env.EDGE_ALLOWED_ORIGINS || 'https://dashbohub.de');
function normalizeOrigin(value) {
  return String(value || '')
    .trim()
    .replace(/\/$/, '')
    .toLowerCase();
}

const allowedOrigins = allowedOriginsRaw
  .split(',')
  .map((s) => normalizeOrigin(s))
  .filter(Boolean);

app.set('trust proxy', true);

// Chrome Private Network Access (PNA): secure contexts calling local network endpoints
// send a preflight with Access-Control-Request-Private-Network: true.
// Responding with Access-Control-Allow-Private-Network: true allows the request to proceed.
app.use((req, res, next) => {
  if (String(req.headers['access-control-request-private-network'] || '').toLowerCase() === 'true') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  next();
});

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, false);
      const o = normalizeOrigin(origin);
      if (allowedOrigins.includes('*')) return cb(null, true);
      if (allowedOrigins.includes(o)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'Access-Control-Request-Private-Network'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['Content-Range', 'Accept-Ranges'],
    optionsSuccessStatus: 204
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
