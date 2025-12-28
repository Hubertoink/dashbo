# dashbo-edge (Pi)

Lokaler Edge-Service für DashbO (Raspberry Pi):
- Musikbibliothek lesen/streamen von `/mnt/music`
- HEOS im LAN steuern

## Konfiguration (ENV)
- `PORT` (default `8787`)
- `EDGE_TOKEN` (required): Bearer Token für API Zugriff
- `EDGE_ALLOWED_ORIGINS` (default `https://dashbohub.de`): Kommagetrennte Origin-Allowlist
- `MUSIC_LIBRARY_PATH` (default `/mnt/music`)

## Run lokal (dev)
- `npm install`
- `EDGE_TOKEN=devtoken npm run dev`

## Endpoints (M0)
- `GET /health`
- `GET /api/music/status`
- `POST /api/music/scan` (stub)
- `GET /api/heos/players` (stub)

> Hinweis: Wenn dein Dashboard auf `https://dashbohub.de` läuft, brauchst du für den Zugriff auf Edge am Pi i.d.R. HTTPS (sonst Mixed-Content im Browser).
