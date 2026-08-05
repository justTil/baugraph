import type { Component } from 'vue'
import { defineAsyncComponent } from 'vue'

/**
 * Maps a nav item id to the view rendered in the shell.
 * Replace with vue-router routes once more than a handful of views exist.
 */
export const views: Record<string, Component> = {
  editor: defineAsyncComponent(() => import('@/features/diagram/views/DiagramView.vue')),
  settings: defineAsyncComponent(() => import('@/features/settings/views/SettingsView.vue')),
}
