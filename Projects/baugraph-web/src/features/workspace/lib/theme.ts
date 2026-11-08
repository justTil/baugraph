import type { DockviewTheme } from 'dockview-vue'

/**
 * The dock's palette is driven by the app's own shadcn tokens instead of one of
 * dockview's bundled themes, so tabs and sashes follow `.dark` along with the
 * rest of the shell. The variables live in `src/style.css` under the class name
 * below; only behaviour that has no CSS equivalent is configured here.
 */
export const dockTheme: DockviewTheme = {
  name: 'baugraph',
  className: 'dockview-theme-baugraph',
  /** Groups sit flush, like the rest of the shell - the borders do the work. */
  gap: 0,
  dndOverlayMounting: 'absolute',
  dndPanelOverlay: 'group',
  /** A thin insertion strip reads better than a fill on a bordered theme. */
  dndTabIndicator: 'line',
  tabAnimation: 'smooth',
}
