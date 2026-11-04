# Bangkee: the React app built to static files, served by the Go server.

# ---------------------------------------------------------------- the web app
FROM node:26-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ------------------------------------------------------------------ the server
FROM golang:1.26 AS server
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd/ cmd/
COPY internal/ internal/
COPY migrations/ migrations/
# Static, so the runtime image needs nothing but CA certificates.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /bangkee ./cmd/bangkee

# --------------------------------------------------------------------- runtime
FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=server /bangkee ./bangkee
COPY --from=web /web/dist ./web/dist
RUN useradd --create-home bangkee && mkdir storage && chown bangkee storage
USER bangkee
EXPOSE 3000
# Migrations run on boot.
CMD ["./bangkee"]
