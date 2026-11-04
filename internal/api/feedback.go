package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v5"

	"bangkee/internal/apperr"
	"bangkee/internal/domain"
	"bangkee/internal/store"
)

// Feedback, feature requests and support: anyone signed in sends them from
// Profile → Help & feedback; the operator answers on the console.

// ------------------------------------------------------------ the sender

// myFeedback is what this person has sent, with any answers, and the kinds to choose from.
func (s *Server) myFeedback(c *echo.Context) error {
	cur, err := s.currentUser(c)
	if err != nil {
		return err
	}
	rows, err := s.Q.FeedbackForUser(c.Request().Context(), cur.User.ID)
	if err != nil {
		return err
	}
	messages := make([]domain.FeedbackDTO, 0, len(rows))
	for _, row := range rows {
		messages = append(messages, domain.FeedbackView(row))
	}
	return c.JSON(http.StatusOK, M{"messages": messages, "kinds": domain.FeedbackKinds})
}

func (s *Server) sendFeedback(c *echo.Context) error {
	cur, err := s.currentUser(c)
	if err != nil {
		return err
	}
	var in struct {
		Kind string `json:"kind"`
		Body string `json:"body"`
	}
	if err := decode(c, &in); err != nil {
		return err
	}
	if !s.limiter.allow("feedback", strconv.FormatInt(cur.User.ID, 10), 10, time.Hour) {
		return apperr.NewRateLimited("That is a lot of messages at once. Try again in a little while.")
	}
	ctx := c.Request().Context()
	id, body, err := domain.SendFeedback(ctx, s.Q, cur.User.ID, in.Kind, in.Body)
	if err != nil {
		return err
	}
	s.Notify.FeedbackReceived(ctx, cur.User.Name, domain.FeedbackKindLabel(in.Kind), body)
	return notice(c, "Sent. Thank you — Bangkee will get back to you here.", M{"id": id})
}

// ----------------------------------------------------------- the operator

func (s *Server) adminFeedback(c *echo.Context) error {
	if _, err := s.admin(c); err != nil {
		return err
	}
	ctx := c.Request().Context()
	status := c.QueryParam("status")
	if status == "" {
		status = "new"
	}
	var filter *int32
	if status != "all" {
		value, ok := domain.FeedbackStatusValue(status)
		if !ok {
			return apperr.NewRule("Unknown status.")
		}
		filter = &value
	}
	rows, err := s.Q.FeedbackList(ctx, filter)
	if err != nil {
		return err
	}
	messages := make([]domain.AdminFeedbackDTO, 0, len(rows))
	for _, row := range rows {
		messages = append(messages, domain.AdminFeedbackView(row))
	}
	count, err := s.Q.NewFeedbackCount(ctx)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, M{"status": status, "messages": messages, "new_count": count})
}

func (s *Server) acknowledgeFeedback(c *echo.Context) error {
	admin, err := s.admin(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	var f store.Feedback
	err = s.tx(ctx, func(q *store.Queries) error {
		if f, err = q.LockFeedback(ctx, paramID(c)); err != nil {
			return err
		}
		done, err := domain.AcknowledgeFeedback(ctx, q, f, admin.User.ID)
		if err == nil && !done {
			err = apperr.NewRule("That message was already acknowledged.")
		}
		return err
	})
	if err != nil {
		return err
	}
	s.Notify.FeedbackAcknowledged(ctx, f.UserID, domain.FeedbackKindLabel(f.Kind), f.Body)
	return notice(c, "Acknowledged. They have been told it was seen.", nil)
}

func (s *Server) replyToFeedback(c *echo.Context) error {
	admin, err := s.admin(c)
	if err != nil {
		return err
	}
	var in struct {
		Reply string `json:"reply"`
	}
	if err := decode(c, &in); err != nil {
		return err
	}
	ctx := c.Request().Context()
	var f store.Feedback
	var reply string
	err = s.tx(ctx, func(q *store.Queries) error {
		if f, err = q.LockFeedback(ctx, paramID(c)); err != nil {
			return err
		}
		var done bool
		done, reply, err = domain.ReplyToFeedback(ctx, q, f, admin.User.ID, in.Reply)
		if err == nil && !done {
			err = apperr.NewRule("That message already has a reply.")
		}
		return err
	})
	if err != nil {
		return err
	}
	s.Notify.FeedbackReplied(ctx, f.UserID, domain.FeedbackKindLabel(f.Kind), reply)
	return notice(c, "Reply sent.", nil)
}
