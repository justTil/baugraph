<script setup lang="ts">
// Only the baugraph.com deployment has an operator to name — a self-hosted
// instance drops these, exactly like the app's own sidebar does.
import { imprintUrl, site } from '../../../src/config/legal'

// Absolute, not `/#legal`: a root-relative link only resolves to the app when
// the docs happen to be served from the same origin. That's true in
// production (baugraph.com/docs next to baugraph.com/), but not when the
// docs are reached on their own origin — the VitePress dev server on its own
// port, say — where nothing lives at bare `/` and the link 404s.
const legalUrl = `${site.url}#legal`

// `__SELF_HOSTED__` is a build-time global (see config.ts's `vite.define`),
// not a script-setup binding — read into a local first, or the template
// compiler resolves the bare identifier as `_ctx.__SELF_HOSTED__` instead.
const selfHosted = __SELF_HOSTED__
</script>

<template>
  <div v-if="!selfHosted" class="legal-footer">
    <a :href="legalUrl">Legal &amp; privacy</a>
    <span aria-hidden="true">·</span>
    <a :href="imprintUrl" target="_blank" rel="noopener noreferrer">Impressum</a>
  </div>
</template>

<style scoped>
.legal-footer {
  display: flex;
  justify-content: center;
  gap: 0.75rem;
  padding: 8px 24px 32px;
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.legal-footer a {
  color: inherit;
  text-decoration: none;
}

.legal-footer a:hover {
  color: var(--vp-c-text-1);
  text-decoration: underline;
}
</style>
