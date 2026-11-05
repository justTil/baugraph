import { Plane, Vector3 } from 'three'
import type { Ray } from 'three'
import type { Position3D } from '@/model'
import type { Axis } from '@/features/diagram/lib/axes3d'
import { AXES } from '@/features/diagram/lib/axes3d'

/**
 * Moving things in the 3D view, the way a 3D editor does it: grab, constrain
 * to an axis or a plane with a key, type an exact distance, snap, confirm or
 * cancel. The renderer feeds pointer rays and keys in; this works out what
 * they mean. Kept apart from the scene, and from WebGL, so it can be tested.
 *
 * Axes are named the way the file names them: `x` and `y` are the canvas's own
 * axes and `z` is height — which in the world of the renderer, where `y` is up,
 * are `x`, `z` and `y`.
 */

export type { Axis } from '@/features/diagram/lib/axes3d'
export { AXES, AXIS_COLOR } from '@/features/diagram/lib/axes3d'

/** Each axis's direction in the renderer's world. */
export const AXIS_DIRECTION: Readonly<Record<Axis, Vector3>> = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 0, 1),
  z: new Vector3(0, 1, 0),
}

/** No movement at all. */
export const ZERO: Readonly<Position3D> = { x: 0, y: 0, z: 0 }

/**
 * Which axes a move may use. Empty is unconstrained — along the screen, in the
 * plane facing the camera; one axis is a line; two are a plane.
 */
export type Constraint = readonly Axis[]

/**
 * The constraint after an axis key: `X` locks the move to x, `⇧X` to the plane
 * of the other two, and the same key again lets go — the way a 3D editor's
 * axis keys toggle.
 */
export function constrain(current: Constraint, axis: Axis, exclude: boolean): Axis[] {
  const next = exclude ? AXES.filter((a) => a !== axis) : [axis]
  const same = next.length === current.length && next.every((a) => current.includes(a))
  return same ? [] : next
}

/** The key's axis, if it names one — by the character typed, so a QWERTZ `Z` is z. */
export function axisKey(key: string): Axis | null {
  const k = key.toLowerCase()
  return k === 'x' || k === 'y' || k === 'z' ? k : null
}

/**
 * Typing a distance during a move. Returns the text after `key`, or `null` for
 * a key that is not part of a number. Empty text means no number is being typed
 * and the pointer decides again.
 */
export function typeNumber(text: string, key: string): string | null {
  if (/^[0-9]$/.test(key)) return text === '-0' ? `-${key}` : text === '0' ? key : text + key
  if (key === '.' || key === ',') {
    if (text.includes('.')) return text
    return /\d$/.test(text) ? `${text}.` : `${text}0.`
  }
  // Flips the sign wherever the caret is, as a 3D editor's `-` does.
  if (key === '-') return text.startsWith('-') ? text.slice(1) : `-${text}`
  if (key === 'Backspace') return text.slice(0, -1)
  return null
}

/** The axis a typed distance goes along: the constraint's first, or x. */
export function numericAxis(constraint: Constraint): Axis {
  return constraint[0] ?? 'x'
}

/** The move a typed distance stands for. */
export function numericDelta(text: string, constraint: Constraint): Position3D {
  const value = Number.parseFloat(text)
  // `|| 0` folds the `-0` of a lone minus sign into a plain zero.
  const v = Number.isFinite(value) ? value || 0 : 0
  const axis = numericAxis(constraint)
  return { x: axis === 'x' ? v : 0, y: axis === 'y' ? v : 0, z: axis === 'z' ? v : 0 }
}

/** Rounds each component of a move to a multiple of `step`. */
export function snapDelta(delta: Position3D, step: number): Position3D {
  if (!(step > 0)) return { ...delta }
  const snap = (v: number) => Math.round(v / step) * step || 0
  return { x: snap(delta.x), y: snap(delta.y), z: snap(delta.z) }
}

/** A world-space vector as the file's axes. */
export const fromWorld = (v: Vector3): Position3D => ({ x: v.x, y: v.z, z: v.y })

/** The file's axes as a world-space vector. */
export const toWorld = (p: Position3D, out = new Vector3()): Vector3 => out.set(p.x, p.z, p.y)

/** Beyond this far from where it started, a grazing ray has stopped meaning anything. */
const FAR = 1e6

/**
 * Where a pointer ray meets the constraint laid through `pivot`: the closest
 * point on the axis for a line, the crossing for a plane, and for no
 * constraint the plane through `pivot` facing `facing` — the camera.
 *
 * `null` when the ray runs too close to parallel to say: an axis pointing
 * straight at the camera, a plane seen edge on. The caller keeps the last good
 * answer rather than flinging the selection off to infinity.
 */
export function constraintPoint(
  ray: Ray,
  pivot: Vector3,
  constraint: Constraint,
  facing: Vector3,
): Vector3 | null {
  if (constraint.length === 1) {
    const d = AXIS_DIRECTION[constraint[0]!]
    const r = ray.direction
    const w = pivot.clone().sub(ray.origin)
    const b = d.dot(r)
    const denom = 1 - b * b
    if (denom < 1e-4) return null
    // The point on `pivot + t·d` closest to the ray, both directions unit length.
    const t = (b * r.dot(w) - d.dot(w)) / denom
    if (Math.abs(t) > FAR) return null
    return pivot.clone().addScaledVector(d, t)
  }

  const normal =
    constraint.length === 2 ? AXIS_DIRECTION[AXES.find((a) => !constraint.includes(a))!] : facing
  if (Math.abs(ray.direction.dot(normal)) < 1e-3) return null
  const plane = new Plane().setFromNormalAndCoplanarPoint(normal, pivot)
  const hit = ray.intersectPlane(plane, new Vector3())
  if (!hit || hit.distanceTo(pivot) > FAR) return null
  return hit
}

/** What the header says while something is being moved. */
export interface TransformStatus {
  /** Grabbed with `G`, dragged on a selected node, or dragged by a gizmo handle. */
  kind: 'grab' | 'drag' | 'gizmo'
  /** How far, in the file's axes. */
  delta: Position3D
  constraint: Axis[]
  /** The distance being typed, if one is. */
  numeric: string | null
  snapping: boolean
  /** `⇧` is down: the pointer moves things a tenth as far. */
  precise: boolean
  /** How many nodes are being moved, not counting what comes along inside them. */
  count: number
}
