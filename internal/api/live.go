package api

import (
	"context"
	"time"

	"github.com/coder/websocket"
	"github.com/labstack/echo/v5"
)

// live is the open app's socket: each notification written for the signed-in
// person arrives here as it happens, the same JSON the push service carries.
// The browser only ever listens; it sends nothing.
func (s *Server) live(c *echo.Context) error {
	cur, err := s.currentUser(c)
	if err != nil {
		return err
	}
	// Accept refuses another site's page (its Origin must be this host) and
	// writes that refusal itself.
	conn, err := websocket.Accept(c.Response(), c.Request(), nil)
	if err != nil {
		return nil
	}
	defer conn.CloseNow()

	messages, unsubscribe := s.Notify.Live.Subscribe(cur.User.ID)
	defer unsubscribe()
	// Done when the tab goes away (or sends something, which it never should).
	ctx := conn.CloseRead(context.Background())

	// Proxies and phones drop a quiet connection; a ping keeps it honest and
	// finds the dead ones.
	ping := time.NewTicker(25 * time.Second)
	defer ping.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case message := <-messages:
			if err := write(ctx, conn, message); err != nil {
				return nil
			}
		case <-ping.C:
			pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
			err := conn.Ping(pingCtx)
			cancel()
			if err != nil {
				return nil
			}
		}
	}
}

func write(ctx context.Context, conn *websocket.Conn, message []byte) error {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return conn.Write(ctx, websocket.MessageText, message)
}
