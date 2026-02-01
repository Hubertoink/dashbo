# Backup & Restore (Docker)

Diese Anleitung beschreibt, wie du DashbO auf Dateiebene sichern und wiederherstellen kannst.

## Was muss gesichert werden?

DashbO speichert Daten in zwei Docker-Volumes:

- `db_data` (Postgres Datenbank)
- `backend_data` (Uploads, z.B. Hintergrundbilder unter `/data/uploads`)

In der Standard-Compose-Konfiguration heißen die Volumes typischerweise:

- `dashbo_db_data`
- `dashbo_backend_data`

Prüfen kannst du das mit:

- `docker compose config | findstr /i "volumes:"`
- `docker volume ls`

## Variante A (empfohlen): Volume-Backup als tar.gz

### Backup erstellen

1) Stack stoppen (damit ein konsistenter Snapshot entsteht)

- `docker compose down`

2) Backup-Verzeichnis anlegen

- Linux/macOS: `mkdir -p backups`
- Windows PowerShell: `New-Item -ItemType Directory -Force backups | Out-Null`

3) Volumes als Archive sichern

Linux/macOS:

- `docker run --rm -v dashbo_db_data:/volume -v "$PWD/backups":/backup alpine tar -czf /backup/db_data.tgz -C /volume .`
- `docker run --rm -v dashbo_backend_data:/volume -v "$PWD/backups":/backup alpine tar -czf /backup/backend_data.tgz -C /volume .`

Windows PowerShell:

- `docker run --rm -v dashbo_db_data:/volume -v "${PWD}\backups":/backup alpine tar -czf /backup/db_data.tgz -C /volume .`
- `docker run --rm -v dashbo_backend_data:/volume -v "${PWD}\backups":/backup alpine tar -czf /backup/backend_data.tgz -C /volume .`

Danach kannst du den Stack wieder starten:

- `docker compose up -d`

### Restore aus Volume-Backups

Achtung: Das überschreibt den aktuellen Stand. Wenn du den aktuellen Stand noch brauchst, erst ein Backup ziehen.

1) Stack stoppen

- `docker compose down`

2) (Optional, aber sauber) alte Volumes löschen

- `docker volume rm dashbo_db_data dashbo_backend_data`

3) Volumes neu erzeugen

- `docker volume create dashbo_db_data`
- `docker volume create dashbo_backend_data`

4) Restore der Archive in die Volumes

Linux/macOS:

- `docker run --rm -v dashbo_db_data:/volume -v "$PWD/backups":/backup alpine sh -lc "cd /volume; tar -xzf /backup/db_data.tgz"`
- `docker run --rm -v dashbo_backend_data:/volume -v "$PWD/backups":/backup alpine sh -lc "cd /volume; tar -xzf /backup/backend_data.tgz"`

Windows PowerShell:

- `docker run --rm -v dashbo_db_data:/volume -v "${PWD}\backups":/backup alpine sh -lc "cd /volume; tar -xzf /backup/db_data.tgz"`
- `docker run --rm -v dashbo_backend_data:/volume -v "${PWD}\backups":/backup alpine sh -lc "cd /volume; tar -xzf /backup/backend_data.tgz"`

5) Stack wieder starten

- `docker compose up -d`

6) Smoke-Checks

- Frontend: `http://localhost:8080`
- API Health: `http://localhost:8080/api/health`

## Variante B: SQL-Dump (zusätzlich oder alternativ)

Ein SQL-Dump ist gut für Migrationen/Umzüge, aber deckt **Uploads** nicht ab.

### Variante B1 (neu): Automatischer SQL-Dump per `db_backup` Service

In `docker-compose.yml` ist ein optionaler Service `db_backup` enthalten, der regelmäßig ein gzipped SQL-Dump (`*.sql.gz`) in ein Volume schreibt.

- Backups liegen im Volume `db_backups` unter `/backups`
- Standard: täglich um 03:00 Uhr (Europe/Berlin), Aufbewahrung 14 Tage

Konfiguration per ENV (siehe `.env.example`):

- `DB_BACKUP_CRON` (Cron-Expression, z.B. `0 3 * * *`)
- `DB_BACKUP_KEEP_DAYS` (Default `14`)
- `DB_BACKUP_PREFIX` (Default `dashbo`)

Backups ansehen:

- `docker compose exec db_backup sh -lc 'ls -lah /backups | tail -n +1'`

Ein Backup auf deinen Rechner kopieren (Beispiel, neuestes File):

- Linux/macOS:
  - `id=$(docker compose ps -q db_backup); f=$(docker compose exec -T db_backup sh -lc 'ls -1t /backups/*.sql.gz | head -n 1'); docker cp "$id:${f}" ./backups/`

- Windows PowerShell:
  - `$id = docker compose ps -q db_backup
     $f = docker compose exec -T db_backup sh -lc 'ls -1t /backups/*.sql.gz | head -n 1'
     docker cp "$id:$f" .\backups\`

### SQL-Backup

- Linux/macOS:
  - `docker compose exec -T db sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backups/dashbo.sql`

- Windows PowerShell:
  - `docker compose exec -T db sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | Out-File -Encoding utf8 backups\dashbo.sql`

### SQL-Restore

Achtung: das überschreibt die DB.

- `docker compose down`
- `docker compose up -d db`

Restore (Linux/macOS):

- `cat backups/dashbo.sql | docker compose exec -T db sh -lc 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'`

Restore (Windows PowerShell):

- `Get-Content backups\dashbo.sql | docker compose exec -T db sh -lc 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'`

Danach den kompletten Stack starten:

- `docker compose up -d`

### Restore aus `db_backup` Dumps (`*.sql.gz`)

1) Stack starten (mindestens DB)

- `docker compose up -d db`

2) Dump einspielen

Option A (empfohlen, keine lokalen Tools nötig): Dump innerhalb der Container entpacken

- `docker compose exec -T db_backup sh -lc 'gunzip -c /backups/dashbo_YYYYmmdd_HHMMSS.sql.gz' | docker compose exec -T db sh -lc 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'`

Option B (wenn Dump lokal liegt): lokal entpacken und pipen

- Linux/macOS:
  - `gunzip -c backups/dashbo_YYYYmmdd_HHMMSS.sql.gz | docker compose exec -T db sh -lc 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'`

- Windows PowerShell:
  - `Get-Content .\\backups\\dashbo_YYYYmmdd_HHMMSS.sql | docker compose exec -T db sh -lc 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'`

3) Rest vom Stack starten

- `docker compose up -d`
