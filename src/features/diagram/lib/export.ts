import type { DiagramDocument } from '@/model'
import { stringify } from '@/model'
import { contentBounds, documentFrames, renderDocumentSvg } from '@/features/diagram/lib/render-svg'
import { gifPalette, gifWriter } from '@/features/diagram/lib/gif'
import { diagramTheme } from '@/features/diagram/lib/theme'

/** Filename stem derived from the diagram title. */
export function slug(doc: DiagramDocument): string {
  return (
    doc.meta.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'diagram'
  )
}

/**
 * Whether this browser can write back to a file the user picked.
 *
 * Chromium can; Firefox and Safari cannot, and there every save is a fresh
 * download that the browser de-duplicates by appending "(1)", "(2)", … There is
 * no way around that from a page, so those browsers keep the old behaviour.
 */
export const canOverwriteFiles = typeof window !== 'undefined' && 'showSaveFilePicker' in window

/** The picker filter for the source format. */
const JSON_FILE_TYPE: FilePickerAcceptType = {
  description: 'Baugraph diagram',
  accept: { 'application/json': ['.json'] },
}

/** Thrown by the pickers when the user backs out; not an error worth showing. */
function isAbort(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError'
}

/**
 * Makes sure a remembered handle may still be written to. A handle recalled in
 * a new session starts unauthorised, and the grant has to be asked for from a
 * user gesture — which every caller here is.
 */
async function writable(handle: FileSystemFileHandle): Promise<boolean> {
  // Not every source of handles has a permission model; one that does not is
  // one that never withholds access.
  if (!handle.queryPermission) return true
  const options: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' }
  if ((await handle.queryPermission(options)) === 'granted') return true
  return (await handle.requestPermission?.(options)) === 'granted'
}

/** Overwrites `handle` in place. `false` means the grant was refused. */
export async function writeJson(
  handle: FileSystemFileHandle,
  doc: DiagramDocument,
): Promise<boolean> {
  if (!(await writable(handle))) return false
  const stream = await handle.createWritable()
  await stream.write(stringify(doc))
  await stream.close()
  return true
}

/**
 * Asks for a destination and writes the diagram to it. Returns the handle so
 * the caller can keep saving to the same file, or null if the user backed out.
 */
export async function writeJsonAs(doc: DiagramDocument): Promise<FileSystemFileHandle | null> {
  if (!window.showSaveFilePicker) return null
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: `${slug(doc)}.baugraph.json`,
      types: [JSON_FILE_TYPE],
      // Reopens in the directory the last diagram was saved to.
      id: 'baugraph-diagram',
    })
    return (await writeJson(handle, doc)) ? handle : null
  } catch (cause) {
    if (isAbort(cause)) return null
    throw cause
  }
}

/** Picks a file to open, keeping the handle so saving can write back to it. */
export async function pickJson(): Promise<{ text: string; handle: FileSystemFileHandle } | null> {
  if (!window.showOpenFilePicker) return null
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [JSON_FILE_TYPE],
      id: 'baugraph-diagram',
    })
    if (!handle) return null
    return { text: await (await handle.getFile()).text(), handle }
  } catch (cause) {
    if (isAbort(cause)) return null
    throw cause
  }
}

/** The handle behind a dropped file, where the browser exposes one. */
export async function droppedHandle(
  item: DataTransferItem | undefined,
): Promise<FileSystemFileHandle | null> {
  const handle = await item?.getAsFileSystemHandle?.().catch(() => null)
  return handle?.kind === 'file' ? (handle as FileSystemFileHandle) : null
}

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** The editable source format — this is what belongs in a repository. */
export function exportJson(doc: DiagramDocument) {
  download(
    `${slug(doc)}.baugraph.json`,
    new Blob([stringify(doc)], { type: 'application/json' }),
  )
}

export function exportSvg(doc: DiagramDocument, { transparent = false, animate = true } = {}) {
  download(
    `${slug(doc)}.svg`,
    new Blob([renderDocumentSvg(doc, { transparent, animate })], { type: 'image/svg+xml' }),
  )
}

/**
 * Loads an SVG string as an image the canvas can draw.
 *
 * Through a data URI rather than a blob URL: a blob URL would have to be revoked
 * at exactly the right moment, and a GIF makes hundreds of these.
 */
function svgImage(svg: string): Promise<HTMLImageElement> {
  // btoa() only handles latin-1, so encode UTF-8 bytes first.
  const bytes = new TextEncoder().encode(svg)
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('')

  const image = new Image()
  return new Promise((resolve, reject) => {
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The diagram could not be rasterised.'))
    image.src = `data:image/svg+xml;base64,${btoa(binary)}`
  })
}

function context(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D is unavailable in this browser.')
  return ctx
}

export async function exportPng(doc: DiagramDocument, scale = 2, { transparent = false } = {}) {
  const image = await svgImage(renderDocumentSvg(doc, { animate: false, transparent }))
  const bounds = contentBounds(doc)

  const ctx = context(Math.round(bounds.width * scale), Math.round(bounds.height * scale))
  const { canvas } = ctx
  if (!transparent) {
    ctx.fillStyle = diagramTheme(doc.canvas.theme).bg
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('PNG encoding failed.')
  download(`${slug(doc)}@${scale}x.png`, blob)
}

/* -------------------------------------------------------------------- gif */

/** Enough moments of the animation to have seen every colour it uses. */
const PALETTE_SAMPLES = 6

/** A ceiling on how much work one export can be, whatever it is asked for. */
const MAX_FRAMES = 240

/**
 * What a GIF of a flow lasting `duration` will actually come out as.
 *
 * A GIF holds each frame for a whole number of hundredths of a second, so the
 * frame rate is settled by that first and the frame count follows from it —
 * otherwise the animation plays back at a slightly different speed than the one
 * its frames were drawn for. The dialog quotes these numbers before the export
 * runs, so they are worked out here rather than twice.
 */
export function gifShape(duration: number, fps: number) {
  const delay = Math.max(2, Math.round(100 / Math.min(50, Math.max(5, fps))))
  const frames = Math.max(2, Math.min(MAX_FRAMES, Math.round((duration * 100) / delay)))
  return { delay, frames, fps: 100 / delay, seconds: (frames * delay) / 100 }
}

export interface GifExportOptions {
  fps?: number
  scale?: number
  /** Called with 0 → 1 as the frames are drawn; a GIF takes long enough to say so. */
  onProgress?: (done: number) => void
}

/**
 * The diagram as an animated GIF.
 *
 * An SVG already animates, and does it at any size — but a GIF is what a chat
 * window, a pull request and a slide deck will actually play, which is where a
 * diagram of a system in motion is worth having.
 *
 * The frames are the same renderer frozen at successive moments, rasterised
 * through the browser and handed to the encoder one at a time. `n / count`
 * rather than `n / (count - 1)`, so the last frame lands one step *before* the
 * start rather than on top of it and the loop has no stutter in it.
 */
export async function exportGif(doc: DiagramDocument, options: GifExportOptions = {}) {
  const { scale = 1, onProgress } = options
  const frames = documentFrames(doc)

  try {
    if (frames.duration <= 0) {
      throw new Error('This diagram has no flows to animate. Add one, or export a PNG.')
    }

    const { delay, frames: count } = gifShape(frames.duration, options.fps ?? 20)

    const width = Math.max(1, Math.round(frames.bounds.width * scale))
    const height = Math.max(1, Math.round(frames.bounds.height * scale))
    const ctx = context(width, height)
    const bg = diagramTheme(doc.canvas.theme).bg

    const shoot = async (index: number): Promise<Uint8ClampedArray> => {
      const image = await svgImage(frames.frame((index / count) * frames.duration))
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(image, 0, 0, width, height)
      return ctx.getImageData(0, 0, width, height).data
    }

    // The palette comes from moments spread across the pass — the messages are
    // somewhere different in each, so between them they cover every colour the
    // animation puts on screen. They are kept rather than redrawn later.
    const sampled = new Map<number, Uint8ClampedArray>()
    const step = Math.max(1, Math.floor(count / PALETTE_SAMPLES))
    for (let i = 0; i < count; i += step) sampled.set(i, await shoot(i))
    onProgress?.(0)

    const writer = gifWriter({
      width,
      height,
      palette: gifPalette([...sampled.values()]),
      delay,
    })

    for (let i = 0; i < count; i++) {
      writer.add(sampled.get(i) ?? (await shoot(i)))
      // Released as it goes: a hundred frames of pixels is hundreds of megabytes.
      sampled.delete(i)
      onProgress?.((i + 1) / count)
    }

    download(`${slug(doc)}.gif`, new Blob([writer.finish()], { type: 'image/gif' }))
  } finally {
    frames.dispose()
  }
}

/** Reads a `.baugraph.json` (or legacy export) chosen from a file input. */
export function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
    reader.readAsText(file)
  })
}
