FROM postgres:16-alpine

RUN apk add --no-cache bash tzdata

COPY backup.sh /usr/local/bin/backup.sh
COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /usr/local/bin/backup.sh /entrypoint.sh

ENV BACKUP_DIR=/backups \
    BACKUP_PREFIX=dashbo \
    BACKUP_KEEP_DAYS=14 \
    BACKUP_CRON="0 3 * * *"

VOLUME ["/backups"]

ENTRYPOINT ["/entrypoint.sh"]
