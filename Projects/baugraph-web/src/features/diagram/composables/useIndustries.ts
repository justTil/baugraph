import { reactive, watch } from 'vue'

/**
 * Industry packs the user has hidden from the palette, by group id.
 *
 * Stored as what is *hidden* rather than what is shown, so a pack added in a
 * later release turns up for everyone instead of being hidden by a list that
 * was written before it existed. One setting for the whole app, like the
 * theme: which industries someone works in is about them, not about any one
 * diagram, and a diagram using a hidden pack's nodes still draws them.
 */
const STORAGE_KEY = 'baugraph:industries-hidden'

function readStored(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

const hidden = reactive(new Set<string>(readStored()))

watch(hidden, () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden]))
  } catch {
    // Private browsing, storage full, quota denied — the choice just won't
    // survive a reload.
  }
})

function isShown(id: string): boolean {
  return !hidden.has(id)
}

function setShown(id: string, shown: boolean) {
  if (shown) hidden.delete(id)
  else hidden.add(id)
}

/** Which industry packs the palette lists, shared by every open document. */
export function useIndustries() {
  return { isShown, setShown }
}
