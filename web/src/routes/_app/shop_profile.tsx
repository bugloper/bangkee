import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { EyeIcon } from "lucide-react"
import { lazy, Suspense, useState } from "react"

import { api } from "@/api/client"
import type { ShopProfileForm } from "@/api/types"
import { AppLink } from "@/components/app-link"
import { ChoiceField } from "@/components/choice-field"
import { ErrorBox, Field, Loading } from "@/components/form"
import { Panel } from "@/components/kit"
import { PhotoUpload } from "@/components/photo-upload"
import type { Pin } from "@/components/shop-map"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { validationErrors } from "@/lib/errors"
import { flashNotice } from "@/lib/flash"
import { go } from "@/lib/go"
import { usePage } from "@/lib/page"
import { refreshAll } from "@/lib/query"

export const Route = createFileRoute("/_app/shop_profile")({ component: ShopProfileScreen })

// Leaflet loads only on the screens with a map.
const PinPicker = lazy(() => import("@/components/shop-map").then((m) => ({ default: m.PinPicker })))

// Profile → Shop profile: what customers read above the shop's items when
// they browse shops. Only the name is needed.
function ShopProfileScreen() {
  usePage("Shop profile", "/settings", { narrow: true })
  const { data } = useQuery({ queryKey: ["shop_profile"], queryFn: api.shopProfile })
  if (!data) return <Loading />
  return <ProfileForm data={data} />
}

function ProfileForm({ data }: { data: ShopProfileForm }) {
  const { shop } = data
  const [name, setName] = useState(shop.name)
  const [kind, setKind] = useState(shop.kind ?? "")
  const [about, setAbout] = useState(shop.about ?? "")
  const [location, setLocation] = useState(shop.location ?? "")
  const [phone, setPhone] = useState(shop.phone ?? "")
  const [hours, setHours] = useState(shop.hours ?? "")
  const [pin, setPin] = useState<Pin | null>(shop.latitude != null && shop.longitude != null ? { latitude: shop.latitude, longitude: shop.longitude } : null)

  const save = useMutation({
    mutationFn: () => api.updateShopProfile({ name, kind, about, location, phone, hours, latitude: pin?.latitude ?? null, longitude: pin?.longitude ?? null }),
    onSuccess: async (result) => {
      flashNotice(result.notice)
      await refreshAll()
      go("/settings")
    },
  })

  return (
    <div className="grid gap-4">
      <Panel>
        <PhotoUpload current={shop.photo_url} fallback={shop.name} label="a shop photo" shape="square" className="size-28" onSave={api.setShopPhoto} onRemove={api.removeShopPhoto} />
      </Panel>
      <Panel>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            save.mutate()
          }}
        >
          <ErrorBox errors={validationErrors(save.error)} />
          <Field label="Shop name" htmlFor="shop_name">
            <Input id="shop_name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Type of business" hint="Customers find you by it" htmlFor="shop_kind">
            <ChoiceField id="shop_kind" title="Type of business" value={kind} onChange={setKind} groups={[{ choices: data.kinds.map((k) => ({ value: k.key, label: k.label })) }]} />
          </Field>
          <Field label="About" hint={`${about.trim().length}/300`} htmlFor="shop_about">
            <Textarea id="shop_about" rows={3} maxLength={300} placeholder="What you sell, what you're known for" value={about} onChange={(e) => setAbout(e.target.value)} />
          </Field>
          <Field label="Location" htmlFor="shop_location">
            <Input id="shop_location" maxLength={120} placeholder="Norzin Lam, Thimphu" value={location} onChange={(e) => setLocation(e.target.value)} />
          </Field>
          <Field label="On the map" hint="Optional — customers get directions to the pin">
            <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted sm:h-72" />}>
              <PinPicker value={pin} onChange={setPin} />
            </Suspense>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone" htmlFor="shop_phone">
              <Input id="shop_phone" type="tel" inputMode="tel" placeholder="17 12 34 56" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Opening hours" htmlFor="shop_hours">
              <Input id="shop_hours" maxLength={120} placeholder="9 am – 8 pm, closed Tuesday" value={hours} onChange={(e) => setHours(e.target.value)} />
            </Field>
          </div>
          <Button type="submit" size="lg" disabled={save.isPending}>
            Save profile
          </Button>
        </form>
      </Panel>
      <AppLink href={`/shops/${shop.id}`} className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline">
        <EyeIcon className="size-4" /> See your shop as customers do
      </AppLink>
    </div>
  )
}
