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
}

/** A labelled section of the sidebar containing one or more items. */
export interface NavGroup {
  id: string
  label?: string
  items: NavItem[]
}
