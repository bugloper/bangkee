// The Bangkee server: the JSON API, the share target, and the built web app.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"bangkee/internal/api"
	"bangkee/internal/config"
	"bangkee/internal/database"
	"bangkee/internal/storage"
)

func main() {
	if err := run(); err != nil {
		slog.Error("bangkee stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	// Only ./.env — never a file further up the tree that belongs to
	// something else.
	_ = godotenv.Load(".env")
	cfg, err := config.FromEnv()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	if err := database.Migrate(ctx, db); err != nil {
		return err
	}
	files, err := storage.New(cfg.Storage, "storage")
	if err != nil {
		return err
	}

	server := api.NewServer(db, cfg, files)
	server.ScheduleReminders(ctx)

	httpServer := &http.Server{Addr: ":" + cfg.Port, Handler: server.Handler(), ReadHeaderTimeout: 10 * time.Second}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		_ = httpServer.Shutdown(shutdown)
	}()
	slog.Info("Bangkee listening", "port", cfg.Port)
	if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	server.Wait()
	return nil
}
