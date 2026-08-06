import type { ColorKey, ShapeKey } from '@/model'
import { DEFAULT_NODE_SIZE, DEFAULT_ZONE_SIZE } from '@/model'

/** A draggable entry in the left-hand palette. */
export interface PaletteItem {
  label: string
  /** Icon id from the Lucide registry. Drawn inside the node itself. */
  icon?: string
  /**
   * Icon shown next to the palette entry only, for items whose node carries no
   * icon of its own — a zone has no icon slot, and a note drawing a note icon
   * inside itself is just noise. Falls back to `icon`.
   */
  listIcon?: string
  color: ColorKey
  shape?: ShapeKey
  kind?: 'shape' | 'zone'
  width?: number
  height?: number
}

export interface PaletteGroup {
  id: string
  label: string
  items: PaletteItem[]
}

export const PALETTE: PaletteGroup[] = [
  {
    id: 'flow',
    label: 'Flow',
    items: [
      { label: 'Start', icon: 'play', color: 'slate', shape: 'pill', width: 120, height: 44 },
      { label: 'End', icon: 'flag', color: 'slate', shape: 'pill', width: 120, height: 44 },
      { label: 'Step', listIcon: 'square', color: 'slate', shape: 'rect', width: 150, height: 54 },
      {
        label: 'Decision',
        icon: 'split',
        color: 'amber',
        shape: 'diamond',
        width: 150,
        height: 100,
      },
      {
        label: 'Note',
        listIcon: 'sticky-note',
        color: 'amber',
        shape: 'note',
        width: 180,
        height: 84,
      },
      {
        label: 'Zone',
        listIcon: 'frame',
        color: 'slate',
        kind: 'zone',
        width: DEFAULT_ZONE_SIZE.width,
        height: DEFAULT_ZONE_SIZE.height,
      },
    ],
  },
  {
    id: 'compute',
    label: 'Services & compute',
    items: [
      { label: 'Service', icon: 'package', color: 'blue' },
      { label: 'Microservice', icon: 'boxes', color: 'blue' },
      { label: 'API', icon: 'code', color: 'blue', shape: 'round' },
      { label: 'API Gateway', icon: 'door-open', color: 'blue' },
      { label: 'Function', icon: 'zap', color: 'blue' },
      { label: 'Container', icon: 'container', color: 'slate' },
      { label: 'Server', icon: 'server', color: 'slate' },
      { label: 'Worker', icon: 'cog', color: 'slate' },
      { label: 'Batch Job', icon: 'hourglass', color: 'slate' },
      { label: 'Web App', icon: 'app-window', color: 'blue' },
      { label: 'Mobile App', icon: 'smartphone', color: 'blue' },
      { label: 'Desktop App', icon: 'monitor', color: 'blue' },
    ],
  },
  {
    id: 'data',
    label: 'Data & storage',
    items: [
      { label: 'Database', icon: 'database', color: 'green', shape: 'cylinder' },
      { label: 'SQL Database', icon: 'database', color: 'green', shape: 'cylinder' },
      { label: 'NoSQL Store', icon: 'hard-drive', color: 'green', shape: 'cylinder' },
      { label: 'Cache', icon: 'zap', color: 'green', shape: 'cylinder' },
      { label: 'Data Warehouse', icon: 'warehouse', color: 'green', shape: 'cylinder' },
      { label: 'Search Index', icon: 'search', color: 'green', shape: 'cylinder' },
      { label: 'Object Storage', icon: 'archive', color: 'green' },
      { label: 'File Share', icon: 'folder', color: 'green' },
      { label: 'File Write', icon: 'file-up', color: 'green' },
      { label: 'CSV Export', icon: 'sheet', color: 'green' },
      { label: 'JSON Payload', icon: 'braces', color: 'green' },
      { label: 'XML Payload', icon: 'file-code', color: 'green' },
      { label: 'Table', icon: 'table', color: 'green' },
      { label: 'Disk', icon: 'hard-drive', color: 'slate' },
    ],
  },
  {
    id: 'messaging',
    label: 'Messaging & events',
    items: [
      { label: 'Queue', icon: 'layers-2', color: 'amber', shape: 'queue' },
      { label: 'Topic', icon: 'radio-tower', color: 'amber', shape: 'queue' },
      { label: 'Event Bus', icon: 'radio', color: 'amber' },
      { label: 'Stream', icon: 'activity', color: 'amber', shape: 'queue' },
      { label: 'Message Broker', icon: 'shuffle', color: 'amber' },
      { label: 'Dead Letter Queue', icon: 'triangle-alert', color: 'red', shape: 'queue' },
      { label: 'Webhook', icon: 'webhook', color: 'amber' },
      { label: 'Notification', icon: 'bell', color: 'amber' },
      { label: 'Email', icon: 'mail', color: 'amber' },
      { label: 'Inbox', icon: 'inbox', color: 'amber' },
      { label: 'Publisher', icon: 'megaphone', color: 'amber' },
      { label: 'Feed', icon: 'rss', color: 'amber' },
    ],
  },
  {
    id: 'integration',
    label: 'Integration & routing',
    items: [
      { label: 'Middleware', icon: 'settings', color: 'purple' },
      { label: 'ESB', icon: 'network', color: 'purple' },
      { label: 'Adapter', icon: 'plug', color: 'purple' },
      { label: 'Transformer', icon: 'arrow-left-right', color: 'purple' },
      { label: 'Router', icon: 'split', color: 'purple' },
      { label: 'Load Balancer', icon: 'scale', color: 'purple' },
      { label: 'Proxy', icon: 'router', color: 'purple' },
      { label: 'Filter', icon: 'funnel', color: 'purple' },
      { label: 'ETL Pipeline', icon: 'spline', color: 'purple' },
      { label: 'Sync', icon: 'refresh-cw', color: 'purple' },
      { label: 'Ingress', icon: 'log-in', color: 'purple' },
      { label: 'Egress', icon: 'log-out', color: 'purple' },
    ],
  },
  {
    id: 'scheduling',
    label: 'Scheduling',
    items: [
      { label: 'Cron Job', icon: 'rotate-ccw-clock', color: 'teal' },
      { label: 'Scheduler', icon: 'calendar-check', color: 'teal' },
      { label: 'Timer', icon: 'alarm-clock', color: 'teal' },
      { label: 'Retry', icon: 'rotate-cw', color: 'teal' },
      { label: 'Backlog', icon: 'kanban', color: 'teal' },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    items: [
      { label: 'Auth Service', icon: 'shield-check', color: 'red' },
      { label: 'Identity Provider', icon: 'fingerprint-pattern', color: 'red' },
      { label: 'Firewall', icon: 'shield', color: 'red' },
      { label: 'Secret Vault', icon: 'vault', color: 'red' },
      { label: 'Certificate', icon: 'key-round', color: 'red' },
      { label: 'Access Control', icon: 'lock', color: 'red' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      { label: 'Monitoring', icon: 'gauge', color: 'slate' },
      { label: 'Metrics', icon: 'trending-up', color: 'slate' },
      { label: 'Logging', icon: 'scroll-text', color: 'slate' },
      { label: 'Alerting', icon: 'bell-ring', color: 'red' },
      { label: 'CI/CD', icon: 'git-branch', color: 'slate' },
      { label: 'Config', icon: 'sliders-horizontal', color: 'slate' },
      { label: 'Health Check', icon: 'circle-check', color: 'green' },
      { label: 'Incident', icon: 'bug', color: 'red' },
      { label: 'Terminal', icon: 'terminal', color: 'slate' },
    ],
  },
  {
    id: 'actors',
    label: 'Actors & context',
    items: [
      { label: 'User', icon: 'user', color: 'slate', shape: 'circle', width: 100, height: 100 },
      { label: 'Team', icon: 'users', color: 'slate' },
      { label: 'External System', icon: 'building-2', color: 'slate' },
      { label: 'Third Party', icon: 'briefcase', color: 'slate' },
      { label: 'Internet', icon: 'globe', color: 'slate' },
      { label: 'Cloud', icon: 'cloud', color: 'slate' },
      { label: 'Network', icon: 'network', color: 'slate' },
      { label: 'Device', icon: 'cpu', color: 'slate' },
      { label: 'Printer', icon: 'printer', color: 'slate' },
      { label: 'Payment', icon: 'credit-card', color: 'pink' },
      { label: 'Location', icon: 'map-pin', color: 'pink' },
    ],
  },
]

export function paletteItemSize(item: PaletteItem) {
  const fallback = item.kind === 'zone' ? DEFAULT_ZONE_SIZE : DEFAULT_NODE_SIZE
  return {
    width: item.width ?? fallback.width,
    height: item.height ?? fallback.height,
  }
}

/** Node type used when repeating the last one (double-click, drop on empty canvas). */
export const DEFAULT_PALETTE_ITEM: PaletteItem = { label: 'Service', icon: 'package', color: 'blue' }
