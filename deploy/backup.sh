#!/bin/sh
# Bangkee's nightly backup on the VM: the database and the uploaded photos,
# kept for 14 days in /opt/backups/nightly and copied off the VM to
# Cloudflare R2, where 30 days are kept. Installed as
# /usr/local/bin/bangkee-backup and run by root's crontab at 02:30 Thimphu
# time (20:30 UTC); see README "Backups" for installing and restoring.
#
# The R2 bucket and its key are in /opt/backups/r2.env (root only):
# R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
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

# Off the VM: the same two files to R2, and anything there older than 30 days removed.
set -a
. /opt/backups/r2.env
set +a
r2() {
	docker run --rm -v "$dir":/backups:ro \
		-e RCLONE_CONFIG_R2_TYPE=s3 -e RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
		-e RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
		-e RCLONE_CONFIG_R2_ENDPOINT="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" -e RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true \
		rclone/rclone:1.68.2 -q "$@"
}
r2 copy /backups "r2:$R2_BUCKET/nightly" --include "db-$stamp.dump" --include "files-$stamp.tar.gz"
r2 delete "r2:$R2_BUCKET/nightly" --min-age 30d

find "$dir" -type f \( -name 'db-*.dump' -o -name 'files-*.tar.gz' \) -mtime +"$keep_days" -delete
find "$dir" -type f -name '*.part' -delete
echo "bangkee backup $stamp: $(du -h "$dir/db-$stamp.dump" | cut -f1) database, $(du -h "$dir/files-$stamp.tar.gz" | cut -f1) files, copied to R2"
