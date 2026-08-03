import { toRaw as p } from "vue";
class u extends Error {
  constructor(o, t = {}) {
    super(o, t.cause !== void 0 ? { cause: t.cause } : void 0), this.name = t.name ?? "WorkerError", this.workerStack = t.workerStack;
  }
}
function w(r, o) {
  return new u(r.message, {
    name: r.name === "Error" ? "WorkerError" : r.name,
    workerStack: r.stack,
    cause: o
  });
}
class g extends Error {
  constructor(o = "vue-worker-kit: Worker is not available in this environment (no global `Worker`). This usually means run() was called during SSR — guard it with a client-only check or <ClientOnly>.") {
    super(o), this.name = "WorkerUnavailableError";
  }
}
function y(r) {
  return r instanceof Error && r.name === "AbortError";
}
function v(r) {
  if (r instanceof Error) return r;
  if (typeof DOMException < "u")
    return new DOMException(typeof r == "string" ? r : "The operation was aborted.", "AbortError");
  const o = new Error(typeof r == "string" ? r : "The operation was aborted.");
  return o.name = "AbortError", o;
}
function b(r) {
  let o = 1;
  const t = /* @__PURE__ */ new Map();
  r.onmessage = (a) => {
    const e = a.data, n = t.get(e.id);
    if (n) {
      if (e.type === "progress") {
        n.onProgress?.(e.value);
        return;
      }
      if (e.type === "chunk") {
        n.onChunk?.(e.chunk);
        return;
      }
      t.delete(e.id), e.type === "result" ? n.resolve(e.output) : n.reject(w(e.error, n.callSiteError));
    }
  }, r.onerror = (a) => {
    const e = new Error("Worker crashed"), n = new u(a.message || "Worker crashed", { cause: e });
    for (const c of t.values()) c.reject(n);
    t.clear();
  };
  function l(a, e, n, c) {
    const s = o++, E = new Error("vue-worker-kit: run() called from here"), k = new Promise((i, m) => {
      t.set(s, { resolve: i, reject: m, onProgress: n, onChunk: c, callSiteError: E });
    });
    try {
      r.postMessage({ type: "run", id: s, input: p(a) }, e ?? []);
    } catch (i) {
      return t.delete(s), {
        id: s,
        promise: Promise.reject(
          new u("Failed to clone data for the worker (structured clone failure)", {
            name: "DataCloneError",
            cause: i
          })
        )
      };
    }
    return { id: s, promise: k };
  }
  function f(a, e) {
    r.postMessage({ type: "cancel", id: a, reason: e });
  }
  function d(a) {
    for (const e of t.values()) e.reject(a);
    t.clear();
  }
  return { send: l, cancel: f, dispose: d };
}
export {
  g as W,
  u as a,
  b as c,
  y as i,
  v as t
};
