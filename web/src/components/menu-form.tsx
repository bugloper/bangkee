import { useMutation, useQuery } from "@tanstack/react-query"
import { useState } from "react"

import { api } from "@/api/client"
import type { MenuItem } from "@/api/types"
import { ErrorBox, Field } from "@/components/form"
import { ItemPhoto } from "@/components/item-photo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { groupByCategory, UNGROUPED } from "@/lib/catalog"
import { validationErrors } from "@/lib/errors"
import { flashAlert, flashNotice } from "@/lib/flash"
import { go } from "@/lib/go"
import { refreshAll } from "@/lib/query"
import { cn } from "@/lib/utils"

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
  // A photo is optional: a new one chosen, or the current one taken off.
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [photoRemoved, setPhotoRemoved] = useState(false)

  const save = useMutation({
    mutationFn: async () => {
      const input = { name, category, price, available, position: item?.position }
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
          <Input id="item_category" placeholder="Food" value={category} onChange={(e) => setCategory(e.target.value)} />
        </Field>
      </div>
      {categories.length > 0 && (
        <div className="-mt-1 flex flex-wrap gap-1.5" aria-label="Categories in use">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                category.trim() === c ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3.5 py-3">
        <span className="grid gap-0.5">
          <span className="text-sm font-medium">In stock</span>
          <span className="text-xs text-muted-foreground">Out of stock items show greyed out to customers, and are left out when you record a credit.</span>
        </span>
        <Switch checked={available} onCheckedChange={setAvailable} />
      </label>
      <Button type="submit" size="lg" disabled={save.isPending}>
        {item ? "Save changes" : "Add item"}
      </Button>
    </form>
  )
}
