# DashbO

DashbO ist ein Touchscreen‑optimiertes Familien‑Dashboard mit Kalender, Aufgabenliste und Wetter. Es ist als Self‑Hosted Web‑App gedacht und läuft standardmäßig als Docker‑Compose Stack aus **Postgres + Node/Express Backend + nginx Frontend**.

## Funktionsumfang

- Dashboard‑Ansicht für große Displays (Kalender/Termine, Aufgaben, Wetter)
- Benutzerverwaltung (Login, mehrere Accounts)
- User‑gebundene Daten:
   - Personen
   - Tags (inkl. frei wählbarer Hex‑Farbe)
   - Einstellungen (z.B. Wetter‑Ort, Anzeige‑Optionen)
   - Hintergrundbilder/Uploads (pro User getrennt)
- Termine
   - Einmalige Termine (mit/ohne Endzeit)
   - Wiederholungen (je nach UI/Backend‑Unterstützung in der aktuellen Version)
- Outlook‑Kalender (optional)
   - OAuth‑Login pro User
   - Read‑only Anzeige zusätzlicher Termine
- Wetter (optional)
   - Mit `OWM_API_KEY`: OpenWeatherMap
   - Ohne API Key: Fallback auf Open‑Meteo
- Konfigurierbares Daten‑Refresh‑Intervall per ENV (`DASHBO_DATA_REFRESH_MS`)

## Architektur (Kurz)

- `frontend/`: SvelteKit (adapter-static) → statisches Build, ausgeliefert via nginx
   - nginx proxy’t `/api/*` an das Backend (siehe `frontend/nginx.conf`)
- `backend/`: Node.js/Express API + Auth (JWT) + Postgres
   - DB-Migrationen laufen idempotent beim Start
   - Uploads werden im Volume unter `/data/uploads` gespeichert
- `db`: Postgres 16

## Quick Start (Docker Compose)

**Voraussetzungen:** Docker Desktop (oder Docker Engine) + Docker Compose.

1) Konfig anlegen

- `.env.example` nach `.env` kopieren und Werte anpassen (mindestens `JWT_SECRET` und `POSTGRES_PASSWORD`).

2) Stack starten

- `docker compose up --build`

3) Öffnen

- Frontend: http://localhost:8080
- Backend Health: http://localhost:3000/health (oder via Proxy: http://localhost:8080/api/health)
- Settings UI: http://localhost:8080/settings

## Erster Admin (Bootstrap)

Beim allerersten Start (solange noch **keine** User existieren) kann ein Admin automatisch angelegt werden:

- In `.env` setzen: `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` (optional `BOOTSTRAP_ADMIN_NAME`)
- Dann Backend neu starten (oder nur Backend rebuilden): `docker compose up -d --build backend`

## Konfiguration (ENV)

Alle Compose‑relevanten Variablen sind in `.env.example` dokumentiert.

### Wichtig (Production)

- `JWT_SECRET`: unbedingt ändern
- `POSTGRES_PASSWORD`: unbedingt ändern
- `CORS_ORIGIN`: muss zur finalen Frontend‑Domain passen (z.B. `https://dashbo.example.com`)

### Wetter

- Standard: Open‑Meteo (kein Key nötig)
- Optional OpenWeatherMap:
   - `OWM_API_KEY` setzen → OpenWeatherMap wird genutzt
   - `OWM_LANG` / `OWM_UNITS` steuern Sprache/Einheiten

**Hinweis:** Der Wetter‑Ort wird pro User in den Settings gespeichert (z.B. `weather.location`).

### Outlook (optional)

In `/settings` kann jeder User seinen Outlook‑Kalender verbinden (OAuth). Dafür brauchst du eine Azure App Registration.

- Redirect URI (Docker/nginx): `http://localhost:8080/api/outlook/callback`
- API Permissions (delegated): `Calendars.Read`, `offline_access`, `User.Read`
- ENV:
   - `OUTLOOK_CLIENT_ID`
   - `OUTLOOK_CLIENT_SECRET`
   - `OUTLOOK_REDIRECT_URI`

### Refresh‑Intervall

- `DASHBO_DATA_REFRESH_MS` (Default `60000`) steuert, wie oft das Dashboard Daten nachlädt.

## Persistenz (Volumes)

Compose legt Volumes an:

- `db_data`: Postgres Daten
- `backend_data`: Uploads/Medien unter `/data/uploads`

## Development (ohne Docker)

**Voraussetzungen:** Node.js 20+, lokale Postgres‑Instanz.

### Backend

- `cd backend`
- `backend/.env.example` nach `backend/.env` kopieren
- `npm install`
- `npm run dev`

### Frontend

- `cd frontend`
- `npm install`
- `npm run dev`

## API (Kurzüberblick)

Siehe auch `backend/src/routes/README.md`. Typische Endpoints:

- `GET /health`
- `GET /events?from=ISO&to=ISO`
- `POST /events`, `PUT /events/:id`, `DELETE /events/:id`
- `GET /weather`
- `GET /holidays?from=ISO&to=ISO`

## Deployment

Für Mittwald (Container Hosting) gibt es eine Schritt‑für‑Schritt Anleitung: `DEPLOY_MITTWALD.md`.
