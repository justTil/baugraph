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
