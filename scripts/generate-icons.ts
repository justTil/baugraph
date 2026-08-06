/**
 * Regenerates `src/features/diagram/data/icons.generated.ts`.
 *
 * Only a curated subset of Lucide ships in the icon picker: importing all ~3500
 * icons would dominate the bundle and make the picker useless to scroll. Add a
 * PascalCase name to `CURATED` below and re-run:
 *
 *   npm run icons:generate
 *
 * The script fails loudly if a name does not exist in the installed @lucide/vue,
 * so a typo can never reach the app as a silently missing icon.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outFile = resolve(root, 'src/features/diagram/data/icons.generated.ts')
const typesFile = resolve(root, 'node_modules/@lucide/vue/dist/lucide-vue.d.ts')

/** category -> PascalCase Lucide names */
const CURATED: Record<string, string[]> = {
  'Compute': [
    'Package', 'Boxes', 'Box', 'Container', 'Server', 'Cpu', 'Component', 'Blocks',
    'Puzzle', 'Rocket', 'Play', 'Pause', 'Power', 'SquareTerminal', 'Terminal',
    'Code', 'CodeXml', 'Bot', 'Brain', 'Sparkles',
  ],
  'Storage': [
    'Database', 'HardDrive', 'HardDriveDownload', 'Archive', 'ArchiveRestore',
    'Folder', 'FolderOpen', 'FolderTree', 'Save', 'Sheet', 'Table', 'Table2',
    'FileText', 'FileCode', 'FileUp', 'FileDown', 'FileSearch', 'Braces', 'Search',
    'ScrollText', 'Layers', 'Layers2', 'Library', 'Warehouse',
  ],
  'Messaging': [
    'Radio', 'RadioTower', 'Antenna', 'SatelliteDish', 'Satellite', 'Rss',
    'Megaphone', 'Bell', 'BellRing', 'Mail', 'MailOpen', 'Inbox', 'Send',
    'MessageSquare', 'MessagesSquare', 'Webhook',
  ],
  'Integration': [
    'Plug', 'Unplug', 'Cable', 'Link', 'Link2', 'Shuffle', 'Split', 'Merge',
    'ArrowLeftRight', 'ArrowRightLeft', 'ArrowUpDown', 'Repeat', 'RefreshCw',
    'RotateCw', 'Workflow', 'Waypoints', 'Share2', 'Network', 'Router', 'Spline',
    'Funnel', 'ListFilter', 'Scale', 'Import', 'LogIn', 'LogOut', 'DoorOpen',
  ],
  'Scheduling': [
    'Clock', 'ClockFading', 'RotateCcwClock', 'AlarmClock', 'Timer', 'Hourglass',
    'Calendar', 'CalendarCheck', 'CalendarClock', 'Kanban', 'ListChecks',
    'ListOrdered', 'ListTodo',
  ],
  'Security': [
    'Shield', 'ShieldCheck', 'ShieldAlert', 'ShieldQuestionMark', 'ShieldUser',
    'Lock', 'LockKeyhole', 'LockOpen', 'Key', 'KeyRound', 'Vault',
    'FingerprintPattern', 'ScanFace', 'IdCard', 'UserCheck', 'BadgeCheck',
  ],
  'Operations': [
    'Gauge', 'Activity', 'TrendingUp', 'ChartLine', 'ChartBar', 'ChartPie',
    'Bug', 'TriangleAlert', 'CircleAlert', 'CircleCheck', 'CircleX', 'CircleDot',
    'CircleQuestionMark', 'Info', 'Flag', 'Settings', 'Settings2', 'Cog',
    'SlidersHorizontal', 'SlidersVertical', 'ToggleLeft', 'Wrench', 'Hammer',
    'GitBranch', 'GitMerge', 'GitPullRequest', 'Eye', 'EyeOff', 'Radar', 'Target',
  ],
  'Network': [
    'Cloud', 'CloudCog', 'Globe', 'GlobeLock', 'Wifi', 'WifiOff', 'Signal',
    'Bluetooth', 'Nfc', 'Usb', 'Zap', 'Bolt',
  ],
  'Devices & clients': [
    'Monitor', 'MonitorSmartphone', 'Smartphone', 'Tablet', 'Laptop', 'AppWindow',
    'PanelsTopLeft', 'Printer', 'Keyboard', 'Mouse', 'Camera', 'Tv', 'Projector',
  ],
  'Actors & business': [
    'User', 'Users', 'UserPlus', 'UserCog', 'Building', 'Building2', 'Factory',
    'Store', 'Briefcase', 'Landmark', 'Banknote', 'CreditCard', 'Wallet',
    'Receipt', 'ShoppingCart', 'Truck', 'Barcode', 'QrCode', 'Tag', 'Tags',
    'GraduationCap', 'Newspaper', 'Presentation',
  ],
  'Places & misc': [
    'MapPin', 'Map', 'Navigation', 'Route', 'Milestone', 'Signpost', 'Locate',
    'Crosshair', 'Star', 'Heart', 'Bookmark', 'Lightbulb', 'Leaf', 'Recycle',
    'Trash2', 'Copy', 'ClipboardList', 'Pin', 'Paperclip', 'StickyNote',
    'NotebookPen', 'BookOpen', 'Beaker', 'FlaskConical', 'Microscope', 'Atom',
    'Dna', 'Hash', 'AtSign', 'Percent', 'Sigma', 'Binary', 'Command', 'Type',
  ],
  'Geometry': [
    'Circle', 'Square', 'Triangle', 'Hexagon', 'Diamond', 'Pentagon', 'Octagon',
    'Cylinder', 'Frame', 'Group', 'Ungroup', 'Grid2x2', 'Rows3', 'Columns3',
  ],
}

const available = new Set(
  [...readFileSync(typesFile, 'utf8').matchAll(/declare const ([A-Za-z0-9]+):/g)].map((m) => m[1]),
)

/** Mirrors Lucide's own kebab-case naming, e.g. `Layers2` -> `layers-2`. */
const kebab = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-zA-Z])([0-9])/g, '$1-$2')
    .toLowerCase()

const missing: string[] = []
const seen = new Set<string>()
const entries: { id: string; name: string; category: string }[] = []

for (const [category, names] of Object.entries(CURATED)) {
  for (const name of names) {
    if (!available.has(name)) {
      missing.push(name)
      continue
    }
    const id = kebab(name)
    if (seen.has(id)) continue
    seen.add(id)
    entries.push({ id, name, category })
  }
}

if (missing.length) {
  console.error(`Unknown Lucide icons: ${missing.join(', ')}`)
  process.exit(1)
}

const imports = [...new Set(entries.map((e) => e.name))].sort()

const source = `/* eslint-disable */
// GENERATED by scripts/generate-icons.ts — do not edit by hand.
// Run \`npm run icons:generate\` after changing the curated list in that script.
// Vue's \`Component\` type is aliased because Lucide ships an icon of that name.
import type { Component as VueComponent } from 'vue'
import {
${imports.map((n) => `  ${n},`).join('\n')}
} from '@lucide/vue'

export interface IconEntry {
  /** Stable kebab-case id stored in the diagram file. */
  id: string
  /** Palette grouping shown in the icon picker. */
  category: string
  component: VueComponent
}

export const ICONS: IconEntry[] = [
${entries.map((e) => `  { id: '${e.id}', category: '${e.category}', component: ${e.name} },`).join('\n')}
]
`

writeFileSync(outFile, source)
console.log(`wrote ${outFile.replace(`${root}/`, '')} — ${entries.length} icons`)
