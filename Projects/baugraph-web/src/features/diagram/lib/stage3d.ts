import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  DoubleSide,
  EdgesGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Raycaster,
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
import type { DiagramDocument, DiagramNode, MessageFlow } from '@/model'
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
  cablePoints,
  onPlane,
  pointOnTrack,
  stackLayout,
  track,
} from '@/features/diagram/lib/scene3d'

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
 * animated SVG export use. The 3D view adds height and nothing else.
 */

export interface StageEvents {
  /** A node was clicked — `null` for empty space. */
  select(id: string | null, additive: boolean): void
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
  /** Height of its top surface above its plane. */
  top: number
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

interface TokenEntry {
  branch: number
  index: number
  head: Mesh
  material: MeshBasicMaterial
  glow: Sprite
  trail: Sprite[]
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
    // Never below the ground plane: the stack is read from above or from the side.
    this.controls.maxPolarAngle = Math.PI * 0.495
    this.controls.minDistance = 40
    this.controls.maxDistance = 60000
    this.controls.autoRotateSpeed = 0.7
    this.controls.addEventListener('change', this.invalidate)

    this.scene.add(this.root)
    this.root.add(this.cables, this.tokens)

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

  /** Rebuilds the scene from `doc`. Camera, selection and view state are kept. */
  setScene(doc: DiagramDocument, theme: DiagramTheme, flows: MessageFlow[]) {
    this.clear()
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
    const y = this.planeY(entry.stack.level) + entry.top / 2
    const center = new Vector3(box.x + box.width / 2, y, box.y + box.height / 2)
    this.aim(center, Math.max(box.width, box.height) * 1.6, this.currentAngles(), true)
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

  /** The current frame, as a PNG. */
  snapshot(): Promise<Blob | null> {
    this.render()
    return new Promise((resolve) => this.renderer.domElement.toBlob(resolve, 'image/png'))
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
    const base = depth * ZONE_FLOOR
    group.position.set(box.x, base, box.y)

    const entry: NodeEntry = {
      stack,
      group,
      pick: [],
      materials: [],
      outline: null,
      outlineColor: new Color(mix(paint.stroke, theme.ink, theme.dark ? 0.1 : 0.2)),
      ring: [],
      top: base,
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

    // The block, or a zone's floor — a text annotation is only its face.
    const bodyHeight = isZone ? ZONE_FLOOR : stack.height
    if (!isText && bodyHeight > 0 && shapes.length) {
      const geometry = extrude(shapes, bodyHeight)
      const sides = new Color(isZone ? paint.fill : mix(paint.stroke, paint.fill, 0.25))
      shade(geometry, sides)
      const material = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide })
      keep(material)
      const body = new Mesh(geometry, material)
      body.userData.node = node.id
      entry.pick.push(body)
      group.add(body)

      const edgesGeometry = new EdgesGeometry(geometry, 28)
      const outline = new LineBasicMaterial({ color: entry.outlineColor })
      keep(outline)
      entry.outline = outline
      group.add(new LineSegments(edgesGeometry, outline))
      this.own(geometry, edgesGeometry)
    }

    // A zone's glass walls: they enclose what the zone holds without hiding it.
    if (isZone && stack.height > 0 && shapes.length) {
      const ring = new Shape(entry.ring.map((p) => p.clone()))
      const inset = 1.4
      const cx = node.size.width / 2
      const cy = node.size.height / 2
      const shrunk = entry.ring.map(
        (p) =>
          new Vector2(
            cx + (p.x - cx) * (1 - (inset * 2) / node.size.width),
            cy + (p.y - cy) * (1 - (inset * 2) / node.size.height),
          ),
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

    // The face: the node exactly as the exporter draws it, laid on top.
    const top = isZone ? ZONE_FLOOR : isText ? 2 : stack.height
    entry.top = base + top
    const faceGeometry = new PlaneGeometry(node.size.width, node.size.height)
    faceGeometry.rotateX(-Math.PI / 2)
    faceGeometry.translate(node.size.width / 2, top + 0.25, node.size.height / 2)
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
    group.add(face)
    this.own(faceGeometry)

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

  /** An in-plane route, at the height it runs, in its plane's own space. */
  private routePoints(stack: StackEdge): Vec3[] {
    const s = this.nodes.get(stack.edge.source)!.stack
    const t = this.nodes.get(stack.edge.target)!.stack
    const floor = Math.max(s.depth, t.depth) * ZONE_FLOOR
    return stack.route!.map((p) => onPlane(p, floor + stack.lift))
  }

  /** A cable between planes, in world space, at the planes' current heights. */
  private cable(stack: StackEdge): Vec3[] {
    const s = this.nodes.get(stack.edge.source)!
    const t = this.nodes.get(stack.edge.target)!
    const up = stack.to > stack.from
    const centre = (e: NodeEntry, top: boolean): Vec3 => ({
      x: e.stack.box.x + e.stack.box.width / 2,
      y: this.planeY(e.stack.level) + (top ? e.top : e.stack.depth * ZONE_FLOOR),
      z: e.stack.box.y + e.stack.box.height / 2,
    })
    return cablePoints(centre(s, up), centre(t, !up))
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
      if (entry.stack.route) continue
      const points = this.cable(entry.stack)
      const positions = flatten(points)
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
    // A cable's length is part of a message's timing, so the plans follow it.
    if (this.runs.length) this.replan()
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

  /** One message: a solid head with a glow, and a short trail of ghosts behind it. */
  private token(flow: MessageFlow, branch: number, index: number, theme: DiagramTheme): TokenEntry {
    // The first hop's look stands for the message; hops that differ recolour it as it goes.
    const look = edgeStyle(flow, flow.edges[0] ?? '')
    const color = COLOR_HEX[look.color]
    const geometry =
      look.token === 'packet'
        ? new BoxGeometry(9, 9, 9)
        : look.token === 'envelope'
          ? new BoxGeometry(15, 3.5, 11)
          : new SphereGeometry(5.2, 18, 12)
    const material = new MeshBasicMaterial({ color, transparent: true })
    this.own(geometry, material)
    const head = new Mesh(geometry, material)
    head.renderOrder = 8

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

    head.visible = glow.visible = false
    trail.forEach((t) => (t.visible = false))
    this.tokens.add(head, glow, ...trail)
    return { branch, index, head, material, glow, trail }
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
      token.head.scale.setScalar(scale)
      token.glow.scale.setScalar(token.glow.userData.size * scale)
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
    flow: MessageFlow,
  ) {
    token.head.visible = token.glow.visible = !!at
    if (!at) return
    token.head.position.set(at.x, at.y, at.z)
    token.glow.position.set(at.x, at.y, at.z)
    token.material.opacity = opacity
    ;(token.glow.material as SpriteMaterial).opacity = opacity * (this.theme?.dark ? 0.9 : 0.55)
    if (edge) token.material.color.set(COLOR_HEX[edgeStyle(flow, edge).color])
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
        const ring = this.line(
          [...entry.ring, entry.ring[0]!].map((p) => ({ x: p.x, y: entry.top - entry.stack.depth * ZONE_FLOOR + 0.6, z: p.y })),
          theme.selection,
          3,
        )
        ring.line.renderOrder = 9
        entry.group.add(ring.line)
        entry.selection = ring.line
      } else if (!selected && entry.selection) {
        entry.group.remove(entry.selection)
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
      if (entry.halo) entry.halo.visible = shown
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

    if (animating || this.dirty || moving || this.controls.autoRotate) {
      const scale = this.tokenScale()
      this.runs.forEach((run) => this.paintRun(run, scale))
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

  /** The node under the pointer, skipping planes that are hidden. */
  pick(event: PointerEvent | MouseEvent): string | null {
    this.raycaster.setFromCamera(this.ndc(event), this.camera)
    const targets: Object3D[] = []
    for (const entry of this.nodes.values()) {
      if (this.planes[entry.stack.level]?.visible) targets.push(...entry.pick)
    }
    const hit = this.raycaster.intersectObjects(targets, false)[0]
    return (hit?.object.userData.node as string | undefined) ?? null
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

  private onDoubleClick = (event: MouseEvent) => {
    const id = this.pick(event)
    if (id) this.focusNode(id)
    else this.frameAll()
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
    this.tokens.clear()
    this.nodes.clear()
    this.edges.clear()
    this.runs = []
  }

  /** The stack's centre and the radius of a sphere around all of it. */
  private bounds(): { center: Vector3; radius: number } {
    const layout = this.layout
    if (!layout) return { center: new Vector3(), radius: 500 }
    const { footprint } = layout
    const top = this.planeY(layout.planes.length - 1) + layout.nodes.reduce((m, n) => Math.max(m, n.height), 0)
    const center = new Vector3(footprint.x + footprint.width / 2, top / 2, footprint.y + footprint.height / 2)
    const radius = Math.hypot(footprint.width, footprint.height, top) / 2
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
