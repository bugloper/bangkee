import type { LineItemInput, MenuItem } from "@/api/types"

// The lines of an itemized credit or sale, as picked from the shop's items.

/** How many of each item the lines being recorded hold, by item. */
export function pickedCounts(lines: LineItemInput[]) {
  const counts: Record<number, number> = {}
  for (const line of lines) if (line.menu_item_id) counts[line.menu_item_id] = (counts[line.menu_item_id] ?? 0) + (parseFloat(line.quantity) || 0)
  return counts
}

/** The items whose stock is counted: they are sold in whole units. */
export function countedIDs(items: MenuItem[]) {
  return new Set(items.filter((item) => item.stock !== null).map((item) => item.id))
}
