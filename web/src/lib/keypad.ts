import { majorAmount } from "@/lib/money"

// The on-screen keypad's rules: two decimals at most, nine digits at most,
// and a leading zero gives way to the first real digit.
export function pressKey(value: string, key: string): string {
  if (key === "back") return value.slice(0, -1)
  if (key === ".") return value.includes(".") ? value : (value || "0") + "."
  if (value.includes(".") && value.split(".")[1].length >= 2) return value
  if (value.replace(".", "").length >= 9) return value
  return value === "0" ? key : value + key
}

/** "Nu. 1,250" for a typed amount, blank when there is nothing to show. */
export function previewAmount(value: string): string {
  const amount = parseFloat(value.replace(/,/g, ""))
  return Number.isNaN(amount) || amount <= 0 ? "" : majorAmount(amount)
}
