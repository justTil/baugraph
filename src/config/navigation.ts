import type { NavGroup } from '@/types/navigation'
import { Scale, ScrollText, Settings, Workflow } from '@lucide/vue'

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
      // Everything else (privacy, liability, copyright) lives under "Legal".
      { id: 'imprint', label: 'Impressum', icon: Scale },
      { id: 'legal', label: 'Legal', icon: ScrollText },
    ],
  },
]

/** Item selected on first load. */
export const defaultNavItemId = 'editor'
