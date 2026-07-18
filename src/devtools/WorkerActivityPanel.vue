<script setup lang="ts">
import { computed } from 'vue'
import type { WorkerActivityMonitor } from './createWorkerActivityMonitor'

const props = defineProps<{
  monitor: WorkerActivityMonitor
}>()

const snapshot = computed(() => props.monitor.snapshot.value)

function formatMs(value: number | null): string {
  if (value === null) return '—'
  return `${Math.round(value)} ms`
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString()
}
</script>

<template>
  <div
    style="
      font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
      border: 1px solid #3336;
      border-radius: 6px;
      padding: 10px 12px;
      max-width: 360px;
      background: canvas;
      color: canvastext;
    "
  >
    <div style="font-weight: 600; margin-bottom: 6px">vue-worker-kit — activity</div>

    <div style="display: flex; gap: 12px; margin-bottom: 8px">
      <div><strong>{{ snapshot.busy }}</strong> busy</div>
      <div><strong>{{ snapshot.idle }}</strong> idle</div>
      <div><strong>{{ snapshot.queued }}</strong> queued</div>
      <div>avg <strong>{{ formatMs(snapshot.averageTaskMs) }}</strong></div>
    </div>

    <div style="display: flex; align-items: center; justify-content: space-between">
      <span style="opacity: 0.7">recent errors ({{ snapshot.recentErrors.length }})</span>
      <button
        type="button"
        style="font: inherit; cursor: pointer; background: none; border: none; color: inherit; opacity: 0.7"
        @click="monitor.clearErrors()"
      >
        clear
      </button>
    </div>

    <ul v-if="snapshot.recentErrors.length" style="margin: 4px 0 0; padding-left: 16px">
      <li v-for="err in snapshot.recentErrors" :key="err.at" style="color: #e5484d">
        [{{ formatTime(err.at) }}] {{ err.name }}: {{ err.message }}
      </li>
    </ul>
    <div v-else style="opacity: 0.5; margin-top: 4px">none</div>
  </div>
</template>
