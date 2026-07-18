import { getCurrentScope, onScopeDispose, reactive, shallowRef, watch } from 'vue'
import type { WorkerError } from '../errors'
import { useWorker } from '../useWorker'
import type { WorkerModuleInput, WorkerModuleOutput } from '../types'

export interface UseWorkerComputedOptions {
  /** Milliseconds to wait after the source stops changing before firing the worker. Default `0`. */
  debounce?: number
}

export interface WorkerComputedResult<Out> {
  readonly value: Out | undefined
  readonly isRunning: boolean
  readonly error: WorkerError | null
}

/**
 * A `computed()` that recalculates inside a worker whenever its reactive source changes,
 * discarding stale/superseded results by generation number rather than by cancelling the
 * worker outright — see the module doc in the README for the race-condition mechanics.
 */
export function useWorkerComputed<TModule>(
  factory: () => Worker,
  source: () => WorkerModuleInput<TModule>,
  options: UseWorkerComputedOptions = {},
): WorkerComputedResult<WorkerModuleOutput<TModule>> {
  const debounceMs = options.debounce ?? 0
  const { run, isRunning, error } = useWorker<TModule>(factory)

  const value = shallowRef<WorkerModuleOutput<TModule> | undefined>(undefined)

  let generation = 0
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let previousController: AbortController | null = null

  function fire(input: WorkerModuleInput<TModule>): void {
    debounceTimer = undefined
    previousController?.abort() // cooperative — only sets ctx.signal, doesn't force-terminate
    const controller = new AbortController()
    previousController = controller
    const myGeneration = ++generation

    run(input, { signal: controller.signal }).then(
      (result) => {
        if (myGeneration !== generation) return // superseded by a newer run — drop silently
        value.value = result
      },
      () => {
        // Failure already surfaced via `error`; aborted/stale runs are expected, not logged.
      },
    )
  }

  function schedule(input: WorkerModuleInput<TModule>): void {
    if (debounceTimer !== undefined) clearTimeout(debounceTimer)
    if (debounceMs > 0) {
      debounceTimer = setTimeout(() => fire(input), debounceMs)
    } else {
      fire(input)
    }
  }

  const stopWatch = watch(source, schedule, { immediate: true })

  if (getCurrentScope()) {
    onScopeDispose(() => {
      stopWatch()
      if (debounceTimer !== undefined) clearTimeout(debounceTimer)
      previousController?.abort()
    })
  }

  return reactive({ value, isRunning, error }) as WorkerComputedResult<WorkerModuleOutput<TModule>>
}
