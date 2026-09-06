import type { BorderWidth, ColorKey, DiagramNode, LineWidth } from '@/model'
import { COLOR_KEYS } from '@/model'

/**
 * Diagram colours are resolved to concrete hex values rather than CSS variables:
 * the same function feeds both the on-screen canvas and the standalone SVG/PNG
 * export, and an exported file cannot depend on the app's stylesheet.
 */

export const COLOR_HEX: Record<ColorKey, string> = {
  slate: '#5b6470',
  blue: '#2f6fdb',
  teal: '#0f9aa8',
  green: '#1f9d63',
  amber: '#d08a12',
  red: '#d6453f',
  purple: '#7a52d1',
  pink: '#c94f8f',
}

export const COLOR_SWATCHES = COLOR_KEYS.map((key) => ({ key, hex: COLOR_HEX[key] }))

export interface DiagramTheme {
  dark: boolean
  bg: string
  surface: string
  ink: string
  muted: string
  line: string
  grid: string
  edge: string
  selection: string
  /** Says a gesture has found its mark: the connection point a drag would land on. */
  connect: string
  /**
   * Manual edge routing's own colour — bend points, and anything that drags
   * one into existence. Deliberately not `selection`: that blue already means
   * "reconnecting this end to a different node," and a bend point is neither
   * end.
   */
  waypoint: string
}

export function diagramTheme(mode: 'light' | 'dark'): DiagramTheme {
  const dark = mode === 'dark'
  return {
    dark,
    bg: dark ? '#0f1113' : '#ffffff',
    surface: dark ? '#181b1f' : '#ffffff',
    ink: dark ? '#e8eaed' : '#141414',
    muted: dark ? '#949aa2' : '#767676',
    line: dark ? '#2c3138' : '#dcdcdc',
    grid: dark ? '#39414c' : '#c4c9d0',
    edge: dark ? '#8b939d' : '#6a7280',
    selection: dark ? '#5b9dff' : '#2f6fdb',
    // Lifted on a dark canvas: the palette's green is chosen to sit on white and
    // goes muddy against near-black, where this has to read at a glance.
    connect: dark ? '#3fd18a' : '#12995d',
    // Same purple as the `purple` node/edge colour, lightened for dark the
    // same way `selection` is — legible on near-black without turning garish.
    waypoint: dark ? '#a488ea' : '#7a52d1',
  }
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ]
}

function rgbToHex(rgb: number[]): string {
  return `#${rgb
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('')}`
}

/** Linear blend; `t = 0` returns `a`, `t = 1` returns `b`. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return rgbToHex([
    ar * (1 - t) + br * t,
    ag * (1 - t) + bg * t,
    ab * (1 - t) + bb * t,
  ])
}

/**
 * What each outline weight is worth in canvas units. `regular` is the 1.5 every
 * node was drawn with before the setting existed, so an untouched diagram looks
 * exactly as it did.
 */
export const BORDER_PX: Record<BorderWidth, number> = {
  none: 0,
  regular: 1.5,
  medium: 2.5,
  thick: 4,
}

export interface NodePaint {
  accent: string
  fill: string
  stroke: string
  /** Outline weight in canvas units; `0` means the node is drawn fill-only. */
  strokeWidth: number
  ink: string
  muted: string
}

/** Derives a node's fill/stroke from its semantic colour and the active theme. */
export function nodePaint(
  node: Pick<DiagramNode, 'color' | 'kind'> & { border?: BorderWidth },
  theme: DiagramTheme,
): NodePaint {
  const accent = COLOR_HEX[node.color] ?? COLOR_HEX.slate
  const strokeWidth = BORDER_PX[node.border ?? 'regular'] ?? BORDER_PX.regular

  if (node.kind === 'zone') {
    return {
      accent,
      fill: mix(accent, theme.bg, theme.dark ? 0.93 : 0.965),
      stroke: mix(accent, theme.bg, 0.45),
      strokeWidth,
      ink: theme.ink,
      muted: theme.muted,
    }
  }

  return {
    accent,
    fill: mix(accent, theme.surface, theme.dark ? 0.9 : 0.955),
    stroke: mix(accent, theme.surface, theme.dark ? 0.62 : 0.55),
    strokeWidth,
    ink: theme.ink,
    muted: theme.muted,
  }
}

/**
 * What each line weight is worth in canvas units. `regular` is the 1.7 every
 * connection was drawn with before the setting existed.
 */
export const EDGE_PX: Record<LineWidth, number> = {
  regular: 1.7,
  medium: 2.8,
  thick: 4.2,
}

/**
 * Selection adds a constant rather than a factor: the point is that the line has
 * been picked, and a heavy line does not need to double to say so.
 */
const SELECTED_EXTRA = 0.7

/** Resolves a connection's line weight, thickened while it is selected. */
export function edgeStrokeWidth(width: LineWidth | undefined, selected = false): number {
  return (EDGE_PX[width ?? 'regular'] ?? EDGE_PX.regular) + (selected ? SELECTED_EXTRA : 0)
}

/** Resolves an edge's colour, falling back to the theme's neutral. */
export function edgeColor(color: ColorKey | null | undefined, theme: DiagramTheme): string {
  return color ? (COLOR_HEX[color] ?? theme.edge) : theme.edge
}
