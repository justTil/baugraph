<script setup lang="ts">
import AppShell from '@/components/layout/AppShell.vue'
import WorkspaceDock from '@/features/workspace/components/WorkspaceDock.vue'
</script>

<template>
  <AppShell>
    <!--
      Which views are on screen, and how they are arranged, is the dock's
      business now - the shell only hands it the space below the header.
    -->
    <WorkspaceDock />
  </AppShell>
</template>
