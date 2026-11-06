import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { MessageFlow } from '@/model'
import { FLOW_DEFAULTS, parse, safeParse, stringify } from '@/model'
import type { FlowEdge } from '@/features/diagram/lib/flow-graph'
import { flowPlan, flowSteps, tokenAt } from '@/features/diagram/lib/flow-graph'
import {
  canMoveEarlier,
  canMoveLater,
  joinWithNext,
  moveEarlier,
  moveLater,
  moveToStep,
  sameSteps,
  splitStep,
} from '@/features/diagram/lib/flow-steps'

/**
 * A request and its reply, around a hub that also notifies two others:
 *
 *   client → api → db → api → client
 *                 api → mail
 *                 api → audit
 */
const edges: FlowEdge[] = [
  { id: 'client--api', source: 'client', target: 'api' },
  { id: 'api--db', source: 'api', target: 'db' },
  { id: 'db--api', source: 'db', target: 'api' },
  { id: 'api--client', source: 'api', target: 'client' },
  { id: 'api--mail', source: 'api', target: 'mail' },
  { id: 'api--audit', source: 'api', target: 'audit' },
]
const byId = new Map(edges.map((e) => [e.id, e]))

/** Every connection 100 units long at a speed of 100: one second a hop, unless overridden. */
const lengths = (overrides: Record<string, number> = {}) => (id: string) => overrides[id] ?? 100

function flow(patch: Partial<MessageFlow>): MessageFlow {
  return {
    ...FLOW_DEFAULTS,
    id: 'flow',
    label: 'Flow',
    edges: edges.map((e) => e.id),
    speed: 100,
    pause: 0,
    ...patch,
  } as MessageFlow
}

describe('flowSteps', () => {
  it('groups a fan-out by how far from the start each connection is', () => {
    const fan = flow({ edges: ['client--api', 'api--mail', 'api--audit'] })
    expect(flowSteps(fan, byId)).toEqual([['client--api'], ['api--mail', 'api--audit']])
  })

  it('gives every connection a step of its own in a sequence', () => {
    const walk = flow({ edges: ['client--api', 'api--mail', 'api--audit'], mode: 'sequence' })
    expect(flowSteps(walk, byId)).toEqual([['client--api'], ['api--mail'], ['api--audit']])
  })

  it('returns a hand-set order as written, tidied', () => {
    const custom = flow({
      steps: [['api--db', 'unknown'], [], ['client--api', 'api--db']],
    })
    // Unknown ids and repeats go, empty steps vanish, and the connections the
    // order forgot come last, one step each.
    expect(flowSteps(custom, byId)).toEqual([
      ['api--db'],
      ['client--api'],
      ['db--api'],
      ['api--client'],
      ['api--mail'],
      ['api--audit'],
    ])
  })
})

describe('flowPlan with a hand-set order', () => {
  const requestReply = flow({
    edges: ['client--api', 'api--db', 'db--api', 'api--client', 'api--mail'],
    steps: [['client--api'], ['api--db'], ['db--api'], ['api--client', 'api--mail']],
  })

  it('runs the steps one after another', () => {
    const plan = flowPlan(requestReply, byId, lengths())
    expect(plan.custom).toBe(true)
    const starts = new Map(plan.branches.flatMap((b) => b.hops.map((h) => [h.edge, h.start])))
    expect(starts.get('client--api')).toBe(0)
    expect(starts.get('api--db')).toBe(1)
    expect(starts.get('db--api')).toBe(2)
    expect(starts.get('api--client')).toBe(3)
    expect(starts.get('api--mail')).toBe(3)
    expect(plan.duration).toBe(4)
  })

  it('carries one message through a request and its reply, and copies it where a step forks', () => {
    const plan = flowPlan(requestReply, byId, lengths())
    expect(plan.branches.map((b) => b.hops.map((h) => h.edge))).toEqual([
      ['client--api', 'api--db', 'db--api', 'api--client'],
      ['client--api', 'api--db', 'db--api', 'api--mail'],
    ])
    expect(plan.branches.every((b) => b.begin === 0)).toBe(true)
  })

  it('starts a step after the slowest hop of the one before, and parks the fast one', () => {
    const stepped = flow({
      edges: ['client--api', 'api--db', 'api--mail'],
      steps: [['api--db', 'api--mail'], ['db--api']],
    })
    // db--api is not in `edges`, so it is dropped; mail is slow.
    const plan = flowPlan(stepped, byId, lengths({ 'api--mail': 300 }))
    const db = plan.branches.find((b) => b.hops[0]!.edge === 'api--db')!
    expect(db.journey).toBe(1)
    // client--api was left out of the order, so it is sent after the last step.
    const late = plan.branches.find((b) => b.hops[0]!.edge === 'client--api')!
    expect(late.begin).toBe(3)
    expect(tokenAt(late, 2.5)).toBeNull()
    expect(tokenAt(late, 3.5)?.edge).toBe('client--api')
  })

  it('holds a message at the node it is waiting at between two steps', () => {
    const waiting = flow({
      edges: ['client--api', 'api--db', 'api--mail'],
      steps: [['client--api', 'api--mail'], ['api--db']],
    })
    // client--api takes 1s, api--mail 3s: step two leaves at 3s.
    const plan = flowPlan(waiting, byId, lengths({ 'api--mail': 300 }))
    const request = plan.branches.find((b) => b.hops[0]!.edge === 'client--api')!
    expect(request.hops.map((h) => h.edge)).toEqual(['client--api', 'api--db'])
    expect(request.hops[1]!.start).toBe(3)
    const parked = tokenAt(request, 2)
    expect(parked).toMatchObject({ edge: 'api--db', progress: 0 })
    expect(parked!.opacity).toBe(1)
  })

  it('sends a fresh message when a node that already passed its message on sends again', () => {
    const oneByOne = flow({
      edges: ['client--api', 'api--mail', 'api--audit'],
      steps: [['client--api'], ['api--mail'], ['api--audit']],
    })
    const plan = flowPlan(oneByOne, byId, lengths())
    expect(plan.branches.map((b) => [b.begin, b.hops.map((h) => h.edge)])).toEqual([
      [0, ['client--api', 'api--mail']],
      [2, ['api--audit']],
    ])
  })

  it('leaves an automatic flow exactly as it was', () => {
    const auto = flow({ edges: ['client--api', 'api--mail', 'api--audit'] })
    const plan = flowPlan(auto, byId, lengths({ 'api--mail': 300 }))
    expect(plan.custom).toBe(false)
    // No waiting for siblings: the audit hop leaves the moment the message lands.
    expect(plan.branches.map((b) => b.journey)).toEqual([4, 2])
    expect(plan.duration).toBe(4)
  })
})

describe('step moves', () => {
  const steps = [['a'], ['b', 'c'], ['d']]

  it('drops a connection into a step, or into a step of its own', () => {
    expect(moveToStep(steps, 'd', { join: 0 })).toEqual([['a', 'd'], ['b', 'c']])
    expect(moveToStep(steps, 'a', { gap: 3 })).toEqual([['b', 'c'], ['d'], ['a']])
    expect(moveToStep(steps, 'c', { gap: 0 })).toEqual([['c'], ['a'], ['b'], ['d']])
    // Back where it came from: nothing changes.
    expect(moveToStep(steps, 'd', { join: 2 })).toEqual(steps)
  })

  it('moves one place at a time, lifting a connection out of a shared step first', () => {
    expect(moveEarlier(steps, 'd')).toEqual([['a'], ['d'], ['b', 'c']])
    expect(moveEarlier(steps, 'b')).toEqual([['a'], ['b'], ['c'], ['d']])
    expect(moveLater(steps, 'a')).toEqual([['b', 'c'], ['a'], ['d']])
    expect(moveLater(steps, 'c')).toEqual([['a'], ['b'], ['c'], ['d']])
  })

  it('knows when there is nowhere to go', () => {
    expect(canMoveEarlier(steps, 'a')).toBe(false)
    expect(canMoveLater(steps, 'd')).toBe(false)
    expect(canMoveEarlier([['a', 'b']], 'a')).toBe(true)
    expect(moveEarlier(steps, 'a')).toEqual(steps)
  })

  it('joins and splits whole steps', () => {
    expect(joinWithNext(steps, 0)).toEqual([['a', 'b', 'c'], ['d']])
    expect(splitStep(steps, 1)).toEqual([['a'], ['b'], ['c'], ['d']])
    expect(sameSteps(splitStep(steps, 0), steps)).toBe(true)
  })
})

describe('steps in the file', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const source = readFileSync(resolve(here, '../fixtures/1.28.0/valid/order-processing.json'), 'utf-8')

  it('round-trips in the order it was written, while `edges` is still sorted', () => {
    const doc = parse(source)
    const flow = doc.flows[0]!
    const order = [
      ['order-created--dead-letter-queue'],
      ['api-gateway--order-service'],
      ['order-service--order-created'],
      ['order-created--billing-adapter', 'order-created--analytics-sink'],
    ]
    doc.flows[0] = { ...flow, steps: order }
    const again = parse(stringify(doc))
    expect(again.flows.find((f) => f.id === flow.id)!.steps).toEqual(order)
  })

  it('writes nothing for an automatic order', () => {
    const doc = parse(source)
    expect(stringify(doc)).not.toContain('"steps"')
  })

  it('refuses an order naming a connection the flow does not travel, or one twice', () => {
    const raw = JSON.parse(source)
    raw.flows[0].steps = [['customer--api-gateway']]
    expect(safeParse(raw).ok).toBe(false)

    raw.flows[0].steps = [['api-gateway--order-service'], ['api-gateway--order-service']]
    expect(safeParse(raw).ok).toBe(false)

    raw.flows[0].steps = [['api-gateway--order-service'], []]
    expect(safeParse(raw).ok).toBe(false)
  })
})
