/**
 * Regenerates `public/schema/baugraph-v1.schema.json` from the zod schema so the
 * published JSON Schema can never drift from what the app actually accepts.
 *
 *   npm run schema:generate
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { documentSchema } from '@/model/schema'
import { FORMAT_VERSION } from '@/model/types'
import { SCHEMA_URL } from '@/model/serialize'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outFile = resolve(root, `public${SCHEMA_URL}`)

const jsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: `https://baugraph.local/schema/v${FORMAT_VERSION}/baugraph.schema.json`,
  title: 'Baugraph diagram',
  description: `Baugraph diagram document, format version ${FORMAT_VERSION}.`,
  ...z.toJSONSchema(documentSchema, { io: 'input', target: 'draft-2020-12' }),
}

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, `${JSON.stringify(jsonSchema, null, 2)}\n`)

console.log(`wrote ${outFile.replace(`${root}/`, '')}`)
