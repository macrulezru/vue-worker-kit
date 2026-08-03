import { ref as A, computed as B, getCurrentScope as D, onScopeDispose as R } from "vue";
import { t as b, W as q, c as L } from "../workerClient-BqkZY8RU.js";
import { a as M, c as I } from "../activityBus-DRtaT2r9.js";
function U() {
  return typeof navigator < "u" && typeof navigator.hardwareConcurrency == "number" ? navigator.hardwareConcurrency : 4;
}
function F(v, y = {}) {
  const a = y.size ?? U(), c = [], f = [], h = A(0), g = A(0), m = I();
  let w = !1;
  const C = B(() => ({
    busy: h.value,
    idle: c.length - h.value,
    queued: g.value
  }));
  function k() {
    if (typeof Worker > "u")
      throw new q();
    const e = v(), t = { worker: e, client: L(e), busy: !1 };
    return c.push(t), t;
  }
  function P() {
    for (; f.length > 0; ) {
      let e = c.find((o) => !o.busy);
      if (!e) {
        if (c.length >= a) return;
        e = k();
      }
      const t = f.shift();
      g.value--, S(e, t);
    }
  }
  function S(e, t) {
    e.busy = !0, h.value++;
    const o = t.signal ? null : new AbortController(), n = t.signal ?? o.signal, s = () => {
      w || (e.busy = !1, h.value--, P());
    };
    if (n.aborted) {
      t.reject(b(n.reason)), s();
      return;
    }
    const i = Date.now();
    m.emit.taskStart();
    const { id: d, promise: u } = e.client.send(t.input, t.transfer, void 0), r = () => {
      e.client.cancel(d, n.reason), t.reject(b(n.reason));
    };
    n.addEventListener("abort", r, { once: !0 }), u.then(
      (l) => {
        n.removeEventListener("abort", r), m.emit.taskEnd(Date.now() - i), t.resolve(l), s();
      },
      (l) => {
        if (n.removeEventListener("abort", r), m.emit.taskEnd(Date.now() - i), !n.aborted) {
          const E = l;
          m.emit.taskError({ name: E.name, message: E.message }), t.reject(l);
        }
        s();
      }
    );
  }
  function p(e, t = {}) {
    return new Promise((o, n) => {
      f.push({ input: e, transfer: t.transfer, signal: t.signal, resolve: o, reject: n }), g.value++, P();
    });
  }
  async function W(e, t = {}) {
    const o = Math.max(1, t.concurrency ?? a), n = new Array(e.length);
    let s = 0;
    const i = t.signal;
    async function d() {
      for (; ; ) {
        const u = s++;
        if (u >= e.length) return;
        const r = e[u], l = t.transfer ? t.transfer(r) : void 0;
        n[u] = await p(r, { transfer: l, signal: i });
      }
    }
    return await Promise.all(
      Array.from({ length: Math.min(o, e.length) }, () => d())
    ), n;
  }
  async function x(e, t = {}) {
    const o = t.batchSize ?? 50, n = t.signal, s = [], i = [];
    for (let r = 0; r < e.length; r += o)
      i.push(e.slice(r, r + o));
    const d = i.map(async (r) => await p(r, { signal: n })), u = await Promise.all(d);
    for (const r of u)
      s.push(...r);
    return s;
  }
  async function z() {
    if (w) return;
    const e = [];
    for (let t = c.length; t < a; t++) {
      const o = new Promise((n) => {
        const s = k();
        s.busy = !1, n();
      });
      e.push(o);
    }
    await Promise.all(e);
  }
  function j() {
    w = !0;
    for (const e of c)
      e.client.dispose(b("Worker pool terminated")), e.worker.terminate();
    c.length = 0, h.value = 0;
    for (const e of f) e.reject(b("Worker pool terminated"));
    f.length = 0, g.value = 0;
  }
  return M(
    {
      run: p,
      map: W,
      runBatch: x,
      stats: C,
      size: a,
      terminate: j,
      warmup: z
    },
    m
  );
}
function K(v, y = {}) {
  const a = F(v, y);
  return D() && R(() => a.terminate()), a;
}
export {
  F as createWorkerPool,
  K as useWorkerPool
};
