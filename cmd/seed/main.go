// Demo data — a shop with a month of real-looking book-keeping, so every
// screen has something to show. The same people, amounts and dates the Rails
// seeds wrote. For a development database only:
//
//	go run ./cmd/seed
//
// The demo shop is written once: nothing happens to it if its owner already
// exists. The directory of demo shops (directory.go) is added the same way,
// on its own, so an older seeded database gets it too.
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/joho/godotenv"

	"bangkee/internal/config"
	"bangkee/internal/database"
	"bangkee/internal/domain"
	"bangkee/internal/storage"
	"bangkee/internal/store"
	"bangkee/internal/util"
)

const password = "password"

func main() {
	if err := seed(); err != nil {
		log.Fatal(err)
	}
}

func ago(days int) string { return time.Now().AddDate(0, 0, -days).Format(time.RFC3339) }

func seed() error {
	_ = godotenv.Load(".env")
	cfg, err := config.FromEnv()
	if err != nil {
		return err
	}
	ctx := context.Background()
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

	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	q := store.New(db).WithTx(tx)

	if existing, err := domain.UserByEmail(ctx, q, "karma@shop.bt"); err != nil || existing != nil {
		if err != nil {
			return err
		}
		fmt.Println("Demo shop already there — karma@shop.bt exists.")
		tx.Rollback(ctx)
		return seedDirectory(ctx, db, cfg.Operator.PriceCents)
	}

	user := func(email, name, phone string, role int32) store.User {
		u, err := domain.CreateUser(ctx, q, domain.NewUser{Name: name, EmailAddress: email, Phone: phone, Password: password, Role: role})
		must(err)
		return u
	}
	admin := user("admin@bangkee.bt", "Bangkee Operator", "", domain.RoleShopOwner)
	must(q.MakePlatformAdmin(ctx, admin.ID))
	owner := user("karma@shop.bt", "Karma Dorji", "17 55 66 77", domain.RoleShopOwner)
	shopID, err := domain.CreateShop(ctx, q, owner.ID, "Karma General Shop", cfg.Operator.PriceCents)
	must(err)
	must(q.SetShopKind(ctx, store.SetShopKindParams{ID: shopID, Kind: util.Ptr("grocery")}))
	must(domain.SaveBankAccount(ctx, q, shopID, 0, domain.BankAccountInput{
		BankName: "Bank of Bhutan", AccountName: "Karma Dorji", AccountNumber: "1023 4567 8901", Branch: "Thimphu Main",
		MobileWallet: "mBoB 17 55 66 77", Primary: true,
		Instructions: "Show me the payment screen in mBoB after transferring.",
	}))
	customer := user("dawa@example.bt", "Dawa Tashi", "17 61 23 45", domain.RoleCustomer)

	type entry struct {
		amount int
		what   string
		days   int
	}
	people := []struct {
		name, phone       string
		credits, payments []entry
	}{
		{"Tashi Wangmo", "17 61 23 45", []entry{{1200, "Groceries — monthly", 29}, {800, "Festival goods", 9}}, []entry{{500, "Cash", 16}}},
		{"Pema Choden", "77 23 45 67", []entry{{600, "Vegetables and dry goods", 26}, {460, "Household items", 13}}, []entry{{200, "Cash", 19}}},
		{"Sonam Tobgay", "17 89 01 23", []entry{{750, "Monthly groceries", 28}}, []entry{{750, "Mobile transfer", 3}}},
		{"Dechen Lhamo", "77 12 98 76", nil, []entry{{300, "Cash", 6}}},
		{"Ugyen Penjor", "77 44 55 66", []entry{{3500, "Building materials", 59}, {1620, "Cement — 4 bags", 34}}, nil},
		{"Kinley Zangmo", "17 33 44 55", []entry{{1250, "Shop goods on tick", 6}}, nil},
	}
	accounts := map[string]store.Account{}
	for i, person := range people {
		account, err := domain.CreateAccount(ctx, q, shopID, domain.AccountInput{CustomerName: person.name, CustomerPhone: person.phone}, owner.ID)
		must(err)
		if i == 0 {
			_, err := domain.ClaimAccount(ctx, q, account, customer)
			must(err)
		}
		for _, c := range person.credits {
			_, err := domain.RecordEntry(ctx, q, account.ID, owner.ID, domain.EntryInput{Kind: domain.Credit, Amount: fmt.Sprint(c.amount), Description: c.what, OccurredAt: ago(c.days)})
			must(err)
		}
		for _, p := range person.payments {
			_, err := domain.RecordEntry(ctx, q, account.ID, owner.ID, domain.EntryInput{Kind: domain.Payment, Amount: fmt.Sprint(p.amount), PaymentMethod: p.what, OccurredAt: ago(p.days)})
			must(err)
		}
		accounts[person.name] = account
	}

	// An itemized purchase, so that screen has something real in it.
	tashi := accounts["Tashi Wangmo"]
	_, err = domain.RecordEntry(ctx, q, tashi.ID, owner.ID, domain.EntryInput{
		Kind: domain.Credit, Itemized: true, Description: "Itemized purchase", OccurredAt: ago(21),
		LineItems: []domain.LineInput{{Name: "Rice 25 kg", Quantity: "1", UnitPrice: "620"}, {Name: "Cooking oil 1 L", Quantity: "2", UnitPrice: "95"}, {Name: "Salt 1 kg", Quantity: "2", UnitPrice: "70"}},
	})
	must(err)
	// A crossed-out entry, so that look is on screen.
	crossed, err := domain.RecordEntry(ctx, q, tashi.ID, owner.ID, domain.EntryInput{Kind: domain.Credit, Amount: "400", Description: "School supplies", OccurredAt: ago(11)})
	must(err)
	_, err = domain.CrossOutTransaction(ctx, q, crossed.Entry, owner.ID)
	must(err)

	// A transfer paid at the counter, with the photo the shop took of the
	// customer's payment screen.
	shotData, err := os.ReadFile("db/seed_assets/transfer_screenshot.png")
	must(err)
	shot := &domain.Upload{Filename: "transfer.png", ContentType: "image/png", Data: shotData}
	transfer, err := domain.RecordEntry(ctx, q, accounts["Pema Choden"].ID, owner.ID, domain.EntryInput{
		Kind: domain.Payment, Amount: "500", PaymentMethod: "Mobile transfer", Notes: "mBoB ref BT26082911022", OccurredAt: ago(2),
	})
	must(err)
	must(domain.AttachScreenshot(ctx, q, files, transfer.Entry.ID, shot))

	// §17 — one payment waiting on the operator.
	_, _, _, err = domain.CreateSubscriptionPayment(ctx, q, files, shopID, owner.ID,
		domain.NewSubscriptionPayment{Amount: "3600", Months: "12", Method: "Bank transfer", Reference: "BT26081400431"}, shot)
	must(err)

	// The shop's items, to pick from when recording a credit.
	for i, item := range []struct {
		name, category string
		price          int
	}{
		{"Rice 25 kg", "Staples", 620}, {"Red rice 1 kg", "Staples", 90}, {"Cooking oil 1 L", "Staples", 95}, {"Salt 1 kg", "Staples", 70},
		{"Datshi", "Fresh", 250}, {"Eggs (tray of 30)", "Fresh", 300}, {"Sweet tea", "Drinks", 30}, {"Coke", "Drinks", 50},
	} {
		position := int32(i)
		_, _, err := domain.SaveMenuItem(ctx, q, shopID, nil, domain.MenuItemInput{Name: item.name, Category: item.category, Price: fmt.Sprint(item.price), Available: true, Position: &position})
		must(err)
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}
	fmt.Println("Seeded: 1 shop, 6 accounts, a month of transactions, 1 payment with its photo, 8 items.")
	fmt.Printf("  owner    karma@shop.bt / %s\n  customer dawa@example.bt / %s\n  operator admin@bangkee.bt / %s\n", password, password, password)
	return seedDirectory(ctx, db, cfg.Operator.PriceCents)
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
