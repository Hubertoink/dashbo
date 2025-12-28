function requireEdgeAuth(req, res, next) {
  const configured = String(process.env.EDGE_TOKEN || '').trim();
  if (!configured) {
    return res.status(500).json({ error: 'edge_token_not_configured' });
  }

  const auth = String(req.headers.authorization || '');
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const headerToken = m ? m[1] : '';
  const queryToken = typeof req.query.token === 'string' ? req.query.token : typeof req.query.t === 'string' ? req.query.t : '';
  const token = headerToken || queryToken || '';

  if (!token || token !== configured) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  next();
}

module.exports = { requireEdgeAuth };
