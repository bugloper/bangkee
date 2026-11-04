// BR-3, the Rails `ngultrum` helper. Whole amounts drop the decimals
// ("Nu. 1,250"); fractional amounts keep two. A negative balance is shown
// with a real minus sign; `signed` adds "+ " to positives too.
export function ngultrum(cents: number | null | undefined, signed = false): string {
  const value = Math.trunc(cents ?? 0)
  const abs = Math.abs(value)
  const whole = Math.floor(abs / 100)
  const fraction = abs % 100
  let formatted = `Nu. ${whole.toLocaleString("en-US")}`
  if (fraction !== 0) formatted += `.${String(fraction).padStart(2, "0")}`
  const prefix = value < 0 ? "− " : signed && value > 0 ? "+ " : ""
  return `${prefix}${formatted}`
}

/** What live totals show for a typed major-unit amount. */
export function majorAmount(amount: number): string {
  return `Nu. ${amount.toLocaleString("en-US", amount % 1 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {})}`
}

/** owed / paid / settled — the colour classes carry the ledger's meaning. */
export function balanceState(cents: number): "owed" | "paid" | "settled" {
  if (cents > 0) return "owed"
  if (cents < 0) return "paid"
  return "settled"
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/** "1 year" for twelve months of cover — plans are billed annually — else "3 months". */
export function coverPeriod(months: number): string {
  return months % 12 === 0 ? pluralize(months / 12, "year") : pluralize(months, "month")
}
