import type { NavGroup } from '@/types/navigation'
import { Scale, Settings, Workflow } from '@lucide/vue'

/**
 * Single source of truth for the sidebar navigation.
 * The node palette is appended below these groups by `AppSidebar`.
 */
export const navigation: NavGroup[] = [
  {
    id: 'workspace',
    items: [
      { id: 'editor', label: 'Diagram', icon: Workflow },
      { id: 'settings', label: 'Settings', icon: Settings },
      // Labelled "Impressum": § 5 DDG wants the entry to be recognisable at a
      // glance, and German case law treats that exact word as unambiguous.
      { id: 'legal', label: 'Impressum', icon: Scale },
    ],
  },
]

/** Item selected on first load. */
export const defaultNavItemId = 'editor'
