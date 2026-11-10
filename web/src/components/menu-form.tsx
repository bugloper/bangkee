import { useMutation, useQuery } from "@tanstack/react-query"
import { useState } from "react"

import { api } from "@/api/client"
import type { MenuItem } from "@/api/types"
import { CategoryPicker } from "@/components/category-picker"
import { ErrorBox, Field } from "@/components/form"
import { ItemPhoto } from "@/components/item-photo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { groupByCategory, UNGROUPED } from "@/lib/catalog"
import { validationErrors } from "@/lib/errors"
import { flashAlert, flashNotice } from "@/lib/flash"
import { go } from "@/lib/go"
import { majorAmount } from "@/lib/money"
import { refreshAll } from "@/lib/query"

/** One of the shop's items: picked from when recording a credit, listed for customers. */
export function MenuForm({ item, defaultCategory }: { item?: MenuItem; defaultCategory?: string }) {
  const [name, setName] = useState(item?.name ?? "")
  const [category, setCategory] = useState(item?.category ?? defaultCategory ?? "")
  // The categories already in use, to pick from rather than retype.
  const menu = useQuery({ queryKey: ["menu_items"], queryFn: api.menuItems })
  const categories = groupByCategory(menu.data?.items ?? [])
    .map((g) => g.category)
    .filter((c) => c !== UNGROUPED)
  const [price, setPrice] = useState(item?.price ?? "")
  const [available, setAvailable] = useState(item?.available ?? true)
  const [cost, setCost] = useState(item?.cost ?? "")
  // Counting stock: once counted, the count moves by restocking and recounting, not here.
  const [count, setCount] = useState(item ? item.stock !== null : false)
  const [stock, setStock] = useState("")
  const [lowAt, setLowAt] = useState(item?.low_stock_at != null ? String(item.low_stock_at) : "")
  const counting = item?.stock != null
  // A photo is optional: a new one chosen, or the current one taken off.
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [photoRemoved, setPhotoRemoved] = useState(false)

  const save = useMutation({
    mutationFn: async () => {
      const input = { name, category, price, available, position: item?.position, counting: { count, stock, low_stock_at: lowAt, cost } }
      const result = item ? await api.updateMenuItem(item.id, input) : await api.createMenuItem(input)
      if (photo) {
        const form = new FormData()
        form.append("image", photo, "photo.jpg")
        try {
          await api.setItemImage(result.id, form)
        } catch {
          // The item is saved; only the photo is missing. Saying "Add item"
          // again would only meet "name already taken".
          flashAlert(`${name.trim()} is saved, but the photo did not upload. Try it again here.`)
          await refreshAll()
          go(`/menu_items/${result.id}/edit`)
          return null
        }
      } else if (photoRemoved && item?.image_url) {
        await api.removeItemImage(result.id)
      }
      return result
    },
    onSuccess: async (result) => {
      if (!result) return
      flashNotice(result.notice)
      await refreshAll()
      if (item) go("/menu_items")
      else {
        // Ready for the next one, in the same category.
        setName("")
        setPrice("")
        setAvailable(true)
        setCost("")
        setStock("")
        setPhoto(null)
        setPhotoRemoved(false)
      }
    },
  })

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate()
      }}
    >
      <ErrorBox errors={validationErrors(save.error)} />
      <ItemPhoto
        current={item?.image_url ?? null}
        photo={photo}
        removed={photoRemoved}
        onChoose={(chosen) => {
          setPhoto(chosen)
          setPhotoRemoved(false)
        }}
        onRemove={() => {
          setPhoto(null)
          setPhotoRemoved(true)
        }}
      />
      <Field label="Name" htmlFor="item_name">
        <Input id="item_name" required autoFocus={!item} placeholder="Ema datshi" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Price (Nu.)" htmlFor="item_price">
          <Input id="item_price" inputMode="decimal" required placeholder="0" className="tabular" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="Category" htmlFor="item_category">
          <CategoryPicker id="item_category" value={category} onChange={setCategory} yours={categories} />
        </Field>
      </div>
      <Field label="Buying price (Nu.)" hint={<Margin price={price} cost={cost} />} htmlFor="item_cost">
        <Input id="item_cost" inputMode="decimal" placeholder="Optional — what you pay for one" className="tabular" value={cost} onChange={(e) => setCost(e.target.value)} />
      </Field>
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3.5 py-3">
        <span className="grid gap-0.5">
          <span className="text-sm font-medium">In stock</span>
          <span className="text-xs text-muted-foreground">Out of stock items show greyed out to customers, and are left out when you record a credit.</span>
        </span>
        <Switch checked={available} onCheckedChange={setAvailable} />
      </label>
      <div className="grid gap-3 rounded-xl border px-3.5 py-3">
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">Count stock</span>
            <span className="text-xs text-muted-foreground">Credits and sales take from the count, and you hear when it runs low. Counted in whole units.</span>
          </span>
          <Switch checked={count} onCheckedChange={setCount} />
        </label>
        {count && (
          <div className="grid grid-cols-2 gap-3">
            {counting ? (
              <div className="grid gap-1 text-sm">
                <span className="font-medium">On the shelf</span>
                <span className="tabular text-muted-foreground">{item?.stock} · add stock or correct it below</span>
              </div>
            ) : (
              <Field label="In stock now" htmlFor="item_stock">
                <Input id="item_stock" required inputMode="numeric" placeholder="0" className="tabular" value={stock} onChange={(e) => setStock(e.target.value)} />
              </Field>
            )}
            <Field label="Warn me at" hint="Optional" htmlFor="item_low">
              <Input id="item_low" inputMode="numeric" placeholder="e.g. 5" className="tabular" value={lowAt} onChange={(e) => setLowAt(e.target.value)} />
            </Field>
          </div>
        )}
      </div>
      <Button type="submit" size="lg" disabled={save.isPending}>
        {item ? "Save changes" : "Add item"}
      </Button>
    </form>
  )
}

/** What one sells for over what it costs, once both are known. */
function Margin({ price, cost }: { price: string; cost: string }) {
  const sell = parseFloat(price)
  const buy = parseFloat(cost)
  if (!cost.trim() || !(sell > 0) || !(buy >= 0)) return "Optional"
  const margin = sell - buy
  return (
    <span className={margin < 0 ? "text-owed" : undefined}>
      Margin {majorAmount(margin)} ({Math.round((margin / sell) * 100)}%)
    </span>
  )
}
