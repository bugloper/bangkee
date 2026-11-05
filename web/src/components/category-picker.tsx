import { ChoiceField } from "@/components/choice-field"
import { COMMON_CATEGORIES } from "@/lib/catalog"

const asChoices = (categories: string[]) => categories.map((c) => ({ value: c, label: c }))

/** An item's category: the shop's own first, then the common ones, or a new one typed in. */
export function CategoryPicker({ id, value, onChange, yours }: { id?: string; value: string; onChange: (value: string) => void; yours: string[] }) {
  const groups = [
    { title: "Your categories", choices: asChoices(yours) },
    ...COMMON_CATEGORIES.map((g) => ({ title: g.group, choices: asChoices(g.categories.filter((c) => !yours.includes(c))) })),
  ].filter((g) => g.choices.length > 0)
  return <ChoiceField id={id} title="Category" value={value.trim()} onChange={onChange} groups={groups} none="No category" allowNew />
}
