import { ref as Y, computed as Z, shallowRef as R, getCurrentScope as K, onScopeDispose as N, watch as _, reactive as $ } from "vue";
import { t as P, i as ee, W as G, a as J, c as te } from "./workerClient-BqkZY8RU.js";
import { a as re, c as ne } from "./activityBus-DRtaT2r9.js";
function oe(D, l = {}) {
  const g = l.idleTimeout ?? 3e4, k = l.retries ?? 0, p = l.retryDelay, x = l.hardCancelOnAbort ?? !1, T = l.cache, h = l.streaming ?? !1;
  let f = null, o = null, u;
  const m = /* @__PURE__ */ new Set(), r = T?.cache === "lru" ? /* @__PURE__ */ new Map() : null, A = T?.maxCacheSize ?? 50, c = Y(0), E = Z(() => c.value > 0), w = R(0), b = R(null), v = h ? R([]) : void 0, W = ne();
  function z() {
    u !== void 0 && (clearTimeout(u), u = void 0);
  }
  function U() {
    z(), !(g === !1 || c.value > 0) && (u = setTimeout(() => B(), g));
  }
  function B() {
    z(), o?.dispose(P("Worker terminated")), f?.terminate(), f = null, o = null;
  }
  function I() {
    if (typeof Worker > "u")
      throw new G();
    return z(), o || (f = D(), o = te(f)), o;
  }
  function j() {
    if (!r || r.size <= A) return;
    const e = Array.from(r.keys());
    for (let t = 0; t < e.length - A; t++)
      r.delete(e[t]);
  }
  function q(e) {
    if (!r) return;
    const t = r.get(e);
    return t !== void 0 && (r.delete(e), r.set(e, t)), t;
  }
  function F(e, t) {
    r && (r.delete(e), r.set(e, t), j());
  }
  function H(e, t, n, d, L) {
    const C = I(), { id: s, promise: i } = C.send(e, t, d, L);
    return n.aborted ? (C.cancel(s, n.reason), Promise.reject(P(n.reason))) : new Promise((a, S) => {
      const y = () => {
        C.cancel(s, n.reason), x && B(), S(P(n.reason));
      };
      n.addEventListener("abort", y, { once: !0 }), i.then(
        (O) => {
          n.removeEventListener("abort", y), a(O);
        },
        (O) => {
          n.removeEventListener("abort", y), S(O);
        }
      );
    });
  }
  async function Q(e, t = {}) {
    const n = r ? JSON.stringify(e) : null;
    if (n !== null) {
      const s = q(n);
      if (s !== void 0)
        return s;
    }
    const d = t.signal ? null : new AbortController();
    d && m.add(d);
    const L = t.signal ?? d.signal;
    c.value++, w.value = 0, b.value = null, v && (v.value = []);
    const C = Date.now();
    W.emit.taskStart();
    try {
      let s = 0;
      for (; ; )
        try {
          const i = await H(
            e,
            t.transfer,
            L,
            (a) => {
              w.value = a;
            },
            h && v ? (a) => {
              v.value.push(a);
            } : void 0
          );
          return n !== null && F(n, i), i;
        } catch (i) {
          if (ee(i) || i instanceof G) throw i;
          if (s < k) {
            if (s++, p) {
              const S = p(s);
              await new Promise((y) => setTimeout(y, S));
            }
            continue;
          }
          const a = i instanceof J ? i : new J(String(i));
          throw b.value = a, W.emit.taskError({ name: a.name, message: a.message }), a;
        }
    } finally {
      c.value--, W.emit.taskEnd(Date.now() - C), d && m.delete(d), U();
    }
  }
  function V() {
    for (const e of m) e.abort();
  }
  async function X() {
    I();
  }
  K() && N(() => B());
  const M = {
    run: Q,
    isRunning: E,
    progress: w,
    error: b,
    cancel: V,
    warmup: X
  };
  return v && (M.chunks = v), re(M, W);
}
function se(D, l, g = {}) {
  const k = g.debounce ?? 0, { run: p, isRunning: x, error: T } = oe(D), h = R(void 0);
  let f = 0, o, u = null;
  function m(c) {
    o = void 0, u?.abort();
    const E = new AbortController();
    u = E;
    const w = ++f;
    p(c, { signal: E.signal }).then(
      (b) => {
        w === f && (h.value = b);
      },
      () => {
      }
    );
  }
  function r(c) {
    o !== void 0 && clearTimeout(o), k > 0 ? o = setTimeout(() => m(c), k) : m(c);
  }
  const A = _(l, r, { immediate: !0 });
  return K() && N(() => {
    A(), o !== void 0 && clearTimeout(o), u?.abort();
  }), $({ value: h, isRunning: x, error: T });
}
export {
  se as a,
  oe as u
};
