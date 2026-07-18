<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useWorker } from 'vue-worker-kit'
import { useWorkerPool } from 'vue-worker-kit/pool'
import { useWorkerComputed } from 'vue-worker-kit/computed'
import { createWorkerActivityMonitor, WorkerActivityPanel } from 'vue-worker-kit/devtools'
import { insertionSort } from './lib/insertionSort'
import { countPrimesInRange } from './lib/countPrimes'

// ---- Main-thread monitor: a dot that glides back and forth via requestAnimationFrame ----
// Deliberately driven from JS (not a CSS @keyframes animation, which the compositor thread
// can keep running even while JS is blocked) — this only moves when the main thread actually
// gets to run a frame callback. Watch it glide smoothly during a worker run, and visibly
// freeze mid-slide during a synchronous main-thread run.
//
// It also doubles as a measurement: the gap between two consecutive frame callbacks is
// normally ~16ms (60fps). If something on the main thread blocks for 2 seconds, the NEXT
// frame callback simply arrives 2 seconds late — so "longest gap between frames" is a direct,
// after-the-fact reading of "how long was the UI actually stuck", independent of how long the
// whole operation took. That's the number sections 1 uses below, instead of a completion time.
const dotPosition = ref(0)
let dotDirection = 1
let rafId: number | undefined
let lastFrameAt: number | undefined
let maxFrameGapMs = 0
function animateDot(now: number) {
  if (lastFrameAt !== undefined) {
    maxFrameGapMs = Math.max(maxFrameGapMs, now - lastFrameAt)
  }
  lastFrameAt = now
  dotPosition.value += dotDirection * 1.2
  if (dotPosition.value >= 100) dotDirection = -1
  if (dotPosition.value <= 0) dotDirection = 1
  rafId = requestAnimationFrame(animateDot)
}
onMounted(() => {
  rafId = requestAnimationFrame(animateDot)
})
onUnmounted(() => {
  if (rafId !== undefined) cancelAnimationFrame(rafId)
})

// ---- 1. useWorker: sort + progress + cancel, vs. the same work on the main thread -------
const sortSize = ref(80_000)
const sortResultPreview = ref<string>('')
const blockingRunning = ref(false)
const workerFreezeMs = ref<number | null>(null)
const blockingFreezeMs = ref<number | null>(null)

const sortWorker = useWorker<typeof import('./workers/sort.worker')>(
  () => new Worker(new URL('./workers/sort.worker.ts', import.meta.url), { type: 'module' }),
)

function randomValues(): number[] {
  return Array.from({ length: sortSize.value }, () => Math.floor(Math.random() * 1_000_000))
}

// After a long stall, a *newly* requested animation frame can resolve before `animateDot`'s
// own pending callback (queued before the stall) gets around to running and recording the
// gap — measured empirically, one rAF wait wasn't enough and read a stale value. Waiting for
// two nested frames reliably lands after animateDot has already run and recorded it.
function afterAnimationSettles(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

async function runSort() {
  const values = randomValues()
  maxFrameGapMs = 0
  try {
    const sorted = await sortWorker.run({ values })
    await afterAnimationSettles()
    workerFreezeMs.value = Math.round(maxFrameGapMs)
    sortResultPreview.value = `[${sorted.slice(0, 8).join(', ')}, …] (${sorted.length} items)`
  } catch {
    sortResultPreview.value = ''
  }
}

async function runSortBlocking() {
  const values = randomValues()
  blockingRunning.value = true
  maxFrameGapMs = 0
  // Yield one tick so Vue actually paints "blockingRunning = true" and the disabled button
  // state *before* the synchronous, main-thread-freezing loop below starts.
  await new Promise((resolve) => setTimeout(resolve, 0))
  const sorted = insertionSort(values) // <-- this freezes the tab, including the dot above
  await afterAnimationSettles()
  blockingFreezeMs.value = Math.round(maxFrameGapMs)
  blockingRunning.value = false
  sortResultPreview.value = `[${sorted.slice(0, 8).join(', ')}, …] (${sorted.length} items)`
}

// ---- 2. Transferables ------------------------------------------------------------------
const transferWorker = useWorker<typeof import('./workers/transfer.worker')>(
  () => new Worker(new URL('./workers/transfer.worker.ts', import.meta.url), { type: 'module' }),
)
const transferLog = ref<string[]>([])

async function runTransfer() {
  const buffer = new Float64Array([1, 2, 3, 4, 5]).buffer
  transferLog.value.push(`before: byteLength=${buffer.byteLength}`)
  const resultPromise = transferWorker.run(buffer, { transfer: [buffer] })
  transferLog.value.push(`immediately after run(): source byteLength=${buffer.byteLength} (detached — sent in via RunOptions.transfer)`)
  const result = await resultPromise
  transferLog.value.push(`worker result (sent back via ctx.transfer(), zero-copy both ways): [${Array.from(new Float64Array(result)).join(', ')}]`)
}

// ---- 3. Real speedup from parallelism: createWorkerPool --------------------------------
// This is the one place in the demo where a worker genuinely IS faster in wall-clock time —
// not because a single worker beats the main thread (it doesn't, see section 1), but because
// `pool.size` workers run on separate CPU cores AT THE SAME TIME. Counting primes by trial
// division is real, substantial CPU work (not a busy-wait), split into equal ranges.
//
// No `size` passed here — it defaults to `navigator.hardwareConcurrency`, the browser's own
// report of how many logical cores/threads THIS machine actually has. Different visitors with
// different CPUs get a genuinely different (and correct) number of workers, not a value we
// picked at development time.
const TOTAL_RANGE = 8_000_000

const pool = useWorkerPool<typeof import('./workers/primes.worker')>(() =>
  new Worker(new URL('./workers/primes.worker.ts', import.meta.url), { type: 'module' }),
)
const monitor = createWorkerActivityMonitor(pool)
const primesBusy = ref(false)
const primesResult = ref<{ mode: string; count: number; ms: number } | null>(null)

// Browsers deliberately do NOT expose real per-core CPU utilization to JS (no such Web API —
// partly a fingerprinting/security concern). What we CAN show, honestly: our own busy/idle
// bookkeeping per chunk — the same data backing `pool.stats`/the devtools panel above. Chunk
// count equals `pool.size`, so each chunk maps to exactly one worker with no queueing, and
// "this lane is busy" faithfully reflects "this worker is crunching its chunk right now".
const laneBusy = ref<boolean[]>(Array(pool.size).fill(false))

function buildPrimeChunks(): { from: number; to: number }[] {
  const chunkSize = Math.ceil(TOTAL_RANGE / pool.size)
  return Array.from({ length: pool.size }, (_, i) => ({
    from: i * chunkSize,
    to: Math.min((i + 1) * chunkSize, TOTAL_RANGE),
  }))
}

async function runPrimesSequential() {
  primesBusy.value = true
  laneBusy.value = laneBusy.value.map(() => false)
  // Yield one tick so Vue paints "primesBusy = true" (disabled buttons) before the
  // synchronous, main-thread-freezing loop below starts.
  await new Promise((resolve) => setTimeout(resolve, 0))
  const chunks = buildPrimeChunks()
  const start = performance.now()
  let total = 0
  for (let i = 0; i < chunks.length; i++) {
    // The main thread is blocked for the whole loop, so these per-lane updates can't actually
    // repaint one at a time — you'll just see them all flip at the very end. That's the point:
    // the UI can't even show its own progress while frozen.
    laneBusy.value[i] = true
    total += countPrimesInRange(chunks[i].from, chunks[i].to) // <-- one core, one chunk at a time
    laneBusy.value[i] = false
  }
  primesResult.value = {
    mode: 'sequentially on the main thread',
    count: total,
    ms: Math.round(performance.now() - start),
  }
  primesBusy.value = false
}

async function runPrimesPool() {
  primesBusy.value = true
  laneBusy.value = laneBusy.value.map(() => false)
  const chunks = buildPrimeChunks()
  const start = performance.now()
  const counts = await Promise.all(
    chunks.map(async (chunk, i) => {
      laneBusy.value[i] = true
      const count = await pool.run(chunk) // <-- all chunks, all cores, at once
      laneBusy.value[i] = false
      return count
    }),
  )
  primesResult.value = {
    mode: `in parallel — pool of ${pool.size} workers`,
    count: counts.reduce((a, b) => a + b, 0),
    ms: Math.round(performance.now() - start),
  }
  primesBusy.value = false
}

// ---- 4. useWorkerComputed ---------------------------------------------------------------
const numbersText = ref('4, 8, 15, 16, 23, 42')
const numbers = computed(() =>
  numbersText.value
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n)),
)

const stats = useWorkerComputed<typeof import('./workers/stats.worker')>(
  () => new Worker(new URL('./workers/stats.worker.ts', import.meta.url), { type: 'module' }),
  () => ({ values: numbers.value }),
  { debounce: 150 },
)

// ---- 5. Error handling -------------------------------------------------------------------
const throwingWorker = useWorker<typeof import('./workers/throwing.worker')>(
  () => new Worker(new URL('./workers/throwing.worker.ts', import.meta.url), { type: 'module' }),
)

async function triggerError() {
  try {
    await throwingWorker.run({ shouldThrow: true })
  } catch {
    // surfaced via throwingWorker.error below
  }
}
</script>

<template>
  <main style="max-width: 860px; margin: 0 auto; padding: 24px; font-family: system-ui, sans-serif">
    <h1>vue-worker-kit — demo</h1>

    <div
      style="
        position: sticky;
        top: 0;
        z-index: 1;
        background: canvas;
        border: 1px solid #8883;
        border-radius: 8px;
        padding: 8px 16px;
        margin-bottom: 20px;
      "
    >
      <div style="font: 13px/1.4 ui-monospace, monospace; margin-bottom: 6px">
        Main thread monitor — should glide smoothly at all times. If it freezes mid-slide,
        the main thread is blocked.
      </div>
      <div style="position: relative; height: 18px; background: #8882; border-radius: 9px">
        <div
          :style="{
            position: 'absolute',
            left: dotPosition + '%',
            top: '2px',
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            background: '#3b82f6',
          }"
        ></div>
      </div>
    </div>

    <section style="border: 1px solid #8883; border-radius: 8px; padding: 16px; margin-bottom: 20px">
      <h2>1. useWorker vs. main thread — same sort, two ways</h2>
      <p style="opacity: 0.75; margin-top: -4px">
        Same O(n²) insertion sort, same input, run two ways. The <strong>sorted array itself
        is identical either way</strong> — that's not the point. The point is
        <strong>"longest UI freeze" below</strong>: it's the biggest gap ever seen between two
        animation frames of the dot above, i.e. the longest the whole page was actually stuck
        and unable to repaint/respond to clicks. Click both buttons and compare that number —
        not the sort result, and not how long it took (a worker isn't a faster CPU; see the
        README section on <code>async</code>/<code>await</code> vs. a real thread).
      </p>
      <label>
        Array size:
        <input v-model.number="sortSize" type="number" min="1000" step="1000" />
      </label>
      <div style="margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap">
        <button :disabled="sortWorker.isRunning.value" @click="runSort">Run with worker</button>
        <button :disabled="blockingRunning" @click="runSortBlocking">Run without worker (blocks UI)</button>
        <button :disabled="!sortWorker.isRunning.value" @click="sortWorker.cancel()">Cancel</button>
      </div>
      <p>Progress (worker run): {{ Math.round(sortWorker.progress.value * 100) }}%</p>
      <p v-if="sortWorker.error.value" style="color: #e5484d">
        Error: {{ sortWorker.error.value.message }}
      </p>
      <p style="font-size: 1.1em">
        <span v-if="workerFreezeMs !== null">
          with worker — longest UI freeze: <strong>{{ workerFreezeMs }} ms</strong>
        </span>
        <span v-if="workerFreezeMs !== null && blockingFreezeMs !== null"> &nbsp;·&nbsp; </span>
        <span v-if="blockingFreezeMs !== null">
          without worker — longest UI freeze: <strong>{{ blockingFreezeMs }} ms</strong>
        </span>
      </p>
      <p v-if="sortResultPreview" style="opacity: 0.6">Result: {{ sortResultPreview }}</p>
    </section>

    <section style="border: 1px solid #8883; border-radius: 8px; padding: 16px; margin-bottom: 20px">
      <h2>2. Transferables — zero-copy both ways</h2>
      <p style="opacity: 0.75; margin-top: -4px">
        <code>RunOptions.transfer</code> in, <code>ctx.transfer()</code> out — the buffer never
        gets structured-clone copied in either direction, only handed off.
      </p>
      <button @click="runTransfer">Run transfer demo</button>
      <ul>
        <li v-for="(line, i) in transferLog" :key="i">{{ line }}</li>
      </ul>
    </section>

    <section style="border: 1px solid #8883; border-radius: 8px; padding: 16px; margin-bottom: 20px">
      <h2>3. createWorkerPool — real speedup from parallelism</h2>
      <p style="opacity: 0.75; margin-top: -4px">
        Counting primes below {{ TOTAL_RANGE.toLocaleString() }} by trial division, split into
        {{ pool.size }} equal chunks — <code>pool.size</code> defaults to
        <code>navigator.hardwareConcurrency</code>, so this number reflects however many logical
        cores <em>your</em> machine actually reports, not a fixed value. Real, substantial CPU
        work (not a busy-wait). Unlike section 1, this comparison's timing <em>is</em> the
        point: {{ pool.size }} workers computing on separate CPU cores at once really is faster
        than one core doing it all. Watch the main-thread monitor above too — it freezes during
        the sequential run, not during the pool run.
      </p>
      <div style="display: flex; gap: 8px; flex-wrap: wrap">
        <button :disabled="primesBusy" @click="runPrimesSequential">Run sequentially (main thread)</button>
        <button :disabled="primesBusy" @click="runPrimesPool">Run via pool ({{ pool.size }} workers)</button>
      </div>
      <p v-if="primesResult">
        Found <strong>{{ primesResult.count.toLocaleString() }}</strong> primes, running
        {{ primesResult.mode }}, in <strong>{{ primesResult.ms }} ms</strong>.
      </p>
      <p style="opacity: 0.6; margin-bottom: 4px; font-size: 0.9em">
        Worker lanes (lit = that chunk is being computed right now — browsers don't expose real
        per-core CPU% to JS, this is our own busy bookkeeping, same source as the panel below):
      </p>
      <div style="display: flex; gap: 4px; margin-bottom: 12px">
        <div
          v-for="(busy, i) in laneBusy"
          :key="i"
          :style="{
            width: '22px',
            height: '22px',
            borderRadius: '4px',
            background: busy ? '#3b82f6' : '#8882',
            transition: 'background 60ms linear',
          }"
        ></div>
      </div>
      <WorkerActivityPanel :monitor="monitor" />
    </section>

    <section style="border: 1px solid #8883; border-radius: 8px; padding: 16px; margin-bottom: 20px">
      <h2>4. useWorkerComputed</h2>
      <label>
        Comma-separated numbers:
        <input v-model="numbersText" type="text" style="width: 300px" />
      </label>
      <p v-if="stats.isRunning">computing…</p>
      <p v-else-if="stats.value">
        count={{ stats.value.count }}, average={{ stats.value.average.toFixed(2) }}, max={{ stats.value.max }}
      </p>
    </section>

    <section style="border: 1px solid #8883; border-radius: 8px; padding: 16px">
      <h2>5. Error handling</h2>
      <button @click="triggerError">Trigger worker error</button>
      <pre v-if="throwingWorker.error.value" style="color: #e5484d; white-space: pre-wrap">{{
        throwingWorker.error.value.message
      }}
workerStack: {{ throwingWorker.error.value.workerStack }}</pre>
    </section>
  </main>
</template>
