# dashbo-edge (Pi)

Lokaler Edge-Service für DashbO (Raspberry Pi):
- Musikbibliothek lesen/streamen von `/mnt/music`
- HEOS im LAN steuern

## Konfiguration (ENV)
- `PORT` (default `8787`)
- `EDGE_TOKEN` (required): Bearer Token für API Zugriff
- `EDGE_ALLOWED_ORIGINS` (default `https://dashbohub.de`): Kommagetrennte Origin-Allowlist
- `MUSIC_LIBRARY_PATH` (default `/mnt/music`)
- `HEOS_HOST` (optional): IP/Host eines HEOS-Geräts (bypasst SSDP Discovery)
- `HEOS_HOSTS` (optional): Kommagetrennte IP/Hosts (Fallback-Liste)
- `HEOS_SCAN_CIDR` (optional): Aktiviert TCP-Scan-Fallback auf Port `1255` (z.B. `192.168.178.0/24`)
- `HEOS_DISCOVERY_TIMEOUT_MS` (optional)
- `HEOS_COMMAND_TIMEOUT_MS` (optional)
- `HEOS_SCAN_TIMEOUT_MS` (optional)
- `HEOS_SCAN_CONCURRENCY` (optional)

## Run lokal (dev)
- `npm install`
- `EDGE_TOKEN=devtoken npm run dev`

## Endpoints (M0)
- `GET /health`
- `GET /api/music/status`
- `POST /api/music/scan` (stub)
- `GET /api/heos/status`
- `GET /api/heos/players`
- `POST /api/heos/scan`
- `POST /api/heos/play_stream`
- `POST /api/heos/play_state`

> Hinweis: Wenn dein Dashboard auf `https://dashbohub.de` läuft, brauchst du für den Zugriff auf Edge am Pi i.d.R. HTTPS (sonst Mixed-Content im Browser).
