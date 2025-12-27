# Dashbo

Familienkalender-WebApp für einen großen Touchscreen (Dashboard-Ansicht wie im Mockup).

## Voraussetzungen
- Docker Desktop (empfohlen) **oder** Node.js 20+
- OpenWeatherMap API Key (optional, für Wetter)

## Start (Docker)
1. `.env.example` nach `.env` kopieren und Werte anpassen.
2. Start:
   - `docker compose up --build`
3. Öffnen:
   - Frontend: http://localhost:8080
   - Backend: http://localhost:3000 (Health: `/health`)

## Admin / Einstellungen
- Settings UI: http://localhost:8080/settings
- Initialer Admin (einmalig): setze in `.env` die Variablen `BOOTSTRAP_ADMIN_EMAIL` und `BOOTSTRAP_ADMIN_PASSWORD` (optional `BOOTSTRAP_ADMIN_NAME`).
   - Danach: `docker compose up -d --build backend`
   - Hinweis: Der Bootstrap greift nur, wenn noch **keine** User existieren.
- Über `/settings` kannst du dann:
   - Hintergrundbilder hochladen und als Dashboard-Background auswählen
   - neue User anlegen (E-Mail, Name, Passwort)

## Outlook Kalender (privat, pro User, nur anzeigen)
- In `/settings` kann sich jeder User mit seinem privaten Outlook-Konto verbinden (OAuth). Termine werden dann zusätzlich angezeigt (read-only).
- Benötigt eine Azure App Registration (Microsoft Identity Platform):
   - Supported account types: **Personal Microsoft accounts only** (oder „Accounts in any organizational directory and personal Microsoft accounts“)
   - Redirect URI (Docker/nginx): `http://localhost:8080/api/outlook/callback`
   - API Permissions (delegated): `Calendars.Read`, `offline_access`, `User.Read`
- Konfiguration über `.env` (siehe `.env.example`): `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET`, `OUTLOOK_REDIRECT_URI`.

## Start (ohne Docker)
### Backend
- `cd backend`
- `.env.example` nach `.env` kopieren
- `npm install`
- `npm run dev`

### Frontend
- `cd frontend`
- `npm install`
- `npm run dev`

## Hinweise
- Hintergrundbild: Lege ein Bild unter `frontend/static/background.jpg` ab (wird automatisch genutzt). Falls nicht vorhanden, nutzt die UI einen neutralen Fallback.
