import type { DiagramDocument } from '@/model'
import { stringify } from '@/model'
import { contentBounds, renderDocumentSvg } from '@/features/diagram/lib/render-svg'
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

export function exportSvg(doc: DiagramDocument, { transparent = false } = {}) {
  download(
    `${slug(doc)}.svg`,
    new Blob([renderDocumentSvg(doc, { transparent })], { type: 'image/svg+xml' }),
  )
}

export async function exportPng(doc: DiagramDocument, scale = 2) {
  const svg = renderDocumentSvg(doc, { animate: false })
  const bounds = contentBounds(doc)

  // btoa() only handles latin-1, so encode UTF-8 bytes first.
  const bytes = new TextEncoder().encode(svg)
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
  const source = `data:image/svg+xml;base64,${btoa(binary)}`

  const image = new Image()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('The diagram could not be rasterised.'))
    image.src = source
  })

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bounds.width * scale)
  canvas.height = Math.round(bounds.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is unavailable in this browser.')
  ctx.fillStyle = diagramTheme(doc.canvas.theme).bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('PNG encoding failed.')
  download(`${slug(doc)}@${scale}x.png`, blob)
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
