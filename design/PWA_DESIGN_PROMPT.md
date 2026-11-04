# Claude Design prompt — Bangkee PWA (Rails 8, web only)

> Copy everything below the line into Claude Design.

---

Design the complete UI for **Bangkee**, a digital credit book ("khata") for small
shops in Bhutan. It replaces the shopkeeper's handwritten notebook with a shared
ledger that both the shop owner and the customer can see. Deliver it as a
**responsive installable web app (PWA)** — there is no native mobile app in this
scope, so every mobile pattern must be expressed with web primitives.

## Product model (this is fixed — design to it, don't invent a different one)

- A **shop owner** signs up and gets one **Shop**. They create an **Account** per
  customer (name + optional phone). An account's **balance** is positive when the
  customer owes the shop, negative when they've paid in advance, zero when settled.
- The owner records **transactions** on an account: a **credit** (goods taken on
  tick — increases what's owed, red) or a **payment** (money received — decreases
  it, green). A credit can be *simple* (one amount + description) or *itemized*
  (line items: name, quantity, unit price, computed total).
- Transactions are never deleted, only **voided** — a voided row stays visible,
  struck through / dimmed, excluded from the balance, and written to an **audit log**.
- The owner shares an **invite link** so the customer can log in and watch their own
  balance. A customer may have accounts at several shops.
- **Bank-transfer settlement:** the owner publishes their shop's **bank accounts**
  (bank name, account name, account number, one marked *primary*). A customer who
  has paid by mobile banking uploads a **payment proof** (amount + a screenshot from
  their phone). It sits *pending* — no effect on the balance — until the owner
  **confirms** it (creates the payment) or **rejects** it with a reason.
- **Subscription billing:** each shop has a subscription — 14-day trial, then 14-day
  grace after lapse, then **write-locked** (owner can still read everything, but every
  write is refused). The owner uploads a **subscription payment** screenshot; a
  **platform administrator** approves or rejects it. So there are **three roles**:
  shop owner, customer, platform admin.
- **Money is Ngultrum**, formatted `Nu. 1,250` (whole) or `Nu. 1,250.50`. Always
  tabular figures so columns of digits align.

## Users and their conditions

Shopkeepers in a busy shop, often outdoors in bright sun or in a dim room, one hand
on the goods, on cheap Android phones with an intermittent 3G connection. Customers
are ordinary shoppers, some barely literate in English, checking "how much do I owe".
So: enormous tap targets, very high contrast, numbers big enough to read at arm's
length, no dependence on hover or precise pointing, no jargon, and a layout that
survives a 320px-wide screen and a 200%-zoomed browser.

## Design system (already decided — use exactly these tokens)

Material 3 "Trust Blue", typeface **Inter**, on an 8px baseline.

- primary / Trust Blue `#003d9b`, on-primary `#ffffff`, primary tint `#dae2ff`
- secondary / money-in green `#006c47`, tint `#d6f5e4`
- tertiary / debt red `#b02300`, tint `#ffdad2`
- status amber (pending, overdue-but-not-critical) `#8a6100`, tint `#fbe9c8`
- error `#ba1a1a`, error container `#ffdad6`
- background / surface `#f9f9ff`, card `#ffffff`, hairline `#e0e4f0`
- ink `#041b3c`, ink-soft `#434654`, muted `#737685`
- radii: 4px badges, 8px inputs/buttons/list items, 16px cards and sheets
- shadow: one soft ambient only — `0 2px 8px rgba(23,43,77,.08)`
- min touch target 48px (52px for primary actions and list rows)
- type scale: display-amount 32/40 bold (28/36 on mobile), headline-lg 24/32 semibold,
  headline-md 20/28 semibold, body-lg 18/26, body-md 16/24, label-md 14/20 semibold,
  label-sm 12/16 medium

Colour carries meaning and must be used consistently: **red = owed / credit given,
green = paid / settled, amber = pending or overdue, blue = navigation and primary
action.** Never colour-only — pair every status colour with a word or icon.

Style is **professional minimalism**: generous whitespace, no ornament, no gradients,
no illustration-heavy empty states, subtle depth only where something is tappable.

## Responsive behaviour (this is the core of the brief)

Design **two layouts for every screen**, and say how each component reflows:

- **Mobile (320–767px)** — the primary case. Single column, 16px side margins, content
  max 560px. Sticky top bar (56px: brand, current user, sign out). Fixed **bottom tab
  bar** respecting `env(safe-area-inset-bottom)`. Full-bleed list rows. Bottom sheets
  rather than centred modals. A single, reachable primary action per screen.
- **Desktop / tablet (768px+)** — a real desktop app, not a stretched phone. Centred
  1024px container; the bottom tabs become a **left sidebar** (or a top nav) with the
  same destinations; two-column layouts where they earn it (customer list beside the
  selected account's ledger; the balance card beside the quick actions); tables gain
  columns that are hidden on mobile (created-by, payment method, running balance).

Show the exact breakpoint behaviour for: the tab bar → sidebar transition, the stat
grid (2-up → 4-up), the ledger row (stacked → tabular), forms (full-width → two-column),
and the amount keypad.

## Screens to design

**Auth & onboarding**
1. Sign in (email + password, large fields, forgot-password link)
2. Sign up as a shop owner (name, email, password, shop name)
3. Forgot password / set new password
4. **Invitation landing** — a customer opens `/join/:token`: shows the shop name and
   what they're joining, then sign-in or create-account inline

**Shop owner**
5. **Owner dashboard** — hero card "Total outstanding credit" (huge Trust-Blue amount),
   stat tiles (customers, repaid this month), primary "Add customer" action, a quick-link
   row (payment proofs with a pending count, bank details, billing), an **Overdue balances**
   list, and **Recent activity**
6. **Customer list** — instant search by name/phone, filter pills (All / Outstanding /
   Overdue / Settled), rows of avatar initial + name + phone + status badges + balance
   right-aligned in colour; sticky "Add customer" affordance
7. **Add / edit customer** form
8. **Account detail (the ledger)** — the app's most important screen: big balance with a
   plain-language state line ("Outstanding balance", "In credit (advance paid)", "Settled —
   nothing owed"), the two big actions (Add credit / Record payment) plus "Itemized purchase",
   payment-proof history, then the **transaction history**: per row a kind badge, description,
   timestamp, who recorded it, expandable line items, signed amount, running balance, and
   per-row Edit / Void. Show the **voided row** treatment and the void confirmation.
9. **Record credit — simple** — amount-first form with an oversized `Nu.` amount field
10. **Record credit — itemized** — repeatable line-item rows (name, qty, unit price, total)
    that add and remove cleanly on a phone, with a live running total
11. **Record payment** — amount + payment method (cash / mobile transfer / other) + note
12. **Edit transaction**
13. **Statement** — a per-account statement view that also prints cleanly (design the
    print layout: header with shop + customer, the ledger table, totals; no nav chrome)
14. **Payment proofs — owner review queue** — pending first, each with the customer,
    amount, date, a screenshot thumbnail that opens full-screen (zoomable), and
    Confirm / Reject-with-reason
15. **Bank details** — list of the shop's bank accounts, add/edit, "primary" marker
16. **Billing / subscription** — current status (trial / active / past due / grace /
    inactive) with days remaining, the operator's payment instructions, upload a payment
    screenshot, and a history of submitted payments with their approval state
17. **Invite a customer** — the shareable link with a one-tap copy and a native-share affordance

**Customer**
18. **Customer dashboard** — "Your total balance" card, shops count, spent this month,
    the list of "My accounts" (one per shop, with balance and overdue badge), recent activity
19. **My account at a shop** — read-only ledger, plus "I've paid — upload proof"
20. **Upload payment proof** — amount, a camera/file picker with an image preview, the
    shop's bank details shown right there so they can copy the account number

**Platform admin**
21. **Admin dashboard** — counts and the review queue at a glance
22. **Subscription payments queue** — approve / reject with screenshot preview
23. **Shops index** — every shop, owner, subscription state

**System / cross-cutting**
24. **Notification centre** — a bell with an unread count in the top bar, a list of
    notifications (new credit, payment received, transaction voided, overdue reminder,
    proof submitted/confirmed/rejected, subscription approved/rejected), read vs unread,
    "mark all read"
25. **Write-locked state** — the escalating subscription banner in the layout (grace:
    "N days left", locked: "write actions are locked"), plus how a disabled write action
    and its explanation look on the forms
26. Empty, loading (skeleton), error, and **offline** states for every list and form
27. 404 / 500 pages in the app's own visual language

## PWA specifics — design these explicitly, don't leave them to the implementer

- **App identity:** icon at 192/512 plus a maskable variant, theme colour `#003d9b`,
  background colour `#f9f9ff`, `display: standalone`, splash appearance.
- **Install:** an unobtrusive "Install Bangkee" prompt — where it appears, how it's
  dismissed, and the iOS Safari "Share → Add to Home Screen" fallback (iOS gives no
  install event, so it needs its own instruction sheet).
- **Standalone chrome:** with no browser toolbar there is no back button — every screen
  needs its own back affordance, and the top bar must respect the status-bar inset.
- **Offline:** an offline banner; a cached-shell offline page; read-only cached data
  clearly marked "last updated at …"; a **queued write** state for an action taken
  offline (pending, retrying, failed) — the shop owner *will* record credit with no
  signal, and losing it silently is unacceptable.
- **Web Push:** the permission-request moment (asked in context, after a meaningful
  action — never on first load), the notification's own appearance, and where the user
  turns notifications off.
- **Camera / file:** the screenshot upload flow through `<input capture>` — preview,
  replace, progress, failure on a slow connection.
- **Numeric input:** the amount field must bring up the numeric keypad; on mobile
  consider an in-app keypad for amounts so entry is thumb-sized and error-proof.

## Constraints

- **No native app.** No Flutter, no React Native, no app-store framing. Every
  interaction has to be plausible in HTML + CSS + a little JavaScript, because this is
  built with **Rails 8, Hotwire (Turbo + Stimulus) and plain CSS — no Tailwind, no
  component framework.** Prefer patterns Turbo does well: full-page navigation, Turbo
  Frames for inline edits and the search list, Turbo Streams for the ledger and the
  review queues. Avoid designs that need heavy client-side state or animation.
- Mobile-first, but the desktop layout must be genuinely good — the owner does the
  monthly reckoning on a laptop.
- Accessibility: WCAG AA contrast everywhere, visible focus rings, labels on every
  field, semantic headings, and the whole app usable one-handed on a phone and by
  keyboard on a desktop.
- Leave room for **Dzongkha** localisation: no text baked into images, no layout that
  breaks when a label gets 40% longer.

## Deliverables

For every screen: the mobile artboard and the desktop artboard, side by side, plus the
notable states (empty, loading, error, offline, write-locked, voided, pending). Add a
components artboard — buttons (primary / success / danger / ghost, all three sizes),
input and amount fields, status badges, list rows, cards, stat tiles, the bottom
tab bar and its sidebar counterpart, the top bar with the notification bell, bottom
sheets, and the flash/banner family — and a tokens artboard showing the palette, type
scale, spacing and radii in use. Annotate spacing and colour token names on each
artboard so the values can be lifted straight into CSS custom properties.
