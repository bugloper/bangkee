// Package config reads everything the server takes from its environment. The
// names are the ones the Rails app and its render.yaml used, so a deploy can
// switch servers without renaming a single secret. Everything optional
// degrades to "off".
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	DatabaseURL string
	Port        string
	// Signs the short-lived cookies (a pending invite) and password reset
	// links. Sessions themselves are rows, so
	// rotating it signs nobody out.
	SecretKeyBase string
	// Used to build absolute links in email.
	Host     string
	Storage  Storage
	Vapid    *Vapid
	SMTP     *SMTP
	MailFrom string
	Operator OperatorBilling
}

type Storage struct {
	S3              bool
	Bucket          string
	Region          string
	AccessKeyID     string
	SecretAccessKey string
	Endpoint        string
}

type Vapid struct {
	PublicKey  string
	PrivateKey string
	Subject    string
}

type SMTP struct {
	Address  string
	Port     int
	UserName string
	Password string
}

// OperatorBilling is where a shop owner sends their subscription: three
// plans, each priced monthly and billed annually. Manual billing, so this is just the
// operator's own account details.
//
// PriceCents applies to shops opened from now on; a shop keeps the price it
// signed up at (subscriptions.price_cents).
type OperatorBilling struct {
	BankName      string
	AccountName   string
	AccountNumber string
	Branch        string
	PriceCents    int64
}

// AnnualPriceCents is what one year of Basic costs.
func (o OperatorBilling) AnnualPriceCents() int64 { return 12 * o.PriceCents }

// The higher plans' monthly prices. Basic is PriceCents.
const (
	ProPriceCents      = 30_000 // Nu. 300 a month
	BusinessPriceCents = 50_000 // Nu. 500 a month
)

// PlanPriceCents is a plan's monthly price for a shop choosing it now.
func (o OperatorBilling) PlanPriceCents(plan string) int64 {
	switch plan {
	case "pro":
		return ProPriceCents
	case "business":
		return BusinessPriceCents
	}
	return o.PriceCents
}

func (o OperatorBilling) Instructions() string {
	return "Transfer a year of your chosen plan to the account below, then upload the transfer screenshot here. " +
		"Bangkee approves payments within one working day."
}

func thousands(n int64) string {
	digits := strconv.FormatInt(n, 10)
	var out strings.Builder
	for i, d := range digits {
		if i > 0 && (len(digits)-i)%3 == 0 {
			out.WriteByte(',')
		}
		out.WriteRune(d)
	}
	return out.String()
}

func present(name string) string {
	return strings.TrimSpace(os.Getenv(name))
}

func or(name, fallback string) string {
	if value := present(name); value != "" {
		return value
	}
	return fallback
}

func FromEnv() (Config, error) {
	cfg := Config{
		DatabaseURL:   present("DATABASE_URL"),
		Port:          or("PORT", "3000"),
		SecretKeyBase: present("SECRET_KEY_BASE"),
		Host:          or("BANGKEE_HOST", "bangkee.bt"),
		MailFrom:      or("BANGKEE_MAIL_FROM", "Bangkee <notifications@bangkee.bt>"),
		Operator: OperatorBilling{
			BankName:      or("BANGKEE_BANK_NAME", "Bank of Bhutan"),
			AccountName:   or("BANGKEE_ACCOUNT_NAME", "Bangkee"),
			AccountNumber: or("BANGKEE_ACCOUNT_NUMBER", "1010 2030 4050"),
			Branch:        or("BANGKEE_BRANCH", "Thimphu Main"),
			PriceCents:    15_000, // Nu. 150 a month
		},
	}
	if cfg.DatabaseURL == "" {
		return cfg, fmt.Errorf("DATABASE_URL is not set")
	}
	if price, err := strconv.ParseInt(present("BANGKEE_PRICE_CENTS"), 10, 64); err == nil {
		cfg.Operator.PriceCents = price
	}

	if present("ACTIVE_STORAGE_SERVICE") == "s3" {
		cfg.Storage = Storage{
			S3:              true,
			Bucket:          present("S3_BUCKET"),
			Region:          or("S3_REGION", "auto"),
			AccessKeyID:     present("S3_ACCESS_KEY_ID"),
			SecretAccessKey: present("S3_SECRET_ACCESS_KEY"),
			Endpoint:        present("S3_ENDPOINT"),
		}
		if cfg.Storage.Bucket == "" {
			return cfg, fmt.Errorf("ACTIVE_STORAGE_SERVICE=s3 needs S3_BUCKET")
		}
	}

	if public, private := present("VAPID_PUBLIC_KEY"), present("VAPID_PRIVATE_KEY"); public != "" && private != "" {
		cfg.Vapid = &Vapid{PublicKey: public, PrivateKey: private, Subject: or("VAPID_SUBJECT", "mailto:hello@bangkee.bt")}
	}

	if address := present("SMTP_ADDRESS"); address != "" {
		port, err := strconv.Atoi(present("SMTP_PORT"))
		if err != nil {
			port = 587
		}
		cfg.SMTP = &SMTP{Address: address, Port: port, UserName: present("SMTP_USER_NAME"), Password: present("SMTP_PASSWORD")}
	}
	return cfg, nil
}
