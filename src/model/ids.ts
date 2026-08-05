/**
 * Id generation.
 *
 * Ids end up in the committed file, so they are derived from the label rather
 * than random: `api-gateway`, `api-gateway-2`, … A renamed node keeps its
 * original id, which is what stops a rename from rewriting every edge in the diff.
 */

export function slugify(input: string, fallback = 'node'): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || fallback
}

/** Returns `base`, or `base-2`, `base-3`… until it is free in `taken`. */
export function uniqueId(base: string, taken: Iterable<string>): string {
  const used = taken instanceof Set ? taken : new Set(taken)
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

export function nodeId(label: string, taken: Iterable<string>): string {
  return uniqueId(slugify(label, 'node'), taken)
}

export function edgeId(source: string, target: string, taken: Iterable<string>): string {
  return uniqueId(`${source}--${target}`, taken)
}
