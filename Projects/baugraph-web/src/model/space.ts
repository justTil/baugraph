import type { Position3D, Vec2 } from '@/model/types'

/**
 * Where nodes stand in the 3D view.
 *
 * The 3D view starts out as the 2D canvas with a height axis added: a node
 * that has never been moved there stands exactly where the canvas has it. Move
 * it in 3D and it gets a place of its own, `position3d`, which the canvas never
 * reads — so the two layouts can part ways completely, and a diagram that is
 * never opened in 3D carries nothing of it.
 *
 * The one link that stays is the zone. A node not yet moved in 3D keeps its
 * place *within its zone*, so moving a zone in 3D takes everything inside it
 * along — the same as dragging it on the canvas, and the same as a parented
 * object in a 3D editor — without a line written for each node it holds.
 *
 * Takes the file's own fields so the editor, which holds Vue Flow nodes, and
 * the renderer, which holds the file's, can both ask without converting.
 */

/** What placing a node in 3D needs to know about it. */
export interface SpaceNode {
  id: string
  /** As in the file: relative to the parent zone, if there is one. */
  position: Vec2
  parent?: string | null
  position3d?: Position3D | null
}

/**
 * Every node's place in the 3D view: `x` and `y` absolute, in canvas units,
 * and `z` the height above the plane it stands on.
 *
 * A node placed in 3D stands where it was put. One that was not stands at its
 * canvas offset from wherever its zone stands in 3D, at its zone's height —
 * which, while nothing has been moved, is exactly its place on the canvas.
 */
export function spacePositions(nodes: readonly SpaceNode[]): Map<string, Position3D> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const out = new Map<string, Position3D>()

  const resolve = (node: SpaceNode, chain: Set<string>): Position3D => {
    const known = out.get(node.id)
    if (known) return known
    let at: Position3D
    if (node.position3d) {
      at = { x: node.position3d.x, y: node.position3d.y, z: node.position3d.z }
    } else {
      chain.add(node.id)
      const parent = node.parent ? byId.get(node.parent) : undefined
      // A parent cycle only exists in a file the schema rejects; it is cut here
      // so a half-edited document still draws rather than spinning.
      const origin = parent && !chain.has(parent.id) ? resolve(parent, chain) : null
      at = origin
        ? { x: origin.x + node.position.x, y: origin.y + node.position.y, z: origin.z }
        : { x: node.position.x, y: node.position.y, z: 0 }
    }
    out.set(node.id, at)
    return at
  }

  for (const node of nodes) resolve(node, new Set())
  return out
}

/** `ids` and everything nested inside them, at any depth. */
function withDescendants(nodes: readonly SpaceNode[], ids: Iterable<string>): Set<string> {
  const out = new Set(ids)
  let grew = true
  while (grew) {
    grew = false
    for (const node of nodes) {
      if (node.parent && out.has(node.parent) && !out.has(node.id)) {
        out.add(node.id)
        grew = true
      }
    }
  }
  return out
}

/** How many zones up a node's chain goes; zones are settled before what they hold. */
function depthOf(byId: Map<string, SpaceNode>, id: string): number {
  const seen = new Set([id])
  let up = byId.get(id)?.parent
  while (up && byId.has(up) && !seen.has(up)) {
    seen.add(up)
    up = byId.get(up)!.parent
  }
  return seen.size - 1
}

/**
 * The `position3d` values that move `ids` by `delta` in 3D.
 *
 * Everything inside a moved zone moves with it. Only what would not follow by
 * itself is written: a node that was never placed in 3D comes along with its
 * zone for free, so moving a zone is one line in the file, plus one for each
 * node inside it that had been placed on its own. A node and its zone both in
 * `ids` move once, not twice.
 *
 * Callers leave locked nodes out of `ids`; one inside a moved zone still comes
 * along, the way it does on the canvas.
 */
export function moveInSpace(
  nodes: readonly SpaceNode[],
  ids: Iterable<string>,
  delta: Position3D,
): Map<string, Position3D> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const at = spacePositions(nodes)
  const moving = withDescendants(
    nodes,
    [...ids].filter((id) => byId.has(id)),
  )
  const writes = new Map<string, Position3D>()
  if (!delta.x && !delta.y && !delta.z) return writes

  for (const id of [...moving].sort((a, b) => depthOf(byId, a) - depthOf(byId, b))) {
    const node = byId.get(id)!
    if (!node.position3d && node.parent && moving.has(node.parent)) continue
    const from = at.get(id)!
    writes.set(id, { x: from.x + delta.x, y: from.y + delta.y, z: from.z + delta.z })
  }
  return writes
}

/**
 * Sends nodes back to where the canvas has them: their `position3d` is
 * dropped, and what they hold comes back with them — a node inside that had
 * been placed on its own keeps its place relative to its zone, the same as
 * when the zone is moved.
 *
 * Returns the writes, `null` meaning "no 3D place of its own"; empty when
 * nothing in `ids` had been placed.
 */
export function resetInSpace(
  nodes: readonly SpaceNode[],
  ids: Iterable<string>,
): Map<string, Position3D | null> {
  const working = nodes.map((n) => ({ ...n }))
  const byId = new Map(working.map((n) => [n.id, n]))
  const targets = new Set([...ids].filter((id) => byId.get(id)?.position3d))
  const writes = new Map<string, Position3D | null>()

  for (const id of [...targets].sort((a, b) => depthOf(byId, a) - depthOf(byId, b))) {
    const before = spacePositions(working)
    byId.get(id)!.position3d = null
    writes.set(id, null)
    const after = spacePositions(working)
    const from = before.get(id)!
    const to = after.get(id)!
    const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z }
    for (const inner of withDescendants(working, [id])) {
      const node = byId.get(inner)!
      if (inner === id || targets.has(inner) || !node.position3d) continue
      const was = before.get(inner)!
      node.position3d = { x: was.x + d.x, y: was.y + d.y, z: was.z + d.z }
      writes.set(inner, node.position3d)
    }
  }
  return writes
}

/**
 * Gives `ids` a 3D place of their own, exactly where they stand now — for when
 * the zone they follow is about to go away (deleted, or ungrouped), so losing
 * it does not move them in 3D. Only nodes that are following something moved
 * in 3D are pinned: one still at its canvas place stays free to follow the
 * canvas.
 */
export function pinInSpace(nodes: readonly SpaceNode[], ids: Iterable<string>): Map<string, Position3D> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const at = spacePositions(nodes)
  const flat = spacePositions(nodes.map((n) => ({ ...n, position3d: null })))
  const writes = new Map<string, Position3D>()
  for (const id of ids) {
    if (!byId.has(id) || byId.get(id)!.position3d) continue
    const now = at.get(id)!
    const canvas = flat.get(id)!
    if (now.x !== canvas.x || now.y !== canvas.y || now.z !== canvas.z) writes.set(id, now)
  }
  return writes
}
