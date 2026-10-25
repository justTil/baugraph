import type { DiagramTheme } from '@/features/diagram/lib/theme'
import { escapeXml, measureText } from '@/features/diagram/lib/text'

/**
 * The dressing an exported diagram can be handed to before it leaves: a
 * desktop-style window around it and a gradient behind that.
 *
 * A bare diagram on a white rectangle is the honest picture of the file, and it
 * is the wrong picture for a slide, a README hero or a post — there the thing
 * wants to read as a screenshot of an application, sitting on something. That is
 * all this is: a title bar with the buttons in the place the operating system
 * puts them, a rounded body, a shadow, and a backdrop behind it.
 *
 * It is drawn as SVG rather than borrowed from one of the CSS "beautifier"
 * components, because the same markup has to survive being saved as a `.svg`
 * and being rasterised into PNG and GIF frames, where no stylesheet follows it.
 */

export type ChromeId = 'none' | 'macos' | 'windows'
export type BackdropId = 'none' | 'macos' | 'windows' | 'aurora' | 'slate' | 'mint'

interface Stop {
  /** 0 → 1 along the gradient. */
  at: number
  color: string
}

interface Backdrop {
  id: BackdropId
  label: string
  /** Gradient direction as a unit-square vector; 0,0 is the top-left corner. */
  angle: [number, number, number, number]
  stops: Stop[]
  /** A soft off-centre highlight, which is what keeps a flat ramp from looking flat. */
  bloom?: { cx: number; cy: number; r: number; color: string; opacity: number }
}

const BACKDROPS: Backdrop[] = [
  {
    id: 'none',
    label: 'None',
    angle: [0, 0, 0, 1],
    stops: [],
  },
  {
    id: 'macos',
    label: 'macOS',
    angle: [0, 0, 1, 1],
    stops: [
      { at: 0, color: '#1c2b6e' },
      { at: 0.45, color: '#6b3bb0' },
      { at: 1, color: '#c4468d' },
    ],
    bloom: { cx: 0.22, cy: 0.12, r: 0.75, color: '#ffffff', opacity: 0.22 },
  },
  {
    id: 'windows',
    label: 'Windows',
    angle: [0, 0, 0.85, 1],
    stops: [
      { at: 0, color: '#06152f' },
      { at: 0.55, color: '#11458f' },
      { at: 1, color: '#2f8ad6' },
    ],
    bloom: { cx: 0.75, cy: 0.85, r: 0.8, color: '#4cc7f5', opacity: 0.3 },
  },
  {
    id: 'aurora',
    label: 'Aurora',
    angle: [0, 0, 1, 1],
    stops: [
      { at: 0, color: '#ffd7b0' },
      { at: 0.5, color: '#f6a1c2' },
      { at: 1, color: '#9d8ce8' },
    ],
    bloom: { cx: 0.8, cy: 0.15, r: 0.7, color: '#ffffff', opacity: 0.35 },
  },
  {
    id: 'slate',
    label: 'Slate',
    angle: [0, 0, 0.6, 1],
    stops: [
      { at: 0, color: '#e9edf3' },
      { at: 1, color: '#b9c2d0' },
    ],
    bloom: { cx: 0.3, cy: 0.1, r: 0.8, color: '#ffffff', opacity: 0.5 },
  },
  {
    id: 'mint',
    label: 'Mint',
    angle: [0, 0, 1, 0.9],
    stops: [
      { at: 0, color: '#0f7a6c' },
      { at: 0.6, color: '#2bb39a' },
      { at: 1, color: '#8fe3c4' },
    ],
    bloom: { cx: 0.18, cy: 0.85, r: 0.75, color: '#ffffff', opacity: 0.2 },
  },
]

const backdrop = (id: BackdropId) => BACKDROPS.find((b) => b.id === id) ?? BACKDROPS[0]!

/** The presets, with a CSS gradient each so a swatch can show what it is. */
export const BACKDROP_OPTIONS = BACKDROPS.map((b) => ({
  value: b.id,
  label: b.label,
  css: b.stops.length
    ? `linear-gradient(${Math.round((Math.atan2(b.angle[2] - b.angle[0], b.angle[1] - b.angle[3]) * 180) / Math.PI)}deg, ` +
      b.stops.map((s) => `${s.color} ${Math.round(s.at * 100)}%`).join(', ') +
      ')'
    : '',
}))

export const CHROME_OPTIONS: { value: ChromeId; label: string; title: string }[] = [
  { value: 'none', label: 'None', title: 'The diagram on its own' },
  { value: 'macos', label: 'macOS', title: 'A Mac window, buttons on the left' },
  { value: 'windows', label: 'Windows', title: 'A Windows window, buttons on the right' },
]

export interface FrameOptions {
  chrome?: ChromeId
  backdrop?: BackdropId
  /** The title in the bar; the document's own, unless something else is wanted. */
  title?: string
}

/** Whether these options ask for anything at all to be drawn. */
export function framed(options: FrameOptions | undefined): options is FrameOptions {
  return !!options && ((options.chrome ?? 'none') !== 'none' || (options.backdrop ?? 'none') !== 'none')
}

/** Height of the title bar, which is the one measurement the layout hangs off. */
function titleBarHeight(chrome: ChromeId): number {
  if (chrome === 'macos') return 38
  if (chrome === 'windows') return 34
  return 0
}

export interface FrameLayout {
  /** The whole picture, backdrop included. */
  width: number
  height: number
  /** Where the diagram's own top-left corner lands within it. */
  x: number
  y: number
  bar: number
  radius: number
  margin: number
}

/**
 * Where everything sits, for a diagram of this size.
 *
 * The margin grows with the picture rather than staying at some fixed number of
 * pixels: a border that reads generously around a small diagram is a hairline
 * around a wall-sized one.
 */
export function frameLayout(
  content: { width: number; height: number },
  options: FrameOptions,
): FrameLayout {
  const chrome = options.chrome ?? 'none'
  const bar = titleBarHeight(chrome)
  const radius = chrome === 'windows' ? 8 : chrome === 'macos' ? 12 : 10
  const margin =
    (options.backdrop ?? 'none') === 'none'
      ? Math.round(Math.min(48, Math.max(16, Math.min(content.width, content.height) * 0.04)))
      : Math.round(Math.min(160, Math.max(48, Math.min(content.width, content.height) * 0.09)))

  return {
    width: content.width + margin * 2,
    height: content.height + bar + margin * 2,
    x: margin,
    y: margin + bar,
    bar,
    radius,
    margin,
  }
}

/** The traffic lights, or the Windows caption buttons, in their own corner. */
function chromeButtons(chrome: ChromeId, layout: FrameLayout, width: number, ink: string): string {
  const top = layout.margin
  const mid = top + layout.bar / 2

  if (chrome === 'macos') {
    return ['#ff5f57', '#febc2e', '#28c840']
      .map(
        (fill, i) =>
          `<circle cx="${layout.margin + 20 + i * 20}" cy="${mid}" r="6" fill="${fill}"/>`,
      )
      .join('')
  }

  // Windows draws minimise, maximise and close as glyphs at the far end.
  const right = layout.margin + width
  const gap = 26
  const stroke = `stroke="${ink}" stroke-width="1.2" fill="none" stroke-linecap="round"`
  const close = right - 20
  const max = close - gap
  const min = max - gap
  return (
    `<path d="M${min - 5} ${mid} h10" ${stroke}/>` +
    `<rect x="${max - 5}" y="${mid - 5}" width="10" height="10" rx="1.5" ${stroke}/>` +
    `<path d="M${close - 5} ${mid - 5} l10 10 M${close + 5} ${mid - 5} l-10 10" ${stroke}/>`
  )
}

/**
 * The frame, as two halves of markup with the diagram in between.
 *
 * Everything is clipped to the window's rounded rectangle, the diagram
 * included — which is what rounds off the bottom corners of a body the diagram
 * itself drew square.
 */
export function frameParts(
  content: { width: number; height: number },
  layout: FrameLayout,
  options: FrameOptions,
  theme: DiagramTheme,
  /** Distinguishes this render's gradient and clip ids from any other on the page. */
  key: string,
) {
  const chrome = options.chrome ?? 'none'
  const paint = backdrop(options.backdrop ?? 'none')
  const { width, height, margin, bar, radius } = layout

  const clipId = `bg-clip-${key}`
  const gradientId = `bg-grad-${key}`
  const bloomId = `bg-bloom-${key}`
  const shadowId = `bg-shadow-${key}`

  const barFill = theme.dark ? '#22262c' : '#f2f3f5'
  const hairline = theme.dark ? '#33383f' : '#dfe1e5'

  const defs: string[] = [
    `<clipPath id="${clipId}"><rect x="${margin}" y="${margin}" width="${width - margin * 2}" ` +
      `height="${height - margin * 2}" rx="${radius}"/></clipPath>`,
    `<filter id="${shadowId}" x="-30%" y="-30%" width="160%" height="160%">` +
      `<feDropShadow dx="0" dy="${Math.round(margin * 0.22)}" ` +
      `stdDeviation="${Math.round(margin * 0.3)}" flood-color="#000000" flood-opacity="0.35"/></filter>`,
  ]

  if (paint.stops.length) {
    const [x1, y1, x2, y2] = paint.angle
    defs.push(
      `<linearGradient id="${gradientId}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
        paint.stops
          .map((s) => `<stop offset="${s.at}" stop-color="${s.color}"/>`)
          .join('') +
        `</linearGradient>`,
    )
    if (paint.bloom) {
      defs.push(
        `<radialGradient id="${bloomId}" cx="${paint.bloom.cx}" cy="${paint.bloom.cy}" ` +
          `r="${paint.bloom.r}">` +
          `<stop offset="0" stop-color="${paint.bloom.color}" stop-opacity="${paint.bloom.opacity}"/>` +
          `<stop offset="1" stop-color="${paint.bloom.color}" stop-opacity="0"/></radialGradient>`,
      )
    }
  }

  const behind: string[] = [`<defs>${defs.join('')}</defs>`]

  if (paint.stops.length) {
    behind.push(`<rect width="${width}" height="${height}" fill="url(#${gradientId})"/>`)
    if (paint.bloom) {
      behind.push(`<rect width="${width}" height="${height}" fill="url(#${bloomId})"/>`)
    }
  }

  // The shadow is cast by a solid stand-in for the window, so the filter has one
  // simple shape to blur rather than every node inside it.
  behind.push(
    `<rect x="${margin}" y="${margin}" width="${width - margin * 2}" ` +
      `height="${height - margin * 2}" rx="${radius}" fill="${theme.bg}" ` +
      `filter="url(#${shadowId})"/>`,
  )

  behind.push(`<g clip-path="url(#${clipId})">`)

  if (bar) {
    behind.push(
      `<rect x="${margin}" y="${margin}" width="${width - margin * 2}" height="${bar}" fill="${barFill}"/>`,
      `<path d="M${margin} ${margin + bar - 0.5} h${width - margin * 2}" stroke="${hairline}" stroke-width="1"/>`,
      chromeButtons(chrome, layout, width - margin * 2, theme.muted),
    )

    const title = options.title?.trim()
    if (title) {
      // Centred on a Mac, tucked in beside the buttons on Windows — and dropped
      // altogether when the bar is too narrow for it to sit clear of them.
      const inner = width - margin * 2
      const room = chrome === 'macos' ? inner - 200 : inner - 190
      if (measureText(title, 12) < room) {
        const [x, anchor] =
          chrome === 'macos'
            ? [margin + inner / 2, 'middle']
            : [margin + 16, 'start']
        behind.push(
          `<text x="${x}" y="${margin + bar / 2 + 4}" text-anchor="${anchor}" ` +
            `font-size="12" font-weight="500" fill="${theme.muted}">${escapeXml(title)}</text>`,
        )
      }
    }
  }

  return {
    /** Backdrop, window shell and title bar; opens the clipped group. */
    behind: behind.join(''),
    /** Closes it, and draws the window's own edge over the top. */
    ahead:
      `</g><rect x="${margin + 0.5}" y="${margin + 0.5}" width="${width - margin * 2 - 1}" ` +
      `height="${height - margin * 2 - 1}" rx="${radius}" fill="none" stroke="${hairline}" ` +
      `stroke-width="1"/>`,
  }
}
