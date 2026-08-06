import type { DiagramDocument, DiagramNode } from '@/model'
import { FORMAT_VERSION } from '@/model'
import { ZONE_HEADROOM, ZONE_PADDING, fitNodeSize } from '@/features/diagram/lib/auto-size'

/**
 * Grows the hand-written sizes below to whatever the browser says the text
 * actually needs, and grows each zone around what it holds.
 *
 * The numbers in the example are the layout — the columns it was drawn on — not
 * a promise about how wide "Adapter · TIBCO BusinessWorks" renders in a given
 * font. Measuring beats guessing, so the example is never shipped with its own
 * captions cut off.
 */
function autoSized(nodes: DiagramNode[]): DiagramNode[] {
  const grown = nodes.map((node) => {
    if (node.kind === 'zone') return node
    const fit = fitNodeSize(node)
    return {
      ...node,
      size: {
        width: Math.max(node.size.width, fit.width),
        height: Math.max(node.size.height, fit.height),
      },
    }
  })

  return grown.map((node) => {
    if (node.kind !== 'zone') return node
    const children = grown.filter((child) => child.parent === node.id)
    if (!children.length) return node
    return {
      ...node,
      size: {
        width: Math.max(
          node.size.width,
          ...children.map((c) => c.position.x + c.size.width + ZONE_PADDING),
        ),
        height: Math.max(
          node.size.height,
          ...children.map((c) => c.position.y + c.size.height + ZONE_PADDING - ZONE_HEADROOM),
        ),
      },
    }
  })
}

/**
 * The diagram shown on a first visit, so the canvas is never blank.
 * Also doubles as a worked example of the file format: relative child positions
 * inside a zone, mixed shapes, and every edge style.
 */
export function sampleDocument(): DiagramDocument {
  return {
    baugraph: FORMAT_VERSION,
    meta: {
      title: 'Order processing — reference architecture',
      description: 'Example diagram shipped with Baugraph.',
    },
    canvas: { theme: 'light', grid: true, snap: true, snapSize: 10 },
    nodes: autoSized([
      {
        id: 'order-platform',
        kind: 'zone',
        type: 'vpc',
        tech: 'aws',
        label: 'Order platform',
        sublabel: 'production',
        shape: 'rect',
        color: 'slate',
        position: { x: 300, y: 60 },
        size: { width: 620, height: 430 },
        parent: null,
      },
      {
        id: 'customer',
        kind: 'shape',
        type: 'user',
        label: 'Customer',
        sublabel: 'web + mobile',
        shape: 'circle',
        color: 'slate',
        icon: 'user',
        position: { x: 60, y: 190 },
        size: { width: 100, height: 100 },
        parent: null,
      },
      {
        id: 'api-gateway',
        kind: 'shape',
        type: 'api_gateway',
        tech: 'kong',
        label: 'API Gateway',
        sublabel: 'REST · TLS',
        shape: 'rect',
        color: 'blue',
        icon: 'door-open',
        position: { x: 40, y: 50 },
        size: { width: 168, height: 62 },
        parent: 'order-platform',
      },
      {
        id: 'order-service',
        kind: 'shape',
        type: 'service',
        tech: 'spring_boot',
        label: 'Order Service',
        sublabel: 'Java 21',
        shape: 'rect',
        color: 'blue',
        icon: 'package',
        position: { x: 40, y: 180 },
        size: { width: 168, height: 62 },
        parent: 'order-platform',
      },
      {
        id: 'auth-service',
        kind: 'shape',
        type: 'auth_service',
        tech: 'keycloak',
        label: 'Auth Service',
        sublabel: 'OAuth2 / OIDC',
        shape: 'rect',
        color: 'red',
        icon: 'shield-check',
        position: { x: 40, y: 310 },
        size: { width: 168, height: 62 },
        parent: 'order-platform',
      },
      {
        id: 'order-db',
        kind: 'shape',
        type: 'database',
        tech: 'postgresql',
        label: 'Order DB',
        sublabel: 'primary',
        shape: 'cylinder',
        color: 'green',
        icon: 'database',
        position: { x: 300, y: 50 },
        size: { width: 168, height: 70 },
        parent: 'order-platform',
      },
      {
        id: 'order-created',
        kind: 'shape',
        type: 'topic',
        tech: 'apache_kafka',
        label: 'order.created',
        sublabel: '3 partitions',
        shape: 'queue',
        color: 'amber',
        icon: 'radio-tower',
        position: { x: 300, y: 180 },
        size: { width: 200, height: 62 },
        parent: 'order-platform',
      },
      {
        id: 'billing-adapter',
        kind: 'shape',
        type: 'adapter',
        tech: 'tibco_businessworks',
        label: 'Billing Adapter',
        sublabel: 'SAP · IDoc',
        shape: 'rect',
        color: 'purple',
        icon: 'plug',
        position: { x: 440, y: 310 },
        size: { width: 168, height: 62 },
        parent: 'order-platform',
      },
      {
        id: 'nightly-reconcile',
        kind: 'shape',
        type: 'cron_job',
        label: 'Nightly Reconcile',
        sublabel: 'cron 0 2 * * *',
        shape: 'rect',
        color: 'teal',
        icon: 'rotate-ccw-clock',
        position: { x: 60, y: 400 },
        size: { width: 168, height: 62 },
        parent: null,
      },
      {
        id: 'sftp-export',
        kind: 'shape',
        type: 'file_write',
        tech: 'sftp',
        label: 'SFTP Export',
        sublabel: 'orders_*.csv',
        shape: 'rect',
        color: 'green',
        icon: 'sheet',
        position: { x: 60, y: 520 },
        size: { width: 168, height: 62 },
        parent: null,
      },
      {
        id: 'dead-letter-queue',
        kind: 'shape',
        type: 'dead_letter_queue',
        tech: 'apache_kafka',
        label: 'Dead Letter Queue',
        sublabel: 'retry ×3',
        shape: 'queue',
        color: 'red',
        icon: 'triangle-alert',
        position: { x: 600, y: 540 },
        size: { width: 220, height: 62 },
        parent: null,
      },
    ]),
    edges: [
      {
        id: 'customer--api-gateway',
        source: 'customer',
        target: 'api-gateway',
        sourceSide: 'right',
        targetSide: 'left',
        label: 'HTTPS',
        route: 'orthogonal',
        line: 'solid',
        arrows: 'target',
        color: null,
      },
      {
        id: 'api-gateway--order-service',
        source: 'api-gateway',
        target: 'order-service',
        sourceSide: 'bottom',
        targetSide: 'top',
        label: 'POST /orders',
        route: 'orthogonal',
        line: 'solid',
        arrows: 'target',
        color: null,
      },
      {
        id: 'order-service--auth-service',
        source: 'order-service',
        target: 'auth-service',
        sourceSide: 'bottom',
        targetSide: 'top',
        label: 'validate token',
        route: 'orthogonal',
        line: 'dashed',
        arrows: 'target',
        color: null,
      },
      {
        id: 'order-service--order-db',
        source: 'order-service',
        target: 'order-db',
        sourceSide: 'right',
        targetSide: 'left',
        label: 'write',
        route: 'orthogonal',
        line: 'solid',
        arrows: 'target',
        color: null,
      },
      {
        id: 'order-service--order-created',
        source: 'order-service',
        target: 'order-created',
        sourceSide: 'right',
        targetSide: 'left',
        label: 'publish',
        route: 'orthogonal',
        line: 'solid',
        arrows: 'target',
        color: null,
      },
      {
        id: 'order-created--billing-adapter',
        source: 'order-created',
        target: 'billing-adapter',
        sourceSide: 'bottom',
        targetSide: 'top',
        label: 'consume',
        route: 'orthogonal',
        line: 'dashed',
        arrows: 'target',
        color: null,
      },
      {
        id: 'order-created--dead-letter-queue',
        source: 'order-created',
        target: 'dead-letter-queue',
        sourceSide: 'bottom',
        targetSide: 'top',
        label: 'on failure',
        route: 'orthogonal',
        line: 'dotted',
        arrows: 'target',
        color: 'red',
      },
      {
        id: 'nightly-reconcile--order-service',
        source: 'nightly-reconcile',
        target: 'order-service',
        sourceSide: 'right',
        targetSide: 'left',
        label: 'trigger',
        route: 'orthogonal',
        line: 'dashed',
        arrows: 'target',
        color: 'teal',
      },
      {
        id: 'nightly-reconcile--sftp-export',
        source: 'nightly-reconcile',
        target: 'sftp-export',
        sourceSide: 'bottom',
        targetSide: 'top',
        label: 'writes',
        route: 'orthogonal',
        line: 'solid',
        arrows: 'target',
        color: 'teal',
      },
    ],
  }
}
