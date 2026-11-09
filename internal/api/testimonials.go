package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v5"

	"bangkee/internal/apperr"
	"bangkee/internal/domain"
)

// Testimonials: anyone signed in writes one from their Profile; the operator
// approves it on the console; the homepage shows the approved ones.

// ------------------------------------------------------------ the writer

func (s *Server) myTestimonial(c *echo.Context) error {
	cur, err := s.currentUser(c)
	if err != nil {
		return err
	}
	mine, err := domain.MyTestimonial(c.Request().Context(), s.Q, cur.User.ID)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, M{"testimonial": mine})
}

func (s *Server) saveTestimonial(c *echo.Context) error {
	cur, err := s.currentUser(c)
	if err != nil {
		return err
	}
	var in struct {
		Body string `json:"body"`
	}
	if err := decode(c, &in); err != nil {
		return err
	}
	if !s.limiter.allow("testimonial", strconv.FormatInt(cur.User.ID, 10), 10, time.Hour) {
		return apperr.NewRateLimited("That is a lot of changes at once. Try again in a little while.")
	}
	ctx := c.Request().Context()
	if _, err := domain.SaveTestimonial(ctx, s.Q, cur.User.ID, in.Body); err != nil {
		return err
	}
	s.Notify.TestimonialReceived(ctx, cur.User.Name)
	return notice(c, "Thank you! Bangkee will read it before it appears on the homepage.", nil)
}

func (s *Server) deleteTestimonial(c *echo.Context) error {
	cur, err := s.currentUser(c)
	if err != nil {
		return err
	}
	if _, err := s.Q.DeleteTestimonial(c.Request().Context(), cur.User.ID); err != nil {
		return err
	}
	return notice(c, "Your testimonial is removed.", nil)
}

// ------------------------------------------------------------ the homepage

func (s *Server) publicTestimonials(c *echo.Context) error {
	rows, err := s.Q.ApprovedTestimonials(c.Request().Context())
	if err != nil {
		return err
	}
	list := make([]domain.PublicTestimonial, 0, len(rows))
	for _, row := range rows {
		list = append(list, domain.PublicTestimonialView(row))
	}
	return c.JSON(http.StatusOK, M{"testimonials": list})
}

// ------------------------------------------------------------ the operator

func (s *Server) adminTestimonials(c *echo.Context) error {
	if _, err := s.admin(c); err != nil {
		return err
	}
	ctx := c.Request().Context()
	status := c.QueryParam("status")
	if status == "" {
		status = "pending"
	}
	var filter *int32
	if status != "all" {
		value, ok := domain.TestimonialStatusValue(status)
		if !ok {
			return apperr.NewRule("Unknown status.")
		}
		filter = &value
	}
	rows, err := s.Q.TestimonialQueue(ctx, filter)
	if err != nil {
		return err
	}
	list := make([]domain.AdminTestimonialDTO, 0, len(rows))
	for _, row := range rows {
		list = append(list, domain.AdminTestimonialView(row))
	}
	pending, err := s.Q.PendingTestimonialCount(ctx)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, M{"status": status, "testimonials": list, "pending_count": pending})
}

func (s *Server) approveTestimonial(c *echo.Context) error {
	return s.reviewTestimonial(c, domain.TestimonialApproved, "Approved — it is on the homepage.")
}

func (s *Server) hideTestimonial(c *echo.Context) error {
	return s.reviewTestimonial(c, domain.TestimonialHidden, "Hidden — it is not on the homepage.")
}

func (s *Server) reviewTestimonial(c *echo.Context, status int32, message string) error {
	admin, err := s.admin(c)
	if err != nil {
		return err
	}
	found, err := domain.ReviewTestimonial(c.Request().Context(), s.Q, paramID(c), status, admin.User.ID)
	if err != nil {
		return err
	}
	if !found {
		return apperr.ErrNotFound
	}
	return notice(c, message, nil)
}
