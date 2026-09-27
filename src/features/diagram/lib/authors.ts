import type { DiagramAuthor } from '@/model'

/**
 * Showing a diagram's authors, and turning what someone typed into one.
 *
 * A diagram file is something people pass around, so what it says about its
 * authors is treated as text from a stranger: only addresses that can do
 * nothing but open a page or a mail client are ever made into links.
 */

/** Up to two initials, for the avatar beside a name. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? [words[0]!, words.at(-1)!] : words
  return letters.map((word) => [...word][0]!.toUpperCase()).join('')
}

/**
 * Where a website link goes, or `null` when it should stay plain text.
 *
 * `example.com` is completed to `https://example.com` — what anyone typing a
 * bare domain means. Any other scheme (`javascript:`, `data:`, `file:`) is left
 * unlinked: a file cannot be allowed to put a script behind a click.
 */
export function websiteHref(website: string | undefined): string | null {
  const value = website?.trim()
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null
  return `https://${value.replace(/^\/+/, '')}`
}

/** A website as a reader wants to see it: no scheme, no trailing slash. */
export function websiteLabel(website: string): string {
  return website.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

/** Mail link for an address, or `null` when it cannot be one. */
export function emailHref(email: string | undefined): string | null {
  const value = email?.trim()
  // An address has no whitespace, and a `?` or `#` would smuggle a subject or
  // body into the mail being composed.
  if (!value || /[\s?#]/.test(value) || !value.includes('@')) return null
  return `mailto:${value}`
}

/** Form fields as typed, before they are an author. */
export interface AuthorDraft {
  name: string
  email: string
  website: string
}

export const draftOf = (author?: DiagramAuthor): AuthorDraft => ({
  name: author?.name ?? '',
  email: author?.email ?? '',
  website: author?.website ?? '',
})

/**
 * The author a draft describes, or `null` while it has no name — the one field
 * the format requires. Blank contact fields are left out rather than stored as
 * empty strings.
 */
export function authorFromDraft(draft: AuthorDraft): DiagramAuthor | null {
  const name = draft.name.trim()
  if (!name) return null
  const email = draft.email.trim()
  const website = draft.website.trim()
  return { name, ...(email ? { email } : {}), ...(website ? { website } : {}) }
}
