<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as monaco from 'monaco-editor/editor/editor.api'
// The minimal core API doesn't register copy/cut/paste/undo/redo as
// commands on its own; without this, Ctrl/Cmd+V does nothing.
import 'monaco-editor/editor/browser/coreCommands'
import { jsonDefaults } from 'monaco-editor/languages/features/json/register'
import '@/lib/monaco-env'
import { SCHEMA_URL } from '@/model'

const props = defineProps<{
  modelValue: string
  dark: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const container = ref<HTMLDivElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null

/**
 * Live diagnostics against the same schema a `.baugraph.json` file is
 * validated against — pasted JSON gets red squiggles for structural mistakes
 * as it's typed, rather than only an error once you try to switch back.
 */
async function loadSchema() {
  try {
    const schema = await fetch(SCHEMA_URL).then((res) => res.json())
    jsonDefaults.setDiagnosticsOptions({
      validate: true,
      schemas: [{ uri: new URL(SCHEMA_URL, window.location.origin).href, fileMatch: ['*'], schema }],
    })
  } catch {
    // Editing still works without live validation.
  }
}

onMounted(() => {
  if (!container.value) return
  void loadSchema()

  editor = monaco.editor.create(container.value, {
    value: props.modelValue,
    language: 'json',
    theme: props.dark ? 'vs-dark' : 'vs',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 12,
    scrollBeyondLastLine: false,
    tabSize: 2,
  })

  editor.onDidChangeModelContent(() => {
    const value = editor?.getValue() ?? ''
    if (value !== props.modelValue) emit('update:modelValue', value)
  })
})

// The document is reset from outside whenever the tab is (re)opened; anything
// typed since the last such reset is what `onDidChangeModelContent` owns.
watch(
  () => props.modelValue,
  (value) => {
    if (editor && value !== editor.getValue()) editor.setValue(value)
  },
)

watch(
  () => props.dark,
  (dark) => monaco.editor.setTheme(dark ? 'vs-dark' : 'vs'),
)

onBeforeUnmount(() => editor?.dispose())

defineExpose({ focus: () => editor?.focus() })
</script>

<template>
  <div ref="container" class="size-full" />
</template>
