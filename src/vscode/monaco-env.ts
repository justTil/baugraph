/**
 * Monaco's workers, for the webview build.
 *
 * The web app loads each worker as its own file (`src/lib/monaco-env.ts`). A
 * webview cannot: its scripts come from a `vscode-webview:` resource URI, which
 * the worker constructor will not accept. `?worker&inline` bundles the worker
 * into the page and starts it from a blob instead — which the extension's
 * Content-Security-Policy allows, and nothing else does.
 *
 * Swapped in by an alias in `vite.vscode.config.ts`, so nothing that imports
 * `@/lib/monaco-env` has to know which build it is in.
 */
import EditorWorker from 'monaco-editor/editor/editor.worker?worker&inline'
import JsonWorker from 'monaco-editor/language/json/json.worker?worker&inline'

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    return label === 'json' ? new JsonWorker() : new EditorWorker()
  },
}
