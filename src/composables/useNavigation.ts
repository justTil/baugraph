import { navigation } from '@/config/navigation'
import { useWorkspace } from '@/features/workspace/composables/useWorkspace'

/**
 * Shared navigation state.
 *
 * The dock owns which views exist and which one has focus; a nav item is just
 * a request to open or focus the matching panel. Several views can be on screen
 * at once, so `isActive` (focused) and `isOpen` (has a tab) are distinct.
 */
export function useNavigation() {
  const { activeViewId, activeItem, isActive, isOpen, isVisible, openView } = useWorkspace()

  return {
    groups: navigation,
    activeItemId: activeViewId,
    activeItem,
    setActiveItem: openView,
    isActive,
    isOpen,
    isVisible,
  }
}
