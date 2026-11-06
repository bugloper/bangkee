package api

import (
	"context"
	"log/slog"
	"net/http"
	"slices"
	"time"

	"github.com/labstack/echo/v5"

	"bangkee/internal/apperr"
	"bangkee/internal/domain"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

// Everything around the ledger rather than in it: settings and language, §17
// billing (owner and operator), the bell, Web Push registration, and the
// uploaded screenshots themselves.

func (s *Server) settings(c *echo.Context) error {
	cur, err := s.currentUser(c)
	if err != nil {
		return err
	}
	counts := store.ShopCountsRow{}
	if cur.User.Role == domain.RoleShopOwner {
		shop, err := domain.ShopForOwner(c.Request().Context(), s.Q, cur.User.ID)
		if err != nil {
			return err
		}
		if shop != nil {
			if counts, err = s.Q.ShopCounts(c.Request().Context(), shop.ID); err != nil {
				return err
			}
		}
	}
	return c.JSON(http.StatusOK, M{
		"menu_items_count": counts.MenuItems, "bank_accounts_count": counts.BankAccounts,
	})
}

// pricing is the homepage's pricing section: one plan, billed annually.
func (s *Server) pricing(c *echo.Context) error {
	operator := s.Cfg.Operator
	return c.JSON(http.StatusOK, M{
		"monthly_price_cents": operator.PriceCents, "annual_price_cents": operator.AnnualPriceCents(), "trial_days": domain.TrialDays,
	})
}

// setLanguage stores the reading language on the account, so it follows the
// person to their next device.
func (s *Server) setLanguage(c *echo.Context) error {
	cur, err := s.currentUser(c)
	if err != nil {
		return err
	}
	var in struct {
		Locale string `json:"locale"`
	}
	if err := decode(c, &in); err != nil {
		return err
	}
	if !slices.Contains(domain.Locales, in.Locale) {
		return apperr.NewRule("That language is not available.")
	}
	if err := s.Q.SetLocale(c.Request().Context(), store.SetLocaleParams{ID: cur.User.ID, Locale: &in.Locale}); err != nil {
		return err
	}
	// Dzongkha has no translation for this yet; English is the fallback.
	return notice(c, "Language changed.", nil)
}

// ---------------------------------------------------------------- billing

// billing is §17 — the owner's billing screen. Never write-locked: an owner
// must always be able to reach the screen that restores their access.
func (s *Server) billing(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	sub, err := domain.SubscriptionFor(ctx, s.Q, o.Shop.ID)
	if err != nil {
		return err
	}
	if sub == nil {
		return apperr.ErrNotFound
	}
	if err := domain.RefreshStatus(ctx, s.Q, *sub); err != nil {
		return err
	}
	rows, err := s.Q.SubscriptionPaymentList(ctx, store.SubscriptionPaymentListParams{ShopID: &o.Shop.ID, RowLimit: 500})
	if err != nil {
		return err
	}
	ids := make([]int64, len(rows))
	for i, row := range rows {
		ids[i] = row.SubscriptionPayment.ID
	}
	shots, err := domain.AttachmentURLs(ctx, s.Q, domain.SubscriptionPaymentRecordType, ids, "screenshot")
	if err != nil {
		return err
	}
	payments := make([]domain.SubscriptionPaymentDTO, 0, len(rows))
	for _, row := range rows {
		payments = append(payments, domain.SubscriptionPaymentView(row.SubscriptionPayment, row.ReviewedByName, urlOf(shots, row.SubscriptionPayment.ID)))
	}
	operator := s.Cfg.Operator
	return c.JSON(http.StatusOK, M{
		"subscription": domain.SubscriptionView(*sub),
		"payments":     payments,
		"operator": M{
			"annual_price_cents": operator.AnnualPriceCents(),
			"bank_name":          operator.BankName, "account_name": operator.AccountName, "account_number": operator.AccountNumber,
			"branch": operator.Branch, "instructions": operator.Instructions(),
		},
	})
}

func urlOf(urls map[int64]string, id int64) *string {
	if url, ok := urls[id]; ok {
		return &url
	}
	return nil
}

func (s *Server) submitSubscriptionPayment(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	form, err := c.MultipartForm()
	if err != nil {
		return apperr.NewRule("That upload failed.")
	}
	screenshot, err := upload(formFile(form, "screenshot"))
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	var amount int64
	var months int32
	err = s.tx(ctx, func(q *store.Queries) error {
		_, amount, months, err = domain.CreateSubscriptionPayment(ctx, q, s.Files, o.Shop.ID, o.User.ID, domain.NewSubscriptionPayment{
			Amount: formValue(form, "amount"), Months: formValue(form, "months"),
			Method: formValue(form, "method"), Reference: formValue(form, "reference"),
		}, screenshot)
		return err
	})
	if err != nil {
		return err
	}
	s.Notify.SubscriptionPaymentSubmitted(ctx, o.Shop.Name, amount, months)
	return notice(c, "Payment sent to Bangkee for approval.", nil)
}

// ------------------------------------------------------------------ admin

func (s *Server) adminPaymentViews(ctx context.Context, rows []store.SubscriptionPaymentListRow) ([]M, error) {
	ids := make([]int64, len(rows))
	for i, row := range rows {
		ids[i] = row.SubscriptionPayment.ID
	}
	shots, err := domain.AttachmentURLs(ctx, s.Q, domain.SubscriptionPaymentRecordType, ids, "screenshot")
	if err != nil {
		return nil, err
	}
	out := make([]M, 0, len(rows))
	for _, row := range rows {
		p := row.SubscriptionPayment
		shop := M{"id": p.ShopID, "name": row.ShopName, "paid_through": nil, "status_label": nil}
		sub, err := domain.SubscriptionFor(ctx, s.Q, p.ShopID)
		if err != nil {
			return nil, err
		}
		if sub != nil {
			shop["paid_through"] = sub.CurrentPeriodEnd
			shop["status_label"] = domain.EffectiveStatus(*sub, time.Now()).Label()
		}
		view := toMap(domain.SubscriptionPaymentView(p, row.ReviewedByName, urlOf(shots, p.ID)))
		view["shop"] = shop
		view["submitted_by_name"] = row.SubmittedByName
		out = append(out, view)
	}
	return out, nil
}

func (s *Server) adminDashboard(c *echo.Context) error {
	if _, err := s.admin(c); err != nil {
		return err
	}
	ctx := c.Request().Context()
	stats, err := s.Q.AdminStats(ctx, util.MonthStart(time.Now()))
	if err != nil {
		return err
	}
	pendingStatus := int32(0)
	rows, err := s.Q.SubscriptionPaymentList(ctx, store.SubscriptionPaymentListParams{Status: &pendingStatus, OldestFirst: true, RowLimit: 5})
	if err != nil {
		return err
	}
	pending, err := s.adminPaymentViews(ctx, rows)
	if err != nil {
		return err
	}
	count, err := s.Q.PendingSubscriptionPaymentCount(ctx)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, M{
		"approved_month_cents": stats.Approved, "shops_count": stats.Shops, "pending_count": count,
		"locked_count": stats.Locked, "pending": pending,
	})
}

func (s *Server) adminPayments(c *echo.Context) error {
	if _, err := s.admin(c); err != nil {
		return err
	}
	ctx := c.Request().Context()
	status := c.QueryParam("status")
	if status == "" {
		status = "pending"
	}
	params := store.SubscriptionPaymentListParams{RowLimit: 500}
	if status != "all" {
		value, _ := domain.SubscriptionPaymentStatusValue(status)
		params.Status = &value
	}
	rows, err := s.Q.SubscriptionPaymentList(ctx, params)
	if err != nil {
		return err
	}
	payments, err := s.adminPaymentViews(ctx, rows)
	if err != nil {
		return err
	}
	count, err := s.Q.PendingSubscriptionPaymentCount(ctx)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, M{"status": status, "payments": payments, "pending_count": count})
}

// approvePayment is BR-43.
func (s *Server) approvePayment(c *echo.Context) error {
	admin, err := s.admin(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	var row store.LockSubscriptionPaymentRow
	var paidThrough *time.Time
	err = s.tx(ctx, func(q *store.Queries) error {
		row, err = q.LockSubscriptionPayment(ctx, paramID(c))
		if err != nil {
			return err
		}
		paidThrough, err = domain.ApproveSubscriptionPayment(ctx, q, row.SubscriptionPayment, admin.User.ID)
		if err == nil && paidThrough == nil {
			err = apperr.NewRule("That payment was already reviewed.")
		}
		return err
	})
	if err != nil {
		return err
	}
	s.Notify.SubscriptionPaymentApproved(ctx, row.SubscriptionPayment.SubmittedByID, *paidThrough)
	return notice(c, "Approved. "+row.ShopName+" is paid through "+util.LongDate(*paidThrough)+".", nil)
}

// rejection is a review's "no", with the reason the submitter reads.
type rejection struct {
	RejectionReason string `json:"rejection_reason"`
}

// rejectPayment is BR-44.
func (s *Server) rejectPayment(c *echo.Context) error {
	admin, err := s.admin(c)
	if err != nil {
		return err
	}
	var in rejection
	if err := decode(c, &in); err != nil {
		return err
	}
	ctx := c.Request().Context()
	var row store.LockSubscriptionPaymentRow
	var reason string
	err = s.tx(ctx, func(q *store.Queries) error {
		row, err = q.LockSubscriptionPayment(ctx, paramID(c))
		if err != nil {
			return err
		}
		reason, err = domain.RejectSubscriptionPayment(ctx, q, row.SubscriptionPayment, admin.User.ID, in.RejectionReason)
		if err == nil && reason == "" {
			err = apperr.NewRule("That payment was already reviewed.")
		}
		return err
	})
	if err != nil {
		return err
	}
	s.Notify.SubscriptionPaymentRejected(ctx, row.SubscriptionPayment.SubmittedByID, reason)
	return notice(c, "Rejected. The owner has been told why.", nil)
}

func (s *Server) adminShops(c *echo.Context) error {
	if _, err := s.admin(c); err != nil {
		return err
	}
	ctx := c.Request().Context()
	shops, err := s.Q.AdminShops(ctx)
	if err != nil {
		return err
	}
	out := make([]M, 0, len(shops))
	for _, shop := range shops {
		var view *domain.SubscriptionDTO
		sub, err := domain.SubscriptionFor(ctx, s.Q, shop.ID)
		if err != nil {
			return err
		}
		if sub != nil {
			dto := domain.SubscriptionView(*sub)
			view = &dto
		}
		out = append(out, M{"id": shop.ID, "name": shop.Name, "owner_name": shop.OwnerName, "owner_email": shop.OwnerEmail, "subscription": view})
	}
	return c.JSON(http.StatusOK, M{"shops": out})
}

// ---------------------------------------------------------- notifications

func (s *Server) notifications(c *echo.Context) error {
	cur, err := s.currentUser(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	rows, err := s.Q.RecentNotifications(ctx, cur.User.ID)
	if err != nil {
		return err
	}
	unread, err := s.Q.UnreadCount(ctx, cur.User.ID)
	if err != nil {
		return err
	}
	out := make([]M, 0, len(rows))
	for _, n := range rows {
		out = append(out, M{"id": n.ID, "kind": n.Kind, "title": n.Title, "body": n.Body, "path": n.Path, "read": n.ReadAt != nil, "created_at": n.CreatedAt})
	}
	return c.JSON(http.StatusOK, M{"notifications": out, "unread_count": unread})
}

func (s *Server) readNotification(c *echo.Context) error {
	cur, err := s.currentUser(c)
	if err != nil {
		return err
	}
	path, err := s.Q.ReadNotification(c.Request().Context(), store.ReadNotificationParams{ID: paramID(c), UserID: cur.User.ID})
	if err != nil {
		return err
	}
	if path != nil && *path == "" {
		path = nil
	}
	return c.JSON(http.StatusOK, M{"path": path})
}

func (s *Server) readAllNotifications(c *echo.Context) error {
	cur, err := s.currentUser(c)
	if err != nil {
		return err
	}
	if err := s.Q.ReadAllNotifications(c.Request().Context(), cur.User.ID); err != nil {
		return err
	}
	return notice(c, "All caught up.", nil)
}

type pushInput struct {
	Endpoint  string `json:"endpoint"`
	P256dhKey string `json:"p256dh_key"`
	AuthKey   string `json:"auth_key"`
}

// subscribePush stores the endpoint and two keys the browser hands over —
// the triple that lets the server push to this one device.
func (s *Server) subscribePush(c *echo.Context) error {
	cur, err := s.currentUser(c)
	if err != nil {
		return err
	}
	var in pushInput
	if err := decode(c, &in); err != nil {
		return err
	}
	if in.Endpoint == "" || in.P256dhKey == "" || in.AuthKey == "" {
		return apperr.NewValidation("Endpoint, keys and auth are required")
	}
	err = s.Q.UpsertPushSubscription(c.Request().Context(), store.UpsertPushSubscriptionParams{
		UserID: cur.User.ID, Endpoint: in.Endpoint, P256dhKey: in.P256dhKey, AuthKey: in.AuthKey,
		UserAgent: util.Presence(c.Request().UserAgent()),
	})
	if err != nil {
		return err
	}
	return c.JSON(http.StatusCreated, M{})
}

func (s *Server) unsubscribePush(c *echo.Context) error {
	cur, err := s.currentUser(c)
	if err != nil {
		return err
	}
	var in pushInput
	if err := decode(c, &in); err != nil {
		return err
	}
	if err := s.Q.DeletePushSubscription(c.Request().Context(), store.DeletePushSubscriptionParams{UserID: cur.User.ID, Endpoint: in.Endpoint}); err != nil {
		return err
	}
	return c.JSON(http.StatusOK, M{})
}

// ------------------------------------------------------------ attachments

// attachment serves a screenshot to whoever is entitled to see it: the shop
// and the customer for a payment's photo, the shop and the operator for a
// billing payment.
func (s *Server) attachment(c *echo.Context) error {
	cur, err := s.currentUser(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	row, err := s.Q.AttachmentWithBlob(ctx, paramID(c))
	if err != nil {
		return err
	}
	allowed := false
	switch row.RecordType {
	case domain.TransactionRecordType:
		allowed, err = s.Q.TransactionVisibleTo(ctx, store.TransactionVisibleToParams{ID: row.RecordID, UserID: cur.User.ID})
	case domain.UserRecordType, domain.ShopRecordType:
		// Profile photos of people and shops: shown to anyone signed in.
		allowed = true
	case domain.SubscriptionPaymentRecordType:
		allowed = cur.User.PlatformAdmin
		if !allowed {
			allowed, err = s.Q.SubscriptionPaymentOwnedBy(ctx, store.SubscriptionPaymentOwnedByParams{ID: row.RecordID, OwnerID: cur.User.ID})
		}
	}
	if err != nil {
		return err
	}
	if !allowed {
		return apperr.ErrNotFound
	}
	data, err := s.Files.Get(ctx, row.Key)
	if err != nil {
		slog.Error("blob is missing", "key", row.Key, "error", err)
		return apperr.NewNotFound("That file is missing.")
	}
	contentType := util.Deref(row.ContentType)
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	c.Response().Header().Set("Cache-Control", "private, max-age=86400")
	return c.Blob(http.StatusOK, contentType, data)
}
