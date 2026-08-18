import type { ColorKey, ShapeKey } from '@/model'
import { DEFAULT_NODE_SIZE, DEFAULT_ZONE_SIZE } from '@/model'
import type { NodeType } from '@/features/diagram/data/node-types'
import { NODE_TYPE_GROUPS, nodeType } from '@/features/diagram/data/node-types'
import type { TechCategory, TechItem } from '@/features/diagram/data/tech'
import { TECH_CATEGORIES, techTerms } from '@/features/diagram/data/tech'

/**
 * The left-hand palette.
 *
 * Two kinds of group, both producing the same thing — a node:
 *   - `types` mirror the node-type catalogue: Database, Queue, API Gateway…
 *   - `tech` mirror the technology catalogue: PostgreSQL, IBM DB2, Apache
 *     Kafka… Dropping one lands a node of the matching type with that
 *     technology already selected, which is the fastest way to draw a stack
 *     that is already decided.
 */

/** A draggable entry in the palette. Also the payload of a palette drag. */
export interface PaletteItem {
  /** Node type id, written to the file as `type`. */
  type: string
  /** Technology id, written to the file as `tech`. Empty for a plain type. */
  tech?: string
  /** Label the new node starts with. */
  label: string
  /** Icon id from the Lucide registry. Drawn inside the node itself. */
  icon?: string
  /** Icon shown next to the palette entry only. Falls back to `icon`. */
  listIcon?: string
  color: ColorKey
  shape?: ShapeKey
  kind?: 'shape' | 'zone'
  width?: number
  height?: number
  /** Extra search terms — aliases, abbreviations, former product names. */
  keywords?: string[]
}

export interface PaletteGroup {
  id: string
  label: string
  /** Technology groups start collapsed; there are a lot of them. */
  kind: 'types' | 'tech'
  items: PaletteItem[]
}

function itemFromType(type: NodeType): PaletteItem {
  return {
    type: type.id,
    label: type.label,
    icon: type.icon,
    listIcon: type.listIcon,
    color: type.color,
    shape: type.shape,
    kind: type.kind,
    width: type.width,
    height: type.height,
    keywords: type.aliases,
  }
}

/**
 * A technology entry borrows its looks from the node type its category maps to,
 * so "Apache Kafka" arrives as an amber queue and "IBM DB2" as a green cylinder.
 */
function itemFromTech(tech: TechItem, category: TechCategory): PaletteItem {
  const type = nodeType(category.nodeType)
  return {
    type: category.nodeType,
    tech: tech.id,
    label: tech.label,
    icon: type?.icon,
    listIcon: type?.listIcon,
    color: type?.color ?? 'slate',
    shape: type?.shape,
    kind: type?.kind,
    width: type?.width,
    height: type?.height,
    keywords: techTerms(tech),
  }
}

export const PALETTE: PaletteGroup[] = [
  ...NODE_TYPE_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    kind: 'types' as const,
    items: group.types.map(itemFromType),
  })),
  ...TECH_CATEGORIES.map((category) => ({
    id: `tech:${category.id}`,
    label: category.label,
    kind: 'tech' as const,
    items: category.items.map((tech) => itemFromTech(tech, category)),
  })),
]

export function matchesPaletteItem(item: PaletteItem, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [item.label, item.type, item.tech ?? '', ...(item.keywords ?? [])].some((term) =>
    term.toLowerCase().includes(q),
  )
}

/** Groups filtered by the palette's search box, empty ones dropped. */
export function searchPalette(query: string): PaletteGroup[] {
  const q = query.trim().toLowerCase()
  if (!q) return PALETTE
  return PALETTE.map((group) => ({
    ...group,
    items: group.label.toLowerCase().includes(q)
      ? group.items
      : group.items.filter((item) => matchesPaletteItem(item, q)),
  })).filter((group) => group.items.length > 0)
}

export function paletteItemSize(item: PaletteItem) {
  const fallback = item.kind === 'zone' ? DEFAULT_ZONE_SIZE : DEFAULT_NODE_SIZE
  return {
    width: item.width ?? fallback.width,
    height: item.height ?? fallback.height,
  }
}

/** Node type used when repeating the last one (double-click on empty canvas). */
export const DEFAULT_PALETTE_ITEM: PaletteItem = itemFromType(nodeType('service')!)
