import type { ColorKey, DiagramNode } from '@/model'
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
    grid: dark ? '#242930' : '#e4e4e4',
    edge: dark ? '#8b939d' : '#6a7280',
    selection: dark ? '#5b9dff' : '#2f6fdb',
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
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  return rgbToHex([0, 1, 2].map((i) => A[i] * (1 - t) + B[i] * t))
}

export interface NodePaint {
  accent: string
  fill: string
  stroke: string
  ink: string
  muted: string
}

/** Derives a node's fill/stroke from its semantic colour and the active theme. */
export function nodePaint(
  node: Pick<DiagramNode, 'color' | 'kind'>,
  theme: DiagramTheme,
): NodePaint {
  const accent = COLOR_HEX[node.color] ?? COLOR_HEX.slate

  if (node.kind === 'zone') {
    return {
      accent,
      fill: mix(accent, theme.bg, theme.dark ? 0.93 : 0.965),
      stroke: mix(accent, theme.bg, 0.45),
      ink: theme.ink,
      muted: theme.muted,
    }
  }

  return {
    accent,
    fill: mix(accent, theme.surface, theme.dark ? 0.9 : 0.955),
    stroke: mix(accent, theme.surface, theme.dark ? 0.62 : 0.55),
    ink: theme.ink,
    muted: theme.muted,
  }
}

/** Resolves an edge's colour, falling back to the theme's neutral. */
export function edgeColor(color: ColorKey | null | undefined, theme: DiagramTheme): string {
  return color ? (COLOR_HEX[color] ?? theme.edge) : theme.edge
}
