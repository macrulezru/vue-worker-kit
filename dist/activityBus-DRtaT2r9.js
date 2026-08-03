const s = Symbol("vue-worker-kit.activityBus");
function n() {
  const t = /* @__PURE__ */ new Set();
  return {
    emit: {
      taskStart() {
        for (const e of t) e.taskStart?.();
      },
      taskEnd(e) {
        for (const r of t) r.taskEnd?.(e);
      },
      taskError(e) {
        for (const r of t) r.taskError?.(e);
      }
    },
    subscribe(e) {
      return t.add(e), () => t.delete(e);
    }
  };
}
function a(t, e) {
  return Object.defineProperty(t, s, {
    value: e,
    enumerable: !1,
    configurable: !1
  }), t;
}
function o(t) {
  return t[s];
}
export {
  a,
  n as c,
  o as r
};
