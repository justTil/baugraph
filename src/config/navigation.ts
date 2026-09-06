import type { NavGroup, NavItem } from '@/types/navigation'
import { BookOpen, Copyright, Info, Scale, ScrollText, Settings, Sparkles, Workflow } from '@lucide/vue'
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
      // A real page at its own URI (built by VitePress, see docs/) rather than
      // an in-app dockview panel — so a docs link can be shared or bookmarked
      // on its own, and works without the app's JS at all.
      { id: 'docs', label: 'Docs', icon: BookOpen, href: '/docs/' },
      // Impressum and Legal identify Til Schwarze as the site operator (§ 5
      // DDG / GDPR controller, see `config/legal.ts`) and only apply to the
      // baugraph.com deployment — a self-hosted instance has a different
      // operator, so both entries are dropped from that build entirely
      // rather than shown with someone else's legal details.
      ...(__SELF_HOSTED__
        ? []
        : [
            // Labelled "Impressum": § 5 DDG wants the entry to be recognisable at a
            // glance, and German case law treats that exact word as unambiguous.
            // Everything else (privacy, liability, copyright) lives under "Legal".
            // Opens the hosted Impressum directly in a new tab rather than an
            // in-app view — "unmittelbar erreichbar" without a redundant embed.
            { id: 'imprint', label: 'Impressum', icon: Scale, href: imprintUrl },
            { id: 'legal', label: 'Legal', icon: ScrollText },
          ]),
      { id: 'license', label: 'License', icon: Copyright },
      { id: 'about', label: 'About', icon: Info },
      // Renders `changelog.md` in-app as a formatted release history.
      { id: 'changelog', label: "What's New", icon: Sparkles },
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
