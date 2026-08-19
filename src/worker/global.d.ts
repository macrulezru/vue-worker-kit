export {}

declare global {
  /**
   * Not provided by the `DOM`/`ES2020` lib combo this package type-checks against (adding the
   * full `webworker` lib would conflict with `DOM`'s own `self` typing). Declared just enough
   * to type-check the `self instanceof XxxWorkerGlobalScope` runtime probes in defineWorkerHandler.ts.
   */
  const WorkerGlobalScope: new () => object
  const DedicatedWorkerGlobalScope: new () => object
  const SharedWorkerGlobalScope: new () => {
    onconnect: ((event: { ports: readonly MessagePort[] }) => void) | null
  }
}
