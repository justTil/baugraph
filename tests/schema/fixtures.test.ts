import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020'
import { describe, expect, it } from 'vitest'
import { parse, safeParse, stringify } from '@/model/serialize'

const here = dirname(fileURLToPath(import.meta.url))
const fixturesRoot = resolve(here, '../fixtures')
const schemaDir = resolve(here, '../../public/schema')

/**
 * Fixture directories are named after the **release version** that produced /
 * blessed them (e.g. `1.28.0`), taken from `version.txt` — not the format
 * version in the file (`"baugraph": "1.0"`). That way a failing test points
 * straight at the release where a document stopped being handled.
 */
const RELEASE_DIR = /^\d+\.\d+\.\d+$/

/** `1.10.0` sorts after `1.9.0`. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return (pa[i] ?? 0) - (pb[i] ?? 0)
  }
  return 0
}

function jsonFilesIn(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => join(dir, e.name))
    .sort()
}

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf-8'))

/**
 * The one JSON Schema the app currently publishes. Backward compatibility is the
 * point of this suite, so every release's fixtures validate against the *current*
 * published schema, whichever major it is.
 */
function compilePublishedSchema(): { file: string; validate: ValidateFunction } | null {
  if (!existsSync(schemaDir)) return null
  const schemas = readdirSync(schemaDir)
    .filter((n) => /^baugraph-v\d+\.schema\.json$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
  const name = schemas.at(-1)
  if (!name) return null
  // Lenient on purpose: these tests exercise documents, not the schema's own
  // strictness — a schema quirk should not fail an otherwise-valid fixture.
  const ajv = new Ajv2020({ strict: false, allErrors: true })
  return { file: name, validate: ajv.compile(readJson(join(schemaDir, name)) as object) }
}

const published = compilePublishedSchema()

const releaseDirs = existsSync(fixturesRoot)
  ? readdirSync(fixturesRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory() && RELEASE_DIR.test(e.name))
      .map((e) => e.name)
      .sort(compareVersions)
  : []

if (releaseDirs.length === 0) {
  describe('schema fixtures', () => {
    it.skip('no tests/fixtures/<version> directories yet — see tests/fixtures/README.md', () => {})
  })
}

for (const version of releaseDirs) {
  const base = join(fixturesRoot, version)
  const validFiles = [...jsonFilesIn(base), ...jsonFilesIn(join(base, 'valid'))]
  const invalidFiles = jsonFilesIn(join(base, 'invalid'))

  describe(`baugraph ${version}`, () => {
    describe('valid fixtures', () => {
      if (validFiles.length === 0) it.skip('none provided', () => {})

      for (const file of validFiles) {
        const name = file.slice(base.length + 1)

        it(`${name} — parses`, () => {
          const result = safeParse(readFileSync(file, 'utf-8'))
          if (!result.ok) {
            throw new Error(
              `${name} failed to parse:\n` +
                result.error.issues.map((i) => `  ${i.path}: ${i.message}`).join('\n'),
            )
          }
        })

        it(`${name} — validates against ${published?.file ?? 'the published JSON Schema'}`, () => {
          expect(published, 'no published schema in public/schema').not.toBeNull()
          if (!published) return
          const ok = published.validate(readJson(file))
          if (!ok) {
            throw new Error(
              `${name} failed JSON Schema validation:\n` +
                (published.validate.errors ?? [])
                  .map((e) => `  ${e.instancePath || '/'} ${e.message}`)
                  .join('\n'),
            )
          }
        })

        it(`${name} — round-trips through stringify → parse`, () => {
          const doc = parse(readFileSync(file, 'utf-8'))
          expect(parse(stringify(doc))).toEqual(doc)
        })
      }
    })

    describe('invalid fixtures', () => {
      if (invalidFiles.length === 0) it.skip('none provided', () => {})

      for (const file of invalidFiles) {
        const name = file.slice(base.length + 1)
        it(`${name} — is rejected`, () => {
          const result = safeParse(readFileSync(file, 'utf-8'))
          expect(result.ok, `${name} was accepted but should be invalid`).toBe(false)
        })
      }
    })
  })
}
