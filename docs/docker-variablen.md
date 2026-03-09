# Docker / Compose Variablen

Diese Übersicht listet **alle aktuell in den Compose-Dateien verwendeten Variablen** und erklärt Zweck, Defaults und Beispielwerte.

Betroffene Dateien:
- `docker-compose.yml`
- `docker-compose.pi-edge.yml`
- `docker-compose.win-edge.yml`
- ergänzend: Laufzeit-ENV in `frontend/Dockerfile`

## Verwendung

1. `.env.example` nach `.env` kopieren
2. Werte anpassen
3. starten mit `docker compose up -d --build`

---

## 1) Core Stack (`docker-compose.yml`)

### Datenbank

- `POSTGRES_DB` (Default: `dashbo`) – Name der Postgres-Datenbank
  - Beispiel: `POSTGRES_DB=dashbo_prod`
- `POSTGRES_USER` (Default: `dashbo`) – DB-User
  - Beispiel: `POSTGRES_USER=dashbo_app`
- `POSTGRES_PASSWORD` (Default: `dashbo`) – DB-Passwort (**in Produktion ändern**)
  - Beispiel: `POSTGRES_PASSWORD=UseALongRandomSecret`
- `POSTGRES_PORT` (Default: `5432`) – Host-Port für Postgres
  - Beispiel: `POSTGRES_PORT=5433`

### Backend / API

- `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` – werden im Compose-Stack intern aus den Postgres-Werten an das Backend weitergegeben
  - Zweck: Das Backend baut daraus bei Bedarf selbst eine sauber URL-kodierte Verbindung auf
  - Wichtig fuer Hosting-Umgebungen wie Mittwald, wenn das Passwort Sonderzeichen wie `@`, `:` oder `/` enthaelt
- `BACKEND_PORT` (Default: `3000`) – Host-Port und Backend-`PORT`
  - Beispiel: `BACKEND_PORT=3001`
- `CORS_ORIGIN` (Default: `http://localhost:8080`) – erlaubte Frontend-Origin
  - Beispiel: `CORS_ORIGIN=https://dashbo.example.com`
- `JWT_SECRET` (Default: `dashbo-dev-secret-change-me`) – JWT-Signing-Secret (**ändern**)
  - Beispiel: `JWT_SECRET=9f2f...<64+ chars>...`
- `BOOTSTRAP_ADMIN_EMAIL` (Default: leer) – optionaler Erst-Admin beim allerersten Start
  - Beispiel: `BOOTSTRAP_ADMIN_EMAIL=admin@example.com`
- `BOOTSTRAP_ADMIN_PASSWORD` (Default: leer) – Passwort für Erst-Admin
  - Beispiel: `BOOTSTRAP_ADMIN_PASSWORD=StrongAdminPass!`
- `BOOTSTRAP_ADMIN_NAME` (Default: `Admin`) – Anzeigename für Erst-Admin
  - Beispiel: `BOOTSTRAP_ADMIN_NAME=Huber`

#### Mainadmin / Superadmin

- `BOOTSTRAP_ADMIN_EMAIL` fungiert standardmäßig als Mainadmin (Superadmin)
  - Nur dieser Account darf weitere Admins einladen
  - Jede Admin-Einladung erstellt eine eigene Familienkalender-Umgebung
- Optional kann die Superadmin-Liste explizit gesetzt werden:
  - `SUPERADMIN_EMAIL` (ein einzelner Account)
  - `SUPERADMIN_EMAILS` (mehrere Accounts, getrennt mit Komma/Semikolon/Whitespace)

### Wetter

- `OWM_API_KEY` (Default: leer) – optionaler OpenWeatherMap-Key
  - Beispiel: `OWM_API_KEY=abcd1234...`
- `OWM_LAT` (Default: `49.4875`) – Breitengrad
- `OWM_LON` (Default: `8.4660`) – Längengrad
- `OWM_UNITS` (Default: `metric`) – Einheiten (`metric`/`imperial`)
- `OWM_LANG` (Default: `de`) – Sprache (z. B. `de`, `en`)

### Outlook OAuth

- `OUTLOOK_TENANT` (Default: `consumers`) – Azure Tenant
  - Beispiel: `OUTLOOK_TENANT=common`
- `OUTLOOK_CLIENT_ID` (Default: leer) – App Client ID
- `OUTLOOK_CLIENT_SECRET` (Default: leer) – App Secret
- `OUTLOOK_REDIRECT_URI` (Default: leer in compose, empfohlen gesetzt) – OAuth Callback URL
  - Docker/nginx Beispiel: `OUTLOOK_REDIRECT_URI=http://localhost:8080/api/outlook/callback`
- `OUTLOOK_SCOPES` (Default: `offline_access Calendars.Read User.Read Tasks.ReadWrite`) – OAuth Scopes
- `OUTLOOK_SUCCESS_REDIRECT` (Default: `/settings`) – UI-Redirect nach Erfolg
- `OUTLOOK_ERROR_REDIRECT` (Default: `/settings?outlook=error`) – UI-Redirect bei Fehler

### Philips Hue (optional)

- `HUE_BRIDGE_URL` (Default: leer) – Basis-URL deiner Hue Bridge (v2 API)
  - Beispiel: `HUE_BRIDGE_URL=https://192.168.178.40`
- `HUE_APP_KEY` (Default: leer) – Hue Application Key für authentifizierte Requests
  - Beispiel: `HUE_APP_KEY=abcdefghijklmnopqrstuvwxyz123456`
- `HUE_ALLOW_SELF_SIGNED` (Default: `true`) – erlaubt self-signed Zertifikate im lokalen Netz
  - Beispiel: `HUE_ALLOW_SELF_SIGNED=true`

### Mail / öffentliche URL

- `PUBLIC_APP_URL` (Default: leer) – öffentliche Frontend-URL für Mail-Links
  - Beispiel: `PUBLIC_APP_URL=https://dashbo.example.com`
- `SMTP_HOST` / `SMTP_PORT` – SMTP Server + Port
  - Beispiel: `SMTP_HOST=smtp.mailprovider.tld`, `SMTP_PORT=587`
- `SMTP_SECURE` – `true` für SMTPS (meist Port 465)
- `SMTP_REQUIRE_TLS` – `true` für STARTTLS (meist Port 587)
- `SMTP_USER` / `SMTP_PASS` – SMTP Zugang
- `MAIL_FROM` – Absenderadresse
  - Beispiel: `MAIL_FROM=DashbO <noreply@example.com>`

### Dashboard / ToDo

- `DASHBO_DATA_REFRESH_MS` (Default: `60000`) – Refresh-Intervall in ms
  - Beispiel: `DASHBO_DATA_REFRESH_MS=30000`
- `TODO_LIST_NAME` (Default: `Dashbo`) – Standard-Listenname für ToDos
  - Beispiel: `TODO_LIST_NAME=Familie`

### Automatische DB-Backups (`db_backup` Profil)

- `DB_BACKUP_PREFIX` (Default: `dashbo`) – Dateiprefix
- `DB_BACKUP_KEEP_DAYS` (Default: `14`) – Aufbewahrungstage
- `DB_BACKUP_CRON` (Default: `0 3 * * *`) – Cron-Ausdruck im Container
  - Beispiel: `DB_BACKUP_CRON=0 */6 * * *`
- `TZ` (Default: `Europe/Berlin`) – Zeitzone für Backup-Job

---

## 2) Edge Stack (`docker-compose.pi-edge.yml` / `docker-compose.win-edge.yml`)

- `EDGE_IMAGE` (Default: `ghcr.io/Hubertoink/dashbo-edge:latest`) – zu startendes Edge Image
- `EDGE_TOKEN` (**wichtig**) – Auth-Token für Edge API
  - Beispiel: `EDGE_TOKEN=<openssl rand -hex 32>`
- `EDGE_PORT` (Default: `8787`) – Host-Port für Edge
- `EDGE_ALLOWED_ORIGINS` – CORS Origins (kommagetrennt)
  - Beispiel: `EDGE_ALLOWED_ORIGINS=https://dashbohub.de,http://localhost:8080`
- `EDGE_PUBLIC_BASE_URL` – externe/LAN URL für Stream-Links (HEOS)
  - Beispiel: `EDGE_PUBLIC_BASE_URL=http://192.168.178.50:8787`
- `MUSIC_DIR` – Host-Pfad der Musikbibliothek
  - Windows Beispiel: `MUSIC_DIR=C:/Users/huber/Music`
  - Pi/Linux Beispiel: `MUSIC_DIR=/mnt/music`

### HEOS Discovery / Kommunikation (optional)

- `HEOS_HOST` – einzelner HEOS Host
- `HEOS_HOSTS` – mehrere Hosts (kommagetrennt)
- `HEOS_SCAN_CIDR` – Scan-Netz
  - Beispiel: `HEOS_SCAN_CIDR=192.168.178.0/24`
- `HEOS_DISCOVERY_TIMEOUT_MS` (Default: `5000`)
- `HEOS_COMMAND_TIMEOUT_MS` (Default: `5000`)
- `HEOS_SCAN_TIMEOUT_MS` (Default: `200`)
- `HEOS_SCAN_CONCURRENCY` (Default: `64`)

---

## 3) Frontend nginx Laufzeitvariablen (`frontend/Dockerfile`)

Diese Variablen existieren im Frontend-Container und steuern das nginx-Template:

- `API_PROXY_PASS` (Default: `http://backend:3000/`) – API Ziel
- `API_PROXY_HOST` (Default: `backend`) – Host Header Upstream
- `CLIENT_MAX_BODY_SIZE` (Default: `12m`) – max Uploadgröße

Beispiel bei separater API-Domain:
- `API_PROXY_PASS=https://api.example.com/`
- `API_PROXY_HOST=api.example.com`
- `CLIENT_MAX_BODY_SIZE=20m`

---

## 4) Minimale Produktionswerte (Beispiel)

```env
POSTGRES_PASSWORD=UseALongRandomSecret
JWT_SECRET=AnotherLongRandomSecretValue
CORS_ORIGIN=https://dashbo.example.com
PUBLIC_APP_URL=https://dashbo.example.com

# optional mail
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_USER=noreply@example.com
SMTP_PASS=supersecret
MAIL_FROM=DashbO <noreply@example.com>
```
