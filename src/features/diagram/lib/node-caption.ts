import { nodeTypeLabel } from '@/features/diagram/data/node-types'
import { techLabel } from '@/features/diagram/data/tech'

/**
 * The caption every node carries under its name: what it is, and what it runs on.
 *
 * It is derived, never stored — the file keeps the ids (`database`,
 * `postgresql`) and this turns them into "Database · PostgreSQL". Because it is
 * derived from the type rather than from the name, renaming a node cannot lose
 * it: a cylinder called "Orders" still says `Database` on the canvas and in
 * every export.
 *
 * A part the label already spells out is dropped, so a freshly dropped
 * "PostgreSQL" node reads `PostgreSQL / Database` rather than repeating itself.
 * The invariant holds either way: what the node is, is always on the node.
 */
export interface NodeCaption {
  /** Node type, e.g. `Database`. */
  type: string
  /** Technology, e.g. `PostgreSQL`. */
  tech: string
}

export interface CaptionSource {
  label?: string
  type?: string | null
  tech?: string | null
}

export function nodeCaption(node: CaptionSource): NodeCaption | null {
  const name = (node.label ?? '').trim().toLowerCase()
  const spellsOut = (text: string) => !!text && text.trim().toLowerCase() === name

  const type = nodeTypeLabel(node.type)
  const tech = techLabel(node.tech)
  const caption = {
    type: spellsOut(type) ? '' : type,
    tech: spellsOut(tech) ? '' : tech,
  }
  return caption.type || caption.tech ? caption : null
}

/** The caption as a single string, for tooltips and the SVG export's fallbacks. */
export function captionText(caption: NodeCaption | null): string {
  if (!caption) return ''
  return [caption.type, caption.tech].filter(Boolean).join(' · ')
}
