<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import license from '../../../../LICENSE?raw'
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-4 overflow-y-auto p-6">
    <Card>
      <CardHeader>
        <CardTitle>MIT License</CardTitle>
      </CardHeader>
      <CardContent>
        <pre class="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">{{ license }}</pre>
      </CardContent>
    </Card>
  </div>
</template>
