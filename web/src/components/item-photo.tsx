import { ImagePlusIcon, XIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { shrinkPhoto } from "@/lib/image"

/**
 * An item's optional photo: the one it has, or a new one chosen — already
 * shrunk to a sensible size by the time it shows here.
 */
export function ItemPhoto({
  current,
  photo,
  removed,
  onChoose,
  onRemove,
}: {
  current: string | null
  photo: Blob | null
  removed: boolean
  onChoose: (photo: Blob) => void
  onRemove: () => void
}) {
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )

  const shown = preview ?? (removed ? null : current)

  return (
    <div className="flex items-center gap-3">
      <label className="relative flex size-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed bg-muted/30 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
        {shown ? <img src={shown} alt="" className="size-full object-cover" /> : <ImagePlusIcon className="size-5" />}
        <input
          type="file"
          accept="image/*"
          aria-label={shown ? "Change the photo" : "Add a photo"}
          className="absolute inset-0 cursor-pointer opacity-0"
          disabled={busy}
          onChange={async (event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (!file) return
            setBusy(true)
            setProblem(null)
            try {
              onChoose(await shrinkPhoto(file))
            } catch (error) {
              setProblem(error instanceof Error ? error.message : "That photo could not be read.")
            } finally {
              setBusy(false)
            }
          }}
        />
      </label>
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-medium">{shown ? "Photo" : "Add a photo"}</div>
        <div className={problem ? "text-destructive" : "text-muted-foreground"}>
          {problem ?? (busy ? "Preparing it…" : shown ? "Tap it to choose another" : "Optional — customers see it on the menu")}
        </div>
      </div>
      {shown && (
        <button type="button" onClick={onRemove} aria-label="Remove the photo" className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  )
}
