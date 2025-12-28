const express = require('express');

const { requireAuth } = require('../middleware/auth');
const { getWeather, getForecast } = require('../services/weatherService');

const weatherRouter = express.Router();

// Require auth for all weather endpoints (user-scoped settings)
weatherRouter.use(requireAuth);

weatherRouter.get('/', async (_req, res) => {
  const userId = Number(_req.auth?.sub);
  const data = await getWeather({ userId });
  res.json(data);
});

weatherRouter.get('/forecast', async (_req, res) => {
  const userId = Number(_req.auth?.sub);
  const data = await getForecast({ userId });
  res.json(data);
});

module.exports = { weatherRouter };
