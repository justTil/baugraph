import { createApp, h } from 'vue'
import type { DiagramDocument, DiagramNode, MessageFlow } from '@/model'
import { iconComponent } from '@/features/diagram/data/icons'
import { CENTERED_SHAPES, contentInset, roundedRect, shapeElements } from '@/features/diagram/lib/shapes'
import type { EdgeGeometry } from '@/features/diagram/lib/edge-path'
import { arrowHeadPath, dashArray, edgeGeometry } from '@/features/diagram/lib/edge-path'
import type { FlowEdge, FlowPlan } from '@/features/diagram/lib/flow-graph'
import { edgeStyle, fadeOf, flowPlan, tokenAt } from '@/features/diagram/lib/flow-graph'
import { nodeCaption } from '@/features/diagram/lib/node-caption'
import {
  COLOR_HEX,
  diagramTheme,
  edgeColor,
  edgeStrokeWidth,
  mix,
  nodePaint,
} from '@/features/diagram/lib/theme'
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
/** The canvas's `gap-2.5` between an icon and the text beside it. */
const ICON_GAP = 10

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
 * How wide the text actually runs, so a centred block can be measured off
 * against the icon standing beside it rather than against the whole box.
 */
const blockWidth = (lines: TextLine[]) =>
  lines.reduce(
    (widest, line) =>
      Math.max(
        widest,
        line.runs.reduce((sum, run) => sum + measureText(run.text, line.size, run.weight), 0),
      ),
    0,
  )

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
  // Held half a stroke inside the box, exactly as `ZoneNode` draws it.
  const inset = paint.strokeWidth / 2
  const frame = roundedRect(
    box.x + inset,
    box.y + inset,
    Math.max(1, box.width - paint.strokeWidth),
    Math.max(1, box.height - paint.strokeWidth),
    12,
  )
  let out = paint.strokeWidth
    ? `<path d="${frame}" fill="${paint.fill}" stroke="${paint.stroke}" ` +
      `stroke-width="${paint.strokeWidth}" stroke-dasharray="7 5"/>`
    : `<path d="${frame}" fill="${paint.fill}"/>`

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

  // A weightless outline is left off entirely rather than written as `0`, so a
  // borderless node exports as the single filled path it looks like.
  const outline = paint.strokeWidth
    ? ` stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}" stroke-linejoin="round"`
    : ''

  for (const element of shapeElements(node.shape, box.width, box.height, paint.strokeWidth)) {
    // Trim — a cylinder's rim, a queue's ticks — is stroke only, so without one
    // there is nothing to draw.
    if (element.role === 'detail' && !outline) continue
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
    parts.push(`<${element.tag} ${attrs}${transform} fill="${fill}"${outline}/>`)
  }

  const hasIcon = !!node.icon && !!iconInnerMarkup(node.icon)
  const centered = CENTERED_SHAPES.has(node.shape) || !hasIcon
  const inset = contentInset(node.shape, box.height)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2 + inset.top / 2

  const lines = nodeTextLines(node, paint)
  const text = blockHeight(lines)
  const top = cy - text / 2
  const iconBlock = hasIcon ? ICON_SIZE + ICON_GAP : 0

  if (centered) {
    // Icon then text, the pair centred as one block: a tapering outline leaves
    // no room at the left edge for the content row every other shape uses.
    const room =
      (node.shape === 'diamond' ? box.width * 0.62 : box.width - 24 - inset.right) - iconBlock
    const available = Math.max(24, room)
    const width = Math.min(available, blockWidth(lines))
    const left = cx - (iconBlock + width) / 2
    if (hasIcon) parts.push(iconGroup(node.icon!, left, cy - ICON_SIZE / 2, paint.accent))
    parts.push(renderTextBlock(lines, left + iconBlock + width / 2, top, available, 'middle'))
  } else {
    parts.push(iconGroup(node.icon!, box.x + 12, cy - ICON_SIZE / 2, paint.accent))
    const textX = box.x + 12 + iconBlock
    const available = box.x + box.width - inset.right - 12 - textX
    parts.push(renderTextBlock(lines, textX, top, available, 'start'))
  }

  return parts.join('')
}

/* ------------------------------------------------------------------ flows */

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Length of one dash-and-gap of a moving line, in canvas units. */
const DASH_PATTERN = 22

/**
 * The measurements only a browser can make: how long a connection is drawn, and
 * whereabouts along it a given fraction of that falls.
 *
 * One hidden `<svg>` holding one `<path>` per connection, kept for as long as
 * the export runs. A GIF asks the same paths the same questions sixty times
 * over, and re-parsing a `d` attribute for every one of those is the difference
 * between an export that stutters and one that does not.
 */
export interface PathSampler {
  length(edge: string): number
  /** Where `progress` along a connection falls, and which way it is heading. */
  at(edge: string, progress: number): { x: number; y: number; angle: number } | null
  dispose(): void
}

function pathSampler(geometries: Map<string, EdgeGeometry>): PathSampler {
  const elements = new Map<string, SVGPathElement>()
  const lengths = new Map<string, number>()
  let host: SVGSVGElement | null = null

  if (typeof document !== 'undefined' && geometries.size) {
    host = document.createElementNS(SVG_NS, 'svg')
    host.setAttribute('width', '0')
    host.setAttribute('height', '0')
    host.setAttribute('style', 'position:absolute;visibility:hidden')
    for (const [id, geometry] of geometries) {
      const path = document.createElementNS(SVG_NS, 'path')
      path.setAttribute('d', geometry.path)
      host.append(path)
      elements.set(id, path)
    }
    document.body.append(host)
    for (const [id, path] of elements) {
      try {
        lengths.set(id, path.getTotalLength())
      } catch {
        lengths.set(id, 0)
      }
    }
  }

  return {
    length: (edge) => lengths.get(edge) ?? 0,

    at(edge, progress) {
      const path = elements.get(edge)
      const total = lengths.get(edge) ?? 0
      if (!path || !total) return null

      const distance = total * Math.min(1, Math.max(0, progress))
      // Sampled backwards once there is no road left ahead, so a message sitting
      // on the last point of a connection still knows which way it was heading.
      const step = distance + 1 <= total ? 1 : -1
      let point: DOMPoint
      let ahead: DOMPoint
      try {
        point = path.getPointAtLength(distance)
        ahead = path.getPointAtLength(distance + step)
      } catch {
        return null
      }

      // Turned to face the way it is going, but never past vertical — the same
      // rule the canvas follows, and for the same reason: none of the glyphs
      // carry their own direction, so an upside-down envelope reads as a bug.
      let angle =
        (Math.atan2(step * (ahead.y - point.y), step * (ahead.x - point.x)) * 180) / Math.PI
      if (angle > 90) angle -= 180
      else if (angle < -90) angle += 180
      return { x: point.x, y: point.y, angle }
    },

    dispose() {
      host?.remove()
      host = null
      elements.clear()
    },
  }
}

/** A flow and the traversal it works out to, once the lines have been measured. */
interface PlannedFlow {
  flow: MessageFlow
  plan: FlowPlan
}

function flowPlans(doc: DiagramDocument, lengthOf: (edge: string) => number): PlannedFlow[] {
  const byId = new Map<string, FlowEdge>(doc.edges.map((e) => [e.id, e]))
  return (doc.flows ?? [])
    .filter((flow) => flow.enabled)
    .map((flow) => ({ flow, plan: flowPlan(flow, byId, lengthOf) }))
    .filter(({ plan }) => plan.branches.length && plan.duration > 0)
}

/** A pulse never rides thinner than the connection it travels. */
function dashWidths(doc: DiagramDocument): Map<string, number> {
  return new Map(doc.edges.map((e) => [e.id, Math.max(2.4, edgeStrokeWidth(e.width))]))
}

/**
 * The longest a set of flows can run before every one of them is back where it
 * started — which is exactly how long an exported animation has to be to loop
 * without a visible seam.
 */
const MAX_LOOP = 12

function loopSeconds(plans: PlannedFlow[]): number {
  const cycles = plans.map(({ plan }) => plan.duration).filter((d) => d > 0)
  if (!cycles.length) return 0
  const longest = Math.max(...cycles)

  // A whole number of every flow's pass, if one of those is short enough to sit
  // through; otherwise the longest pass, which at least reads as complete.
  for (let k = 1; longest * k <= MAX_LOOP; k++) {
    const total = longest * k
    if (cycles.every((c) => Math.abs(total / c - Math.round(total / c)) < 0.02)) return total
  }
  return Math.min(longest, MAX_LOOP)
}

/**
 * SMIL wants a non-decreasing list running from exactly 0 to exactly 1, and
 * rejects the whole animation when it does not get one. Rounding a duration can
 * put two stops out of order by a millionth, so they are tidied here rather than
 * trusted.
 */
function keyTimes(times: number[]): string {
  let previous = 0
  const clean = times.map((t, i) => {
    if (i === 0) return 0
    if (i === times.length - 1) return 1
    previous = Math.min(1, Math.max(previous, t))
    return previous
  })
  return clean.map((t) => t.toFixed(5)).join(';')
}

/** The message glyphs, drawn about their own centre so they ride the path. */
function tokenMarkup(shape: string, color: string, bg: string): string {
  if (shape === 'packet') {
    return (
      `<rect x="-6.5" y="-4.5" width="13" height="9" rx="2.5" fill="${color}" ` +
      `stroke="${bg}" stroke-width="1.2"/>`
    )
  }
  if (shape === 'envelope') {
    return (
      `<rect x="-7.5" y="-5.5" width="15" height="11" rx="1.8" fill="${color}" ` +
      `stroke="${bg}" stroke-width="1.2"/>` +
      `<path d="M-7.5,-5.5 L0,0.6 L7.5,-5.5" fill="none" stroke="${bg}" stroke-width="1.3" ` +
      `stroke-linecap="round" stroke-linejoin="round"/>`
    )
  }
  return (
    `<circle r="7.5" fill="${color}" opacity="0.18"/>` +
    `<circle r="3.8" fill="${color}" stroke="${bg}" stroke-width="1.2"/>`
  )
}

/**
 * The flows, as SMIL.
 *
 * An exported SVG has no script and no stylesheet to lean on, so the animation
 * has to be declarative — which turns out to suit the model exactly. Every hop
 * of a journey runs at one speed, so distance along the route is proportional to
 * time along it, and a whole branch collapses into a single `animateMotion` over
 * the concatenated hop paths. The gap between one hop's end and the next one's
 * start is the node in between: the message crosses it the way it does on the
 * canvas, by going in one side and coming out the other.
 */
function renderFlows(
  plans: PlannedFlow[],
  geometries: Map<string, EdgeGeometry>,
  widths: Map<string, number>,
  bg: string,
): string {
  const parts: string[] = []

  for (const { flow, plan } of plans) {
    const cycle = plan.duration
    const repeat = flow.loop ? 'indefinite' : '1'
    const freeze = flow.loop ? '' : ' fill="freeze"'

    if (flow.motion !== 'token') {
      for (const id of plan.edges) {
        const geometry = geometries.get(id)
        if (!geometry) continue
        const look = edgeStyle(flow, id)
        parts.push(
          `<path d="${geometry.path}" fill="none" stroke="${COLOR_HEX[look.color]}" ` +
            `stroke-width="${widths.get(id) ?? 2.4}" stroke-linecap="round" stroke-dasharray="6 16">` +
            `<animate attributeName="stroke-dashoffset" values="0;-${DASH_PATTERN}" ` +
            `dur="${(DASH_PATTERN / Math.max(look.speed, 1)).toFixed(3)}s" repeatCount="indefinite"/>` +
            `</path>`,
        )
      }
    }

    if (flow.motion === 'dash') continue

    /*
     * One element per hop, exactly as the canvas draws it. A whole branch would
     * otherwise collapse into a single `animateMotion`, which is tidier but
     * cannot change colour or shape halfway — and the whole point of a
     * per-connection override is that it does.
     *
     * Each element holds still at the start of its hop until the message reaches
     * it, walks the hop, then holds at the end; the opacity animation is what
     * hands the message from one hop's element to the next, at the same instant,
     * so the swap cannot be seen.
     */
    for (const branch of plan.branches) {
      if (branch.journey <= 0) continue
      const fade = fadeOf(branch.journey)
      const opacityAt = (t: number) =>
        fade > 0 ? Math.max(0, Math.min(1, Math.min(t, branch.journey - t) / fade)) : 1

      for (const hop of branch.hops) {
        const geometry = geometries.get(hop.edge)
        if (!geometry || hop.duration <= 0) continue
        const look = edgeStyle(flow, hop.edge)
        const h0 = hop.start
        const h1 = hop.start + hop.duration

        for (let token = 0; token < plan.tokens; token++) {
          // Where this message sits on the clock. A burst runs its later
          // messages behind the first; a stream runs each one a spacing ahead.
          const shift = token * plan.offset
          const at = (t: number) => Math.min(1, Math.max(0, (t - shift) / cycle))
          const u0 = at(h0)
          const u1 = at(h1)
          // This message never reaches this hop inside one cycle.
          if (u1 <= u0) continue

          const time = (u: number) => u * cycle + shift
          const progress = (u: number) =>
            Math.min(1, Math.max(0, (time(u) - h0) / (h1 - h0)))
          const p0 = progress(u0).toFixed(5)
          const p1 = progress(u1).toFixed(5)

          const ua = Math.min(u1, Math.max(u0, at(fade)))
          const ub = Math.min(u1, Math.max(u0, at(branch.journey - fade)))

          const motion =
            `<animateMotion dur="${cycle.toFixed(3)}s" repeatCount="${repeat}"${freeze} ` +
            `calcMode="linear" keyPoints="${p0};${p0};${p1};${p1}" ` +
            `keyTimes="${keyTimes([0, u0, u1, 1])}" path="${geometry.path}"/>`

          const values = [
            0,
            0,
            opacityAt(time(u0)),
            opacityAt(time(ua)),
            opacityAt(time(ub)),
            opacityAt(time(u1)),
            0,
            0,
          ]
          const opacity =
            `<animate attributeName="opacity" dur="${cycle.toFixed(3)}s" ` +
            `repeatCount="${repeat}"${freeze} calcMode="linear" ` +
            `values="${values.map((v) => v.toFixed(3)).join(';')}" ` +
            `keyTimes="${keyTimes([0, u0, u0, ua, ub, u1, u1, 1])}"/>`

          parts.push(
            `<g opacity="0">${tokenMarkup(look.token, COLOR_HEX[look.color], bg)}` +
              `${motion}${opacity}</g>`,
          )
        }
      }
    }
  }

  return parts.join('')
}

/**
 * The flows as they stand at `time` seconds in — one still frame of the same
 * animation.
 *
 * SMIL is a description of movement, and a raster format wants a photograph of
 * it, so this places every message itself. It asks the plan the very question
 * the canvas asks sixty times a second — `tokenAt` — which is what stops a GIF
 * and the editor disagreeing about where a message had got to.
 */
function renderFlowsAt(
  plans: PlannedFlow[],
  geometries: Map<string, EdgeGeometry>,
  widths: Map<string, number>,
  sampler: PathSampler,
  bg: string,
  time: number,
): string {
  const parts: string[] = []

  for (const { flow, plan } of plans) {
    if (flow.motion !== 'token') {
      for (const id of plan.edges) {
        const geometry = geometries.get(id)
        if (!geometry) continue
        const look = edgeStyle(flow, id)
        // Decreasing the offset walks the pattern forwards along the path, one
        // whole pattern per cycle — the same motion the canvas's CSS gives it.
        const offset = -((time * Math.max(look.speed, 1)) % DASH_PATTERN)
        parts.push(
          `<path d="${geometry.path}" fill="none" stroke="${COLOR_HEX[look.color]}" ` +
            `stroke-width="${widths.get(id) ?? 2.4}" stroke-linecap="round" ` +
            `stroke-dasharray="6 16" stroke-dashoffset="${round2(offset)}"/>`,
        )
      }
    }

    if (flow.motion === 'dash') continue

    // A flow that repeats is somewhere in its pass; one that does not has run
    // its course by the end of it, and `tokenAt` says so by returning nothing.
    const clock = flow.loop ? ((time % plan.duration) + plan.duration) % plan.duration : time

    for (const branch of plan.branches) {
      for (let token = 0; token < plan.tokens; token++) {
        const position = tokenAt(branch, clock + token * plan.offset)
        if (!position) continue
        const point = sampler.at(position.edge, position.progress)
        if (!point) continue
        const look = edgeStyle(flow, position.edge)
        parts.push(
          `<g transform="translate(${round2(point.x)},${round2(point.y)}) ` +
            `rotate(${point.angle.toFixed(1)})" opacity="${position.opacity.toFixed(3)}">` +
            `${tokenMarkup(look.token, COLOR_HEX[look.color], bg)}</g>`,
        )
      }
    }
  }

  return parts.join('')
}

/* ----------------------------------------------------------------- render */

export interface SvgOptions {
  /** Omits the background rectangle. */
  transparent?: boolean
  padding?: number
  /**
   * Writes the message flows as SMIL. On by default, and turned off for the
   * raster export — a PNG is one frame, and a frame of an animation is not a
   * picture of the diagram.
   */
  animate?: boolean
  /**
   * Draws the flows frozen at this many seconds in, instead of as SMIL. This is
   * what a GIF is made of, and what a still preview of a moving diagram shows.
   */
  time?: number
}

/**
 * One document, ready to be drawn over and over at different moments.
 *
 * Everything that does not move — the boxes, the lines, the labels, the routing
 * — is worked out once and kept as a string, and so is the hidden `<svg>` the
 * messages are placed against. A frame is then the two halves of that with the
 * flows of one instant between them, which is what makes exporting sixty frames
 * cost roughly what exporting one does.
 *
 * Callers must `dispose()`, or the sampler's scratch element stays in the page.
 */
export interface DocumentFrames {
  bounds: Box
  /** Seconds one full pass of every flow takes; `0` when nothing moves. */
  duration: number
  /** The document at `time` seconds, or as a self-animating SVG without one. */
  frame(time?: number): string
  dispose(): void
}

export function documentFrames(doc: DiagramDocument, options: SvgOptions = {}): DocumentFrames {
  const theme = diagramTheme(doc.canvas.theme)
  const bounds = contentBounds(doc, options.padding ?? EXPORT_PADDING)
  const boxes = absoluteBoxes(doc)

  const zones = doc.nodes
    .filter((n) => n.kind === 'zone')
    .map((n) => renderZone(n, boxes.get(n.id)!, nodePaint(n, theme)))
    .join('')

  // Routed once and kept: the connections are drawn from these, and so are the
  // messages that travel them, which is what stops the two disagreeing.
  const geometries = new Map<string, EdgeGeometry>()
  // Connections route around the nodes, so the same obstacle set the canvas
  // works from is handed over here — an export that re-drew a line straight
  // through a box would not match what was on screen. Zones are excluded: they
  // are containers the connections legitimately run in and out of.
  const solids = doc.nodes.filter((n) => n.kind !== 'zone')
  for (const edge of doc.edges) {
    const source = boxes.get(edge.source)
    const target = boxes.get(edge.target)
    if (!source || !target) continue
    const obstacles = solids
      .filter((n) => n.id !== edge.source && n.id !== edge.target)
      .map((n) => boxes.get(n.id)!)
    geometries.set(
      edge.id,
      edgeGeometry(source, target, {
        sourceSide: edge.sourceSide,
        targetSide: edge.targetSide,
        route: edge.route,
        obstacles,
      }),
    )
  }

  const edges = doc.edges
    .map((edge) => {
      const geometry = geometries.get(edge.id)
      if (!geometry) return ''
      const color = edgeColor(edge.color, theme)
      const stroke = edgeStrokeWidth(edge.width)
      const dash = dashArray(edge.line, stroke)

      let out =
        `<path d="${geometry.path}" fill="none" stroke="${color}" stroke-width="${stroke}" ` +
        `stroke-linejoin="round"` +
        (dash ? ` stroke-dasharray="${dash}"` : '') +
        (edge.line === 'dotted' ? ' stroke-linecap="round"' : '') +
        `/>`

      if (edge.arrows !== 'none') {
        out += `<path d="${arrowHeadPath(geometry.end, geometry.endDir, stroke)}" fill="${color}"/>`
      }
      if (edge.arrows === 'both') {
        out += `<path d="${arrowHeadPath(geometry.start, geometry.startDir, stroke)}" fill="${color}"/>`
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

  const sampler = pathSampler(geometries)
  // Planned even when the flows are not being drawn: `duration` is a fact about
  // the diagram, and a caller asking for a still frame still wants to be told
  // there is something here that moves.
  const plans = flowPlans(doc, sampler.length)
  const widths = dashWidths(doc)

  const open =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(bounds.width)}" ` +
    `height="${Math.round(bounds.height)}" ` +
    `viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}">` +
    `<title>${escapeXml(doc.meta.title)}</title>` +
    `<style>text{font-family:${SANS}}</style>`

  return {
    bounds,
    duration: loopSeconds(plans),

    frame(time = options.time) {
      // Between the connections and the nodes, exactly as on the canvas: a
      // message rides over the line it travels and slips behind the node it
      // arrives at.
      const flows =
        options.animate === false || !plans.length
          ? ''
          : time === undefined
            ? renderFlows(plans, geometries, widths, theme.bg)
            : renderFlowsAt(plans, geometries, widths, sampler, theme.bg, time)

      return open + background + zones + edges + flows + shapes + `</svg>`
    },

    dispose: sampler.dispose,
  }
}

export function renderDocumentSvg(doc: DiagramDocument, options: SvgOptions = {}): string {
  const frames = documentFrames(doc, options)
  try {
    return frames.frame(options.time)
  } finally {
    frames.dispose()
  }
}
