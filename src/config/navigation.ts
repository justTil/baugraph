import type { NavGroup } from '@/types/navigation'
import { Landmark, LayoutDashboard, MessageSquare, Settings } from '@lucide/vue'

/**
 * Single source of truth for the sidebar.
 * Add a channel here and it shows up in the navigation - no component changes.
 */
export const navigation: NavGroup[] = [
  {
    id: 'overview',
    items: [
      { id: 'dashboard', label: 'Übersicht', icon: LayoutDashboard },
    ],
  },
  {
    id: 'channels',
    label: 'Kanäle',
    items: [
      { id: 'signal', label: 'Beispiel: Signal', icon: MessageSquare },
      { id: 'swift', label: 'Beispiel: SWIFT', icon: Landmark },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { id: 'settings', label: 'Einstellungen', icon: Settings },
    ],
  },
]

/** Item selected on first load. */
export const defaultNavItemId = 'signal'
