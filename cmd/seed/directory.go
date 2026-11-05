package main

// Demo shops for the customer's Shops screen: twenty of every type, each
// with its own owner and items priced for its trade. They are added once — a database that already has them is left alone
// — so this runs on a database seeded before they existed, too.
//
// Owners sign in as owner.<type>.<nn>@demo.bangkee.bt with the usual password.

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"bangkee/internal/domain"
	"bangkee/internal/store"
)

const perKind = 20

type demoItem struct {
	name, category string
	price          int // Ngultrum
}

type demoKind struct {
	key, suffix string
	items       []demoItem
}

var demoKinds = []demoKind{
	{"restaurant", "Restaurant", []demoItem{
		{"Ema datshi", "Food", 180}, {"Kewa datshi", "Food", 160}, {"Shakam paa", "Food", 280}, {"Phaksha paa", "Food", 300},
		{"Jasha maru", "Food", 250}, {"Momo (10)", "Food", 120}, {"Red rice", "Food", 50}, {"Suja", "Drinks", 40}, {"Coke", "Drinks", 50},
	}},
	{"cafe", "Café", []demoItem{
		{"Cappuccino", "Coffee", 150}, {"Americano", "Coffee", 120}, {"Latte", "Coffee", 160}, {"Suja", "Tea", 50},
		{"Milk tea", "Tea", 40}, {"Banana bread", "Bakery", 100}, {"Croissant", "Bakery", 120}, {"Cheesecake", "Bakery", 180},
	}},
	{"bar", "Bar", []demoItem{
		{"Druk 11000", "Beer", 140}, {"Red Panda", "Beer", 160}, {"K5 whisky (peg)", "Spirits", 120}, {"Special Courier (peg)", "Spirits", 90},
		{"Fried chips", "Snacks", 120}, {"Sikam fry", "Snacks", 220}, {"Chilli chicken", "Snacks", 260},
	}},
	{"snooker", "Snooker", []demoItem{
		{"1 hour snooker", "Games", 150}, {"30 minutes snooker", "Games", 80}, {"1 hour pool", "Games", 120},
		{"Coke", "Drinks", 50}, {"Druk 11000", "Drinks", 140}, {"Milk tea", "Drinks", 30}, {"Maggi noodles", "Snacks", 70},
	}},
	{"grocery", "Grocery", []demoItem{
		{"Red rice (1 kg)", "Staples", 90}, {"Rice (25 kg)", "Staples", 1800}, {"Cooking oil (1 L)", "Staples", 210}, {"Sugar (1 kg)", "Staples", 80},
		{"Datshi (cheese)", "Fresh", 250}, {"Eggs (tray of 30)", "Fresh", 300}, {"Onions (1 kg)", "Fresh", 60}, {"Chillies (1 kg)", "Fresh", 200},
	}},
	{"pharmacy", "Pharmacy", []demoItem{
		{"Paracetamol (10)", "Medicine", 20}, {"Cough syrup", "Medicine", 120}, {"ORS sachet", "Medicine", 15}, {"Vitamin C (strip)", "Medicine", 60},
		{"Bandages (box)", "First aid", 80}, {"Antiseptic cream", "First aid", 90}, {"Face masks (10)", "First aid", 50},
	}},
	{"other", "General Store", []demoItem{
		{"Notebook", "Stationery", 60}, {"Pens (pack of 5)", "Stationery", 50}, {"Batteries AA (4)", "Household", 120},
		{"Torch light", "Household", 350}, {"Umbrella", "Household", 450}, {"Phone charger", "Electronics", 400},
	}},
}

// Twenty names a shop in Bhutan might carry.
var demoNames = []string{
	"Druk", "Norling", "Tashi Delek", "Zhiwa", "Pelden", "Yangkhil", "Kuensel", "Rabten", "Ugyen", "Dechen",
	"Namgay", "Phuntsho", "Lhakhang View", "Dochula", "Thimphu Town", "Paro Valley", "Punakha", "Bumthang", "Gakyid", "Tendrel",
}

// Where the demo shops are.
var demoTowns = []string{"Norzin Lam, Thimphu", "Changzamtog, Thimphu", "Paro Town", "Phuentsholing", "Punakha", "Wangdue", "Bumthang", "Gelephu"}

// Owners' names, one per shop of a type.
var demoOwners = []string{
	"Tshering Wangchuk", "Pema Lhamo", "Kinley Dorji", "Sonam Choden", "Ugyen Tenzin", "Dechen Wangmo", "Karma Tshering",
	"Yeshey Zangmo", "Namgay Dorji", "Choki Lhamo", "Jigme Norbu", "Tandin Bidha", "Sangay Tenzin", "Deki Yangzom",
	"Phurba Wangdi", "Ngawang Pelmo", "Rinchen Dorji", "Tshewang Lhamo", "Dorji Wangchuk", "Kuenzang Choden",
}

func seedDirectory(ctx context.Context, db *pgxpool.Pool, priceCents int64) error {
	q := store.New(db)
	first := fmt.Sprintf("owner.%s.01@demo.bangkee.bt", demoKinds[0].key)
	if existing, err := domain.UserByEmail(ctx, q, first); err != nil || existing != nil {
		if existing != nil {
			fmt.Println("Demo shops already there.")
		}
		return err
	}
	// One hash for every demo owner: bcrypt is slow on purpose, and 140 of
	// them would take most of a minute.
	digest, err := domain.HashPassword(password)
	if err != nil {
		return err
	}

	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	q = q.WithTx(tx)

	for k, kind := range demoKinds {
		for i := range perKind {
			n := i + 1
			email := fmt.Sprintf("owner.%s.%02d@demo.bangkee.bt", kind.key, n)
			phone := fmt.Sprintf("17 %d%d %02d %02d", 7+k%3, k, n, (n*7+k)%100)
			ownerID, err := q.CreateUser(ctx, store.CreateUserParams{
				Name: demoOwners[i], EmailAddress: &email, Phone: &phone, PasswordDigest: digest, Role: domain.RoleShopOwner,
			})
			if err != nil {
				return err
			}
			name := demoNames[i] + " " + kind.suffix
			shopID, err := domain.CreateShop(ctx, q, ownerID, name, priceCents)
			if err != nil {
				return err
			}
			profile := domain.ShopProfileInput{Name: name, Kind: kind.key, Location: demoTowns[(i+k)%len(demoTowns)], Phone: phone}
			if err := domain.UpdateShopProfile(ctx, q, shopID, profile); err != nil {
				return err
			}
			for p, item := range kind.items {
				position := int32(p)
				_, _, err := domain.SaveMenuItem(ctx, q, shopID, nil, domain.MenuItemInput{
					Name: item.name, Category: item.category, Price: fmt.Sprint(demoPrice(item.price, i, p)), Available: true, Position: &position,
				})
				if err != nil {
					return err
				}
			}
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	fmt.Printf("Seeded %d demo shops: %d of each type. Owners: owner.<type>.<01-%02d>@demo.bangkee.bt / %s\n",
		perKind*len(demoKinds), perKind, perKind, password)
	return nil
}

// demoPrice varies a price a little from shop to shop — within a tenth
// either way, rounded to Nu. 5 — so twenty shops do not all charge the same.
func demoPrice(base, shop, item int) int {
	percent := 90 + (shop*7+item*3)%21
	price := (base*percent/100 + 2) / 5 * 5
	return max(price, 5)
}
