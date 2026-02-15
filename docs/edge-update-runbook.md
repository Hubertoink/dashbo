# Edge Update Runbook (Windows)

Diese Schritte aktualisieren den lokal laufenden `dashbo-edge` Container mit dem neuesten Image und zeigen, wie du nach Repo-Änderungen ein lokales Image verwendest.

## Voraussetzungen

- Docker Desktop läuft
- Du bist im Repo-Root (`dashbo`)
- `.env` existiert (aus `.env.example` kopiert)
- In `.env` sind mindestens gesetzt:
  - `EDGE_TOKEN`
  - `MUSIC_DIR` (z. B. `C:/Users/Nikolas/Music`)

## A) Neuestes Remote-Image nutzen (Standard)

```powershell
docker compose -f docker-compose.win-edge.yml pull dashbo-edge
docker compose -f docker-compose.win-edge.yml up -d --force-recreate --no-deps dashbo-edge
docker compose -f docker-compose.win-edge.yml ps dashbo-edge
```

Optional prüfen, welches Image wirklich läuft:

```powershell
docker inspect dashbo-edge --format "{{.Config.Image}} | {{.Created}}"
```

## B) Wenn du Code im `edge/`-Ordner geändert hast

### 1) Lokales Image bauen

```powershell
docker build -t dashbo-edge:local ./edge
```

### 2) Compose mit lokalem Image starten

```powershell
$env:EDGE_IMAGE="dashbo-edge:local"
docker compose -f docker-compose.win-edge.yml up -d --force-recreate --no-deps dashbo-edge
docker compose -f docker-compose.win-edge.yml ps dashbo-edge
```

Hinweis: Die Variable gilt nur in der aktuellen PowerShell-Session.

## C) Typische Probleme

- Fehler `mkdir C:\Users\huber: Access is denied.`
  - Ursache: Fallback-Pfad aus Compose passt nicht zu deinem User.
  - Lösung: `MUSIC_DIR` in `.env` korrekt setzen (z. B. `C:/Users/Nikolas/Music`).

- Browser kann Edge nicht erreichen (Mixed Content)
  - Wenn Frontend über HTTPS läuft, muss Edge i. d. R. ebenfalls über HTTPS erreichbar sein (z. B. via Reverse Proxy).
