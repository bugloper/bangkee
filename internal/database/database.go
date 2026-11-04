// Package database opens the pool and brings the schema up to date.
package database

import (
	"context"
	"time"

	pgxdecimal "github.com/jackc/pgx-shopspring-decimal"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"bangkee/migrations"
)

func init() {
	// Timestamps are UTC throughout, as they were in Rails (no time zone was
	// configured). pgx hands back timestamptz values in time.Local, so the
	// whole process runs in UTC and the JSON says "…Z".
	time.Local = time.UTC
}

// Open connects and teaches every connection that numeric columns (the
// quantities) are decimals.
func Open(ctx context.Context, url string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, err
	}
	cfg.AfterConnect = func(_ context.Context, conn *pgx.Conn) error {
		pgxdecimal.Register(conn.TypeMap())
		return nil
	}
	return pgxpool.NewWithConfig(ctx, cfg)
}

// Migrate applies the embedded migrations that have not run yet.
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	db := stdlib.OpenDBFromPool(pool)
	defer db.Close()
	goose.SetBaseFS(migrations.FS)
	goose.SetLogger(goose.NopLogger())
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	return goose.UpContext(ctx, db, ".")
}
