const { verifyToken } = require('../services/authService');
const { getPool } = require('../db');

function getBearerToken(req) {
  const header = req.headers['authorization'];
  if (!header) return null;
  const parts = String(header).split(' ');
  if (parts.length !== 2) return null;
  if (parts[0].toLowerCase() !== 'bearer') return null;
  return parts[1];
}

function requireAuth(req, res, next) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: 'unauthorized' });

  try {
    const payload = verifyToken(token);
    req.auth = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

async function attachUserContext(req, res, next) {
  if (!req.auth?.sub) return res.status(401).json({ error: 'unauthorized' });

  const userId = Number(req.auth.sub);
  if (!Number.isFinite(userId) || userId <= 0) return res.status(401).json({ error: 'unauthorized' });

  try {
    const pool = getPool();
    const r = await pool.query(
      'SELECT id, email, name, is_admin, calendar_id, role FROM users WHERE id = $1 LIMIT 1;',
      [userId]
    );
    if (r.rowCount === 0) return res.status(401).json({ error: 'unauthorized' });

    const row = r.rows[0];
    req.user = {
      id: Number(row.id),
      email: row.email,
      name: row.name,
      isAdmin: Boolean(row.is_admin),
      calendarId: row.calendar_id != null ? Number(row.calendar_id) : null,
      role: row.role ? String(row.role) : (row.is_admin ? 'admin' : 'member'),
    };

    req.ctx = {
      userId: req.user.id,
      calendarId: req.user.calendarId,
      role: req.user.role,
      isAdmin: req.user.isAdmin,
      email: req.user.email,
      name: req.user.name,
    };

    return next();
  } catch (e) {
    console.error('[auth] attachUserContext failed', e);
    return res.status(500).json({ error: 'internal_error' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.auth) return res.status(401).json({ error: 'unauthorized' });

  // Prefer DB-derived context when available, fall back to token payload.
  const isAdmin = req.ctx?.isAdmin ?? req.user?.isAdmin ?? Boolean(req.auth.isAdmin);
  if (!isAdmin) return res.status(403).json({ error: 'forbidden' });
  return next();
}

module.exports = { requireAuth, attachUserContext, requireAdmin };
