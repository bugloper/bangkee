# Bangkee

A digital credit book for small shops in Bhutan. Bangkee replaces the
handwritten shop notebook with a **shared ledger** that the shop owner and the
customer can both see — and it installs on a phone as a PWA.

One Rails 8 app, Hotwire only. No mobile client, no JSON API surface.

```bash
bin/setup                       # or: bundle install && bin/rails db:prepare db:seed
bin/rails server -b 0.0.0.0 -p 3007
bin/rails test
```

Demo logins (from `db/seeds.rb`, password `password`):

| Who | Email |
| --- | --- |
| Shop owner | `karma@shop.bt` |
| Customer | `dawa@example.bt` |
| Bangkee operator | `admin@bangkee.bt` |

## What it does

- **Ledger** — an owner keeps an `Account` per customer and records **credits**
  (goods on tick) and **payments**. A credit can be simple or itemized. Balance
  is cached on the account: positive means the customer owes the shop.
- **Void, never delete** — a voided transaction stays visible, struck through,
  out of the balance, and in an append-only `audit_events` log.
- **Invitations** — the owner shares `/join/:token`; the customer signs up and
  from then on watches their own balance.
- **§16 bank-transfer settlement** — the owner publishes bank details, the
  customer uploads a transfer screenshot, and the owner's confirmation is what
  creates the payment. A pending proof never moves the balance.
- **§17 subscription billing** — Nu 200/month, manual: 14-day trial, 14-day
  grace, then owner **writes** are locked (reads never are, and customers are
  never affected). A platform admin approves payment screenshots.
- **Notifications** — every event writes an in-app notification (the bell) and
  a Web Push message to each device that opted in.

`bangkee-srs.docx` is the authoritative specification (convert it with
`textutil -convert txt bangkee-srs.docx`). The UI is built from the Claude
Design canvas in `bangkee.html`; the brief that produced it is
`design/PWA_DESIGN_PROMPT.md`.

## Design system

Material 3 "Trust Blue", Inter, 8px baseline — the whole system is
`app/assets/stylesheets/application.css`, tokens first. Colour carries meaning
and is used consistently: **red = owed / credit given, green = paid / settled,
amber = pending or overdue, blue = navigation and primary action.**

Mobile-first with one breakpoint at 768px, where the bottom tab bar becomes a
left sidebar. Every screen has its own back affordance, because in standalone
mode there is no browser toolbar.

## PWA

- `GET /manifest.webmanifest` and `GET /service-worker.js` are rendered by
  `PwaController` from `app/views/pwa/`.
- Navigations are network-first with a cache fallback, then `/offline`; assets
  are cache-first. Writes always go to the network.
- The install card appears when the browser offers installation. iOS gives no
  install event, so Settings explains Share → Add to Home Screen.
- The offline banner is driven by `offline_controller.js`.

### Web Push

```bash
bin/rails push:keys        # prints a VAPID pair
```

Put them in `.env` (development) or your production secrets:

```
VAPID_PUBLIC_KEY=…
VAPID_PRIVATE_KEY=…
VAPID_SUBJECT=mailto:you@example.bt
```

Push is a **logged no-op until those are set**, so the app runs fine without
them. A device opts in from Settings → Push notifications (the request has to
come from a tap, and on iOS only once Bangkee is installed). Delivery runs
through `PushDeliveryJob` on Solid Queue: `bin/jobs`.

## Conventions worth knowing before you edit

- **Money** is integer chetrum in `*_cents` columns. `HasMoneyAttribute` adds a
  major-unit accessor for forms; the `ngultrum` helper formats `Nu. 1,250`.
- **`LineItem belongs_to :purchase`** (class_name `Transaction`, fk
  `transaction_id`) — an association named `transaction` collides with
  ActiveRecord's own `transaction` method. Same reason for
  `PaymentProof belongs_to :payment_transaction`. Don't "fix" either.
- **`subscription_payments.method`** shadows `Object#method`; read it through
  `SubscriptionPayment#payment_method`.
- **Subscription status is derived from server time** (`effective_status`), not
  the stored column. The column is a cache that `refresh_status!` corrects.
- **The schema is one migration** (`db/migrate/*_create_initial_schema.rb`) by
  choice while the app is pre-release. To rebuild: `rm db/schema.rb` first, then
  `bin/rails db:drop db:create db:migrate db:seed`.
- **Authentication** is the Rails 8 generator, not Devise. One `User` with a
  `role` enum plus a `platform_admin` flag.

## Not built yet

- **Queued offline writes.** The design shows a credit recorded with no signal
  sitting in a "queued" state. Reads work offline today; writes still need the
  network. It wants IndexedDB plus Background Sync in the service worker.
- Email notifications alongside in-app/push (§16.7 says SHOULD).
- Dzongkha localisation. No string is baked into an image, so it is a matter of
  extracting them.
