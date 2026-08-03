function c(e) {
  return e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : { name: "Error", message: typeof e == "string" ? e : JSON.stringify(e) };
}
const d = 50;
function f(e) {
  let r = 0;
  return (o) => {
    const s = Date.now();
    s - r < d || (r = s, e(o));
  };
}
function g() {
  return typeof WorkerGlobalScope < "u" && typeof self < "u" && self instanceof WorkerGlobalScope;
}
function u(e, r = self) {
  const o = /* @__PURE__ */ new Map();
  r.onmessage = (s) => {
    const t = s.data;
    if (t.type === "cancel") {
      o.get(t.id)?.abort(t.reason);
      return;
    }
    const i = new AbortController();
    o.set(t.id, i);
    const a = [], l = {
      signal: i.signal,
      reportProgress: f((n) => {
        r.postMessage({ type: "progress", id: t.id, value: n });
      }),
      transfer(...n) {
        a.push(...n);
      },
      reportChunk(n) {
        r.postMessage({ type: "chunk", id: t.id, chunk: n });
      }
    };
    Promise.resolve().then(() => e(t.input, l)).then((n) => {
      o.delete(t.id), r.postMessage({ type: "progress", id: t.id, value: 1 }), r.postMessage({ type: "result", id: t.id, output: n }, a);
    }).catch((n) => {
      o.delete(t.id), r.postMessage({ type: "error", id: t.id, error: c(n) });
    });
  };
}
function p(e) {
  return g() && u(e), {};
}
export {
  u as attachWorkerProtocol,
  p as defineWorkerHandler
};
