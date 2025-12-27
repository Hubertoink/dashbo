const { verifyToken } = require('../services/authService');

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

function requireAdmin(req, res, next) {
  if (!req.auth) return res.status(401).json({ error: 'unauthorized' });
  if (!req.auth.isAdmin) return res.status(403).json({ error: 'forbidden' });
  return next();
}

module.exports = { requireAuth, requireAdmin };
