import { ImageUpIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { Label } from "@/components/ui/label"

/**
 * The transfer screenshot, previewed the moment it is chosen — on a slow
 * connection that is the only way to know the right picture is attached
 * before uploading it.
 */
export function ScreenshotInput({ id, label, hint, onChange, capture }: { id: string; label: string; hint: string; onChange: (file: File | null) => void; capture?: boolean }) {
  const [preview, setPreview] = useState<string | null>(null)
  const [name, setName] = useState<string | null>(null)

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )

  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <label
        htmlFor={id}
        className="group relative flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-dashed bg-muted/30 px-4 py-6 text-center transition-colors hover:border-primary/40 hover:bg-accent/40 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
      >
        {preview ? (
          <>
            <img src={preview} alt="Your screenshot" className="max-h-72 rounded-lg object-contain shadow-sm" />
            <span className="text-xs text-muted-foreground">{name} · tap to choose another</span>
          </>
        ) : (
          <>
            <span className="flex size-10 items-center justify-center rounded-full bg-card text-primary shadow-xs ring-1 ring-foreground/5">
              <ImageUpIcon className="size-5" />
            </span>
            <span className="text-sm font-medium">Choose the screenshot</span>
            <span className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to 8 MB</span>
          </>
        )}
        <input
          id={id}
          name="screenshot"
          type="file"
          accept="image/*"
          capture={capture ? "environment" : undefined}
          required
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null
            onChange(file)
            setName(file?.name ?? null)
            setPreview(file ? URL.createObjectURL(file) : null)
          }}
        />
      </label>
    </div>
  )
}
