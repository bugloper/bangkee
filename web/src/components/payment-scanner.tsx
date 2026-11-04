import { CameraIcon, CheckIcon, LoaderCircleIcon } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { detectScreen, loadPhoto, PhotoError, straighten, type Point, type Quad } from "@/lib/document-scan"
import { cn } from "@/lib/utils"

const CORNER_NAMES = ["top left", "top right", "bottom right", "bottom left"]

/**
 * Full screen, over everything: the photo just taken, with the four corners
 * Bangkee found on the phone screen in it. The owner drags any corner that
 * is off, then keeps the straightened picture.
 */
export function PaymentScanner({ file, onDone, onRetake, onCancel }: { file: File; onDone: (photo: Blob) => void; onRetake: () => void; onCancel: () => void }) {
  const [photo, setPhoto] = useState<{ canvas: HTMLCanvasElement; url: string } | null>(null)
  const [quad, setQuad] = useState<Quad | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadPhoto(file)
      .then((canvas) => {
        if (cancelled) return
        setPhoto({ canvas, url: canvas.toDataURL("image/jpeg", 0.85) })
        setQuad(detectScreen(canvas))
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof PhotoError ? e.message : "That photo could not be read. Try taking it again."))
    return () => {
      cancelled = true
    }
  }, [file])

  async function keep() {
    if (!photo || !quad) return
    setSaving(true)
    try {
      onDone(await straighten(photo.canvas, quad))
    } catch (e) {
      setError(e instanceof PhotoError ? e.message : "That photo could not be saved. Try taking it again.")
      setSaving(false)
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Line up the payment screen" className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 text-center">
        <div className="text-base font-semibold">Line up the corners</div>
        <div className="text-sm text-white/70">Drag each corner onto a corner of the phone's screen.</div>
      </div>

      <div className="relative min-h-0 flex-1 px-4">
        {error ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-white/80">{error}</div>
        ) : photo && quad ? (
          <CornerEditor url={photo.url} width={photo.canvas.width} height={photo.canvas.height} quad={quad} onChange={setQuad} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <LoaderCircleIcon className="size-8 animate-spin text-white/60" aria-label="Finding the screen" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-[auto_1fr_1fr] gap-2 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <Button type="button" variant="ghost" size="lg" className="text-white hover:bg-white/10 hover:text-white" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="outline" size="lg" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white" onClick={onRetake}>
          <CameraIcon /> Retake
        </Button>
        <Button type="button" size="lg" disabled={!quad || saving || !!error} onClick={keep}>
          {saving ? <LoaderCircleIcon className="animate-spin" /> : <CheckIcon />} Use photo
        </Button>
      </div>
    </div>
  )
}

/** The photo fitted to the space, with the quadrilateral and its four handles. */
function CornerEditor({ url, width, height, quad, onChange }: { url: string; width: number; height: number; quad: Quad; onChange: (quad: Quad) => void }) {
  const frame = useRef<HTMLDivElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState({ w: 0, h: 0 })
  const [dragging, setDragging] = useState<number | null>(null)

  // As large as the space allows, keeping the photo's shape.
  useLayoutEffect(() => {
    const element = frame.current
    if (!element) return
    const measure = () => {
      const scale = Math.min(element.clientWidth / width, element.clientHeight / height)
      setFit({ w: width * scale, h: height * scale })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [width, height])

  const move = (index: number, point: Point) => {
    const next = [...quad] as Quad
    next[index] = { x: Math.min(width, Math.max(0, point.x)), y: Math.min(height, Math.max(0, point.y)) }
    onChange(next)
  }

  const fromPointer = (event: React.PointerEvent): Point => {
    const rect = surface.current!.getBoundingClientRect()
    return { x: ((event.clientX - rect.left) / rect.width) * width, y: ((event.clientY - rect.top) / rect.height) * height }
  }

  const outline = quad.map((p) => `${p.x},${p.y}`).join(" ")

  return (
    <div ref={frame} className="flex h-full items-center justify-center">
      <div ref={surface} className="relative touch-none select-none" style={{ width: fit.w, height: fit.h }}>
        <img src={url} alt="The photo you took" className="size-full" draggable={false} />
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
          {/* Everything outside the screen is dimmed. */}
          <path d={`M0,0H${width}V${height}H0Z M${outline.replaceAll(" ", " L")}Z`} fillRule="evenodd" fill="rgb(0 0 0 / 0.5)" />
          <polygon points={outline} fill="none" stroke="white" strokeWidth={Math.max(width, height) / 300} />
        </svg>
        {quad.map((point, index) => (
          <button
            key={index}
            type="button"
            aria-label={`Corner, ${CORNER_NAMES[index]}. Arrow keys move it.`}
            className="absolute flex size-11 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full focus-visible:outline-none"
            style={{ left: `${(point.x / width) * 100}%`, top: `${(point.y / height) * 100}%` }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              setDragging(index)
            }}
            onPointerMove={(event) => dragging === index && move(index, fromPointer(event))}
            onPointerUp={() => setDragging(null)}
            onPointerCancel={() => setDragging(null)}
            onKeyDown={(event) => {
              const step = Math.max(width, height) / 100
              const delta: Record<string, Point> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } }
              const d = delta[event.key]
              if (!d) return
              event.preventDefault()
              move(index, { x: point.x + d.x, y: point.y + d.y })
            }}
          >
            <span className={cn("size-6 rounded-full border-[3px] border-white bg-primary/80 shadow-lg transition-transform", dragging === index && "scale-125")} />
          </button>
        ))}
      </div>
    </div>
  )
}
