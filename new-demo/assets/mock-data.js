(function (root) {
  "use strict";
  const KEY = "lab-demo-business-v2", TODAY = "2026-08-31";
  const roles = { district: "区级管理员", admin: "学校管理员", teacher: "任课教师", technician: "实验员" };
  const group = (label, entries) => ({ label, items: entries.map(([id, label, mark]) => ({ id, label, mark, href: `${id}.html` })) });
  const navigation = {
    district: [group("决策工作区", [["dashboard", "区域总览", "总"], ["ai-query", "智能问数", "问"]]), group("组织与资产", [["schools", "学校管理", "校"], ["teachers", "师资管理", "师"], ["equipment", "设备资产监管", "资"]]), group("运行管理", [["consumables", "耗材危化品", "耗"], ["maintenance", "采购与设备审批", "审"], ["experiments", "实验目录", "录"], ["schedule", "教学监管", "教"]]), group("安全与系统", [["safety", "安全管理", "安"], ["settings", "基础数据与设置", "设"]])],
    school: [group("今日工作", [["dashboard", "学校工作台", "工"], ["ai-query", "智能问数", "问"]]), group("基础档案", [["labs", "实验室与班级", "室"], ["staff", "人员管理", "人"]]), group("日常运行", [["devices", "设备与采购", "备"], ["supplies", "耗材管理", "耗"], ["repair", "维修报修", "修"]]), group("教学与安全", [["experiments", "实验教学", "课"], ["booking", "预约管理", "约"], ["safety", "安全管理", "安"], ["archives", "资料归档", "档"]])]
  };
  const clone = x => JSON.parse(JSON.stringify(x));
  const must = (ok, message) => { if (!ok) throw new Error(message); };
  const text = (x, label = "内容") => { const s = String(x ?? "").trim(); must(s.length > 0 && s.length <= 2000, `请填写${label}（不超过2000字）。`); return s; };
  const num = (x, label, min = 0, integer = false) => { const n = Number(x); must(x !== "" && x != null && Number.isFinite(n) && n >= min && (!integer || Number.isInteger(n)), `${label}须为不小于${min}的${integer ? "整数" : "数值"}。`); return n; };
  const date = x => { const s = String(x || ""); must(/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s, "请选择有效日期。"); return s; };
  const choice = (x, options, label) => { must(options.includes(x), `${label}不在可选范围内。`); return x; };
  const find = (db, table, id) => { const r = db[table]?.find(r => r.id === id); must(r, "关联记录不存在，请刷新后重新选择。"); return r; };
  const ratio = (done, total) => total ? `${(done / total * 100).toFixed(1)}%` : "不适用";
  const optional = (value, label, max = 200) => { const s = String(value ?? "").trim(); must(s.length <= max, `${label}不能超过${max}字。`); return s; };
  function weekOf(term, day) { const start = new Date(`${term.start}T00:00:00Z`); return Math.floor(((Date.parse(day) - start.getTime()) / 86400000 + (start.getUTCDay() + 6) % 7) / 7) + 1; }
  function weekDate(term, week) { const start = new Date(`${term.start}T00:00:00Z`); start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7 + (Number(week) - 1) * 7); return [term.start, start.toISOString().slice(0, 10)].sort().at(-1); }
  const activeBooking = r => ["待审批", "已通过", "已准备"].includes(r.state);
  const categories = ["物理仪器", "化学仪器", "生物仪器", "科学仪器", "耗材", "危化品"];
  const tableNames = { schools: "学校", staff: "人员", labs: "实验室", classes: "班级", terms: "学期", catalog: "实验目录", assets: "设备资产", purchases: "采购申请", receipts: "入库单", repairs: "设备处理单", moves: "调拨记录", loans: "借还记录", counts: "盘点记录", inventory: "耗材库存", flows: "库存流水", plans: "教学计划", bookings: "实验预约", checks: "检查记录", hazards: "隐患整改", tasks: "检查任务", archives: "归档资料", submissions: "数据上报", logs: "操作日志" };
  function seed() {
    const db = { version: 2, revision: 0, seq: 100, updatedAt: "2026-08-31T08:00:00+08:00", settings: { region: "上海市青浦区", authority: "青浦区教育局", repairDays: 7, lowStock: true, weeklyReport: true, syncReminder: true, exportEnabled: true } };
    Object.keys(tableNames).forEach(t => { db[t] = []; });
    db.schools = [{ id: "S1", code: "QP001", name: "青浦高级中学", stage: "高中", street: "夏阳街道" }, { id: "S2", code: "QP002", name: "青浦区第一中学", stage: "高中", street: "盈浦街道" }, { id: "S3", code: "QP003", name: "东湖中学", stage: "高中", street: "夏阳街道" }];
    db.terms = [{ id: "TERM26", name: "2026-2027学年第一学期", start: TODAY, end: "2027-01-29" }, { id: "TERM25", name: "2025-2026学年第二学期", start: "2026-03-02", end: "2026-07-03" }];
    db.catalog = [
      ["E1", "WL-01", "测量物体的速度", "物理", "必做", "分组", "第一章 运动的描述", "轨道小车、计时器、刻度尺"],
      ["E2", "HX-01", "配制一定物质的量浓度的溶液", "化学", "必做", "分组", "第一章 物质及其变化", "电子天平、容量瓶、烧杯"],
      ["E3", "SW-01", "使用显微镜观察细胞", "生物", "必做", "分组", "第一章 走近细胞", "显微镜、载玻片、盖玻片"],
      ["E4", "WL-02", "探究加速度与力、质量的关系", "物理", "必做", "演示", "第四章 运动和力的关系", "轨道小车、砝码"],
      ["E5", "SW-02", "校园植物细胞观察拓展", "生物", "选做", "分组", "显微观察拓展", "显微镜、载玻片"]
    ].map(([id, code, name, subject, required, mode, chapter, equipment]) => ({ id, code, name, subject, required, mode, chapter, equipment, grade: "高一", version: id === "E5" ? "校本拓展2026版" : "人教版·必修第一册", periods: id === "E4" ? 2 : 1 }));
    const names = [["顾文清", "张明华", "王秀英", "李秀英", "陈小红"], ["吴静", "周明", "沈澜", "陆青", "许晓"], ["赵宁", "李建国", "林芳", "周敏", "陈洁"]];
    db.schools.forEach((s, i) => {
      ["admin", "teacher", "teacher", "teacher", "technician"].forEach((role, j) => db.staff.push({ id: `${s.id}-T${j}`, school: s.id, name: names[i][j], role, subject: ["综合", "物理", "化学", "生物", "综合"][j], title: j === 4 ? "实验技术人员" : "一级教师", phone: `138****${1100 + i * 10 + j}`, enabled: true, qualification: j === 4 ? "实验室安全培训证" : "教师资格证", trainings: j === 2 ? [] : [{ name: "实验室安全与规范操作培训", date: "2026-08-24", hours: 4, evidence: "培训签到记录" }] }));
      ["物理", "化学", "生物"].forEach((subject, j) => db.labs.push({ id: `${s.id}-L${j + 1}`, school: s.id, name: `${subject}实验室 1`, subject, room: `${["A", "B", "C"][j]}201`, area: 96, seats: 48, type: "教学实验室", builtAt: "2023-08-20", features: j === 1 ? "通风设施、洗眼器、灭火器" : "电源保护、灭火器", managerId: `${s.id}-T4`, state: "可预约" }));
      [1, 2].forEach(n => db.classes.push({ id: `${s.id}-C${n}`, school: s.id, name: `高一${n}班`, grade: "高一", students: 40 + n, teacherIds: [1, 2, 3].map(j => `${s.id}-T${j}`) }));
      const items = [["光学显微镜", "XSP-16A", "生物仪器", 3580, 3], ["精密电子天平", "FA2204N", "化学仪器", 2860, 2], ["学生电源", "J1202", "物理仪器", 450, 1], ["力学轨道小车", "J2101", "物理仪器", 680, 1], ["解剖显微镜", "XTZ-E", "生物仪器", 4200, 3], ["蒸馏装置", "SZ-08", "化学仪器", 680, 2]];
      items.forEach(([name, model, category, price, lab], j) => db.assets.push({ id: `${s.id}-A${j + 1}`, code: `${s.code}-2024-${String(j + 1).padStart(3, "0")}`, school: s.id, name, model, category, unit: "台", price, purchaseDate: j === 5 ? "2015-06-15" : "2024-03-15", labId: `${s.id}-L${lab}`, location: ["A201", "B201", "C201"][lab - 1], supplier: "华东教学仪器有限公司", state: "正常使用", sourceId: `${s.id}-RK0`, nextMaintenance: "2026-09-15" }));
      db.receipts.push({ id: `${s.id}-RK0`, school: s.id, date: "2024-03-15", supplier: "华东教学仪器有限公司", operator: names[i][0], items: items.map(([name, model, category, price]) => ({ name, model, category, price, qty: 1, unit: "台" })), state: "已入库", note: "历史资产入账；单件购置日期见资产档案。" });
      [["载玻片", "7101型", "盒", 40, 20, false, 3], ["定性滤纸", "中速9cm", "盒", 8, 15, false, 2], ["无水乙醇", "分析纯500mL", "瓶", 12, 5, true, 2], ["浓硫酸", "500mL", "瓶", 2, 4, true, 2]].forEach(([name, spec, unit, stock, min, hazard, lab], j) => db.inventory.push({ id: `${s.id}-I${j + 1}`, school: s.id, name, spec, unit, stock, opening: stock, min, hazard, expiry: "2027-06-30", labId: `${s.id}-L${lab}`, location: ["A201", "B201", "C201"][lab - 1] }));
      ["E1", "E2", "E3", "E4", "E5"].forEach((catalogId, j) => db.plans.push({ id: `${s.id}-P${j + 1}`, school: s.id, term: "TERM26", catalogId, classId: `${s.id}-C${j % 2 + 1}`, teacherId: `${s.id}-T${[1, 2, 3, 1, 3][j]}`, mode: j === 3 ? "演示" : "分组", date: [TODAY, "2026-09-01", "2026-09-02", "2026-09-07", "2026-09-08"][j], state: "待实施" }));
      db.bookings.push({ id: `${s.id}-YY1`, school: s.id, planId: `${s.id}-P1`, teacherId: `${s.id}-T1`, labId: `${s.id}-L1`, date: TODAY, start: "08:00", end: "08:45", groups: 8, resources: [{ ref: `${s.id}-A4`, qty: 1 }], state: i === 0 ? "已准备" : "待审批", technician: i === 0 ? names[i][4] : "", preparation: i === 0 ? "轨道小车、刻度尺和电源已检查。" : "" });
      db.tasks.push({ id: `${s.id}-JC1`, school: s.id, labId: `${s.id}-L2`, kind: "开学专项检查", due: "2026-09-02", state: "待检查", owner: names[i][4] });
    });
    db.assets.find(x => x.id === "S1-A3").state = "维修中";
    db.repairs.push({ id: "WX-20260824-001", school: "S1", assetId: "S1-A3", kind: "维修", state: "处理中", reason: "输出电压不稳定", reporter: "张明华", date: "2026-08-24", due: TODAY, priorState: "正常使用", vendor: "华东校园设备服务有限公司", cost: 0 });
    db.purchases.push({ id: "CG-20260831-001", school: "S1", purpose: "补充高一生物分组实验器材", applicant: "顾文清", date: TODAY, state: "待审核", items: [{ name: "光学显微镜", model: "XSP-16A", category: "生物仪器", unit: "台", qty: 2, price: 3580 }] });
    db.checks.push({ id: "JC-20260831-001", school: "S1", labId: "S1-L2", date: TODAY, kind: "日常巡查", inspector: "陈小红", items: "消防设施、用电安全、化学品储存、应急设施", result: "发现隐患", note: "化学准备室房间门锁损坏。" });
    db.hazards.push({ id: "YH-20260831-001", school: "S1", checkId: "JC-20260831-001", labId: "S1-L2", title: "化学准备室房间门锁损坏", level: "需优先处理", date: TODAY, due: "2026-09-02", owner: "顾文清", state: "待整改", note: "暂停售用该房间，转移物品后处理门锁。" });
    db.flows.push({ id: "LY-20260831-001", school: "S1", itemId: "S1-I3", kind: "领用", qty: 1, date: TODAY, applicant: "陈小红", state: "待复核", planId: "S1-P2", reason: "下周实验准备", reviewer: "" });
    db.archives.push({ id: "FILE-001", school: "S1", name: "开学实验室安全检查说明.txt", category: "安全管理", relatedTable: "checks", relatedId: "JC-20260831-001", date: TODAY, uploader: "陈小红", state: "已归档", mime: "text/plain;charset=utf-8", content: "安全检查附件\n检查日期：2026-08-31\n检查位置：化学实验室1\n发现问题：房间门锁损坏。\n临时措施：停用并转移物品。\n处理要求：完成门锁更换后申请复查。" });
    db.archives.push({ id: "FILE-002", school: "S1", name: "物理实验准备清单.csv", category: "实验教学", relatedTable: "bookings", relatedId: "S1-YY1", date: TODAY, uploader: "陈小红", state: "待归档", mime: "text/csv;charset=utf-8", content: "器材,数量,单位\n力学轨道小车,1,台\n刻度尺,8,把\n" });
    db.labs.forEach(lab => { lab.openStart = "07:00"; lab.openEnd = "18:00"; });
    Object.entries(tableNames).filter(([t]) => t !== "logs").forEach(([t, name]) => db[t].forEach(r => db.logs.push({ id: `INIT-${t}-${r.id}`, school: r.school || (t === "schools" ? r.id : ""), table: t, recordId: r.id, action: "初始化数据", actor: "系统管理员", at: db.updatedAt, note: `${name}数据导入` })));
    return db;
  }
  function scoped(db, table, school = "") { return db[table].filter(r => !school || r.school === school || (table === "schools" && r.id === school)); }
  function teaching(db, school = "", term = "TERM26", by = "school", filters = {}) {
    const buckets = new Map();
    scoped(db, "plans", school).filter(p => p.term === term).forEach(p => {
      const e = find(db, "catalog", p.catalogId), c = find(db, "classes", p.classId);
      if ((filters.subject && e.subject !== filters.subject) || (filters.grade && c.grade !== filters.grade) || (filters.teacherId && p.teacherId !== filters.teacherId) || (filters.classId && p.classId !== filters.classId)) return;
      const label = by === "subject" ? e.subject : by === "grade" ? c.grade : by === "class" ? `${find(db, "schools", p.school).name} · ${c.name}` : find(db, "schools", p.school).name;
      const b = buckets.get(label) || { id: label, name: label, school: by === "school" ? p.school : "", required: 0, done: 0, optional: 0, optionalDone: 0, demonstration: 0, demonstrationDone: 0, group: 0, groupDone: 0, plans: [] };
      b.plans.push(p.id); if (e.required === "必做") { b.required++; if (p.state === "已完成") b.done++; } else { b.optional++; if (p.state === "已完成") b.optionalDone++; }
      const mode = p.mode === "演示" ? "demonstration" : "group"; b[mode]++; if (p.state === "已完成") b[`${mode}Done`]++; buckets.set(label, b);
    });
    return [...buckets.values()].map(b => ({ ...b, teacherNames: [...new Set(b.plans.map(id => find(db, "staff", find(db, "plans", id).teacherId).name))].join("、"), gradeNames: [...new Set(b.plans.map(id => find(db, "classes", find(db, "plans", id).classId).grade))].join("、"), pending: b.required - b.done, rate: ratio(b.done, b.required), demonstrationRate: ratio(b.demonstrationDone, b.demonstration), groupRate: ratio(b.groupDone, b.group), total: b.required + b.optional, totalDone: b.done + b.optionalDone, totalRate: ratio(b.done + b.optionalDone, b.required + b.optional) }));
  }
  function metrics(db, school = "", term = "TERM26") {
    const assets = scoped(db, "assets", school), stock = scoped(db, "inventory", school), plans = scoped(db, "plans", school).filter(p => p.term === term && find(db, "catalog", p.catalogId).required === "必做"), hazards = scoped(db, "hazards", school), done = plans.filter(p => p.state === "已完成").length;
    return { assets: assets.length, normal: assets.filter(a => a.state === "正常使用").length, repair: assets.filter(a => a.state === "维修中").length, value: assets.filter(a => a.state !== "已报废").reduce((s, a) => s + a.price, 0), labs: scoped(db, "labs", school).length, required: plans.length, done, pending: plans.length - done, rate: ratio(done, plans.length), low: stock.filter(r => r.stock < r.min).length, chemicals: stock.filter(r => r.hazard).length, hazards: hazards.length, closed: hazards.filter(r => r.state === "已关闭").length, closure: ratio(hazards.filter(r => r.state === "已关闭").length, hazards.length), staff: scoped(db, "staff", school).filter(r => r.enabled).length, technicians: scoped(db, "staff", school).filter(r => r.enabled && r.role === "technician").length };
  }
  function actorFor(db, role, school = "S1", personId) {
    choice(role, Object.keys(roles), "身份"); if (role === "district") return { role, name: "周岚", school: "", id: "DISTRICT" };
    find(db, "schools", school); const s = db.staff.find(s => s.school === school && s.role === role && s.enabled && (!personId || s.id === personId)); must(s, "该校暂无可用的对应角色账号，请先维护人员。"); return { role, school, name: s.name, id: s.id };
  }
  function transact(original, actor, command, input = {}, now = new Date().toISOString()) {
    if (["booking.batch", "repair.batch"].includes(command)) {
      must(Array.isArray(input.rows) && input.rows.length > 0 && input.rows.length <= 30, "请填写1至30条安排或设备明细。");
      let next = original; const ids = [], table = command === "booking.batch" ? "bookings" : "repairs";
      // Each row uses the existing validators. Only the final snapshot is committed, so a failed row rolls back the whole batch.
      input.rows.forEach(row => { const out = transact(next, actor, command.replace("batch", "create"), row, now); next = out.db; ids.push(out.result.id); });
      ids.forEach(key => { find(next, table, key).batchId = ids[0]; });
      return { db: next, result: { ...find(next, table, ids[0]), ids } };
    }
    // ponytail: small local snapshots; use server transactions when real multi-user concurrency is needed.
    const db = clone(original), p = clone(input); let result;
    must(actor && roles[actor.role], "请选择有效身份。");
    if (actor.role !== "district") { const s = find(db, "staff", actor.id); must(s.enabled && s.role === actor.role && s.school === actor.school, "账号身份已变更，请重新选择身份。"); }
    const id = prefix => `${prefix}-${TODAY.replaceAll("-", "")}-${++db.seq}`;
    const permit = allowed => must(allowed.includes(actor.role), `该操作需要${allowed.map(r => roles[r]).join("或")}身份。`);
    const get = (table, key = p.id) => { const r = find(db, table, key); must(actor.role === "district" || r.school === actor.school || (table === "schools" && r.id === actor.school), "不能操作其他学校的数据。"); return r; };
    const state = (r, allowed) => must(allowed.includes(r.state), `当前状态“${r.state}”不能执行此操作。`);
    function log(table, r, action, note = "") { db.logs.push({ id: id("LOG"), school: r.school || "", table, recordId: r.id, action, note, actor: actor.name, at: now }); result = r; }
    function add(table, r, action) { db[table].unshift(r); log(table, r, action); return r; }
    function lines(raw) { must(Array.isArray(raw) && raw.length > 0 && raw.length <= 30, "请填写1至30条物品明细。"); return raw.map(r => ({ classificationCode: optional(r.classificationCode, "分类编号", 60), name: text(r.name, "物品名称"), model: text(r.model, "规格型号"), category: choice(r.category, categories, "分类"), unit: text(r.unit, "单位"), qty: num(r.qty, "数量", 1, true), price: num(r.price, "单价") })); }
    function roomOf(labId) { return find(db, "labs", labId).room; }
    function itemSnapshot(i) { return { classificationCode: i.classificationCode || "", name: i.name, spec: i.spec || i.model, unit: i.unit, unitPrice: i.unitPrice ?? i.price ?? null, labId: i.labId, location: i.location || roomOf(i.labId) }; }
    function stockPost(flow) { const item = find(db, "inventory", flow.itemId), delta = (["入库", "退回"].includes(flow.kind) ? 1 : -1) * flow.qty; must(item.stock + delta >= 0, `“${item.name}”库存不足，当前${item.stock}${item.unit}。`); item.stock += delta; flow.state = "已记账"; log("inventory", item, flow.kind, `${flow.id}：${delta}${item.unit}`); }
    function resources(raw, school) { must(Array.isArray(raw) && raw.length <= 30, "器材明细格式不正确。"); must(new Set(raw.map(r => r.ref)).size === raw.length, "同一器材请合并数量。"); return raw.map(r => { const item = db.assets.find(a => a.id === r.ref) || db.inventory.find(i => i.id === r.ref); must(item && item.school === school, "请选择本校器材。"); const qty = num(r.qty, "器材数量", 1, true); must(item.stock !== undefined ? qty <= item.stock : qty === 1 && item.state === "正常使用", `“${item.name}”数量不足或不可用。`); return { ref: item.id, qty }; }); }
    function bookingCheck(b, exclude) {
      const plan = find(db, "plans", b.planId), lab = find(db, "labs", b.labId), term = find(db, "terms", plan.term), c = find(db, "classes", plan.classId);
      must(lab.school === b.school && lab.state === "可预约", "实验室不属于本校或正在维护。"); must(lab.subject === find(db, "catalog", plan.catalogId).subject, "实验学科与实验室不匹配。"); must(c.students <= lab.seats, `实验室容量不足：${c.students}人 / ${lab.seats}座。`);
      must(b.date >= term.start && b.date <= term.end, "预约日期须在计划学期内。"); must(/^([01]\d|2[0-3]):[0-5]\d$/.test(b.start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(b.end) && b.start < b.end, "时间段无效，结束时间须晚于开始时间。"); must(b.groups <= c.students, "分组数不能超过班级人数。");
      must(b.start >= (lab.openStart || "07:00") && b.end <= (lab.openEnd || "18:00"), "预约时间超出实验室开放时段。");
      if (b.managerId) { const manager = find(db, "staff", b.managerId); must(manager.school === b.school && manager.enabled && ["admin", "technician"].includes(manager.role), "请选择本校启用的实验管理员或实验员。"); }
      const others = db.bookings.filter(r => r.id !== exclude && activeBooking(r)); must(!others.some(r => r.planId === b.planId), "该计划已有有效预约，请先取消原预约。");
      const concurrent = others.filter(r => r.date === b.date && r.start < b.end && b.start < r.end), conflict = concurrent.find(r => r.labId === b.labId || r.teacherId === b.teacherId || find(db, "plans", r.planId).classId === plan.classId);
      must(!conflict, `预约冲突：${conflict?.id || ""}已占用实验室、教师或班级，请调整时间。`);
      b.resources.forEach(x => { const item = db.assets.find(a => a.id === x.ref) || find(db, "inventory", x.ref), reserved = concurrent.reduce((n, b) => n + b.resources.filter(r => r.ref === x.ref).reduce((s, r) => s + r.qty, 0), 0); must(reserved + x.qty <= (item.stock ?? 1), `“${item.name}”同时段可用数量不足。`); });
    }
    if (command === "purchase.create") { permit(["admin", "technician"]); add("purchases", { id: id("CG"), school: actor.school, purpose: text(p.purpose, "采购用途"), items: lines(p.items), applicant: actor.name, date: date(p.date || TODAY), state: "待审核" }, "提交采购申请"); }
    else if (command === "purchase.decide") { permit(["district"]); const r = get("purchases"); state(r, ["待审核"]); r.decision = text(p.reason, "审批意见"); r.state = p.approve === true ? "已通过" : "已驳回"; log("purchases", r, r.state, r.decision); }
    else if (command === "purchase.cancel") { permit(["admin", "technician"]); const r = get("purchases"); state(r, ["待审核"]); r.cancelReason = text(p.reason, "撤销原因"); r.state = "已撤销"; log("purchases", r, "撤销申请", r.cancelReason); }
    else if (command === "receipt.create") {
      permit(["admin", "technician"]); const school = actor.school, order = p.purchaseId ? get("purchases", p.purchaseId) : null; if (order) state(order, ["已通过"]);
      const items = lines(order ? order.items : p.items); must(items.reduce((n, r) => n + r.qty, 0) <= 100, "单次入库最多100件。");
      if (order && p.placements) must(Array.isArray(p.placements) && p.placements.length === items.length, "存放位置须与采购明细逐行对应。");
      items.forEach((item, index) => { const place = (order ? p.placements?.[index] : p.items[index]) || {}; const lab = get("labs", place.labId || p.labId); Object.assign(item, { classificationCode: item.classificationCode || optional(place.classificationCode, "分类编号", 60), labId: lab.id, location: lab.room }); });
      const r = { id: id("RK"), school, purchaseId: order?.id || "", items, date: date(p.date), purchaseDate: date(p.purchaseDate || p.date), supplier: text(p.supplier, "供应商"), operator: actor.name, note: optional(p.note, "备注", 500), state: "已入库" }; must(r.purchaseDate <= r.date, "购置日期不能晚于登记日期。");
      for (const item of items) {
        if (["耗材", "危化品"].includes(item.category)) {
          let stock = db.inventory.find(i => i.school === school && i.name === item.name && i.spec === item.model && i.unit === item.unit && (i.classificationCode || "") === item.classificationCode && i.labId === item.labId && i.hazard === (item.category === "危化品"));
          if (!stock) stock = add("inventory", { id: id("HC"), school, classificationCode: item.classificationCode, name: item.name, spec: item.model, unit: item.unit, unitPrice: item.price, stock: 0, opening: 0, min: 0, hazard: item.category === "危化品", expiry: "", labId: item.labId, location: item.location }, "建立耗材档案");
          const flow = { id: id("KC"), school, itemId: stock.id, snapshot: { ...itemSnapshot(stock), unitPrice: item.price }, kind: "入库", qty: item.qty, date: r.date, applicant: actor.name, applicantId: actor.id, reviewer: "", reason: `入库单${r.id}`, state: stock.hazard ? "待复核" : "已记账", receiptId: r.id }; if (!stock.hazard) stockPost(flow); add("flows", flow, stock.hazard ? "入库待双人复核" : "入库记账");
        } else for (let n = 0; n < item.qty; n++) { const key = id("ZC"); add("assets", { id: key, code: `${find(db, "schools", school).code}-${key}`, school, classificationCode: item.classificationCode, name: item.name, model: item.model, category: item.category, unit: item.unit, price: item.price, purchaseDate: r.purchaseDate, labId: item.labId, location: item.location, supplier: r.supplier, state: "正常使用", sourceId: r.id, nextMaintenance: p.nextMaintenance ? date(p.nextMaintenance) : "2026-12-01" }, "入库建档"); }
      }
      if (order) { order.state = "已入库"; order.receiptId = r.id; log("purchases", order, "全部到货入库", r.id); } add("receipts", r, "确认入库");
    } else if (command === "asset.edit") {
      permit(["admin", "technician"]); const a = get("assets"); a.name = text(p.name, "设备名称"); a.model = text(p.model, "型号"); a.classificationCode = optional(p.classificationCode ?? a.classificationCode, "分类编号", 60); a.nextMaintenance = date(p.nextMaintenance); log("assets", a, "更新资产档案");
    } else if (command === "asset.transfer") {
      permit(["admin", "technician"]); const a = get("assets"), lab = get("labs", p.labId); state(a, ["正常使用"]); must(!db.bookings.some(b => activeBooking(b) && b.resources.some(x => x.ref === a.id)), "该设备有有效预约，请先处理预约。");
      const r = { id: id("DB"), school: a.school, assetId: a.id, from: a.labId, to: lab.id, date: date(p.date), reason: text(p.reason, "调拨原因"), operator: actor.name, state: "已调拨" }; a.labId = lab.id; a.location = lab.room; log("assets", a, "校内调拨", r.id); add("moves", r, "完成调拨");
    } else if (command === "asset.lend") {
      permit(["admin", "technician"]); const a = get("assets"); state(a, ["正常使用"]); must(!db.bookings.some(b => activeBooking(b) && b.resources.some(x => x.ref === a.id)), "该设备有有效实验预约。"); const start = date(p.date), due = date(p.due); must(due >= start, "归还期限不能早于借出日期。");
      a.state = "借出"; const r = { id: id("JH"), school: a.school, assetId: a.id, borrower: text(p.borrower, "借用人"), date: start, due, reason: text(p.reason, "用途"), state: "借出", operator: actor.name }; log("assets", a, "设备借出", r.id); add("loans", r, "登记借用");
    } else if (command === "loan.return") {
      permit(["admin", "technician"]); const r = get("loans"); state(r, ["借出"]); r.returnDate = date(p.date || TODAY); must(r.returnDate >= r.date, "归还日期不能早于借出日期。"); r.state = "已归还"; const a = get("assets", r.assetId); a.state = "正常使用"; log("assets", a, "设备归还", r.id); log("loans", r, "确认归还");
    } else if (command === "asset.count") {
      permit(["admin", "technician"]); const a = get("assets"); state(a, ["正常使用", "维修中", "待报废"]); const actual = num(p.actual, "实盘数量", 0, true); must(actual <= 1, "单件资产实盘数量只能为0或1。"); must(!db.counts.some(c => c.assetId === a.id && c.state === "待处理差异"), "已有未处理盘点差异。");
      add("counts", { id: id("PD"), school: a.school, assetId: a.id, expected: 1, actual, difference: actual - 1, date: date(p.date), reason: text(p.reason, "盘点说明"), operator: actor.name, state: actual === 1 ? "账实相符" : "待处理差异" }, "登记盘点");
    } else if (command === "count.resolve") {
      permit(["admin"]); const r = get("counts"); state(r, ["待处理差异"]); r.resolution = text(p.reason, "差异处理依据"); r.state = "已复核"; log("counts", r, "复核差异", r.resolution);
    } else if (command === "repair.create") {
      permit(["admin", "teacher", "technician"]); const a = get("assets", p.assetId); state(a, ["正常使用"]); must(!db.repairs.some(r => r.assetId === a.id && ["待审核", "处理中", "待验收"].includes(r.state)), "该设备已有在途处理单。");
      const kind = choice(p.kind, ["维修", "报废", "维保"], "处理类型"), r = { id: id(kind === "报废" ? "BF" : "WX"), school: a.school, assetId: a.id, kind, reason: text(p.reason, "故障或申请原因"), date: date(p.date || TODAY), due: date(p.due), reporter: actor.name, state: "待审核", priorState: a.state, cost: 0 }; must(r.due >= r.date, "处理期限不能早于提交日期。");
      r.qty = 1; r.snapshot = { ...itemSnapshot(a), code: a.code, purchaseDate: a.purchaseDate }; if (kind !== "报废") r.reason = optional(r.reason, "维修内容", 100);
      a.state = kind === "报废" ? "待报废" : "维修中"; log("assets", a, `提交${kind}`, r.id); add("repairs", r, `提交${kind}申请`);
    } else if (["repair.decide", "repair.finish", "repair.accept", "repair.cancel"].includes(command)) {
      const r = get("repairs"), a = get("assets", r.assetId);
      if (command === "repair.decide") { permit(["district"]); state(r, ["待审核"]); r.decision = text(p.reason, "审批意见"); if (p.approve === true) { r.state = r.kind === "报废" ? "已完成" : "处理中"; a.state = r.kind === "报废" ? "已报废" : "维修中"; } else { r.state = "已驳回"; a.state = r.priorState; } }
      if (command === "repair.finish") { permit(["admin", "technician"]); state(r, ["处理中"]); r.vendor = optional(p.vendor, "维修商"); r.cost = num(p.cost, "维修金额"); r.maintenanceDate = date(p.maintenanceDate || TODAY); must(r.maintenanceDate >= r.date, "维修日期不能早于申请日期。"); r.qty = 1; r.result = optional(text(p.reason, "维修内容"), "维修内容", 100); r.state = "待验收"; }
      if (command === "repair.accept") { permit(["admin"]); state(r, ["待验收"]); r.acceptance = text(p.reason, "验收意见"); r.state = "已完成"; a.state = "正常使用"; if (p.nextMaintenance) a.nextMaintenance = date(p.nextMaintenance); }
      if (command === "repair.cancel") { permit(["admin", "teacher", "technician"]); state(r, ["待审核"]); must(actor.role === "admin" || r.reporter === actor.name, "只能撤销本人申请。"); r.state = "已撤销"; a.state = r.priorState; }
      log("assets", a, `${r.kind}状态更新`, r.id); log("repairs", r, r.state, p.reason || "");
    } else if (command === "inventory.save") {
      permit(["admin", "technician"]); const r = p.id ? get("inventory") : { id: id("HC"), school: actor.school, stock: 0, opening: 0 };
      const lab = get("labs", p.labId); Object.assign(r, { name: text(p.name, "物品名称"), spec: text(p.spec, "规格"), unit: text(p.unit, "单位"), min: num(p.min, "补库阈值"), hazard: p.hazard === true, expiry: p.expiry ? date(p.expiry) : "", labId: lab.id, location: lab.room });
      r.classificationCode = optional(p.classificationCode ?? r.classificationCode, "分类编号", 60); r.unitPrice = p.unitPrice === "" ? null : p.unitPrice == null ? r.unitPrice ?? null : num(p.unitPrice, "登记单价");
      must(!db.inventory.some(i => i.id !== r.id && i.school === r.school && i.name === r.name && i.spec === r.spec && i.unit === r.unit && i.labId === r.labId && i.hazard === r.hazard && (i.classificationCode || "") === r.classificationCode), "该存放位置同名同规格耗材已存在。"); p.id ? log("inventory", r, "维护库存档案") : add("inventory", r, "新增库存档案");
    } else if (command === "flow.create") {
      permit(["admin", "technician", "teacher"]); const i = get("inventory", p.itemId), kind = choice(p.kind, ["入库", "领用", "损耗", "退回", "处置"], "业务类型"); if (actor.role === "teacher") must(kind === "领用", "教师只能提交领用申请。");
      if (p.planId) { const plan = get("plans", p.planId); must(actor.role !== "teacher" || plan.teacherId === actor.id, "只能关联本人计划。"); }
      const qty = num(p.qty, "数量", 1, true); must(["入库", "退回"].includes(kind) || i.stock >= qty, `库存不足：当前${i.stock}${i.unit}。`);
      const r = { id: id("KC"), school: i.school, itemId: i.id, snapshot: itemSnapshot(i), kind, qty, date: date(p.date), reason: text(p.reason, "用途或原因"), applicant: actor.name, applicantId: actor.id, planId: p.planId || "", state: i.hazard || actor.role === "teacher" ? "待复核" : "已记账", reviewer: "" }; if (r.state === "已记账") stockPost(r); add("flows", r, r.state === "待复核" ? "提交库存业务复核" : `${kind}记账`);
    } else if (command === "flow.decide") {
      permit(["admin", "technician"]); const r = get("flows"); state(r, ["待复核"]); must(r.applicant !== actor.name && r.applicantId !== actor.id, "不能复核本人记录，请由另一名责任人确认。"); r.reviewNote = text(p.reason, "复核意见"); r.reviewer = actor.name; if (p.approve === true) stockPost(r); else r.state = "已驳回"; log("flows", r, r.state, r.reviewNote);
    }
    else if (command === "plan.create") {
      permit(["admin", "teacher"]); const c = get("classes", p.classId), e = find(db, "catalog", p.catalogId), t = find(db, "terms", p.term), teacher = get("staff", actor.role === "teacher" ? actor.id : p.teacherId);
      must(teacher.enabled && teacher.role === "teacher" && c.teacherIds.includes(teacher.id) && teacher.subject === e.subject, "任课教师、班级或实验学科不匹配。"); must(c.grade === e.grade, "班级与实验目录年级不一致。"); const d = date(p.date); must(d >= t.start && d <= t.end, "计划日期须在学期内。"); must(!db.plans.some(r => r.classId === c.id && r.catalogId === e.id && r.term === t.id), "该班本学期已编制此实验计划，不可重复统计。");
      const week = weekOf(t, d); if (p.week != null) must(num(p.week, "周次", 1, true) === week, "周次与计划日期不一致。");
      add("plans", { id: id("JH"), school: c.school, name: text(p.name || `${t.name} · ${e.subject}实验计划`, "计划名称"), week, classId: c.id, catalogId: e.id, teacherId: teacher.id, term: t.id, mode: choice(p.mode, ["演示", "分组"], "实施方式"), date: d, state: "待实施" }, "编制班级计划");
    } else if (command === "booking.create") {
      permit(["admin", "teacher"]); const plan = get("plans", p.planId); must(plan.state !== "已完成", "计划已完成，不可重复预约。"); must(actor.role !== "teacher" || plan.teacherId === actor.id, "只能预约本人任课计划。");
      const lab = get("labs", p.labId), managerId = p.managerId || lab.managerId;
      const r = { id: id("YY"), school: plan.school, planId: plan.id, teacherId: plan.teacherId, labId: lab.id, managerId, applicant: actor.name, applicantId: actor.id, bookedAt: now, period: p.period ? num(p.period, "节次", 1, true) : null, date: date(p.date), start: text(p.start), end: text(p.end), groups: num(p.groups, "分组数", 1, true), resources: resources(p.resources || [], plan.school), state: "待审批", note: optional(p.note, "备注", 100) }; if (r.period) must(r.period <= 20, "节次不能超过20。"); bookingCheck(r); add("bookings", r, "提交实验预约");
    } else if (["booking.decide", "booking.prepare", "booking.complete", "booking.cancel"].includes(command)) {
      const r = get("bookings"), plan = get("plans", r.planId);
      if (command === "booking.decide") { permit(["admin"]); state(r, ["待审批"]); r.decision = text(p.reason, "审批意见"); if (p.approve === true) { r.resources = resources(r.resources, r.school); bookingCheck(r, r.id); r.state = "已通过"; } else r.state = "已拒绝"; }
      if (command === "booking.prepare") { permit(["admin", "technician"]); state(r, ["已通过"]); r.resources = resources(r.resources, r.school); bookingCheck(r, r.id); r.preparation = text(p.reason, "准备检查记录"); r.technician = actor.name; r.state = "已准备"; }
      if (command === "booking.complete") { permit(["admin", "teacher"]); state(r, ["已准备"]); must(actor.role !== "teacher" || r.teacherId === actor.id, "只能登记本人实验。"); must(plan.state !== "已完成", "该计划已计入统计。"); r.resources.forEach(x => { const asset = db.assets.find(a => a.id === x.ref); must(!asset || asset.state === "正常使用", "预约设备当前不可用，请先处理故障或调整预约。"); }); r.attendees = num(p.attendees, "实际参加人数", 1, true); must(r.attendees <= find(db, "classes", plan.classId).students, "参加人数超过班级人数。"); r.actualDate = date(p.date); must(r.actualDate >= r.date && r.actualDate <= find(db, "terms", plan.term).end, "完成日期不能早于预约日期或超出学期。"); r.summary = text(p.reason, "实施总结"); r.state = "已完成"; plan.state = "已完成"; plan.completedAt = r.actualDate; plan.bookingId = r.id; log("plans", plan, "完成登记计入统计", r.id); }
      if (command === "booking.cancel") { permit(["admin", "teacher"]); state(r, ["待审批", "已通过", "已准备"]); must(actor.role !== "teacher" || r.teacherId === actor.id, "只能取消本人预约。"); r.cancelReason = text(p.reason, "取消原因"); r.state = "已取消"; }
      log("bookings", r, r.state, p.reason || "");
    } else if (command === "task.create") {
      permit(["district"]); const lab = find(db, "labs", p.labId); add("tasks", { id: id("JCJH"), school: lab.school, labId: lab.id, kind: text(p.kind, "检查类型"), due: date(p.due), owner: text(p.owner, "责任人"), state: "待检查" }, "下发检查任务");
    } else if (command === "check.create") {
      permit(["admin", "technician"]); const task = p.taskId ? get("tasks", p.taskId) : null; if (task) state(task, ["待检查"]); const lab = get("labs", task?.labId || p.labId), outcome = choice(p.result, ["正常", "发现隐患"], "检查结果");
      const r = { id: id("JC"), school: lab.school, labId: lab.id, taskId: task?.id || "", kind: task?.kind || text(p.kind, "类型"), date: date(p.date), inspector: actor.name, items: text(p.items, "检查项目"), result: outcome, note: text(p.note, "检查说明") }; add("checks", r, "提交检查记录");
      if (task) { task.state = outcome === "正常" ? "已完成" : "待整改"; task.checkId = r.id; log("tasks", task, task.state, r.id); }
      if (outcome === "发现隐患") { const due = date(p.due); must(due >= r.date, "整改期限不能早于检查日期。"); add("hazards", { id: id("YH"), school: lab.school, checkId: r.id, labId: lab.id, title: text(p.title, "隐患描述"), owner: text(p.owner, "责任人"), level: choice(p.level, ["一般关注", "需优先处理"], "优先级"), due, date: r.date, state: "待整改", note: r.note }, "检查发现隐患"); }
    } else if (command === "hazard.submit") {
      permit(["admin", "technician"]); const r = get("hazards"); state(r, ["待整改", "整改中"]); r.rectification = text(p.reason, "整改说明"); const file = get("archives", p.attachmentId); must(file.relatedTable === "hazards" && file.relatedId === r.id, "请选择关联当前隐患的整改附件，可先上传附件。"); r.attachmentId = file.id; r.state = "待复查"; log("hazards", r, "提交整改复查", r.rectification);
    } else if (command === "hazard.verify") {
      permit(["district"]); const r = get("hazards"); state(r, ["待复查"]); r.review = text(p.reason, "复查意见"); r.reviewer = actor.name; r.state = p.approve === true ? "已关闭" : "整改中";
      if (r.state === "已关闭") { const check = find(db, "checks", r.checkId); if (check.taskId && !db.hazards.some(h => h.checkId === check.id && h.id !== r.id && h.state !== "已关闭")) { const task = find(db, "tasks", check.taskId); task.state = "已完成"; log("tasks", task, "整改复查完成"); } } log("hazards", r, r.state, r.review);
    } else if (command === "archive.create") {
      permit(["admin", "teacher", "technician"]); const table = choice(p.relatedTable, ["assets", "purchases", "repairs", "plans", "bookings", "checks", "hazards", "staff", "receipts"], "关联业务"), linked = get(table, p.relatedId);
      if (actor.role === "teacher") must((table === "staff" && linked.id === actor.id) || linked.teacherId === actor.id || linked.reporter === actor.name, "教师只能上传本人业务资料。");
      const name = text(p.name, "文件名"); must(!/\.(html?|svg|js|exe|sh)$/i.test(name), "不接受可执行文件、HTML或SVG附件。"); const content = String(p.content || ""), dataUrl = String(p.dataUrl || ""); must(content || /^data:[\w.+/-]+;base64,[A-Za-z0-9+/=]+$/.test(dataUrl), "请上传文件或填写文本内容。"); must(content.length + dataUrl.length <= 750000, "单个附件限512KB左右。");
      add("archives", { id: id("FILE"), school: actor.school, name, category: choice(p.category, ["实验教学", "安全管理", "师资培训", "设备建设"], "资料分类"), relatedTable: table, relatedId: linked.id, date: TODAY, uploader: actor.name, state: p.archive === true ? "已归档" : "待归档", mime: String(p.mime || "text/plain;charset=utf-8"), content, dataUrl }, "上传业务资料");
    } else if (command === "archive.confirm") { permit(["admin", "technician"]); const r = get("archives"); state(r, ["待归档"]); r.state = "已归档"; log("archives", r, "确认归档"); }
    else if (command === "base.save") {
      const table = choice(p.table, ["schools", "staff", "labs", "classes", "terms", "catalog"], "基础数据"); permit(["district", "admin"]); if (["schools", "terms", "catalog"].includes(table)) permit(["district"]);
      const r = p.id ? get(table) : { id: id(table.toUpperCase()) }, school = ["staff", "labs", "classes"].includes(table) ? (r.school || (actor.role === "district" ? text(p.school, "学校") : actor.school)) : "";
      if (school) { find(db, "schools", school); r.school = school; } r.name = text(p.name, "名称"); const related = (t, key) => { const x = find(db, t, key); must(x.school === school, "关联档案须属于同一学校。"); return x; };
      if (table === "schools") { r.code = text(p.code, "学校代码"); must(!db.schools.some(s => s.id !== r.id && s.code === r.code), "学校代码已存在。"); r.stage = text(p.stage, "学段"); r.street = text(p.street, "街镇"); }
      if (table === "terms") { r.start = date(p.start); r.end = date(p.end); must(r.end > r.start, "学期结束须晚于开始日期。"); must(!db.plans.some(plan => plan.term === r.id && (plan.date < r.start || plan.date > r.end)), "学期范围未包含已有计划。"); }
      if (table === "staff") { r.role = choice(p.role, ["admin", "teacher", "technician"], "角色"); r.subject = text(p.subject, "学科"); r.title = text(p.title, "岗位职称"); r.phone = String(p.phone || ""); r.qualification = text(p.qualification, "资质说明"); r.enabled = p.enabled !== false; r.trainings ||= []; must(r.id !== actor.id || (r.enabled && r.role === actor.role), "不能停用或变更当前操作账号身份。"); must(!db.plans.some(plan => plan.teacherId === r.id && plan.state !== "已完成" && (!r.enabled || r.role !== "teacher" || find(db, "catalog", plan.catalogId).subject !== r.subject)), "该教师仍有未完成计划，不能停用或变更学科/角色。"); }
      if (table === "staff") { r.sex = choice(p.sex ?? r.sex ?? "", ["", "男", "女"], "性别"); r.department = optional(p.department ?? r.department, "部门"); }
      if (table === "labs") { Object.assign(r, { subject: text(p.subject, "学科"), room: text(p.room, "房间号"), area: num(p.area, "实际使用面积", 1), seats: num(p.seats, "座位数", 1, true), type: text(p.type, "类型"), builtAt: p.builtAt ? date(p.builtAt) : "", features: optional(p.features, "设施功能", 500), managerId: related("staff", p.managerId).id, state: choice(p.state, ["可预约", "维护中"], "状态") }); must(!db.bookings.some(b => b.labId === r.id && activeBooking(b) && (r.state !== "可预约" || find(db, "classes", find(db, "plans", b.planId).classId).students > r.seats || find(db, "catalog", find(db, "plans", b.planId).catalogId).subject !== r.subject)), "该变更与有效预约冲突，请先处理预约。"); }
      if (table === "labs") { r.builder = optional(p.builder ?? r.builder, "建造商"); r.note = optional(p.note ?? r.note, "备注", 60); r.stage = optional(p.stage ?? r.stage ?? find(db, "schools", school).stage, "所属学段", 60); }
      if (table === "classes") { r.grade = text(p.grade, "年级"); r.students = num(p.students, "班级人数", 1, true); must(Array.isArray(p.teacherIds) && p.teacherIds.length, "请选择任课教师。"); r.teacherIds = [...new Set(p.teacherIds)].map(key => { const t = related("staff", key); must(t.enabled && t.role === "teacher", "请选择有效任课教师。"); return key; }); must(!db.plans.some(plan => plan.classId === r.id && plan.state !== "已完成" && (!r.teacherIds.includes(plan.teacherId) || find(db, "catalog", plan.catalogId).grade !== r.grade)), "班级变更与未完成计划冲突。"); }
      if (table === "catalog") { Object.assign(r, { code: text(p.code, "实验编号"), subject: text(p.subject, "学科"), grade: text(p.grade, "年级"), required: choice(p.required, ["必做", "选做"], "属性"), mode: choice(p.mode, ["演示", "分组"], "方式"), version: text(p.version, "教材版本"), chapter: text(p.chapter, "章节"), equipment: text(p.equipment, "器材需求"), periods: num(p.periods, "课时", 1, true) }); must(!db.catalog.some(e => e.id !== r.id && e.code === r.code), "实验编号已存在。"); if (p.id) { const old = find(original, table, p.id); must(!db.plans.some(plan => plan.catalogId === r.id) || ["subject", "grade", "required"].every(k => old[k] === r[k]), "目录已被引用，变更学科/年级/属性请新增版本条目。"); } }
      if (table === "labs") { r.openStart = p.openStart || r.openStart || "07:00"; r.openEnd = p.openEnd || r.openEnd || "18:00"; must(/^([01]\d|2[0-3]):[0-5]\d$/.test(r.openStart) && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.openEnd) && r.openStart < r.openEnd, "实验室开放时间无效。"); must(!db.bookings.some(b => b.labId === r.id && activeBooking(b) && (b.start < r.openStart || b.end > r.openEnd)), "开放时段与有效预约冲突。"); }
      if (table === "classes") must(!db.bookings.some(b => find(db, "plans", b.planId).classId === r.id && activeBooking(b) && find(db, "labs", b.labId).seats < r.students), "新增班级人数超过已预约实验室容量。");
      p.id ? log(table, r, "更新基础档案") : add(table, r, "新增基础档案");
    } else if (command === "staff.training") { permit(["district", "admin"]); const r = get("staff"); r.trainings.push({ name: text(p.name, "培训名称"), date: date(p.date), hours: num(p.hours, "学时", 1), evidence: text(p.evidence, "证书或记录说明") }); log("staff", r, "登记培训记录", p.name); }
    else if (command === "settings.save") { permit(["district"]); db.settings = { region: text(p.region, "区域"), authority: text(p.authority, "主管单位"), repairDays: num(p.repairDays, "提醒天数", 1, true), lowStock: p.lowStock === true, weeklyReport: p.weeklyReport === true, syncReminder: p.syncReminder === true, exportEnabled: p.exportEnabled === true }; log("settings", { id: "SETTINGS", school: "" }, "保存平台设置"); }
    else if (command === "submission.create") { permit(["admin"]); find(db, "terms", p.term); add("submissions", { id: id("SB"), school: actor.school, term: p.term, date: TODAY, at: now, operator: actor.name, revision: original.revision, summary: metrics(db, actor.school, p.term), state: "已上报" }, "上报当前台账快照"); }
    else throw new Error("不支持的业务操作。");
    db.revision++; db.updatedAt = now; return { db, result };
  }
  function parseCSV(source) {
    const rows = []; let row = [], cell = "", quoted = false; const s = String(source).replace(/^\uFEFF/, "");
    for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '"') { if (quoted && s[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; } else if (c === "," && !quoted) { row.push(cell.trim()); cell = ""; } else if ((c === "\n" || c === "\r") && !quoted) { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; if (c === "\r" && s[i + 1] === "\n") i++; } else cell += c; }
    must(!quoted, "CSV引号未闭合。"); row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); return rows;
  }
  const importHeader = ["名称", "规格型号", "分类", "单位", "数量", "单价"];
  const extendedImportHeader = [...importHeader, "分类编号", "实验室编号", "存放位置（房间）"];
  function validateImport(source) { const rows = parseCSV(source), errors = []; must(rows.length > 1 && rows.length <= 31, "模板需包含表头和1至30行数据。"); const header = rows[0].length === 6 ? importHeader : extendedImportHeader; must(rows[0].length === header.length && header.every((h, i) => rows[0][i] === h), `模板表头应为：${extendedImportHeader.join("、")}；也兼容原六列表头。`); const items = rows.slice(1).map((row, index) => { const [name, model, category, unit, qty, price, classificationCode = "", labId = "", location = ""] = row; if (row.length !== header.length || !name || !model || !unit || !categories.includes(category) || !qty || !Number.isInteger(Number(qty)) || Number(qty) <= 0 || price === "" || !Number.isFinite(Number(price)) || Number(price) < 0 || classificationCode.length > 60) errors.push(`第${index + 2}行：检查列数、名称、型号、分类、单位、数量、单价及分类编号。`); return { name, model, category, unit, qty: Number(qty), price: Number(price), classificationCode, labId, location }; }); if (items.reduce((s, r) => s + r.qty, 0) > 100) errors.push("单次入库最多100件。"); return { items, errors }; }
  function csv(rows) { return "\uFEFF" + rows.map(row => row.map(v => { let s = String(v ?? ""); if (/^[\s]*[=+@-]/.test(s)) s = "'" + s; return `"${s.replaceAll('"', '""')}"`; }).join(",")).join("\r\n"); }
  const api = { KEY, TODAY, roles, navigation, tableNames, categories, seed, clone, find, scoped, metrics, teaching, actorFor, transact, ratio, weekOf, weekDate, parseCSV, validateImport, importHeader, extendedImportHeader, csv, activeBooking };
  if (typeof module !== "undefined") module.exports = api;
  if (root) { root.LabDemo = api; root.DEMO_DATA = { navigation }; }
})(typeof window === "undefined" ? null : window);
