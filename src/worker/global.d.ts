export {}

declare global {
  /**
   * Not provided by the `DOM`/`ES2020` lib combo this package type-checks against (adding the
   * full `webworker` lib would conflict with `DOM`'s own `self` typing). Declared just enough
   * to type-check the `self instanceof WorkerGlobalScope` runtime probe in defineWorkerHandler.ts.
   */
  const WorkerGlobalScope: new () => object
}
