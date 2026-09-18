<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronDown, ChevronUp, Pencil, Trash2, UserPlus, Users } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import AuthorForm from '@/features/diagram/components/AuthorForm.vue'
import type { AuthorDraft } from '@/features/diagram/lib/authors'
import {
  authorFromDraft,
  draftOf,
  emailHref,
  initials,
  websiteHref,
  websiteLabel,
} from '@/features/diagram/lib/authors'

/**
 * Who made the diagram — `meta.authors` — shown and edited from the panel you
 * see when nothing is selected, since authorship belongs to the diagram as a
 * whole.
 *
 * An author is edited as a draft and saved in one step rather than live, field
 * by field like the rest of the inspector: the format refuses an author with
 * no name, so a half-typed one must never reach the document — it would be
 * autosaved, and an autosave that fails to parse loses the whole diagram.
 * Saving is also one undo step, not one per keystroke.
 */

const { meta, commit, endCoalesce, addAuthor, updateAuthor, removeAuthor, moveAuthor } =
  useDiagram()

const authors = computed(() => meta.authors ?? [])

/** Which author the form is open for: an index, a new one, or none. */
const editing = ref<number | 'new' | null>(null)
const draft = ref<AuthorDraft>(draftOf())

function open(target: number | 'new') {
  draft.value = draftOf(target === 'new' ? undefined : authors.value[target])
  editing.value = target
}

function close() {
  editing.value = null
}

function act(fn: () => void) {
  commit()
  endCoalesce()
  fn()
}

function save() {
  const author = authorFromDraft(draft.value)
  if (!author || editing.value === null) return
  const target = editing.value
  act(() => (target === 'new' ? addAuthor(author) : updateAuthor(target, author)))
  close()
}

function remove(index: number) {
  act(() => removeAuthor(index))
  if (editing.value === index) close()
}

function move(index: number, by: -1 | 1) {
  act(() => moveAuthor(index, by))
}

// Every change replaces the list, so a new one means the authors moved under
// an open edit — an undo, a reorder, another document arriving. The form is
// addressed by position, and saving it now could overwrite a different person.
watch(
  () => meta.authors,
  () => {
    if (typeof editing.value === 'number') close()
  },
)
</script>

<template>
  <section class="border-b">
    <header class="bg-muted/50 flex items-center gap-1.5 border-b px-3 py-2">
      <Users class="text-muted-foreground size-3.5 shrink-0" />
      <span class="text-muted-foreground text-[10px] font-bold tracking-[0.09em] uppercase">
        Authors
      </span>
      <span v-if="authors.length" class="text-muted-foreground/70 ml-auto text-[10px]">
        {{ authors.length }}
      </span>
    </header>

    <div class="space-y-1 p-3">
      <p
        v-if="!authors.length && editing !== 'new'"
        class="text-muted-foreground pb-1 text-xs leading-relaxed"
      >
        Nobody is credited yet. Authors are saved with the diagram.
      </p>

      <template v-for="(author, index) in authors" :key="index">
        <AuthorForm
          v-if="editing === index"
          v-model="draft"
          submit-label="Save"
          @save="save"
          @cancel="close"
        />

        <div
          v-else
          class="group hover:bg-accent/60 flex items-start gap-2 rounded-md px-1.5 py-1.5"
        >
          <span
            class="bg-muted text-muted-foreground mt-px flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
            aria-hidden="true"
          >
            {{ initials(author.name) }}
          </span>
          <div class="min-w-0 flex-1 leading-tight">
            <p class="truncate text-xs font-medium" :title="author.name">{{ author.name }}</p>
            <template v-if="author.email">
              <a
                v-if="emailHref(author.email)"
                :href="emailHref(author.email)!"
                class="text-muted-foreground hover:text-foreground block truncate text-[11px] hover:underline"
                :title="author.email"
              >
                {{ author.email }}
              </a>
              <p v-else class="text-muted-foreground truncate text-[11px]">{{ author.email }}</p>
            </template>
            <template v-if="author.website">
              <a
                v-if="websiteHref(author.website)"
                :href="websiteHref(author.website)!"
                target="_blank"
                rel="noopener noreferrer"
                class="text-muted-foreground hover:text-foreground block truncate text-[11px] hover:underline"
                :title="websiteHref(author.website)!"
              >
                {{ websiteLabel(author.website) }}
              </a>
              <p v-else class="text-muted-foreground truncate text-[11px]">{{ author.website }}</p>
            </template>
          </div>
          <!--
            Out of the way until the row is hovered or tabbed into, so a list of
            names reads as a list of names rather than a row of buttons.
          -->
          <div
            class="-my-0.5 flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
          >
            <template v-if="authors.length > 1">
              <Button
                variant="ghost"
                size="icon-xs"
                class="text-muted-foreground"
                title="Credit earlier"
                :disabled="index === 0"
                @click="move(index, -1)"
              >
                <ChevronUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                class="text-muted-foreground"
                title="Credit later"
                :disabled="index === authors.length - 1"
                @click="move(index, 1)"
              >
                <ChevronDown />
              </Button>
            </template>
            <Button
              variant="ghost"
              size="icon-xs"
              class="text-muted-foreground"
              title="Edit author"
              @click="open(index)"
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              class="text-muted-foreground hover:text-destructive"
              title="Remove author"
              @click="remove(index)"
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      </template>

      <AuthorForm
        v-if="editing === 'new'"
        v-model="draft"
        submit-label="Add"
        @save="save"
        @cancel="close"
      />

      <Button v-else variant="outline" size="sm" class="mt-1 w-full" @click="open('new')">
        <UserPlus />
        Add author
      </Button>
    </div>
  </section>
</template>
