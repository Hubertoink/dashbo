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
