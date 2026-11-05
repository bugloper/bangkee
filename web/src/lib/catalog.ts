// Grouping and searching a shop's items, for the owner's Items screen and
// the shop page customers browse.

/** Items without a category, last in every list. Matches domain.Ungrouped. */
export const UNGROUPED = "Everything else"

/** Items grouped by category in the order they come, ungrouped ones last. */
export function groupByCategory<T extends { category: string | null }>(items: T[]): { category: string; items: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const category = item.category?.trim() || UNGROUPED
    groups.set(category, [...(groups.get(category) ?? []), item])
  }
  const list = [...groups].map(([category, grouped]) => ({ category, items: grouped }))
  return [...list.filter((g) => g.category !== UNGROUPED), ...list.filter((g) => g.category === UNGROUPED)]
}

/** Does the item's name (or its category) contain what was typed? */
export function matches(needle: string, ...fields: (string | null | undefined)[]) {
  const n = needle.trim().toLowerCase()
  return !n || fields.some((field) => field?.toLowerCase().includes(n))
}

/**
 * Categories most small and medium shops here sell under, offered when an
 * owner files an item. A bar sells food and a grocery sells drinks, so every
 * shop gets the whole list; an owner can still type their own.
 */
export const COMMON_CATEGORIES: { group: string; categories: string[] }[] = [
  { group: "Food", categories: ["Meals", "Momos", "Noodles & Thukpa", "Soups", "Snacks", "Fried items", "Bakery", "Sweets & Desserts"] },
  { group: "Drinks", categories: ["Tea & Coffee", "Soft drinks", "Juice", "Water", "Energy drinks", "Beer", "Wine", "Spirits"] },
  {
    group: "Groceries",
    categories: [
      "Rice & Grains",
      "Flour & Atta",
      "Dal & Pulses",
      "Cooking oil",
      "Spices & Masala",
      "Salt & Sugar",
      "Vegetables",
      "Fruits",
      "Meat",
      "Fish",
      "Eggs",
      "Dairy & Cheese",
      "Instant noodles",
      "Biscuits & Chips",
      "Chocolates & Candy",
      "Packaged food",
    ],
  },
  {
    group: "Household & general",
    categories: [
      "Doma & Paan",
      "Household",
      "Cleaning",
      "Personal care",
      "Baby care",
      "Medicines",
      "Stationery",
      "Mobile recharge",
      "Gas & Fuel",
      "Hardware",
      "Electricals",
      "Clothing",
      "Games & Table time",
      "Other",
    ],
  },
]
