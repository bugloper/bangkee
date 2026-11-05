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
