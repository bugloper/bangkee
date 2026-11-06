// Maps, from OpenStreetMap through Leaflet: the owner drops a pin where the
// shop is, and customers see it with a way to get directions. This module is
// loaded only when a map is on screen (see lazy imports), so Leaflet costs
// nothing elsewhere.

import "leaflet/dist/leaflet.css"

import L from "leaflet"
import { CrosshairIcon, Loader2Icon, XIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"

export type Pin = { latitude: number; longitude: number }

// Thimphu, where most shops are: where an unpinned map starts.
const THIMPHU: L.LatLngTuple = [27.4728, 89.639]

function tiles(map: L.Map) {
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map)
}

// A pin drawn in CSS, so there are no marker images to bundle.
const pinIcon = L.divIcon({
  className: "",
  html: '<span style="display:block;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:var(--color-primary);border:3px solid white;box-shadow:0 2px 6px rgb(0 0 0 / .35)"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
})

const round = (n: number) => Math.round(n * 1e6) / 1e6

/** The owner's map: tap or drag to place the pin, or use where they stand. */
export function PinPicker({ value, onChange }: { value: Pin | null; onChange: (pin: Pin | null) => void }) {
  const element = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const marker = useRef<L.Marker | null>(null)
  const change = useRef(onChange)
  useEffect(() => {
    change.current = onChange
  })
  // Where the map opens: the pin it was given, or Thimphu. After that the
  // map stays put and the pin follows `value` (below).
  const start = useRef(value)
  const [locating, setLocating] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    const opening = start.current
    const m = L.map(element.current!, { scrollWheelZoom: false }).setView(opening ? [opening.latitude, opening.longitude] : THIMPHU, opening ? 17 : 13)
    tiles(m)
    m.on("click", (event: L.LeafletMouseEvent) => change.current({ latitude: round(event.latlng.lat), longitude: round(event.latlng.lng) }))
    map.current = m
    return () => {
      m.remove()
      map.current = null
      marker.current = null
    }
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m) return
    if (!value) {
      marker.current?.remove()
      marker.current = null
      return
    }
    const at: L.LatLngTuple = [value.latitude, value.longitude]
    if (marker.current) {
      marker.current.setLatLng(at)
    } else {
      marker.current = L.marker(at, { icon: pinIcon, draggable: true, keyboard: true, title: "Your shop" }).addTo(m)
      marker.current.on("dragend", () => {
        const { lat, lng } = marker.current!.getLatLng()
        change.current({ latitude: round(lat), longitude: round(lng) })
      })
    }
  }, [value])

  function here() {
    if (!("geolocation" in navigator)) return setProblem("This browser cannot tell where you are.")
    setLocating(true)
    setProblem(null)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false)
        const pin = { latitude: round(coords.latitude), longitude: round(coords.longitude) }
        change.current(pin)
        map.current?.setView([pin.latitude, pin.longitude], 17)
      },
      () => {
        setLocating(false)
        setProblem("Bangkee could not get your location. Tap the map where the shop is instead.")
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    )
  }

  return (
    <div className="grid gap-2">
      <div ref={element} role="application" aria-label="Map: tap where your shop is" className="z-0 h-64 overflow-hidden rounded-2xl border sm:h-72" />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={here} disabled={locating}>
          {locating ? <Loader2Icon className="animate-spin" /> : <CrosshairIcon />} Use where I am
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => change.current(null)}>
            <XIcon /> Clear the pin
          </Button>
        )}
        <span className="text-[0.8125rem] text-muted-foreground">{problem ?? (value ? "Drag the pin to adjust it." : "Tap the map where your shop is.")}</span>
      </div>
    </div>
  )
}

/** Where a shop is, for customers: a small map with the pin. */
export function ShopMap({ pin, name }: { pin: Pin; name: string }) {
  const element = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // On a phone the page scrolls under a finger; the map moves with two.
    const m = L.map(element.current!, { scrollWheelZoom: false, dragging: !L.Browser.mobile, zoomControl: true }).setView([pin.latitude, pin.longitude], 16)
    tiles(m)
    L.marker([pin.latitude, pin.longitude], { icon: pinIcon, title: name, keyboard: false }).addTo(m)
    return () => void m.remove()
  }, [pin.latitude, pin.longitude, name])
  return <div ref={element} role="img" aria-label={`Map showing where ${name} is`} className="z-0 h-44 overflow-hidden rounded-2xl border" />
}
