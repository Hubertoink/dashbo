const express = require('express');

const { getWeather, getForecast } = require('../services/weatherService');

const weatherRouter = express.Router();

weatherRouter.get('/', async (_req, res) => {
  const data = await getWeather();
  res.json(data);
});

weatherRouter.get('/forecast', async (_req, res) => {
  const data = await getForecast();
  res.json(data);
});

module.exports = { weatherRouter };
