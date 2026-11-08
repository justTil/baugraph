import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { messages, registrations, reset } from './vscode.stub'
import { activate } from '../../extension/src/extension'
import { parse, stringify } from '@/model'

/**
 * The extension host, loaded against a stand-in for the `vscode` module.
 *
 * Two things are worth holding still here. One is what the extension registers:
 * a custom editor bound to `baugraph.editor`, a formatter, and the commands the
 * manifest promises — a name that drifts apart from `package.json` produces a
 * command that is advertised and does nothing. The other is that the *format*
 * survives the trip: the host bundles `@/model` and runs it in Node, away from
 * Vite and away from a browser, and writes files with it.
 */

const here = dirname(fileURLToPath(import.meta.url))
const fixture = resolve(here, '../fixtures/1.28.0/valid/order-processing.json')

const context = { subscriptions: [] as unknown[], extensionUri: { path: '/ext' } }

/**
 * A `TextDocument` as far as the formatter is concerned. The `vscode` types are
 * not installed here — they belong to the extension's own package — so the
 * shapes the test needs are spelled out instead of imported.
 */
function document(text: string) {
  return {
    getText: () => text,
    lineCount: text.split('\n').length,
    uri: { scheme: 'file', path: '/w/diagram.baugraph.json' },
    isDirty: false,
    isClosed: false,
  }
}

type StubDocument = ReturnType<typeof document>

interface Formatter {
  provideDocumentFormattingEdits(target: StubDocument): { newText: string }[]
}

const format = (text: string) => {
  const formatter = registrations.find((r) => r.kind === 'formatter')!.value as Formatter
  return formatter.provideDocumentFormattingEdits(document(text))
}

beforeAll(() => {
  reset()
  activate(context as never)
})

describe('the extension host', () => {
  it('registers the custom editor the manifest declares', () => {
    const editor = registrations.find((r) => r.kind === 'customEditor')
    expect(editor?.id).toBe('baugraph.editor')
    // The canvas holds a viewport and an undo stack that a rebuild would lose.
    expect(editor?.options).toMatchObject({ webviewOptions: { retainContextWhenHidden: true } })
  })

  it('registers every command the manifest declares', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(here, '../../extension/package.json'), 'utf-8'),
    ) as { contributes: { commands: { command: string }[] } }

    const registered = registrations.filter((r) => r.kind === 'command').map((r) => r.id)
    expect(registered.sort()).toEqual(manifest.contributes.commands.map((c) => c.command).sort())
  })

  it('disposes of everything it registered with the extension', () => {
    expect(context.subscriptions.length).toBe(registrations.length)
  })
})

describe('formatting a diagram file', () => {
  it('rewrites it exactly as the editor would have saved it', () => {
    const text = readFileSync(fixture, 'utf-8')
    const [edit] = format(text)
    expect(edit?.newText).toBe(stringify(parse(text)))
  })

  it('leaves a file that is already canonical alone', () => {
    expect(format(stringify(parse(readFileSync(fixture, 'utf-8'))))).toEqual([])
  })

  it('does not touch a file it cannot read, and says why', () => {
    reset()
    activate(context as never)
    expect(format('{ "baugraph": "1.0", "nodes": "not a list" }')).toEqual([])
    expect(messages.at(-1)?.level).toBe('warning')
  })
})
