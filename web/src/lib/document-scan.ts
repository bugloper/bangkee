// Straightening a photo of a phone's payment screen — the mBoB or mPay
// confirmation a customer holds up at the counter — the way an ID scanner
// does: find the screen's four corners, let the owner nudge them, then pull
// that quadrilateral out flat.
//
// Finding the corners: a lit phone screen is the brightest large thing in
// such a photo. The photo is shrunk, split into bright and dark at the
// threshold that separates them best (Otsu's), and the largest bright patch
// is taken as the screen; its corners are the patch's extreme points along
// the two diagonals. That holds for a screen held roughly upright, which is
// how one is shown across a counter. When no patch is big enough — a dark
// theme, glare — the corners start just inside the photo's edges, and the
// owner drags them.

export interface Point {
  x: number
  y: number
}

/** Top-left, top-right, bottom-right, bottom-left, in the photo's pixels. */
export type Quad = [Point, Point, Point, Point]

/** The working copy is no larger than this; enough to read any receipt. */
const WORKING_SIDE = 1600
/** Detection runs on a thumbnail this size. */
const DETECT_SIDE = 240
/** A patch smaller than this share of the photo is not taken for the screen. */
const MIN_SHARE = 0.08
const OUTPUT_QUALITY = 0.85

export class PhotoError extends Error {}

/** Reads the photo, upright and no larger than needed, onto a canvas. */
export async function loadPhoto(file: Blob): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  } catch {
    throw new PhotoError("That photo could not be read. Try taking it again.")
  }
  const scale = Math.min(1, WORKING_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext("2d")
  if (!context) throw new PhotoError("That photo could not be read. Try taking it again.")
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas
}

/** The corners just inside the photo's edges: where the owner starts dragging from. */
export function insetQuad(width: number, height: number): Quad {
  const dx = width * 0.08
  const dy = height * 0.08
  return [
    { x: dx, y: dy },
    { x: width - dx, y: dy },
    { x: width - dx, y: height - dy },
    { x: dx, y: height - dy },
  ]
}

/** Where the screen probably is in the photo. */
export function detectScreen(photo: HTMLCanvasElement): Quad {
  const scale = Math.min(1, DETECT_SIDE / Math.max(photo.width, photo.height))
  const w = Math.max(1, Math.round(photo.width * scale))
  const h = Math.max(1, Math.round(photo.height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) return insetQuad(photo.width, photo.height)
  context.drawImage(photo, 0, 0, w, h)
  const { data } = context.getImageData(0, 0, w, h)

  const luma = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) luma[i] = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000
  const bright = new Uint8Array(w * h)
  const threshold = otsu(luma)
  for (let i = 0; i < w * h; i++) bright[i] = luma[i] > threshold ? 1 : 0

  const patch = largestPatch(bright, w, h)
  if (patch.length < w * h * MIN_SHARE) return insetQuad(photo.width, photo.height)

  // Extremes along the diagonals: smallest x+y is top-left, largest is
  // bottom-right; largest x−y is top-right, smallest is bottom-left.
  let tl = patch[0]
  let br = patch[0]
  let tr = patch[0]
  let bl = patch[0]
  const at = (i: number) => ({ x: i % w, y: Math.floor(i / w) })
  for (const i of patch) {
    const p = at(i)
    const sum = p.x + p.y
    const diff = p.x - p.y
    const tlp = at(tl)
    const brp = at(br)
    const trp = at(tr)
    const blp = at(bl)
    if (sum < tlp.x + tlp.y) tl = i
    if (sum > brp.x + brp.y) br = i
    if (diff > trp.x - trp.y) tr = i
    if (diff < blp.x - blp.y) bl = i
  }
  const back = (i: number): Point => {
    const p = at(i)
    return { x: (p.x + 0.5) / scale, y: (p.y + 0.5) / scale }
  }
  return [back(tl), back(tr), back(br), back(bl)]
}

/** The threshold that best splits the picture into two groups of brightness. */
function otsu(luma: Uint8Array): number {
  const histogram = new Array<number>(256).fill(0)
  for (const value of luma) histogram[value]++
  const total = luma.length
  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * histogram[t]
  let sumBelow = 0
  let below = 0
  let best = 0
  let threshold = 127
  for (let t = 0; t < 256; t++) {
    below += histogram[t]
    if (below === 0) continue
    const above = total - below
    if (above === 0) break
    sumBelow += t * histogram[t]
    const meanBelow = sumBelow / below
    const meanAbove = (sum - sumBelow) / above
    const between = below * above * (meanBelow - meanAbove) ** 2
    if (between > best) {
      best = between
      threshold = t
    }
  }
  return threshold
}

/** The pixel indexes of the largest connected bright patch. */
function largestPatch(mask: Uint8Array, w: number, h: number): number[] {
  const seen = new Uint8Array(w * h)
  let largest: number[] = []
  const stack: number[] = []
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || seen[start]) continue
    const patch: number[] = []
    stack.push(start)
    seen[start] = 1
    while (stack.length > 0) {
      const i = stack.pop()!
      patch.push(i)
      const x = i % w
      const neighbours = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]
      for (const n of neighbours) {
        if (n >= 0 && n < w * h && mask[n] && !seen[n]) {
          seen[n] = 1
          stack.push(n)
        }
      }
    }
    if (patch.length > largest.length) largest = patch
  }
  return largest
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/** Pulls the quadrilateral out of the photo as a flat, upright JPEG. */
export async function straighten(photo: HTMLCanvasElement, quad: Quad): Promise<Blob> {
  const [tl, tr, br, bl] = quad
  let width = Math.max(distance(tl, tr), distance(bl, br))
  let height = Math.max(distance(tl, bl), distance(tr, br))
  const scale = Math.min(1, WORKING_SIDE / Math.max(width, height))
  width = Math.max(1, Math.round(width * scale))
  height = Math.max(1, Math.round(height * scale))

  const sourceContext = photo.getContext("2d", { willReadFrequently: true })
  if (!sourceContext) throw new PhotoError("That photo could not be read. Try taking it again.")
  const source = sourceContext.getImageData(0, 0, photo.width, photo.height)
  const out = new ImageData(width, height)
  const map = homography(
    [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ],
    quad,
  )
  const sw = photo.width
  const sh = photo.height
  const s = source.data
  const o = out.data
  for (let v = 0; v < height; v++) {
    for (let u = 0; u < width; u++) {
      const cu = u + 0.5
      const cv = v + 0.5
      const z = map[6] * cu + map[7] * cv + 1
      const x = Math.min(sw - 1.001, Math.max(0, (map[0] * cu + map[1] * cv + map[2]) / z - 0.5))
      const y = Math.min(sh - 1.001, Math.max(0, (map[3] * cu + map[4] * cv + map[5]) / z - 0.5))
      // Bilinear: the four pixels around the point, weighted by nearness.
      const x0 = Math.floor(x)
      const y0 = Math.floor(y)
      const fx = x - x0
      const fy = y - y0
      const a = (y0 * sw + x0) * 4
      const b = a + 4
      const c = a + sw * 4
      const d = c + 4
      const target = (v * width + u) * 4
      for (let k = 0; k < 3; k++) {
        const top = s[a + k] + (s[b + k] - s[a + k]) * fx
        const bottom = s[c + k] + (s[d + k] - s[c + k]) * fx
        o[target + k] = top + (bottom - top) * fy
      }
      o[target + 3] = 255
    }
  }

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  canvas.getContext("2d")!.putImageData(out, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", OUTPUT_QUALITY))
  if (!blob) throw new PhotoError("That photo could not be saved. Try taking it again.")
  return blob
}

/**
 * The projective map taking each `from` point to its `to` point:
 * x = (a·u + b·v + c) / (g·u + h·v + 1), y = (d·u + e·v + f) / (g·u + h·v + 1).
 * Returns [a, b, c, d, e, f, g, h].
 */
function homography(from: Point[], to: Point[]): number[] {
  const rows: number[][] = []
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = from[i]
    const { x, y } = to[i]
    rows.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x])
    rows.push([0, 0, 0, u, v, 1, -u * y, -v * y, y])
  }
  // Gaussian elimination with partial pivoting on the 8×9 augmented matrix.
  for (let col = 0; col < 8; col++) {
    let pivot = col
    for (let r = col + 1; r < 8; r++) if (Math.abs(rows[r][col]) > Math.abs(rows[pivot][col])) pivot = r
    ;[rows[col], rows[pivot]] = [rows[pivot], rows[col]]
    const lead = rows[col][col] || 1e-12
    for (let r = 0; r < 8; r++) {
      if (r === col) continue
      const factor = rows[r][col] / lead
      for (let k = col; k < 9; k++) rows[r][k] -= factor * rows[col][k]
    }
  }
  return rows.map((row, i) => row[8] / (row[i] || 1e-12))
}
