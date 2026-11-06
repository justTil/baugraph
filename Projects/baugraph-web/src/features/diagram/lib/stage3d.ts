import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  Matrix4,
  LineSegments,
  MOUSE,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  RingGeometry,
  Scene,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Spherical,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import type { Material } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import gsap from 'gsap'
import type { DiagramDocument, DiagramNode, FlowToken, MessageFlow, Position3D } from '@/model'
import { moveInSpace } from '@/model'
import type { CameraPreset } from '@/features/diagram/composables/useView3D'
import type { FlowEdge, FlowPlan } from '@/features/diagram/lib/flow-graph'
import { edgeStyle, flowPlan, tokenAt } from '@/features/diagram/lib/flow-graph'
import { dashArray } from '@/features/diagram/lib/edge-path'
import { svgImage } from '@/features/diagram/lib/export'
import { nodeFaceSvg } from '@/features/diagram/lib/render-svg'
import { roundedRect, shapeElements } from '@/features/diagram/lib/shapes'
import { SANS } from '@/features/diagram/lib/text'
import type { DiagramTheme } from '@/features/diagram/lib/theme'
import { COLOR_HEX, EDGE_PX, edgeColor, edgeStrokeWidth, mix, nodePaint } from '@/features/diagram/lib/theme'
import type { EndHeight, StackEdge, StackLayout, StackNode, Track, Vec3 } from '@/features/diagram/lib/scene3d'
import {
  ZONE_FLOOR,
  cablePoints,
  isSolid,
  liftRoute,
  pointOnTrack,
  stackEdge,
  stackLayout,
  stackNodes,
  track,
} from '@/features/diagram/lib/scene3d'
import type { Axis, Constraint, TransformStatus } from '@/features/diagram/lib/transform3d'
import {
  AXES,
  AXIS_COLOR,
  AXIS_DIRECTION,
  ZERO,
  axisKey,
  constrain,
  constraintPoint,
  fromWorld,
  numericDelta,
  snapDelta,
  typeNumber,
} from '@/features/diagram/lib/transform3d'

/**
 * The 3D view's renderer.
 *
 * Imperative three.js rather than a declarative wrapper, for the same reason the
 * 2D flow runtime writes straight to the DOM: messages are placed sixty times a
 * second, and a reactive layer has nothing to add to that. Vue owns the state —
 * which planes are hidden, which flow is in the spotlight — and hands it over
 * through the setters below; the scene is rebuilt from the document whenever the
 * document changes, which for anything short of a huge diagram costs less than
 * a frame.
 *
 * Everything drawn comes from code the rest of the editor already trusts: node
 * faces are the SVG exporter's own rendering of the node, connections follow the
 * canvas's own routes, and messages run on the same timing the 2D canvas and the
 * animated SVG export use.
 *
 * Nodes are moved here the way a 3D editor moves objects — `G` to grab, an
 * axis key to constrain, a typed distance, a gizmo to drag by — but the stage
 * never writes the document itself. It previews the move on the scene it
 * already has, and only on confirming hands the move to Vue, which writes it
 * as an undo step; the rebuild that follows lands on exactly what was shown.
 */

export interface StageEvents {
  /** A node was clicked — `null` for empty space. */
  select(id: string | null, additive: boolean): void
  /** The pointer moved onto a node, or off every node. */
  hover(id: string | null, at: { x: number; y: number } | null): void
  /** A move was confirmed: `ids` by `delta`, in the file's axes (see `transform3d.ts`). */
  move(ids: string[], delta: Position3D): void
  /** A move started, changed, or ended (`null`) — what the header shows. */
  transform(status: TransformStatus | null): void
  /** The camera turned: where each axis points on screen, for the axis navigator. */
  orient(axes: Record<Axis, AxisOnScreen>): void
}

/** An axis as seen from the camera: `x` right and `y` down on screen, `z` towards the viewer. */
export interface AxisOnScreen {
  x: number
  y: number
  z: number
}

export interface StageMotion {
  /** The toolbar's "pause flows". */
  paused: boolean
  /** A reduced-motion preference: messages are parked, the camera cuts instead of flying. */
  reduced: boolean
}

/** Room around the content when the camera frames it, as a fraction of its size. */
const FRAME_MARGIN = 1.08
const FOV = 38
/** Where a thing is light comes from, for the flat shading on the blocks. */
const LIGHT = new Vector3(0.35, 1, 0.6).normalize()
/** Canvas-units per second at which a moving dash marches — matched to the 2D canvas. */
const DASH_PATTERN = 22
/** Seconds between the ghosts trailing a message. */
const TRAIL_STEP = 0.045
const TRAIL_LENGTH = 4
/** Opacity of everything a spotlight is not pointed at. */
const DIMMED = 0.12
/**
 * Smallest a message is ever drawn on screen, in pixels. Its size on the
 * diagram is a node's worth of detail, which from across the whole stack is a
 * speck — and a message nobody can follow is not showing where it goes.
 */
const MIN_TOKEN_PX = 11
/** A message's own size, in canvas units. */
const TOKEN_SIZE = 10.4
/** Strength of the glow around a connection between planes. */
const HALO = { light: 0.16, dark: 0.22 }

const PRESETS: Record<CameraPreset, { polar: number; azimuth: number }> = {
  iso: { polar: (56 * Math.PI) / 180, azimuth: (-32 * Math.PI) / 180 },
  // Not quite zero: straight down has no "up", and the canvas's own up is wanted.
  top: { polar: 0.0001, azimuth: 0 },
  side: { polar: (84 * Math.PI) / 180, azimuth: 0 },
}

/** Never below the ground plane: the stack is read from above or from the side. */
const MAX_POLAR = Math.PI * 0.495

/**
 * Nodes stand up as the camera tilts away from straight above, and lie back
 * down as it comes over the top — from above, the stack reads as the 2D
 * diagram, which is what the view from above is for. Polar angles, in radians.
 */
const LIE_DOWN_BELOW = (14 * Math.PI) / 180
const STAND_UP_ABOVE = (34 * Math.PI) / 180

/** How long the ripple lasts where a message lands, in seconds. */
const LANDING_S = 0.6
/** How far into a hop counts as having arrived. */
const ARRIVED = 0.985

/** How long the gizmo's arrows are on screen, in pixels, however far away it is. */
const GIZMO_PX = 92
/** How far the pointer travels before a press on a selected node becomes a move. */
const DRAG_SLOP = 5
/** Pointer travel counts this much while `⇧` is held: the fine adjustment. */
const PRECISION = 0.1

/** One handle of the move gizmo: an arrow, a plane square, or the ring in the middle. */
interface Handle {
  constraint: Axis[]
  hit: Mesh
  parts: MeshBasicMaterial[]
  color: Color
}

/** A move in progress. */
interface Transform {
  kind: TransformStatus['kind']
  /** The nodes being moved; what sits inside them comes along. */
  ids: string[]
  /** Where the move is measured from, in world space. */
  pivot: Vector3
  /** The constraint plane for an unconstrained move faces the camera as it was when the move began. */
  facing: Vector3
  /** Client coordinates the move started at… */
  start: Vector2
  /** …and where the pointer counts as being now, slowed down while `⇧` is held. */
  at: Vector2
  /** The pointer's last real position, which `at` is advanced from. */
  last: Vector2
  constraint: Axis[]
  /** A distance being typed; empty while the pointer decides. */
  numeric: string
  delta: Position3D
  precise: boolean
  /** `Ctrl` is held, which turns the canvas's snapping the other way for this move. */
  invertSnap: boolean
}
interface NodeEntry {
  stack: StackNode
  group: Group
  /** Pickable meshes. */
  pick: Mesh[]
  materials: { material: Material; opacity: number }[]
  outline: LineBasicMaterial | null
  outlineColor: Color
  /** The node's footprint outline, for the selection ring. */
  ring: Vector2[]
  /** Height of its base above its plane: the zone floors under it, and its own elevation. */
  base: number
  /** Height of its top above its base, as it stands — or lies — right now. */
  rise: number
  /**
   * Everything a node is but its post, built standing up in its own frame —
   * `x` across, `y` up its face, `z` out of the front — and turned onto its back
   * as it lies down. `null` for a zone, which is a floor.
   */
  body: Group | null
  /** What lifts a *Tall* or *Tower* node off the floor. */
  post: Mesh | null
  selection: Line2 | null
}

interface EdgeEntry {
  stack: StackEdge
  /** Plane group for an in-plane connection, the world for a cable. */
  parent: Object3D
  line: Line2
  material: LineMaterial
  color: string
  width: number
  halo: Line2 | null
  arrows: Mesh[]
  label: Sprite | null
  /** In its parent's space; an in-plane track is lifted by its plane's height when sampled. */
  track: Track
  /** Flow overlays: a moving dash per flow that asks for one. */
  dashes: { flow: string; line: Line2; material: LineMaterial; speed: number }[]
  /** Set while a spotlight or a flow-editor hover is pointed at this connection. */
  accent: string | null
}

/** What a message is drawn as: its mesh, and every material on it, faded together. */
interface TokenHead {
  look: FlowToken
  mesh: Mesh
  materials: MeshBasicMaterial[]
}

interface TokenEntry {
  branch: number
  index: number
  /** The head it travels as now; a hop styled differently swaps it for another. */
  head: TokenHead
  /** Heads built for this message so far, one per look it has travelled as. */
  heads: Map<FlowToken, TokenHead>
  /** The colour it wears now; a hop styled differently repaints it. */
  color: string
  glow: Sprite
  trail: Sprite[]
  /** The hop it was last seen on and how far along, so its landing is caught once. */
  hop: string | null
  progress: number
}

interface RunEntry {
  flow: MessageFlow
  plan: FlowPlan
  tokens: TokenEntry[]
  /** Seconds into the current pass. */
  time: number
}

/* ------------------------------------------------------------------ textures */

/**
 * Node faces cost an SVG rasterisation each, so they are kept across rebuilds —
 * renaming one node redraws one face, not every face in the diagram.
 */
class FaceTextures {
  private cache = new Map<string, { texture: Promise<Texture | null>; used: number }>()
  private generation = 0

  constructor(private anisotropy: number) {}

  /** Starts a new build; anything not asked for during it is released afterwards. */
  begin() {
    this.generation++
  }

  get(node: DiagramNode, theme: DiagramTheme): Promise<Texture | null> {
    const key = JSON.stringify([
      theme.dark,
      node.kind,
      node.shape,
      node.color,
      node.border,
      node.icon,
      node.label,
      node.sublabel,
      node.type,
      node.tech,
      node.align,
      node.size.width,
      node.size.height,
    ])
    const hit = this.cache.get(key)
    if (hit) {
      hit.used = this.generation
      return hit.texture
    }
    const texture = this.draw(node, theme)
    this.cache.set(key, { texture, used: this.generation })
    return texture
  }

  /** Releases every face no node of the latest build asked for. */
  sweep() {
    for (const [key, entry] of this.cache) {
      if (entry.used === this.generation) continue
      void entry.texture.then((t) => t?.dispose())
      this.cache.delete(key)
    }
  }

  dispose() {
    for (const entry of this.cache.values()) void entry.texture.then((t) => t?.dispose())
    this.cache.clear()
  }

  private async draw(node: DiagramNode, theme: DiagramTheme): Promise<Texture | null> {
    const { width, height } = node.size
    // Sharp enough to read close up, capped so a huge zone stays a sane texture.
    const scale = Math.min(3, 2048 / Math.max(width, height))
    try {
      const image = await svgImage(nodeFaceSvg(node, theme))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
      const texture = new CanvasTexture(canvas)
      texture.colorSpace = SRGBColorSpace
      // Faces are read at an angle, which is exactly what mipmapping blurs.
      texture.anisotropy = this.anisotropy
      return texture
    } catch {
      // The block still draws in its own colour; it just goes without its text.
      return null
    }
  }
}

/** A line of text to paint into a sprite. */
interface TextRun {
  text: string
  size: number
  weight: number
  color: string
  letterSpacing?: number
}

/**
 * Text that always faces the camera — plane names and connection labels, which
 * have to be readable from wherever the stack is being looked at.
 */
function textSprite(
  runs: TextRun[],
  { background, border, pad = 6 }: { background?: string; border?: string; pad?: number } = {},
): Sprite {
  const scale = 3
  const measure = document.createElement('canvas').getContext('2d')!
  const widths = runs.map((run) => {
    measure.font = `${run.weight} ${run.size}px ${SANS}`
    return measure.measureText(run.text).width + (run.letterSpacing ?? 0) * run.text.length
  })
  const width = Math.ceil(Math.max(...widths) + pad * 2)
  const height = Math.ceil(runs.reduce((sum, run) => sum + run.size * 1.3, 0) + pad * 2 - 4)

  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  if (background) {
    ctx.fillStyle = background
    ctx.strokeStyle = border ?? background
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(0.5, 0.5, width - 1, height - 1, 4)
    ctx.fill()
    ctx.stroke()
  }
  let y = pad - 2
  runs.forEach((run) => {
    ctx.font = `${run.weight} ${run.size}px ${SANS}`
    ctx.fillStyle = run.color
    ctx.textBaseline = 'top'
    if ('letterSpacing' in ctx && run.letterSpacing) {
      ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
        `${run.letterSpacing}px`
    }
    ctx.fillText(run.text, pad, y + run.size * 0.12)
    if ('letterSpacing' in ctx) {
      ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px'
    }
    y += run.size * 1.3
  })

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
  sprite.scale.set(width, height, 1)
  return sprite
}

/** A soft round glow, drawn once per colour and shared by every message wearing it. */
function glowTexture(color: string): Texture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, color)
  gradient.addColorStop(0.35, `${color}aa`)
  gradient.addColorStop(1, `${color}00`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

/**
 * A face of a message, drawn the way the 2D glyph is — its colour, edged and
 * lined in the background's — so a packet or an envelope in 3D is the same
 * thing the canvas sends, from any side.
 *
 *   - `packet`: a parcel, taped down the middle.
 *   - `envelope`: the front, its flap folded down to the middle.
 *   - `envelope-back`: the back, where all four folds meet.
 */
function tokenFace(kind: 'packet' | 'envelope' | 'envelope-back', color: string, line: string): Texture {
  const width = 128
  const height = kind === 'packet' ? 128 : 94
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const pad = 5
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.fillStyle = color
  ctx.strokeStyle = line
  ctx.beginPath()
  ctx.roundRect(pad, pad, width - pad * 2, height - pad * 2, kind === 'packet' ? 16 : 10)
  ctx.fill()

  if (kind === 'packet') {
    // Tape over the seam, a shade lighter than the parcel it holds shut.
    ctx.fillStyle = mix(color, '#ffffff', 0.42)
    ctx.fillRect(width * 0.41, pad, width * 0.18, height - pad * 2)
    ctx.strokeStyle = mix(color, line, 0.55)
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(width * 0.41, pad)
    ctx.lineTo(width * 0.41, height - pad)
    ctx.moveTo(width * 0.59, pad)
    ctx.lineTo(width * 0.59, height - pad)
    ctx.stroke()
  } else {
    ctx.lineWidth = 7
    ctx.strokeStyle = line
    const meet = { x: width / 2, y: height * 0.56 }
    ctx.beginPath()
    ctx.moveTo(pad + 2, pad + 2)
    ctx.lineTo(meet.x, meet.y)
    ctx.lineTo(width - pad - 2, pad + 2)
    if (kind === 'envelope-back') {
      ctx.moveTo(pad + 2, height - pad - 2)
      ctx.lineTo(meet.x - width * 0.12, meet.y + 2)
      ctx.moveTo(width - pad - 2, height - pad - 2)
      ctx.lineTo(meet.x + width * 0.12, meet.y + 2)
    }
    ctx.stroke()
  }

  ctx.lineWidth = 7
  ctx.strokeStyle = line
  ctx.beginPath()
  ctx.roundRect(pad, pad, width - pad * 2, height - pad * 2, kind === 'packet' ? 16 : 10)
  ctx.stroke()

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/* ----------------------------------------------------------------- geometry */

const outlineCache = new Map<string, Shape[]>()

/**
 * A node's silhouette as three.js shapes, from the same outline the canvas
 * draws — so a database is a drum, a decision a diamond, a topic a pill, in 3D
 * exactly as on the canvas.
 */
function silhouette(node: DiagramNode): Shape[] {
  const { width: w, height: h } = node.size
  const key = `${node.kind}|${node.shape}|${w}|${h}`
  const hit = outlineCache.get(key)
  if (hit) return hit

  const elements =
    node.kind === 'zone'
      ? [{ tag: 'path', attrs: { d: roundedRect(0, 0, w, h, 12) } as Record<string, string | number> }]
      : shapeElements(node.shape, w, h, 0).filter((e) => e.role === 'body')
  const markup = elements
    .map((e) => `<${e.tag} ${Object.entries(e.attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`)
    .join('')
  let shapes: Shape[] = []
  try {
    const { paths } = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)
    shapes = paths.flatMap((path) => path.toShapes())
  } catch {
    shapes = []
  }
  if (!shapes.length && node.shape !== 'text') {
    // Whatever the outline was, a box is still a truthful footprint.
    const box = new Shape()
    box.moveTo(0, 0).lineTo(w, 0).lineTo(w, h).lineTo(0, h).closePath()
    shapes = [box]
  }
  outlineCache.set(key, shapes)
  return shapes
}

/**
 * Bakes flat shading into the vertex colours: lit faces keep the colour, faces
 * turned away darken a little. No lights in the scene at all, so every colour
 * on screen is one the theme chose rather than one a light bent.
 */
function shade(geometry: BufferGeometry, color: Color): void {
  const normals = geometry.getAttribute('normal')
  const colors = new Float32Array(normals.count * 3)
  const n = new Vector3()
  for (let i = 0; i < normals.count; i++) {
    n.fromBufferAttribute(normals, i)
    const f = 0.72 + 0.28 * Math.max(0, n.dot(LIGHT))
    colors[i * 3] = color.r * f
    colors[i * 3 + 1] = color.g * f
    colors[i * 3 + 2] = color.b * f
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
}

/** Extrudes `shapes` upwards from y = 0 to y = `height`, in canvas-local x/z. */
function extrude(shapes: Shape[], height: number): ExtrudeGeometry {
  const geometry = new ExtrudeGeometry(shapes, { depth: height, bevelEnabled: false, curveSegments: 10 })
  // Shape space is the canvas (y down) extruded along +z; turning it a quarter
  // about x lays the canvas's y along the world's z and stands the extrusion
  // up — downwards, which the translate puts right.
  geometry.rotateX(Math.PI / 2)
  geometry.translate(0, height, 0)
  return geometry
}

/**
 * Extrudes `shapes` out of the front by `depth`, standing up: the canvas's
 * outline in `x` and `y` — turned so its top is up — and its depth along `z`,
 * from the back at `z = 0` to the front at `z = depth`.
 */
function extrudeUpright(shapes: Shape[], height: number, depth: number): ExtrudeGeometry {
  const geometry = new ExtrudeGeometry(shapes, { depth, bevelEnabled: false, curveSegments: 10 })
  // Shape space is the canvas, `y` down; mirrored so the node's top is up.
  geometry.scale(1, -1, 1)
  geometry.translate(0, height, 0)
  return geometry
}

/** Scratch space for turning messages, reused every frame rather than allocated. */
const HEADING = new Vector3()
const AHEAD_A: Vec3 = { x: 0, y: 0, z: 0 }
const AHEAD_B: Vec3 = { x: 0, y: 0, z: 0 }
const BASIS = new Matrix4()
const SIDE = new Vector3()
const UP = new Vector3()
const WORLD_UP = new Vector3(0, 1, 0)
const NORTH = new Vector3(0, 0, 1)

/**
 * Turns `object` so its `x` runs along `dir` and its top stays as near to up
 * as it can — so an envelope travels long side first and lies flat, and on a
 * cable climbing straight up it tips forward rather than rolling over.
 */
function faceAlong(object: Object3D, dir: Vector3) {
  const reference = Math.abs(dir.y) > 0.97 ? NORTH : WORLD_UP
  SIDE.crossVectors(dir, reference).normalize()
  UP.crossVectors(SIDE, dir)
  BASIS.makeBasis(dir, UP, SIDE)
  object.quaternion.setFromRotationMatrix(BASIS)
}

function flatten(points: Vec3[]): number[] {
  const out: number[] = []
  for (const p of points) out.push(p.x, p.y, p.z)
  return out
}

/* -------------------------------------------------------------------- stage */

export class Stage3D {
  readonly renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(FOV, 1, 2, 200000)
  private controls: OrbitControls
  private raycaster = new Raycaster()
  private textures: FaceTextures
  private glows = new Map<string, Texture>()

  private root = new Group()
  private cables = new Group()
  private tokens = new Group()
  private planes: Group[] = []

  private layout: StackLayout | null = null
  /** The document the scene was built from — what a move is previewed against. */
  private doc: DiagramDocument | null = null
  private theme: DiagramTheme | null = null
  private flows: MessageFlow[] = []
  private nodes = new Map<string, NodeEntry>()
  private edges = new Map<string, EdgeEntry>()
  private runs: RunEntry[] = []
  private lineMaterials = new Set<LineMaterial>()
  private disposables: { dispose(): void }[] = []

  private spread = 1
  /** The spread actually drawn — the intro animates it while `spread` holds the goal. */
  private shownSpread = 1
  /** How far up the nodes stand: `0` on their backs, from straight above; `1` upright. */
  private upright = 1
  /** Message faces, by look and colour; kept across rebuilds like the glows. */
  private tokenFaces = new Map<string, Texture>()
  /** Where messages have just landed, spreading out and fading. */
  private landings: { sprite: Sprite; born: number; size: number }[] = []
  private clock = 0
  private selection = new Set<string>()
  private hovered: string | null = null
  private spotlight: string | null = null
  private highlight: { edges: Set<string>; color: string } | null = null
  private hidden = new Set<string>()
  private labels = true
  private motion: StageMotion = { paused: false, reduced: false }

  private size = { width: 1, height: 1 }
  private frame = 0
  private last = 0
  private dirty = true
  private framed = false
  private running = true
  /** The camera flight in progress; a new one replaces it rather than fighting it. */
  private flight: gsap.core.Tween | null = null
  /** The intro's spread animation, which a hand on the spread slider cancels. */
  private unfolding: gsap.core.Tween | null = null
  private observer: ResizeObserver
  private down: { x: number; y: number; button: number } | null = null
  private pendingHover: PointerEvent | null = null

  /** Off while presenting: nothing can be moved, and there is no gizmo. */
  private editable = true
  private gizmoOn = true
  /** The canvas's own grid, which moves here snap to as well. */
  private snapping = { on: true, size: 10 }
  private transform: Transform | null = null
  /** A press on a selected node that may yet turn into a move, or stay a click. */
  private press: { x: number; y: number; id: string; additive: boolean; point: Vector3 } | null = null
  /** Where the pointer last was, anywhere in the window — where `G` starts a move from. */
  private pointer = new Vector2(-1, -1)

  private gizmo = new Group()
  private handles: Handle[] = []
  private hoveredHandle: Handle | null = null
  private activeHandle: Handle | null = null
  /** The constraint's axis lines, drawn while a move is constrained. */
  private guides = new Group()
  private guideLines: Line2[] = []
  /** The camera's last orientation the axis navigator was told about. */
  private oriented = ''

  constructor(
    private host: HTMLElement,
    private events: StageEvents,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.outline = 'none'
    host.appendChild(this.renderer.domElement)
    this.textures = new FaceTextures(this.renderer.capabilities.getMaxAnisotropy())

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.09
    this.controls.screenSpacePanning = true
    // The middle button orbits and ⇧ + middle pans, as in a 3D editor; the left
    // button keeps orbiting and the right keeps panning, for a trackpad.
    this.controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.ROTATE, RIGHT: MOUSE.PAN }
    this.controls.maxPolarAngle = MAX_POLAR
    this.controls.minDistance = 40
    this.controls.maxDistance = 60000
    this.controls.autoRotateSpeed = 0.7
    this.controls.addEventListener('change', this.invalidate)

    this.scene.add(this.root, this.gizmo, this.guides)
    this.root.add(this.cables, this.tokens)
    this.buildGizmo()

    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(host)
    this.resize()

    const el = this.renderer.domElement
    // Ahead of the camera controls, which listen on the canvas itself: a press
    // on the gizmo or on a selected node is a move, and must never also orbit.
    host.addEventListener('pointerdown', this.onPress, true)
    el.addEventListener('pointerdown', this.onPointerDown)
    el.addEventListener('pointerup', this.onPointerUp)
    el.addEventListener('pointermove', this.onPointerMove)
    el.addEventListener('pointerleave', this.onPointerLeave)
    el.addEventListener('dblclick', this.onDoubleClick)
    window.addEventListener('pointermove', this.trackPointer, { passive: true })

    this.last = performance.now()
    this.frame = requestAnimationFrame(this.tick)
  }

  /* ------------------------------------------------------------- lifecycle */

  /** Rebuilds the scene from `doc`. Camera, selection and view state are kept. */
  setScene(doc: DiagramDocument, theme: DiagramTheme, flows: MessageFlow[]) {
    // Whatever was being moved has been overtaken by the document itself.
    this.abortTransform()
    this.clear()
    this.doc = doc
    this.theme = theme
    this.flows = flows
    this.layout = stackLayout(doc)
    this.renderer.setClearColor(theme.bg)
    this.textures.begin()

    this.buildPlanes()
    for (const stack of this.layout.nodes) this.buildNode(stack)
    for (const stack of this.layout.edges) this.buildEdge(stack)
    this.placePlanes()
    this.buildFlows()
    this.textures.sweep()

    this.applyVisibility()
    this.applySelection()
    this.applyEmphasis()
    this.paintHandles()
    this.placeGizmo()

    if (!this.framed) {
      this.framed = true
      this.view('iso', false)
    }
    this.invalidate()
  }

  /** Stops drawing while the view is off screen; picks up where it was. */
  setRunning(running: boolean) {
    if (this.running === running) return
    this.running = running
    cancelAnimationFrame(this.frame)
    if (running) {
      this.last = performance.now()
      this.dirty = true
      this.frame = requestAnimationFrame(this.tick)
    }
  }

  dispose() {
    cancelAnimationFrame(this.frame)
    this.flight?.kill()
    this.observer.disconnect()
    this.abortTransform()
    this.endPress()
    const el = this.renderer.domElement
    this.host.removeEventListener('pointerdown', this.onPress, true)
    window.removeEventListener('pointermove', this.trackPointer)
    el.removeEventListener('pointerdown', this.onPointerDown)
    el.removeEventListener('pointerup', this.onPointerUp)
    el.removeEventListener('pointermove', this.onPointerMove)
    el.removeEventListener('pointerleave', this.onPointerLeave)
    el.removeEventListener('dblclick', this.onDoubleClick)
    this.controls.dispose()
    this.clear()
    this.clearGuides()
    this.gizmo.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose()
        ;(object.material as Material).dispose()
      }
    })
    this.textures.dispose()
    this.glows.forEach((t) => t.dispose())
    this.tokenFaces.forEach((t) => t.dispose())
    this.renderer.dispose()
    el.remove()
  }

  /* --------------------------------------------------------------- setters */

  setSpread(spread: number) {
    this.unfolding?.kill()
    this.unfolding = null
    this.spread = spread
    this.shownSpread = spread
    this.placePlanes()
  }

  setSelection(ids: Iterable<string>) {
    this.selection = new Set(ids)
    this.applySelection()
    this.placeGizmo()
  }

  /** Whether nodes can be moved here at all; off while presenting. */
  setEditable(editable: boolean) {
    this.editable = editable
    if (!editable) {
      this.abortTransform(true)
      this.endPress()
    }
    this.placeGizmo()
  }

  /** Shows or hides the move gizmo on the selection. */
  setGizmo(on: boolean) {
    this.gizmoOn = on
    this.placeGizmo()
  }

  /** The canvas's grid: a move snaps to it while it is on, unless `Ctrl` is held. */
  setSnap(on: boolean, size: number) {
    this.snapping = { on, size }
  }

  setSpotlight(flow: string | null) {
    this.spotlight = flow
    this.applyEmphasis()
    this.applyVisibility()
  }

  /** Lights up the connections a flow runs over, without dimming anything — the flow editor's hover. */
  setHighlight(edges: Set<string> | null, color: string | null) {
    this.highlight = edges && color ? { edges, color } : null
    this.applyEmphasis()
  }

  setHiddenPlanes(ids: Iterable<string>) {
    this.hidden = new Set(ids)
    this.applyVisibility()
  }

  setLabels(on: boolean) {
    this.labels = on
    this.applyVisibility()
  }

  setAutoRotate(on: boolean) {
    this.controls.autoRotate = on && !this.motion.reduced
    this.invalidate()
  }

  setMotion(motion: StageMotion) {
    this.motion = motion
    if (motion.reduced) this.controls.autoRotate = false
    this.invalidate()
  }

  /* ---------------------------------------------------------------- camera */

  /** Sends the camera to a preset angle around the whole stack. */
  view(preset: CameraPreset, animate = true) {
    const { center, radius } = this.bounds()
    this.aim(center, radius, PRESETS[preset], animate)
  }

  /** Re-frames the whole stack from wherever the camera is looking from. */
  frameAll(animate = true) {
    const { center, radius } = this.bounds()
    this.aim(center, radius, this.currentAngles(), animate)
  }

  /** Moves the camera in or out along its line of sight. */
  zoomBy(factor: number) {
    const distance = this.camera.position.distanceTo(this.controls.target)
    const next = Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, distance * factor))
    this.fly(this.controls.target.clone(), next, this.currentAngles(), true, 0.3)
  }

  /** Flies to one node, keeping the current angle. */
  focusNode(id: string) {
    const entry = this.nodes.get(id)
    if (!entry) return
    const { box } = entry.stack
    const y = this.planeY(entry.stack.level) + entry.base + entry.rise / 2
    const center = new Vector3(box.x + box.width / 2, y, box.y + box.height / 2)
    this.aim(center, Math.max(box.width, box.height) * 1.6, this.currentAngles(), true)
  }

  /** Frames the selection — or everything, with nothing selected. */
  frameSelection() {
    const ids = [...this.selection].filter((id) => this.nodes.has(id))
    if (!ids.length) {
      this.frameAll()
      return
    }
    const { center, radius } = this.bounds(ids)
    // With room around it: what a node is joined to is half of why it is being looked at.
    this.aim(center, Math.max(radius * 1.8, 180), this.currentAngles(), true)
  }

  /**
   * Looks straight along an axis, from its `sign` end: from the front, the
   * side, or above. A view from below would look up through the ground plane,
   * which the stack is never read from, so `-z` comes out as the view from above.
   */
  viewAxis(axis: Axis, sign: 1 | -1) {
    const angles =
      axis === 'z'
        ? PRESETS.top
        : {
            polar: MAX_POLAR,
            // The world's z is the canvas's y: looking from +y is looking from the canvas's bottom edge.
            azimuth: axis === 'y' ? (sign > 0 ? 0 : Math.PI) : sign > 0 ? Math.PI / 2 : -Math.PI / 2,
          }
    this.fly(this.controls.target.clone(), this.camera.position.distanceTo(this.controls.target), angles, true, 0.45)
  }

  /** Turns the camera around what it is looking at, by radians — the numpad's steps. */
  orbitBy(azimuth: number, polar: number) {
    const now = this.currentAngles()
    const angles = {
      azimuth: now.azimuth + azimuth,
      polar: Math.min(MAX_POLAR, Math.max(0.0001, now.polar + polar)),
    }
    this.fly(this.controls.target.clone(), this.camera.position.distanceTo(this.controls.target), angles, true, 0.25)
  }

  /** Flies to one plane, looking down on it at an angle. */
  focusPlane(id: string) {
    const level = this.layout?.planes.findIndex((p) => p.id === id) ?? -1
    if (level < 0 || !this.layout) return
    const { footprint } = this.layout
    const center = new Vector3(
      footprint.x + footprint.width / 2,
      this.planeY(level),
      footprint.y + footprint.height / 2,
    )
    const radius = Math.hypot(footprint.width, footprint.height) / 2
    this.aim(center, radius, { polar: (48 * Math.PI) / 180, azimuth: this.currentAngles().azimuth }, true)
  }

  /**
   * The opening move: the diagram as it looks in 2D — flat, from straight above —
   * tilts away and its planes pull apart. Says what the 3D view is in a second.
   */
  intro() {
    if (this.motion.reduced || !this.layout) return
    const goal = this.spread
    const { center, radius } = this.bounds()
    this.shownSpread = 0
    this.placePlanes()
    const flat = this.bounds()
    this.aim(flat.center, flat.radius, PRESETS.top, false)
    this.aim(center, radius, PRESETS.iso, true, 1.3)
    const state = { s: 0 }
    this.unfolding = gsap.to(state, {
      s: goal,
      duration: 1.3,
      ease: 'power2.inOut',
      onUpdate: () => {
        this.shownSpread = state.s
        this.placePlanes()
      },
      onComplete: () => (this.unfolding = null),
    })
  }

  /** The current frame, as a PNG — without the gizmo, which is a tool and not part of the picture. */
  snapshot(): Promise<Blob | null> {
    const gizmo = this.gizmo.visible
    const guides = this.guides.visible
    this.gizmo.visible = this.guides.visible = false
    this.render()
    const blob = new Promise<Blob | null>((resolve) => this.renderer.domElement.toBlob(resolve, 'image/png'))
    this.gizmo.visible = gizmo
    this.guides.visible = guides
    this.invalidate()
    return blob
  }

  /* ------------------------------------------------------------- the scene */

  private planeY(level: number): number {
    return level * (this.layout?.gap ?? 0) * this.shownSpread
  }

  private buildPlanes() {
    const layout = this.layout!
    const theme = this.theme!
    const { footprint } = layout
    for (const plane of layout.planes) {
      const group = new Group()
      group.userData.level = plane.level
      const accent = COLOR_HEX[plane.color]
      const implicit = plane.id === null

      const outline = new Shape()
      const r = 28
      const { x, y, width: w, height: h } = footprint
      outline
        .moveTo(x + r, y)
        .lineTo(x + w - r, y)
        .quadraticCurveTo(x + w, y, x + w, y + r)
        .lineTo(x + w, y + h - r)
        .quadraticCurveTo(x + w, y + h, x + w - r, y + h)
        .lineTo(x + r, y + h)
        .quadraticCurveTo(x, y + h, x, y + h - r)
        .lineTo(x, y + r)
        .quadraticCurveTo(x, y, x + r, y)

      const plateGeometry = new ShapeGeometry(outline, 8)
      plateGeometry.rotateX(Math.PI / 2)
      const plateMaterial = new MeshBasicMaterial({
        color: mix(accent, theme.bg, theme.dark ? 0.84 : 0.9),
        transparent: true,
        opacity: implicit ? 0.45 : theme.dark ? 0.55 : 0.62,
        depthWrite: false,
        side: DoubleSide,
      })
      const plate = new Mesh(plateGeometry, plateMaterial)
      plate.renderOrder = -10
      plate.position.y = -0.6
      this.own(plateGeometry, plateMaterial)
      group.add(plate)

      const rim = this.line(
        outline.getPoints(8).map((p) => ({ x: p.x, y: -0.5, z: p.y })),
        mix(accent, theme.bg, implicit ? 0.75 : 0.35),
        implicit ? 1 : 1.6,
      )
      rim.line.renderOrder = -9
      group.add(rim.line)

      if (!implicit) {
        const name = textSprite([
          {
            text: (plane.label || plane.id || '').toUpperCase(),
            size: 26,
            weight: 700,
            color: mix(accent, theme.ink, theme.dark ? 0.1 : 0.25),
            letterSpacing: 1.5,
          },
          {
            text: `${plane.count} node${plane.count === 1 ? '' : 's'}`,
            size: 14,
            weight: 400,
            color: theme.muted,
          },
        ])
        name.center.set(0, 0)
        // In proportion to the diagram, so a wide landscape's planes stay named.
        name.scale.multiplyScalar(Math.min(3, Math.max(1, Math.max(w, h) / 1400)))
        name.position.set(x + 8, 6, y + h + 4)
        name.renderOrder = 5
        this.own(name.material.map!, name.material)
        group.add(name)
      }

      this.planes.push(group)
      this.root.add(group)
    }
  }

  private buildNode(stack: StackNode) {
    const theme = this.theme!
    const { node, box, depth } = stack
    const paint = nodePaint(node, theme)
    const group = new Group()
    const base = depth * ZONE_FLOOR + stack.elevation
    group.position.set(box.x, base, box.y)

    const entry: NodeEntry = {
      stack,
      group,
      pick: [],
      materials: [],
      outline: null,
      outlineColor: new Color(mix(paint.stroke, theme.ink, theme.dark ? 0.1 : 0.2)),
      ring: [],
      base,
      rise: 0,
      body: null,
      post: null,
      selection: null,
    }
    const keep = (material: Material, opacity = 1) => {
      material.transparent = true
      material.opacity = opacity
      entry.materials.push({ material, opacity })
      this.own(material)
    }

    const shapes = silhouette(node)
    // A text annotation has no outline of its own; its box is what selecting it rings.
    const { width: w, height: h } = node.size
    entry.ring = shapes[0]?.getPoints(10) ?? [
      new Vector2(0, 0),
      new Vector2(w, 0),
      new Vector2(w, h),
      new Vector2(0, h),
    ]
    const isZone = node.kind === 'zone'
    const isText = node.kind === 'annotation' || node.shape === 'text'
    const sides = new Color(isZone ? paint.fill : mix(paint.stroke, paint.fill, 0.25))

    /** A solid in the node's own colour, edged so its shape reads at an angle. */
    const solid = (geometry: BufferGeometry, parent: Object3D, color = sides) => {
      shade(geometry, color)
      const material = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide })
      keep(material)
      const mesh = new Mesh(geometry, material)
      mesh.userData.node = node.id
      entry.pick.push(mesh)
      parent.add(mesh)
      const edgesGeometry = new EdgesGeometry(geometry, 28)
      const outline = entry.outline ?? new LineBasicMaterial({ color: entry.outlineColor })
      if (!entry.outline) keep(outline)
      entry.outline = outline
      // On the mesh, not beside it, so it moves and grows with it — a post does both.
      mesh.add(new LineSegments(edgesGeometry, outline))
      this.own(geometry, edgesGeometry)
      return mesh
    }

    // The face: the node exactly as the exporter draws it.
    const faceGeometry = new PlaneGeometry(w, h)
    const faceMaterial = new MeshBasicMaterial({
      color: isText ? theme.bg : paint.fill,
      side: DoubleSide,
      // A circle or a diamond leaves the corners of its face empty; without this
      // those empty corners would still hide whatever runs underneath them.
      alphaTest: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    keep(faceMaterial, isText ? 0 : 1)
    const face = new Mesh(faceGeometry, faceMaterial)
    face.userData.node = node.id
    face.renderOrder = isZone ? 1 : 2
    entry.pick.push(face)
    this.own(faceGeometry)

    if (isZone) {
      // A zone is a floor with glass walls: it encloses what it holds without hiding it.
      if (shapes.length) solid(extrude(shapes, ZONE_FLOOR), group)
      if (stack.height > 0 && shapes.length) {
        const ring = new Shape(entry.ring.map((p) => p.clone()))
        const inset = 1.4
        const cx = w / 2
        const cy = h / 2
        const shrunk = entry.ring.map(
          (p) => new Vector2(cx + (p.x - cx) * (1 - (inset * 2) / w), cy + (p.y - cy) * (1 - (inset * 2) / h)),
        )
        ring.holes.push(new Shape(shrunk))
        const geometry = extrude([ring], stack.height)
        geometry.translate(0, ZONE_FLOOR, 0)
        const material = new MeshBasicMaterial({
          color: mix(paint.accent, theme.bg, 0.55),
          depthWrite: false,
          side: DoubleSide,
        })
        keep(material, theme.dark ? 0.22 : 0.18)
        group.add(new Mesh(geometry, material))
        this.own(geometry)
      }
      faceGeometry.rotateX(-Math.PI / 2)
      faceGeometry.translate(w / 2, ZONE_FLOOR + 0.25, h / 2)
      group.add(face)
      entry.rise = ZONE_FLOOR
    } else {
      // Everything else is built standing, facing the front, and laid on its
      // back by `pose` for as long as it lies down.
      const body = new Group()
      entry.body = body
      group.add(body)
      const depth = stack.thickness
      if (!isText && depth > 0 && shapes.length) solid(extrudeUpright(shapes, h, depth), body)
      faceGeometry.translate(w / 2, h / 2, depth + 0.25)
      body.add(face)

      // A post under a node that stands higher than the rest, so it is held up
      // rather than floating — narrower than the node, in its darker colour.
      if (stack.stand > 0) {
        const geometry = new BoxGeometry(Math.min(30, Math.max(10, w * 0.16)), stack.stand, Math.max(6, depth * 0.6))
        geometry.translate(0, stack.stand / 2, 0)
        const post = solid(geometry, group, new Color(mix(paint.stroke, theme.ink, 0.15)))
        post.position.set(w / 2, 0, h / 2)
        entry.post = post
      }
      this.pose(entry)
    }

    void this.textures.get(node, theme).then((texture) => {
      if (!texture || this.nodes.get(node.id) !== entry) return
      faceMaterial.map = texture
      faceMaterial.color.set('#ffffff')
      // The face's text is now what shows; a text annotation had nothing before.
      const slot = entry.materials.find((m) => m.material === faceMaterial)
      if (slot) slot.opacity = 1
      faceMaterial.needsUpdate = true
      this.applyEmphasis()
    })

    this.nodes.set(node.id, entry)
    this.planes[stack.level]!.add(group)
  }

  /**
   * Stands a node up — or lays it on its back — as far as `upright` says. It
   * turns about its bottom edge: lying, it covers its box the way the canvas
   * draws it; standing, it stands across the middle of it, facing the front,
   * on its post if it has one. A node set to lie *flat* never gets up.
   */
  private pose(entry: NodeEntry) {
    const body = entry.body
    if (!body) return
    const { stack } = entry
    const u = stack.standing ? this.upright : 0
    const h = stack.node.size.height
    const depth = stack.thickness
    body.rotation.x = (-Math.PI / 2) * (1 - u)
    body.position.set(0, stack.stand * u, h + (h / 2 - depth / 2 - h) * u)
    if (entry.post) {
      entry.post.scale.y = Math.max(1e-3, u)
      entry.post.visible = u > 0.01
    }
    const lying = depth + 0.25
    entry.rise = lying + (Math.max(stack.height, lying) - lying) * u
  }

  /** Stands every node up, or lays it down, and re-lays the connections at their new heights. */
  private setUpright(u: number) {
    if (Math.abs(u - this.upright) < 1e-4) return
    this.upright = u
    for (const entry of this.nodes.values()) this.pose(entry)
    this.placePlanes()
  }

  /** How far up the nodes stand for the camera as it is: lying from straight above, upright once it tilts. */
  private uprightForCamera(): number {
    const offset = this.camera.position.clone().sub(this.controls.target)
    const length = offset.length()
    if (!length) return this.upright
    const polar = Math.acos(Math.min(1, Math.max(-1, offset.y / length)))
    const t = Math.min(1, Math.max(0, (polar - LIE_DOWN_BELOW) / (STAND_UP_ABOVE - LIE_DOWN_BELOW)))
    return t * t * (3 - 2 * t)
  }

  private buildEdge(stack: StackEdge) {
    const theme = this.theme!
    const { edge } = stack
    const color = edgeColor(edge.color, theme)
    const stroke = edgeStrokeWidth(edge.width)
    const width = (stroke / EDGE_PX.regular) * 2
    const dash = dashArray(edge.line, stroke)?.split(' ').map(Number)

    const inPlane = !!stack.route
    const parent = inPlane ? this.planes[stack.from]! : this.cables
    const points = inPlane ? this.routePoints(stack) : this.cable(stack)
    const { line, material } = this.line(points, color, width, dash)
    parent.add(line)

    // A connection between planes is the thing the 3D view exists to show, so it
    // carries a soft halo that keeps it legible from any angle.
    let halo: Line2 | null = null
    if (!inPlane) {
      const glow = this.line(points, color, width + 5)
      glow.material.opacity = HALO[theme.dark ? 'dark' : 'light']
      glow.material.depthWrite = false
      halo = glow.line
      parent.add(halo)
    }

    const entry: EdgeEntry = {
      stack,
      parent,
      line,
      material,
      color,
      width,
      halo,
      arrows: [],
      label: null,
      track: track(points),
      dashes: [],
      accent: null,
    }

    const head = (): Mesh => {
      const size = 1 + Math.max(0, stroke - EDGE_PX.regular) * 0.22
      const geometry = new ConeGeometry(4.6 * size, 11 * size, 14)
      geometry.translate(0, -5.5 * size, 0)
      const coneMaterial = new MeshBasicMaterial({ color, transparent: true })
      this.own(geometry, coneMaterial)
      const cone = new Mesh(geometry, coneMaterial)
      parent.add(cone)
      return cone
    }
    if (edge.arrows !== 'none') entry.arrows.push(head())
    if (edge.arrows === 'both') entry.arrows.push(head())

    if (edge.label) {
      const label = textSprite([{ text: edge.label, size: 11, weight: 400, color: theme.muted }], {
        background: theme.bg,
        border: mix(color, theme.bg, 0.72),
        pad: 4,
      })
      label.center.set(0.5, 0)
      label.renderOrder = 6
      this.own(label.material.map!, label.material)
      parent.add(label)
      entry.label = label
    }

    this.edges.set(edge.id, entry)
    this.placeEdgeDecorations(entry)
  }

  /** A route along a floor, rising to where it meets each end, in its plane's own space. */
  private routePoints(stack: StackEdge): Vec3[] {
    const u = this.upright
    const at = (end: EndHeight) => end.flat + (end.up - end.flat) * u
    return liftRoute(stack.route!, at(stack.ends[0]), at(stack.ends[1]))
  }

  /** A cable between floors, in world space, at the planes' current heights. */
  private cable(stack: StackEdge): Vec3[] {
    const s = this.nodes.get(stack.edge.source)!
    const t = this.nodes.get(stack.edge.target)!
    const sy = this.planeY(s.stack.level) + s.base
    const ty = this.planeY(t.stack.level) + t.base
    // Out of the top of the lower end and into the bottom of the higher one.
    const up = ty > sy || (ty === sy && stack.to > stack.from)
    const centre = (e: NodeEntry, top: boolean): Vec3 => ({
      x: e.stack.box.x + e.stack.box.width / 2,
      y: this.planeY(e.stack.level) + e.base + (top ? e.rise : 0),
      z: e.stack.box.y + e.stack.box.height / 2,
    })
    return cablePoints(centre(s, up), centre(t, !up))
  }

  /** Lays a connection along `points`: its line, halo and flow dashes, and what rides on it. */
  private setEdgePoints(entry: EdgeEntry, points: Vec3[]) {
    const positions = flatten(points.length > 1 ? points : [...points, ...points])
    ;(entry.line.geometry as LineGeometry).setPositions(positions)
    entry.line.computeLineDistances()
    if (entry.halo) (entry.halo.geometry as LineGeometry).setPositions(positions)
    for (const dash of entry.dashes) {
      ;(dash.line.geometry as LineGeometry).setPositions(positions)
      dash.line.computeLineDistances()
    }
    entry.track = track(points)
    this.placeEdgeDecorations(entry)
  }

  /**
   * Re-lays a connection whose ends have moved. One that leaves its floor
   * becomes a cable, and one that lands on a shared floor becomes a route
   * along it, so it is handed over to the group that kind of line lives in.
   */
  private restackEdge(entry: EdgeEntry, stack: StackEdge) {
    entry.stack = stack
    const parent = stack.route ? this.planes[stack.from]! : this.cables
    if (parent !== entry.parent) {
      const parts: Object3D[] = [entry.line, ...entry.arrows, ...entry.dashes.map((d) => d.line)]
      if (entry.halo) parts.push(entry.halo)
      if (entry.label) parts.push(entry.label)
      entry.parent.remove(...parts)
      parent.add(...parts)
      entry.parent = parent
    }
    if (entry.halo) entry.halo.visible = entry.line.visible && !stack.route
    this.setEdgePoints(entry, stack.route ? this.routePoints(stack) : this.cable(stack))
  }

  /** Arrowheads and the label, wherever the line now runs. */
  private placeEdgeDecorations(entry: EdgeEntry) {
    const points = entry.track.points
    const ends: [Vec3, Vec3][] = []
    if (points.length >= 2) {
      ends.push([points.at(-1)!, points.at(-2)!])
      ends.push([points[0]!, points[1]!])
    }
    const up = new Vector3(0, 1, 0)
    entry.arrows.forEach((cone, i) => {
      const [tip, before] = ends[i] ?? []
      if (!tip || !before) return
      const dir = new Vector3(tip.x - before.x, tip.y - before.y, tip.z - before.z).normalize()
      cone.position.set(tip.x, tip.y, tip.z)
      cone.quaternion.copy(new Quaternion().setFromUnitVectors(up, dir))
    })
    if (entry.label) {
      const mid = pointOnTrack(entry.track, 0.5, { x: 0, y: 0, z: 0 })
      entry.label.position.set(mid.x, mid.y + 4, mid.z)
    }
  }

  /** Puts every plane at its height and re-runs the cables between them. */
  private placePlanes() {
    this.planes.forEach((group, level) => (group.position.y = this.planeY(level)))
    for (const entry of this.edges.values()) {
      // Every one: a cable follows the planes' heights, a route along a floor
      // the heights of the nodes it joins as they stand up or lie down.
      this.setEdgePoints(entry, entry.stack.route ? this.routePoints(entry.stack) : this.cable(entry.stack))
    }
    // A cable's length is part of a message's timing, so the plans follow it.
    if (this.runs.length) this.replan()
    this.placeGizmo()
    this.invalidate()
  }

  /* ----------------------------------------------------------------- flows */

  private buildFlows() {
    const theme = this.theme!
    for (const flow of this.flows) {
      if (!flow.enabled) continue
      const plan = this.plan(flow)
      if (!plan.branches.length) continue

      if (flow.motion !== 'token') {
        for (const id of plan.edges) {
          const entry = this.edges.get(id)
          if (!entry) continue
          const look = edgeStyle(flow, id)
          const overlay = this.line(entry.track.points, COLOR_HEX[look.color], entry.width + 1.6, [
            8,
            DASH_PATTERN - 8,
          ])
          overlay.line.renderOrder = 3
          entry.parent.add(overlay.line)
          entry.dashes.push({ flow: flow.id, ...overlay, speed: look.speed })
        }
      }

      const tokens: TokenEntry[] = []
      if (flow.motion !== 'dash') {
        plan.branches.forEach((_, branch) => {
          for (let index = 0; index < plan.tokens; index++) {
            tokens.push(this.token(flow, branch, index, theme))
          }
        })
      }
      this.runs.push({ flow, plan, tokens, time: 0 })
    }
  }

  private plan(flow: MessageFlow): FlowPlan {
    const byId = new Map<string, FlowEdge>(
      [...this.edges.values()].map((e) => [
        e.stack.edge.id,
        { id: e.stack.edge.id, source: e.stack.edge.source, target: e.stack.edge.target },
      ]),
    )
    return flowPlan(flow, byId, (id) => this.edges.get(id)?.track.length ?? 0)
  }

  /** Re-times every flow against the lines as they now are, keeping each where it was. */
  private replan() {
    for (const run of this.runs) {
      const before = run.plan.duration
      run.plan = this.plan(run.flow)
      if (before > 0) run.time = (run.time / before) * run.plan.duration
    }
  }

  /** One message: its head, a glow and a short trail of ghosts behind it. */
  private token(flow: MessageFlow, branch: number, index: number, theme: DiagramTheme): TokenEntry {
    // The first hop's look stands for the message until a hop styled otherwise.
    const look = edgeStyle(flow, flow.edges[0] ?? '')
    const color = COLOR_HEX[look.color]
    const head = this.tokenHead(look.token)

    const glowMaterial = new SpriteMaterial({
      map: this.glow(color),
      transparent: true,
      depthWrite: false,
      blending: theme.dark ? AdditiveBlending : NormalBlending,
      opacity: theme.dark ? 0.9 : 0.55,
    })
    this.own(glowMaterial)
    const glow = new Sprite(glowMaterial)
    glow.userData.size = theme.dark ? 38 : 30
    glow.renderOrder = 7

    const trail = Array.from({ length: TRAIL_LENGTH }, (_, i) => {
      const m = glowMaterial.clone()
      m.opacity = (theme.dark ? 0.55 : 0.4) * (1 - (i + 1) / (TRAIL_LENGTH + 1))
      this.own(m)
      const ghost = new Sprite(m)
      ghost.userData.size = (theme.dark ? 22 : 18) * (1 - i / (TRAIL_LENGTH + 2))
      ghost.renderOrder = 7
      return ghost
    })

    glow.visible = false
    trail.forEach((t) => (t.visible = false))
    this.tokens.add(glow, ...trail)
    const token: TokenEntry = {
      branch,
      index,
      head,
      heads: new Map([[head.look, head]]),
      color: '',
      glow,
      trail,
      hop: null,
      progress: 0,
    }
    this.paintToken(token, color)
    return token
  }

  /**
   * A message's head. A dot is a bead of light; a packet and an envelope are
   * things — a parcel and a letter, drawn like the canvas's glyphs on every
   * side and turned to face where they are going.
   */
  private tokenHead(look: FlowToken): TokenHead {
    const material = () => {
      const m = new MeshBasicMaterial({ color: '#ffffff', transparent: true })
      this.own(m)
      return m
    }
    let mesh: Mesh
    let materials: MeshBasicMaterial[]
    if (look === 'envelope') {
      // Long side along the way it travels, lying flat; the front on top.
      const geometry = new BoxGeometry(15, 2.6, 11)
      const [edge, front, back] = [material(), material(), material()]
      materials = [edge, front, back]
      mesh = new Mesh(geometry, [edge, edge, front, back, edge, edge])
      this.own(geometry)
    } else if (look === 'packet') {
      const geometry = new BoxGeometry(11, 9, 9)
      materials = [material()]
      mesh = new Mesh(geometry, materials[0])
      this.own(geometry)
    } else {
      const geometry = new SphereGeometry(5.2, 18, 12)
      materials = [material()]
      mesh = new Mesh(geometry, materials[0])
      this.own(geometry)
    }
    mesh.renderOrder = 8
    mesh.visible = false
    this.tokens.add(mesh)
    return { look, mesh, materials }
  }

  /** Swaps a message's head for `look`'s — the canvas's per-hop glyph, in 3D. */
  private dressToken(token: TokenEntry, look: FlowToken) {
    if (token.head.look === look) return
    let head = token.heads.get(look)
    if (!head) {
      head = this.tokenHead(look)
      token.heads.set(look, head)
    }
    token.head.mesh.visible = false
    token.head = head
    // Painted in whatever colour the message wears now.
    const color = token.color
    token.color = ''
    this.paintToken(token, color)
  }

  /** Dresses a message in `color` — its faces, its glow and its trail. */
  private paintToken(token: TokenEntry, color: string) {
    if (token.color === color) return
    token.color = color
    const line = this.theme?.bg ?? '#ffffff'
    const [first, front, back] = token.head.materials
    if (token.head.look === 'envelope') {
      first!.color.set(mix(color, line, 0.18))
      front!.map = this.tokenFace('envelope', color, line)
      back!.map = this.tokenFace('envelope-back', color, line)
      front!.needsUpdate = back!.needsUpdate = true
    } else if (token.head.look === 'packet') {
      first!.map = this.tokenFace('packet', color, line)
      first!.needsUpdate = true
    } else {
      first!.color.set(color)
    }
    const glow = this.glow(color)
    ;(token.glow.material as SpriteMaterial).map = glow
    for (const ghost of token.trail) (ghost.material as SpriteMaterial).map = glow
  }

  private tokenFace(kind: 'packet' | 'envelope' | 'envelope-back', color: string, line: string): Texture {
    const key = `${kind}|${color}|${line}`
    let texture = this.tokenFaces.get(key)
    if (!texture) {
      texture = tokenFace(kind, color, line)
      this.tokenFaces.set(key, texture)
    }
    return texture
  }

  private glow(color: string): Texture {
    let texture = this.glows.get(color)
    if (!texture) {
      texture = glowTexture(color)
      this.glows.set(color, texture)
    }
    return texture
  }

  /** Where a message is on its connection, in world space; `null` when the connection is not shown. */
  private sample(edge: string, progress: number, out: Vec3): Vec3 | null {
    const entry = this.edges.get(edge)
    if (!entry || !entry.line.visible) return null
    pointOnTrack(entry.track, progress, out)
    if (entry.stack.route) out.y += this.planeY(entry.stack.from)
    return out
  }

  /** How much to grow every message this frame so none is drawn smaller than `MIN_TOKEN_PX`. */
  private tokenScale(): number {
    const distance = this.camera.position.distanceTo(this.controls.target)
    const pixelsPerUnit = this.size.height / (2 * distance * Math.tan((FOV * Math.PI) / 360))
    return Math.max(1, MIN_TOKEN_PX / (TOKEN_SIZE * pixelsPerUnit))
  }

  private paintRun(run: RunEntry, scale: number) {
    const visible = this.runVisible(run)
    const scratch: Vec3 = { x: 0, y: 0, z: 0 }
    for (const token of run.tokens) {
      token.head.mesh.scale.setScalar(scale)
      // A thing carries less of a halo than a bead of light, or it would drown in it.
      token.glow.scale.setScalar(token.glow.userData.size * scale * (token.head.look === 'dot' ? 1 : 0.8))
      token.trail.forEach((ghost) => ghost.scale.setScalar(ghost.userData.size * scale))
    }

    if (this.motion.reduced) {
      // One message parked halfway along each connection: still says which lines
      // carry it, without moving anything.
      const shown = new Set<string>()
      for (const token of run.tokens) {
        const hop = run.plan.branches[token.branch]?.hops.find((h) => !shown.has(h.edge))
        const at = token.index === 0 && hop ? this.sample(hop.edge, 0.5, scratch) : null
        if (hop && at) shown.add(hop.edge)
        this.placeToken(token, visible ? at : null, 1, hop?.edge ?? null, 0.5, run.flow)
        token.trail.forEach((t) => (t.visible = false))
      }
      return
    }

    for (const token of run.tokens) {
      const branch = run.plan.branches[token.branch]
      const time = run.time + token.index * run.plan.offset
      const position = branch ? tokenAt(branch, time) : null
      const at = position ? this.sample(position.edge, position.progress, scratch) : null
      this.placeToken(token, visible ? at : null, position?.opacity ?? 0, position?.edge ?? null, position?.progress ?? 0, run.flow)
      if (visible) this.watchLanding(token, position?.edge ?? null, position?.progress ?? 0)

      token.trail.forEach((ghost, i) => {
        const back = branch ? tokenAt(branch, time - (i + 1) * TRAIL_STEP) : null
        const where = back && visible ? this.sample(back.edge, back.progress, scratch) : null
        ghost.visible = !!where
        if (where) ghost.position.set(where.x, where.y, where.z)
      })
    }
  }

  private placeToken(
    token: TokenEntry,
    at: Vec3 | null,
    opacity: number,
    edge: string | null,
    progress: number,
    flow: MessageFlow,
  ) {
    if (at && edge) {
      // Each hop in its own look and colour, the way the canvas draws it.
      const look = edgeStyle(flow, edge)
      this.dressToken(token, look.token)
      this.paintToken(token, COLOR_HEX[look.color])
    }
    const head = token.head.mesh
    head.visible = token.glow.visible = !!at
    if (!at) return
    head.position.set(at.x, at.y, at.z)
    token.glow.position.set(at.x, at.y, at.z)
    for (const material of token.head.materials) material.opacity = opacity
    ;(token.glow.material as SpriteMaterial).opacity = opacity * (this.theme?.dark ? 0.9 : 0.55)
    // A bead looks the same from every side; a parcel or a letter faces its way.
    if (edge && token.head.look !== 'dot' && this.heading(edge, progress, HEADING)) faceAlong(head, HEADING)
  }

  /** Which way a message on `edge` is going at `progress`, in world space; `false` where it cannot tell. */
  private heading(edge: string, progress: number, out: Vector3): boolean {
    const track = this.edges.get(edge)?.track
    if (!track || track.length <= 0) return false
    const step = Math.min(0.05, 3 / track.length)
    const a = pointOnTrack(track, Math.max(0, progress - step), AHEAD_A)
    const b = pointOnTrack(track, Math.min(1, progress + step), AHEAD_B)
    out.set(b.x - a.x, b.y - a.y, b.z - a.z)
    if (out.lengthSq() < 1e-8) return false
    out.normalize()
    return true
  }

  /**
   * Catches a message arriving at the end of a hop — the node it was sent to —
   * once per arrival, and marks the spot with a ripple in its colour. Whether
   * it got there this frame, between two frames, or on the frame its journey
   * ended and it faded out, it is caught once.
   */
  private watchLanding(token: TokenEntry, edge: string | null, progress: number) {
    const was = token.hop
    const before = token.progress
    token.hop = edge
    token.progress = progress
    if (!was) return
    const landed = edge === was ? before < ARRIVED && progress >= ARRIVED : before < ARRIVED
    if (landed) this.land(was, token.color)
  }

  /** A ripple of colour spreading out where a message reached its node. */
  private land(edge: string, color: string) {
    const at = this.sample(edge, 1, { x: 0, y: 0, z: 0 })
    if (!at || this.landings.length > 48) return
    const dark = this.theme?.dark ?? false
    const material = new SpriteMaterial({
      map: this.glow(color),
      transparent: true,
      depthWrite: false,
      blending: dark ? AdditiveBlending : NormalBlending,
      opacity: 0,
    })
    const sprite = new Sprite(material)
    sprite.position.set(at.x, at.y, at.z)
    sprite.renderOrder = 7
    this.tokens.add(sprite)
    this.landings.push({ sprite, born: this.clock, size: (dark ? 70 : 58) * this.tokenScale() })
  }

  /** Spreads and fades every ripple, and lets the finished ones go. */
  private settleLandings() {
    this.landings = this.landings.filter((landing) => {
      const t = (this.clock - landing.born) / LANDING_S
      const material = landing.sprite.material as SpriteMaterial
      if (t >= 1) {
        this.tokens.remove(landing.sprite)
        material.dispose()
        return false
      }
      const ease = 1 - (1 - t) * (1 - t)
      landing.sprite.scale.setScalar(landing.size * (0.35 + 0.65 * ease))
      material.opacity = (this.theme?.dark ? 0.85 : 0.6) * (1 - t)
      return true
    })
  }

  private runVisible(run: RunEntry): boolean {
    return !this.spotlight || this.spotlight === run.flow.id
  }

  /* ------------------------------------------------------------- emphasis */

  private applySelection() {
    const theme = this.theme
    if (!theme) return
    for (const [id, entry] of this.nodes) {
      const selected = this.selection.has(id)
      if (selected && !entry.selection && entry.ring.length) {
        const h = entry.stack.node.size.height
        const outline = [...entry.ring, entry.ring[0]!]
        // Round the face: on top of a zone's floor, or on a node's front.
        const ring = this.line(
          entry.body
            ? outline.map((p) => ({ x: p.x, y: h - p.y, z: entry.stack.thickness + 0.6 }))
            : outline.map((p) => ({ x: p.x, y: entry.rise + 0.6, z: p.y })),
          theme.selection,
          3,
        )
        ring.line.renderOrder = 9
        ;(entry.body ?? entry.group).add(ring.line)
        entry.selection = ring.line
      } else if (!selected && entry.selection) {
        entry.selection.parent?.remove(entry.selection)
        entry.selection.geometry.dispose()
        this.lineMaterials.delete(entry.selection.material as LineMaterial)
        ;(entry.selection.material as LineMaterial).dispose()
        entry.selection = null
      }
    }
    this.applyHover()
  }

  private applyHover() {
    const theme = this.theme
    if (!theme) return
    for (const [id, entry] of this.nodes) {
      if (!entry.outline) continue
      entry.outline.color.copy(
        id === this.hovered ? new Color(theme.selection) : entry.outlineColor,
      )
    }
    this.invalidate()
  }

  /** What the spotlight and the flow editor's hover say should stand out. */
  private applyEmphasis() {
    const flow = this.spotlight ? this.flows.find((f) => f.id === this.spotlight) : null
    const run = flow ? this.runs.find((r) => r.flow.id === flow.id) : null
    const lit = run ? run.plan.edges : flow ? new Set(flow.edges) : null
    const litNodes = new Set<string>()
    if (lit) {
      for (const id of lit) {
        const edge = this.edges.get(id)?.stack.edge
        if (edge) litNodes.add(edge.source).add(edge.target)
      }
    }

    for (const [id, entry] of this.nodes) {
      // Zones stay up: they are where things are, and dimming them loses the map.
      const dim = !!lit && !litNodes.has(id) && entry.stack.node.kind !== 'zone' ? DIMMED : 1
      for (const slot of entry.materials) {
        slot.material.opacity = slot.opacity * dim
        slot.material.depthWrite = dim === 1 && slot.opacity === 1
      }
    }

    for (const [id, entry] of this.edges) {
      const on = !!lit?.has(id)
      const hover = this.highlight?.edges.has(id) ? this.highlight.color : null
      const accent = on && flow ? COLOR_HEX[edgeStyle(flow, id).color] : hover
      entry.accent = accent
      entry.material.color.set(accent ?? entry.color)
      entry.material.linewidth = accent ? entry.width + 1.5 : entry.width
      const opacity = lit && !on ? DIMMED : 1
      entry.material.opacity = opacity
      entry.arrows.forEach((cone) => {
        const m = cone.material as MeshBasicMaterial
        m.color.set(accent ?? entry.color)
        m.opacity = opacity
      })
      if (entry.halo) {
        const halo = entry.halo.material as LineMaterial
        halo.color.set(accent ?? entry.color)
        halo.opacity = HALO[this.theme?.dark ? 'dark' : 'light'] * opacity
      }
    }
    this.invalidate()
  }

  private applyVisibility() {
    const layout = this.layout
    if (!layout) return
    const hiddenLevels = new Set(
      layout.planes.filter((p) => p.id && this.hidden.has(p.id)).map((p) => p.level),
    )
    this.planes.forEach((group, level) => (group.visible = !hiddenLevels.has(level)))

    const lit = this.spotlight ? this.runs.find((r) => r.flow.id === this.spotlight)?.plan.edges : null
    for (const entry of this.edges.values()) {
      const shown = !hiddenLevels.has(entry.stack.from) && !hiddenLevels.has(entry.stack.to)
      entry.line.visible = shown
      if (entry.halo) entry.halo.visible = shown && !entry.stack.route
      entry.arrows.forEach((a) => (a.visible = shown))
      if (entry.label) entry.label.visible = shown && this.labels && (!lit || lit.has(entry.stack.edge.id))
      for (const dash of entry.dashes) {
        dash.line.visible = shown && (!this.spotlight || this.spotlight === dash.flow)
      }
    }
    this.invalidate()
  }

  /* -------------------------------------------------------------- the loop */

  private tick = (now: number) => {
    this.frame = requestAnimationFrame(this.tick)
    if (!this.running) return
    const dt = Math.min(0.1, (now - this.last) / 1000)
    this.last = now

    const moving = this.controls.update(dt)
    const animating = !this.motion.paused && !this.motion.reduced && this.runs.length > 0
    this.clock += dt

    if (animating) {
      for (const run of this.runs) {
        const { duration } = run.plan
        if (duration <= 0) continue
        run.time += dt
        if (run.time > duration) run.time = run.flow.loop || run.plan.stream ? run.time % duration : duration
      }
      for (const entry of this.edges.values()) {
        for (const dash of entry.dashes) dash.material.dashOffset -= dash.speed * dt
      }
    }

    if (animating || this.dirty || moving || this.controls.autoRotate || this.landings.length) {
      // Lying down from straight above, standing up as the camera tilts away.
      this.setUpright(this.uprightForCamera())
      const scale = this.tokenScale()
      this.runs.forEach((run) => this.paintRun(run, scale))
      this.settleLandings()
      this.render()
    }
  }

  private render() {
    this.dirty = false
    this.sizeGizmo()
    this.renderer.render(this.scene, this.camera)
    this.reportOrientation()
  }

  /** Tells the axis navigator where the axes point now, when that has changed. */
  private reportOrientation() {
    const q = this.camera.quaternion
    const key = [q.x, q.y, q.z, q.w].map((v) => v.toFixed(3)).join()
    if (key === this.oriented) return
    this.oriented = key
    const inverse = q.clone().invert()
    const out = {} as Record<Axis, AxisOnScreen>
    for (const axis of AXES) {
      const v = AXIS_DIRECTION[axis].clone().applyQuaternion(inverse)
      out[axis] = { x: v.x, y: -v.y, z: v.z }
    }
    this.events.orient(out)
  }

  private invalidate = () => {
    this.dirty = true
  }

  private resize() {
    const width = Math.max(1, this.host.clientWidth)
    const height = Math.max(1, this.host.clientHeight)
    this.size = { width, height }
    this.renderer.setSize(width, height)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    for (const material of this.lineMaterials) material.resolution.set(width, height)
    this.invalidate()
  }

  /* -------------------------------------------------------------- pointer */

  private ndc(event: PointerEvent | MouseEvent): Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect()
    return new Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
  }

  /** The node under the pointer, skipping planes that are hidden. */
  pick(event: PointerEvent | MouseEvent): string | null {
    return this.pickHit(event)?.id ?? null
  }

  /** The node under the pointer, and the point on it the pointer is over. */
  private pickHit(event: PointerEvent | MouseEvent): { id: string; point: Vector3 } | null {
    this.raycaster.setFromCamera(this.ndc(event), this.camera)
    const targets: Object3D[] = []
    for (const entry of this.nodes.values()) {
      if (this.planes[entry.stack.level]?.visible) targets.push(...entry.pick)
    }
    const hit = this.raycaster.intersectObjects(targets, false)[0]
    const id = hit?.object.userData.node as string | undefined
    return id && hit ? { id, point: hit.point.clone() } : null
  }

  /** The gizmo handle under the pointer, if the gizmo is up. */
  private pickHandle(event: PointerEvent | MouseEvent): Handle | null {
    if (!this.gizmo.visible) return null
    this.raycaster.setFromCamera(this.ndc(event), this.camera)
    const hit = this.raycaster.intersectObjects(
      this.handles.map((h) => h.hit),
      false,
    )[0]
    return this.handles.find((h) => h.hit === hit?.object) ?? null
  }

  private trackPointer = (event: PointerEvent) => {
    this.pointer.set(event.clientX, event.clientY)
  }

  /**
   * A press, seen before the camera controls see it. On a gizmo handle it
   * starts a move along that handle at once; on a node that is already
   * selected it may become a move across the node's floor, or stay a click —
   * which only the pointer's next moves can tell. Anywhere else it is left to
   * orbit the camera, as before.
   */
  private onPress = (event: PointerEvent) => {
    if (this.transform || event.target !== this.renderer.domElement) return
    if (!this.editable || event.button !== 0) return
    this.pointer.set(event.clientX, event.clientY)

    const handle = this.pickHandle(event)
    if (handle) {
      event.stopPropagation()
      event.preventDefault()
      this.activeHandle = handle
      this.paintHandles()
      this.begin('gizmo', [...handle.constraint], this.pointer)
      return
    }

    const hit = this.pickHit(event)
    if (!hit || !this.movable().includes(hit.id)) return
    event.stopPropagation()
    this.press = {
      x: event.clientX,
      y: event.clientY,
      id: hit.id,
      additive: event.shiftKey || event.metaKey || event.ctrlKey,
      point: hit.point,
    }
    window.addEventListener('pointermove', this.onPressMove, true)
    window.addEventListener('pointerup', this.onPressUp, true)
  }

  private onPressMove = (event: PointerEvent) => {
    const press = this.press
    if (!press || Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG_SLOP) return
    this.endPress()
    // Across the floor, measured on the point that was grabbed, so the node
    // stays under the pointer the way it does when dragged on the canvas.
    this.begin('drag', ['x', 'y'], new Vector2(press.x, press.y), press.point)
    this.onModalMove(event)
  }

  /** A press that never moved far enough to be a move: a click, which selects. */
  private onPressUp = () => {
    const press = this.press
    this.endPress()
    if (press) this.events.select(press.id, press.additive)
  }

  private endPress() {
    this.press = null
    window.removeEventListener('pointermove', this.onPressMove, true)
    window.removeEventListener('pointerup', this.onPressUp, true)
  }

  private onPointerDown = (event: PointerEvent) => {
    this.down = { x: event.clientX, y: event.clientY, button: event.button }
  }

  private onPointerUp = (event: PointerEvent) => {
    const down = this.down
    this.down = null
    // A drag is the camera moving; only a press that stayed put is a click.
    if (!down || down.button !== 0 || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) {
      return
    }
    this.events.select(this.pick(event), event.shiftKey || event.metaKey || event.ctrlKey)
  }

  private onPointerMove = (event: PointerEvent) => {
    if (event.buttons || this.transform) return
    // Picked once per frame at most, however fast the pointer moves.
    const first = !this.pendingHover
    this.pendingHover = event
    if (!first) return
    requestAnimationFrame(() => {
      const latest = this.pendingHover
      this.pendingHover = null
      if (!latest || this.transform) return
      const handle = this.pickHandle(latest)
      if (handle !== this.hoveredHandle) {
        this.hoveredHandle = handle
        this.paintHandles()
      }
      const id = handle ? null : this.pick(latest)
      const rect = this.host.getBoundingClientRect()
      // A selected node can be dragged; say so before it is pressed.
      const cursor = handle || (id && this.editable && this.movable().includes(id)) ? 'move' : id ? 'pointer' : ''
      this.renderer.domElement.style.cursor = cursor
      if (id !== this.hovered) {
        this.hovered = id
        this.applyHover()
      }
      this.events.hover(id, id ? { x: latest.clientX - rect.left, y: latest.clientY - rect.top } : null)
    })
  }

  private onPointerLeave = () => {
    this.pendingHover = null
    if (this.hoveredHandle) {
      this.hoveredHandle = null
      this.paintHandles()
    }
    if (this.hovered) {
      this.hovered = null
      this.applyHover()
    }
    this.events.hover(null, null)
  }

  private onDoubleClick = (event: MouseEvent) => {
    const id = this.pick(event)
    if (id) this.focusNode(id)
    else this.frameAll()
  }

  /* ---------------------------------------------------------------- moving */

  /** Selected nodes that may be moved. A locked one is carried by its zone, never moved itself. */
  private movable(): string[] {
    return [...this.selection].filter((id) => {
      const node = this.nodes.get(id)?.stack.node
      return !!node && !node.locked
    })
  }

  /** The median of `ids`' top faces, in world space: where the gizmo stands. */
  private pivotOf(ids: string[]): Vector3 | null {
    const sum = new Vector3()
    let count = 0
    for (const id of ids) {
      const entry = this.nodes.get(id)
      if (!entry) continue
      const { box, level } = entry.stack
      sum.x += box.x + box.width / 2
      sum.y += this.planeY(level) + entry.base + entry.rise
      sum.z += box.y + box.height / 2
      count++
    }
    return count ? sum.divideScalar(count) : null
  }

  /**
   * `G`: the selection follows the pointer until a click or `Enter` puts it
   * down, or `Esc` or a right-click puts it back. Returns whether there was
   * anything to grab.
   */
  grab(): boolean {
    if (!this.editable || this.transform) return false
    return this.begin('grab', [], this.pointer)
  }

  private begin(kind: Transform['kind'], constraint: Axis[], at: Vector2, pivot?: Vector3): boolean {
    const ids = this.movable()
    const origin = pivot ?? this.pivotOf(ids)
    if (!ids.length || !origin) return false
    // Nothing to start from yet — the pointer has not been over the window —
    // so the move is measured from the pivot's own place on screen.
    const start = at.x < 0 ? this.toClient(origin) : at.clone()
    this.transform = {
      kind,
      ids,
      pivot: origin.clone(),
      facing: this.camera.getWorldDirection(new Vector3()).negate(),
      start,
      at: start.clone(),
      last: start.clone(),
      constraint,
      numeric: '',
      delta: { ...ZERO },
      precise: false,
      invertSnap: false,
    }
    window.addEventListener('pointermove', this.onModalMove, true)
    window.addEventListener('pointerdown', this.onModalDown, true)
    window.addEventListener('pointerup', this.onModalUp, true)
    window.addEventListener('keydown', this.onModalKey, true)
    window.addEventListener('keyup', this.onModalKeyUp, true)
    window.addEventListener('blur', this.onModalBlur)
    this.hovered = null
    this.applyHover()
    this.events.hover(null, null)
    this.renderer.domElement.style.cursor = 'move'
    this.drawGuides()
    this.report()
    return true
  }

  /** Where `point` is on screen, in client coordinates. */
  private toClient(point: Vector3): Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const p = point.clone().project(this.camera)
    return new Vector2(rect.left + ((p.x + 1) / 2) * rect.width, rect.top + ((1 - p.y) / 2) * rect.height)
  }

  /** Where a pointer at `client` meets the move's constraint, in world space. */
  private constraintHit(client: Vector2, t: Transform): Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new Vector2(
      ((client.x - rect.left) / rect.width) * 2 - 1,
      -((client.y - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(ndc, this.camera)
    return constraintPoint(this.raycaster.ray, t.pivot, t.constraint, t.facing)
  }

  /** Works the move out again from the pointer, or the typed distance, and shows it. */
  private update() {
    const t = this.transform
    if (!t) return
    if (t.numeric) {
      t.delta = numericDelta(t.numeric, t.constraint)
    } else {
      const from = this.constraintHit(t.start, t)
      const to = this.constraintHit(t.at, t)
      // Parallel to the constraint: keep the last good answer rather than fling it away.
      if (from && to) {
        const moved = fromWorld(to.sub(from))
        for (const axis of AXES) if (t.constraint.length && !t.constraint.includes(axis)) moved[axis] = 0
        t.delta = this.snapping.on !== t.invertSnap ? snapDelta(moved, this.snapping.size) : moved
      }
    }
    this.preview(t.ids, t.delta)
    this.report()
  }

  private report() {
    const t = this.transform
    this.events.transform(
      t && {
        kind: t.kind,
        delta: { ...t.delta },
        constraint: [...t.constraint],
        numeric: t.numeric || null,
        snapping: !t.numeric && this.snapping.on !== t.invertSnap,
        precise: t.precise,
        count: t.ids.length,
      },
    )
  }

  /** Puts the move down (`confirm`) and hands it over to be written, or puts everything back. */
  private end(confirm: boolean) {
    const t = this.transform
    if (!t) return
    this.stopModal()
    const moved = !!(t.delta.x || t.delta.y || t.delta.z)
    if (confirm && moved) this.events.move(t.ids, { ...t.delta })
    // Put back. A confirmed move stays as previewed until the document comes
    // back with it written, and the rebuild then draws exactly this.
    else this.preview(t.ids, ZERO)
    this.events.transform(null)
  }

  /** Drops a move without a word — the scene is about to be rebuilt anyway, or is going away. */
  private abortTransform(restore = false) {
    const t = this.transform
    if (!t) return
    this.stopModal()
    if (restore) this.preview(t.ids, ZERO)
    this.events.transform(null)
  }

  private stopModal() {
    this.transform = null
    this.activeHandle = null
    window.removeEventListener('pointermove', this.onModalMove, true)
    window.removeEventListener('pointerdown', this.onModalDown, true)
    window.removeEventListener('pointerup', this.onModalUp, true)
    window.removeEventListener('keydown', this.onModalKey, true)
    window.removeEventListener('keyup', this.onModalKeyUp, true)
    window.removeEventListener('blur', this.onModalBlur)
    this.renderer.domElement.style.cursor = ''
    this.clearGuides()
    this.paintHandles()
    this.placeGizmo()
  }

  private onModalMove = (event: PointerEvent) => {
    const t = this.transform
    if (!t) return
    // Advanced by how far the pointer went, a tenth as far while ⇧ is down —
    // so pressing or letting go of ⇧ never makes the selection jump.
    const scale = event.shiftKey ? PRECISION : 1
    t.at.x += (event.clientX - t.last.x) * scale
    t.at.y += (event.clientY - t.last.y) * scale
    t.last.set(event.clientX, event.clientY)
    t.precise = event.shiftKey
    t.invertSnap = event.ctrlKey || event.metaKey
    if (!t.numeric) this.update()
  }

  private onModalDown = (event: PointerEvent) => {
    const t = this.transform
    if (!t) return
    // Nothing else may see this press: not the camera, not the selection.
    event.preventDefault()
    event.stopPropagation()
    if (event.button === 2) this.end(false)
    else if (event.button === 0 && t.kind === 'grab') this.end(true)
  }

  private onModalUp = (event: PointerEvent) => {
    const t = this.transform
    if (!t || t.kind === 'grab' || event.button !== 0) return
    this.end(true)
  }

  private onModalBlur = () => this.end(false)

  /**
   * The keys of a move. Every key is taken while one is in progress, so none
   * of the editor's shortcuts fire underneath it — `Backspace` corrects a
   * typed distance here, it does not delete the selection.
   */
  private onModalKey = (event: KeyboardEvent) => {
    const t = this.transform
    if (!t) return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') return this.end(false)
    if (event.key === 'Enter') return this.end(true)
    if (event.key === 'Shift' || event.key === 'Control' || event.key === 'Meta') {
      t.precise = event.shiftKey
      t.invertSnap = event.ctrlKey || event.metaKey
      this.update()
      return
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return

    const axis = axisKey(event.key)
    if (axis) {
      t.constraint = constrain(t.constraint, axis, event.shiftKey)
      // An unconstrained move faces the camera as it is now, not as it was.
      t.facing = this.camera.getWorldDirection(new Vector3()).negate()
      this.drawGuides()
      this.update()
      return
    }
    const typed = typeNumber(t.numeric, event.key)
    if (typed !== null) {
      t.numeric = typed
      this.update()
    }
  }

  private onModalKeyUp = (event: KeyboardEvent) => {
    const t = this.transform
    if (!t) return
    event.stopPropagation()
    t.precise = event.shiftKey
    t.invertSnap = event.ctrlKey || event.metaKey
    this.update()
  }

  /**
   * Shows a move without writing it: the nodes it would place are put there,
   * and the connections at either end are laid again. Messages keep running on
   * the new lines. Nothing here touches the document.
   */
  private preview(ids: string[], delta: Position3D) {
    const doc = this.doc
    if (!doc) return
    const writes = moveInSpace(doc.nodes, ids, delta)
    const moved = writes.size
      ? { ...doc, nodes: doc.nodes.map((n) => (writes.has(n.id) ? { ...n, position3d: writes.get(n.id)! } : n)) }
      : doc
    this.applyPlacement(stackNodes(moved).nodes)
  }

  /** Moves every node whose place differs from what is drawn, and re-lays its connections. */
  private applyPlacement(placed: StackNode[]) {
    const changed = new Set<string>()
    for (const stack of placed) {
      const entry = this.nodes.get(stack.node.id)
      if (!entry) continue
      const was = entry.stack
      if (was.box.x === stack.box.x && was.box.y === stack.box.y && was.elevation === stack.elevation) continue
      entry.stack = { ...was, box: stack.box, elevation: stack.elevation }
      entry.base = was.depth * ZONE_FLOOR + stack.elevation
      entry.group.position.set(stack.box.x, entry.base, stack.box.y)
      changed.add(stack.node.id)
    }
    if (!changed.size) return

    const solids = [...this.nodes.values()].map((e) => e.stack).filter(isSolid)
    for (const entry of this.edges.values()) {
      const { edge } = entry.stack
      if (!changed.has(edge.source) && !changed.has(edge.target)) continue
      const source = this.nodes.get(edge.source)?.stack
      const target = this.nodes.get(edge.target)?.stack
      if (source && target) this.restackEdge(entry, stackEdge(edge, source, target, solids))
    }
    if (this.runs.length) this.replan()
    this.placeGizmo()
    this.invalidate()
  }

  /* ---------------------------------------------------------------- gizmo */

  /**
   * The move gizmo: an arrow per axis, a square per plane, and a ring in the
   * middle that moves along the screen. Drawn over everything and kept the same
   * size on screen however far away it is, so it is always there to grab.
   */
  private buildGizmo() {
    const material = (color: string) =>
      new MeshBasicMaterial({
        color,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: DoubleSide,
      })
    // Picked, never seen: a generous target around a thin shape.
    const target = () =>
      new MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false, colorWrite: false, side: DoubleSide })
    const up = new Vector3(0, 1, 0)
    const add = (mesh: Mesh) => {
      mesh.renderOrder = 1000
      this.gizmo.add(mesh)
      return mesh
    }

    for (const axis of AXES) {
      const dir = AXIS_DIRECTION[axis]
      const turn = new Quaternion().setFromUnitVectors(up, dir)
      const paint = material(AXIS_COLOR[axis])

      const shaft = new CylinderGeometry(0.016, 0.016, 0.64, 8)
      shaft.translate(0, 0.18 + 0.32, 0)
      const head = new ConeGeometry(0.06, 0.2, 16)
      head.translate(0, 0.9, 0)
      const reach = new CylinderGeometry(0.08, 0.08, 0.86, 8)
      reach.translate(0, 0.18 + 0.43, 0)
      for (const geometry of [shaft, head]) add(new Mesh(geometry, paint)).quaternion.copy(turn)
      const hit = add(new Mesh(reach, target()))
      hit.quaternion.copy(turn)
      this.handles.push({ constraint: [axis], hit, parts: [paint], color: new Color(AXIS_COLOR[axis]) })
    }

    // A plane is coloured as the axis it is square to, the way 3D editors do.
    for (const normal of AXES) {
      const [a, b] = AXES.filter((x) => x !== normal) as [Axis, Axis]
      const at = AXIS_DIRECTION[a].clone().add(AXIS_DIRECTION[b]).multiplyScalar(0.36)
      const turn = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), AXIS_DIRECTION[normal])
      const paint = material(AXIS_COLOR[normal])
      paint.opacity = 0.75
      const square = add(new Mesh(new PlaneGeometry(0.15, 0.15), paint))
      square.position.copy(at)
      square.quaternion.copy(turn)
      const hit = add(new Mesh(new PlaneGeometry(0.24, 0.24), target()))
      hit.position.copy(at)
      hit.quaternion.copy(turn)
      this.handles.push({ constraint: [a, b], hit, parts: [paint], color: new Color(AXIS_COLOR[normal]) })
    }

    // The middle: free, along the screen. Turned to face the camera every frame.
    const middle = material('#ffffff')
    const ring = add(new Mesh(new RingGeometry(0.085, 0.115, 32), middle))
    const hit = add(new Mesh(new CircleGeometry(0.15, 24), target()))
    ring.userData.billboard = hit.userData.billboard = true
    this.handles.push({ constraint: [], hit, parts: [middle], color: middle.color.clone() })
    this.gizmo.visible = false
  }

  /** Puts the gizmo on the selection, or away when there is nothing it could move. */
  private placeGizmo() {
    const ids = this.editable && this.gizmoOn ? this.movable() : []
    // A grab follows the pointer, not a handle; the gizmo would only be in the way.
    const pivot = this.transform?.kind === 'grab' ? null : this.pivotOf(ids)
    this.gizmo.visible = !!pivot
    if (pivot) this.gizmo.position.copy(pivot)
    this.invalidate()
  }

  /** The same size on screen at any distance, and its ring square to the camera. */
  private sizeGizmo() {
    if (!this.gizmo.visible) return
    const distance = this.camera.position.distanceTo(this.gizmo.position)
    const pixelsPerUnit = this.size.height / (2 * distance * Math.tan((FOV * Math.PI) / 360))
    this.gizmo.scale.setScalar(GIZMO_PX / Math.max(1e-6, pixelsPerUnit))
    for (const child of this.gizmo.children) {
      if (child.userData.billboard) child.quaternion.copy(this.camera.quaternion)
    }
  }

  /** Lights up the handle under the pointer, and the one being dragged. */
  private paintHandles() {
    const theme = this.theme
    for (const handle of this.handles) {
      const lit = handle === this.hoveredHandle || handle === this.activeHandle
      const base = handle.constraint.length === 0 && theme ? new Color(theme.ink) : handle.color
      for (const part of handle.parts) {
        part.color.copy(base)
        if (lit) part.color.lerp(new Color('#ffffff'), 0.55)
      }
    }
    this.invalidate()
  }

  /** The constraint's axes, drawn through where the move started — what it is locked to. */
  private drawGuides() {
    this.clearGuides()
    const t = this.transform
    if (!t || !t.constraint.length || t.constraint.length === 3) return
    const reach = 1e5
    for (const axis of t.constraint as Constraint) {
      const d = AXIS_DIRECTION[axis]
      const a = t.pivot.clone().addScaledVector(d, -reach)
      const b = t.pivot.clone().addScaledVector(d, reach)
      const geometry = new LineGeometry()
      geometry.setPositions([a.x, a.y, a.z, b.x, b.y, b.z])
      const material = new LineMaterial({
        color: new Color(AXIS_COLOR[axis]).getHex(),
        linewidth: 1.5,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
        depthWrite: false,
      })
      material.resolution.set(this.size.width, this.size.height)
      this.lineMaterials.add(material)
      const line = new Line2(geometry, material)
      line.renderOrder = 999
      this.guides.add(line)
      this.guideLines.push(line)
    }
    this.invalidate()
  }

  private clearGuides() {
    for (const line of this.guideLines) {
      this.guides.remove(line)
      line.geometry.dispose()
      this.lineMaterials.delete(line.material as LineMaterial)
      ;(line.material as LineMaterial).dispose()
    }
    this.guideLines = []
    this.invalidate()
  }

  /* -------------------------------------------------------------- helpers */

  private line(points: Vec3[], color: string, width: number, dash?: number[]) {
    const geometry = new LineGeometry()
    geometry.setPositions(flatten(points.length > 1 ? points : [...points, ...points]))
    const material = new LineMaterial({
      color: new Color(color).getHex(),
      linewidth: width,
      worldUnits: false,
      transparent: true,
      dashed: !!dash,
      dashSize: dash?.[0] ?? 1,
      gapSize: dash?.[1] ?? 0,
    })
    material.resolution.set(this.size.width, this.size.height)
    this.lineMaterials.add(material)
    const line = new Line2(geometry, material)
    if (dash) line.computeLineDistances()
    this.own(geometry, material)
    return { line, material }
  }

  /** Registers GPU resources to be freed with the scene they belong to. */
  private own(...items: { dispose(): void }[]) {
    this.disposables.push(...items)
  }

  private clear() {
    // A rebuild keeps the camera where it is; only the scene's own animations go.
    this.unfolding?.kill()
    this.unfolding = null
    for (const item of this.disposables) item.dispose()
    this.disposables = []
    for (const entry of this.nodes.values()) {
      if (entry.selection) {
        entry.selection.geometry.dispose()
        ;(entry.selection.material as LineMaterial).dispose()
      }
    }
    this.lineMaterials.clear()
    this.planes.forEach((group) => this.root.remove(group))
    this.planes = []
    this.cables.clear()
    for (const landing of this.landings) (landing.sprite.material as SpriteMaterial).dispose()
    this.landings = []
    this.tokens.clear()
    this.nodes.clear()
    this.edges.clear()
    this.runs = []
  }

  /**
   * The centre of the stack — or of just `ids` — and the radius of a sphere
   * around it.
   */
  private bounds(ids?: string[]): { center: Vector3; radius: number } {
    const layout = this.layout
    if (!layout) return { center: new Vector3(), radius: 500 }
    const entries = ids ? ids.map((id) => this.nodes.get(id)!).filter(Boolean) : [...this.nodes.values()]

    let x1 = Infinity
    let x2 = -Infinity
    let z1 = Infinity
    let z2 = -Infinity
    // The whole stack takes in every plate, however empty; a selection only itself.
    let y1 = ids ? Infinity : 0
    let y2 = ids ? -Infinity : this.planeY(layout.planes.length - 1)
    if (!ids) {
      const { footprint } = layout
      x1 = footprint.x
      x2 = footprint.x + footprint.width
      z1 = footprint.y
      z2 = footprint.y + footprint.height
    }
    for (const entry of entries) {
      const { box, level, height } = entry.stack
      const floor = this.planeY(level) + entry.base
      x1 = Math.min(x1, box.x)
      x2 = Math.max(x2, box.x + box.width)
      z1 = Math.min(z1, box.y)
      z2 = Math.max(z2, box.y + box.height)
      y1 = Math.min(y1, floor)
      y2 = Math.max(y2, floor + Math.max(entry.rise, height))
    }
    if (!Number.isFinite(x1) || !Number.isFinite(y1)) return { center: new Vector3(), radius: 500 }
    const center = new Vector3((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2)
    const radius = Math.hypot(x2 - x1, z2 - z1, y2 - y1) / 2
    return { center, radius }
  }

  private currentAngles(): { polar: number; azimuth: number } {
    return { polar: this.controls.getPolarAngle(), azimuth: this.controls.getAzimuthalAngle() }
  }

  /** Points the camera at `center` from `angles`, far enough back to fit `radius`. */
  private aim(
    center: Vector3,
    radius: number,
    angles: { polar: number; azimuth: number },
    animate: boolean,
    duration = 0.8,
  ) {
    // The narrower of the two fields of view decides how far back to stand.
    const vertical = (FOV * Math.PI) / 180
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * this.camera.aspect)
    const distance = (radius * FRAME_MARGIN) / Math.sin(Math.min(vertical, horizontal) / 2)
    this.fly(center, distance, angles, animate, duration)
  }

  /** Puts the camera `distance` from `center` at `angles`, flying there unless told not to. */
  private fly(
    center: Vector3,
    distance: number,
    angles: { polar: number; azimuth: number },
    animate: boolean,
    duration = 0.8,
  ) {
    this.flight?.kill()
    this.flight = null

    if (!animate || this.motion.reduced) {
      this.controls.target.copy(center)
      this.camera.position
        .setFromSphericalCoords(distance, angles.polar, angles.azimuth)
        .add(center)
      this.controls.update()
      this.controls.enabled = true
      this.invalidate()
      return
    }

    // Flown around the target rather than in a straight line: from straight
    // above to the side, a straight line would dive through the stack.
    const fromTarget = this.controls.target.clone()
    const from = new Spherical().setFromVector3(this.camera.position.clone().sub(fromTarget))
    let turn = angles.azimuth - from.theta
    if (turn > Math.PI) turn -= Math.PI * 2
    else if (turn < -Math.PI) turn += Math.PI * 2
    const state = { t: 0 }
    const at = new Spherical()
    this.controls.enabled = false
    this.flight = gsap.to(state, {
      t: 1,
      duration,
      ease: 'power2.inOut',
      onUpdate: () => {
        const t = state.t
        this.controls.target.lerpVectors(fromTarget, center, t)
        at.set(
          from.radius + (distance - from.radius) * t,
          from.phi + (angles.polar - from.phi) * t,
          from.theta + turn * t,
        )
        this.camera.position.setFromSpherical(at).add(this.controls.target)
        this.camera.lookAt(this.controls.target)
        this.invalidate()
      },
      onComplete: () => {
        this.flight = null
        this.controls.enabled = true
        this.controls.update()
      },
    })
  }
}
