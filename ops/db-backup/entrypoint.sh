#!/usr/bin/env sh
set -eu

: "${BACKUP_DIR:=/backups}"
: "${BACKUP_CRON:=0 3 * * *}"

# Respect TZ if provided (for cron timestamps / local time). If missing, default is UTC.
if [ -n "${TZ:-}" ] && [ -e "/usr/share/zoneinfo/$TZ" ]; then
  cp "/usr/share/zoneinfo/$TZ" /etc/localtime
  echo "$TZ" > /etc/timezone
fi

mkdir -p "$BACKUP_DIR"

echo "[db-backup] schedule: $BACKUP_CRON" >&2

echo "$BACKUP_CRON /usr/local/bin/backup.sh >> /proc/1/fd/1 2>> /proc/1/fd/2" > /etc/crontabs/root

# Run once on startup (optional but useful on fresh deploy)
/usr/local/bin/backup.sh

# Run cron in foreground
crond -f -l 8
