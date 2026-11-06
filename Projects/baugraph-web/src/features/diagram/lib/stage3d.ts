import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  FrontSide,
  Group,
  MOUSE,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  NormalBlending,
  Object3D,
  PCFSoftShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  Scene,
  Shape,
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
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import gsap from 'gsap'
import type { DiagramDocument, DiagramNode, FlowToken, MessageFlow } from '@/model'
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
import type { StackEdge, StackLayout, StackNode, Track, Vec3 } from '@/features/diagram/lib/scene3d'
import {
  ZONE_FLOOR,
  anchor,
  arcPoints,
  pointOnTrack,
  solidKind,
  stackLayout,
  track,
} from '@/features/diagram/lib/scene3d'
import { buildSolid, flipWinding } from '@/features/diagram/lib/solids3d'

/**
 * The 3D view's renderer.
 *
 * Imperative three.js rather than a declarative wrapper, for the same reason the
 * 2D flow runtime writes straight to the DOM: messages are placed sixty times a
 * second, and a reactive layer has nothing to add to that. Vue owns the state —
 * which flow is in the spotlight, whether the turntable turns — and hands it
 * over through the setters below; the scene is rebuilt from the document
 * whenever the document changes, which for anything short of a huge diagram
 * costs less than a frame.
 *
 * Everything drawn comes from code the rest of the editor already trusts: node
 * faces are the SVG exporter's own rendering of the node, nodes stand exactly
 * where the canvas has them, and messages run on the same timing the 2D canvas
 * and the animated SVG export use.
 *
 * It is a view and nothing else: nothing here is moved, selected or edited. A
 * click on a node flies to it.
 */

export interface StageEvents {
  /** The pointer moved onto a node, or off every node. */
  hover(id: string | null, at: { x: number; y: number } | null): void
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
/**
 * Where the sun is, seen from the diagram: high, and over its back-left corner,
 * so every node's shadow falls short and soft to its front-right — on the side
 * the default view looks at — the way a light over a desk would cast it.
 */
const SUN = new Vector3(-0.5, 1.3, -0.35).normalize()

/** How thick the floor the diagram stands on is, and how round its edge. */
const SLAB = 10
const SLAB_ROUND = 3
/** Canvas-units per second at which a moving dash marches — matched to the 2D canvas. */
const DASH_PATTERN = 22
/** Seconds between the ghosts trailing a message. */
const TRAIL_STEP = 0.045
const TRAIL_LENGTH = 4
/** Opacity of everything a spotlight is not pointed at. */
const DIMMED = 0.12
/**
 * Smallest a message is ever drawn on screen, in pixels. Its size on the
 * diagram is a node's worth of detail, which from across the whole diagram is
 * a speck — and a message nobody can follow is not showing where it goes.
 */
const MIN_TOKEN_PX = 11
/** A message's own size, in canvas units. */
const TOKEN_SIZE = 10.4

const PRESETS: Record<CameraPreset, { polar: number; azimuth: number }> = {
  iso: { polar: (56 * Math.PI) / 180, azimuth: (-32 * Math.PI) / 180 },
  // Not quite zero: straight down has no "up", and the canvas's own up is wanted.
  top: { polar: 0.0001, azimuth: 0 },
  // From the canvas's bottom edge, a little above the floor: every node face on.
  front: { polar: (80 * Math.PI) / 180, azimuth: 0 },
}

/** Never below the floor: the diagram is read from above or from the side. */
const MAX_POLAR = Math.PI * 0.495

/** How long the ripple lasts where a message lands, in seconds. */
const LANDING_S = 0.6
/** How far into a hop counts as having arrived. */
const ARRIVED = 0.985

/** How far the pointer may travel between press and release and still be a click. */
const CLICK_SLOP = 5

/**
 * Dashed and dotted connections, drawn longer than on the canvas: an arch is
 * seen from further off than a line on the canvas at its usual zoom, and the
 * canvas's own pattern shrinks into a fizz there.
 */
const DASH_SCALE = 2


interface NodeEntry {
  stack: StackNode
  group: Group
  /** Pickable meshes. */
  pick: Mesh[]
  materials: { material: Material; opacity: number }[]
  /** Its lit surfaces, which glow faintly while the pointer is on it. */
  lit: MeshStandardMaterial[]
  /** Height of its base above the floor: the zone floors under it. */
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
}

interface EdgeEntry {
  stack: StackEdge
  line: Line2
  material: LineMaterial
  color: string
  width: number
  arrows: Mesh[]
  label: Sprite | null
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

  /**
   * A node's face. `content` asks for only what is written on it — icon, name,
   * caption — on a transparent ground, for a solid that is its own shape.
   */
  get(node: DiagramNode, theme: DiagramTheme, content = false): Promise<Texture | null> {
    const key = JSON.stringify([
      content,
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
    const texture = this.draw(node, theme, content)
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

  private async draw(node: DiagramNode, theme: DiagramTheme, content: boolean): Promise<Texture | null> {
    const { width, height } = node.size
    // Sharp enough to read close up, capped so a huge zone stays a sane texture.
    const scale = Math.min(3, 2048 / Math.max(width, height))
    try {
      const image = await svgImage(nodeFaceSvg(node, theme, { body: !content }))
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
 * Text that always faces the camera — connection labels, which have to be
 * readable from wherever the diagram is being looked at.
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
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }))
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
  // Shape space is the canvas, `y` down; mirrored so the node's top is up —
  // which turns it inside out, so its faces are turned back.
  geometry.scale(1, -1, 1)
  flipWinding(geometry)
  geometry.translate(0, height, 0)
  return geometry
}

/**
 * A soft shadow to lay under the floor, so the diagram reads as standing on a
 * slab that floats a little over the page: a rounded box `width` by `depth`,
 * blurred out by `blur`, drawn once into a texture.
 */
function softShadow(width: number, depth: number, blur: number): Texture {
  const scale = Math.min(1, 1024 / (Math.max(width, depth) + blur * 4))
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil((width + blur * 4) * scale)
  canvas.height = Math.ceil((depth + blur * 4) * scale)
  const ctx = canvas.getContext('2d')!
  // Drawn off the canvas with its shadow thrown back on: what is left is only
  // the blur, which a canvas filter would give too, where a browser has one.
  const away = canvas.width * 2
  ctx.shadowColor = 'rgba(0, 0, 0, 1)'
  ctx.shadowBlur = blur * scale
  ctx.shadowOffsetX = away
  ctx.fillStyle = '#000'
  ctx.beginPath()
  ctx.roundRect(blur * 2 * scale - away, blur * 2 * scale, width * scale, depth * scale, 28 * scale)
  ctx.fill()
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

/** No glow at all, for a node the pointer is not on. */
const NO_GLOW = new Color(0, 0, 0)

/** A ray straight down onto a node, to find its top; reused rather than allocated. */
const DOWN = new Vector3(0, -1, 0)
const DOWN_FROM = new Vector3()

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
  /** The studio light every lit surface reflects, soft from all round. */
  private environment: Texture
  /** The one light that casts shadows, kept over the whole diagram. */
  private sun = new DirectionalLight('#ffffff', 1.5)

  private root = new Group()
  /** The floor and every node standing on it. */
  private floor = new Group()
  private arcs = new Group()
  private tokens = new Group()

  private layout: StackLayout | null = null
  private theme: DiagramTheme | null = null
  private flows: MessageFlow[] = []
  private nodes = new Map<string, NodeEntry>()
  private edges = new Map<string, EdgeEntry>()
  private runs: RunEntry[] = []
  private lineMaterials = new Set<LineMaterial>()
  private disposables: { dispose(): void }[] = []

  /** Which way the camera looks from, about the vertical: every message turns its face to it. */
  private facing = 0
  /** Message faces, by look and colour; kept across rebuilds like the glows. */
  private tokenFaces = new Map<string, Texture>()
  /** Where messages have just landed, spreading out and fading. */
  private landings: { sprite: Sprite; born: number; size: number }[] = []
  private clock = 0
  private hovered: string | null = null
  private spotlight: string | null = null
  private highlight: { edges: Set<string>; color: string } | null = null
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
  private observer: ResizeObserver
  private down: { x: number; y: number; button: number } | null = null
  private pendingHover: PointerEvent | null = null

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

    // Lit, softly: a studio's light from all round, and a sun that casts soft
    // shadows — tone-mapped so a lit top never burns out to white, while what is
    // drawn unlit (faces, lines, messages) keeps exactly the theme's colours.
    this.renderer.toneMapping = NeutralToneMapping
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = PCFSoftShadowMap
    // Nothing that casts a shadow ever moves, so the shadows are drawn once a build.
    this.renderer.shadowMap.autoUpdate = false
    const pmrem = new PMREMGenerator(this.renderer)
    const room = new RoomEnvironment()
    this.environment = pmrem.fromScene(room, 0.04).texture
    room.dispose()
    pmrem.dispose()
    this.scene.environment = this.environment
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.8
    this.scene.add(this.sun, this.sun.target)

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

    this.scene.add(this.root)
    this.root.add(this.floor, this.arcs, this.tokens)

    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(host)
    this.resize()

    const el = this.renderer.domElement
    el.addEventListener('pointerdown', this.onPointerDown)
    el.addEventListener('pointerup', this.onPointerUp)
    el.addEventListener('pointermove', this.onPointerMove)
    el.addEventListener('pointerleave', this.onPointerLeave)
    el.addEventListener('dblclick', this.onDoubleClick)

    this.last = performance.now()
    this.frame = requestAnimationFrame(this.tick)
  }

  /* ------------------------------------------------------------- lifecycle */

  /** Rebuilds the scene from `doc`. The camera and the view's settings are kept. */
  setScene(doc: DiagramDocument, theme: DiagramTheme, flows: MessageFlow[]) {
    this.clear()
    this.theme = theme
    this.flows = flows
    this.layout = stackLayout(doc)
    this.renderer.setClearColor(theme.bg)
    // Less light on a dark theme, or its dark solids wash out to grey.
    this.scene.environmentIntensity = theme.dark ? 0.95 : 0.62
    this.sun.intensity = theme.dark ? 1.4 : 1.25
    this.textures.begin()

    this.buildFloor()
    for (const stack of this.layout.nodes) this.buildNode(stack)
    // Connections are laid onto the nodes' own surfaces, found where they stand.
    this.root.updateMatrixWorld(true)
    for (const stack of this.layout.edges) this.buildEdge(stack)
    this.buildFlows()
    this.textures.sweep()

    this.applyVisibility()
    this.applyEmphasis()
    this.applyHover()
    this.placeSun()

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
    const el = this.renderer.domElement
    el.removeEventListener('pointerdown', this.onPointerDown)
    el.removeEventListener('pointerup', this.onPointerUp)
    el.removeEventListener('pointermove', this.onPointerMove)
    el.removeEventListener('pointerleave', this.onPointerLeave)
    el.removeEventListener('dblclick', this.onDoubleClick)
    this.controls.dispose()
    this.clear()
    this.textures.dispose()
    this.glows.forEach((t) => t.dispose())
    this.tokenFaces.forEach((t) => t.dispose())
    this.environment.dispose()
    this.sun.shadow.dispose()
    this.renderer.dispose()
    el.remove()
  }

  /* --------------------------------------------------------------- setters */

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

  /** Sends the camera to a preset angle around the whole diagram. */
  view(preset: CameraPreset, animate = true) {
    this.frameBox(PRESETS[preset], animate)
  }

  /** Re-frames the whole diagram from wherever the camera is looking from. */
  frameAll(animate = true) {
    this.frameBox(this.currentAngles(), animate)
  }

  /** Moves the camera in or out along its line of sight. */
  zoomBy(factor: number) {
    const distance = this.camera.position.distanceTo(this.controls.target)
    const next = Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, distance * factor))
    this.fly(this.controls.target.clone(), next, this.currentAngles(), true, 0.3)
  }

  /** Flies to one node, keeping the current angle — with room around it for what it is joined to. */
  focusNode(id: string) {
    const entry = this.nodes.get(id)
    if (!entry) return
    const { box } = entry.stack
    const center = new Vector3(box.x + box.width / 2, entry.base + entry.rise / 2, box.y + box.height / 2)
    this.aim(center, Math.max(box.width, box.height, 120) * 1.6, this.currentAngles(), true)
  }

  /**
   * The opening move: the diagram from straight above, the way the canvas shows
   * it, tilts away into the angled view. Says what the 3D view is in a second.
   */
  intro() {
    if (this.motion.reduced || !this.layout) return
    this.frameBox(PRESETS.top, false)
    this.frameBox(PRESETS.iso, true, 1.3)
  }

  /** The current frame, as a PNG. */
  snapshot(): Promise<Blob | null> {
    this.render()
    return new Promise<Blob | null>((resolve) => this.renderer.domElement.toBlob(resolve, 'image/png'))
  }

  /* ------------------------------------------------------------- the scene */

  /**
   * The floor the diagram stands on: a slab under all of it, its edge rounded,
   * floating a little over the page on a soft shadow of its own — and taking the
   * shadows of everything standing on it.
   */
  private buildFloor() {
    const theme = this.theme!
    const { x, y, width: w, height: h } = this.layout!.footprint
    const r = 28
    const outline = new Shape()
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

    const extruded = new ExtrudeGeometry(outline, {
      depth: SLAB - SLAB_ROUND * 2,
      bevelEnabled: true,
      bevelThickness: SLAB_ROUND,
      bevelSize: SLAB_ROUND,
      bevelOffset: -SLAB_ROUND,
      bevelSegments: 3,
      curveSegments: 12,
    })
    // Laid flat, the canvas's `y` along the world's `z`, and hung down from its
    // top, which sits just under the zones and nodes on it.
    extruded.rotateX(Math.PI / 2)
    extruded.translate(0, -SLAB_ROUND - 0.6, 0)
    const slabGeometry = toCreasedNormals(extruded, Math.PI / 4)
    if (slabGeometry !== extruded) extruded.dispose()
    const slabMaterial = new MeshStandardMaterial({
      color: mix(COLOR_HEX.slate, theme.bg, theme.dark ? 0.72 : 0.95),
      roughness: 0.95,
      metalness: 0,
    })
    const slab = new Mesh(slabGeometry, slabMaterial)
    slab.receiveShadow = true
    this.own(slabGeometry, slabMaterial)
    this.floor.add(slab)

    // Its own shadow on the page below, offset a touch the way the sun throws it.
    const blur = 42
    const shadowTexture = softShadow(w, h, blur)
    const shadowGeometry = new PlaneGeometry(w + blur * 4, h + blur * 4)
    shadowGeometry.rotateX(-Math.PI / 2)
    // The texture is the shadow itself, black where it falls and clear elsewhere.
    const shadowMaterial = new MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      opacity: theme.dark ? 0.55 : 0.2,
      depthWrite: false,
      toneMapped: false,
    })
    const shadow = new Mesh(shadowGeometry, shadowMaterial)
    shadow.position.set(x + w / 2 + 14, -SLAB - 18, y + h / 2 + 12)
    shadow.renderOrder = -10
    this.own(shadowTexture, shadowGeometry, shadowMaterial)
    this.floor.add(shadow)
  }

  private buildNode(stack: StackNode) {
    const theme = this.theme!
    const { node, box, depth } = stack
    const paint = nodePaint(node, theme)
    const group = new Group()
    const base = depth * ZONE_FLOOR
    group.position.set(box.x, base, box.y)

    const entry: NodeEntry = {
      stack,
      group,
      pick: [],
      materials: [],
      lit: [],
      base,
      rise: 0,
      body: null,
      post: null,
    }
    const keep = (material: Material, opacity = 1) => {
      material.transparent = true
      material.opacity = opacity
      entry.materials.push({ material, opacity })
      this.own(material)
    }

    const shapes = silhouette(node)
    const { width: w, height: h } = node.size
    const isZone = node.kind === 'zone'
    const isText = node.kind === 'annotation' || node.shape === 'text'
    // A standing node is a solid of its own shape, so only what is written on
    // it is laid on its front; a note stays a sheet with its corner turned
    // down, drawn, and a flat node lies as the canvas draws it.
    const asSolid = stack.standing && !isText && node.shape !== 'note'
    // Its colour, a touch deeper than its pale fill on the canvas: lit, a pale
    // solid would wash into the floor it stands on.
    const tone = mix(paint.fill, paint.stroke, theme.dark ? 0.3 : 0.26)

    /** A surface the light falls on, matte, in `color`. */
    const surfaceOf = (color: string, roughness = 0.72) => {
      const material = new MeshStandardMaterial({ color, roughness, metalness: 0, side: FrontSide })
      keep(material)
      entry.lit.push(material)
      return material
    }

    /** A solid of the node's, lit, casting its shadow and taking its neighbours'. */
    const solid = (geometry: BufferGeometry, parent: Object3D, color: string = tone) => {
      const mesh = new Mesh(geometry, surfaceOf(color))
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.userData.node = node.id
      entry.pick.push(mesh)
      parent.add(mesh)
      this.own(geometry)
      return mesh
    }

    // The face: the node exactly as the exporter draws it — or, on a solid or
    // a zone, only what is written on it, laid over its front or its floor.
    // Drawn unlit, so its text and icon keep exactly the theme's colours.
    const content = asSolid || isZone
    const faceGeometry: BufferGeometry = new PlaneGeometry(w, h)
    const faceMaterial = new MeshBasicMaterial({
      color: isText ? theme.bg : paint.fill,
      side: DoubleSide,
      toneMapped: false,
      // A circle or a diamond leaves the corners of its face empty; without this
      // those empty corners would still hide whatever runs underneath them.
      alphaTest: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    // Nothing to show of a text annotation, or of what is written on a solid
    // or a zone, until the text itself has been drawn.
    keep(faceMaterial, isText || content ? 0 : 1)
    const face = new Mesh(faceGeometry, faceMaterial)
    face.userData.node = node.id
    face.renderOrder = isZone ? 1 : 2
    entry.pick.push(face)
    this.own(faceGeometry)

    if (isZone) {
      // A zone is a tray with glass walls: it encloses what it holds without
      // hiding it, and takes the shadows of what stands in it.
      if (shapes.length) {
        const floor = new Mesh(extrude(shapes, ZONE_FLOOR), surfaceOf(paint.fill, 0.9))
        floor.receiveShadow = true
        floor.userData.node = node.id
        entry.pick.push(floor)
        group.add(floor)
        this.own(floor.geometry)
      }
      if (stack.height > 0 && shapes.length) {
        const rim = shapes[0]!.getPoints(10)
        const ring = new Shape(rim.map((p) => p.clone()))
        const inset = 1.4
        const cx = w / 2
        const cy = h / 2
        const shrunk = rim.map(
          (p) => new Vector2(cx + (p.x - cx) * (1 - (inset * 2) / w), cy + (p.y - cy) * (1 - (inset * 2) / h)),
        )
        ring.holes.push(new Shape(shrunk))
        const geometry = extrude([ring], stack.height)
        geometry.translate(0, ZONE_FLOOR, 0)
        const material = new MeshStandardMaterial({
          color: mix(paint.accent, theme.bg, 0.4),
          roughness: 0.15,
          metalness: 0,
          depthWrite: false,
          side: DoubleSide,
        })
        keep(material, theme.dark ? 0.3 : 0.24)
        group.add(new Mesh(geometry, material))
        this.own(geometry)
      }
      faceGeometry.rotateX(-Math.PI / 2)
      faceGeometry.translate(w / 2, ZONE_FLOOR + 0.25, h / 2)
      group.add(face)
      entry.rise = ZONE_FLOOR
    } else {
      // Everything else is built standing, facing the front, and laid on its
      // back by `pose` if it is set to lie flat.
      const body = new Group()
      entry.body = body
      group.add(body)
      const depth = stack.thickness
      if (asSolid) {
        const built = buildSolid(solidKind(node.shape), shapes, w, h, depth, node.shape === 'round')
        solid(built.body, body)
        for (const trim of built.trim) {
          const band = new Mesh(trim, surfaceOf(mix(tone, paint.stroke, 0.55), 0.45))
          band.castShadow = true
          body.add(band)
          this.own(trim)
        }
        face.geometry = built.label
        faceGeometry.dispose()
        this.own(built.label)
      } else {
        if (!isText && depth > 0 && shapes.length) solid(extrudeUpright(shapes, h, depth), body, paint.fill)
        faceGeometry.translate(w / 2, h / 2, depth + 0.25)
      }
      body.add(face)

      // A slim column under a node that stands higher than the rest, so it is
      // held up rather than floating, in a deeper shade of its colour.
      if (stack.stand > 0) {
        const radius = Math.min(9, Math.max(4, w * 0.05))
        const geometry = new CylinderGeometry(radius, radius, stack.stand, 32)
        geometry.translate(0, stack.stand / 2, 0)
        const post = solid(geometry, group, mix(tone, paint.stroke, 0.35))
        post.position.set(w / 2, 0, h / 2)
        entry.post = post
      }
      this.pose(entry)
    }

    void this.textures.get(node, theme, content).then((texture) => {
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
    this.floor.add(group)
  }

  /**
   * Puts a node's body where it stands, and stays there whichever way the
   * camera turns. Standing, it stands across the middle of its box, facing the
   * front, on its post if it has one; a node set to lie *flat* lies on its back
   * over its box, the way the canvas draws it.
   */
  private pose(entry: NodeEntry) {
    const body = entry.body
    if (!body) return
    const { stack } = entry
    const h = stack.node.size.height
    const depth = stack.thickness
    if (stack.standing) {
      body.position.set(0, stack.stand, h / 2 - depth / 2)
      entry.rise = Math.max(stack.height, depth)
    } else {
      body.rotation.x = -Math.PI / 2
      body.position.set(0, 0, h)
      entry.rise = depth + 0.25
    }
  }

  private buildEdge(stack: StackEdge) {
    const theme = this.theme!
    const { edge } = stack
    const color = edgeColor(edge.color, theme)
    const stroke = edgeStrokeWidth(edge.width)
    const width = (stroke / EDGE_PX.regular) * 2
    const dash = dashArray(edge.line, stroke)
      ?.split(' ')
      .map((n) => Number(n) * DASH_SCALE)

    const points = this.arcFor(stack)
    const { line, material } = this.line(points, color, width, dash)
    this.arcs.add(line)

    const entry: EdgeEntry = {
      stack,
      line,
      material,
      color,
      width,
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
      const coneMaterial = new MeshBasicMaterial({ color, transparent: true, toneMapped: false })
      this.own(geometry, coneMaterial)
      const cone = new Mesh(geometry, coneMaterial)
      this.arcs.add(cone)
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
      this.arcs.add(label)
      entry.label = label
    }

    this.edges.set(edge.id, entry)
    this.placeEdgeDecorations(entry)
  }

  /**
   * The one point every connection of a node's meets it: the middle of its
   * top, found on the solid itself — so it sits on a drum's lid, on the crown
   * of a ball or a tube, on the peak of a diamond. A zone's is on top of its
   * back wall.
   */
  private hubOf(entry: NodeEntry): Vec3 {
    const { stack } = entry
    const at = anchor(stack)
    if (stack.node.kind === 'zone') return { x: at.x, y: entry.base + ZONE_FLOOR + stack.height, z: at.y }
    this.raycaster.set(DOWN_FROM.set(at.x, 1e5, at.y), DOWN)
    const hit = this.raycaster.intersectObjects(entry.pick, false)[0]
    return { x: at.x, y: hit ? hit.point.y : entry.base + entry.rise, z: at.y }
  }

  /** A connection's arch: out of the top of its source and into the top of its target. */
  private arcFor(stack: StackEdge): Vec3[] {
    const s = this.nodes.get(stack.edge.source)!
    const t = this.nodes.get(stack.edge.target)!
    return arcPoints(this.hubOf(s), this.hubOf(t), stack.bow)
  }

  /** Arrowheads, along the arch into the top they land on, and the label at the top of the arch. */
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
          this.arcs.add(overlay.line)
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
      toneMapped: false,
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
   * side, standing upright and turned to whoever is looking.
   */
  private tokenHead(look: FlowToken): TokenHead {
    const material = () => {
      const m = new MeshBasicMaterial({ color: '#ffffff', transparent: true, toneMapped: false })
      this.own(m)
      return m
    }
    let mesh: Mesh
    let materials: MeshBasicMaterial[]
    if (look === 'envelope') {
      // A letter standing on its long edge, its front to the viewer.
      const geometry = new BoxGeometry(15, 11, 2.6)
      const [edge, front, back] = [material(), material(), material()]
      materials = [edge, front, back]
      mesh = new Mesh(geometry, [edge, edge, edge, edge, front, back])
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

  /** Where a message is on its connection; `null` when there is no such connection. */
  private sample(edge: string, progress: number, out: Vec3): Vec3 | null {
    const entry = this.edges.get(edge)
    if (!entry) return null
    return pointOnTrack(entry.track, progress, out)
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
      // One message parked at the top of each arc: still says which lines carry
      // it, without moving anything.
      const shown = new Set<string>()
      for (const token of run.tokens) {
        const hop = run.plan.branches[token.branch]?.hops.find((h) => !shown.has(h.edge))
        const at = token.index === 0 && hop ? this.sample(hop.edge, 0.5, scratch) : null
        if (hop && at) shown.add(hop.edge)
        this.placeToken(token, visible ? at : null, 1, hop?.edge ?? null, run.flow)
        token.trail.forEach((t) => (t.visible = false))
      }
      return
    }

    for (const token of run.tokens) {
      const branch = run.plan.branches[token.branch]
      const time = run.time + token.index * run.plan.offset
      const position = branch ? tokenAt(branch, time) : null
      const at = position ? this.sample(position.edge, position.progress, scratch) : null
      this.placeToken(token, visible ? at : null, position?.opacity ?? 0, position?.edge ?? null, run.flow)
      if (visible) this.watchLanding(token, position?.edge ?? null, position?.progress ?? 0)

      token.trail.forEach((ghost, i) => {
        const back = branch ? tokenAt(branch, time - (i + 1) * TRAIL_STEP) : null
        const where = back && visible ? this.sample(back.edge, back.progress, scratch) : null
        ghost.visible = !!where
        if (where) ghost.position.set(where.x, where.y, where.z)
      })
    }
  }

  private placeToken(token: TokenEntry, at: Vec3 | null, opacity: number, edge: string | null, flow: MessageFlow) {
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
    // Upright, like the canvas's glyph, and turned to whoever is looking: a
    // letter or a parcel reads from any side and never tips over on a slope.
    head.rotation.set(0, this.facing, 0)
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

  /** A ripple of colour spreading out on top of the node a message reached. */
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
      toneMapped: false,
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

  /** Picks out the node under the pointer with a faint glow — a click on it flies there. */
  private applyHover() {
    const theme = this.theme
    if (!theme) return
    const glow = new Color(theme.selection)
    for (const [id, entry] of this.nodes) {
      const on = id === this.hovered
      for (const material of entry.lit) {
        material.emissive.copy(on ? glow : NO_GLOW)
        material.emissiveIntensity = on ? 0.22 : 0
      }
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
    }
    this.invalidate()
  }

  private applyVisibility() {
    const lit = this.spotlight ? this.runs.find((r) => r.flow.id === this.spotlight)?.plan.edges : null
    for (const entry of this.edges.values()) {
      if (entry.label) entry.label.visible = this.labels && (!lit || lit.has(entry.stack.edge.id))
      for (const dash of entry.dashes) dash.line.visible = !this.spotlight || this.spotlight === dash.flow
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
      this.facing = this.controls.getAzimuthalAngle()
      const scale = this.tokenScale()
      this.runs.forEach((run) => this.paintRun(run, scale))
      this.settleLandings()
      this.render()
    }
  }

  private render() {
    this.dirty = false
    this.renderer.render(this.scene, this.camera)
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

  /** The node under the pointer. */
  pick(event: PointerEvent | MouseEvent): string | null {
    this.raycaster.setFromCamera(this.ndc(event), this.camera)
    const targets: Object3D[] = []
    for (const entry of this.nodes.values()) targets.push(...entry.pick)
    const hit = this.raycaster.intersectObjects(targets, false)[0]
    return (hit?.object.userData.node as string | undefined) ?? null
  }

  private onPointerDown = (event: PointerEvent) => {
    this.down = { x: event.clientX, y: event.clientY, button: event.button }
  }

  /** A click on a node flies to it. A drag is the camera moving; only a press that stayed put is a click. */
  private onPointerUp = (event: PointerEvent) => {
    const down = this.down
    this.down = null
    if (!down || down.button !== 0 || Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_SLOP) {
      return
    }
    const id = this.pick(event)
    if (id) this.focusNode(id)
  }

  private onPointerMove = (event: PointerEvent) => {
    if (event.buttons) return
    // Picked once per frame at most, however fast the pointer moves.
    const first = !this.pendingHover
    this.pendingHover = event
    if (!first) return
    requestAnimationFrame(() => {
      const latest = this.pendingHover
      this.pendingHover = null
      if (!latest) return
      const id = this.pick(latest)
      const rect = this.host.getBoundingClientRect()
      this.renderer.domElement.style.cursor = id ? 'pointer' : ''
      if (id !== this.hovered) {
        this.hovered = id
        this.applyHover()
      }
      this.events.hover(id, id ? { x: latest.clientX - rect.left, y: latest.clientY - rect.top } : null)
    })
  }

  private onPointerLeave = () => {
    this.pendingHover = null
    if (this.hovered) {
      this.hovered = null
      this.applyHover()
    }
    this.events.hover(null, null)
  }

  /** Double-click empty space to see everything again; a node has already been flown to by the click. */
  private onDoubleClick = (event: MouseEvent) => {
    if (!this.pick(event)) this.frameAll()
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
      toneMapped: false,
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
    for (const item of this.disposables) item.dispose()
    this.disposables = []
    this.lineMaterials.clear()
    this.floor.clear()
    this.arcs.clear()
    for (const landing of this.landings) (landing.sprite.material as SpriteMaterial).dispose()
    this.landings = []
    this.tokens.clear()
    this.nodes.clear()
    this.edges.clear()
    this.runs = []
  }

  /**
   * Puts the sun over the diagram and fits its shadows to it — as tight as the
   * floor allows, so they stay soft-edged rather than blocky — and has them
   * drawn again, once, for this build.
   */
  private placeSun() {
    const { center, half } = this.bounds()
    const reach = Math.hypot(half.x, half.z) + 40
    this.sun.target.position.set(center.x, 0, center.z)
    this.sun.position.copy(this.sun.target.position).addScaledVector(SUN, reach * 2)
    const camera = this.sun.shadow.camera
    camera.left = -reach
    camera.right = reach
    camera.top = reach
    camera.bottom = -reach
    camera.near = reach * 0.25
    camera.far = reach * 4
    camera.updateProjectionMatrix()
    this.sun.updateMatrixWorld()
    this.sun.target.updateMatrixWorld()
    this.renderer.shadowMap.needsUpdate = true
  }

  /** The box around the whole diagram — its floor, its nodes and the arcs over them: its centre and half its size. */
  private bounds(): { center: Vector3; half: Vector3 } {
    const layout = this.layout
    if (!layout) return { center: new Vector3(), half: new Vector3(300, 50, 200) }
    const { footprint } = layout
    let top = 0
    for (const entry of this.nodes.values()) top = Math.max(top, entry.base + Math.max(entry.rise, entry.stack.height))
    for (const entry of this.edges.values()) for (const p of entry.track.points) top = Math.max(top, p.y)
    const half = new Vector3(footprint.width / 2, top / 2, footprint.height / 2)
    return { center: new Vector3(footprint.x + half.x, half.y, footprint.y + half.z), half }
  }

  /**
   * Frames the whole diagram from `angles`: as close as the camera can stand
   * with every corner of the box around it still in view. Tighter than fitting
   * a sphere round it, which from an angle leaves the diagram small in a sea
   * of empty floor.
   */
  private frameBox(angles: { polar: number; azimuth: number }, animate: boolean, duration = 0.8) {
    const { center, half } = this.bounds()
    // The camera's own axes at those angles: `back` points from the centre to it.
    const back = new Vector3().setFromSphericalCoords(1, angles.polar, angles.azimuth)
    const right = new Vector3(0, 1, 0).cross(back).normalize()
    const up = back.clone().cross(right)
    const vertical = Math.tan((FOV * Math.PI) / 360)
    const horizontal = vertical * this.camera.aspect
    let distance = this.controls.minDistance
    const corner = new Vector3()
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          corner.set(half.x * sx, half.y * sy, half.z * sz)
          const toward = corner.dot(back)
          distance = Math.max(
            distance,
            toward + (Math.abs(corner.dot(right)) * FRAME_MARGIN) / horizontal,
            toward + (Math.abs(corner.dot(up)) * FRAME_MARGIN) / vertical,
          )
        }
      }
    }
    this.fly(center, distance, angles, animate, duration)
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
    // above to the side, a straight line would dive through the diagram.
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
