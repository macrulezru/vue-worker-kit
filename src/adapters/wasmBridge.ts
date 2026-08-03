import { ref, shallowRef } from 'vue'
import type { ShallowRef } from 'vue'
import { WorkerUnavailableError } from '../errors'

export interface WasmBridgeOptions {
  /** Path to the WASM module */
  wasmPath: string
  /** Optional imports for the WASM module */
  imports?: WebAssembly.Imports
  /** Enable shared memory (SharedArrayBuffer) support */
  sharedMemory?: boolean
}

export interface WasmBridgeReturn {
  /** The loaded WASM instance */
  instance: ShallowRef<WebAssembly.Instance | null>
  /** The WASM module */
  module: ShallowRef<WebAssembly.Module | null>
  /** Memory buffer (if shared memory is enabled) */
  memory: ShallowRef<WebAssembly.Memory | null>
  /** Loading state */
  isLoading: ShallowRef<boolean>
  /** Error during loading */
  error: ShallowRef<Error | null>
  /** Load the WASM module */
  load(): Promise<void>
  /** Call an exported function from the WASM module */
  call<T = unknown>(fnName: string, ...args: unknown[]): T
  /** Unload the WASM module */
  unload(): void
}

/**
 * Creates a bridge for interacting with WebAssembly modules in a worker.
 * Supports SharedArrayBuffer for multi-threaded scenarios.
 */
export function createWasmBridge(options: WasmBridgeOptions): WasmBridgeReturn {
  const instance = shallowRef<WebAssembly.Instance | null>(null)
  const module = shallowRef<WebAssembly.Module | null>(null)
  const memory = shallowRef<WebAssembly.Memory | null>(null)
  const isLoading = shallowRef(false)
  const error = shallowRef<Error | null>(null)

  async function load(): Promise<void> {
    if (typeof WebAssembly === 'undefined') {
      throw new WorkerUnavailableError('WebAssembly is not supported in this environment')
    }

    isLoading.value = true
    error.value = null

    try {
      // Fetch and compile the WASM module
      const response = await fetch(options.wasmPath)
      if (!response.ok) {
        throw new Error(`Failed to fetch WASM module: ${response.statusText}`)
      }

      const wasmBytes = await response.arrayBuffer()
      const wasmModule = await WebAssembly.compile(wasmBytes)
      module.value = wasmModule

      // Create imports with optional shared memory
      const imports: WebAssembly.Imports = options.imports || {}

      if (options.sharedMemory) {
        // Check if SharedArrayBuffer is available
        if (typeof SharedArrayBuffer === 'undefined') {
          console.warn('SharedArrayBuffer is not available - falling back to regular Memory')
        }

        // Create shared memory if available, otherwise regular memory
        const memoryObj = typeof SharedArrayBuffer !== 'undefined'
          ? new WebAssembly.Memory({ initial: 256, maximum: 512, shared: true })
          : new WebAssembly.Memory({ initial: 256, maximum: 512 })

        memory.value = memoryObj

        // Add env import with memory
        imports.env = {
          ...(imports.env || {}),
          memory: memoryObj,
        }
      }

      // Instantiate the module
      const wasmInstance = await WebAssembly.instantiate(wasmModule, imports)
      instance.value = wasmInstance

      // Extract memory from instance if not provided externally
      if (!memory.value && (wasmInstance.exports as Record<string, WebAssembly.Memory>).memory) {
        memory.value = (wasmInstance.exports as Record<string, WebAssembly.Memory>).memory
      }
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
      throw err
    } finally {
      isLoading.value = false
    }
  }

  function call<T = unknown>(fnName: string, ...args: unknown[]): T {
    if (!instance.value) {
      throw new Error('WASM module not loaded. Call load() first.')
    }

    const fn = (instance.value.exports as Record<string, (...args: unknown[]) => T>)[fnName]
    if (!fn) {
      throw new Error(`Exported function "${fnName}" not found in WASM module`)
    }

    return fn(...args)
  }

  function unload(): void {
    instance.value = null
    module.value = null
    memory.value = null
    error.value = null
  }

  return {
    instance,
    module,
    memory,
    isLoading,
    error,
    load,
    call,
    unload,
  }
}
