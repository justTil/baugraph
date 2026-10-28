import type { Component } from 'vue'
import type { IconEntry } from '@/features/diagram/data/icons.generated'
import { ICONS } from '@/features/diagram/data/icons.generated'

export type { IconEntry }
export { ICONS }

const byId = new Map(ICONS.map((entry) => [entry.id, entry]))

/** Resolves an icon id from a diagram file. Unknown ids render as no icon. */
export function iconComponent(id?: string | null): Component | undefined {
  if (!id) return undefined
  return byId.get(id)?.component
}

export function hasIcon(id?: string | null): boolean {
  return !!id && byId.has(id)
}

export const ICON_CATEGORIES = [...new Set(ICONS.map((entry) => entry.category))]

/** Substring match over id and category, for the picker's search box. */
export function searchIcons(query: string): IconEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return ICONS
  return ICONS.filter(
    (entry) => entry.id.includes(q) || entry.category.toLowerCase().includes(q),
  )
}
