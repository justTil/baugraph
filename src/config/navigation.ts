import type { NavGroup, NavItem } from '@/types/navigation'
import { Info, Scale, ScrollText, Settings, Workflow } from '@lucide/vue'
import { imprintUrl } from '@/config/legal'

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
      // Opens the hosted Impressum directly in a new tab rather than an
      // in-app view — "unmittelbar erreichbar" without a redundant embed.
      { id: 'imprint', label: 'Impressum', icon: Scale, href: imprintUrl },
      { id: 'legal', label: 'Legal', icon: ScrollText },
      { id: 'about', label: 'About', icon: Info },
    ],
  },
]

/** Item selected on first load. */
export const defaultNavItemId = 'editor'

/**
 * Lookup by id. The sidebar, the dock's tabs and the panel titles all label
 * themselves from the same entry, so a rename here reaches every surface.
 */
export function navItem(id: string): NavItem | undefined {
  return navigation.flatMap((group) => group.items).find((item) => item.id === id)
}
