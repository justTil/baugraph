import type { DiagramNode } from '@/model'

/**
 * The layers panel's tree: every node on the canvas, nested the way zones nest.
 *
 * Kept apart from the panel so the parts that decide something — what is
 * listed where, what a search keeps, where a drop may land — can be tested
 * without a canvas.
 */

/** What the tree needs to know about a node. */
export interface LayerItem {
  id: string
  kind: DiagramNode['kind']
  /** What the row is called — the label, or a stand-in for a node without one. */
  name: string
  /** Enclosing zone. A parent that does not exist puts the node at the top. */
  parent: string | null
  /** Further text a search may match: type, technology, id. */
  terms?: string[]
}

export interface LayerRow<T extends LayerItem = LayerItem> {
  item: T
  /** How many zones deep the row sits. */
  depth: number
  /** Nodes directly inside it; only ever above zero for a zone. */
  childCount: number
  /** Whether its contents are listed below it. */
  expanded: boolean
  /**
   * Whether the row is listed for its own sake. False only while searching, for
   * a zone shown because something inside it matched.
   */
  match: boolean
}

/**
 * Zones first, so a level reads as its groups and then what stands loose
 * beside them; annotations last, since they sit on top of the architecture
 * rather than in it.
 *
 * Paint order is no help here: the file sorts nodes by id on every save (see
 * `model/sort.ts`), so any order this list let the user set would be gone the
 * next time the diagram was opened.
 */
const KIND_ORDER: Record<DiagramNode['kind'], number> = { zone: 0, shape: 1, annotation: 2 }

const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function compareItems(a: LayerItem, b: LayerItem): number {
  return (
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    byName.compare(a.name, b.name) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )
}

/**
 * Each node's parent, as the tree will use it: a parent that is missing, or
 * that the node turns out to be inside of itself, puts it at the top level
 * instead, so a broken file is still listed in full and never loops.
 */
export function layerParents(items: readonly LayerItem[]): Map<string, string | null> {
  const byId = new Map(items.map((item) => [item.id, item]))
  const parents = new Map<string, string | null>()
  for (const item of items) {
    let parent = item.parent && byId.has(item.parent) ? item.parent : null
    const seen = new Set([item.id])
    for (let up = parent; up; up = byId.get(up)?.parent ?? null) {
      if (seen.has(up)) {
        parent = null
        break
      }
      seen.add(up)
      if (!byId.has(up)) break
    }
    parents.set(item.id, parent)
  }
  return parents
}

/**
 * The rows to draw, top to bottom.
 *
 * A collapsed zone hides its contents. A search lists only what matched, along
 * with the zones each match sits in, opened so the match can be seen whatever
 * was collapsed before.
 */
export function layerRows<T extends LayerItem>(
  items: readonly T[],
  { collapsed = new Set<string>(), query = '' }: { collapsed?: ReadonlySet<string>; query?: string } = {},
): LayerRow<T>[] {
  const parents = layerParents(items)
  const children = new Map<string | null, T[]>()
  for (const item of items) {
    const parent = parents.get(item.id) ?? null
    const list = children.get(parent) ?? []
    list.push(item)
    children.set(parent, list)
  }
  for (const list of children.values()) list.sort(compareItems)

  const needle = query.trim().toLowerCase()
  const matches = new Set<string>()
  /** Matches, and every zone a match sits in. */
  const shown = new Set<string>()
  if (needle) {
    for (const item of items) {
      const haystack = [item.name, ...(item.terms ?? [])].join(' ').toLowerCase()
      if (!haystack.includes(needle)) continue
      matches.add(item.id)
      for (let id: string | null = item.id; id && !shown.has(id); id = parents.get(id) ?? null) {
        shown.add(id)
      }
    }
  }

  const rows: LayerRow<T>[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const item of children.get(parent) ?? []) {
      if (needle && !shown.has(item.id)) continue
      const childCount = children.get(item.id)?.length ?? 0
      const expanded = childCount > 0 && (needle ? true : !collapsed.has(item.id))
      rows.push({ item, depth, childCount, expanded, match: !needle || matches.has(item.id) })
      if (expanded) walk(item.id, depth + 1)
    }
  }
  walk(null, 0)
  return rows
}

/**
 * Where a set of dragged nodes may be dropped: into `target` (a zone's id, or
 * `null` for the top level), unless that is one of them or inside one of them,
 * or every one of them is already there.
 */
export function canMoveInto(
  items: readonly LayerItem[],
  ids: readonly string[],
  target: string | null,
): boolean {
  if (!ids.length) return false
  const parents = layerParents(items)
  if (target !== null) {
    const zone = items.find((item) => item.id === target)
    if (!zone || zone.kind !== 'zone') return false
    const dragged = new Set(ids)
    for (let id: string | null = target; id; id = parents.get(id) ?? null) {
      if (dragged.has(id)) return false
    }
  }
  return ids.some((id) => (parents.get(id) ?? null) !== target)
}
