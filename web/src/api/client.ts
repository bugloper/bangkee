// The only place that talks to the server. Every endpoint the Go API serves
// is listed here, so this file doubles as the route table for both sides.
//
// Requests are same-origin with the HttpOnly session cookie. Every call sends
// `X-Requested-With: bangkee`; the server refuses state-changing /api requests
// without it, which is what stands in for Rails' CSRF token (a cross-site form
// cannot set a custom header).

import type * as T from "./types"

export class ApiError extends Error {
  status: number
  body: T.ApiErrorBody

  constructor(status: number, body: T.ApiErrorBody) {
    super(body.error ?? body.errors?.join(" ") ?? `Request failed (${status})`)
    this.status = status
    this.body = body
  }

  get validation(): string[] {
    return this.body.errors ?? []
  }
  get writeLocked(): boolean {
    return this.body.code === "write_locked"
  }
  /** The shop's plan does not include this; Billing is where to change it. */
  get planRequired(): boolean {
    return this.body.code === "plan_required"
  }
  get unauthenticated(): boolean {
    return this.status === 401
  }
}

export const API_HEADERS = { "X-Requested-With": "bangkee", Accept: "application/json" } as const

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE"

export async function request<R>(method: Method, path: string, body?: unknown): Promise<R> {
  const init: RequestInit = { method, credentials: "same-origin", headers: { ...API_HEADERS } }

  if (body instanceof FormData) {
    init.body = body
  } else if (body !== undefined) {
    init.body = JSON.stringify(body)
    ;(init.headers as Record<string, string>)["Content-Type"] = "application/json"
  }

  const response = await fetch(path, init)
  const text = await response.text()
  const data = text ? JSON.parse(text) : {}
  if (!response.ok) throw new ApiError(response.status, data)
  return data as R
}

const get = <R>(path: string) => request<R>("GET", path)
const post = <R>(path: string, body?: unknown) => request<R>("POST", path, body ?? {})
const patch = <R>(path: string, body?: unknown) => request<R>("PATCH", path, body ?? {})
const put = <R>(path: string, body?: unknown) => request<R>("PUT", path, body ?? {})
const del = <R>(path: string, body?: unknown) => request<R>("DELETE", path, body)

const qs = (params: Record<string, string | undefined | null>) => {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value)
  })
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ""
}

export type StatementRange = { from?: string; to?: string }

export const api = {
  // identity
  me: () => get<T.Me>("/api/me"),
  signIn: (input: T.SignInInput) => post<T.SignInResult>("/api/session", input),
  signOut: () => del<Record<string, never>>("/api/session"),
  registration: () => get<T.RegistrationInfo>("/api/registration"),
  register: (input: T.RegistrationInput) => post<T.Notice>("/api/registration", input),
  requestPasswordReset: (input: T.PasswordResetRequestInput) => post<T.Notice>("/api/passwords", input),
  checkPasswordToken: (token: string) => get<Record<string, never>>(`/api/passwords/${token}`),
  updatePassword: (token: string, input: T.PasswordUpdateInput) => put<T.Notice>(`/api/passwords/${token}`, input),
  invitation: (token: string) => get<T.InvitationResult>(`/api/invitations/${token}`),
  joinWithPin: (token: string, input: T.JoinInput) => post<T.Notice & { account_id: number }>(`/api/invitations/${token}/join`, input),
  newPin: (token: string, pin: string) => post<T.Notice & { account_id: number }>(`/api/invitations/${token}/pin`, { pin }),

  // home
  dashboard: () => get<T.Dashboard>("/api/dashboard"),

  insights: (month?: string) => get<T.Insights>(`/api/insights${qs({ month })}`),

  // accounts & ledger
  accounts: (params: { q?: string; filter?: string }) => get<T.AccountList>(`/api/accounts${qs(params)}`),
  createAccount: (input: T.AccountInput) => post<T.Notice & { account_id: number }>("/api/accounts", input),
  account: (id: number) => get<T.AccountDetail>(`/api/accounts/${id}`),
  updateAccount: (id: number, input: T.AccountInput) => patch<T.Notice>(`/api/accounts/${id}`, input),
  deleteAccount: (id: number) => del<T.Notice>(`/api/accounts/${id}`),
  createCredit: (accountId: number, input: T.CreditInput) => post<T.RecordedEntry>(`/api/accounts/${accountId}/credits`, input),
  createPayment: (accountId: number, input: T.PaymentInput) => post<T.RecordedEntry>(`/api/accounts/${accountId}/payments`, input),
  statement: (accountId: number, range: StatementRange = {}) => get<T.Statement>(`/api/accounts/${accountId}/statement${qs(range)}`),
  /** The PDF, for a link or a download — not fetched as JSON. */
  statementPdfUrl: (accountId: number, range: StatementRange = {}) => `/api/accounts/${accountId}/statement.pdf${qs(range)}`,
  invite: (accountId: number) => get<T.Invite>(`/api/accounts/${accountId}/invite`),
  pinReset: (accountId: number) => post<T.Invite>(`/api/accounts/${accountId}/pin_reset`),
  /** A payment with a photo of the customer's payment screen goes up as form data, the photo as "screenshot". */
  createPaymentWithPhoto: (accountId: number, form: FormData) => post<T.RecordedEntry>(`/api/accounts/${accountId}/payments`, form),

  transaction: (id: number) => get<T.TransactionDetail>(`/api/transactions/${id}`),
  updateTransaction: (id: number, input: T.TransactionUpdateInput) => patch<T.Notice & { account_id: number }>(`/api/transactions/${id}`, input),
  receipt: (transactionId: number) => get<{ receipt: T.Receipt }>(`/api/transactions/${transactionId}/receipt`),
  receiptPdfUrl: (transactionId: number) => `/api/transactions/${transactionId}/receipt.pdf`,
  receipts: (accountId: number) => get<{ account: T.AccountSummary; receipts: T.Receipt[] }>(`/api/accounts/${accountId}/receipts`),
  confirmEntry: (id: number) => post<T.Notice>(`/api/transactions/${id}/confirm`),
  disputeEntry: (id: number, reason: string) => post<T.Notice>(`/api/transactions/${id}/dispute`, { reason }),
  replyToDispute: (id: number, note: string) => post<T.Notice>(`/api/transactions/${id}/dispute_reply`, { note }),
  confirmAll: (accountId: number) => post<T.Notice & { confirmed: number }>(`/api/accounts/${accountId}/confirm_all`),
  installmentPlans: (accountId: number) => get<{ plans: T.InstallmentPlan[]; balance_cents: T.Cents }>(`/api/accounts/${accountId}/installments`),
  createInstallmentPlan: (accountId: number, input: { total: string; count: number; frequency: string; first_due_on: string; notes?: string }) =>
    post<T.Notice & { plan_id: number }>(`/api/accounts/${accountId}/installments`, input),
  cancelInstallmentPlan: (planId: number) => post<T.Notice>(`/api/installment_plans/${planId}/cancel`),
  remind: (accountId: number) => post<T.Notice & { outcome: T.ReminderOutcome }>(`/api/accounts/${accountId}/remind`),
  logReminder: (accountId: number, channel: "whatsapp" | "sms") => post<T.Notice>(`/api/accounts/${accountId}/reminders/log`, { channel }),
  accountReminders: (accountId: number) => get<{ paused: boolean; reminders: T.Reminder[] }>(`/api/accounts/${accountId}/reminders`),
  pauseReminders: (accountId: number, paused: boolean) => patch<T.Notice>(`/api/accounts/${accountId}/reminders`, { paused }),
  remindAllOverdue: (accountIds: number[] = []) => post<T.Notice & { sent: number; outcomes: T.ReminderOutcome[] }>("/api/reminders/overdue", { account_ids: accountIds }),
  reminderSettings: () => get<T.ReminderSettings>("/api/shop/reminders"),
  updateReminderSettings: (input: { enabled: boolean; every_days: number; hour: number }) => patch<T.Notice>("/api/shop/reminders", input),
  setMyReminders: (optOut: boolean) => patch<T.Notice>("/api/me/reminders", { opt_out: optOut }),
  /** The file goes up as form data, field "file". */
  addDocument: (transactionId: number, form: FormData) => post<T.Notice>(`/api/transactions/${transactionId}/documents`, form),
  removeDocument: (transactionId: number, documentId: number) => del<T.Notice>(`/api/transactions/${transactionId}/documents/${documentId}`),
  crossOutTransaction: (id: number) => post<T.Notice & { account_id: number }>(`/api/transactions/${id}/cross_out`),

  suppliers: () => get<{ suppliers: T.Supplier[]; total_payable_cents: T.Cents; plan_allows: boolean }>("/api/suppliers"),
  supplier: (id: number) => get<{ supplier: T.Supplier; ledger: T.SupplierEntry[] }>(`/api/suppliers/${id}`),
  createSupplier: (input: T.SupplierInput) => post<T.Notice & { supplier_id: number }>("/api/suppliers", input),
  updateSupplier: (id: number, input: T.SupplierInput) => patch<T.Notice>(`/api/suppliers/${id}`, input),
  deleteSupplier: (id: number) => del<T.Notice>(`/api/suppliers/${id}`),
  sales: (day?: string) => get<T.SalesDay>(`/api/sales${day ? `?day=${day}` : ""}`),
  crossOutSale: (id: number) => post<T.Notice>(`/api/sales/${id}/cross_out`),
  recordSupplierEntry: (id: number, kind: "purchases" | "payments", input: T.SupplierEntryInput) => post<T.Notice & { duplicate: boolean }>(`/api/suppliers/${id}/${kind}`, input),
  crossOutSupplierEntry: (entryId: number) => post<T.Notice & { supplier_id: number }>(`/api/supplier_entries/${entryId}/cross_out`),
  supplierStatement: (id: number, range: StatementRange = {}) => get<{ supplier: T.Supplier; statement: T.Statement["statement"] }>(`/api/suppliers/${id}/statement${qs(range)}`),
  supplierStatementPdfUrl: (id: number, range: StatementRange = {}) => `/api/suppliers/${id}/statement.pdf${qs(range)}`,
  staff: () => get<T.StaffList>("/api/staff"),
  inviteStaff: (input: { name: string; email_address: string; role: T.StaffRole }) => post<T.Notice & { join_path: string }>("/api/staff/invitations", input),
  withdrawStaffInvitation: (id: number) => del<T.Notice>(`/api/staff/invitations/${id}`),
  changeStaffRole: (id: number, role: T.StaffRole) => patch<T.Notice>(`/api/staff/${id}`, { role }),
  removeStaff: (id: number) => del<T.Notice>(`/api/staff/${id}`),
  staffInvitation: (token: string) => get<{ shop_name: string; name: string; email_address: string; role: T.StaffRole; role_name: string }>(`/api/staff_invitations/${token}`),
  acceptStaffInvitation: (token: string, input: { name: string; password: string }) => post<T.Notice>(`/api/staff_invitations/${token}/accept`, input),
  bankAccounts: () => get<{ bank_accounts: T.BankAccount[] }>("/api/bank_accounts"),
  bankAccount: (id: number) => get<T.BankAccount>(`/api/bank_accounts/${id}`),
  createBankAccount: (input: T.BankAccountInput) => post<T.Notice>("/api/bank_accounts", input),
  updateBankAccount: (id: number, input: T.BankAccountInput) => patch<T.Notice>(`/api/bank_accounts/${id}`, input),
  deleteBankAccount: (id: number) => del<T.Notice>(`/api/bank_accounts/${id}`),

  // items
  menuItems: () => get<T.MenuBoard>("/api/menu_items"),
  menuItem: (id: number) => get<T.MenuItem>(`/api/menu_items/${id}`),
  createMenuItem: (input: T.MenuItemInput) => post<T.Notice & { id: number }>("/api/menu_items", input),
  updateMenuItem: (id: number, input: T.MenuItemInput) => patch<T.Notice & { id: number }>(`/api/menu_items/${id}`, input),
  /** The photo goes up as form data, field "image". */
  setItemImage: (id: number, form: FormData) => post<T.Notice>(`/api/menu_items/${id}/image`, form),
  removeItemImage: (id: number) => del<T.Notice>(`/api/menu_items/${id}/image`),
  itemStock: (id: number) => get<{ history: T.StockMovement[] }>(`/api/menu_items/${id}/stock`),
  restockItem: (id: number, input: { quantity: string; cost?: string; notes?: string }) => post<T.Notice>(`/api/menu_items/${id}/restock`, input),
  recountItem: (id: number, input: { counted: string; notes?: string }) => post<T.Notice>(`/api/menu_items/${id}/recount`, input),
  setShopPhoto: (form: FormData) => post<T.Notice>("/api/shop/photo", form),
  removeShopPhoto: () => del<T.Notice>("/api/shop/photo"),
  setMyPhoto: (form: FormData) => post<T.Notice>("/api/me/photo", form),
  removeMyPhoto: () => del<T.Notice>("/api/me/photo"),
  deleteMenuItem: (id: number) => del<T.Notice>(`/api/menu_items/${id}`),

  // the shops catalog
  shopDirectory: (kind: string, q: string) => get<T.ShopDirectory>(`/api/shops?${new URLSearchParams({ kind, q })}`),
  shopPage: (id: number) => get<T.ShopPage>(`/api/shops/${id}`),
  publicShops: () => get<T.ShopDirectory>("/api/public/shops"),
  publicShopPage: (id: number) => get<T.ShopPage>(`/api/public/shops/${id}`),
  shopProfile: () => get<T.ShopProfileForm>("/api/shop/profile"),
  updateShopProfile: (input: T.ShopProfileInput) => patch<T.Notice>("/api/shop/profile", input),
  /** A map pin in words — "Norzin Lam, Thimphu" — or "" when there is nothing to say. */
  placeName: (latitude: number, longitude: number) => get<{ name: string }>(`/api/places/name?lat=${latitude}&lon=${longitude}`),

  // marketing
  pricing: () => get<T.PublicPricing>("/api/public/pricing"),

  // settings & billing
  settings: () => get<T.SettingsInfo>("/api/settings"),
  setLanguage: (locale: T.Locale) => patch<T.Notice>("/api/language", { locale }),
  billing: () => get<T.Billing>("/api/subscription"),
  submitSubscriptionPayment: (form: FormData) => post<T.Notice>("/api/subscription/payments", form),

  // operator
  adminDashboard: (days = 30) => get<T.AdminDashboard>(`/api/admin/dashboard?days=${days}`),
  adminPayments: (status: string) => get<T.AdminPaymentQueue>(`/api/admin/subscription_payments${qs({ status })}`),
  approvePayment: (id: number) => post<T.Notice>(`/api/admin/subscription_payments/${id}/approve`),
  rejectPayment: (id: number, rejection_reason: string) => post<T.Notice>(`/api/admin/subscription_payments/${id}/reject`, { rejection_reason }),
  adminShops: () => get<T.AdminShops>("/api/admin/shops"),
  adminFeedback: (status: string) => get<T.AdminFeedbackQueue>(`/api/admin/feedback${qs({ status })}`),
  acknowledgeFeedback: (id: number) => post<T.Notice>(`/api/admin/feedback/${id}/acknowledge`),
  replyToFeedback: (id: number, reply: string) => post<T.Notice>(`/api/admin/feedback/${id}/reply`, { reply }),

  // testimonials
  myTestimonial: () => get<T.MyTestimonial>("/api/testimonial"),
  saveTestimonial: (body: string) => put<T.Notice>("/api/testimonial", { body }),
  deleteTestimonial: () => del<T.Notice>("/api/testimonial"),
  publicTestimonials: () => get<T.PublicTestimonials>("/api/public/testimonials"),
  adminTestimonials: (status: string) => get<T.AdminTestimonialQueue>(`/api/admin/testimonials${qs({ status })}`),
  approveTestimonial: (id: number) => post<T.Notice>(`/api/admin/testimonials/${id}/approve`),
  hideTestimonial: (id: number) => post<T.Notice>(`/api/admin/testimonials/${id}/hide`),

  // feedback, feature requests and support
  myFeedback: () => get<T.MyFeedback>("/api/feedback"),
  sendFeedback: (kind: string, body: string) => post<T.Notice & { id: number }>("/api/feedback", { kind, body }),

  // notifications & push
  notifications: () => get<T.NotificationList>("/api/notifications"),
  readNotification: (id: number) => post<{ path: string | null }>(`/api/notifications/${id}/read`),
  readAllNotifications: () => post<T.Notice>("/api/notifications/read_all"),
  subscribePush: (input: T.PushSubscriptionInput) => post<Record<string, never>>("/api/push_subscription", input),
  unsubscribePush: (endpoint: string) => del<Record<string, never>>("/api/push_subscription", { endpoint }),
}
