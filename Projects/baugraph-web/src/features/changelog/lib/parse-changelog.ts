/**
 * A small parser for this project's `changelog.md`.
 *
 * The file follows the Keep a Changelog shape closely enough that a full
 * Markdown engine would be overkill: releases are `##` headings, the
 * Added/Changed/Fixed groups under them are `###` headings, and everything
 * else is either a bullet list or a short paragraph. Parsing it into a small
 * typed tree lets the viewer lay it out as a real release history rather than
 * a wall of rendered Markdown.
 *
 * Inline Markdown inside an item (`code`, **bold**, [links](…)) is left as-is;
 * `renderInline` below turns it into HTML at display time.
 */

export type ChangeKind =
  | 'Added'
  | 'Changed'
  | 'Fixed'
  | 'Removed'
  | 'Deprecated'
  | 'Security'
  | (string & {})

export interface ChangelogItem {
  text: string
  children: ChangelogItem[]
}

export interface ChangelogSection {
  kind: ChangeKind
  items: ChangelogItem[]
}

export interface ChangelogRelease {
  /** The bare version, e.g. `1.28.0` — the surrounding `[ ]` are dropped. */
  version: string
  /** `YYYY-MM-DD` when the heading carries one. */
  date?: string
  /** Free-standing paragraphs between the release heading and its first group. */
  notes: string[]
  sections: ChangelogSection[]
}

const RELEASE_HEADING = /^##\s+\[?([^\]]+?)\]?(?:\s*[-–]\s*(.+))?\s*$/
const SECTION_HEADING = /^###\s+(.+?)\s*$/
const BULLET = /^(\s*)-\s+(.*)$/
/** Link-reference definitions at the foot of the file: `[1.28.0]: https://…`. */
const LINK_DEFINITION = /^\[[^\]]+\]:\s+\S+/

/** Parse the whole file, newest release first (source order is preserved). */
export function parseChangelog(source: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = []
  let release: ChangelogRelease | undefined
  let section: ChangelogSection | undefined
  /** The bullet each deeper-indented bullet hangs off, by indent width. */
  let stack: { indent: number; item: ChangelogItem }[] = []

  const lines = source.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const trimmed = line.trim()

    const releaseMatch = trimmed.match(RELEASE_HEADING)
    if (releaseMatch) {
      release = {
        version: releaseMatch[1]!.trim(),
        date: releaseMatch[2]?.trim(),
        notes: [],
        sections: [],
      }
      releases.push(release)
      section = undefined
      stack = []
      continue
    }

    if (!release) continue

    const sectionMatch = trimmed.match(SECTION_HEADING)
    if (sectionMatch) {
      section = { kind: sectionMatch[1]!, items: [] }
      release.sections.push(section)
      stack = []
      continue
    }

    const bulletMatch = line.match(BULLET)
    if (bulletMatch) {
      const indent = bulletMatch[1]!.length
      const item: ChangelogItem = { text: bulletMatch[2]!.trim(), children: [] }

      while (stack.length && stack[stack.length - 1]!.indent >= indent) stack.pop()
      const parent = stack[stack.length - 1]?.item
      const target = section ?? ensureLooseSection(release)
      if (parent) parent.children.push(item)
      else target.items.push(item)
      stack.push({ indent, item })
      continue
    }

    if (!trimmed || LINK_DEFINITION.test(trimmed)) {
      stack = []
      continue
    }

    // A wrapped continuation of the line above — a bullet that ran onto a
    // second line, or a second line of a paragraph.
    const last = stack[stack.length - 1]?.item
    if (last) {
      last.text += ` ${trimmed}`
    } else if (section) {
      // Prose sitting directly under a group heading is rare but valid.
      section.items.push({ text: trimmed, children: [] })
    } else {
      const notes = release.notes
      if (notes.length && !lines[i - 1]!.trim()) notes.push(trimmed)
      else if (notes.length) notes[notes.length - 1] += ` ${trimmed}`
      else notes.push(trimmed)
    }
  }

  return releases
}

/**
 * Bullets that appear under a release before any `###` heading (older entries
 * did this) still need somewhere to live.
 */
function ensureLooseSection(release: ChangelogRelease): ChangelogSection {
  const existing = release.sections.find((s) => s.kind === '')
  if (existing) return existing
  const loose: ChangelogSection = { kind: '', items: [] }
  release.sections.unshift(loose)
  return loose
}

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/**
 * The sliver of inline Markdown the changelog actually uses, as HTML.
 *
 * Everything is HTML-escaped first and the patterns run over the escaped text,
 * so the output is safe to feed to `v-html`; the source is this repo's own
 * bundled file in any case.
 */
export function renderInline(text: string): string {
  let html = escapeHtml(text)

  // [label](https://…) — only http(s), opened in a new tab.
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_all, label: string, href: string) =>
      `<a href="${href}" target="_blank" rel="noopener noreferrer" class="font-medium underline underline-offset-2 hover:no-underline">${label}</a>`,
  )
  // `code`
  html = html.replace(
    /`([^`]+)`/g,
    '<code class="bg-muted rounded px-1 py-0.5 text-[0.85em]">$1</code>',
  )
  // **bold**
  html = html.replace(
    /\*\*([^*]+)\*\*/g,
    '<strong class="text-foreground font-semibold">$1</strong>',
  )

  return html
}
