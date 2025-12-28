const express = require('express');

const heosRouter = express.Router();

heosRouter.get('/players', (req, res) => {
  // M0 stub: real HEOS discovery comes in M3.
  res.status(501).json({ error: 'not_implemented_yet' });
});

module.exports = { heosRouter };
