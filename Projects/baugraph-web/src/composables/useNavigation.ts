import { navigation } from '@/config/navigation'
import { EDITOR_VIEW_ID, focusOrOpenEditor } from '@/features/diagram/composables/useEditorTabs'
import { useWorkspace } from '@/features/workspace/composables/useWorkspace'

/**
 * Shared navigation state.
 *
 * The dock owns which views exist and which one has focus; a nav item is just a
 * request to open or focus the matching panel. Several views can be on screen at
 * once, so `isActive` (focused) and `isOpen` (has a tab) are distinct.
 */
export function useNavigation() {
  const { activeViewId, activeItem, isActive, isOpen, isVisible, openView } = useWorkspace()

  /**
   * The editor holds one panel per diagram rather than one panel outright, so
   * the sidebar entry goes to an open diagram instead of opening another.
   */
  function setActiveItem(id: string) {
    if (id === EDITOR_VIEW_ID) focusOrOpenEditor()
    else openView(id)
  }

  return {
    groups: navigation,
    activeItemId: activeViewId,
    activeItem,
    setActiveItem,
    isActive,
    isOpen,
    isVisible,
  }
}
