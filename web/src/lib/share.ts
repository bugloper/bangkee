// Handing over a document the server drew (a statement, a receipt): the
// phone's own share sheet with the PDF attached where the browser can do it
// — WhatsApp, Telegram, email, Files — and a plain download where it cannot.

import { API_HEADERS } from "@/api/client"

async function fetchFile(url: string, filename: string): Promise<File> {
  const response = await fetch(url, { credentials: "same-origin", headers: { ...API_HEADERS } })
  if (!response.ok) throw new Error(`That document could not be made (${response.status}).`)
  return new File([await response.blob()], filename, { type: "application/pdf" })
}

export function download(file: File) {
  const href = URL.createObjectURL(file)
  const link = Object.assign(document.createElement("a"), { href, download: file.name })
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(href), 10_000)
}

/** True where the share sheet can carry a file; elsewhere sharing downloads instead. */
export function canShareFiles(): boolean {
  try {
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([""], "x.pdf", { type: "application/pdf" })] })
  } catch {
    return false
  }
}

/** Downloads the PDF. */
export async function downloadDocument(url: string, filename: string) {
  download(await fetchFile(url, filename))
}

/** Opens the share sheet with the PDF; falls back to downloading it. Resolves false when the person cancelled. */
export async function shareDocument(url: string, filename: string, text: string): Promise<boolean> {
  const file = await fetchFile(url, filename)
  if (canShareFiles()) {
    try {
      await navigator.share({ files: [file], title: filename.replace(/\.pdf$/, ""), text })
      return true
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false
    }
  }
  download(file)
  return true
}
