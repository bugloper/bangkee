// A phone's camera makes 3–5 MB photos; an item's picture needs a fraction
// of that. Shrunk and re-encoded as JPEG here, before it uploads: quicker on
// a weak signal, and readable on every phone — an iPhone's HEIC is not.

const LONGEST_SIDE = 1200
const QUALITY = 0.82

export async function shrinkPhoto(file: File): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  } catch {
    throw new Error("That photo could not be read. Try a JPEG or PNG.")
  }
  const scale = Math.min(1, LONGEST_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext("2d")
  if (!context) throw new Error("That photo could not be read. Try a JPEG or PNG.")
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY))
  if (!blob) throw new Error("That photo could not be read. Try a JPEG or PNG.")
  return blob
}
