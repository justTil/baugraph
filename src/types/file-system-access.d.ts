/**
 * The parts of the File System Access API that TypeScript's DOM library does
 * not declare yet. `FileSystemFileHandle` and `createWritable` are built in;
 * the pickers and the permission methods are not.
 *
 * Chromium ships all of this. Firefox and Safari ship none of it, which is why
 * every call site behind these types has a download fallback.
 */
interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite'
}

interface FileSystemHandle {
  queryPermission?: (
    descriptor?: FileSystemHandlePermissionDescriptor,
  ) => Promise<PermissionState>
  requestPermission?: (
    descriptor?: FileSystemHandlePermissionDescriptor,
  ) => Promise<PermissionState>
  isSameEntry: (other: FileSystemHandle) => Promise<boolean>
}

interface FilePickerAcceptType {
  description?: string
  accept: Record<string, string | string[]>
}

interface SaveFilePickerOptions {
  suggestedName?: string
  types?: FilePickerAcceptType[]
  excludeAcceptAllOption?: boolean
  id?: string
}

interface OpenFilePickerOptions {
  multiple?: boolean
  types?: FilePickerAcceptType[]
  excludeAcceptAllOption?: boolean
  id?: string
}

interface Window {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>
  showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>
}

interface DataTransferItem {
  /** Chromium only; how a dropped file keeps its link to disk. */
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>
}
