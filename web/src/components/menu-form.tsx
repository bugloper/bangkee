import { useMutation } from "@tanstack/react-query"
import { useState } from "react"

import { api } from "@/api/client"
import type { MenuItem } from "@/api/types"
import { Check, ErrorBox, Field } from "@/components/form"
import { ItemPhoto } from "@/components/item-photo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { validationErrors } from "@/lib/errors"
import { flashAlert, flashNotice } from "@/lib/flash"
import { go } from "@/lib/go"
import { refreshAll } from "@/lib/query"

/** One of the shop's items: picked from when recording a credit, listed for customers. */
export function MenuForm({ item }: { item?: MenuItem }) {
  const [name, setName] = useState(item?.name ?? "")
  const [category, setCategory] = useState(item?.category ?? "")
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
        setName("")
        setCategory("")
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
      <div className="grid grid-cols-[1fr_6.5rem_6rem] gap-2">
        <Field label="Item" srOnly>
          <Input aria-label="Item" required placeholder="Ema datshi" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Group" srOnly>
          <Input aria-label="Group" placeholder="Food" value={category} onChange={(e) => setCategory(e.target.value)} />
        </Field>
        <Field label="Price" srOnly>
          <Input aria-label="Price" inputMode="decimal" required placeholder="Nu." className="tabular" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Check label="Available today" checked={available} onChange={setAvailable} />
        <Button type="submit" disabled={save.isPending}>
          {item ? "Save changes" : "Add item"}
        </Button>
      </div>
    </form>
  )
}
