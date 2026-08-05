<script setup lang="ts">
import LumaMiddlewareHub from '@/features/lmh/components/LumaMiddlewareHub.vue'
</script>

<template>
  <section class="bg-card text-card-foreground rounded-xl border p-6">
    <h2 class="font-medium">
      Übersicht
    </h2>
    <p class="text-muted-foreground mt-1 text-sm">
      Aufbau des Luma Middleware Hub. Zeilen zeigen die Aufgabe eines Bausteins,
      Spalten den Ort: links die Cloud (FCN Space), rechts das eigene Rechenzentrum.
      Über den Message Bus erreicht jede Engine jeden Broker – auch über die
      Netzwerkgrenze hinweg.
    </p>

    <div class="mt-6">
      <LumaMiddlewareHub :show-steps="false" show-legend />
    </div>
  </section>
</template>
