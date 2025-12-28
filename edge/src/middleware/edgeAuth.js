function requireEdgeAuth(req, res, next) {
  const configured = String(process.env.EDGE_TOKEN || '').trim();
  if (!configured) {
    return res.status(500).json({ error: 'edge_token_not_configured' });
  }

  const auth = String(req.headers.authorization || '');
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1] : '';

  if (!token || token !== configured) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  next();
}

module.exports = { requireEdgeAuth };
