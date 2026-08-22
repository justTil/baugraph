import type { Component } from 'vue'

/**
 * A single entry in the sidebar navigation.
 * `id` is the stable key used for active state (and later for routing).
 */
export interface NavItem {
  id: string
  label: string
  icon?: Component
  badge?: string | number
  disabled?: boolean
  /**
   * External URL. When set, the item is a plain link that opens in a new tab
   * instead of switching the active view — for pages that live outside the app.
   */
  href?: string
}

/** A labelled section of the sidebar containing one or more items. */
export interface NavGroup {
  id: string
  label?: string
  items: NavItem[]
}
