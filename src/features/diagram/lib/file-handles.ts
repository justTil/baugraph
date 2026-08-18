/**
 * Remembers which file on disk each diagram came from.
 *
 * `FileSystemFileHandle` cannot be stringified, but it survives IndexedDB's
 * structured clone — which is the only reason a reload can still overwrite the
 * file you opened this morning rather than starting a new one beside it.
 */
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

export function rememberFileHandle(documentId: string, handle: FileSystemFileHandle) {
  void withStore('readwrite', (store) => store.put(handle, documentId))
}

export async function recallFileHandle(
  documentId: string,
): Promise<FileSystemFileHandle | null> {
  const stored = await withStore<unknown>('readonly', (store) => store.get(documentId))
  // Anything else in there is from an older build; treat it as no link.
  return stored && typeof (stored as FileSystemFileHandle).createWritable === 'function'
    ? (stored as FileSystemFileHandle)
    : null
}

export function forgetFileHandle(documentId: string) {
  void withStore('readwrite', (store) => store.delete(documentId))
}
