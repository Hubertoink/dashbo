# Deployment auf Mittwald (Docker Compose)

Diese Anleitung ist bewusst pragmatisch gehalten: Repo klonen → ENV setzen → `docker compose up`.

## Zielbild
- Ein öffentliches Web-Frontend (nginx) unter deiner Domain (z.B. `https://dashbohub.de`).
- Backend + Postgres laufen intern als Container.
- Frontend proxy’t `/api/*` an das Backend (ist in `frontend/nginx.conf` bereits so konfiguriert).

## 1) DNS / Domain
- Domain (`dashbohub.de` / `www.dashbohub.de`) im Mittwald Projekt auf den Web/Container-Service zeigen lassen.
- SSL-Zertifikat aktivieren/abwarten.

## 2) Images bauen (Registry)
Mittwald Container Hosting startet Container **aus einem Container-Image** (Docker Hub / GHCR / private Registry). Es baut nicht automatisch aus deinem Git-Repo.

Empfehlung: GitHub Container Registry (GHCR) nutzen.
- Workflow ist im Repo enthalten: [.github/workflows/docker-images.yml](.github/workflows/docker-images.yml)
- Images danach:
	- `ghcr.io/<owner>/dashbo-frontend:latest`
	- `ghcr.io/<owner>/dashbo-backend:latest`

Wenn das Repo private ist, musst du in Mittwald die GHCR Registry Credentials im Projekt hinterlegen (Registries Tab / API `PATCH /v2/registries/{registryId}`).

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

**Wichtig fuer die DB auf Mittwald**
- Das Backend kann DB-Zugangsdaten robuster ueber `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` lesen.
- Das ist der sichere Weg, wenn Passwoerter Sonderzeichen wie `@`, `:`, `/` oder `%` enthalten.
- Eine manuell zusammengesetzte `DATABASE_URL` kann dann syntaktisch gueltig aussehen, aber trotzdem falsch geparst werden.
- Im Compose-Setup dieses Repos werden die `DB_*`-Werte jetzt automatisch an das Backend durchgereicht.

## 4) Container starten
In Mittwald erstellst du Services/Container (UI oder API). Minimal brauchst du:
- `frontend` (nginx) → Port `80/tcp`
- `backend` (node) → Port `3000/tcp`
- `db` (postgres) → Port `5432/tcp` + persistentes Volume

Wichtig: Der Container-Name bestimmt die interne DNS. Unser nginx proxy’t auf `http://backend:3000/`, daher sollte der Backend-Container **backend** heißen.

Wichtig fuer die interne Erreichbarkeit zwischen Containern auf Mittwald:
- Der Hostname wird aus dem Service-Namen abgeleitet, z.B. `db` oder `backend`.
- Zusaetzlich muss der Ziel-Port im Service unter `Ports` definiert sein, sonst kann ein anderer Container den Dienst trotz korrektem DNS nicht erreichen.
- Fuer Dashbo bedeutet das konkret:
	- `db` braucht `5432/tcp` im `Ports`-Tab
	- `backend` braucht `3000/tcp` im `Ports`-Tab
- Wenn `backend` im Log `connect ETIMEDOUT <ip>:5432` gegen `db` meldet, ist das typischerweise kein Passwortfehler, sondern ein fehlender oder defekter interner Port-Publish auf Mittwald.

### API (optional)
Du kannst das auch per API machen:
- Stack finden: `GET /v2/projects/{projectId}/stacks` (default stack heißt `default`)
- Services/Volumes deklarieren: `PUT /v2/stacks/{stackId}` (idempotent)
- Image-Update: `POST /v2/stacks/{stackId}/services/{serviceId}/actions/pull` (für `:latest`) + ggf. `.../actions/recreate`

Domains werden per Ingress mit einem Service-Port verbunden (siehe Mittwald Doku: `POST /v2/ingresses`).

Wichtig: Ein einfacher Container-Neustart zieht bei einem mutable Tag wie `ghcr.io/...:latest` kein neues Image. Nach einem Push nach GHCR brauchst du in Mittwald ein `pull` plus `recreate`, sonst läuft weiter das alte Image.

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
