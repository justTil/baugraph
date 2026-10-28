import { describe, expect, it } from 'vitest'
import { INDUSTRY_GROUPS, NODE_TYPES, nodeType } from '@/features/diagram/data/node-types'
import { TECH_CATEGORIES, TECH_ITEMS, techCategory } from '@/features/diagram/data/tech'
import { hasIcon } from '@/features/diagram/data/icons'
import { searchPalette } from '@/features/diagram/data/palette'

/** What the file format accepts for `type` and `tech` (see `catalogueIdSchema`). */
const CATALOGUE_ID = /^[a-z0-9_]+$/

const duplicates = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i)

describe('node-type catalogue', () => {
  it('has unique ids the file format accepts', () => {
    const ids = NODE_TYPES.map((type) => type.id)
    expect(duplicates(ids)).toEqual([])
    expect(ids.filter((id) => !CATALOGUE_ID.test(id))).toEqual([])
  })

  it('only names icons the registry ships, so none renders blank', () => {
    const missing = NODE_TYPES.flatMap((type) =>
      [type.icon, type.listIcon].filter((icon): icon is string => !!icon && !hasIcon(icon)),
    )
    expect(missing).toEqual([])
  })

  it('only suggests technology categories that exist', () => {
    const broken = NODE_TYPES.filter((type) => type.tech && !techCategory(type.tech))
    expect(broken.map((type) => type.id)).toEqual([])
  })
})

describe('technology catalogue', () => {
  it('has unique ids the file format accepts', () => {
    const ids = TECH_ITEMS.map((item) => item.id)
    expect(duplicates(ids)).toEqual([])
    expect(ids.filter((id) => !CATALOGUE_ID.test(id))).toEqual([])
  })

  it('maps every category to a node type that exists', () => {
    const broken = TECH_CATEGORIES.filter((category) => !nodeType(category.nodeType))
    expect(broken.map((category) => category.id)).toEqual([])
  })
})

describe('industry packs', () => {
  it('ships one pack per industry', () => {
    expect(INDUSTRY_GROUPS.map((group) => group.id)).toEqual([
      'banking',
      'telco',
      'insurance',
      'healthcare',
      'retail',
      'manufacturing',
    ])
    for (const group of INDUSTRY_GROUPS) expect(group.types.length).toBeGreaterThanOrEqual(5)
  })

  it('are found by the palette search, aliases included', () => {
    const hits = (query: string) =>
      searchPalette(query)
        .filter((group) => group.kind === 'types')
        .flatMap((group) => group.items.map((item) => item.type))
    expect(hits('hlr')).toContain('subscriber_db')
    expect(hits('fhir')).toContain('interface_engine')
    expect(hits('point of sale')).toContain('pos')
  })

  it('carry the industry flag through to the palette', () => {
    const banking = searchPalette('').find((group) => group.id === 'banking')
    expect(banking?.industry).toBe(true)
    expect(searchPalette('').find((group) => group.id === 'compute')?.industry).toBeFalsy()
  })
})
