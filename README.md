# Bangkee

The shared credit book — the *khata* — for shops in Bhutan. The owner records
credits and payments, the customer sees their own balance. A credit can be
picked from the shop's items; a payment made by mBoB or mPay can carry a photo
of the customer's payment screen, straightened like a scanned document.
Customers browse shops and their items. One subscription plan (Nu. 300 a
month, billed annually) is reviewed by the Bangkee operator.

| | |
|---|---|
| Go at the root | Echo v5, pgx + sqlc on PostgreSQL. The JSON API under `/api` and the built web app. |
| `web/` | React 19, TanStack Router + Query, shadcn/ui on Tailwind v4. The homepage, the app, the operator console; an installable PWA with an offline write queue. |
| `migrations/` | goose migrations, embedded in the binary and run on boot. |
| `db/queries/` | Every SQL query; `sqlc generate` turns them into `internal/store`. |

One server, two hosts: `bangkee.bt` is the homepage and the app for shops and
customers; `admin.bangkee.bt` is the operator console. Any host starting
`admin.` is the console, so in development it is `admin.localhost`.

## Running it

Needs Go 1.26+, Node 26+, PostgreSQL, and [sqlc](https://sqlc.dev) to change queries.

```sh
echo 'DATABASE_URL=postgres://localhost/bangkee_development' > .env
createdb bangkee_development      # unless it already exists
go run ./cmd/seed                 # demo shop: karma@shop.bt / dawa@example.bt / admin@bangkee.bt, password "password"
make dev                          # API on :3000 and the web app on :5173; Ctrl-C stops both
# app:     http://localhost:5173
# console: http://admin.localhost:5173
```

`make dev` installs the web packages when they are missing and runs
`go run ./cmd/bangkee` (migrations run on boot; `PORT` to change it) beside
`npm run dev` in `web/`.

Run both from the repository root: `.env`, `storage/` and `web/dist` are found
relative to it. In production the server serves `web/dist` itself; the
`Dockerfile` builds both and `render.yaml` deploys them as one service. Point
both `bangkee.bt` and `admin.bangkee.bt` at it.

## Deploying

On a VM, `docker-compose.yml` runs the server and its PostgreSQL. HTTPS comes from the VM's shared
Caddy at `/opt/proxy` — one proxy for every app on the machine, set up once as described in
xpensiv's README — which reaches Bangkee over the `edge` Docker network. Bangkee's site on that
proxy is `deploy/bangkee.caddy`: the app host and `admin.` in front of it for the console.

Once, on the server: add `BANGKEE_DOMAIN` to `/opt/proxy/.env` (an [sslip.io](https://sslip.io)
name works without DNS, e.g. `bangkee.203.0.113.10.sslip.io`), and give `/opt/bangkee/.env` the
same `BANGKEE_DOMAIN` plus a `SECRET_KEY_BASE` and a `POSTGRES_PASSWORD`
(`openssl rand -hex 32` for each).

To deploy or redeploy, from the repository root. The tree is cleared first (keeping `.env`) so a
file deleted here does not linger there:

```sh
ssh myserver 'mkdir -p /opt/bangkee && find /opt/bangkee -mindepth 1 -maxdepth 1 ! -name .env -exec rm -rf {} +'
git archive HEAD | ssh myserver 'tar -x -C /opt/bangkee'
ssh myserver 'cd /opt/bangkee && docker compose up -d --build'
ssh myserver 'cp /opt/bangkee/deploy/bangkee.caddy /opt/proxy/sites/ && docker exec caddy caddy reload --config /etc/caddy/Caddyfile'
```

Migrations run when the server starts. The database and uploaded photos live in the
`bangkee-db` and `bangkee-storage` volumes and survive rebuilds. For a server that is only for
trying Bangkee out, `docker compose exec bangkee ./seed` loads the demo data.

## Tests

```sh
go test ./...                     # integration tests get a throwaway database on DATABASE_URL's server
cd web && npm run build && npm run lint
```

After changing a query in `db/queries/`, run `sqlc generate`. A new migration:
`go tool goose -dir migrations create <name> sql`.

## Configuration

Uploads go to `storage/` on disk, or to S3 with `ACTIVE_STORAGE_SERVICE=s3`
and `S3_*`. Optional: `VAPID_*` for Web Push (a key pair:
`npx web-push generate-vapid-keys`), `SMTP_*` and `BANGKEE_MAIL_FROM` for email,
`BANGKEE_HOST` for links in email, `BANGKEE_PRICE_CENTS` for the monthly
price (Nu. 300 by default), and `BANGKEE_BANK_NAME`, `BANGKEE_ACCOUNT_NAME`,
`BANGKEE_ACCOUNT_NUMBER`, `BANGKEE_BRANCH` for where shops
pay Bangkee. `SECRET_KEY_BASE` signs the short-lived invite cookie
and password reset links.
