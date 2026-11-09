import { useMutation } from "@tanstack/react-query"
import { FileTextIcon, PaperclipIcon, XIcon } from "lucide-react"
import { useRef } from "react"

import { api } from "@/api/client"
import type { LedgerEntry } from "@/api/types"
import { Thumb } from "@/components/viewer"
import { buttonVariants } from "@/components/ui/button"
import { confirm } from "@/lib/confirm"
import { flashNotice } from "@/lib/flash"
import { useFeature } from "@/lib/me"
import { refreshAll } from "@/lib/query"
import { cn } from "@/lib/utils"

const MAX = 5
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)

/** The files on an entry: photos as thumbnails, PDFs as links. */
export function EntryDocuments({ entry, editable }: { entry: LedgerEntry; editable: boolean }) {
  const remove = useMutation({
    mutationFn: (id: number) => api.removeDocument(entry.id, id),
    onSuccess: async (result) => {
      flashNotice(result.notice)
      await refreshAll()
    },
  })
  if (entry.documents.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {entry.documents.map((doc) => (
        <div key={doc.id} className="relative">
          {doc.content_type.startsWith("image/") && doc.content_type !== "image/heic" ? (
            <Thumb url={doc.url} size={56} caption={doc.filename} label={`Open ${doc.filename}`} />
          ) : (
            <a
              href={doc.url}
              target="_blank"
              rel="noreferrer"
              className="flex h-14 max-w-44 items-center gap-2 rounded-lg border bg-muted/40 px-2.5 text-[0.8125rem] hover:bg-muted"
              title={doc.filename}
            >
              <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{doc.filename}</span>
                <span className="block text-xs text-muted-foreground">{size(doc.byte_size)}</span>
              </span>
            </a>
          )}
          {editable && (
            <button
              type="button"
              aria-label={`Remove ${doc.filename}`}
              disabled={remove.isPending}
              onClick={async () => {
                if (await confirm(`Remove ${doc.filename}?|The file is deleted. The entry stays as it is.`, { danger: true })) remove.mutate(doc.id)
              }}
              className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm hover:text-destructive"
            >
              <XIcon className="size-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

/** The shop's button to attach a photo or PDF to an entry. */
export function AttachButton({ entry }: { entry: LedgerEntry }) {
  const allowed = useFeature("attachments")
  const input = useRef<HTMLInputElement>(null)
  const add = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.set("file", file, file.name)
      return api.addDocument(entry.id, form)
    },
    onSuccess: async (result) => {
      flashNotice(result.notice)
      await refreshAll()
    },
  })
  if (!allowed || entry.documents.length >= MAX) return null
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) add.mutate(file)
        }}
      />
      <button type="button" disabled={add.isPending} onClick={() => input.current?.click()} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        <PaperclipIcon /> {add.isPending ? "Attaching…" : "Attach"}
      </button>
    </>
  )
}
