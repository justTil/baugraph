import type { NavGroup } from '@/types/navigation'
import { Settings, Workflow } from '@lucide/vue'

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
    ],
  },
]

/** Item selected on first load. */
export const defaultNavItemId = 'editor'
