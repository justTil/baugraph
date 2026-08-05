import type { NavItem } from '@/types/navigation'
import { computed, ref } from 'vue'
import { defaultNavItemId, navigation } from '@/config/navigation'

const allItems = computed<NavItem[]>(() => navigation.flatMap(group => group.items))

const activeItemId = ref<string>(defaultNavItemId)

const activeItem = computed<NavItem | undefined>(() =>
  allItems.value.find(item => item.id === activeItemId.value),
)

function setActiveItem(id: string) {
  activeItemId.value = id
}

/**
 * Shared navigation state.
 * Deliberately router-free for now - swap the internals for `useRoute()`
 * once vue-router is introduced; the component API stays the same.
 */
export function useNavigation() {
  return {
    groups: navigation,
    activeItemId,
    activeItem,
    setActiveItem,
    isActive: (id: string) => activeItemId.value === id,
  }
}
