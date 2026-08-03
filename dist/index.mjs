import { u as ue, a as ce } from "./computed-DrLYxc5M.js";
import { createWorkerPool as me, useWorkerPool as fe } from "./adapters/pool.mjs";
import { attachWorkerProtocol as we, defineWorkerHandler as ve } from "./worker/defineWorkerHandler.mjs";
import { ref as J, computed as N, shallowRef as h, getCurrentScope as q, onScopeDispose as Q } from "vue";
import { t as L, i as X, W as P, a as R, c as Y } from "./workerClient-BqkZY8RU.js";
import { a as Z, c as ee } from "./activityBus-DRtaT2r9.js";
function ne(g, i = {}) {
  const u = i.idleTimeout ?? 3e4, m = i.retries ?? 0, p = i.retryDelay, k = i.cache, c = i.streaming ?? !1;
  let l = null, o = null, e;
  const t = /* @__PURE__ */ new Set(), r = k?.cache === "lru" ? /* @__PURE__ */ new Map() : null, w = k?.maxCacheSize ?? 50, y = J(0), A = N(() => y.value > 0), I = h(0), x = h(null), W = c ? h([]) : void 0, E = ee();
  function M() {
    e !== void 0 && (clearTimeout(e), e = void 0);
  }
  function V() {
    M(), !(u === !1 || y.value > 0) && (e = setTimeout(() => $(), u));
  }
  function $() {
    M(), o?.dispose(L("SharedWorker terminated")), l && (l.port.postMessage({ type: "terminate" }), l.port.close()), l = null, o = null;
  }
  function O() {
    if (typeof SharedWorker > "u")
      throw new P("SharedWorker is not supported in this environment");
    if (M(), !o) {
      l = g();
      const n = {
        postMessage: (a, s) => l.port.postMessage(a, s ?? []),
        terminate: () => l.port.close(),
        onmessage: null,
        onerror: null
      };
      o = Y(n), l.port.onmessage = (a) => {
        o && n.onmessage && n.onmessage(a);
      };
    }
    return o;
  }
  function z() {
    if (!r || r.size <= w) return;
    const n = Array.from(r.keys());
    for (let a = 0; a < n.length - w; a++)
      r.delete(n[a]);
  }
  function K(n) {
    if (!r) return;
    const a = r.get(n);
    return a !== void 0 && (r.delete(n), r.set(n, a)), a;
  }
  function U(n, a) {
    r && (r.delete(n), r.set(n, a), z());
  }
  function H(n, a, s, b, D) {
    const T = O(), { id: v, promise: d } = T.send(n, a, b, D);
    return s.aborted ? (T.cancel(v, s.reason), Promise.reject(L(s.reason))) : new Promise((f, C) => {
      const S = () => {
        T.cancel(v, s.reason), C(L(s.reason));
      };
      s.addEventListener("abort", S, { once: !0 }), d.then(
        (B) => {
          s.removeEventListener("abort", S), f(B);
        },
        (B) => {
          s.removeEventListener("abort", S), C(B);
        }
      );
    });
  }
  async function j(n, a = {}) {
    const s = r ? JSON.stringify(n) : null;
    if (s !== null) {
      const v = K(s);
      if (v !== void 0)
        return v;
    }
    const b = a.signal ? null : new AbortController();
    b && t.add(b);
    const D = a.signal ?? b.signal;
    y.value++, I.value = 0, x.value = null, W && (W.value = []);
    const T = Date.now();
    E.emit.taskStart();
    try {
      let v = 0;
      for (; ; )
        try {
          const d = await H(
            n,
            a.transfer,
            D,
            (f) => {
              I.value = f;
            },
            c && W ? (f) => {
              W.value.push(f);
            } : void 0
          );
          return s !== null && U(s, d), d;
        } catch (d) {
          if (X(d) || d instanceof P) throw d;
          if (v < m) {
            if (v++, p) {
              const C = p(v);
              await new Promise((S) => setTimeout(S, C));
            }
            continue;
          }
          const f = d instanceof R ? d : new R(String(d));
          throw x.value = f, E.emit.taskError({ name: f.name, message: f.message }), f;
        }
    } finally {
      y.value--, E.emit.taskEnd(Date.now() - T), b && t.delete(b), V();
    }
  }
  function F() {
    for (const n of t) n.abort();
  }
  async function G() {
    O();
  }
  q() && Q(() => $());
  const _ = {
    run: j,
    isRunning: A,
    progress: I,
    error: x,
    cancel: F,
    warmup: G
  };
  return W && (_.chunks = W), Z(_, E);
}
function ae(g) {
  const i = h(null), u = h(null), m = h(null), p = h(!1), k = h(null);
  async function c() {
    if (typeof WebAssembly > "u")
      throw new P("WebAssembly is not supported in this environment");
    p.value = !0, k.value = null;
    try {
      const e = await fetch(g.wasmPath);
      if (!e.ok)
        throw new Error(`Failed to fetch WASM module: ${e.statusText}`);
      const t = await e.arrayBuffer(), r = await WebAssembly.compile(t);
      u.value = r;
      const w = g.imports || {};
      if (g.sharedMemory) {
        typeof SharedArrayBuffer > "u" && console.warn("SharedArrayBuffer is not available - falling back to regular Memory");
        const A = typeof SharedArrayBuffer < "u" ? new WebAssembly.Memory({ initial: 256, maximum: 512, shared: !0 }) : new WebAssembly.Memory({ initial: 256, maximum: 512 });
        m.value = A, w.env = {
          ...w.env || {},
          memory: A
        };
      }
      const y = await WebAssembly.instantiate(r, w);
      i.value = y, !m.value && y.exports.memory && (m.value = y.exports.memory);
    } catch (e) {
      throw k.value = e instanceof Error ? e : new Error(String(e)), e;
    } finally {
      p.value = !1;
    }
  }
  function l(e, ...t) {
    if (!i.value)
      throw new Error("WASM module not loaded. Call load() first.");
    const r = i.value.exports[e];
    if (!r)
      throw new Error(`Exported function "${e}" not found in WASM module`);
    return r(...t);
  }
  function o() {
    i.value = null, u.value = null, m.value = null, k.value = null;
  }
  return {
    instance: i,
    module: u,
    memory: m,
    isLoading: p,
    error: k,
    load: c,
    call: l,
    unload: o
  };
}
function se(g, i = {}) {
  const u = window.__VUE_DEVTOOLS_GLOBAL_HOOK__;
  if (!u) {
    console.warn("[vue-worker-kit] Vue Devtools not detected");
    return;
  }
  const m = "vue-worker-kit", p = i.name ?? "Vue Worker Kit", k = i.enableTimeline ?? !0, c = /* @__PURE__ */ new Map();
  function l(o) {
    !k || !u || u.emit?.("timeline:event", {
      time: o.time,
      title: o.title,
      subtitle: o.subtitle,
      color: o.color ?? 4372611,
      // Vue green
      data: o.data
    });
  }
  u.on?.("worker:activity", (...o) => {
    const e = o[0], t = Date.now();
    switch (e.type) {
      case "taskStart": {
        c.set(e.workerId, {
          id: e.workerId,
          status: "running",
          startTime: t,
          endTime: null,
          duration: null
        }), l({
          time: t,
          title: "Worker Task Started",
          subtitle: `Worker: ${e.workerId}`,
          data: e.data
        });
        break;
      }
      case "taskEnd": {
        const r = c.get(e.workerId);
        if (r && r.startTime) {
          const w = t - r.startTime;
          c.set(e.workerId, {
            ...r,
            status: "idle",
            endTime: t,
            duration: w
          }), l({
            time: t,
            title: "Worker Task Completed",
            subtitle: `Worker: ${e.workerId}`,
            color: 4372611,
            data: { ...e.data, duration: w }
          });
        }
        break;
      }
      case "taskError": {
        const r = c.get(e.workerId);
        r && (c.set(e.workerId, {
          ...r,
          status: "error",
          endTime: t,
          error: e.data?.message
        }), l({
          time: t,
          title: "Worker Task Error",
          subtitle: `Worker: ${e.workerId}`,
          color: 16732754,
          // Red
          data: e.data
        }));
        break;
      }
    }
  }), u.on?.("getInspectorTree", (...o) => {
    const e = o[0];
    e.inspectorId === m && (e.rootNodes = Array.from(c.values()).map((t) => ({
      id: t.id,
      label: `Worker ${t.id}`,
      tags: [{
        label: t.status.toUpperCase(),
        textColor: t.status === "error" ? 16777215 : 0,
        backgroundColor: t.status === "error" ? 16732754 : t.status === "running" ? 4372611 : 9474969
      }]
    })));
  }), u.on?.("getInspectorState", (...o) => {
    const e = o[0];
    if (e.inspectorId !== m) return;
    const t = c.get(e.nodeId);
    t && (e.state = {
      Status: [
        { key: "status", value: t.status, editable: !1 },
        { key: "startTime", value: t.startTime, editable: !1 },
        { key: "endTime", value: t.endTime, editable: !1 },
        { key: "duration", value: t.duration ? `${t.duration}ms` : null, editable: !1 }
      ],
      Error: t.error ? [{ key: "message", value: t.error, editable: !1 }] : []
    });
  }), console.log(`[vue-worker-kit] Devtools plugin "${p}" registered`);
}
export {
  R as WorkerError,
  P as WorkerUnavailableError,
  we as attachWorkerProtocol,
  ae as createWasmBridge,
  me as createWorkerPool,
  ve as defineWorkerHandler,
  se as registerDevtoolsPlugin,
  ne as useSharedWorker,
  ue as useWorker,
  ce as useWorkerComputed,
  fe as useWorkerPool
};
