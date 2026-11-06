import {
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  SphereGeometry,
  Vector3,
} from 'three'
import type { Shape } from 'three'
import type { SolidKind } from '@/features/diagram/lib/scene3d'
import { QUEUE_TICKS } from '@/features/diagram/lib/shapes'

/**
 * The solids standing nodes are made of in the 3D view: the thing each 2D
 * shape is a drawing of, rather than the drawing cut out and made thick. A
 * database is a drum, a queue a tube with its slots as bands round it, a pill
 * a capsule, a circle a ball; a box, a rounded box, a hexagon and a diamond are
 * their outlines made deep — a rounded box with its edges rounded too.
 *
 * Everything is built standing in the node's own frame: `x` across it from `0`
 * to its width, `y` up it from `0` to its height, and `z` from its back at `0`
 * to its front at `depth`. The renderer stands that frame up, or lays it on its
 * back, as a whole.
 */

export interface Solid {
  /**
   * The body. Its groups say which colour each part takes, by index into what
   * the renderer passes: `0` its face colour, `1` its sides, `2` a drum's top.
   */
  body: BufferGeometry
  /** Trim drawn in the node's outline colour — a queue's bands. */
  trim: BufferGeometry[]
  /**
   * Where the node's icon, name and caption go: across its front, following
   * its curve, just proud of the surface. Its `uv`s cover the face as the 2D
   * node lays it out, so the 2D face's content lands where it belongs.
   */
  label: BufferGeometry
}

/** How far a label stands off the surface it is laid on, so the two never fight. */
const PROUD = 0.6

/**
 * A surface over `u`, `v` ∈ [0, 1], with `uv` = (`u`, `v`): the label laid over
 * a curved front. `u` runs left to right and `v` bottom to top, so the faces
 * look out of the front.
 */
function surface(segU: number, segV: number, at: (u: number, v: number, out: Vector3) => void): BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const p = new Vector3()
  for (let j = 0; j <= segV; j++) {
    for (let i = 0; i <= segU; i++) {
      const u = i / segU
      const v = j / segV
      at(u, v, p)
      positions.push(p.x, p.y, p.z)
      uvs.push(u, v)
    }
  }
  const row = segU + 1
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * row + i
      indices.push(a, a + 1, a + row, a + 1, a + row + 1, a + row)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setIndex(indices)
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.computeVertexNormals()
  return geometry
}

/**
 * A label printed onto a curved front the way a decal is: the face laid out flat
 * as the 2D node lays it out, then pressed straight back onto the surface — so
 * from the front it is the 2D face exactly, its icon and its text upright and
 * undistorted, as they are on a box. `front` says how far out of the middle the
 * front is at each point of the face, `null` off the solid's silhouette — where
 * the face has nothing to show, and the label tucks in behind the front.
 */
function decal(
  w: number,
  h: number,
  depth: number,
  segU: number,
  segV: number,
  front: (x: number, y: number) => number | null,
): BufferGeometry {
  return surface(segU, segV, (u, v, out) => {
    const x = u * w
    const y = v * h
    const z = front(x, y)
    out.set(x, y, depth / 2 + (z === null ? 0 : z + PROUD))
  })
}

/** A flat label across the front of a prism. */
function frontLabel(w: number, h: number, depth: number): BufferGeometry {
  return surface(1, 1, (u, v, out) => out.set(u * w, v * h, depth + PROUD))
}

/**
 * A prism: the node's outline, deep. A rounded box gets rounded edges front and
 * back as well, so it reads as soft from any side; the bevel stays inside the
 * outline, so the solid is exactly as wide and tall as the node.
 */
function prism(shapes: Shape[], w: number, h: number, depth: number, rounded: boolean): Solid {
  const bevel = rounded ? Math.min(8, depth * 0.2, h * 0.15) : 0
  const body = new ExtrudeGeometry(shapes, {
    depth: Math.max(0.5, depth - bevel * 2),
    curveSegments: 12,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 4,
  })
  // Shape space is the canvas, `y` down; mirrored so the node's top is up.
  body.scale(1, -1, 1)
  body.translate(0, h, bevel)
  // Extrusion groups: 0 the front and back, 1 the sides — face colour and side colour.
  return { body, trim: [], label: frontLabel(w, h, depth) }
}

/**
 * A drum: a cylinder standing on end, a database the way everyone draws one.
 * The label wraps round its front, as a label on a can does.
 */
function drum(w: number, h: number, depth: number): Solid {
  const rx = w / 2
  const rz = depth / 2
  const body = new CylinderGeometry(1, 1, h, 64, 1)
  body.scale(rx, 1, rz)
  body.translate(w / 2, h / 2, depth / 2)
  // Cylinder groups: 0 its side, 1 its top, 2 its bottom.
  body.groups.forEach((group) => {
    group.materialIndex = group.materialIndex === 1 ? 2 : group.materialIndex === 2 ? 1 : 0
  })
  // As much of the way round as the face is wide — about a third of the drum.
  const spread = Math.min(1.2, w / 2 / rx)
  const label = surface(32, 1, (u, v, out) => {
    const a = (u - 0.5) * 2 * spread
    out.set(w / 2 + (rx + PROUD) * Math.sin(a), v * h, depth / 2 + (rz + PROUD) * Math.cos(a))
  })
  return { body, trim: [], label }
}

/** Turns a geometry built along `y` so it lies along `x`, centred on the node. */
function lieAlongX(geometry: BufferGeometry, w: number, h: number, depth: number, ry: number, rz: number) {
  geometry.rotateZ(-Math.PI / 2)
  geometry.scale(1, ry, rz)
  geometry.translate(w / 2, h / 2, depth / 2)
}

/**
 * A tube on its side, the way a queue's messages line up in it, with its
 * slots — the ticks at the end of the 2D shape — as bands round it.
 */
function tube(w: number, h: number, depth: number): Solid {
  const r = h / 2
  const rz = depth / 2
  const body = new CylinderGeometry(1, 1, w, 48, 1)
  lieAlongX(body, w, h, depth, r, rz)
  // Cylinder groups: 0 its side, 1 and 2 its ends — the ends in the side colour.
  body.groups.forEach((group) => (group.materialIndex = group.materialIndex === 0 ? 0 : 1))

  const trim = QUEUE_TICKS.filter((dx) => dx < w / 2).map((dx) => {
    const band = new CylinderGeometry(1, 1, 3, 48, 1, true)
    const grow = 1 + 1.2 / Math.max(1, r)
    lieAlongX(band, w, h, depth, r * grow, rz * grow)
    band.translate(w / 2 - dx, 0, 0)
    return band
  })

  const label = decal(w, h, depth, 1, 32, (_, y) => {
    const q = ((y - h / 2) / r) ** 2
    return rz * Math.sqrt(Math.max(0, 1 - q))
  })
  return { body, trim, label }
}

/** A capsule on its side: a pill, made round. */
function capsule(w: number, h: number, depth: number): Solid {
  const r = h / 2
  const rz = depth / 2
  const straight = Math.max(0, w - h)
  const body = new CapsuleGeometry(r, straight, 12, 48, 1)
  lieAlongX(body, w, h, depth, 1, rz / r)

  // How round it is across at `x`: all of it along the straight, less into the ends.
  const radiusAt = (x: number) => {
    const into = x < r ? r - x : x > w - r ? x - (w - r) : 0
    return Math.sqrt(Math.max(0, r * r - into * into))
  }
  const label = decal(w, h, depth, 48, 32, (x, y) => {
    const radius = radiusAt(x)
    const dy = y - h / 2
    if (Math.abs(dy) > radius) return null
    return (rz / r) * Math.sqrt(radius * radius - dy * dy)
  })
  return { body, trim: [], label }
}

/** A ball — a circle, made round. */
function ball(w: number, h: number, depth: number): Solid {
  const rx = w / 2
  const ry = h / 2
  const rz = depth / 2
  const body = new SphereGeometry(1, 48, 32)
  body.scale(rx, ry, rz)
  body.translate(rx, ry, rz)
  const label = decal(w, h, depth, 32, 32, (x, y) => {
    const q = ((x - rx) / rx) ** 2 + ((y - ry) / ry) ** 2
    return q < 1 ? rz * Math.sqrt(1 - q) : null
  })
  return { body, trim: [], label }
}

/**
 * The solid for a standing node. `outline` is the node's 2D outline, which a
 * prism is made of; `rounded` asks a prism for rounded edges.
 */
export function buildSolid(
  kind: SolidKind,
  outline: Shape[],
  w: number,
  h: number,
  depth: number,
  rounded: boolean,
): Solid {
  switch (kind) {
    case 'drum':
      return drum(w, h, depth)
    case 'tube':
      return tube(w, h, depth)
    case 'capsule':
      return capsule(w, h, depth)
    case 'ball':
      return ball(w, h, depth)
    default:
      return prism(outline, w, h, depth, rounded)
  }
}
