<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import license from '../../../../LICENSE?raw'
import notice from '../../../../NOTICE?raw'
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-4 overflow-y-auto p-6">
    <Card>
      <CardHeader>
        <CardTitle>Notice</CardTitle>
      </CardHeader>
      <CardContent>
        <pre class="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">{{ notice }}</pre>
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle>Apache License 2.0</CardTitle>
      </CardHeader>
      <CardContent>
        <pre class="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">{{ license }}</pre>
      </CardContent>
    </Card>
  </div>
</template>
