# Deployment auf Mittwald (Docker Compose)

Diese Anleitung ist bewusst pragmatisch gehalten: Repo klonen → ENV setzen → `docker compose up`.

## Zielbild
- Ein öffentliches Web-Frontend (nginx) unter deiner Domain (z.B. `https://dashbohub.de`).
- Backend + Postgres laufen intern als Container.
- Frontend proxy’t `/api/*` an das Backend (ist in `frontend/nginx.conf` bereits so konfiguriert).

## 1) DNS / Domain
- Domain (`dashbohub.de` / `www.dashbohub.de`) im Mittwald Projekt auf den Web/Container-Service zeigen lassen.
- SSL-Zertifikat aktivieren/abwarten.

## 2) Repo auf Mittwald bereitstellen
- Repository: `https://github.com/Hubertoink/dashbo.git`
- Mittwald: Projekt/Deployment so konfigurieren, dass der Code ausgecheckt wird.

## 3) Environment Variablen setzen
Mittwald sollte ENV Variablen/Secrets pro Projekt/Service unterstützen. Nutze als Basis `.env.example` und setze mindestens:

**Sicherheit / Betrieb**
- `JWT_SECRET` (unbedingt ändern)
- `POSTGRES_PASSWORD` (unbedingt ändern)
- `CORS_ORIGIN=https://dashbohub.de` (oder deine finale Domain)

**Ports (häufig kann Mittwald Ports intern mappen)**
- `BACKEND_PORT=3000`

**Optional**
- OpenWeatherMap: `OWM_API_KEY` usw.

**Outlook (privat, pro User, read-only)**
- `OUTLOOK_CLIENT_ID`
- `OUTLOOK_CLIENT_SECRET`
- `OUTLOOK_REDIRECT_URI=https://dashbohub.de/api/outlook/callback`

Wichtig: dieselbe Redirect URL auch in der Azure App Registration eintragen.

## 4) Container starten
Im Projektverzeichnis:
- `docker compose up -d --build`

Hinweis: je nach Mittwald Setup ist `--build` bei jeder Änderung sinnvoll (oder ein Build-Pipeline Schritt).

## 5) Persistenz (Volumes)
In `docker-compose.yml` werden Volumes genutzt:
- `db_data` (Postgres Daten)
- `backend_data` (Uploads unter `/data/uploads`)

Stelle sicher, dass Mittwald diese Volumes persistent speichert (oder mappe sie auf persistenten Storage).

## 6) Smoke-Checks
- Frontend: `https://dashbohub.de`
- Settings: `https://dashbohub.de/settings`
- Backend Health: `https://dashbohub.de/api/health`

## 7) Typische Stolpersteine
- **CORS**: wenn `CORS_ORIGIN` nicht zur Domain passt, schlagen Requests fehl.
- **Outlook**: Redirect URI muss exakt stimmen (inkl. https).
- **Reverse Proxy**: Domain muss auf den Frontend-Container zeigen (nginx), nicht direkt auf das Backend.
