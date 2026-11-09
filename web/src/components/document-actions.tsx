import { DownloadIcon, MessageCircleIcon, Share2Icon } from "lucide-react"
import { useState } from "react"

import { Button, buttonVariants } from "@/components/ui/button"
import { flashAlert } from "@/lib/flash"
import { whatsappLink } from "@/lib/phone"
import { downloadDocument, shareDocument } from "@/lib/share"

/**
 * Handing a PDF over: the phone's share sheet with the file attached (or a
 * download where that is not possible), a plain download, and — for the
 * shop, when the customer has a number — WhatsApp with a short note.
 */
export function DocumentActions({ url, filename, text, whatsappTo }: { url: string; filename: string; text: string; whatsappTo?: string | null }) {
  const [busy, setBusy] = useState<"share" | "download" | null>(null)
  async function run(kind: "share" | "download") {
    setBusy(kind)
    try {
      if (kind === "share") await shareDocument(url, filename, text)
      else await downloadDocument(url, filename)
    } catch (error) {
      flashAlert(error instanceof Error ? error.message : "That document could not be made.")
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => run("share")} disabled={busy !== null}>
        <Share2Icon /> {busy === "share" ? "Preparing…" : "Share PDF"}
      </Button>
      <Button variant="outline" onClick={() => run("download")} disabled={busy !== null}>
        <DownloadIcon /> {busy === "download" ? "Preparing…" : "Download"}
      </Button>
      {whatsappTo && (
        <a href={whatsappLink(whatsappTo, text)} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>
          <MessageCircleIcon /> WhatsApp
        </a>
      )}
    </div>
  )
}
