/* =====================================================================
 * Extensions: procurement plan types (ППЗ/ГПЗ/ДПЗ), flexible approval
 * route (parallel/sequential stages, add/remove approvers, recall,
 * resubmit from the returning stage) and multi-year price history.
 * ===================================================================== */

/* ---------- procurement plan ---------- */
const MA_PLAN = {
  ppz: {
    short: "ППЗ",
    name: "Предварительный план закупок",
    hint: "Предварительная потребность — маркетинг для формирования проекта плана",
  },
  gpz: {
    short: "ГПЗ",
    name: "Годовой план закупок",
    hint: "Закупка в рамках утверждённого годового плана на плановый год",
  },
  dpz: {
    short: "ДПЗ",
    name: "Долгосрочный план закупок",
    hint: "Долгосрочная закупка на период от 2 лет (укажите годы начала и окончания)",
  },
};
function MA_planName(t) {
  return MA_PLAN[t] ? `${MA_PLAN[t].short} — ${MA_PLAN[t].name}` : "—";
}
function MA_planPeriod(e) {
  if (!e || !e.plan_year) return "";
  return e.plan_type === "dpz" && e.plan_year_to
    ? `${e.plan_year}–${e.plan_year_to}`
    : String(e.plan_year);
}
function MA_planLabel(e) {
  return e && MA_PLAN[e.plan_type]
    ? `${MA_PLAN[e.plan_type].short} ${MA_planPeriod(e)}`.trim()
    : "—";
}
function MA_applyPlan(e, t) {
  if ("plan_type" in t && t.plan_type) {
    MA_PLAN[t.plan_type] ||
      Ae(400, "plan_type_invalid", "Выберите план закупок: ППЗ, ГПЗ или ДПЗ", [
        { field: "plan_type", code: "invalid", message: "Выберите ППЗ, ГПЗ или ДПЗ" },
      ]);
    e.plan_type = t.plan_type;
  }
  if ("plan_year" in t && t.plan_year) {
    const y = Number(t.plan_year);
    (Number.isInteger(y) && y >= 2000 && y <= 2100) ||
      Ae(400, "plan_year_invalid", "Некорректный плановый год");
    e.plan_year = y;
  }
  if ("plan_year_to" in t)
    e.plan_year_to = t.plan_year_to ? Number(t.plan_year_to) : null;
  if (e.plan_type === "dpz") {
    e.plan_year_to || (e.plan_year_to = e.plan_year + 2);
    e.plan_year_to > e.plan_year ||
      Ae(
        400,
        "plan_period_invalid",
        "Для ДПЗ год окончания должен быть позже года начала",
      );
  } else e.plan_year_to = null;
}

/* ---------- price history ---------- */
function MA_refreshActive() {
  const latest = {},
    border = new Date(ki().getTime() - 730 * 864e5).toISOString();
  le.catalog.forEach((c) => {
    const k = `${c.nsi_code}|${c.dzo}`;
    (!latest[k] || c.approved_at > latest[k].approved_at) && (latest[k] = c);
  });
  le.catalog.forEach((c) => {
    c.is_active = latest[`${c.nsi_code}|${c.dzo}`] === c && c.approved_at >= border;
  });
}
function MA_seedCatalog() {
  const Y = ki().getFullYear(),
    base = {
      1010101001: 8100,
      1010101002: 5700,
      2020202001: 144e4,
      2020202002: 40500,
      3030303001: 2200,
      3030303002: 1580,
      4040404001: 21e3,
      4040404002: 23500,
    },
    factor = { 1: 1, 2: 0.97, 3: 1.04, 4: 1.01 },
    plans = ["gpz", "gpz", "gpz", "ppz", "dpz"];
  let seed = 20240917,
    n = 0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  Object.entries(base).forEach(([code, price]) => {
    [1, 2, 3, 4].forEach((dzo) => {
      for (let y = Y - 5; y <= Y; y++) {
        const skipKc = dzo === 4 && rnd() < 0.6,
          gap = rnd() < 0.15,
          noise = 0.94 + rnd() * 0.12,
          month = Math.floor(rnd() * 10),
          day = 1 + Math.floor(rnd() * 27),
          plan = plans[Math.floor(rnd() * plans.length)];
        if (skipKc || gap) continue;
        const date = new Date(y, month, day, 11, 0, 0);
        if (date > ki()) continue;
        n++;
        const planYear = plan === "ppz" ? y + 1 : y;
        le.catalog.push({
          nsi_code: code,
          dzo,
          price_wo_vat: Jt((price * factor[dzo] * noise) / Math.pow(1.085, Y - y)),
          approved_at: date.toISOString(),
          source_id: `legacy-${n}`,
          source_number: `ID${y}.${cn(dzo).code}.${String(10 + n).padStart(4, "0")}`,
          plan_type: plan,
          plan_year: planYear,
          plan_year_to: plan === "dpz" ? planYear + 2 : null,
          is_active: !1,
        });
      }
    });
  });
  MA_refreshActive();
}
function MA_seedPlans() {
  const Y = ki().getFullYear(),
    plans = [
      ["gpz", Y, null],
      ["ppz", Y + 1, null],
      ["dpz", Y + 1, Y + 3],
      ["gpz", Y + 1, null],
      ["ppz", Y + 1, null],
    ];
  le.analyses.forEach((a, i) => {
    const p = plans[i];
    p &&
      (([a.plan_type, a.plan_year, a.plan_year_to] = p),
      le.catalog
        .filter((c) => c.source_id === `ma-${a.id}`)
        .forEach((c) => {
          (c.plan_type = a.plan_type), (c.plan_year = a.plan_year);
        }));
  });
}
function MA_history(e, n) {
  return le.catalog
    .filter((d) => d.nsi_code === n.nsi_code && d.source_id !== `ma-${e.id}`)
    .sort((d, c) => c.approved_at.localeCompare(d.approved_at))
    .map((d) => {
      const z = cn(d.dzo);
      return {
        dzo: z.name_ru,
        dzo_code: z.code,
        dzo_id: z.id,
        is_own: d.dzo === e.dzo,
        year: new Date(d.approved_at).getFullYear(),
        plan_type: d.plan_type || "",
        plan_label: d.plan_type ? MA_planLabel(d) : "—",
        price_wo_vat: d.price_wo_vat,
        approved_at: d.approved_at,
        source_number: d.source_number,
        is_active: d.is_active,
      };
    });
}

/* ---------- flexible approval route ---------- */
function MA_canManage(u, e) {
  return (
    !!u &&
    (as(u, "ma_admin") || (as(u, "marketer") && ur(u).includes(e.dzo)))
  );
}
function MA_syncApprovers(e) {
  e.approvers = [...new Set(e.route_plan.flatMap((s) => s.members))];
}
function MA_routePlanOut(e) {
  return (e.route_plan || []).map((s) => ({
    id: s.id,
    title: s.title,
    mode: s.mode,
    members: s.members.map((m) => zs(un(m))).filter(Boolean),
  }));
}
function MA_checkMember(e, id, errs) {
  const r = un(id);
  r
    ? r.id === e.author
      ? errs.push({ user_id: id, code: "author", message: `${on(r)}: автор не может быть согласующим` })
      : r.dzo !== e.dzo &&
        errs.push({
          user_id: id,
          code: "other_dzo",
          message: `${on(r)}: согласующий этапов ДЗО должен быть сотрудником ДЗО анализа`,
        })
    : errs.push({ user_id: id, code: "not_found", message: "Пользователь не найден" });
  return r;
}
function MA_setRoute(e, t) {
  It(e);
  let stages = t || [];
  // legacy payload: a flat list of user ids = one sequential stage
  stages.length &&
    typeof stages[0] != "object" &&
    (stages = [{ title: "", mode: "sequential", members: stages }]);
  const errs = [],
    seen = new Set(),
    out = [];
  stages.forEach((s) => {
    const members = (s.members || []).map((m) => Number(typeof m == "object" ? m.id : m));
    members.forEach((id) => {
      seen.has(id)
        ? errs.push({ user_id: id, code: "duplicate", message: `${on(un(id))}: указан в маршруте дважды` })
        : (seen.add(id), MA_checkMember(e, id, errs));
    });
    members.length &&
      out.push({
        id: s.id || $n("rstage"),
        title: (s.title || "").trim() || `Этап ${out.length + 1} — согласование ДЗО`,
        mode: s.mode === "parallel" ? "parallel" : "sequential",
        members,
      });
  });
  errs.length && Ae(400, "invalid_approvers", "Некорректный маршрут согласования", errs);
  (e.route_plan = out), MA_syncApprovers(e), rt(e, "approvers_set");
}
function MA_buildSteps(e) {
  const defs = [];
  let no = 0;
  e.route_plan.forEach((s) => {
    no++;
    s.members.forEach((m, i) =>
      defs.push({
        stage: no,
        stage_title: s.title,
        stage_kind: "dzo",
        stage_mode: s.mode,
        plan_stage_id: s.id,
        order: s.mode === "parallel" ? 1 : i + 1,
        assignee_user: m,
        assignee_role: "",
      }),
    );
  });
  defs.push(
    {
      stage: no + 1,
      stage_title: js[2],
      stage_kind: "db",
      stage_mode: "sequential",
      plan_stage_id: null,
      order: 1,
      assignee_user: null,
      assignee_role: "db_specialist",
    },
    {
      stage: no + 2,
      stage_title: js[3],
      stage_kind: "final",
      stage_mode: "sequential",
      plan_stage_id: null,
      order: 1,
      assignee_user: null,
      assignee_role: "db_director",
    },
  );
  return defs;
}
const MA_iter = (e) => e.steps.filter((s) => s.iteration === e.iteration),
  MA_open = (s) => s.status === "pending" || s.status === "waiting";
function MA_newStep(e, d, status) {
  const now = lt(),
    s = {
      id: $n("step"),
      iteration: e.iteration,
      carried: !1,
      added_by: null,
      ...d,
      status,
      activated_at: status === "pending" ? now : null,
      decided_at: null,
      decided_by: null,
      decided_by_name: "",
      decided_by_position: "",
      comment: "",
    };
  return e.steps.push(s), s;
}
// activates the next group (lowest order) of waiting steps of a stage
function MA_activate(e, stage) {
  const ws = MA_iter(e)
    .filter((s) => s.stage === stage && s.status === "waiting")
    .sort((s, d) => s.order - d.order);
  if (!ws.length) return [];
  const now = lt(),
    group = ws.filter((s) => s.order === ws[0].order);
  return (
    group.forEach((s) => {
      (s.status = "pending"), (s.activated_at = now), Dl(e, s);
    }),
    group
  );
}
function MA_advance(e, comment, byName) {
  const cur = MA_iter(e);
  if (cur.some((s) => s.status === "pending")) return;
  const next = cur
    .filter((s) => s.status === "waiting")
    .sort((s, d) => s.stage - d.stage || s.order - d.order)[0];
  if (next) {
    e.current_stage = next.stage;
    const target = Uf[next.stage_kind];
    target !== e.status && nn(e, target, "stage_completed", { comment });
    MA_activate(e, next.stage);
    return;
  }
  MA_finalize(e, comment, byName);
}
function MA_finalize(e, comment, byName) {
  (e.current_stage = null),
    (e.approved_at = lt()),
    (e.pdf_status = "pending"),
    (e.ready_at = Date.now() + 2500),
    nn(e, "approved", "approved", { comment }),
    e.items.forEach((o) => {
      le.catalog
        .filter((u) => u.nsi_code === o.nsi_code && u.dzo === e.dzo && u.is_active)
        .forEach((u) => {
          u.is_active = !1;
        }),
        le.catalog.push({
          nsi_code: o.nsi_code,
          dzo: e.dzo,
          price_wo_vat: o.marketing_price,
          approved_at: e.approved_at,
          source_id: `ma-${e.id}`,
          source_number: e.number,
          plan_type: e.plan_type,
          plan_year: e.plan_year,
          plan_year_to: e.plan_year_to,
          is_active: !0,
        });
    }),
    Bs(
      [e.author, e.initiator_user],
      "ma_approved",
      `Маркетинговый анализ ${e.number} утверждён`,
      `Утвердил: ${byName}`,
      e,
    );
}
function MA_submit(e, opts) {
  Rn(e, ["collecting_kp", "rework"]), Pn(dt(), e) || sn();
  const errs = ba(e);
  errs.length &&
    Ae(400, "validation_failed", "Анализ не готов к отправке на согласование", errs);
  const prev = e.iteration,
    resumeFrom = opts.restart === "returned" && e.status === "rework" ? e.returned_from_stage : null,
    carry = resumeFrom
      ? e.steps.filter((s) => s.iteration === prev && s.status === "approved" && s.stage < resumeFrom)
      : [];
  e.iteration += 1;
  MA_buildSteps(e).forEach((d) => {
    const c = carry.find((x) =>
      d.assignee_user
        ? x.assignee_user === d.assignee_user
        : !x.assignee_user && x.assignee_role === d.assignee_role,
    );
    const s = MA_newStep(e, d, c ? "approved" : "waiting");
    c &&
      Object.assign(s, {
        carried: !0,
        activated_at: c.activated_at,
        decided_at: c.decided_at,
        decided_by: c.decided_by,
        decided_by_name: c.decided_by_name,
        decided_by_position: c.decided_by_position,
        comment: c.comment,
      });
  });
  const first = MA_iter(e)
    .filter((s) => s.status === "waiting")
    .sort((s, d) => s.stage - d.stage || s.order - d.order)[0];
  (e.submitted_at = lt()),
    (e.returned_from_stage = null),
    (e.current_stage = first.stage),
    nn(e, Uf[first.stage_kind], "submitted", {
      comment: carry.length
        ? `Повторная отправка с этапа «${first.stage_title}», сохранено согласований: ${MA_iter(e).filter((s) => s.carried).length}`
        : "",
    }),
    MA_activate(e, first.stage);
}
function MA_decide(e, { decision: t, comment: n = "", step_id: s }) {
  (n = (n || "").trim()),
    t === "rework" &&
      !n &&
      Ae(400, "comment_required", "При возврате на доработку комментарий обязателен"),
    Rn(e, ar);
  const u = dt(),
    r = s ? MA_iter(e).find((x) => x.id === Number(s)) : us(e, u);
  (!r || r.status !== "pending") &&
    Ae(409, "step_already_processed", "Шаг уже обработан. Обновите страницу.");
  ma(u, r) || sn(),
    Object.assign(r, {
      decided_by: u.id,
      decided_by_name: on(u),
      decided_by_position: u.position,
      comment: n,
      decided_at: lt(),
    });
  if (t === "rework") {
    (r.status = "returned"),
      MA_iter(e)
        .filter(MA_open)
        .forEach((x) => {
          x.status = "skipped";
        }),
      (e.returned_from_stage = r.stage),
      (e.current_stage = null),
      nn(e, "rework", "returned_for_rework", { comment: n }),
      Bs(
        [e.author],
        "ma_returned",
        `Маркетинговый анализ ${e.number} возвращён на доработку`,
        `${r.decided_by_name}: ${n}`,
        e,
      );
    return;
  }
  (r.status = "approved"),
    rt(e, "step_approved", { comment: n }),
    MA_advance(e, n, r.decided_by_name);
}
function MA_recall(e, t) {
  Rn(e, ar), MA_canManage(dt(), e) || sn();
  const n = ((t && t.comment) || "").trim(),
    open = MA_iter(e).filter(MA_open),
    pending = open.filter((s) => s.status === "pending");
  open.forEach((s) => {
    s.status = "skipped";
  }),
    (e.returned_from_stage = e.current_stage),
    (e.current_stage = null),
    nn(e, "rework", "recalled", { comment: n }),
    Bs(
      pending.flatMap(Kf),
      "ma_recalled",
      `Маркетинговый анализ ${e.number} отозван с согласования`,
      n || "Автор отозвал анализ на доработку",
      e,
    );
}
function MA_planStage(e, id) {
  return e.route_plan.find((s) => s.id === id);
}
function MA_insertStage(e, after, d) {
  return (
    MA_iter(e)
      .filter((s) => s.stage > after)
      .forEach((s) => {
        s.stage++;
      }),
    e.current_stage > after && e.current_stage++,
    MA_newStep(e, { ...d, stage: after + 1, order: 1 }, "waiting")
  );
}
function MA_addStep(e, t) {
  Rn(e, ar);
  const u = dt(),
    id = Number(t.user),
    who = un(id);
  who || Ae(400, "user_required", "Выберите сотрудника");
  id === e.author && Ae(400, "author", "Автор анализа не может быть согласующим");
  const cur = MA_iter(e);
  cur.some((s) => s.assignee_user === id && MA_open(s)) &&
    Ae(400, "already_in_route", `${on(who)} уже есть в маршруте и ещё не принял(а) решение`);
  const mine = us(e, u),
    note = (t.comment || "").trim(),
    base = { assignee_user: id, assignee_role: "", added_by: u.id };
  let added;
  if (mine && (t.mode === "parallel" || t.mode === "after")) {
    // current approver brings in a colleague
    const ps = mine.plan_stage_id && MA_planStage(e, mine.plan_stage_id);
    if (t.mode === "parallel") {
      (added = MA_newStep(
        e,
        {
          ...base,
          stage: mine.stage,
          stage_title: mine.stage_title,
          stage_kind: mine.stage_kind,
          stage_mode: mine.stage_mode,
          plan_stage_id: mine.plan_stage_id,
          order: mine.order,
        },
        "pending",
      )),
        Dl(e, added),
        ps && !ps.members.includes(id) && ps.members.push(id);
    } else {
      const title = "Дополнительное согласование";
      let planId = null;
      if (ps) {
        const ns = { id: $n("rstage"), title, mode: "sequential", members: [id] };
        e.route_plan.splice(e.route_plan.indexOf(ps) + 1, 0, ns), (planId = ns.id);
      }
      added = MA_insertStage(e, mine.stage, {
        ...base,
        stage_title: title,
        stage_kind: mine.stage_kind,
        stage_mode: "sequential",
        plan_stage_id: planId,
      });
    }
  } else if (MA_canManage(u, e)) {
    // author / administrator edits the route on the fly (DZO stages only)
    const errs = [];
    MA_checkMember(e, id, errs),
      errs.length && Ae(400, "invalid_approvers", errs[0].message, errs);
    if (t.stage && t.stage !== "new") {
      const st = Number(t.stage),
        list = cur.filter((s) => s.stage === st),
        ref = list[0];
      (ref && ref.stage_kind === "dzo") || Ae(400, "stage_invalid", "Можно добавлять только в этапы ДЗО");
      (st >= e.current_stage && list.some(MA_open)) ||
        Ae(400, "stage_closed", "Этап уже завершён — выберите текущий или следующий этап");
      const parallel = ref.stage_mode === "parallel",
        live = list.filter((s) => s.status !== "skipped" && s.status !== "removed");
      (added = MA_newStep(
        e,
        {
          ...base,
          stage: st,
          stage_title: ref.stage_title,
          stage_kind: "dzo",
          stage_mode: ref.stage_mode,
          plan_stage_id: ref.plan_stage_id,
          order: parallel ? 1 : Math.max(...live.map((s) => s.order)) + 1,
        },
        parallel && st === e.current_stage ? "pending" : "waiting",
      )),
        added.status === "pending" && Dl(e, added);
      const ps = ref.plan_stage_id && MA_planStage(e, ref.plan_stage_id);
      ps && !ps.members.includes(id) && ps.members.push(id);
    } else {
      e.status === "on_approval_dzo" ||
        Ae(400, "dzo_stage_closed", "Этапы ДЗО уже пройдены — новый этап ДЗО добавить нельзя");
      const lastDzo = Math.max(...cur.filter((s) => s.stage_kind === "dzo").map((s) => s.stage)),
        title = `Дополнительный этап ДЗО`,
        ns = { id: $n("rstage"), title, mode: "sequential", members: [id] };
      e.route_plan.push(ns),
        (added = MA_insertStage(e, lastDzo, {
          ...base,
          stage_title: title,
          stage_kind: "dzo",
          stage_mode: "sequential",
          plan_stage_id: ns.id,
        }));
    }
  } else sn();
  MA_syncApprovers(e),
    rt(e, "route_step_added", {
      comment: `${on(who)} → «${added.stage_title}»${note ? `. ${note}` : ""}`,
    });
}
function MA_removeStep(e, stepId, t) {
  Rn(e, ar);
  const u = dt();
  MA_canManage(u, e) || sn();
  const s = MA_iter(e).find((x) => x.id === stepId) || Cn();
  MA_open(s) || Ae(400, "step_closed", "Решение по шагу уже принято");
  s.stage_kind !== "dzo" &&
    Ae(400, "fixed_stage", "Фиксированные этапы ДБ Холдинга исключить нельзя");
  const note = ((t && t.comment) || "").trim(),
    wasPending = s.status === "pending";
  Object.assign(s, {
    status: "removed",
    comment: note || "Исключён из маршрута",
    decided_at: lt(),
    decided_by: u.id,
    decided_by_name: on(u),
    decided_by_position: u.position,
  });
  const ps = s.plan_stage_id && MA_planStage(e, s.plan_stage_id);
  ps &&
    ((ps.members = ps.members.filter((m) => m !== s.assignee_user)),
    (e.route_plan = e.route_plan.filter((x) => x.members.length)),
    MA_syncApprovers(e)),
    rt(e, "route_step_removed", {
      comment: `${on(un(s.assignee_user))}${note ? `. ${note}` : ""}`,
    }),
    Bs(
      [s.assignee_user],
      "ma_removed",
      `Вы исключены из маршрута согласования ${e.number}`,
      note || "Изменение маршрута автором анализа",
      e,
    ),
    wasPending && MA_advance(e, "", on(u));
}

/* ---------- i18n (called while the dictionary is being built) ---------- */
function MA_mergeI18n(dict) {
  const merge = (t, s) => {
    for (const [k, v] of Object.entries(s))
      v && typeof v == "object" ? merge(t[k] || (t[k] = {}), v) : (t[k] = v);
  };
  merge(dict.ru, {
    plan: {
      type: "План закупок",
      column: "План",
      year: "Плановый год",
      yearFrom: "Год начала",
      yearTo: "Год окончания",
      period: "Период",
    },
    route: { stepStatus: { removed: "Исключён" } },
    route2: {
      title: "Маршрут согласования ДЗО",
      hint: "Сформируйте этапы. В последовательном этапе согласующие рассматривают анализ по очереди, в параллельном — одновременно; этап завершается, когда решение приняли все. Этапы проходят сверху вниз, затем — фиксированные этапы ДБ Холдинга.",
      stage: "Этап",
      approver: "Согласующий",
      seq: "последовательно",
      par: "параллельно",
      seqHint: "Согласующие рассматривают по очереди, в указанном порядке",
      parallelHint: "Все согласующие этапа рассматривают одновременно",
      addSeq: "Последовательный этап",
      addPar: "Параллельный этап",
      empty: "Добавьте хотя бы один этап с согласующими ДЗО",
      emptyStage: "В этапе нет согласующих — этап без согласующих не сохраняется",
      save: "Сохранить маршрут",
      moveUp: "Выше",
      moveDown: "Ниже",
      removeStage: "Удалить этап",
      resubmit: "Повторная отправка после доработки",
      resume: "Продолжить с этапа, вернувшего на доработку",
      resumeHint: "полученные ранее согласования сохранятся",
      restart: "Начать согласование заново",
      restartHint: "все согласующие рассмотрят анализ повторно",
      manageHint: "Анализ на согласовании. Изменить маршрут (добавить или исключить согласующего, отозвать анализ) можно на панели «Маршрут согласования».",
      manageTitle: "Управление маршрутом",
      addApprover: "Добавить согласующего",
      recall: "Отозвать с согласования",
      recallText: "Анализ вернётся в статус «На доработке». При повторной отправке можно продолжить с текущего этапа — полученные согласования сохранятся.",
      remove: "Исключить из маршрута",
      removeText: "Исключить {name} из маршрута? Если это последний согласующий этапа, маршрут перейдёт к следующему этапу.",
      reason: "Причина (необязательно)",
      targetStage: "Куда добавить",
      newStage: "Новый этап ДЗО (перед этапами ДБ Холдинга)",
      currentMark: "текущий",
      pickUser: "Выберите сотрудника",
      carried: "Согласовано в предыдущей отправке",
      addedBy: "Добавлен(а)",
      othersPending: "ещё на рассмотрении: {n}",
      parallelWith: "Параллельно рассматривают",
      addModeParallel: "Параллельно со мной",
      addModeParallelHint: "рассматривает одновременно; этап завершится после решений всех",
      addModeAfter: "После меня",
      addModeAfterHint: "отдельным этапом после завершения текущего",
      addHint: "Сотрудник получит уведомление и появится в маршруте текущей отправки.",
    },
    hist: {
      title: "Исторические цены по ДЗО и годам",
      onlyOthers: "Только другие ДЗО",
      period: "Период",
      years: "{n} лет",
      allYears: "Все годы",
      allPlans: "Все планы",
      own: "ваше ДЗО",
      groupAvg: "Среднее по группе",
      yoy: "Изменение к пред. году",
      change: "Изменение за период",
      prevYear: "Средняя цена {y} г. по группе",
      devPrev: "Маркет. цена к {y} г.",
      cagr: "Среднегодовой рост цены",
      records: "Все записи",
      doc: "Документ",
      delta: "Δ к маркет. цене",
      chart: "Динамика цены за ед., ₸ без НДС",
      marketing: "Маркетинговая цена",
      noData: "По выбранным условиям данных нет",
    },
    events: {
      recalled: "Отозван автором с согласования",
      route_step_added: "Добавлен согласующий",
      route_step_removed: "Исключён согласующий",
      stage_completed: "Этап согласования завершён",
    },
  });
  merge(dict.kk, {
    plan: { type: "Сатып алу жоспары", column: "Жоспар", year: "Жоспарлы жыл" },
  });
}
