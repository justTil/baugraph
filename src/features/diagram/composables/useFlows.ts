import type { ComputedRef } from 'vue'
import { computed, effectScope, ref, watch } from 'vue'
import gsap from 'gsap'
import type { ColorKey, MessageFlow } from '@/model'
import type { FlowEdge, FlowPlan } from '@/features/diagram/lib/flow-graph'
import { edgeStyle, flowPlan, tokenAt } from '@/features/diagram/lib/flow-graph'
import { diagramStore, useDiagram } from '@/features/diagram/composables/useDiagram'

/**
 * The message-flow animation runtime.
 *
 * Two things meet here. The *timing* is GSAP's: one tween per flow driving a
 * single normalised clock, which buys the ticker, the tab-visibility handling,
 * and a pause that resumes exactly where it stopped. The *geometry* is the SVG
 * path's own: every frame each message is placed by asking the connection it is
 * on where it is at that fraction of its length. Nothing here re-derives the
 * routing — it samples the very path the canvas drew, so a message stays on the
 * line while the node under it is still being dragged.
 *
 * Positions are written straight to the DOM rather than through reactive state:
 * this runs sixty times a second, and Vue has nothing to add to it.
 */

/** One drawn message: a slot on one hop of one branch, for one of a burst. */
export interface TokenSlot {
  /** Stable across re-renders, so Vue keeps the element. */
  key: string
  flow: string
  edge: string
  branch: number
  /** Index within a burst; later ones leave later. */
  token: number
  color: ColorKey
  shape: MessageFlow['token']
}

/** A moving line drawn over a connection, for flows that ask for one. */
export interface EdgeDash {
  flow: string
  color: ColorKey
  /** Seconds for the dash to advance one full pattern. */
  duration: number
}

interface FlowRun {
  flow: MessageFlow
  plan: FlowPlan
  slots: TokenSlot[]
  tween?: gsap.core.Tween
  /** The clock the tween writes into; 0 → 1 across one pass. */
  clock: { t: number }
}

interface FlowState {
  runs: Map<string, { flow: MessageFlow; plan: FlowPlan; slots: TokenSlot[] }>
  /** Token slots each connection has to draw. */
  byEdge: Map<string, TokenSlot[]>
  /** Moving-line overlays each connection has to draw. */
  dashes: Map<string, EdgeDash[]>
}

/** Length of one dash-and-gap, in canvas units. */
const DASH_PATTERN = 22

const reduced = ref(false)
if (typeof window !== 'undefined' && window.matchMedia) {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)')
  reduced.value = query.matches
  query.addEventListener('change', (event) => {
    reduced.value = event.matches
  })
}

/**
 * The message-flow runtime of one open diagram.
 *
 * Built per document: the registries below are keyed by connection id, and two
 * diagrams in two tabs are free to use the same ids for entirely different
 * connections.
 */
function createFlowRuntime(documentId: string) {
  const { flows, edges } = diagramStore(documentId)

  /* --------------------------------------------------------------- registries */

  /**
   * The rendered `<path>` of each connection: the length last measured off it,
   * which is what messages are placed against, and the length the current plan was
   * timed from, which is what decides when that plan has gone stale.
   */
  const paths = new Map<string, { el: SVGPathElement; length: number; planned: number }>()
  /** The `<g>` drawn for each token slot, by slot key. */
  const elements = new Map<string, SVGGElement>()
  /** The live tween of each flow that is animating. */
  const runs = new Map<string, FlowRun>()

  /**
   * Bumped when a connection is drawn at a materially different length, so a hop's
   * duration follows the line it runs on without every frame rebuilding the graph.
   */
  const geometry = ref(0)

  /** Global stop, for when the movement is in the way of the work. */
  const paused = ref(false)

  /**
   * Hovering a flow in the inspector lights up the connections it runs over. The
   * set is carried rather than looked up so a flow that is switched off — which
   * has no plan in the animating set — still shows what it would travel.
   */
  const highlighted = ref<{ id: string; color: ColorKey; edges: Set<string> } | null>(null)

  /**
   * The flow editor: whether it is open, which flow it is showing, and which of
   * that flow's connections is opened up. Shared state rather than a prop because
   * the two things that open it — the toolbar and a connection's inspector — sit
   * on opposite sides of the canvas from it, and arriving from a connection should
   * land on that connection rather than on a list to hunt through.
   */
  const editorOpen = ref(false)
  const editing = ref<string | null>(null)
  const editingEdge = ref<string | null>(null)

  /** Nothing moves while paused, and nothing moves under a reduced-motion preference. */
  const running = computed(() => !paused.value && !reduced.value)

  /* ------------------------------------------------------------------- paths */

  function measure(el: SVGPathElement): number {
    try {
      return el.getTotalLength()
    } catch {
      // A path that has not been laid out yet has no length to give; the redraw
      // that lays it out registers it again with a real one.
      return 0
    }
  }

  function registerEdgePath(id: string, el: SVGPathElement) {
    const length = measure(el)
    paths.set(id, { el, length, planned: length })
    geometry.value++
  }

  function unregisterEdgePath(id: string) {
    paths.delete(id)
  }

  /**
   * Re-measures a connection whose route changed.
   *
   * Only a difference big enough to see triggers a re-plan, so dragging a node
   * does not rebuild the graph every frame — the messages meanwhile follow the new
   * route regardless, because they sample the live path rather than the plan. The
   * comparison is against the length the *plan* was built from, not the last one
   * measured, so a node nudged across the canvas ten pixels at a time still
   * eventually re-times its hops instead of drifting away from the flow's speed.
   */
  function invalidateEdgePath(id: string) {
    const entry = paths.get(id)
    if (!entry) return
    entry.length = measure(entry.el)
    if (Math.abs(entry.length - entry.planned) < 8) return
    entry.planned = entry.length
    geometry.value++
  }

  const lengthOf = (id: string) => paths.get(id)?.length ?? 0

  /* -------------------------------------------------------------------- state */

  /**
   * One shared plan set for the whole editor. Every connection asks it what to
   * draw, so the graph is walked once per change rather than once per edge.
   */
  let shared: ComputedRef<FlowState> | null = null

  /**
   * Detached on purpose. Whichever component happens to ask for the plans first
   * would otherwise own them, and unmounting it — closing the inspector, say —
   * would stop the computed tracking its own dependencies while every other
   * component carried on reading it.
   */
  const scope = effectScope(true)

  function flowState(): ComputedRef<FlowState> {
    if (shared) return shared

    shared = scope.run(() => computed<FlowState>(() => {
      // Re-plan when the lines move far enough for the timing to be wrong.
      void geometry.value

      const byId = new Map<string, FlowEdge>(
        edges.value.map((e) => [e.id, { id: e.id, source: e.source, target: e.target }]),
      )

      const state: FlowState = { runs: new Map(), byEdge: new Map(), dashes: new Map() }

      for (const flow of flows.value) {
        if (!flow.enabled) continue
        const plan = flowPlan(flow, byId, lengthOf)
        if (!plan.branches.length) continue

        if (flow.motion !== 'token') {
          for (const edge of plan.edges) {
            const list = state.dashes.get(edge) ?? []
            // Tied to the speed the messages travel at on *this* connection, so a
            // flow drawn as both does not have its line racing its own traffic —
            // and a connection slowed down on purpose slows down whole.
            const look = edgeStyle(flow, edge)
            list.push({
              flow: flow.id,
              color: look.color,
              duration: DASH_PATTERN / Math.max(look.speed, 1),
            })
            state.dashes.set(edge, list)
          }
        }

        const slots: TokenSlot[] = []
        if (flow.motion !== 'dash') {
          // One slot per hop rather than one per message: a message crosses
          // several connections, and each connection is its own SVG, so the
          // element has to be the one already in the right coordinate space.
          plan.branches.forEach((branch, branch_) => {
            for (const hop of branch.hops) {
              // Each hop is drawn as that connection asks to be drawn, which is
              // how one node's onward paths end up looking like the different
              // things they are.
              const look = edgeStyle(flow, hop.edge)
              for (let token = 0; token < plan.tokens; token++) {
                const slot: TokenSlot = {
                  key: `${flow.id}|${branch_}|${token}|${hop.edge}`,
                  flow: flow.id,
                  edge: hop.edge,
                  branch: branch_,
                  token,
                  color: look.color,
                  shape: look.token,
                }
                slots.push(slot)
                const list = state.byEdge.get(hop.edge) ?? []
                list.push(slot)
                state.byEdge.set(hop.edge, list)
              }
            }
          })
        }

        state.runs.set(flow.id, { flow, plan, slots })
      }

      return state
    }))!

    return shared
  }

  /* ---------------------------------------------------------------- placement */

  function hide(el: SVGGElement) {
    if (el.style.display !== 'none') el.style.display = 'none'
  }

  /**
   * Puts a message at `progress` along a connection, turned to face the way it is
   * going. The heading comes from a second sample a hair further on, which is
   * cheaper and steadier than differentiating the path.
   */
  function place(el: SVGGElement, edge: string, progress: number, opacity: number) {
    const entry = paths.get(edge)
    if (!entry?.length) return hide(el)

    const at = entry.length * progress
    // Sampled backwards once there is no road left ahead, so a message sitting on
    // the last point of a connection still knows which way it was heading.
    const step = at + 1 <= entry.length ? 1 : -1
    let point: DOMPoint
    let ahead: DOMPoint
    try {
      point = entry.el.getPointAtLength(at)
      ahead = entry.el.getPointAtLength(at + step)
    } catch {
      return hide(el)
    }

    // Turned to face the way it is going, but never past vertical: none of the
    // message glyphs carry their own direction — the arrowhead does that — and an
    // upside-down envelope on a right-to-left connection just reads as a mistake.
    let angle =
      (Math.atan2(step * (ahead.y - point.y), step * (ahead.x - point.x)) * 180) / Math.PI
    if (angle > 90) angle -= 180
    else if (angle < -90) angle += 180

    el.setAttribute(
      'transform',
      `translate(${point.x.toFixed(2)},${point.y.toFixed(2)}) rotate(${angle.toFixed(1)})`,
    )
    el.style.opacity = opacity.toFixed(3)
    if (el.style.display === 'none') el.style.display = ''
  }

  /** Draws every message of one flow at `time` seconds into its pass. */
  function paintRun(run: FlowRun) {
    const time = run.clock.t * run.plan.duration
    for (const slot of run.slots) {
      const el = elements.get(slot.key)
      if (!el) continue
      const branch = run.plan.branches[slot.branch]
      const position = branch ? tokenAt(branch, time + slot.token * run.plan.offset) : null
      // A branch never visits a connection twice, so the edge alone decides
      // whether this slot is the one carrying the message at this instant.
      if (!position || position.edge !== slot.edge) hide(el)
      else place(el, slot.edge, position.progress, position.opacity)
    }
  }

  /**
   * Parks one message halfway along each connection the flow travels. A
   * reduced-motion preference still deserves to be told which lines carry the
   * message — it just must not be told by moving anything.
   */
  function paintStill(run: FlowRun) {
    const shown = new Set<string>()
    for (const slot of run.slots) {
      const el = elements.get(slot.key)
      if (!el) continue
      if (slot.token > 0 || shown.has(slot.edge)) hide(el)
      else {
        shown.add(slot.edge)
        place(el, slot.edge, 0.5, 1)
      }
    }
  }

  /* ----------------------------------------------------------------- elements */

  function registerToken(key: string, el: SVGGElement) {
    elements.set(key, el)
    // A slot that appears mid-pass would otherwise sit at the origin until the
    // next frame, so it starts hidden and can only ever appear in place.
    hide(el)
  }

  function unregisterToken(key: string) {
    elements.delete(key)
  }

  /* ------------------------------------------------------------------ tweens */

  let installed = false

  /**
   * Keeps one tween per flow in step with the plans. A flow whose timing merely
   * changed has its tween restretched rather than replaced, so rearranging a
   * diagram does not restart its animation every time a node lands.
   */
  function syncTweens(state: FlowState) {
    for (const [id, run] of runs) {
      if (state.runs.has(id)) continue
      run.tween?.kill()
      runs.delete(id)
    }

    for (const [id, next] of state.runs) {
      if (next.plan.duration <= 0) continue
      const existing = runs.get(id)

      if (existing) {
        existing.flow = next.flow
        existing.plan = next.plan
        existing.slots = next.slots
        // `duration()` keeps the tween's progress ratio, so the messages carry on
        // from where they were instead of snapping back to the start.
        if (existing.tween && Math.abs(existing.tween.duration() - next.plan.duration) > 0.01) {
          existing.tween.duration(next.plan.duration)
        }
        existing.tween?.repeat(next.flow.loop ? -1 : 0)
        continue
      }

      const run: FlowRun = { ...next, clock: { t: 0 } }
      run.tween = gsap.to(run.clock, {
        t: 1,
        duration: next.plan.duration,
        ease: 'none',
        repeat: next.flow.loop ? -1 : 0,
        paused: !running.value,
        onUpdate: () => paintRun(run),
      })
      runs.set(id, run)
    }

    if (!running.value) runs.forEach(paintStill)
  }

  /** Starts the runtime. Called once, by the canvas. */
  function installFlowRuntime() {
    if (installed) return
    installed = true
    const state = flowState()

    watch(state, syncTweens, { immediate: true, flush: 'post' })

    watch(running, (go) => {
      runs.forEach((run) => {
        if (go) run.tween?.play()
        else {
          run.tween?.pause()
          // A pause freezes the messages where they are; a reduced-motion
          // preference has nowhere to freeze them, so they park mid-connection.
          if (reduced.value) paintStill(run)
        }
      })
    })

    // The lines moved under a still animation: put the markers back on the path
    // at once, rather than leaving them beside a connection that has been redrawn.
    watch(geometry, () => {
      if (!running.value) runs.forEach(paintStill)
    })
  }

  function stopFlowRuntime() {
    runs.forEach((run) => run.tween?.kill())
    runs.clear()
    installed = false
  }

  /* ------------------------------------------------------------------- facade */

  const state = flowState()

  return {
    paused,
    running,
    reduced,
    highlighted,
    editorOpen,
    editing,
    editingEdge,
    registerEdgePath,
    unregisterEdgePath,
    invalidateEdgePath,
    registerToken,
    unregisterToken,
    installFlowRuntime,
    stopFlowRuntime,
    /** Opens the flow editor, on `id` when one is named and `edge` when one is. */
    openFlowEditor: (id: string | null = null, edge: string | null = null) => {
      editing.value = id
      editingEdge.value = edge
      editorOpen.value = true
    },
    /** Token slots a connection has to draw. */
    tokensFor: (edge: string) => state.value.byEdge.get(edge) ?? [],
    /** Moving-line overlays a connection has to draw. */
    dashesFor: (edge: string) => state.value.dashes.get(edge) ?? [],
    /** The colour to halo a connection in, when a flow over it is pointed at. */
    highlightOf: (edge: string): ColorKey | null =>
      highlighted.value?.edges.has(edge) ? highlighted.value.color : null,
    /**
     * A flow's plan, worked out on demand — the inspector describes flows that
     * are switched off too, and those are not in the animating set.
     */
    planOf: (flow: MessageFlow): FlowPlan => {
      void geometry.value
      const byId = new Map<string, FlowEdge>(
        edges.value.map((e) => [e.id, { id: e.id, source: e.source, target: e.target }]),
      )
      return flowPlan(flow, byId, lengthOf)
    },
    /** Stops every tween and releases the registries; called when the tab closes. */
    dispose: () => {
      stopFlowRuntime()
      paths.clear()
      elements.clear()
      scope.stop()
    },
  }
}

/* -------------------------------------------------------------- registry */

export type FlowRuntime = ReturnType<typeof createFlowRuntime>

const runtimes = new Map<string, FlowRuntime>()

/** The flow runtime for `documentId`, created on first use. */
export function flowRuntime(documentId: string): FlowRuntime {
  let runtime = runtimes.get(documentId)
  if (!runtime) {
    runtime = createFlowRuntime(documentId)
    runtimes.set(documentId, runtime)
  }
  return runtime
}

export function disposeFlowRuntime(documentId: string) {
  runtimes.get(documentId)?.dispose()
  runtimes.delete(documentId)
}

/** The flow runtime of the document this component's panel belongs to. */
export function useFlows(): FlowRuntime {
  return flowRuntime(useDiagram().documentId)
}
