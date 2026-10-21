<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { isSupersededError, useWorker } from 'vue-worker-kit'
import { useWorkerPool } from 'vue-worker-kit/pool'

const card = 'border: 1px solid #8883; border-radius: 8px; padding: 16px; margin-bottom: 20px'

const query = ref('')
const searchResult = ref('')
const supersededCount = ref(0)
const searchHard = ref(true)

const search = computed(() =>
  useWorker<typeof import('./workers/search.worker')>(
    () => new Worker(new URL('./workers/search.worker.ts', import.meta.url), { type: 'module' }),
    { concurrency: 'latest', hardCancelOnAbort: searchHard.value },
  ),
)

watch(query, async (value) => {
  if (!value) return
  try {
    searchResult.value = await search.value.run({ query: value, ms: 600 })
  } catch (caught) {
    if (isSupersededError(caught)) supersededCount.value++
  }
})

const loopMs = 4000
const loopOutcome = ref('')
const loopWorker = useWorker<typeof import('./workers/yield.worker')>(
  () => new Worker(new URL('./workers/yield.worker.ts', import.meta.url), { type: 'module' }),
)

async function startLoop(cooperative: boolean) {
  loopOutcome.value = 'running…'
  const startedAt = Date.now()
  try {
    const steps = await loopWorker.run({ ms: loopMs, cooperative })
    loopOutcome.value = `finished after ${Date.now() - startedAt} ms, ${steps} steps`
  } catch {
    loopOutcome.value = `cancelled after ${Date.now() - startedAt} ms`
  }
}

async function cancelLoop() {
  const startedAt = Date.now()
  loopWorker.cancel()
  await loopWorker.run({ ms: 0, cooperative: true })
  loopOutcome.value += `; next call answered ${Date.now() - startedAt} ms after cancel()`
}

const pool = useWorkerPool<typeof import('./workers/crashy.worker')>(
  () => new Worker(new URL('./workers/crashy.worker.ts', import.meta.url), { type: 'module' }),
  { size: 2 },
)
const poolLog = ref<string[]>([])
let taskId = 0

async function addTask(crash: boolean) {
  const id = ++taskId
  try {
    const done = await pool.run({ id, crash })
    poolLog.value.unshift(`task ${done} done`)
  } catch (caught) {
    poolLog.value.unshift(`task ${id} failed: ${(caught as Error).message}`)
  }
}

function addBatch() {
  for (let index = 0; index < 6; index++) void addTask(false)
}

const tools = useWorker<typeof import('./workers/tools.worker')>(
  () => new Worker(new URL('./workers/tools.worker.ts', import.meta.url), { type: 'module' }),
)
const toolsText = ref('typed operations in one worker')
const toolsOutput = ref('')

async function callTool(name: 'wordCount' | 'reverse' | 'checksum') {
  const output =
    name === 'wordCount'
      ? await tools.call('wordCount', { text: toolsText.value })
      : name === 'reverse'
        ? await tools.call('reverse', { text: toolsText.value })
        : await tools.call('checksum', { text: toolsText.value })
  toolsOutput.value = `${name}: ${JSON.stringify(output)}`
}
</script>

<template>
  <section :style="card">
    <h2>7. concurrency: 'latest' + hardCancelOnAbort — live search</h2>
    <p>
      Every keystroke starts a 600 ms synchronous computation. A newer run supersedes the older
      ones; with hardCancelOnAbort the busy worker is terminated at once instead of finishing stale
      work.
    </p>
    <label><input v-model="searchHard" type="checkbox" /> hardCancelOnAbort</label>
    <p><input v-model="query" placeholder="type quickly…" /></p>
    <p>
      result: <strong>{{ searchResult }}</strong> — superseded runs:
      <strong>{{ supersededCount }}</strong>
    </p>
  </section>

  <section :style="card">
    <h2>8. ctx.yield() — a long loop that can be cancelled</h2>
    <p>
      A {{ loopMs / 1000 }} s loop in the worker. Without ctx.yield() the worker cannot receive the
      cancel message until the loop ends; with it, the cancel lands within milliseconds.
    </p>
    <button @click="startLoop(false)">Start loop without yield</button>
    <button @click="startLoop(true)">Start loop with yield</button>
    <button @click="cancelLoop">Cancel and probe</button>
    <p>{{ loopOutcome }}</p>
  </section>

  <section :style="card">
    <h2>9. Pool survives a crashed worker</h2>
    <button @click="addBatch">Add 6 tasks</button>
    <button @click="addTask(true)">Add a crashing task</button>
    <p>
      busy <strong>{{ pool.stats.value.busy }}</strong
      >, idle <strong>{{ pool.stats.value.idle }}</strong
      >, queued <strong>{{ pool.stats.value.queued }}</strong>
    </p>
    <ul>
      <li v-for="(line, index) in poolLog.slice(0, 8)" :key="index">{{ line }}</li>
    </ul>
  </section>

  <section :style="card">
    <h2>10. Typed operations — defineWorkerOperations + call()</h2>
    <p><input v-model="toolsText" style="width: 100%" /></p>
    <button @click="callTool('wordCount')">wordCount</button>
    <button @click="callTool('reverse')">reverse</button>
    <button @click="callTool('checksum')">checksum</button>
    <p>{{ toolsOutput }}</p>
  </section>
</template>
