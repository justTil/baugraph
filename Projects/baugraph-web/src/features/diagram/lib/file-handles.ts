/**
 * Remembers which file on disk each diagram came from.
 *
 * `FileSystemFileHandle` cannot be stringified, but it survives IndexedDB's
 * structured clone — which is the only reason a reload can still overwrite the
 * file you opened this morning rather than starting a new one beside it.
 */

/**
 * A diagram's link to a file.
 *
 * `slug` is the title the file was last written under, not the file's name: a
 * file the user deliberately called something else must not be "corrected" on
 * every save, so what a rename keys off is the title having moved.
 */
export interface FileLink {
  handle: FileSystemFileHandle
  slug: string
}

const DB_NAME = 'baugraph'
const DB_VERSION = 1
const STORE = 'file-handles'

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      // Private mode, or storage denied outright.
      resolve(null)
      return
    }

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE)
      }
    }
    request.onerror = () => resolve(null)
    request.onsuccess = () => {
      const db = request.result
      try {
        const operation = run(db.transaction(STORE, mode).objectStore(STORE))
        operation.onsuccess = () => resolve(operation.result ?? null)
        operation.onerror = () => resolve(null)
      } catch {
        resolve(null)
      }
      // The connection is only needed for this one operation.
      db.onclose = null
    }
  })
}

export function rememberFileLink(documentId: string, link: FileLink) {
  void withStore('readwrite', (store) => store.put({ ...link }, documentId))
}

export async function recallFileLink(documentId: string): Promise<FileLink | null> {
  const stored = (await withStore<unknown>('readonly', (store) =>
    store.get(documentId),
  )) as Partial<FileLink> | null
  // Anything else in there is from an older build; treat it as no link.
  return typeof stored?.handle?.createWritable === 'function'
    ? { handle: stored.handle, slug: stored.slug ?? '' }
    : null
}

export function forgetFileLink(documentId: string) {
  void withStore('readwrite', (store) => store.delete(documentId))
}
