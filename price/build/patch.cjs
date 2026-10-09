// Applies targeted patches to the prettified bundle and appends the extension module.
// Usage: node patch.cjs <in.js> <extensions.js> <out.js>
const fs = require("fs");
const [, , inFile, extFile, outFile] = process.argv;
let src = fs.readFileSync(inFile, "utf8");

function rep(find, replace, { count = 1 } = {}) {
  const n = src.split(find).length - 1;
  if (n !== count) {
    throw new Error(`Expected ${count} match(es), got ${n} for:\n${find.slice(0, 300)}`);
  }
  src = src.split(find).join(replace);
}
// Replace the range starting at `start` and ending right after `end` (first `end` after start).
function repRange(start, end, replace) {
  const i = src.indexOf(start);
  if (i < 0 || src.indexOf(start, i + 1) >= 0) throw new Error(`range start not unique: ${start.slice(0, 200)}`);
  const j = src.indexOf(end, i);
  if (j < 0) throw new Error(`range end not found: ${end.slice(0, 200)}`);
  src = src.slice(0, i) + replace + src.slice(j + end.length);
}

/* ---------------- demo backend ---------------- */

rep(`const vi = "price-demo-v1",`, `const vi = "price-demo-v2",`);
rep(
  `Uf = { 1: "on_approval_dzo", 2: "on_approval_db", 3: "on_final_approval" },`,
  `Uf = { dzo: "on_approval_dzo", db: "on_approval_db", final: "on_final_approval" },`,
);
rep(
  `    returned: "Возвращено на доработку",
    skipped: "Не рассматривалось",
  },`,
  `    returned: "Возвращено на доработку",
    skipped: "Не рассматривалось",
    removed: "Исключён из маршрута",
  },`,
);
// current pending step: optionally the one assigned to a given user (parallel stages have several)
rep(
  `  us = (e) =>
    ar.includes(e.status)
      ? e.steps.find(
          (t) => t.iteration === e.iteration && t.status === "pending",
        )
      : null,`,
  `  us = (e, u) => {
    if (!ar.includes(e.status)) return null;
    const p = e.steps.filter(
      (t) => t.iteration === e.iteration && t.status === "pending",
    );
    return u ? p.find((t) => ma(u, t)) || null : p[0] || null;
  },`,
);
rep(
  `    ar.includes(t.status) && ma(e, us(t)) && n.push("approve", "rework"),`,
  `    ar.includes(t.status) &&
      us(t, e) &&
      n.push("approve", "rework", "add_approver"),
    ar.includes(t.status) &&
      MA_canManage(e, t) &&
      n.push("manage_route", "recall"),`,
);
rep(
  `    stage_display: js[e.stage],`,
  `    stage_display: e.stage_title || js[e.stage],
    stage_title: e.stage_title || js[e.stage],
    stage_kind: e.stage_kind || "dzo",
    stage_mode: e.stage_mode || "sequential",
    carried: !!e.carried,
    added_by_name: e.added_by ? on(un(e.added_by)) : "",
    assignee_user_id: e.assignee_user || null,`,
);
rep(
  `    status_display: ua[e.status],
    dzo: cn(e.dzo),`,
  `    status_display: ua[e.status],
    dzo: cn(e.dzo),
    plan_type: e.plan_type,
    plan_year: e.plan_year,
    plan_year_to: e.plan_year_to,
    plan_label: MA_planLabel(e),
    plan_period: MA_planPeriod(e),
    plan_type_display: MA_planName(e.plan_type),`,
);
rep(
  `function Nl(e, t) {
  const n = us(t);`,
  `function Nl(e, t) {
  const n = us(t, e);`,
);
rep(
  `    fixed_stages: [
      { stage: 2, title: js[2], assignee: Hr.db_specialist },
      { stage: 3, title: js[3], assignee: Hr.db_director },
    ],`,
  `    fixed_stages: [
      { stage: 2, kind: "db", title: js[2], assignee: Hr.db_specialist },
      { stage: 3, kind: "final", title: js[3], assignee: Hr.db_director },
    ],
    route_plan: MA_routePlanOut(t),
    pending_count: t.iteration
      ? t.steps.filter(
          (s) => s.iteration === t.iteration && s.status === "pending",
        ).length
      : 0,`,
);
rep("`Этап: ${js[t.stage]}. ДЗО: ${cn(e.dzo).name_ru}.`", "`Этап: ${t.stage_title || js[t.stage]}. ДЗО: ${cn(e.dzo).name_ru}.`");
rep(
  `      approvers: [],
      steps: [],
      audit: [],`,
  `      approvers: [],
      route_plan: [],
      plan_type: "gpz",
      plan_year: ki().getFullYear() + 1,
      plan_year_to: null,
      steps: [],
      audit: [],`,
);
// setApprovers / submit / decide are re-implemented in the extension module
repRange(
  `  setApprovers(e, t) {
    It(e),`,
  `};
function Ml(e, t) {`,
  `  setApprovers(e, t) {
    return MA_setRoute(e, t);
  },
  submit(e, t) {
    return MA_submit(e, t || {});
  },
  decide(e, t) {
    return MA_decide(e, t);
  },
};
function Ml(e, t) {`,
);
rep(
  `  "price_justification" in t &&
    (e.price_justification = t.price_justification || "");
}`,
  `  "price_justification" in t &&
    (e.price_justification = t.price_justification || "");
  MA_applyPlan(e, t);
}`,
);
rep(
  `function Vl(e, t) {
  const n = us(t);
  return (
    !!n &&
    (n.assignee_user
      ? n.assignee_user === e.id
      : e.roles.includes(n.assignee_role))
  );
}`,
  `function Vl(e, t) {
  return !!us(t, e);
}`,
);
rep(
  `    e.get("dzo") && (n = n.filter((u) => u.dzo === Number(e.get("dzo")))),`,
  `    e.get("dzo") && (n = n.filter((u) => u.dzo === Number(e.get("dzo")))),
    e.get("plan_type") &&
      (n = n.filter((u) => u.plan_type === e.get("plan_type"))),`,
);
rep(
  `      if (p === "approvers/") return ce.setApprovers(c, l.approvers), g();`,
  `      if (p === "approvers/")
        return ce.setApprovers(c, l.stages || l.approvers), g();
      if (p === "recall/") return MA_recall(c, l), g();
      if (p === "route/add/") return MA_addStep(c, l), g();
      if ((u = p.match(/^route\\/steps\\/(\\d+)\\/remove\\/$/)))
        return MA_removeStep(c, Number(u[1]), l), g();`,
);
rep(
  `      if (p === "submit/") return ce.submit(c), g();`,
  `      if (p === "submit/") return ce.submit(c, l), g();`,
);
// analytics: full price history across DZO and years
repRange(
  `      u = le.catalog
        .filter(
          (d) => d.nsi_code === n.nsi_code && d.source_id !== \`ma-\${e.id}\`,
        )`,
  `          is_active: d.is_active,
        }));`,
  `      u = MA_history(e, n);`,
);
rep(
  `  return {
    calc_method: "average",`,
  `  return {
    own_dzo_id: e.dzo,
    calc_method: "average",`,
);
// seed: multi-year catalog history
repRange(
  `    [
      ["1010101001", 2, 7850, 200, !1],`,
  `        is_active: o,
      }),
    );`,
  `    MA_seedCatalog();`,
);
// seed: second analysis goes through a parallel stage + a sequential stage
rep(
  `        ce.calculate(s),
        ce.setApprovers(s, [2, 3]),
        t(3, 10),
        ce.submit(s);
    }),`,
  `        ce.calculate(s),
        ce.setApprovers(s, [
          { title: "Службы ДЗО (параллельно)", mode: "parallel", members: [2, 3] },
          { title: "Технический контроль", mode: "sequential", members: [9] },
        ]),
        t(3, 10),
        ce.submit(s);
    }),
    t(2, 11),
    ht("approver1", () =>
      ce.decide(le.analyses[1], {
        decision: "approve",
        comment: "Потребность подтверждена",
      }),
    ),`,
);
rep(
  `    (Fs = null),
    (le.currentUserId = null),`,
  `    MA_seedPlans(),
    (Fs = null),
    (le.currentUserId = null),`,
);

rep(
  `"Выберите хотя бы одного согласующего этапа 1"`,
  `"Сформируйте маршрут: добавьте хотя бы одного согласующего ДЗО"`,
);

/* ---------------- API client ---------------- */
rep(
  `    submit: (e) => pe("POST", \`\${Pe}/\${e}/submit/\`),`,
  `    submit: (e, t) => pe("POST", \`\${Pe}/\${e}/submit/\`, t || {}),
    setRoute: (e, t) => pe("PUT", \`\${Pe}/\${e}/approvers/\`, { stages: t }),
    recall: (e, t) => pe("POST", \`\${Pe}/\${e}/recall/\`, { comment: t }),
    routeAdd: (e, t) => pe("POST", \`\${Pe}/\${e}/route/add/\`, t),
    routeRemove: (e, t, n) =>
      pe("POST", \`\${Pe}/\${e}/route/steps/\${t}/remove/\`, { comment: n }),`,
);

/* ---------------- i18n ---------------- */
rep(`sa(na);`, `MA_mergeI18n(na), sa(na);`);

/* ---------------- Registry ---------------- */
rep(
  `l = kt({ q: "", dzo: "", date_from: "", date_to: "" }),`,
  `l = kt({ q: "", dzo: "", plan_type: "", date_from: "", date_to: "" }),`,
);
rep(
  `                      [[is, l.dzo]],
                    ),
                    a("label", Sm, f(S.$t("common.from")), 1),`,
  `                      [[is, l.dzo]],
                    ),
                    Q(
                      MaPlanSelect,
                      {
                        modelValue: l.plan_type,
                        withAll: !0,
                        "onUpdate:modelValue": (x) => {
                          (l.plan_type = x), w();
                        },
                      },
                      null,
                      16,
                    ),
                    a("label", Sm, f(S.$t("common.from")), 1),`,
);
rep(
  `                          a("th", null, f(S.$t("registry.dzo")), 1),
                          a("th", null, f(S.$t("registry.initiator")), 1),`,
  `                          a("th", null, f(S.$t("registry.dzo")), 1),
                          a("th", null, f(S.$t("plan.column")), 1),
                          a("th", null, f(S.$t("registry.initiator")), 1),`,
);
rep(`oe(8, (ue) =>`, `oe(9, (ue) =>`);
rep(
  `                                    a("td", null, f(E(x.dzo)), 1),`,
  `                                    a("td", null, f(E(x.dzo)), 1),
                                    a(
                                      "td",
                                      { class: "nowrap", title: x.plan_type_display },
                                      f(x.plan_label),
                                      1,
                                    ),`,
);

/* ---------------- Conclusion ---------------- */
rep(
  `        s = ae(() => n.value.find((i) => i.stage === 3)),`,
  `        s = ae(() => n.value.find((i) => i.stage_kind === "final")),`,
);
rep(
  `f(o.stage === 3 ? "Утверждено" : "Согласовано"),`,
  `f(o.stage_kind === "final" ? "Утверждено" : "Согласовано"),`,
);
rep(
  `            a("dd", null, f(e.analysis.dzo.name_ru), 1),
            l[1] || (l[1] = a("dt", null, "Инициатор потребности", -1)),`,
  `            a("dd", null, f(e.analysis.dzo.name_ru), 1),
            a("dt", null, "План закупок"),
            a(
              "dd",
              null,
              f(e.analysis.plan_type_display) + ", " + f(e.analysis.plan_period),
              1,
            ),
            l[1] || (l[1] = a("dt", null, "Инициатор потребности", -1)),`,
);

/* ---------------- StepGeneral: plan type ---------------- */
rep(
  `          initiator_department:
            (r == null ? void 0 : r.initiator_department) || "",
          dzo:`,
  `          initiator_department:
            (r == null ? void 0 : r.initiator_department) || "",
          plan_type: (r && r.plan_type) || "gpz",
          plan_year: (r && r.plan_year) || new Date().getFullYear() + 1,
          plan_year_to: (r && r.plan_year_to) || null,
          dzo:`,
);
rep(
  `            const S = r
              ? await ie.update(r.id, w)
              : await ie.create({ ...w, dzo: l.dzo });`,
  `            const P = {
                plan_type: l.plan_type,
                plan_year: l.plan_year,
                plan_year_to: l.plan_year_to,
              },
              S = r
                ? await ie.update(r.id, { ...w, ...P })
                : await ie.create({ ...w, ...P, dzo: l.dzo });`,
);
rep(
  `                      [[is, l.dzo]],
                    ),
              ]),
              e.analysis`,
  `                      [[is, l.dzo]],
                    ),
              ]),
              Q(
                MaPlanFields,
                { model: l, editable: !!e.editable },
                null,
                16,
              ),
              e.analysis`,
);

/* ---------------- StepOffers: history ---------------- */
repRange(
  `                            a("details", nv, [`,
  `                                : (h(),
                                  v("p", ov, f(N.$t("offers.noHistory")), 1)),
                            ]),`,
  `                            Q(
                              MaPriceHistory,
                              {
                                item: O,
                                ownDzoId: c.value.own_dzo_id,
                                marketingPrice: O.marketing_price,
                              },
                              null,
                              16,
                            ),`,
);

/* ---------------- AnalysisView ---------------- */
rep(
  `                                    a("span", Wv, f(r.value.dzo.name_ru), 1),`,
  `                                    a("span", Wv, f(r.value.dzo.name_ru), 1),
                                    a(
                                      "span",
                                      { class: "badge", title: r.value.plan_type_display },
                                      f(r.value.plan_label),
                                      1,
                                    ),`,
);
rep(
  `                                Ch,
                                { key: 2, analysis: r.value, submit: O },`,
  `                                MaDecisionPanel,
                                {
                                  key: 2,
                                  analysis: r.value,
                                  submit: O,
                                  onUpdated: ue,
                                  onReload: ve,
                                },`,
);
rep(
  `                                        xe(
                                          y_,
                                          {`,
  `                                        xe(
                                          MaRouteBuilder,
                                          {`,
);
rep(
  `                                          Uh,
                                          { key: 0, analysis: r.value },`,
  `                                          MaRouteTimeline,
                                          {
                                            key: 0,
                                            analysis: r.value,
                                            onUpdated: ue,
                                          },`,
);

src += "\n" + fs.readFileSync(extFile, "utf8");
fs.writeFileSync(outFile, src);
console.log("patched OK", src.length);
