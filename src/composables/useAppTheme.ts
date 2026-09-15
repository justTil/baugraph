import { watch } from 'vue'
import { useActiveDiagram } from '@/features/diagram/composables/useDiagram'

/**
 * Keeps the app chrome — sidebar, header, dockview panels — in step with the
 * diagram currently in view, so night mode is not something only the canvas
 * remembers. The canvas itself reads `canvas.theme` directly; this just mirrors
 * it onto `<html>`, which is what every Tailwind `dark:` variant looks for.
 */
export function useAppTheme() {
  const active = useActiveDiagram()

  watch(
    () => active.value?.canvas.theme,
    (theme) => document.documentElement.classList.toggle('dark', theme === 'dark'),
    { immediate: true },
  )
}
