import { describe, expect, it } from 'vitest'
import {
  authorFromDraft,
  emailHref,
  initials,
  websiteHref,
  websiteLabel,
} from '@/features/diagram/lib/authors'

describe('websiteHref', () => {
  it('keeps http and https addresses', () => {
    expect(websiteHref('https://example.com/about')).toBe('https://example.com/about')
    expect(websiteHref('HTTP://example.com')).toBe('HTTP://example.com')
  })

  it('completes a bare domain to https', () => {
    expect(websiteHref('example.com')).toBe('https://example.com')
    expect(websiteHref('//example.com')).toBe('https://example.com')
  })

  it('never links any other scheme', () => {
    expect(websiteHref('javascript:alert(1)')).toBeNull()
    expect(websiteHref('  JavaScript:alert(1)')).toBeNull()
    expect(websiteHref('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(websiteHref('file:///etc/passwd')).toBeNull()
  })

  it('has nothing to link for a blank value', () => {
    expect(websiteHref(undefined)).toBeNull()
    expect(websiteHref('   ')).toBeNull()
  })
})

describe('emailHref', () => {
  it('links a plain address', () => {
    expect(emailHref('ada@example.com')).toBe('mailto:ada@example.com')
  })

  it('refuses anything that could add to the mail being composed', () => {
    expect(emailHref('ada@example.com?subject=hi')).toBeNull()
    expect(emailHref('ada@example.com#x')).toBeNull()
    expect(emailHref('ada @example.com')).toBeNull()
    expect(emailHref('not an address')).toBeNull()
  })
})

describe('display', () => {
  it('shows a website without its scheme or trailing slash', () => {
    expect(websiteLabel('https://example.com/')).toBe('example.com')
    expect(websiteLabel('example.com/team')).toBe('example.com/team')
  })

  it('takes initials from the first and last name', () => {
    expect(initials('Ada Lovelace')).toBe('AL')
    expect(initials('Ada King Lovelace')).toBe('AL')
    expect(initials('ada')).toBe('A')
    expect(initials('Élodie Ünal')).toBe('ÉÜ')
  })
})

describe('authorFromDraft', () => {
  it('needs a name', () => {
    expect(authorFromDraft({ name: '  ', email: 'ada@example.com', website: '' })).toBeNull()
  })

  it('trims fields and leaves blank contacts out', () => {
    expect(authorFromDraft({ name: ' Ada ', email: ' ', website: ' example.com ' })).toEqual({
      name: 'Ada',
      website: 'example.com',
    })
  })
})
