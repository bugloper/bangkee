import { useMutation } from "@tanstack/react-query"
import { CameraIcon, Loader2Icon } from "lucide-react"
import { useState } from "react"

import type { Notice } from "@/api/types"
import { flashNotice } from "@/lib/flash"
import { shrinkPhoto } from "@/lib/image"
import { refreshAll } from "@/lib/query"
import { cn } from "@/lib/utils"

/**
 * A photo saved the moment it is chosen: a person's profile photo (round) or
 * a shop's (rounded square). Shrunk on the device before it is sent.
 */
export function PhotoUpload({
  current,
  fallback,
  label,
  shape = "round",
  className,
  onSave,
  onRemove,
}: {
  current: string | null
  fallback: string
  label: string
  shape?: "round" | "square"
  className?: string
  onSave: (form: FormData) => Promise<Notice>
  onRemove: () => Promise<Notice>
}) {
  const [problem, setProblem] = useState<string | null>(null)
  const done = async (result: Notice) => {
    flashNotice(result.notice)
    await refreshAll()
  }
  const save = useMutation({ mutationFn: onSave, onSuccess: done, onError: (error) => setProblem(error instanceof Error ? error.message : "That photo could not be saved.") })
  const remove = useMutation({ mutationFn: onRemove, onSuccess: done })
  const busy = save.isPending || remove.isPending

  return (
    <div className="flex flex-col items-center gap-2">
      <label
        className={cn(
          "group relative flex shrink-0 cursor-pointer items-center justify-center overflow-hidden bg-accent text-accent-foreground ring-1 ring-border has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
          shape === "round" ? "rounded-full" : "rounded-2xl",
          className,
        )}
      >
        {current ? <img src={current} alt="" className="size-full object-cover" /> : <span className="text-[2.5em] font-semibold">{fallback.charAt(0).toUpperCase()}</span>}
        <span className="absolute inset-x-0 bottom-0 flex h-1/3 items-center justify-center bg-black/45 text-white opacity-90 transition-opacity group-hover:opacity-100">
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : <CameraIcon className="size-4" />}
        </span>
        <input
          type="file"
          accept="image/*"
          aria-label={current ? `Change ${label}` : `Add ${label}`}
          className="absolute inset-0 cursor-pointer opacity-0"
          disabled={busy}
          onChange={async (event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (!file) return
            setProblem(null)
            try {
              const form = new FormData()
              form.append("image", await shrinkPhoto(file), "photo.jpg")
              save.mutate(form)
            } catch (error) {
              setProblem(error instanceof Error ? error.message : "That photo could not be read.")
            }
          }}
        />
      </label>
      {problem ? (
        <span className="text-center text-[0.8125rem] text-destructive">{problem}</span>
      ) : current ? (
        <button type="button" className="text-[0.8125rem] font-medium text-muted-foreground hover:text-destructive" disabled={busy} onClick={() => remove.mutate()}>
          Remove photo
        </button>
      ) : (
        <span className="text-[0.8125rem] text-muted-foreground">Tap to add {label}</span>
      )}
    </div>
  )
}
