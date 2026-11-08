#!/bin/sh
# Bangkee's nightly backup on the VM: the database and the uploaded photos,
# kept for 14 days in /opt/backups/nightly. Installed as
# /usr/local/bin/bangkee-backup and run by root's crontab at 02:30 Thimphu
# time (20:30 UTC); see README "Backups" for installing and restoring.
#
# A day's backup is two files: db-<stamp>.dump (pg_dump custom format, for
# pg_restore) and files-<stamp>.tar.gz (the storage volume).
set -eu

dir=/opt/backups/nightly
keep_days=14
stamp=$(date -u +%Y%m%d-%H%M)
mkdir -p "$dir"
chmod 700 "$dir"

# Written under a temporary name and renamed once complete, so a failed run
# never leaves a file that looks like a good backup.
cd /opt/bangkee
docker compose exec -T db pg_dump -U bangkee -d bangkee --format=custom >"$dir/db-$stamp.dump.part"
mv "$dir/db-$stamp.dump.part" "$dir/db-$stamp.dump"

files=$(docker volume inspect bangkee_bangkee-storage --format '{{.Mountpoint}}')
tar -czf "$dir/files-$stamp.tar.gz.part" -C "$files" .
mv "$dir/files-$stamp.tar.gz.part" "$dir/files-$stamp.tar.gz"

find "$dir" -type f \( -name 'db-*.dump' -o -name 'files-*.tar.gz' \) -mtime +"$keep_days" -delete
find "$dir" -type f -name '*.part' -delete
echo "bangkee backup $stamp: $(du -h "$dir/db-$stamp.dump" | cut -f1) database, $(du -h "$dir/files-$stamp.tar.gz" | cut -f1) files"
