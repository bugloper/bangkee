# Bangkee

A digital credit book for small shops in Bhutan. Bangkee replaces the
handwritten shop notebook with a **shared ledger** that the shop owner and the
customer can both see — and it installs on a phone as a PWA.

One Rails 8 app, Hotwire only. No mobile client, no JSON API surface.

```bash
bin/setup                       # or: bundle install && bin/rails db:prepare db:seed
bin/rails server -b 0.0.0.0 -p 3007
bin/rails test                 # Ruby: models, integration
bin/rails test:javascript      # Node: the offline queue's own logic
bin/rails test:system          # skips unless a headless Chrome is present
bin/ci                         # everything, plus rubocop and brakeman
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
- **Tabs (running bills)** — restaurants, bars and snooker halls note down what
  a table orders and settle at the end. Open a tab per table, add items as they
  are ordered, then settle it: **paid** there and then
  (nothing is owed, so nothing reaches the credit book — the tab is the record
  of the sale), or **on the book** (one itemised credit on that customer's
  page, from then on an ordinary ledger entry they can see and the owner can
  void), or **part paid** — some cash now, the difference on the book, which
  raises both entries so the page shows what was taken and what was handed over.
  A linked customer can watch the tab as it runs. An open tab is never a balance: the customer is still ordering, and
  half of them pay cash. The quick-add chips are learned from what the shop has
  actually sold — no price list to maintain.
- **Scan to order** — a printed QR card on each table. A customer scans it,
  reads the shop's menu on their own phone with no sign-up, and sends an order
  to the counter, where the screen refreshes itself and chimes. An order is a
  request until someone accepts it; accepting copies its lines onto that
  table's tab. See below.
- **§16 bank-transfer settlement** — the owner publishes bank details, the
  customer uploads a transfer screenshot, and the owner's confirmation is what
  creates the payment. A pending proof never moves the balance.
- **Share a receipt from your bank** — finish a transfer in BoB, mBoB, BNB or
  PNB, tap Share, pick Bangkee. Claude reads the amount, reference, date and
  beneficiary off the receipt, Bangkee matches the beneficiary to the shop that
  published that account, and the customer confirms. See below.
- **§17 subscription billing** — Nu 200/month, manual: 14-day trial, 14-day
  grace, then owner **writes** are locked (reads never are, and customers are
  never affected). A platform admin approves payment screenshots.
- **Notifications** — every event writes an in-app notification (the bell), a
  Web Push message to each device that opted in, and an email. All three are
  queued, so a mail server that is down or a dead push endpoint can never stop
  the ledger from being written.

`bangkee-srs.docx` is the authoritative specification (convert it with
`textutil -convert txt bangkee-srs.docx`). The UI is built from the Claude
Design canvas in `bangkee.html`; the brief that produced it is
`design/PWA_DESIGN_PROMPT.md`.

Seeds include two pending payment proofs and a subscription payment with a
sample receipt image (`db/seed_assets/`), so the review queues and the
screenshot viewer have something real in them.

## Language

English and Dzongkha (`en`, `dz`), with **fallbacks to English**, so a
half-finished translation is usable rather than broken — an untranslated key
shows English instead of erroring. A signed-in person's language lives on their
account so it follows them to another device; a walk-in reading a menu has no
account, so `?locale=` puts it in their session. An unknown or stale locale is
ignored rather than trusted.

`config/locales/en.yml` holds the screens a customer reads — their home, their
page at a shop, uploading a proof, notifications, and the shared chrome. Owner
and operator screens are still written inline; extracting them is the same
mechanical job.

**To translate:** copy a key from `en.yml` into `dz.yml`, put the Dzongkha next
to it, and it appears immediately. There is no wrong moment to stop.

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
  install event, so an "on iPhone?" sheet explains Share → Add to Home Screen.
- Notification permission is asked for **after a write** (a credit, a payment, a
  submitted proof) through a sheet that says what the notifications are for —
  never on arrival, and "Not now" is remembered on the device. A browser refuses
  a permission request that is not tied to a gesture, so the sheet's button is
  what actually asks.
- Loading state is Turbo's own progress bar, styled to the brand. A skeleton
  would be a picture of a wait that a Hotwire navigation does not have.
- The offline banner is driven by `offline_controller.js`.
- **Background Sync**: queuing an entry registers a `bangkee-queued-writes`
  sync, so the browser drains the queue once there is signal even if Bangkee has
  been closed. The service worker duplicates the replay (a worker cannot import
  the page's module) and treats a 422 as "the stored token went stale" — it
  leaves the entry for a page to retry with a fresh one. Safari has no
  Background Sync, so on iPhones the page-side replay is the whole story.

### Recording with no signal

A shop owner *will* write in the book while the connection is gone, so credits
and payments are queued on the device instead of failing:

- `app/javascript/offline_queue.js` keeps entries in **IndexedDB** — they have
  to survive a crash mid-write — and replays them oldest-first when the browser
  says it is online again. A request that never leaves stops the run so entries
  keep their order; a 4xx marks the entry for the owner instead of retrying it
  forever.
- The browser stamps each entry with an `idempotency_key`, and
  `IdempotentWrites` makes the second arrival of a key a no-op. A replay can and
  does happen twice.
- Queued entries appear on the account under **Waiting to send**, rendered from
  IndexedDB because they exist nowhere else yet.
- Replays carry the CSRF token from the page they are sent from (the `csrf-token`
  meta tag, not the per-form token, which would be stale).
- Credits, payments and **rounds added to an open tab** queue. Screenshots do
  not — they are uploads, and a half-sent image is worse than an honest failure
  — and neither does opening or settling a tab, which are conversations with the
  server rather than one repeatable POST.
- Entries are grouped by the screen that shows them (`account:12`, `tab:5`), so
  a round waiting to reach one tab never appears against another.

### Scan to order

`ShopTable` is a place in the shop that keeps its identity between sittings —
the printed card outlives the tab, so the QR points at the table, not the bill.
`MenuItem` is what customers read (the tab's quick-add chips are still learned
from history; a diner cannot be asked to type "Ema datshi 180"). `TableOrder`
is what they send.

- **The ordering pages are public.** A diner is not a Bangkee user, so the
  table's token is the whole of the identification. That token is unguessable
  and the pages are rate limited, but **anyone who can see a card can order from
  that table** — which is why an order is a request, not a charge.
- **Prices come from the menu, never from the form.** The form posts quantities
  keyed by menu item; a price in a form field is a price the customer can edit.
  Quantities are capped.
- **Accepting is what makes it real.** It copies the lines onto the table's tab,
  opening one if the group has not been set up yet, after which they are
  ordinary tab items and settle the usual two ways.
- **The counter polls and chimes.** `counter_controller.js` re-checks every five
  seconds and plays a synthesised two-note chime — no audio file to fail to
  load. Browsers refuse to play sound until the page has been interacted with,
  so **staff must tap "Sound on" once per device**; the choice is remembered.
  The owner also gets the usual push notification, for when nobody is at the
  counter.
- A write-locked shop still receives orders (the diner does not owe Bangkee
  anything) but cannot accept them until billing is sorted.
- Table cards print two-up from **Tables → Print the table cards**.

### Sharing a receipt in

Bhutanese banking apps end a transfer on a receipt screen with a Share button.
Bangkee registers as a **Web Share Target** (`share_target` in the manifest), so
it appears in that share sheet and the receipt arrives as a plain multipart POST
to `SharedReceiptsController#create`.

- **Android only, and only once installed.** Safari implements no share target
  at all, so on an iPhone this route does not exist and payments are entered by
  hand. Both screens say so rather than leaving people hunting for it.
- The POST comes from the OS with no CSRF token, so `create` skips forgery
  protection. What that allows is bounded: it stores a picture against the
  signed-in user and moves no money. Which shop, and how much, are confirmed
  afterwards on an ordinary protected form.
- Sharing while signed out would lose the file on the redirect, so the image is
  banked as a blob first and picked up after sign-in.
- `ReceiptExtractor` reads it with **Claude (`claude-opus-5`), vision plus
  structured outputs** — the JSON schema is the contract, so nothing parses
  prose. Every field is nullable and the prompt says to leave a field null
  rather than guess: a wrong amount on a payment claim is worse than a blank
  one. Set `ANTHROPIC_API_KEY` to turn it on; **without a key the flow still
  works**, the form is just empty.
  A cheaper model is a one-line change in `ReceiptExtractor::MODEL` if the
  volume ever justifies it.
- `ReceiptAccountMatcher` picks the shop by comparing the beneficiary against
  the bank details each shop published, over the customer's own accounts only.
  Masked numbers (`····8901`) match on the visible tail. **Two possible shops
  resolves to none** — that is a question for the customer, not a coin toss.
- Reading a receipt creates nothing. The customer confirms, which makes an
  ordinary pending `PaymentProof`; the shop still confirms after that (BR-30).

### Web Push (delivered by rpush)

```bash
bin/rails push:keys        # prints a VAPID pair
```

Put them in `.env` (development) or your production secrets:

```
VAPID_PUBLIC_KEY=…
VAPID_PRIVATE_KEY=…
VAPID_SUBJECT=mailto:you@example.bt
```

Push is a **no-op until those are set**, so the app runs fine without them. A
device opts in from Settings → Push notifications (the request has to come from
a tap, and on iOS only once Bangkee is installed).

Delivery goes through **[rpush](https://github.com/rpush/rpush)**, not a direct
send. `PushDeliveryJob` writes one `Rpush::Webpush::Notification` per registered
device and stops there; the rpush daemon delivers them, with its own retries and
backoff, so nothing about a slow or failing push service can reach the request
that caused it. Two processes alongside the app:

```bash
bin/jobs                   # Solid Queue — emails, receipt reading, queueing the pushes
bundle exec rpush start    # delivery daemon — actually sends them
```

The rpush app row (`bangkee`) is created on first use from the VAPID keys and
updated if they are rotated. A dead endpoint — cleared site data, an uninstalled
PWA — comes back as a 404 or 410 on delivery, and `config/initializers/push_cleanup.rb`
deletes that `PushSubscription` when rpush reports it. That failure is the only
moment the app can learn a device is gone.

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
- **The schema started as one migration** (`*_create_initial_schema.rb`) while
  the app was pre-release and rebuilding was free. There is real shop data in
  development now, so that convention has ended — every change since
  `create_shared_receipts` is an ordinary migration, and `db:drop` is no longer
  something to reach for.
- **Authentication** is the Rails 8 generator, not Devise. One `User` with a
  `role` enum plus a `platform_admin` flag.

## Tests

`test/integration/stimulus_wiring_test.rb` walks every screen for all three
roles and cross-checks the markup against the Stimulus controllers: each
`data-action` names a controller and a method that exist, each `data-*-target`
and `data-*-value` is declared, each of them sits inside its controller's scope
(Stimulus resolves against the *nearest* enclosing controller, which is easy to
get wrong), no Stimulus `<button>` inside a form can submit it by accident, and
no icon-only control ships without a label. It exists because every client-side
bug that reached a user in this project was one of those.

`test/javascript/` holds Node tests for the offline queue with a hand-rolled
IndexedDB stub (`fake_browser.mjs`) — no npm dependencies. `test/system/` drives
the queue in a real browser and needs a headless Chrome; it skips itself when
there is none, so point it at one explicitly if your Chromium lives somewhere
odd:

```bash
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" bin/rails test:system
```

### Email

`NotificationMailer` sends one email per notification — the in-app row already
says what happened in the right words, so there is one template rather than six.
Development writes them to `tmp/mails`; preview at
`/rails/mailers/notification_mailer`. Production reads `SMTP_*` and
`BANGKEE_HOST` from the environment (see `.env.example`).

## Not built yet

- **Opening and settling a tab still need a connection.** Rounds added to a tab
  that already exists queue like credits and payments do, which covers the case
  that matters — a bar with no signal, adding drinks all evening. Opening a tab
  offline would mean inventing an id on the device and remapping it on replay,
  and settling offline would mean deciding a balance without the server.
- **The Dzongkha translation itself.** The plumbing is in and the screens a
  customer reads are extracted (see below); what is missing is a Dzongkha
  speaker to fill `config/locales/dz.yml`. Owner and operator screens have not
  been extracted yet — the same mechanical job, when someone wants them.
- **One shop per owner.** The data model allows more, but nothing in the
  interface manages a second shop and every query would need re-scoping. Not
  built on purpose: no one has asked for it, and the failure mode of getting
  the scoping wrong is an owner seeing another shop's ledger.
