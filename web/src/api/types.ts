// The wire contract between the Go server and this app. Every response body
// the server sends has one of these shapes; every request body the client
// sends is one of the *Input types. Money is always integer chetrum (`_cents`)
// on the way out; on the way in, amounts are the strings people typed
// ("1,250.50") and the server does the parsing, exactly as the Rails app did.
//
// Timestamps are RFC 3339 strings in UTC.
//
// Errors: any non-2xx response carries `ApiErrorBody`:
//   401 { error: "unauthenticated" }                       -> go to /session/new
//   403 { error, code: "write_locked" }                    -> go to /subscription
//   403 { error }                                          -> not yours / wrong role
//   404 { error }
//   422 { errors: string[] }  validation (full sentences)  -> show on the form
//   422 { error }             a rule said no ("already reviewed") -> alert banner
//   429 { error }             rate limited

export type Cents = number
export type Timestamp = string

export interface ApiErrorBody {
  error?: string
  errors?: string[]
  code?: "write_locked" | "unauthenticated" | "plan_required"
  feature?: string // plan_required: which feature
}

/** Every successful mutation says what happened, in the words the Rails flash used. */
export interface Notice {
  notice: string
}

// ------------------------------------------------------------------ identity

export type Role = "shop_owner" | "customer" | "staff" // staff: works in someone else's shop
export type Locale = "en" | "dz"

export interface User {
  id: number
  name: string
  email_address: string | null // null for a customer who joined with phone and PIN
  phone: string | null
  role: Role
  platform_admin: boolean
  locale: Locale | null
  display_name: string
  initial: string
  photo_url: string | null // their profile photo, if they added one
  reminders_opt_out: boolean // a customer who turned payment reminders off
}

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "disabled"

export interface Subscription {
  status: SubscriptionStatus // derived from server time (BR-37), never the cached column
  status_label: string // "Free trial" | "Active" | "Payment due" | "Inactive"
  summary: string // "3 days of free trial left" | "Renews 4 Oct 2026" | ...
  price_cents: Cents
  current_period_end: Timestamp
  grace_until: Timestamp | null
  days_remaining: number
  grace_days_remaining: number
  write_locked: boolean
  plan: PlanKey
  plan_name: string
  features: Feature[] // what the shop can use now: its plan's, or everything during the trial
  max_staff: number
}

export type PlanKey = "basic" | "pro" | "business"
export type Feature = "automatic_reminders" | "bulk_reminders" | "attachments" | "installments" | "suppliers" | "staff"

export interface ShopRef {
  id: number
  name: string
  credit_due_days: number
  kind: string | null // a ShopKind key; null until the owner picks one
}

/** GET /api/me — the shell's one query. 401 when signed out. */
export interface Me {
  user: User
  shop: ShopRef | null // the owner's shop, or the shop a staff member works in
  shop_role: "" | "owner" | StaffRole // empty for a customer
  permissions: Permission[] // what this person may do on the shop's side

  subscription: Subscription | null
  badges: {
    admin_payments: number // pending subscription payments (platform admins)
    admin_feedback: number // new feedback messages (platform admins)
    admin_testimonials: number // testimonials waiting for review (platform admins)
  }
  unread_notifications: number
  push: {
    configured: boolean
    public_key: string | null // VAPID public key, URL-safe base64
    devices: number // push subscriptions this user has
  }
}

/** Email and password, or (customers) phone and 4-digit PIN. */
export type SignInInput = { email_address: string; password: string } | { phone: string; pin: string }
/** POST /api/session */
export type SignInResult = Record<string, never>

/** GET /api/registration */
export interface RegistrationInfo {
  invited: boolean // an invite link was opened first: signing up as a customer
}
export interface RegistrationInput {
  name: string
  shop_name?: string // required unless invited
  email_address: string
  phone?: string
  password: string
}

export interface PasswordResetRequestInput {
  email_address: string
}
export interface PasswordUpdateInput {
  password: string
  password_confirmation: string
}

/**
 * GET /api/invitations/:token
 * - signed out: `landing` (the server remembers the token in a cookie for sign-up)
 * - signed in: the claim is attempted and the outcome returned
 */
/**
 * What someone signed out does with the link: `join` (new to Bangkee: name
 * and a PIN), `sign_in` (they have a login), `new_pin` (the shop sent a fresh
 * link for a forgotten PIN).
 */
export type InviteNext = "join" | "sign_in" | "new_pin"

export type InvitationResult =
  | { outcome: "landing"; shop_name: string; token_prefix: string; customer_name: string; phone: string; next: InviteNext }
  | { outcome: "claimed" | "already_yours"; account_id: number; notice: string }
  | { outcome: "refused"; alert: string } // shop owner, claimed by someone else, bad token

// ------------------------------------------------------------------- ledger

export type TransactionKind = "credit" | "payment"

export interface LineItem {
  id: number
  name: string
  quantity: string // decimal as typed, e.g. "2", "1.5"
  quantity_label: string // "2", "1.5"
  unit_price_cents: Cents
  total_cents: Cents
}

export interface LedgerEntry {
  id: number
  kind: TransactionKind
  amount_cents: Cents
  signed_amount_cents: Cents // credit +, payment −
  description: string | null
  notes: string | null
  payment_method: string | null
  occurred_at: Timestamp
  itemized: boolean
  crossed_out: boolean
  crossed_out_at: Timestamp | null
  created_by_name: string
  running_balance_cents: Cents | null // null for crossed-out rows (BR-11)
  line_items: LineItem[]
  screenshot_url: string | null // a payment's photo of the customer's payment screen; /api/attachments/:id
  confirmation: "pending" | "confirmed" | "disputed" // the customer's word on it; never moves the balance
  responses: EntryResponse[] // that word's history, oldest first
  documents: EntryDocument[] // files the shop attached: receipts, delivery notes, photos
}

/** A file on an entry, opened at its url (/api/attachments/:id) by the shop and the customer only. */
export interface EntryDocument {
  id: number
  url: string
  filename: string
  content_type: string // image/png, image/jpeg, image/webp, image/heic or application/pdf
  byte_size: number
  added_at: Timestamp
}

export interface EntryResponse {
  action: "confirmed" | "disputed" | "shop_replied" | "changed"
  note: string | null
  by: string
  at: Timestamp
}

export interface AccountSummary {
  id: number
  customer_name: string
  display_name: string
  customer_phone: string | null
  balance_cents: Cents
  overdue: boolean
  days_overdue: number
  joined: boolean
  last_activity_at: Timestamp | null
  customer_photo_url: string | null // the customer's own profile photo, once joined
}

export interface AuditEvent {
  id: number
  action: string
  actor_name: string // "System" when no actor (BR-18)
  created_at: Timestamp
  amount_cents: Cents | null
}

export interface BankAccount {
  id: number
  bank_name: string
  account_name: string
  account_number: string
  branch: string | null
  instructions: string | null
  primary: boolean
  active: boolean
}
export interface BankAccountInput {
  bank_name: string
  account_name: string
  account_number: string
  branch?: string
  instructions?: string
  primary: boolean
  active: boolean
}

/** GET /api/accounts?q=&filter=outstanding|overdue|settled */
export interface AccountList {
  accounts: AccountSummary[]
}

export interface AccountInput {
  customer_name: string
  customer_phone?: string
}

/** GET /api/accounts/:id — the shape depends on who is looking. */
export type AccountDetail =
  | {
      viewer: "owner"
      account: AccountSummary
      ledger: LedgerEntry[] // newest first, crossed-out rows included
      audit_events: AuditEvent[] // latest 10
      write_locked: boolean
    }
  | {
      viewer: "customer"
      account: AccountSummary
      shop: { id: number; name: string; photo_url: string | null }
      ledger: LedgerEntry[] // newest first, crossed-out rows included
      bank_accounts: BankAccount[] // active, primary first
    }

export interface LineItemInput {
  name: string
  quantity: string
  unit_price: string
}

/** POST /api/accounts/:id/credits */
export interface CreditInput {
  itemized: boolean
  amount?: string // ignored when itemized: the items are the amount (BR-12)
  description?: string
  notes?: string
  occurred_at?: string // datetime-local value or ISO; blank = now
  line_items?: LineItemInput[]
  idempotency_key?: string // stamped by the offline queue
}

export const PAYMENT_METHODS = ["Mobile transfer", "Cash", "Other"] as const

/** POST /api/accounts/:id/payments */
export interface PaymentInput {
  amount: string
  payment_method: string
  notes?: string
  occurred_at?: string
  idempotency_key?: string
}

/** Response of credits/payments. `duplicate` when the idempotency key was already in the book. */
export interface RecordedEntry extends Notice {
  account_id: number
  transaction_id: number
  duplicate: boolean
}

/** GET /api/transactions/:id — for the edit screen. */
export interface TransactionDetail {
  transaction: LedgerEntry
  account: { id: number; display_name: string }
}
/** PATCH /api/transactions/:id */
export interface TransactionUpdateInput {
  amount: string
  description?: string
  notes?: string
  payment_method?: string
  occurred_at?: string
}

/** GET /api/accounts/:id/statement?from=&to= — active entries only, oldest first. Days are YYYY-MM-DD in Thimphu; `to` is inclusive. */
export interface Statement {
  account: AccountSummary
  shop: { id: number; name: string }
  viewer: "owner" | "customer"
  statement: {
    from: Timestamp | null
    to: Timestamp | null
    opening_cents: Cents // owed before `from`
    rows: LedgerEntry[]
    credit_cents: Cents // taken on credit in the range
    payment_cents: Cents // paid in the range
    closing_cents: Cents // opening + credit − paid
    generated_at: Timestamp
    through_to_today: boolean
  }
}

/** A payment written up for the customer: GET /api/transactions/:id/receipt (and .pdf). */
export interface Receipt {
  number: string // "R12-000345": the shop, then the payment
  transaction_id: number
  account_id: number
  amount_cents: Cents
  paid_at: Timestamp
  payment_method: string | null
  notes: string | null
  received_by: string
  balance_after_cents: Cents | null // the running balance right after it; null when void
  void: boolean // the shop crossed the payment out
  voided_at: Timestamp | null
  shop_name: string
  shop_line: string
  customer_name: string
  customer_phone: string | null
}

/** GET /api/accounts/:id/invite */
export interface Invite {
  account: AccountSummary
  invite_path: string // "/join/<token>" — the client prefixes location.origin
  phone: string // where the owner sends it
  pin_customer: boolean // joined with phone and PIN, so a forgotten PIN can be replaced
  pin_reset_until: Timestamp | null // a fresh link that can set a new PIN, until then
}

/** POST /api/invitations/:token/join — new to Bangkee: their name and a PIN. */
export interface JoinInput {
  name: string
  pin: string
}

// ------------------------------------------------------------- dashboards

export interface OwnerDashboard {
  kind: "owner"
  shop: ShopRef
  total_outstanding_cents: Cents
  owing_count: number // customers who owe something
  customers_count: number
  overdue_accounts: AccountSummary[] // up to 5, biggest first
  overdue_count: number
  overdue_cents: Cents
  top_accounts: AccountSummary[] // the 5 largest balances
  items_count: number
  credit_today_cents: Cents
  payments_today_cents: Cents
  repaid_month_cents: Cents
  trend: { day: string; credit_cents: Cents; payment_cents: Cents }[] // the last 14 days, today last
  disputed: (LedgerEntry & { account: { id: number; display_name: string } })[] // entries customers flagged, oldest first
  late_installments: (InstallmentPlan & { customer_name: string })[] // running plans with an installment overdue
  recent_transactions: (LedgerEntry & { account: { id: number; display_name: string } })[]
}

export interface CustomerDashboard {
  kind: "customer"
  total_owed_cents: Cents
  spent_month_cents: Cents
  accounts: (AccountSummary & { shop: { id: number; name: string; photo_url: string | null } })[]
  recent_transactions: (LedgerEntry & { account: { id: number; shop_name: string } })[]
}

/** GET /api/insights?month=YYYY-MM — the owner's book over the last six months. */
export interface Insights {
  months: { month: string; label: string; credit_cents: Cents; payment_cents: Cents }[] // oldest first, this month last
  month: string // the month `entries` are from
  entries: (LedgerEntry & { account: { id: number; display_name: string } })[] // newest first, crossed-out left out
  outstanding_cents: Cents
  owing: AccountSummary[] // everyone who owes, most first
  overdue_count: number
}

/** GET /api/dashboard (platform admins use /api/admin/dashboard) */
export type Dashboard = OwnerDashboard | CustomerDashboard

export interface MenuItem {
  id: number
  name: string
  category: string | null
  price_cents: Cents
  price: string // major units for the edit form
  available: boolean
  position: number
  image_url: string | null // optional photo; anyone can load it
}
export interface MenuItemInput {
  name: string
  category?: string
  price: string
  available: boolean
  position?: number
}
/** GET /api/menu_items */
export interface MenuBoard {
  items: MenuItem[]
}

// ------------------------------------------------------- the shops catalog

export interface MenuGroup {
  category: string
  items: { id: number; name: string; price_cents: Cents; available: boolean; image_url: string | null }[]
}

/** A sort of business customers browse by. */
export interface ShopKind {
  key: string
  label: string
}

/** GET /api/shops?kind=&q= — every shop with items to show. */
export interface ShopDirectory {
  shops: { id: number; name: string; kind: string | null; kind_label: string; location: string | null; items_count: number; photo_url: string | null; latitude: number | null; longitude: number | null }[]
  kinds: ShopKind[]
}

/** What customers read about a shop, above its items. */
export interface ShopProfile {
  id: number
  name: string
  kind: string | null
  kind_label: string
  about: string | null
  location: string | null
  phone: string | null
  hours: string | null
  latitude: number | null // the pin on the map: both or neither
  longitude: number | null
  photo_url: string | null
}

export interface ShopProfileInput {
  name: string
  kind: string
  about: string
  location: string
  phone: string
  hours: string
  latitude: number | null
  longitude: number | null
}

/** GET /api/shop/profile — the owner's own, to edit. */
export interface ShopProfileForm {
  shop: ShopProfile
  kinds: ShopKind[]
}

/** GET /api/shops/:id — a shop's profile and items, as customers read them. */
export interface ShopPage {
  shop: ShopProfile
  menu: MenuGroup[]
  mine: boolean // the viewer owns it: a preview
}

// ---------------------------------------------------------------- settings

/** GET /api/settings */
export interface SettingsInfo {
  menu_items_count: number
  bank_accounts_count: number
}

// ------------------------------------------------------------------ billing

export interface SubscriptionPayment {
  id: number
  plan: PlanKey
  plan_name: string
  amount_cents: Cents
  months: number
  payment_method: string | null
  reference: string | null
  status: "pending" | "approved" | "rejected"
  rejection_reason: string | null
  created_at: Timestamp
  reviewed_at: Timestamp | null
  reviewed_by_name: string | null
  screenshot_url: string | null
}

export interface OperatorBilling {
  annual_price_cents: Cents // what one year of cover costs: 12 × the monthly price
  bank_name: string
  account_name: string
  account_number: string
  branch: string
  instructions: string
}

/** GET /api/subscription (owner; never write-locked) */
export interface Billing {
  subscription: Subscription
  payments: SubscriptionPayment[]
  operator: OperatorBilling
  plans: PlanOffer[] // the shop's own plan at the price it pays now
}
/** POST /api/subscription/payments — multipart: amount, plan, method, reference, screenshot (months defaults to 12: billed annually; plan defaults to the shop's) */

export interface PlanOffer {
  key: PlanKey
  name: string
  summary: string
  features: string[] // what this plan adds, by name
  max_staff: number
  monthly_price_cents: Cents
  annual_price_cents: Cents
}

// ------------------------------------------------------------------ pricing

/** GET /api/public/pricing — no sign-in; the homepage's pricing section. One plan, billed annually. */
export interface PublicPricing {
  monthly_price_cents: Cents // 15000 = Nu. 150 a month
  annual_price_cents: Cents // 180000 = Nu. 1,800, paid once a year
  trial_months: number // 3: a new shop's free trial
  plans: PlanOffer[]
}

// -------------------------------------------------------------------- admin
//
// The operator's screens live on their own host, admin.<domain>. There the
// API serves only identity, /api/admin/*, notifications, push and
// attachments; everything else is 404. On the app host /api/admin/* is 404.
// Sign-in on the admin host refuses anyone who is not a platform admin.

export interface AdminPayment extends SubscriptionPayment {
  shop: { id: number; name: string; paid_through: Timestamp; status_label: string }
  submitted_by_name: string
}

/** GET /api/admin/dashboard */
/** A figure for the period and the same figure for the period before, with a value a day. */
export interface PeriodFigure {
  value: number
  previous: number
  series?: { day: string; value: number }[]
}

/** GET /api/admin/dashboard?days=7|30|90 */
export interface AdminDashboard {
  days: number
  from: Timestamp // the period's first day
  shops_count: number
  approved: PeriodFigure // subscription money approved, cents
  new_shops: PeriodFigure
  active_shops: PeriodFigure // shops that recorded at least one entry
  entries: PeriodFigure // credits and payments recorded across every shop
  activity_days: { day: string; credits: number; payments: number }[]
  mrr_cents: Cents // what the paying shops pay a month, at their own prices
  mrr_by_plan: { basic: Cents; pro: Cents; business: Cents }
  plan_mix: { trialing: number; basic: number; pro: number; business: number; past_due: number; disabled: number }
  pending_count: number
  pending: AdminPayment[] // up to 5, oldest first
  trials_ending: { shop_id: number; name: string; ends_at: Timestamp; days_left: number }[] // within 14 days, soonest first
  payment_due: { shop_id: number; name: string; grace_until: Timestamp | null; days_left: number }[]
  most_active: { id: number; name: string; kind_label: string; entries: number; customers: number; last_entry_at: Timestamp }[] // counts only
}

/** GET /api/admin/subscription_payments?status=pending|approved|rejected|all */
export interface AdminPaymentQueue {
  status: string
  payments: AdminPayment[]
  pending_count: number
}

/** GET /api/admin/shops */
export interface AdminShops {
  shops: {
    id: number
    name: string
    kind: string | null
    kind_label: string
    created_at: Timestamp
    owner_name: string
    owner_email: string
    customers: number
    subscription: Subscription | null
  }[]
}

// ------------------------------------------------------------ notifications

export type NotificationKind = "credit" | "payment" | "cross_out" | "overdue" | "sub" | "feedback"

export interface AppNotification {
  id: number
  kind: NotificationKind
  title: string
  body: string | null
  path: string | null
  read: boolean
  created_at: Timestamp
}

/** GET /api/notifications */
export interface NotificationList {
  notifications: AppNotification[] // latest 50
  unread_count: number
}

export interface PushSubscriptionInput {
  endpoint: string
  p256dh_key: string
  auth_key: string
}

// ---------------------------------------------------------------- feedback

export type FeedbackStatus = "new" | "acknowledged" | "replied"

export interface FeedbackKind {
  key: "feedback" | "feature" | "support"
  label: string
}

export interface FeedbackMessage {
  id: number
  kind: FeedbackKind["key"]
  kind_label: string
  body: string
  status: FeedbackStatus
  reply: string | null
  created_at: Timestamp
  acknowledged_at: Timestamp | null
  replied_at: Timestamp | null
}

/** GET /api/feedback — what this person has sent, newest first. */
export interface MyFeedback {
  messages: FeedbackMessage[]
  kinds: FeedbackKind[]
}

/** GET /api/admin/feedback?status=new|acknowledged|replied|all */
export interface AdminFeedbackQueue {
  status: string
  new_count: number
  messages: (FeedbackMessage & {
    from: { name: string; email: string | null; phone: string | null; role: "shop_owner" | "customer"; shop: string | null }
    reviewed_by_name: string | null
  })[]
}

// ------------------------------------------------------------ testimonials

export type TestimonialStatus = "pending" | "approved" | "hidden"

/** GET /api/testimonial — the signed-in person's own, or null. */
export interface MyTestimonial {
  testimonial: { id: number; body: string; status: TestimonialStatus; updated_at: Timestamp } | null
}

/** GET /api/public/testimonials — the approved ones, for the homepage. */
export interface PublicTestimonials {
  testimonials: { id: number; body: string; name: string; role: string; owner: boolean }[]
}

/** GET /api/admin/testimonials?status= — the operator's list. */
export interface AdminTestimonialQueue {
  status: string
  pending_count: number
  testimonials: {
    id: number
    body: string
    status: TestimonialStatus
    updated_at: Timestamp
    from: { name: string; email: string | null; phone: string | null; role: "shop_owner" | "customer"; shop: string | null }
    reviewed_by_name: string | null
    reviewed_at: Timestamp | null
  }[]
}

// ---------------------------------------------------------------- reminders

/** What happened when one account was reminded. */
export interface ReminderOutcome {
  account_id: number
  customer_name: string
  status: "sent" | "skipped" | "failed" | "duplicate"
  detail: string
}

export interface Reminder {
  kind: "automatic" | "manual"
  channel: "app" | "whatsapp" | "sms"
  status: "sent" | "skipped" | "failed"
  detail: string | null
  balance_cents: Cents
  sent_by_name: string | null
  at: Timestamp
}

/** GET /api/shop/reminders */
export interface ReminderSettings {
  enabled: boolean
  every_days: number
  hour: number // Thimphu
  every_days_options: number[]
  first_hour: number
  last_hour: number
  credit_due_days: number
  plan_allows: boolean // automatic reminders are on the shop's plan (or its trial)
}

// ------------------------------------------------------------ installments

export interface Installment {
  number: number
  due_on: Timestamp // a day; read the date part only
  amount_cents: Cents
  paid_cents: Cents
  status: "paid" | "partial" | "overdue" | "due_today" | "upcoming"
}

/** An agreement to pay in parts; its progress is read from the account's payments since it began. */
export interface InstallmentPlan {
  id: number
  account_id: number
  total_cents: Cents
  installment_count: number
  frequency: "weekly" | "fortnightly" | "monthly"
  first_due_on: Timestamp
  notes: string | null
  status: "active" | "completed" | "cancelled"
  created_at: Timestamp
  created_by_name: string
  ended_at: Timestamp | null
  paid_cents: Cents
  remaining_cents: Cents
  overdue_count: number
  overdue_cents: Cents
  next: Installment | null
  installments: Installment[]
}

// --------------------------------------------------------------- suppliers

/** Someone the shop buys from. balance_cents is what the shop owes them — never mixed with what customers owe. */
export interface Supplier {
  id: number
  name: string
  phone: string | null
  notes: string | null
  balance_cents: Cents
  last_activity_at: Timestamp | null
}

/** A supplier's entries reuse the ledger entry's shape: kind is "purchase" (owed more) or "payment". */
export type SupplierEntry = Omit<LedgerEntry, "kind"> & { kind: "purchase" | "payment" }

export interface SupplierInput {
  name: string
  phone?: string
  notes?: string
}
export interface SupplierEntryInput {
  amount: string
  description?: string
  notes?: string
  payment_method?: string
  occurred_at?: string
  idempotency_key: string
}

// ------------------------------------------------------------------- staff

export type StaffRole = "manager" | "cashier" | "viewer"
/** view: read the book · record: customers, credits, payments · manage: change entries, plans, items, suppliers · owner: billing, bank details, settings, staff */
export type Permission = "view" | "record" | "manage" | "owner"

export interface StaffMember {
  id: number
  name: string
  email_address: string
  role: StaffRole
  role_name: string
  since: Timestamp
}
export interface StaffInvitation {
  id: number
  name: string
  email_address: string
  role: StaffRole
  role_name: string
  join_path: string // /staff/join/:token
  expires_at: Timestamp
}
export interface StaffList {
  members: StaffMember[]
  invitations: StaffInvitation[]
  max_staff: number
  plan_allows: boolean
}
