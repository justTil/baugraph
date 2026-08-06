import { parse, stringify } from '@/model/serialize'
import type { DiagramDocument } from '@/model/types'

const doc: DiagramDocument = {
  baugraph: '1.0',
  meta: { title: 'Nested + locked' },
  canvas: { theme: 'light', grid: true, snap: true, snapSize: 10 },
  nodes: [
    {
      id: 'region',
      kind: 'zone',
      label: 'Region',
      shape: 'rect',
      color: 'slate',
      position: { x: 0, y: 0 },
      size: { width: 800, height: 500 },
      parent: null,
      locked: true,
    },
    {
      id: 'cluster',
      kind: 'zone',
      label: 'Cluster',
      shape: 'rect',
      color: 'blue',
      position: { x: 40, y: 60 },
      size: { width: 400, height: 300 },
      parent: 'region',
      locked: false,
    },
    {
      id: 'svc',
      kind: 'shape',
      label: 'Service',
      shape: 'rect',
      color: 'blue',
      position: { x: 30, y: 40 },
      size: { width: 168, height: 62 },
      parent: 'cluster',
      locked: false,
    },
  ],
  edges: [],
}

const text = stringify(doc)
console.log(text)

const round = parse(text)
console.log('parent chain:', round.nodes.map((n) => `${n.id}<-${n.parent ?? 'root'}`).join(' '))
console.log('locked:', round.nodes.map((n) => `${n.id}=${n.locked}`).join(' '))
console.log('stable:', stringify(round) === text)

// A parent cycle must be rejected rather than hang anything that walks the chain.
const cyclic = JSON.parse(text)
cyclic.nodes[0].parent = 'svc'
try {
  parse(JSON.stringify(cyclic))
  console.log('cycle: NOT rejected (bad)')
} catch (error) {
  console.log('cycle rejected:', (error as Error).message)
}
