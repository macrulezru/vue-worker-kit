import type { ShallowRef } from 'vue';
export interface WasmBridgeOptions {
    /** Path to the WASM module */
    wasmPath: string;
    /** Optional imports for the WASM module */
    imports?: WebAssembly.Imports;
    /** Enable shared memory (SharedArrayBuffer) support */
    sharedMemory?: boolean;
}
export interface WasmBridgeReturn {
    /** The loaded WASM instance */
    instance: ShallowRef<WebAssembly.Instance | null>;
    /** The WASM module */
    module: ShallowRef<WebAssembly.Module | null>;
    /** Memory buffer (if shared memory is enabled) */
    memory: ShallowRef<WebAssembly.Memory | null>;
    /** Loading state */
    isLoading: ShallowRef<boolean>;
    /** Error during loading */
    error: ShallowRef<Error | null>;
    /** Load the WASM module */
    load(): Promise<void>;
    /** Call an exported function from the WASM module */
    call<T = unknown>(fnName: string, ...args: unknown[]): T;
    /** Unload the WASM module */
    unload(): void;
}
/**
 * Creates a bridge for interacting with WebAssembly modules in a worker.
 * Supports SharedArrayBuffer for multi-threaded scenarios.
 */
export declare function createWasmBridge(options: WasmBridgeOptions): WasmBridgeReturn;
//# sourceMappingURL=wasmBridge.d.ts.map