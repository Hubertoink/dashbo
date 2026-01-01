const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getSpotifyNowPlaying } = require('../services/spotifyService');

const spotifyRouter = express.Router();

spotifyRouter.get('/now-playing', requireAuth, async (_req, res) => {
  try {
    const r = await getSpotifyNowPlaying();
    if (!r.enabled) return res.json({ enabled: false, active: false });

    return res.json({
      enabled: true,
      active: Boolean(r.active),
      isPlaying: Boolean(r.isPlaying),
      ...(r.item
        ? {
            title: r.item.title ?? null,
            artist: r.item.artist ?? null,
            album: r.item.album ?? null,
            imageUrl: r.item.imageUrl ?? null,
            source: r.item.source ?? 'Spotify',
            deviceName: r.item.deviceName ?? null,
            deviceType: r.item.deviceType ?? null,
            progressMs: typeof r.item.progressMs === 'number' ? r.item.progressMs : null,
          }
        : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e || 'spotify_error');
    return res.json({ enabled: true, active: false, error: msg });
  }
});

module.exports = { spotifyRouter };
