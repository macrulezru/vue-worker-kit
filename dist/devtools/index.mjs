import { ref as m, computed as g, defineComponent as h, openBlock as u, createElementBlock as d, createElementVNode as t, toDisplayString as s, createTextVNode as p, Fragment as M, renderList as w } from "vue";
import { r as S } from "../activityBus-DRtaT2r9.js";
function T(n) {
  return "stats" in n;
}
function C(n, c = {}) {
  const o = c.maxErrors ?? 20, v = c.maxSamples ?? 50, i = [], r = m(null), e = m([]), y = S(n)?.subscribe({
    taskEnd(l) {
      i.push(l), i.length > v && i.shift(), r.value = i.reduce((k, E) => k + E, 0) / i.length;
    },
    taskError(l) {
      e.value = [{ ...l, at: Date.now() }, ...e.value].slice(0, o);
    }
  }), f = g(() => {
    const l = T(n) ? n.stats.value : { busy: n.isRunning.value ? 1 : 0, idle: n.isRunning.value ? 0 : 1, queued: 0 };
    return {
      busy: l.busy,
      idle: l.idle,
      queued: l.queued,
      averageTaskMs: r.value,
      recentErrors: e.value
    };
  });
  function x() {
    e.value = [];
  }
  function b() {
    y?.();
  }
  return { snapshot: f, clearErrors: x, dispose: b };
}
const q = { style: { font: "12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace", border: "1px solid #3336", "border-radius": "6px", padding: "10px 12px", "max-width": "360px", background: "canvas", color: "canvastext" } }, A = { style: { display: "flex", gap: "12px", "margin-bottom": "8px" } }, _ = { style: { display: "flex", "align-items": "center", "justify-content": "space-between" } }, B = { style: { opacity: "0.7" } }, D = {
  key: 0,
  style: { margin: "4px 0 0", "padding-left": "16px" }
}, P = {
  key: 1,
  style: { opacity: "0.5", "margin-top": "4px" }
}, F = /* @__PURE__ */ h({
  __name: "WorkerActivityPanel",
  props: {
    monitor: {}
  },
  setup(n) {
    const c = n, o = g(() => c.monitor.snapshot.value);
    function v(r) {
      return r === null ? "—" : `${Math.round(r)} ms`;
    }
    function i(r) {
      return new Date(r).toLocaleTimeString();
    }
    return (r, e) => (u(), d("div", q, [
      e[5] || (e[5] = t("div", { style: { "font-weight": "600", "margin-bottom": "6px" } }, "vue-worker-kit — activity", -1)),
      t("div", A, [
        t("div", null, [
          t("strong", null, s(o.value.busy), 1),
          e[1] || (e[1] = p(" busy", -1))
        ]),
        t("div", null, [
          t("strong", null, s(o.value.idle), 1),
          e[2] || (e[2] = p(" idle", -1))
        ]),
        t("div", null, [
          t("strong", null, s(o.value.queued), 1),
          e[3] || (e[3] = p(" queued", -1))
        ]),
        t("div", null, [
          e[4] || (e[4] = p("avg ", -1)),
          t("strong", null, s(v(o.value.averageTaskMs)), 1)
        ])
      ]),
      t("div", _, [
        t("span", B, "recent errors (" + s(o.value.recentErrors.length) + ")", 1),
        t("button", {
          type: "button",
          style: { font: "inherit", cursor: "pointer", background: "none", border: "none", color: "inherit", opacity: "0.7" },
          onClick: e[0] || (e[0] = (a) => n.monitor.clearErrors())
        }, " clear ")
      ]),
      o.value.recentErrors.length ? (u(), d("ul", D, [
        (u(!0), d(M, null, w(o.value.recentErrors, (a) => (u(), d("li", {
          key: a.at,
          style: { color: "#e5484d" }
        }, " [" + s(i(a.at)) + "] " + s(a.name) + ": " + s(a.message), 1))), 128))
      ])) : (u(), d("div", P, "none"))
    ]));
  }
});
export {
  F as WorkerActivityPanel,
  C as createWorkerActivityMonitor
};
