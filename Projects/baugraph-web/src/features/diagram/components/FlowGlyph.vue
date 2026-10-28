<script setup lang="ts">
/**
 * A small drawing of what a flow setting will actually look like.
 *
 * Every choice a flow offers is a visual one — a shape travelling a line, a line
 * that moves on its own, a message that multiplies at a fork — and none of it
 * survives being described in two words. So each option carries its own picture,
 * drawn from the same geometry the canvas uses, and the words underneath are
 * there to name what you are already looking at.
 *
 * `colour` is the flow's own, so the preview is the thing itself rather than an
 * illustration of it. The line under it is `currentColor`, which lets the toggle
 * it sits in dim the whole preview when the option is not the chosen one.
 */

withDefaults(
  defineProps<{
    kind:
      | 'dot'
      | 'packet'
      | 'envelope'
      | 'motion-token'
      | 'motion-dash'
      | 'motion-both'
      | 'fork-broadcast'
      | 'fork-sequence'
      | 'send-burst'
      | 'send-stream'
    colour: string
    /** Half-strength, for "whatever the flow already uses". */
    faint?: boolean
  }>(),
  { faint: false },
)

/** The background the canvas would draw behind a message, for its outline. */
const BEHIND = 'var(--popover)'
</script>

<template>
  <!--
    Sized inline, not by class: the toggle these sit in stamps `size-3.5` on any
    descendant svg that does not carry a size of its own, and would flatten the
    preview to an icon.
  -->
  <svg
    viewBox="0 0 44 20"
    class="shrink-0"
    :style="{ width: '44px', height: '20px', opacity: faint ? 0.45 : 1 }"
    aria-hidden="true"
  >
    <!-- ------------------------------------------------ the message shapes -->
    <template v-if="kind === 'dot' || kind === 'packet' || kind === 'envelope'">
      <line
        x1="3"
        y1="10"
        x2="41"
        y2="10"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        opacity="0.3"
      />
      <circle v-if="kind === 'dot'" cx="22" cy="10" r="3.8" :fill="colour" />
      <rect
        v-else-if="kind === 'packet'"
        x="15.5"
        y="5.5"
        width="13"
        height="9"
        rx="2.5"
        :fill="colour"
      />
      <template v-else>
        <rect x="14.5" y="4.5" width="15" height="11" rx="1.8" :fill="colour" />
        <path
          d="M14.5,4.5 L22,10.6 L29.5,4.5"
          fill="none"
          :stroke="BEHIND"
          stroke-width="1.3"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </template>
    </template>

    <!-- ------------------------------------------------------- how it moves -->
    <template v-else-if="kind === 'motion-token'">
      <line
        x1="3"
        y1="10"
        x2="41"
        y2="10"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        opacity="0.3"
      />
      <circle cx="15" cy="10" r="3.2" :fill="colour" />
      <circle cx="29" cy="10" r="3.2" :fill="colour" />
    </template>

    <template v-else-if="kind === 'motion-dash'">
      <line
        x1="4"
        y1="10"
        x2="40"
        y2="10"
        :stroke="colour"
        stroke-width="2.6"
        stroke-linecap="round"
        stroke-dasharray="5 6"
      />
    </template>

    <template v-else-if="kind === 'motion-both'">
      <line
        x1="4"
        y1="10"
        x2="40"
        y2="10"
        :stroke="colour"
        stroke-width="2.6"
        stroke-linecap="round"
        stroke-dasharray="5 6"
        opacity="0.55"
      />
      <circle cx="22" cy="10" r="3.8" :fill="colour" :stroke="BEHIND" stroke-width="1.2" />
    </template>

    <!--
      A fork. The same three branches either way — what changes is how many
      messages are on them at once, which is the whole of the difference.
    -->
    <template v-else-if="kind === 'fork-broadcast' || kind === 'fork-sequence'">
      <g
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        opacity="0.3"
      >
        <path d="M3,10 H16" />
        <path d="M16,10 C24,10 26,3 38,3" />
        <path d="M16,10 H38" />
        <path d="M16,10 C24,10 26,17 38,17" />
      </g>
      <template v-if="kind === 'fork-broadcast'">
        <circle cx="33" cy="3" r="3" :fill="colour" />
        <circle cx="33" cy="10" r="3" :fill="colour" />
        <circle cx="33" cy="17" r="3" :fill="colour" />
      </template>
      <template v-else>
        <circle cx="33" cy="3" r="3" :fill="colour" />
        <circle cx="33" cy="10" r="2.6" fill="none" :stroke="colour" stroke-width="1.2" opacity="0.5" />
        <circle cx="33" cy="17" r="2.6" fill="none" :stroke="colour" stroke-width="1.2" opacity="0.5" />
      </template>
    </template>

    <!--
      What the line looks like over time: a burst leaves a quiet line behind it,
      a stream never empties.
    -->
    <template v-else>
      <line
        x1="3"
        y1="10"
        x2="41"
        y2="10"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        opacity="0.3"
      />
      <template v-if="kind === 'send-burst'">
        <circle cx="8" cy="10" r="3" :fill="colour" />
        <circle cx="16" cy="10" r="3" :fill="colour" />
      </template>
      <template v-else>
        <circle cx="7" cy="10" r="2.8" :fill="colour" />
        <circle cx="15" cy="10" r="2.8" :fill="colour" />
        <circle cx="23" cy="10" r="2.8" :fill="colour" />
        <circle cx="31" cy="10" r="2.8" :fill="colour" />
        <circle cx="39" cy="10" r="2.8" :fill="colour" />
      </template>
    </template>
  </svg>
</template>
