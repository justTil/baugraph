import { createApp, h } from 'vue'
import type { DiagramDocument, DiagramNode } from '@/model'
import { iconComponent } from '@/features/diagram/data/icons'
import { STACKED_SHAPES, contentInset, roundedRect, shapeElements } from '@/features/diagram/lib/shapes'
import { arrowHeadPath, dashArray, edgeGeometry } from '@/features/diagram/lib/edge-path'
import { nodeCaption } from '@/features/diagram/lib/node-caption'
import { diagramTheme, edgeColor, mix, nodePaint } from '@/features/diagram/lib/theme'
import { SANS, escapeXml, fitText, measureText } from '@/features/diagram/lib/text'

/**
 * Standalone SVG renderer used for export.
 *
 * The canvas draws nodes as HTML for crisp text and cheap hit-testing, which
 * cannot be serialised into a portable SVG. This module re-renders the same
 * document as pure SVG, reusing the shared shape, routing and colour helpers so
 * the export matches what is on screen.
 */

/** Extra room around the content in the exported viewBox. */
const EXPORT_PADDING = 30

const iconCache = new Map<string, string>()

/**
 * Renders a Lucide component once into a detached element to recover its raw
 * SVG children. Cached, because export can touch the same icon many times.
 */
function iconInnerMarkup(id: string): string {
  if (iconCache.has(id)) return iconCache.get(id)!
  const component = iconComponent(id)
  if (!component) {
    iconCache.set(id, '')
    return ''
  }
  const host = document.createElement('div')
  const app = createApp({ render: () => h(component, { size: 24 }) })
  app.mount(host)
  const markup = host.querySelector('svg')?.innerHTML ?? ''
  app.unmount()
  host.remove()
  iconCache.set(id, markup)
  return markup
}

const ICON_SIZE = 20

function iconGroup(id: string, x: number, y: number, color: string): string {
  const inner = iconInnerMarkup(id)
  if (!inner) return ''
  const scale = ICON_SIZE / 24
  return (
    `<g transform="translate(${x},${y}) scale(${scale})" fill="none" stroke="${color}" ` +
    `stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`
  )
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** Resolves parent-relative node positions into absolute canvas coordinates. */
export function absoluteBoxes(doc: DiagramDocument): Map<string, Box> {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]))
  const boxes = new Map<string, Box>()

  const resolve = (node: DiagramNode, seen = new Set<string>()): Box => {
    const cached = boxes.get(node.id)
    if (cached) return cached
    let origin = { x: 0, y: 0 }
    if (node.parent && !seen.has(node.id)) {
      seen.add(node.id)
      const parent = byId.get(node.parent)
      if (parent) origin = resolve(parent, seen)
    }
    const box: Box = {
      x: origin.x + node.position.x,
      y: origin.y + node.position.y,
      width: node.size.width,
      height: node.size.height,
    }
    boxes.set(node.id, box)
    return box
  }

  doc.nodes.forEach((node) => resolve(node))
  return boxes
}

export function contentBounds(doc: DiagramDocument, padding = EXPORT_PADDING): Box {
  const boxes = [...absoluteBoxes(doc).values()]
  if (!boxes.length) return { x: -200, y: -150, width: 400, height: 300 }
  const x1 = Math.min(...boxes.map((b) => b.x)) - padding
  const y1 = Math.min(...boxes.map((b) => b.y)) - padding
  const x2 = Math.max(...boxes.map((b) => b.x + b.width)) + padding
  const y2 = Math.max(...boxes.map((b) => b.y + b.height)) + padding
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

/* ------------------------------------------------------------------- text */

/** A stretch of text within one line; a caption mixes two of them. */
interface TextRun {
  text: string
  fill: string
  weight: number
}

interface TextLine {
  role: 'label' | 'caption' | 'sublabel'
  size: number
  runs: TextRun[]
}

/** Leading added to a line's font size, matching the canvas's `leading-tight`. */
const lineHeight = (line: TextLine) => line.size + 4

const blockHeight = (lines: TextLine[]) => lines.reduce((total, l) => total + lineHeight(l), 0)

/**
 * The three lines a node can carry: its name, the fixed type/technology caption,
 * and the free sublabel. Mirrors `ShapeNode.vue`, so an export says exactly what
 * the canvas says.
 */
function nodeTextLines(node: DiagramNode, paint: ReturnType<typeof nodePaint>): TextLine[] {
  const lines: TextLine[] = []
  if (node.label) {
    lines.push({ role: 'label', size: 13, runs: [{ text: node.label, fill: paint.ink, weight: 600 }] })
  }

  const caption = nodeCaption(node)
  if (caption) {
    const runs: TextRun[] = []
    if (caption.type) runs.push({ text: caption.type, fill: paint.muted, weight: 400 })
    if (caption.type && caption.tech) {
      runs.push({ text: ' · ', fill: paint.muted, weight: 400 })
    }
    if (caption.tech) runs.push({ text: caption.tech, fill: paint.accent, weight: 600 })
    // A size below the sublabel's: the caption is a caption, and one point
    // narrower is what fits "Database · PostgreSQL" in a default-width box.
    lines.push({ role: 'caption', size: 10, runs })
  }

  if (node.sublabel) {
    lines.push({
      role: 'sublabel',
      size: 11,
      runs: [{ text: node.sublabel, fill: paint.muted, weight: 400 }],
    })
  }
  return lines
}

/**
 * One line of text. A caption that fits keeps its two colours as `tspan`s; one
 * that has to be cut falls back to a single muted run, because an ellipsis
 * landing mid-`tspan` is not worth the arithmetic.
 */
function renderLine(line: TextLine, x: number, baseline: number, available: number, anchor: 'start' | 'middle'): string {
  const first = line.runs[0]
  if (!first) return ''

  const plain = line.runs.map((run) => run.text).join('')
  const fitted = fitText(plain, available, line.size, first.weight)
  const open =
    `<text x="${round2(x)}" y="${round2(baseline)}" font-size="${line.size}"` +
    (anchor === 'middle' ? ' text-anchor="middle"' : '')

  if (line.runs.length === 1 || fitted !== plain) {
    return `${open} font-weight="${first.weight}" fill="${first.fill}">${escapeXml(fitted)}</text>`
  }

  const body = line.runs
    .map(
      (run) =>
        `<tspan fill="${run.fill}" font-weight="${run.weight}">${escapeXml(run.text)}</tspan>`,
    )
    .join('')
  return `${open}>${body}</text>`
}

/** Stacks lines downward from `top`, the top edge of the block. */
function renderTextBlock(
  lines: TextLine[],
  x: number,
  top: number,
  available: number,
  anchor: 'start' | 'middle',
): string {
  let cursor = top
  return lines
    .map((line) => {
      // The baseline sits one font size below the top of its line box, which is
      // what puts a single 13px line on the box's centre line.
      const out = renderLine(line, x, cursor + line.size, available, anchor)
      cursor += lineHeight(line)
      return out
    })
    .join('')
}

const round2 = (n: number) => Math.round(n * 100) / 100

function renderZone(node: DiagramNode, box: Box, paint: ReturnType<typeof nodePaint>): string {
  const frame = roundedRect(box.x, box.y, box.width, box.height, 12)
  let out =
    `<path d="${frame}" fill="${paint.fill}" stroke="${paint.stroke}" ` +
    `stroke-width="1.5" stroke-dasharray="7 5"/>`

  const available = box.width - 26
  const label = fitText((node.label || '').toUpperCase(), available, 12, 700)
  out +=
    `<text x="${box.x + 13}" y="${box.y + 20}" font-size="12" font-weight="700" ` +
    `letter-spacing=".04em" fill="${paint.accent}">${escapeXml(label)}</text>`

  // The zone's own name is drawn above, so only the caption and sublabel stack.
  const lines = nodeTextLines(node, paint).filter((line) => line.role !== 'label')
  out += renderTextBlock(lines, box.x + 13, box.y + 26, available, 'start')
  return out
}

function renderShape(node: DiagramNode, box: Box, paint: ReturnType<typeof nodePaint>): string {
  const parts: string[] = []

  for (const element of shapeElements(node.shape, box.width, box.height)) {
    const attrs = Object.entries(element.attrs)
      .map(([key, value]) => {
        // Element geometry is node-local; shift it into canvas space.
        if (key === 'cx') return `cx="${Number(value) + box.x}"`
        if (key === 'cy') return `cy="${Number(value) + box.y}"`
        return `${key}="${value}"`
      })
      .join(' ')
    const transform =
      element.tag === 'path' ? ` transform="translate(${box.x},${box.y})"` : ''
    const fill = element.role === 'body' ? paint.fill : 'none'
    parts.push(
      `<${element.tag} ${attrs}${transform} fill="${fill}" stroke="${paint.stroke}" stroke-width="1.5"/>`,
    )
  }

  const hasIcon = !!node.icon && !!iconInnerMarkup(node.icon)
  const stacked = STACKED_SHAPES.has(node.shape) || !hasIcon
  const inset = contentInset(node.shape, box.height)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2 + inset.top / 2

  const lines = nodeTextLines(node, paint)
  const text = blockHeight(lines)

  if (stacked) {
    // Icon above the text, the pair centred together.
    const gap = hasIcon ? 6 : 0
    const iconBlock = hasIcon ? ICON_SIZE + gap : 0
    const top = cy - (iconBlock + text) / 2
    if (hasIcon) parts.push(iconGroup(node.icon!, cx - ICON_SIZE / 2, top, paint.accent))
    const available =
      node.shape === 'diamond' ? box.width * 0.62 : box.width - 24 - inset.right
    parts.push(renderTextBlock(lines, cx, top + iconBlock, available, 'middle'))
  } else {
    parts.push(iconGroup(node.icon!, box.x + 12, cy - ICON_SIZE / 2, paint.accent))
    const textX = box.x + 12 + ICON_SIZE + 12
    const available = box.x + box.width - inset.right - 12 - textX
    parts.push(renderTextBlock(lines, textX, cy - text / 2, available, 'start'))
  }

  return parts.join('')
}

export interface SvgOptions {
  /** Omits the background rectangle. */
  transparent?: boolean
  padding?: number
}

export function renderDocumentSvg(doc: DiagramDocument, options: SvgOptions = {}): string {
  const theme = diagramTheme(doc.canvas.theme)
  const bounds = contentBounds(doc, options.padding ?? EXPORT_PADDING)
  const boxes = absoluteBoxes(doc)

  const zones = doc.nodes
    .filter((n) => n.kind === 'zone')
    .map((n) => renderZone(n, boxes.get(n.id)!, nodePaint(n, theme)))
    .join('')

  const edges = doc.edges
    .map((edge) => {
      const source = boxes.get(edge.source)
      const target = boxes.get(edge.target)
      if (!source || !target) return ''

      const geometry = edgeGeometry(source, target, {
        sourceSide: edge.sourceSide,
        targetSide: edge.targetSide,
        route: edge.route,
      })
      const color = edgeColor(edge.color, theme)
      const dash = dashArray(edge.line)

      let out =
        `<path d="${geometry.path}" fill="none" stroke="${color}" stroke-width="1.7" ` +
        `stroke-linejoin="round"` +
        (dash ? ` stroke-dasharray="${dash}"` : '') +
        (edge.line === 'dotted' ? ' stroke-linecap="round"' : '') +
        `/>`

      if (edge.arrows !== 'none') {
        out += `<path d="${arrowHeadPath(geometry.end, geometry.endDir)}" fill="${color}"/>`
      }
      if (edge.arrows === 'both') {
        out += `<path d="${arrowHeadPath(geometry.start, geometry.startDir)}" fill="${color}"/>`
      }

      if (edge.label) {
        const width = measureText(edge.label, 11) + 13
        out +=
          `<rect x="${geometry.mid.x - width / 2}" y="${geometry.mid.y - 9}" width="${width}" ` +
          `height="18" rx="4" fill="${theme.bg}" stroke="${mix(color, theme.bg, 0.72)}" stroke-width="1"/>` +
          `<text x="${geometry.mid.x}" y="${geometry.mid.y + 4}" text-anchor="middle" ` +
          `font-size="11" fill="${theme.muted}">${escapeXml(edge.label)}</text>`
      }
      return out
    })
    .join('')

  const shapes = doc.nodes
    .filter((n) => n.kind !== 'zone')
    .map((n) => renderShape(n, boxes.get(n.id)!, nodePaint(n, theme)))
    .join('')

  const background = options.transparent
    ? ''
    : `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="${theme.bg}"/>`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(bounds.width)}" ` +
    `height="${Math.round(bounds.height)}" ` +
    `viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}">` +
    `<title>${escapeXml(doc.meta.title)}</title>` +
    `<style>text{font-family:${SANS}}</style>` +
    background +
    zones +
    edges +
    shapes +
    `</svg>`
  )
}
