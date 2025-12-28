# DashbO Musik + HEOS – Projektplan (Pi5 + SSD, Remote-Dashboard)

**Ausgangslage / Constraints**
- DashbO läuft zentral auf `dashbohub.de` (Mittwald). Der Raspberry Pi 5 greift per Browser darauf zu.
- Musik liegt **lokal** auf dem Pi auf einer SSD unter `/mnt/music` (MP3 mit guten Tags).
- HEOS-Lautsprecher sind im gleichen LAN wie der Pi.
- Gewünscht:
  - Eigene Route zum Browsen/Suchen der Musik (Albumcover, Alben, Tracks).
  - Player-Widget im Dashboard (Cover, Play/Pause, Next/Prev).
  - Abspielen wahlweise **lokal am Pi** (Browser-Audio) oder **auf HEOS**.

---

## 1) Zielarchitektur (Hybrid: Remote UI + lokaler Pi-„Edge“)

### 1.1 Komponenten
1) **DashbO Hub (bestehend, Mittwald)**
- Frontend (SvelteKit) unter `https://dashbohub.de`
- Bestehendes Backend/API (Postgres etc.)
- Erweiterung: Musik-UI + Settings, aber **keine** Musikdateien/Streams über Mittwald.

2) **DashbO Edge (neu, läuft auf dem Pi im LAN)**
- Ein eigener kleiner Backend-Service (Node/Express) als Docker-Container.
- Verantwortlich für:
  - Musikbibliothek scannen (`/mnt/music`)
  - Metadaten + Cover extrahieren, Caching
  - Track-Streaming per HTTP (inkl. Range)
  - HEOS-Integration (Control + „Play URL“)

3) **Pi Reverse Proxy (empfohlen, neu)**
- Nginx/Caddy lokal auf dem Pi als HTTPS-Proxy.
- Zweck: Mixed-Content vermeiden (Hub ist HTTPS; Browser blockt HTTP-Calls ins LAN).

### 1.2 Warum „Edge“ nötig ist
- Der Browser auf `https://dashbohub.de` kann nicht „einfach so“ auf lokale Dateien zugreifen.
- Mixed Content: Wenn das Dashboard HTTPS ist, werden Requests zu `http://pi:xxxx` i.d.R. blockiert.
- HEOS-Steuerung muss im LAN passieren (Discovery/Control), daher ist eine lokale Komponente ideal.

### 1.3 Kommunikationsmodell (UI → Edge)
- Frontend auf `dashbohub.de` spricht zusätzlich zu Hub-API auch mit **Edge-API**.
- Konfigurierbare URL in den DashbO Settings, z.B.:
  - `edgeBaseUrl = https://dashbo-edge.local` (oder `https://<pi-ip>`)
- Edge erlaubt CORS **nur** für `https://dashbohub.de`.

---

## 2) Netzwerk/Security-Plan (wichtigster Designpunkt)

### 2.1 HTTPS für Edge
**Empfohlen:** Edge wird per HTTPS über einen lokalen Reverse Proxy bereitgestellt.

Option A (einfach, robust):
- Caddy oder Nginx auf dem Pi
- Self-signed Zertifikat oder lokales CA-Zertifikat (einmalig auf dem Pi-Browser als vertrauenswürdig hinterlegen)

Option B (komfortabel, wenn möglich):
- Lokales Zertifikat via `mkcert` + lokale CA

**Ziel:** Keine Mixed-Content-Blocker, stabile Audio/HEOS Calls.

### 2.2 Auth zwischen Hub und Edge
Minimal-sicherer MVP:
- Edge besitzt ein **Pairing-Token** (random secret) in einer lokalen Config.
- DashbO Settings speichern dieses Token (nur im Pi-Browser/localStorage oder im Hub-Account-Settings).
- Requests an Edge tragen `Authorization: Bearer <edge_token>`.

Später (optional):
- Hub signiert kurzlebige Tokens für Edge (JWT), Edge verifiziert.

### 2.3 CORS
- Edge: `Access-Control-Allow-Origin: https://dashbohub.de`
- `Vary: Origin`
- Erlaubte Methoden: `GET, POST, PUT, DELETE`
- Erlaubte Header: `Content-Type, Authorization, Range`

---

## 3) Edge-Service: Musikbibliothek

### 3.1 Scan-Strategie
- Root-Pfad: `/mnt/music` (read-only mount empfohlen).
- Scanner läuft:
  - manuell triggerbar (Button in Settings)
  - optional nachts (Cron/Timer)
- Scan inkrementell:
  - nutzt `mtime` und Dateigröße/Hash zur Erkennung von Änderungen

### 3.2 Metadaten & Cover
- Aus MP3 (ID3): `title, artist, album, albumArtist, trackNo, discNo, year, genre, durationMs`.
- Cover:
  - extrahiere embedded APIC
  - speichere Thumbnail (z.B. 512px) im Cache-Verzeichnis (Edge Volume)

### 3.3 Storage für Metadaten
Zwei Optionen:
- **A (MVP, lokal):** SQLite innerhalb Edge-Volumes
- **B (konsistenter zur bestehenden Architektur):** Postgres (Edge-eigene Postgres-Instanz im Pi-Compose)

Empfehlung: **SQLite** für Edge (weniger Ops-Aufwand), Postgres nur wenn du unbedingt SQL-Features/Sharing brauchst.

---

## 4) Edge-Service: Streaming

### 4.1 Track Streaming Endpoint
- `GET /api/music/tracks/:id/stream`
- Muss unterstützen:
  - `Range` Requests (für Seek + HEOS Kompatibilität)
  - Korrekte `Content-Type` (z.B. `audio/mpeg`)
  - `Accept-Ranges: bytes`

### 4.2 URL-Form
Für HEOS „Play URL“ benötigen wir eine URL, die der Lautsprecher erreichen kann:
- `https://<pi-ip-or-host>/api/music/tracks/:id/stream`

---

## 5) HEOS-Integration (über https://github.com/JuliusCC/heos-api)

### 5.1 MVP Features
- Player Discovery:
  - `GET /api/heos/players`
- Transport:
  - `POST /api/heos/player/:id/transport { action: play|pause|stop|next|prev }`
- Volume:
  - `POST /api/heos/player/:id/volume { level: 0..100 }`

### 5.2 Cast („Play this track on HEOS“)
- `POST /api/heos/player/:id/playUrl { url, title?, artist?, album?, imageUrl? }`
- Flow:
  1) UI wählt Track
  2) UI ruft Edge auf: `playUrl` mit Stream-URL
  3) Edge weist HEOS an, diese URL zu spielen

### 5.3 Risiko / Validierung
- Nicht alle HEOS-Setups verhalten sich identisch.
- Validierung früh:
  - 2–3 MP3 Testtracks
  - Prüfen: „Play URL“, Seek, Next/Prev, Cover-Metadaten

---

## 6) Frontend/UI (Hub) – Route + Widget

### 6.1 Neue Route: Musikbrowser
- Route-Vorschlag: `/music`
- UI:
  - Album-Grid (Cover + Albumtitel + Artist)
  - Suchfeld (Album/Artist/Track)
  - Album-Detail (Trackliste)

### 6.2 Player-Widget (Dashboard)
- Mini-Player:
  - Cover (Thumbnail)
  - Titel/Artist
  - Play/Pause
  - Next/Prev
  - Ausgabeziel Umschalten: `Dieses Gerät` vs `HEOS`
  - HEOS Zielauswahl (Dropdown)

### 6.3 Zustandsmodell
- Aktuelles Abspielziel:
  - `local` (Browser `<audio>`)
  - `heos` (Edge steuert)
- Bei `local`: UI steuert `<audio>` direkt.
- Bei `heos`: UI ruft Edge-Endpunkte auf (keine lokale Audioausgabe).

---

## 7) Docker-Compose auf dem Pi (Skizze)

### 7.1 Services
- `dashbo-edge` (Node)
- `dashbo-edge-proxy` (Caddy/Nginx, HTTPS Termination)
- optional: `dashbo-edge-db` (nur wenn Postgres statt SQLite)

### 7.2 Mounts
- Musik (read-only):
  - Host: `/mnt/music`
  - Container: `/mnt/music:ro`
- Cache/DB:
  - Volume: `edge_data:/var/lib/dashbo-edge`

### 7.3 Netzwerk
- Für HEOS Discovery/Control kann `network_mode: host` sinnvoll sein.

---

## 8) Meilensteine & Aufwand (grobe Schätzung)

### M0 – Edge Skeleton + HTTPS erreichbar (0.5–1 Tag)
- Edge läuft lokal, Healthcheck, Auth-Token, CORS korrekt.

### M1 – Musikscan + Albumcover Cache (2–4 Tage)
- Scanner, Metadaten, Cover Thumbnails, List API.
- Akzeptanz: 1k+ Tracks scanbar, Albumliste schnell.

### M2 – Streaming + lokaler Player in UI (2–4 Tage)
- Range Streaming, `<audio>` Player, Player-Widget.
- Akzeptanz: Play/Pause/Next/Prev lokal funktioniert.

### M3 – HEOS Control (2–4 Tage)
- Playerlist/Volume/Transport.
- Akzeptanz: Geräte steuerbar.

### M4 – Cast auf HEOS (2–6 Tage, abhängig von HEOS Verhalten)
- `playUrl` mit Stream URL, Metadaten optional.
- Akzeptanz: Track → HEOS spielt zuverlässig.

---

## 9) Akzeptanzkriterien (Definition of Done)
- Musikbrowser zeigt Alben mit korrekten Covers.
- Suche findet Album/Artist/Tracks.
- Player-Widget spielt lokal am Pi.
- HEOS-Geräte werden erkannt; Volume/Play/Pause funktionieren.
- „Auf HEOS abspielen“ startet einen Track über Stream-URL.
- Keine Mixed-Content/CORS Fehler im Pi-Browser.

---

## 10) Nächste konkrete Schritte (Kickoff)
1) Pi-Compose vorbereiten (Edge + Proxy), `/mnt/music` mount.
2) Edge-API minimal: `/health`, Auth, CORS, Config.
3) Proof: Scan 50 Tracks + 5 Covers, Album-List Endpoint.
4) Proof: 1 Track streamen (Range), lokal abspielen.
5) Proof: HEOS Playerlist + Volume.
6) Proof: HEOS `playUrl` mit einem Track.
