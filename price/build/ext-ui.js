/* ---------- UI components (render functions on top of Vue h()) ---------- */
const maH = Fo,
  maT = (k, p) => Ie(k, p),
  maWho = (u) => [u.position, u.department].filter(Boolean).join(" · "),
  maErr = (x) => (x && x.status ? _i(x) : (x && x.message) || String(x)),
  maPct = (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${wa.format(v)} %`),
  maInt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

function maSeg(options, value, onPick, cls = "") {
  return maH(
    "div",
    { class: `ma-seg ${cls}`, role: "group" },
    options.map(([k, label, title]) =>
      maH(
        "button",
        {
          type: "button",
          class: ["ma-seg-btn", { active: value === k }],
          "aria-pressed": value === k ? "true" : "false",
          title: title || null,
          onClick: () => onPick(k),
        },
        label,
      ),
    ),
  );
}
function maSelect(value, options, onPick, cls = "input") {
  return maH(
    "select",
    { class: cls, value: String(value ?? ""), onChange: (ev) => onPick(ev.target.value) },
    options.map(([k, label]) =>
      maH("option", { value: String(k), selected: String(value ?? "") === String(k) }, label),
    ),
  );
}
function maRadio(name, value, options, onPick) {
  return options.map(([k, label, hint]) =>
    maH("label", { class: "ma-radio" }, [
      maH("input", { type: "radio", name, checked: value === k, onChange: () => onPick(k) }),
      maH("span", null, [maH("b", null, label), hint ? maH("span", { class: "muted" }, ` — ${hint}`) : null]),
    ]),
  );
}
function maPicked(user, onClear) {
  return maH("div", { class: "ma-picked" }, [
    maH("div", null, [maH("b", null, user.full_name), maH("div", { class: "small muted" }, maWho(user))]),
    maH("button", { class: "icon-btn", type: "button", onClick: onClear }, "✕"),
  ]);
}

/* plan type + year on the "General" step */
const MaPlanFields = {
  name: "MaPlanFields",
  props: { model: { type: Object, required: !0 }, editable: Boolean },
  setup(p) {
    const y0 = new Date().getFullYear(),
      years = Array.from({ length: 10 }, (_, i) => y0 - 2 + i);
    function pick(k) {
      const m = p.model;
      (m.plan_type = k),
        k === "dpz"
          ? (!m.plan_year_to || m.plan_year_to <= m.plan_year) && (m.plan_year_to = m.plan_year + 2)
          : (m.plan_year_to = null);
    }
    return () => {
      const m = p.model,
        info = MA_PLAN[m.plan_type] || MA_PLAN.gpz;
      if (!p.editable)
        return maH("div", { class: "field" }, [
          maH("label", null, maT("plan.type")),
          maH("div", null, MA_planName(m.plan_type)),
          maH("span", { class: "small muted" }, `${maT("plan.period")}: ${MA_planPeriod(m) || "—"}`),
        ]);
      const yearSel = (v, on, min) =>
        maSelect(
          v,
          years.filter((y) => !min || y > min).map((y) => [y, String(y)]),
          (x) => on(Number(x)),
        );
      return maH("div", { class: "ma-plan" }, [
        maH("div", { class: "field" }, [
          maH("label", null, [maT("plan.type"), maH("span", { class: "req" }, " *")]),
          maSeg(
            Object.entries(MA_PLAN).map(([k, v]) => [
              k,
              [maH("b", null, v.short), maH("span", { class: "small" }, v.name)],
              v.hint,
            ]),
            m.plan_type,
            pick,
            "ma-plan-seg",
          ),
          maH("span", { class: "small muted" }, info.hint),
        ]),
        m.plan_type === "dpz"
          ? maH("div", { class: "ma-row2" }, [
              maH("div", { class: "field" }, [
                maH("label", null, maT("plan.yearFrom")),
                yearSel(m.plan_year, (v) => {
                  (m.plan_year = v), m.plan_year_to <= v && (m.plan_year_to = v + 2);
                }),
              ]),
              maH("div", { class: "field" }, [
                maH("label", null, maT("plan.yearTo")),
                yearSel(m.plan_year_to, (v) => (m.plan_year_to = v), m.plan_year),
              ]),
            ])
          : maH("div", { class: "field" }, [
              maH("label", null, maT("plan.year")),
              yearSel(m.plan_year, (v) => (m.plan_year = v)),
            ]),
      ]);
    };
  },
};

/* plan filter in the registry */
const MaPlanSelect = {
  name: "MaPlanSelect",
  props: { modelValue: String, withAll: Boolean },
  emits: ["update:modelValue"],
  setup(p, { emit }) {
    return () =>
      maSelect(
        p.modelValue || "",
        [
          ...(p.withAll ? [["", `${maT("plan.column")}: ${maT("common.all")}`]] : []),
          ...Object.entries(MA_PLAN).map(([k, v]) => [k, `${v.short} — ${v.name}`]),
        ],
        (v) => emit("update:modelValue", v),
        "input ma-plan-filter",
      );
  },
};

/* route builder (step "Approvers") */
const MaRouteBuilder = {
  name: "MaRouteBuilder",
  props: { analysis: { type: Object, required: !0 }, editable: Boolean },
  emits: ["updated", "go", "submitted"],
  setup(p, { emit }) {
    let uid = 0;
    const fromPlan = (plan) =>
        plan.map((s) => ({ uid: ++uid, id: s.id, title: s.title, mode: s.mode, members: s.members.slice() })),
      stages = H(fromPlan(p.analysis.route_plan)),
      dirty = H(!1),
      busy = H(!1),
      err = H(null),
      restart = H(p.analysis.returned_from_stage ? "returned" : "start"),
      canSubmit = ae(() => p.analysis.available_actions.includes("submit")),
      used = ae(() => new Set(stages.value.flatMap((s) => s.members.map((m) => m.id))));
    Mt(
      () => p.analysis.route_plan,
      (v) => {
        dirty.value || (stages.value = fromPlan(v));
      },
    );
    const touch = () => (dirty.value = !0),
      move = (arr, i, d) => {
        const [x] = arr.splice(i, 1);
        arr.splice(i + d, 0, x), touch();
      },
      addStage = (mode) => {
        stages.value.push({ uid: ++uid, id: null, title: "", mode, members: [] }), touch();
      };
    async function save() {
      (busy.value = !0), (err.value = null);
      try {
        const r = await ie.setRoute(
          p.analysis.id,
          stages.value.map((s) => ({ id: s.id, title: s.title, mode: s.mode, members: s.members.map((m) => m.id) })),
        );
        return (dirty.value = !1), (stages.value = fromPlan(r.route_plan)), emit("updated", r), !0;
      } catch (x) {
        return (err.value = x), !1;
      } finally {
        busy.value = !1;
      }
    }
    async function submit() {
      if (!(dirty.value && !(await save()))) {
        (busy.value = !0), (err.value = null);
        try {
          emit("submitted", await ie.submit(p.analysis.id, { restart: restart.value }));
        } catch (x) {
          err.value = x;
        } finally {
          busy.value = !1;
        }
      }
    }
    function stageCard(s, i) {
      const ed = p.editable,
        list = stages.value;
      return maH("div", { key: s.uid, class: ["ma-stage", s.mode] }, [
        maH("div", { class: "ma-stage-head" }, [
          maH("span", { class: "ma-stage-no" }, String(i + 1)),
          ed
            ? maH("input", {
                class: "input ma-stage-name",
                value: s.title,
                placeholder: `${maT("route2.stage")} ${i + 1} — согласование ДЗО`,
                onInput: (ev) => {
                  (s.title = ev.target.value), touch();
                },
              })
            : maH("b", { class: "ma-stage-name" }, s.title),
          ed
            ? maSeg(
                [
                  ["sequential", `→ ${maT("route2.seq")}`],
                  ["parallel", `⇉ ${maT("route2.par")}`],
                ],
                s.mode,
                (k) => {
                  (s.mode = k), touch();
                },
                "sm",
              )
            : maH("span", { class: ["badge", { gray: s.mode !== "parallel" }] }, maT(s.mode === "parallel" ? "route2.par" : "route2.seq")),
          ed
            ? [
                maH("button", { class: "icon-btn", type: "button", title: maT("route2.moveUp"), disabled: i === 0, onClick: () => move(list, i, -1) }, "↑"),
                maH("button", { class: "icon-btn", type: "button", title: maT("route2.moveDown"), disabled: i === list.length - 1, onClick: () => move(list, i, 1) }, "↓"),
                maH("button", { class: "icon-btn", type: "button", title: maT("route2.removeStage"), onClick: () => (list.splice(i, 1), touch()) }, "✕"),
              ]
            : null,
        ]),
        maH("div", { class: "small muted ma-stage-sub" }, maT(s.mode === "parallel" ? "route2.parallelHint" : "route2.seqHint")),
        s.members.length
          ? maH(
              "ol",
              { class: "ma-members" },
              s.members.map((m, j) =>
                maH("li", { key: m.id, class: "ma-member" }, [
                  maH("span", { class: "ma-member-no" }, s.mode === "parallel" ? "∥" : String(j + 1)),
                  maH("div", { class: "ma-who" }, [maH("b", null, m.full_name), maH("span", { class: "small muted" }, maWho(m))]),
                  ed && s.mode !== "parallel"
                    ? [
                        maH("button", { class: "icon-btn", type: "button", title: maT("route2.moveUp"), disabled: j === 0, onClick: () => move(s.members, j, -1) }, "↑"),
                        maH("button", { class: "icon-btn", type: "button", title: maT("route2.moveDown"), disabled: j === s.members.length - 1, onClick: () => move(s.members, j, 1) }, "↓"),
                      ]
                    : null,
                  ed
                    ? maH("button", { class: "icon-btn", type: "button", title: maT("common.delete"), onClick: () => (s.members.splice(j, 1), touch()) }, "✕")
                    : null,
                ]),
              ),
            )
          : maH("div", { class: "small ma-warn" }, maT("route2.emptyStage")),
        ed
          ? maH("div", { class: "ma-add" }, [
              maH(Ci, {
                fetcher: (q) =>
                  ie.searchUsers(q, p.analysis.dzo.id).then((r) => r.filter((u) => !used.value.has(u.id))),
                itemLabel: (u) => u.full_name,
                itemSub: maWho,
                placeholder: maT("approvers.searchPh"),
                onSelect: (u) => {
                  s.members.push(u), touch();
                },
              }),
            ])
          : null,
      ]);
    }
    return () => {
      const a = p.analysis,
        ed = p.editable;
      return maH("div", { class: "ma-route" }, [
        maH("div", { class: "row between" }, [
          maH("h3", { class: "ma-h" }, maT("route2.title")),
          ed
            ? maH("div", { class: "row ma-tight" }, [
                maH("button", { class: "btn sm", type: "button", onClick: () => addStage("sequential") }, `+ ${maT("route2.addSeq")}`),
                maH("button", { class: "btn sm", type: "button", onClick: () => addStage("parallel") }, `+ ${maT("route2.addPar")}`),
              ])
            : null,
        ]),
        ed ? maH("p", { class: "muted small" }, maT("route2.hint")) : null,
        !ed && ar.includes(a.status) ? maH("div", { class: "alert info small" }, maT("route2.manageHint")) : null,
        ...stages.value.map(stageCard),
        stages.value.length ? null : maH("div", { class: "ma-empty" }, maT("route2.empty")),
        ...a.fixed_stages.map((fs, i) =>
          maH("div", { key: `f${fs.stage}`, class: "ma-stage locked" }, [
            maH("div", { class: "ma-stage-head" }, [
              maH("span", { class: "ma-stage-no" }, String(stages.value.length + i + 1)),
              maH("b", { class: "ma-stage-name" }, fs.title),
              maH("span", { class: "badge gray" }, `🔒 ${maT("approvers.fixed")}`),
            ]),
            maH("div", { class: "ma-member" }, [
              maH("span", { class: "ma-member-no" }, "1"),
              maH("div", { class: "ma-who" }, [maH("b", null, fs.assignee)]),
            ]),
          ]),
        ),
        ed && a.status === "rework" && a.returned_from_stage
          ? maH("div", { class: "ma-restart" }, [
              maH("div", { class: "ma-restart-title" }, maT("route2.resubmit")),
              ...maRadio(
                `restart-${a.id}`,
                restart.value,
                [
                  ["returned", maT("route2.resume"), maT("route2.resumeHint")],
                  ["start", maT("route2.restart"), maT("route2.restartHint")],
                ],
                (k) => (restart.value = k),
              ),
            ])
          : null,
        maH(vt, {
          error: err.value,
          title: err.value && err.value.code === "validation_failed" ? maT("card.submitErrors") : "",
        }),
        ed
          ? maH("div", { class: "row mt" }, [
              maH("button", { class: "btn", type: "button", onClick: () => emit("go", 2) }, maT("common.back")),
              maH("div", { class: "spacer" }),
              maH("button", { class: "btn", type: "button", disabled: !dirty.value || busy.value, onClick: save }, maT("route2.save")),
              canSubmit.value
                ? maH("button", { class: "btn primary", type: "button", disabled: busy.value, "data-test": "submit", onClick: submit }, [
                    busy.value ? maH("span", { class: "spinner" }) : null,
                    maT("card.submit"),
                  ])
                : null,
            ])
          : null,
      ]);
    };
  },
};

/* route timeline + on-the-fly route management (side panel) */
const MaRouteTimeline = {
  name: "MaRouteTimeline",
  __scopeId: "data-v-34c8b6ae",
  props: { analysis: { type: Object, required: !0 } },
  emits: ["updated"],
  setup(p, { emit }) {
    const modal = H(null),
      comment = H(""),
      pick = H(null),
      target = H("new"),
      busy = H(!1),
      err = H(null),
      can = (k) => p.analysis.available_actions.includes(k),
      groups = ae(() => {
        const a = p.analysis;
        if (a.route.length) {
          const m = new Map();
          return (
            a.route.forEach((s) => {
              m.has(s.stage) ||
                m.set(s.stage, { stage: s.stage, title: s.stage_title, kind: s.stage_kind, mode: s.stage_mode, rows: [] }),
                m.get(s.stage).rows.push({ ...s, key: s.id });
            }),
            [...m.values()].sort((x, y) => x.stage - y.stage)
          );
        }
        const g = a.route_plan.map((s, i) => ({
          stage: i + 1,
          title: s.title,
          kind: "dzo",
          mode: s.mode,
          rows: s.members.map((u) => ({ key: `u${u.id}`, assignee: u.full_name, status: "waiting" })),
        }));
        return (
          a.fixed_stages.forEach((f) =>
            g.push({
              stage: g.length + 1,
              title: f.title,
              kind: f.kind,
              mode: "sequential",
              rows: [{ key: `f${f.stage}`, assignee: f.assignee, status: "waiting" }],
            }),
          ),
          g
        );
      }),
      openStages = ae(() =>
        groups.value.filter(
          (g) =>
            g.kind === "dzo" &&
            g.stage >= (p.analysis.current_stage || 0) &&
            g.rows.some((r) => r.status === "pending" || r.status === "waiting"),
        ),
      ),
      badge = (s) => ({ approved: "success", returned: "danger", pending: "", waiting: "gray", skipped: "gray", removed: "gray" })[s];
    function open(type, step) {
      (modal.value = { type, step }),
        (comment.value = ""),
        (pick.value = null),
        (err.value = null),
        (target.value = openStages.value[0] ? String(openStages.value[0].stage) : "new");
    }
    async function confirm() {
      const m = modal.value,
        a = p.analysis;
      if (m.type === "add" && !pick.value) {
        err.value = { status: 400, message: maT("route2.pickUser") };
        return;
      }
      (busy.value = !0), (err.value = null);
      try {
        const r =
          m.type === "remove"
            ? await ie.routeRemove(a.id, m.step.id, comment.value.trim())
            : m.type === "recall"
              ? await ie.recall(a.id, comment.value.trim())
              : await ie.routeAdd(a.id, { user: pick.value.id, stage: target.value, comment: comment.value.trim() });
        (modal.value = null), emit("updated", r);
      } catch (x) {
        err.value = x;
      } finally {
        busy.value = !1;
      }
    }
    function modalBody() {
      const m = modal.value,
        a = p.analysis;
      if (!m) return [];
      const reason = maH("div", { class: "field" }, [
        maH("label", null, maT("route2.reason")),
        maH("textarea", { class: "input", rows: 3, value: comment.value, onInput: (ev) => (comment.value = ev.target.value) }),
      ]);
      if (m.type === "remove") return [maH("p", null, maT("route2.removeText", { name: m.step.assignee })), reason, maH(vt, { error: err.value })];
      if (m.type === "recall") return [maH("p", null, maT("route2.recallText")), reason, maH(vt, { error: err.value })];
      return [
        maH("div", { class: "field" }, [
          maH("label", null, [maT("route2.approver"), maH("span", { class: "req" }, " *")]),
          pick.value
            ? maPicked(pick.value, () => (pick.value = null))
            : maH(Ci, {
                fetcher: (q) => ie.searchUsers(q, a.dzo.id),
                itemLabel: (u) => u.full_name,
                itemSub: maWho,
                placeholder: maT("approvers.searchPh"),
                onSelect: (u) => (pick.value = u),
              }),
        ]),
        maH("div", { class: "field" }, [
          maH("label", null, maT("route2.targetStage")),
          maSelect(
            target.value,
            [
              ...openStages.value.map((g) => [
                g.stage,
                `${g.stage}. ${g.title} (${maT(g.mode === "parallel" ? "route2.par" : "route2.seq")}${g.stage === a.current_stage ? `, ${maT("route2.currentMark")}` : ""})`,
              ]),
              ["new", maT("route2.newStage")],
            ],
            (v) => (target.value = v),
          ),
        ]),
        reason,
        maH("p", { class: "small muted" }, maT("route2.addHint")),
        maH(vt, { error: err.value }),
      ];
    }
    return () => {
      const a = p.analysis,
        m = modal.value,
        manage = can("manage_route");
      return maH("div", { class: "timeline" }, [
        a.route.length ? null : maH("p", { class: "muted small" }, maT("route.notSubmitted")),
        ...groups.value.map((g) =>
          maH("div", { key: g.stage, class: ["stage", { current: g.stage === a.current_stage }] }, [
            maH("div", { class: "stage-title ma-tl-title" }, [
              maH("span", null, g.title),
              maH("span", { class: "ma-mode" }, g.mode === "parallel" ? `⇉ ${maT("route2.par")}` : `→ ${maT("route2.seq")}`),
            ]),
            ...g.rows.map((u) =>
              maH("div", { key: u.key, class: ["step", u.status] }, [
                maH("span", { class: "dot" }),
                maH("div", { class: "step-body" }, [
                  maH("div", { class: "row between ma-tl-row" }, [
                    maH("b", null, u.assignee),
                    maH("span", { class: "ma-tl-actions" }, [
                      maH("span", { class: ["badge", badge(u.status)] }, maT(`route.stepStatus.${u.status}`)),
                      manage && u.id && g.kind === "dzo" && (u.status === "pending" || u.status === "waiting")
                        ? maH("button", { class: "icon-btn", type: "button", title: maT("route2.remove"), onClick: () => open("remove", u) }, "✕")
                        : null,
                    ]),
                  ]),
                  u.decided_by_name && u.decided_by_name !== u.assignee
                    ? maH("div", { class: "small" }, [u.decided_by_name, u.decided_by_position ? maH("span", { class: "muted" }, `, ${u.decided_by_position}`) : null])
                    : null,
                  u.carried ? maH("div", { class: "small muted" }, `↻ ${maT("route2.carried")}`) : null,
                  u.added_by_name ? maH("div", { class: "small muted" }, `+ ${maT("route2.addedBy")}: ${u.added_by_name}`) : null,
                  u.decided_at ? maH("div", { class: "small muted" }, ds(u.decided_at)) : null,
                  u.comment ? maH("div", { class: "comment" }, `«${u.comment}»`) : null,
                  u.status === "pending" ? maH("div", { class: "small current-label" }, maT("route.current")) : null,
                ]),
              ]),
            ),
          ]),
        ),
        manage
          ? maH("div", { class: "ma-manage" }, [
              maH("div", { class: "ma-manage-title" }, maT("route2.manageTitle")),
              maH("div", { class: "ma-manage-btns" }, [
                a.status === "on_approval_dzo"
                  ? maH("button", { class: "btn sm", type: "button", onClick: () => open("add") }, `+ ${maT("route2.addApprover")}`)
                  : null,
                maH("button", { class: "btn sm danger", type: "button", onClick: () => open("recall") }, `↩ ${maT("route2.recall")}`),
              ]),
            ])
          : null,
        maH(
          In,
          {
            open: !!m,
            title: m ? maT(m.type === "remove" ? "route2.remove" : m.type === "recall" ? "route2.recall" : "route2.addApprover") : "",
            onClose: () => (modal.value = null),
          },
          {
            default: () => modalBody(),
            footer: () => [
              maH("button", { class: "btn", type: "button", onClick: () => (modal.value = null) }, maT("common.cancel")),
              maH(
                "button",
                { class: ["btn", m && m.type !== "add" ? "danger" : "primary"], type: "button", disabled: busy.value, onClick: confirm },
                maT("common.confirm"),
              ),
            ],
          },
        ),
      ]);
    };
  },
};

/* decision panel: approve / rework / bring in another approver */
const MaDecisionPanel = {
  name: "MaDecisionPanel",
  props: { analysis: { type: Object, required: !0 }, submit: { type: Function, required: !0 } },
  emits: ["updated", "reload"],
  setup(p, { emit }) {
    const mode = H(null),
      comment = H(""),
      tried = H(!1),
      busy = H(!1),
      err = H(""),
      pick = H(null),
      addMode = H("parallel"),
      can = ae(() => p.analysis.available_actions.includes("approve")),
      step = ae(() => p.analysis.route.find((s) => s.id === p.analysis.current_step_id)),
      approveLabel = ae(() => maT(step.value && step.value.stage_kind === "final" ? "decision.approveFinal" : "decision.approve")),
      others = ae(() =>
        step.value
          ? p.analysis.route.filter((s) => s.stage === step.value.stage && s.status === "pending" && s.id !== step.value.id)
          : [],
      ),
      needComment = ae(() => mode.value === "rework" && tried.value && !comment.value.trim());
    function open(m) {
      (mode.value = m), (comment.value = ""), (tried.value = !1), (err.value = ""), (pick.value = null), (addMode.value = "parallel");
    }
    async function confirm() {
      if (((tried.value = !0), mode.value === "rework" && !comment.value.trim())) return;
      if (mode.value === "add" && !pick.value) {
        err.value = maT("route2.pickUser");
        return;
      }
      (busy.value = !0), (err.value = "");
      try {
        mode.value === "add"
          ? emit("updated", await ie.routeAdd(p.analysis.id, { user: pick.value.id, mode: addMode.value, comment: comment.value.trim() }))
          : await p.submit(mode.value, comment.value.trim(), p.analysis.current_step_id),
          (mode.value = null);
      } catch (x) {
        (err.value = maErr(x)), x.code === "status_changed" && emit("reload");
      } finally {
        busy.value = !1;
      }
    }
    function body() {
      const out = [];
      mode.value === "add" &&
        out.push(
          maH("div", { class: "field" }, [
            maH("label", null, [maT("route2.approver"), maH("span", { class: "req" }, " *")]),
            pick.value
              ? maPicked(pick.value, () => (pick.value = null))
              : maH(Ci, {
                  fetcher: (q) => ie.searchUsers(q),
                  itemLabel: (u) => u.full_name,
                  itemSub: (u) => [maWho(u), u.dzo && u.dzo.code].filter(Boolean).join(" · "),
                  placeholder: maT("approvers.searchPh"),
                  onSelect: (u) => (pick.value = u),
                }),
          ]),
          maH(
            "div",
            { class: "field" },
            maRadio(
              "add-mode",
              addMode.value,
              [
                ["parallel", maT("route2.addModeParallel"), maT("route2.addModeParallelHint")],
                ["after", maT("route2.addModeAfter"), maT("route2.addModeAfterHint")],
              ],
              (k) => (addMode.value = k),
            ),
          ),
        );
      out.push(
        maH("div", { class: "field" }, [
          maH("label", null, [
            maT(mode.value === "rework" ? "decision.comment" : "decision.commentOptional"),
            mode.value === "rework" ? maH("span", { class: "req" }, " *") : null,
          ]),
          maH("textarea", {
            class: ["input", { invalid: needComment.value }],
            rows: 4,
            "data-test": "comment",
            value: comment.value,
            onInput: (ev) => (comment.value = ev.target.value),
          }),
          needComment.value ? maH("span", { class: "field-error" }, maT("decision.commentRequired")) : null,
        ]),
      );
      return err.value && out.push(maH("div", { class: "alert error" }, err.value)), out;
    }
    return () => {
      if (!can.value) return null;
      const s = step.value,
        o = others.value,
        title = mode.value === "rework" ? maT("decision.rework") : mode.value === "add" ? maT("route2.addApprover") : approveLabel.value;
      return maH("div", { class: "card ma-decision" }, [
        maH("div", { class: "row between" }, [
          maH("div", null, [
            maH("h3", null, maT("decision.awaiting")),
            maH(
              "div",
              { class: "muted small" },
              [
                s ? `${maT("route2.stage")}: ${s.stage_title}` : maT(`status.${p.analysis.status}`),
                s && s.stage_mode === "parallel" ? maT("route2.par") : "",
                o.length ? maT("route2.othersPending", { n: o.length }) : "",
              ]
                .filter(Boolean)
                .join(" · "),
            ),
            o.length ? maH("div", { class: "small muted" }, `${maT("route2.parallelWith")}: ${o.map((x) => x.assignee).join(", ")}`) : null,
          ]),
          maH("div", { class: "row ma-tight" }, [
            p.analysis.available_actions.includes("add_approver")
              ? maH("button", { class: "btn", type: "button", onClick: () => open("add") }, `+ ${maT("route2.addApprover")}`)
              : null,
            maH("button", { class: "btn danger", type: "button", "data-test": "rework", onClick: () => open("rework") }, maT("decision.rework")),
            maH("button", { class: "btn success", type: "button", "data-test": "approve", onClick: () => open("approve") }, approveLabel.value),
          ]),
        ]),
        maH(
          In,
          { open: !!mode.value, title, onClose: () => (mode.value = null) },
          {
            default: () => body(),
            footer: () => [
              maH("button", { class: "btn", type: "button", onClick: () => (mode.value = null) }, maT("common.cancel")),
              maH(
                "button",
                {
                  class: ["btn", mode.value === "rework" ? "danger" : mode.value === "add" ? "primary" : "success"],
                  type: "button",
                  "data-test": "confirm",
                  disabled: busy.value,
                  onClick: confirm,
                },
                [busy.value ? maH("span", { class: "spinner" }) : null, mode.value === "add" ? maT("common.add") : title],
              ),
            ],
          },
        ),
      ]);
    };
  },
};

/* multi-year price history across DZO */
const MA_DZO_COLORS = { 1: "#2a78d6", 2: "#eb6834", 3: "#1baf7a", 4: "#eda100" },
  MaPriceHistory = {
    name: "MaPriceHistory",
    props: { item: { type: Object, required: !0 }, ownDzoId: Number, marketingPrice: { default: null } },
    setup(p) {
      const onlyOthers = H(!1),
        period = H("6"),
        plan = H(""),
        hover = H(null),
        y0 = new Date().getFullYear(),
        avg = (l) => (l.length ? Jt(l.reduce((s, x) => s + x, 0) / l.length) : null),
        rows = ae(() =>
          (p.item.history || []).filter(
            (r) =>
              (!onlyOthers.value || !r.is_own) &&
              (!plan.value || r.plan_type === plan.value) &&
              (period.value === "all" || r.year > y0 - Number(period.value)),
          ),
        ),
        years = ae(() => [...new Set(rows.value.map((r) => r.year))].sort((a, b) => a - b)),
        dzos = ae(() => {
          const m = new Map();
          return (
            rows.value.forEach((r) => m.set(r.dzo_id, { id: r.dzo_id, name: r.dzo, code: r.dzo_code, own: r.is_own })),
            [...m.values()].sort((a, b) => b.own - a.own || a.id - b.id)
          );
        }),
        cells = ae(() => {
          const out = {};
          return (
            dzos.value.forEach((d) => {
              out[d.id] = years.value.map((y) => {
                const l = rows.value.filter((r) => r.dzo_id === d.id && r.year === y).map((r) => r.price_wo_vat);
                return l.length ? { v: avg(l), n: l.length } : null;
              });
            }),
            out
          );
        }),
        group = ae(() => years.value.map((y) => avg(rows.value.filter((r) => r.year === y).map((r) => r.price_wo_vat)))),
        mp = ae(() => (p.marketingPrice == null || p.marketingPrice === "" ? null : Number(p.marketingPrice))),
        stats = ae(() => {
          const ys = years.value,
            g = group.value;
          let i = ys.length - 1;
          for (; i >= 0 && ys[i] >= y0; ) i--;
          const prev = i >= 0 ? { year: ys[i], v: g[i] } : null,
            n = ys.length - 1,
            cagr = n > 0 && g[0] && g[n] ? Jt((Math.pow(g[n] / g[0], 1 / (ys[n] - ys[0])) - 1) * 100) : null;
          return { prev, cagr, dev: prev && mp.value ? Jt(((mp.value - prev.v) / prev.v) * 100) : null };
        });
      const change = (list) => {
        const v = list.filter(Boolean);
        return v.length > 1 ? Jt(((v[v.length - 1].v - v[0].v) / v[0].v) * 100) : null;
      };
      function chart() {
        const ys = years.value;
        if (!ys.length) return null;
        const W = 680,
          HH = 230,
          L = 70,
          R = 18,
          T = 14,
          B = 28,
          vals = [...Object.values(cells.value).flat().filter(Boolean).map((c) => c.v), ...group.value.filter((v) => v != null)];
        mp.value && vals.push(mp.value);
        let lo = Math.min(...vals),
          hi = Math.max(...vals);
        const padV = (hi - lo || hi * 0.1) * 0.12;
        (lo = Math.max(0, lo - padV)), (hi += padV);
        const x = (i) => (ys.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (ys.length - 1)),
          y = (v) => T + (1 - (v - lo) / (hi - lo)) * (HH - T - B),
          path = (pts) => {
            let d = "",
              pen = !1;
            return (
              pts.forEach((v, i) => {
                v == null ? (pen = !1) : ((d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`), (pen = !0));
              }),
              d
            );
          },
          ticks = Array.from({ length: 4 }, (_, i) => lo + ((hi - lo) * (i + 0.5)) / 4),
          showTip = (cx, cy, text) => (hover.value = { left: (cx / W) * 100, top: (cy / HH) * 100, text }),
          series = dzos.value.map((d) => ({ d, pts: cells.value[d.id].map((c) => (c ? c.v : null)) })),
          svg = maH("svg", { class: "ma-chart", viewBox: `0 0 ${W} ${HH}`, role: "img", "aria-label": maT("hist.chart"), onMouseleave: () => (hover.value = null) }, [
            ...ticks.map((t) =>
              maH("g", null, [
                maH("line", { x1: L, x2: W - R, y1: y(t), y2: y(t), class: "ma-grid" }),
                maH("text", { x: L - 8, y: y(t) + 4, "text-anchor": "end", class: "ma-axis" }, maInt.format(t)),
              ]),
            ),
            ...ys.map((yr, i) => maH("text", { x: x(i), y: HH - 8, "text-anchor": "middle", class: "ma-axis" }, String(yr))),
            mp.value
              ? maH("g", null, [
                  maH("line", { x1: L, x2: W - R, y1: y(mp.value), y2: y(mp.value), class: "ma-mp-line" }),
                  maH("text", { x: W - R, y: y(mp.value) - 6, "text-anchor": "end", class: "ma-mp-label" }, `${maT("hist.marketing")}: ${Re(mp.value)}`),
                ])
              : null,
            maH("path", { d: path(group.value), class: "ma-avg-line" }),
            ...series.map((s) => maH("path", { d: path(s.pts), fill: "none", stroke: MA_DZO_COLORS[s.d.id] || "#667085", "stroke-width": 2, "stroke-linejoin": "round" })),
            ...series.flatMap((s) =>
              s.pts.map((v, i) =>
                v == null
                  ? null
                  : maH("g", null, [
                      maH("circle", { cx: x(i), cy: y(v), r: 4, fill: MA_DZO_COLORS[s.d.id] || "#667085", stroke: "#fff", "stroke-width": 2 }),
                      maH("circle", {
                        cx: x(i),
                        cy: y(v),
                        r: 11,
                        fill: "transparent",
                        class: "ma-hit",
                        onMouseenter: () => showTip(x(i), y(v), `${s.d.code} · ${ys[i]}: ${Re(v)} ₸`),
                      }),
                    ]),
              ),
            ),
          ]);
        return maH("div", { class: "ma-chart-wrap" }, [
          svg,
          hover.value
            ? maH("div", { class: "ma-tip", style: { left: `${hover.value.left}%`, top: `${hover.value.top}%` } }, hover.value.text)
            : null,
          maH("div", { class: "ma-legend small" }, [
            ...dzos.value.map((d) =>
              maH("span", null, [maH("i", { class: "ma-sw", style: { background: MA_DZO_COLORS[d.id] || "#667085" } }), `${d.code}${d.own ? ` (${maT("hist.own")})` : ""}`]),
            ),
            maH("span", null, [maH("i", { class: "ma-sw dash" }), maT("hist.groupAvg")]),
            mp.value ? maH("span", null, [maH("i", { class: "ma-sw dot" }), maT("hist.marketing")]) : null,
          ]),
        ]);
      }
      return () => {
        const all = p.item.history || [],
          ys = years.value,
          st = stats.value;
        if (!all.length) return maH("p", { class: "muted small" }, maT("offers.noHistory"));
        return maH("details", { class: "ma-hist", open: !0 }, [
          maH("summary", { class: "small" }, `${maT("hist.title")} (${all.length})`),
          maH("div", { class: "ma-hist-filters" }, [
            maH("label", { class: "checkbox small" }, [
              maH("input", { type: "checkbox", checked: onlyOthers.value, onChange: (ev) => (onlyOthers.value = ev.target.checked) }),
              maT("hist.onlyOthers"),
            ]),
            maSeg(
              [
                ["3", maT("hist.years", { n: 3 })],
                ["6", maT("hist.years", { n: 6 })],
                ["all", maT("hist.allYears")],
              ],
              period.value,
              (k) => (period.value = k),
              "sm",
            ),
            maSelect(
              plan.value,
              [["", maT("hist.allPlans")], ...Object.entries(MA_PLAN).map(([k, v]) => [k, v.short])],
              (v) => (plan.value = v),
              "input ma-hist-plan",
            ),
          ]),
          rows.value.length
            ? [
                maH("div", { class: "ma-kpis" }, [
                  st.prev
                    ? maH("div", { class: "ma-kpi" }, [maH("span", { class: "small muted" }, maT("hist.prevYear", { y: st.prev.year })), maH("b", null, `${Re(st.prev.v)} ₸`)])
                    : null,
                  st.dev != null
                    ? maH("div", { class: "ma-kpi" }, [
                        maH("span", { class: "small muted" }, maT("hist.devPrev", { y: st.prev.year })),
                        maH("b", { class: { "ma-up": st.dev > 0, "ma-down": st.dev < 0 } }, maPct(st.dev)),
                      ])
                    : null,
                  st.cagr != null
                    ? maH("div", { class: "ma-kpi" }, [maH("span", { class: "small muted" }, `${maT("hist.cagr")} (${ys[0]}–${ys[ys.length - 1]})`), maH("b", null, maPct(st.cagr))])
                    : null,
                ]),
                maH("div", { class: "small muted ma-chart-title" }, maT("hist.chart")),
                chart(),
                maH("div", { class: "table-wrap" }, [
                  maH("table", { class: "table ma-matrix" }, [
                    maH("thead", null, [
                      maH("tr", null, [
                        maH("th", null, maT("registry.dzo")),
                        ...ys.map((yr) => maH("th", { class: "num" }, String(yr))),
                        maH("th", { class: "num" }, maT("hist.change")),
                      ]),
                    ]),
                    maH(
                      "tbody",
                      null,
                      dzos.value.map((d) =>
                        maH("tr", { key: d.id, class: { "ma-own": d.own } }, [
                          maH("td", null, [
                            maH("i", { class: "ma-sw", style: { background: MA_DZO_COLORS[d.id] || "#667085" } }),
                            d.name,
                            d.own ? maH("span", { class: "badge ma-own-badge" }, maT("hist.own")) : null,
                          ]),
                          ...cells.value[d.id].map((c) =>
                            maH("td", { class: "num" }, c ? [Re(c.v), c.n > 1 ? maH("span", { class: "sub" }, `n=${c.n}`) : null] : "—"),
                          ),
                          maH("td", { class: "num" }, maPct(change(cells.value[d.id]))),
                        ]),
                      ),
                    ),
                    maH("tfoot", null, [
                      maH("tr", null, [
                        maH("td", null, maT("hist.groupAvg")),
                        ...group.value.map((v) => maH("td", { class: "num" }, Re(v))),
                        maH("td", { class: "num" }, maPct(change(group.value.map((v) => (v == null ? null : { v }))))),
                      ]),
                      maH("tr", { class: "ma-yoy" }, [
                        maH("td", null, maT("hist.yoy")),
                        ...group.value.map((v, i) =>
                          maH("td", { class: "num" }, i && v && group.value[i - 1] ? maPct(Jt(((v - group.value[i - 1]) / group.value[i - 1]) * 100)) : "—"),
                        ),
                        maH("td"),
                      ]),
                    ]),
                  ]),
                ]),
                maH("details", { class: "ma-records" }, [
                  maH("summary", { class: "small" }, `${maT("hist.records")} (${rows.value.length})`),
                  maH("div", { class: "table-wrap" }, [
                    maH("table", { class: "table ma-small" }, [
                      maH("thead", null, [
                        maH("tr", null, [
                          maH("th", null, maT("registry.dzo")),
                          maH("th", null, maT("hist.doc")),
                          maH("th", null, maT("plan.column")),
                          maH("th", null, maT("route.date")),
                          maH("th", { class: "num" }, maT("items.price")),
                          maH("th", { class: "num" }, maT("hist.delta")),
                        ]),
                      ]),
                      maH(
                        "tbody",
                        null,
                        rows.value.map((r, i) =>
                          maH("tr", { key: i }, [
                            maH("td", null, [r.dzo, r.is_own ? maH("span", { class: "sub" }, maT("hist.own")) : null]),
                            maH("td", { class: "nowrap" }, r.source_number),
                            maH("td", { class: "nowrap" }, r.plan_label),
                            maH("td", null, Un(r.approved_at)),
                            maH("td", { class: "num" }, Re(r.price_wo_vat)),
                            maH("td", { class: "num" }, mp.value ? maPct(Jt(((mp.value - r.price_wo_vat) / r.price_wo_vat) * 100)) : "—"),
                          ]),
                        ),
                      ),
                    ]),
                  ]),
                ]),
              ]
            : maH("p", { class: "muted small" }, maT("hist.noData")),
        ]);
      };
    },
  };
