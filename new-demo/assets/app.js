(function () {
  "use strict";
  const M = window.LabDemo, app = document.getElementById("app"), scope = document.body.dataset.scope || "district", pageId = document.body.dataset.page || "dashboard";
  const $ = (s, parent = document) => parent.querySelector(s), $$ = (s, parent = document) => [...parent.querySelectorAll(s)];
  const h = x => String(x ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = n => Number(n || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pref = (key, fallback) => { try { return JSON.parse(sessionStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const savePref = (key, value) => { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* Preferences are optional; business persistence is checked separately. */ } };
  let db, persistenceError = "", actor, modalRevision = 0, modalSubmit = null, selected = new Set(), lastFocus, downloadResult, importResult, pendingFile;
  try { const raw = localStorage.getItem(M.KEY); db = raw ? JSON.parse(raw) : M.seed(); if (db.version !== 2 || !db.assets || !db.plans) throw new Error("数据格式不匹配"); if (!raw) localStorage.setItem(M.KEY, JSON.stringify(db)); }
  catch { db = M.seed(); persistenceError = "本地数据无法读取或保存。为避免覆盖，业务修改已暂停；可在系统控制中备份并恢复数据。"; }
  let identity = pref("lab-demo-identity", { role: "admin", school: "S1" });
  try { actor = M.actorFor(db, scope === "district" ? "district" : identity.role === "district" ? "admin" : identity.role, identity.school, identity.personId); }
  catch { actor = scope === "district" ? M.actorFor(db, "district") : { role: "teacher", name: "身份待选择", school: identity.school || "S1", id: "UNAVAILABLE" }; }
  const view = { tab: new URLSearchParams(location.search).get("tab") || (pageId === "inspections" ? "checks" : ""), keyword: "", state: "", subject: "", grade: "", page: 1, date: "", week: M.TODAY, term: pref("lab-demo-term", "TERM26"), school: "" };
  if (!db.terms.some(t => t.id === view.term)) view.term = db.terms[0].id;
  const school = () => scope === "district" ? view.school : actor.school;
  const get = (table, id) => db[table]?.find(r => r.id === id);
  const name = (table, id) => get(table, id)?.name || id || "未关联";
  const permit = (...roles) => roles.includes(actor.role);
  const records = table => M.scoped(db, table, school());
  const planLabel = p => `${name("classes", p.classId)} / ${name("catalog", p.catalogId)}`;
  const status = s => `<span class="status ${/已完成|已通过|已准备|已关闭|正常|已入库|已归档|可预约|相符|已记账|已复核|已归还|已上报/.test(s) ? "success" : /驳回|拒绝|报废|不足|隐患/.test(s) ? "danger" : /待|维修|整改|借出/.test(s) ? "warning" : "info"}">${h(s)}</span>`;
  const button = (label, action, extra = "", primary = false, allowed = true) => `<button type="button" class="button ${primary ? "primary" : ""}" data-action="${h(action)}" ${extra} ${allowed ? "" : 'disabled title="当前身份无此操作权限，请在系统控制中选择对应身份"'}>${h(label)}</button>`;
  const col = spec => spec.split("|").map(pair => pair.split(":"));
  const columns = {
    schools: col("code:学校代码|name:学校|stage:学段|street:街镇|labsCount:实验室|assetsCount:设备数|technicians:实验员"),
    staff: col("name:姓名|sex:性别|department:部门|phone:手机号码|schoolName:学校|roleName:角色|subject:学科|qualification:资质|trainingCount:培训记录|state:账号状态"),
    labs: col("name:实验室|schoolName:学校|subject:学科|room:房间号|area:使用面积㎡|seats:座位数|managerName:管理员|state:状态"),
    classes: col("name:班级|schoolName:学校|grade:年级|students:人数|teachers:任课教师"),
    terms: col("name:学期|start:开始日期|end:结束日期"),
    catalog: col("code:实验编号|name:实验名称|subject:学科|grade:年级|required:属性|mode:实施方式|version:教材版本|periods:课时"),
    assets: col("code:资产编号|name:设备名称|model:规格型号|schoolName:学校|location:存放位置（房间）|priceText:原值（元）|state:资产状态"),
    purchases: col("id:申请单号|schoolName:学校|itemsText:采购明细|total:预计金额（元）|applicant:申请人|date:申请日期|state:状态"),
    receipts: col("id:入库单号|schoolName:学校|itemsText:入库明细|total:入库金额（元）|supplier:供应商|date:登记日期|state:状态"),
    repairs: col("id:处理单号|kind:类型|assetName:关联设备|schoolName:学校|reason:故障或原因|due:处理期限|state:状态"),
    moves: col("id:调拨单号|assetName:设备|fromName:原实验室|toName:目标实验室|date:调拨日期|operator:经办人|state:状态"),
    loans: col("id:借用单号|assetName:设备|borrower:借用人|date:借出日期|due:应归还日期|state:状态"),
    counts: col("id:盘点单号|assetName:设备|expected:账面数量|actual:实盘数量|difference:差异|date:盘点日期|state:状态"),
    inventory: col("id:物品编号|name:名称|spec:规格|schoolName:学校|location:存放位置|stockText:当前库存|minText:补库阈值|hazardText:管理类别|state:库存状态"),
    flows: col("id:业务单号|kind:业务类型|itemName:物品|qtyText:数量|applicant:申请人|reviewer:复核人|date:登记日期|state:记账状态"),
    plans: col("id:计划编号|name:计划名称|experimentName:实验名称|className:班级|teacherName:任课教师|required:统计属性|mode:实验类型|week:周次|date:计划日期|state:完成状态"),
    bookings: col("id:预约编号|experimentName:实验|chapter:章节|className:班级|teacherName:教师|labName:实验室|mode:类型|week:计划周次|date:日期|period:节次|time:时间段|state:状态"),
    checks: col("id:检查编号|schoolName:学校|labName:实验室|kind:类型|date:检查日期|inspector:检查人|result:检查结果"),
    hazards: col("id:隐患编号|schoolName:学校|title:隐患描述|owner:责任人|level:处置优先级|due:整改期限|state:状态"),
    tasks: col("id:任务编号|schoolName:学校|labName:实验室|kind:检查类型|owner:责任人|due:截止日期|state:状态"),
    archives: col("name:文件名称|category:分类|relatedName:关联业务|size:文件大小|uploader:上传人|date:日期|state:归档状态"),
    submissions: col("id:上报批次|schoolName:学校|termName:学期|at:上报时间|operator:上报人|revision:数据版本|state:状态"),
    logs: col("at:操作时间|actor:操作人|schoolName:学校|tableName:业务类型|recordId:记录编号|action:操作|note:说明"),
    report: col("name:统计维度|required:必做应开|done:必做实开|pending:必做未开|rate:必做开出率|demonstration:演示应开|demonstrationDone:演示实开|demonstrationRate:演示开出率|group:分组应开|groupDone:分组实开|groupRate:分组开出率|optional:选做应开|optionalDone:选做实开|total:合计应开|totalDone:合计实开|totalRate:合计开出率")
  };
  function decorate(table, r) {
    const x = { ...r, _table: table, schoolName: name("schools", r.school), labName: name("labs", r.labId), termName: name("terms", r.term) };
    const resource = r.assetId ? get("assets", r.assetId) : r.itemId ? get("inventory", r.itemId) : r;
    if (!x.subject && resource?.labId) x.subject = get("labs", resource.labId)?.subject;
    if (table === "schools") Object.assign(x, { labsCount: M.scoped(db, "labs", r.id).length, assetsCount: M.scoped(db, "assets", r.id).length, technicians: M.metrics(db, r.id, view.term).technicians });
    if (table === "staff") Object.assign(x, { roleName: M.roles[r.role], trainingCount: `${r.trainings.length}次`, state: r.enabled ? "正常" : "已停用" });
    if (table === "labs") x.managerName = name("staff", r.managerId);
    if (table === "classes") x.teachers = r.teacherIds.map(id => `${name("staff", id)}（${get("staff", id)?.subject}）`).join("、");
    if (table === "assets") { x.priceText = money(r.price); x.location = get("labs", r.labId)?.room || r.location || "未填写"; }
    if (r.assetId) x.assetName = name("assets", r.assetId);
    if (r.items && Array.isArray(r.items)) { x.itemsText = r.items.map(i => `${i.name} × ${i.qty}${i.unit}`).join("；"); x.total = money(r.items.reduce((n, i) => n + i.qty * i.price, 0)); }
    if (table === "moves") { x.fromName = name("labs", r.from); x.toName = name("labs", r.to); }
    if (table === "inventory") Object.assign(x, { location: get("labs", r.labId)?.room || r.location || "未填写", stockText: `${r.stock}${r.unit}`, minText: `${r.min}${r.unit}`, hazardText: r.hazard ? "危化品" : "普通耗材", state: r.stock < r.min ? "库存不足" : "库存充足" });
    if (table === "flows") { const i = r.snapshot || get("inventory", r.itemId); Object.assign(x, { itemName: i?.name, qtyText: `${r.qty}${i?.unit || ""}`, classificationCode: i?.classificationCode || "未登记", spec: i?.spec, unit: i?.unit, location: get("labs", i?.labId)?.room || i?.location || "未填写", total: r.snapshot?.unitPrice == null ? "未登记单价" : money(r.qty * r.snapshot.unitPrice) }); }
    if (["plans", "bookings"].includes(table)) { const p = table === "plans" ? r : get("plans", r.planId), e = get("catalog", p?.catalogId); Object.assign(x, { experimentName: e?.name, className: name("classes", p?.classId), teacherName: name("staff", p?.teacherId), subject: e?.subject, grade: name("classes", p?.classId) ? get("classes", p?.classId)?.grade : "", required: e?.required, term: p?.term, time: r.start ? `${r.start}-${r.end}` : "" }); }
    if (["plans", "bookings"].includes(table)) { const p = table === "plans" ? r : get("plans", r.planId), e = get("catalog", p.catalogId); Object.assign(x, { name: p.name || `${name("terms", p.term)} · ${e.subject}实验计划`, week: M.weekOf(get("terms", p.term), p.date), chapter: e.chapter, version: e.version, equipment: e.equipment, mode: p.mode }); }
    if (table === "archives") { x.relatedName = `${M.tableNames[r.relatedTable]} / ${r.relatedId}`; x.size = `${Math.max(1, Math.round((r.dataUrl ? r.dataUrl.length * .75 : new Blob([r.content || ""]).size) / 1024))} KB`; }
    if (table === "logs") x.tableName = M.tableNames[r.table] || "平台设置";
    return x;
  }
  function tabsFor() {
    if (pageId === "schools") return [["schools", "学校档案"], ["labs", "实验室档案"], ["submissions", "数据上报"]];
    if (["teachers", "staff"].includes(pageId)) return [["all", "全部人员"], ["teacher", "任课教师"], ["technician", "实验员"], ["training", "待培训"], ["disabled", "已停用"]];
    if (pageId === "labs") return [["labs", "实验室档案"], ["classes", "班级与任课关系"]];
    if (["devices", "equipment"].includes(pageId)) return [["assets", "设备台账"], ["receipts", "入库单"], ["purchases", "采购申请"], ["moves", "调拨记录"], ["loans", "借还记录"], ["counts", "盘点记录"]];
    if (["supplies", "consumables"].includes(pageId)) return [["stock", "耗材库存"], ["hazard", "危化品"], ["inbound", "入库记录"], ["outbound", "领用记录"], ["loss", "损耗与处置"], ["pending", "待复核"]];
    if (["maintenance", "repair"].includes(pageId)) return [["repair", "维修申请"], ["scrap", "报废申请"], ["purchase", "采购申请"], ["plan", "维保计划"], ["history", "历史记录"]];
    if (pageId === "experiments") return scope === "district" ? [["all", "全部实验"], ["required", "必做实验"], ["optional", "选做实验"]] : [["all", "班级实验计划"], ["required", "必做实验"], ["optional", "选做实验"], ["mine", "我的完成"], ["catalog", "实验目录"]];
    if (pageId === "schedule") return [["progress", "完成进度"], ["ranking", "学校排行"], ["subject", "学科分析"], ["grade", "年级对比"], ["class", "班级明细"]];
    if (pageId === "booking") return [["all", "全部预约"], ["mine", "我的预约"], ["prepare", "准备任务"], ["record", "预约记录"]];
    if (["safety", "inspections"].includes(pageId)) return [["hazards", "隐患与整改"], ["checks", "检查台账"], ["tasks", "检查任务"]];
    if (pageId === "archives") return [["all", "全部资料"], ["实验教学", "实验教学"], ["安全管理", "安全管理"], ["师资培训", "师资培训"], ["设备建设", "设备建设"]];
    if (pageId === "settings") return [["settings", "平台设置"], ["terms", "学年学期"], ["classes", "班级任课"], ["catalog", "实验目录"], ["logs", "操作日志"]];
    return [];
  }
  function dataset() {
    const tabs = tabsFor(); if (!tabs.some(([id]) => id === view.tab)) view.tab = tabs[0]?.[0] || "";
    let table = "", rows = [], t = view.tab;
    if (["schools", "labs", "settings"].includes(pageId)) table = t;
    else if (["teachers", "staff"].includes(pageId)) table = "staff";
    else if (["devices", "equipment"].includes(pageId)) table = t;
    else if (["supplies", "consumables"].includes(pageId)) table = ["stock", "hazard"].includes(t) ? "inventory" : "flows";
    else if (["maintenance", "repair"].includes(pageId)) table = t === "purchase" ? "purchases" : "repairs";
    else if (pageId === "experiments") table = scope === "district" || t === "catalog" ? "catalog" : "plans";
    else if (pageId === "booking") table = "bookings";
    else if (["safety", "inspections"].includes(pageId)) table = t;
    else if (pageId === "archives") table = "archives";
    else if (pageId === "schedule") table = "report";
    if (table === "settings") return { table, rows: [], columns: [] };
    if (table === "report") { rows = M.teaching(db, school(), view.term, ["subject", "grade", "class"].includes(t) ? t : "school", { subject: view.subject, grade: view.grade, teacherId: view.teacherId, classId: view.classId }); if (t === "ranking") rows.sort((a, b) => (b.done / (b.required || 1)) - (a.done / (a.required || 1))); }
    else rows = (db[table] ? (["terms", "catalog"].includes(table) ? db[table] : records(table)) : []).map(r => decorate(table, r));
    if (table === "staff") rows = rows.filter(r => t === "all" || (t === "training" ? r.enabled && !r.trainings.length : t === "disabled" ? !r.enabled : r.role === t && r.enabled));
    if (table === "inventory" && t === "hazard") rows = rows.filter(r => r.hazard);
    if (table === "flows") rows = rows.filter(r => t === "pending" ? r.state === "待复核" : t === "inbound" ? ["入库", "退回"].includes(r.kind) : t === "outbound" ? r.kind === "领用" : ["损耗", "处置"].includes(r.kind));
    if (table === "flows" && t === "loss") rows = rows.filter(r => (!view.date || r.date === view.date) && (!view.labId || (r.snapshot?.labId || get("inventory", r.itemId)?.labId) === view.labId));
    if (table === "repairs") rows = rows.filter(r => t === "history" ? ["已完成", "已驳回", "已撤销"].includes(r.state) : r.kind === ({ repair: "维修", scrap: "报废", plan: "维保" }[t]));
    if (["catalog", "plans"].includes(table)) rows = rows.filter(r => t === "required" ? r.required === "必做" : t === "optional" ? r.required === "选做" : t === "mine" ? r.teacherId === actor.id && r.state === "已完成" : true);
    if (["plans", "bookings"].includes(table)) rows = rows.filter(r => r.term === view.term && (actor.role !== "teacher" || r.teacherId === actor.id));
    if (table === "bookings") rows = rows.filter(r => (!view.date || r.date === view.date) && (t === "mine" ? r.teacherId === actor.id : t === "prepare" ? ["已通过", "已准备"].includes(r.state) : t === "record" ? ["已完成", "已取消", "已拒绝"].includes(r.state) : true));
    if (table === "archives" && t !== "all") rows = rows.filter(r => r.category === t);
    if (actor.role === "teacher" && table === "archives") rows = rows.filter(r => r.uploader === actor.name || get(r.relatedTable, r.relatedId)?.teacherId === actor.id);
    const allRows = rows;
    const visibleColumns = table === "flows" && t === "loss" ? col("date:损耗日期|classificationCode:分类编号|itemName:名称|spec:规格|unit:单位|qty:数量|total:总价（元）|location:存放位置（房间）|reason:损耗原因|state:状态") : table === "report" && t === "class" ? [...col("gradeNames:年级|teacherNames:任课教师"), ...columns.report] : columns[table] || [];
    rows = rows.filter(r => (!view.state || (r.state || r.result) === view.state) && (table === "report" || ((!view.subject || r.subject === view.subject) && (!view.grade || r.grade === view.grade))) && (!view.keyword || visibleColumns.some(([k]) => String(r[k] ?? "").toLowerCase().includes(view.keyword.toLowerCase()))));
    return { table, rows, allRows, columns: visibleColumns };
  }
  function commit(command, payload, expected = modalRevision) {
    if (persistenceError) throw new Error(persistenceError);
    let latest; try { latest = JSON.parse(localStorage.getItem(M.KEY)); } catch { throw new Error("无法读取本地数据，未保存任何变更。"); }
    if (!latest || latest.revision !== expected) throw new Error("其他页面已更新数据，请关闭此窗口并重新打开后提交，避免覆盖。");
    const out = M.transact(latest, actor, command, payload);
    try { localStorage.setItem(M.KEY, JSON.stringify(out.db)); } catch { throw new Error("本地存储空间不足或不可用，本次未保存。请先备份数据并缩小附件。"); }
    db = out.db; return out.result;
  }
  function toast(message) { const area = $("#toastRegion"); if (!area) return; const el = document.createElement("div"); el.className = "toast"; el.textContent = message; area.append(el); setTimeout(() => el.remove(), 5000); }
  function openModal(title, html, submit = null, label = "确认保存") {
    $(".modal").classList.toggle("wide", /class="(?:table-wrap|detail-grid)|id="itemRows"|id="importPreview"/.test(html));
    lastFocus = document.activeElement; modalRevision = db.revision; modalSubmit = submit; $("#modalTitle").textContent = title; $("#modalBody").innerHTML = `<div class="form-error" role="alert" id="formError"></div>${html}`; $("#modalFoot").innerHTML = button("关闭", "close") + (submit ? `<button type="submit" form="modalForm" class="button primary">${h(label)}</button>` : ""); $("#modalBackdrop").classList.add("open"); $("#modalBackdrop").setAttribute("aria-hidden", "false"); document.body.classList.add("modal-open"); $("#modalClose").focus();
  }
  function closeModal() { $("#modalBackdrop").classList.remove("open"); $("#modalBackdrop").setAttribute("aria-hidden", "true"); document.body.classList.remove("modal-open"); modalSubmit = null; if (lastFocus?.isConnected) lastFocus.focus(); }
  function fieldsForm(html) { return `<form class="form-grid" id="modalForm">${html}</form>`; }
  function field(key, label, value = "", type = "text", options = null, required = true, extra = "") {
    const common = `name="${h(key)}" id="f-${h(key)}" ${required ? "required" : ""} ${extra}`, input = options ? `<select class="select" ${common}>${options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${h(v)}" ${String(v) === String(value) ? "selected" : ""}>${h(l)}</option>`; }).join("")}</select>` : type === "textarea" ? `<textarea class="textarea" ${common}>${h(value)}</textarea>` : `<input class="input" type="${h(type)}" value="${h(value)}" ${common}>`;
    return `<label class="field ${type === "textarea" ? "full" : ""}"><span class="field-label">${h(label)}${required ? ' <span class="required">*</span>' : ""}</span>${input}</label>`;
  }
  const check = (key, label, value) => `<label class="check-field"><input name="${h(key)}" type="checkbox" ${value ? "checked" : ""}>${h(label)}</label>`;
  const opts = (table, rows = records(table), label = r => r.name || r.title || r.id) => rows.map(r => [r.id, label(r)]);
  function form(title, fields, command, fixed = {}, label = "确认保存") { openModal(title, fieldsForm(fields), values => { const r = commit(command, { ...values, ...fixed }); closeModal(); render(); toast(`已保存：${r.id}`); return r; }, label); }
  function valuesOf(formEl) { const fd = new FormData(formEl), out = Object.fromEntries(fd); $$("input[type=checkbox]", formEl).forEach(e => { if (!["teacherIds", "features", "assetIds"].includes(e.name)) out[e.name] = e.checked; }); for (const key of ["teacherIds", "assetIds"]) if ($(`[name=${key}]`, formEl)) out[key] = fd.getAll(key); if ($("[name=features]", formEl)) out.features = [...new Set([...fd.getAll("features"), out.featureOther?.trim()].filter(Boolean))].join("、"); return out; }
    const moreLabels = { id: "记录编号", code: "统一编号", name: "名称", school: "所属学校", labId: "实验室", catalogId: "实验目录", classId: "班级", teacherId: "任课教师", term: "学期", assetId: "关联设备", itemId: "关联物品", planId: "教学计划", checkId: "来源检查", taskId: "检查任务", purchaseId: "采购申请", receiptId: "入库单", sourceId: "来源单据", attachmentId: "整改附件", bookingId: "实施预约", model: "规格型号", category: "分类", unit: "单位", price: "原值/单价（元）", purchaseDate: "购置日期", date: "业务日期", state: "业务状态", supplier: "供应商", nextMaintenance: "下次维保日期", reason: "用途或原因", purpose: "采购用途", applicant: "申请人", reviewer: "复核人", decision: "审批意见", reporter: "提交人", due: "处理期限", vendor: "服务单位", cost: "处理费用（元）", result: "处理/检查结果", acceptance: "验收意见", priorState: "处理前状态", operator: "经办人", borrower: "借用人", returnDate: "归还日期", actual: "实盘数量", expected: "账面数量", difference: "盘点差异", resolution: "差异复核依据", spec: "规格", stock: "现有库存", opening: "期初库存", min: "补库阈值", hazard: "危化品", expiry: "有效期", location: "存放位置（房间）", qty: "业务数量", kind: "业务类型", reviewNote: "复核意见", mode: "实施方式", completedAt: "完成日期", start: "开始", end: "结束", groups: "分组数", preparation: "准备检查记录", technician: "准备确认人", attendees: "实际参加人数", actualDate: "实际完成日期", summary: "实施总结/上报摘要", cancelReason: "取消原因", items: "检查项目", inspector: "检查人", title: "名称/职称", level: "处置优先级", owner: "责任人", note: "说明", rectification: "整改说明", review: "复查意见", relatedTable: "关联业务类型", relatedId: "关联记录", uploader: "上传人", at: "记录时间", revision: "数据版本", area: "使用面积（㎡）", seats: "座位数", type: "实验室类型", builtAt: "建造日期", features: "设施与功能", managerId: "管理员", room: "房间号", subject: "学科", grade: "年级", students: "班级人数", role: "人员角色", phone: "联系电话", qualification: "资质说明", enabled: "账号启用", version: "教材版本", chapter: "章节", equipment: "所需器材", periods: "课时", required: "实验属性", stage: "学段", street: "街镇" };
  const references = { school: "schools", labId: "labs", catalogId: "catalog", classId: "classes", teacherId: "staff", term: "terms", assetId: "assets", itemId: "inventory", planId: "plans", checkId: "checks", taskId: "tasks", purchaseId: "purchases", receiptId: "receipts", sourceId: "receipts", attachmentId: "archives", bookingId: "bookings", managerId: "staff" };
  function miniTable(cols, rows) { return `<div class="table-wrap"><table class="data-table"><thead><tr>${cols.map(([, label]) => `<th>${h(label)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map(r => `<tr>${cols.map(([key]) => `<td>${h(r[key] ?? "未填写")}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${cols.length}">暂无记录</td></tr>`}</tbody></table></div>`; }
  function detail(table, id) {
    Object.assign(moreLabels, { openStart: "每日开放开始时间", openEnd: "每日开放结束时间", classificationCode: "分类编号", builder: "建造商", builtAt: "建造日期", sex: "性别", department: "部门", phone: "手机号码", week: "计划周次", period: "节次", batchId: "关联批次", bookedAt: "预约登记时间", maintenanceDate: "维修日期", unitPrice: "登记单价（元）", location: "存放位置（房间）" });
    const stored = get(table, id); if (!stored || (scope !== "district" && stored.school && stored.school !== actor.school)) throw new Error("记录不存在或不在当前数据范围。");
    const r = { ...(table === "labs" ? { builder: "", stage: name("schools", stored.school) && get("schools", stored.school)?.stage || "", note: "" } : table === "staff" ? { sex: "", department: "" } : ["assets", "inventory"].includes(table) ? { classificationCode: "" } : {}), ...stored };
    if (["assets", "inventory"].includes(table)) r.location = get("labs", r.labId)?.room || r.location || "未填写";
    if (["plans", "bookings"].includes(table)) { const d = decorate(table, r); Object.assign(r, { week: d.week, version: d.version, chapter: d.chapter, equipment: d.equipment, mode: d.mode }); if (table === "plans") r.name = d.name; }
    let html = `<dl class="detail-grid">${Object.entries(r).filter(([k, v]) => moreLabels[k] && !Array.isArray(v) && typeof v !== "object").map(([k, v]) => `<div><dt>${h(moreLabels[k])}</dt><dd>${references[k] && v ? `<button type="button" class="row-action" data-action="detail" data-table="${references[k]}" data-id="${h(v)}">${h(name(references[k], v))}</button>` : h(typeof v === "boolean" ? v ? "是" : "否" : k === "role" ? M.roles[v] : k === "relatedTable" ? M.tableNames[v] : v === "" ? "未填写" : v)}</dd></div>`).join("")}</dl>`;
    if (Array.isArray(r.items)) html += `<h3>业务明细</h3>${miniTable(col("classificationCode:分类编号|name:名称|model:规格|category:分类|qty:数量|unit:单位|price:单价（元）|total:总价（元）" + (table === "receipts" ? "|location:存放位置（房间）" : "")), r.items.map(i => ({ ...i, classificationCode: i.classificationCode || "未登记", price: money(i.price), total: money(i.price * i.qty), location: i.labId || r.labId ? get("labs", i.labId || r.labId)?.room || i.location || "未登记" : "见关联资产档案" })))}`;
    if (r.resources) html += `<h3>补充实验仪器</h3>${miniTable(col("classificationCode:分类编号|name:器材|spec:规格|qty:数量|unit:单位"), r.resources.map(x => { const i = get("assets", x.ref) || get("inventory", x.ref); return { classificationCode: i?.classificationCode || "未登记", name: i?.name, spec: i?.model || i?.spec, unit: i?.unit, qty: x.qty }; }))}<p class="help">准备确认不自动扣减耗材；实际领用请关联该计划登记耗材领用单。</p>`;
    if (r.snapshot) html += `<h3>登记时物品信息</h3>${miniTable(col("classificationCode:分类编号|code:设备编号|name:名称|spec:规格|qty:数量|unit:单位|total:总价（元）|purchaseDate:购置日期|location:存放位置（房间）"), [{ ...r.snapshot, qty: r.qty || 1, classificationCode: r.snapshot.classificationCode || "未登记", total: r.snapshot.unitPrice == null ? "未登记单价" : money(r.snapshot.unitPrice * (r.qty || 1)), location: get("labs", r.snapshot.labId)?.room || r.snapshot.location || "未登记" }])}`;
    if (r.batchId) html += `<h3>同批次记录</h3><div class="inline-actions">${db[table].filter(x => x.batchId === r.batchId).map(x => button(x.id, "detail", `data-table="${table}" data-id="${h(x.id)}"`)).join("")}</div>`;
    if (r.teacherIds) html += `<h3>任课关系</h3>${miniTable(columns.staff, r.teacherIds.map(id => decorate("staff", get("staff", id))))}`;
    if (r.trainings) html += `<h3>培训记录</h3>${miniTable(col("name:培训名称|date:日期|hours:学时|evidence:证书或记录说明"), r.trainings)}`;
    if (table === "archives") html += `<h3>附件内容</h3>${r.content ? `<pre class="file-preview">${h(r.content)}</pre>` : `<p>已保存原始附件，可下载后查看。</p>`}${button("下载原文件", "file-download", `data-id="${h(r.id)}"`)}`;
    const attached = db.archives.filter(f => f.relatedTable === table && f.relatedId === id);
    if (attached.length) html += `<h3>关联附件</h3><div class="inline-actions">${attached.map(f => button(f.name, "detail", `data-table="archives" data-id="${h(f.id)}"`)).join("")}</div>`;
    if (table === "checks") html += `<h3>关联隐患</h3>${db.hazards.filter(h => h.checkId === id).map(r => button(r.title, "detail", `data-table="hazards" data-id="${h(r.id)}"`)).join("") || '<p class="help">本次检查无关联隐患。</p>'}`;
    if (table === "assets") html += `<h3>资产处理履历</h3>${miniTable(columns.repairs, db.repairs.filter(x => x.assetId === id).map(r => decorate("repairs", r)))}`;
    if (table === "labs") html += `<h3>实验室设备</h3>${miniTable(columns.assets, db.assets.filter(a => a.labId === id).map(a => decorate("assets", a)))}<h3>有效预约</h3>${miniTable(columns.bookings, db.bookings.filter(b => b.labId === id && M.activeBooking(b)).map(b => decorate("bookings", b)))}`;
    if (table === "submissions") html += `<h3>上报时的数据快照</h3>${miniTable(col("label:指标|value:数值"), Object.entries(r.summary).filter(([k]) => ["assets", "required", "done", "rate", "hazards", "closed"].includes(k)).map(([key, value]) => ({ label: { assets: "设备数", required: "必做应开", done: "必做实开", rate: "必做开出率", hazards: "隐患数", closed: "已关闭" }[key], value })))}`;
    html += `<h3>处理轨迹</h3>${miniTable(col("at:时间|actor:操作人|action:操作|note:说明"), db.logs.filter(l => l.table === table && l.recordId === id).slice().reverse())}<div class="detail-actions">${rowActions(table, r, false)}</div>`;
    openModal(`${M.tableNames[table]}详情`, html);
  }
  function rowActions(table, r, includeView = true) {
    const b = (label, action, allowed = true, extra = "") => button(label, action, `data-table="${table}" data-id="${h(r.id)}" ${extra}`, false, allowed);
    let out = table === "logs" || !includeView ? "" : b("查看", "detail");
    if (["schools", "staff", "labs", "classes", "terms", "catalog"].includes(table)) { out += b("编辑", "base-edit", ["schools", "terms", "catalog"].includes(table) ? permit("district") : permit("district", "admin")); if (table === "staff") out += b("培训记录", "training", permit("district", "admin")); }
    if (table === "assets" && scope === "school") { out += b("编辑", "asset-edit", permit("admin", "technician")); let ops = ""; if (r.state === "正常使用") ops += b("调拨", "transfer", permit("admin", "technician")) + b("借用", "lend", permit("admin", "technician")) + b("报修/报废", "repair-new"); if (["正常使用", "维修中", "待报废"].includes(r.state)) ops += b("盘点", "count", permit("admin", "technician")); ops += b("资产标签", "asset-label"); out += `<details class="asset-actions"><summary>资产业务</summary><div class="inline-actions">${ops}</div></details>`; }
    if (table === "purchases") { if (r.state === "待审核") out += scope === "district" ? b("审批", "decide") : b("撤销", "purchase-cancel", permit("admin", "technician")); if (r.state === "已通过" && scope === "school") out += b("到货入库", "receipt", permit("admin", "technician")); }
    if (table === "repairs") { if (r.state === "待审核") out += scope === "district" ? b("处理", "decide") : b("撤销", "repair-cancel", actor.role === "admin" || r.reporter === actor.name); if (scope === "school" && r.state === "处理中") out += b("完成维修", "repair-finish", permit("admin", "technician")); if (scope === "school" && r.state === "待验收") out += b("验收", "repair-accept", permit("admin")); }
    if (table === "loans" && r.state === "借出") out += b("归还", "return", permit("admin", "technician"));
    if (table === "counts" && r.state === "待处理差异") out += b("复核差异", "count-resolve", permit("admin"));
    if (table === "inventory" && scope === "school") out += b("领用", "flow", true, 'data-kind="领用"') + b("入库", "flow", permit("admin", "technician"), 'data-kind="入库"') + b("损耗/处置", "flow", permit("admin", "technician"), 'data-kind="损耗"') + b("编辑", "inventory-edit", permit("admin", "technician"));
    if (table === "flows" && r.state === "待复核" && scope === "school") out += b("复核", "decide", permit("admin", "technician") && r.applicant !== actor.name);
    if (table === "plans" && scope === "school" && r.state !== "已完成") { const booking = db.bookings.find(b => b.planId === r.id && M.activeBooking(b)); out += booking ? button(booking.state === "已准备" ? "确认完成" : "查看预约", booking.state === "已准备" ? "booking-complete" : "detail", `data-table="bookings" data-id="${h(booking.id)}"`, false, booking.state !== "已准备" || permit("admin", "teacher")) : b("预约实验", "booking-new", permit("admin", "teacher")); }
    if (table === "bookings" && scope === "school") { if (r.state === "待审批") out += b("审批", "decide", permit("admin")); if (r.state === "已通过") out += b("确认准备", "booking-prepare", permit("admin", "technician")); if (r.state === "已准备") out += b("确认完成", "booking-complete", permit("admin", "teacher")); if (M.activeBooking(r)) out += b("取消", "booking-cancel", permit("admin", "teacher") && (actor.role !== "teacher" || r.teacherId === actor.id)); }
    if (table === "tasks" && scope === "school" && r.state === "待检查") out += b("填报检查", "check-new", permit("admin", "technician"));
    if (table === "hazards") { if (scope === "school" && ["待整改", "整改中"].includes(r.state)) out += b("整改附件", "attachment", permit("admin", "technician")) + b("提交整改", "hazard-submit", permit("admin", "technician")); if (scope === "district" && r.state === "待复查") out += b("复查", "decide"); }
    if (table === "archives") { out += b("下载", "file-download"); if (r.state === "待归档") out += b("确认归档", "archive-confirm", permit("admin", "technician")); }
    return out;
  }
  function actionsFor(table) {
    let out = button(pageId === "archives" ? "批量下载" : "导出当前列表", pageId === "archives" ? "archive-batch" : "export");
    if (["schools", "staff", "labs", "classes", "terms", "catalog"].includes(table)) out += button(table === "catalog" ? "新增实验" : `新增${M.tableNames[table]}`, "base-edit", `data-table="${table}"`, true, ["schools", "terms", "catalog"].includes(table) ? permit("district") : permit("district", "admin"));
    if (table === "staff") out += button("培训管理", "training-report");
    if (["devices", "equipment"].includes(pageId)) out += scope === "school" ? button("模板导入", "import", "", false, permit("admin", "technician")) + button("采购申请", "purchase-new", "", false, permit("admin", "technician")) + button("新增设备/入库", "receipt", "", true, permit("admin", "technician")) : button("统计分析", "asset-report", "", true);
    if (["supplies", "consumables"].includes(pageId)) out += scope === "school" ? button("新增耗材", "inventory-edit", "", false, permit("admin", "technician")) + button("采购申请", "purchase-new", "", false, permit("admin", "technician")) + button("入库登记", "flow", 'data-kind="入库"', true, permit("admin", "technician")) : button("查看风险预警", "risk-report", "", true);
    if (["maintenance", "repair"].includes(pageId)) out += button("维修统计", "repair-report") + (scope === "district" ? button("批量审批", "batch", "", true) : button("新增报修", "repair-new", "", true));
    if (table === "plans") out += button("查看完成统计", "teaching-report") + button("编制实验计划", "plan-new", "", true, permit("admin", "teacher"));
    if (pageId === "booking") out += button("查看我的预约", "my-bookings") + button("新增预约", "booking-new", "", true, permit("admin", "teacher"));
    if (["safety", "inspections"].includes(pageId)) out += scope === "district" ? button("发起专项检查", "task-new", "", true) : button("新增检查", "check-new", "", true, permit("admin", "technician"));
    if (pageId === "archives") out += button("上传资料", "attachment", "", true);
    if (pageId === "schedule") out += button("生成监管报告", "teaching-report", "", true);
    return out;
  }
  function listView(data) {
    if (data.table === "settings") return settingsView();
    const states = [...new Set(data.allRows?.map(r => r.state || r.result).filter(Boolean))];
    const start = (view.page - 1) * 8; if (start >= data.rows.length && view.page > 1) view.page = 1;
    const pageRows = data.rows.slice((view.page - 1) * 8, view.page * 8), max = Math.max(1, Math.ceil(data.rows.length / 8));
    const extraFilters = data.table === "report" ? field("classId", "班级", view.classId || "", "text", [["", "全部班级"], ...opts("classes", records("classes"), c => `${name("schools", c.school)} · ${c.name}`)], false) + field("teacherId", "任课教师", view.teacherId || "", "text", [["", "全部教师"], ...opts("staff", records("staff").filter(t => t.role === "teacher"))], false) : data.table === "flows" && view.tab === "loss" ? field("date", "损耗日期", view.date, "date", null, false) + field("labId", "房间／实验室", view.labId || "", "text", [["", "全部实验室"], ...opts("labs", records("labs"))], false) : "";
    return `${pageId === "booking" ? calendar() : ""}${["devices", "equipment"].includes(pageId) ? `<section class="scanner"><div><strong>资产编号查询</strong><p class="help">扫描条码或输入编号；支持扫码枪键盘输入后回车。</p></div><form id="scanForm" class="compose-row"><input class="input" name="code" aria-label="资产编号" placeholder="例如 QP001-2024-001" required><button class="button primary" type="submit">查询</button></form></section>` : ""}${tabsMarkup()}
      <section class="table-panel"><form class="filter-bar" id="filterForm">${field("keyword", "关键词", view.keyword, "text", null, false)}${states.length ? field("state", "状态", view.state, "text", [["", "全部状态"], ...states], false) : ""}${data.table === "report" || data.allRows?.some(r => r.subject) ? field("subject", "学科", view.subject, "text", [["", "全部学科"], "物理", "化学", "生物", "科学", "综合"], false) : ""}${["report", "plans", "bookings", "catalog", "classes"].includes(data.table) ? field("grade", "年级", view.grade, "text", [["", "全部年级"], ...new Set(db.classes.map(c => c.grade))], false) : ""}${extraFilters}<div class="filter-actions"><button class="button primary" type="submit">查询</button>${button("重置", "filter-reset")}</div></form>
      <div class="table-wrap"><table class="data-table"><thead><tr><th><input type="checkbox" id="selectAll" aria-label="选择本页记录"></th>${data.columns.map(([, label]) => `<th scope="col">${h(label)}</th>`).join("")}<th>操作</th></tr></thead><tbody>${pageRows.map(r => `<tr><td><input type="checkbox" data-select="${h(r.id)}" aria-label="选择 ${h(r.name || r.id)}" ${selected.has(r.id) ? "checked" : ""}></td>${data.columns.map(([key]) => `<td${["name", "experimentName", "chapter", "itemsText", "reason", "title", "note", "relatedName"].includes(key) || String(r[key] ?? "").length > 24 ? ' class="cell-wrap"' : ""}>${key === "state" || key === "result" ? status(r[key] || "未填写") : h(r[key] ?? "未填写")}</td>`).join("")}<td><div class="row-actions">${data.table === "report" ? button("查看计划", "report-plans", `data-name="${h(r.name)}"`) : rowActions(data.table, r)}</div></td></tr>`).join("") || `<tr><td colspan="${data.columns.length + 2}"><div class="empty-message">当前条件下暂无记录。可调整筛选，或通过页面上方操作新增业务。</div></td></tr>`}</tbody></table></div>
      <footer class="table-footer"><span>筛选结果 ${data.rows.length} 条 · 已选 ${selected.size} 条 · 每页8条</span><div class="pagination">${button("上一页", "page-prev", "", false, view.page > 1)}<span>${view.page} / ${max}</span>${button("下一页", "page-next", "", false, view.page < max)}</div></footer></section>
      ${["schedule", "experiments"].includes(pageId) ? '<p class="help">统计口径：按本学期班级计划计次，完成登记后计入实开。演示/分组包含必做与选做，演示＋分组＝必做＋选做，两个维度不可重复相加。分母为0显示“不适用”。</p>' : ""}`;
  }
  function tabsMarkup() { return `<div class="tabs" role="tablist" aria-label="业务分类">${tabsFor().map(([id, label]) => `<button class="tab ${view.tab === id ? "active" : ""}" type="button" role="tab" aria-selected="${view.tab === id}" data-action="tab" data-tab="${h(id)}">${h(label)}</button>`).join("")}</div>`; }
  function addDays(d, n) { const date = new Date(`${d}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + n); return date.toISOString().slice(0, 10); }
  function calendar() {
    const term = get("terms", view.term); if (view.week < term.start) view.week = term.start; if (view.week > term.end) view.week = term.end;
    const day = new Date(`${view.week}T12:00:00Z`).getUTCDay(), monday = addDays(view.week, -(day + 6) % 7), rows = records("bookings").filter(b => get("plans", b.planId)?.term === view.term && (actor.role !== "teacher" || b.teacherId === actor.id));
    return `<section class="calendar"><div class="calendar-head"><strong>${h(monday)} 至 ${h(addDays(monday, 6))}</strong>${field("calendarWeek", "课表周次", M.weekOf(term, view.week), "text", Array.from({ length: M.weekOf(term, term.end) }, (_, i) => [i + 1, `第${i + 1}周`]), false, 'data-calendar-week="true"')}<div class="inline-actions">${button("上周", "week-prev")}${button("回到当前日期", "today")}${button("下周", "week-next")}${button("全部日期", "all-dates")}</div></div><div class="calendar-grid">${Array.from({ length: 7 }, (_, i) => { const d = addDays(monday, i); return `<button type="button" class="calendar-day ${view.date === d ? "selected" : ""}" data-action="date" data-date="${d}"><span>周${["一", "二", "三", "四", "五", "六", "日"][i]}</span><strong>${d.slice(5)}</strong><small>${rows.filter(r => r.date === d).length}条预约</small></button>`; }).join("")}</div><p class="help">${view.date ? `正在筛选 ${view.date}，下方列表与日期一致。` : "当前查看本学期全部日期；点击某天筛选预约。"}</p></section>`;
  }
  function own(table) { return M.scoped(db, table, actor.school); }
  function baseForm(table, id) {
    const r = get(table, id) || {}, s = r.school || school() || db.schools[0].id;
    let html = field("name", table === "staff" ? "姓名" : "名称", r.name);
    if (["staff", "labs", "classes"].includes(table)) html += field("school", "所属学校", s, "text", opts("schools", db.schools), true, r.id || scope === "school" ? "disabled" : 'data-base-school="true"');
    if (table === "schools") html += field("code", "学校代码", r.code) + field("stage", "学段", r.stage || "高中", "text", ["小学", "初中", "高中", "完全中学", "九年一贯制"]) + field("street", "街镇", r.street);
    if (table === "terms") html += field("start", "学期开始", r.start || M.TODAY, "date") + field("end", "学期结束", r.end || "2027-01-29", "date");
    if (table === "staff") html += field("role", "角色", r.role || "teacher", "text", Object.entries(M.roles).filter(([k]) => k !== "district")) + field("subject", "学科", r.subject || "物理", "text", ["物理", "化学", "生物", "科学", "综合"]) + field("title", "岗位职称", r.title || "一级教师") + field("qualification", "资质说明", r.qualification || "教师资格证") + field("phone", "手机号码", r.phone || "", "text", null, false) + check("enabled", "启用账号", r.enabled !== false);
    if (table === "staff") html += field("sex", "性别", r.sex || "", "text", [["", "未登记"], "男", "女"], false) + field("department", "部门", r.department || "", "text", [["", "未登记"], ...new Set(["教务处", "物理实验组", "化学实验组", "生物实验组", ...db.staff.map(t => t.department).filter(Boolean)])], false);
    if (table === "labs") {
      html += field("subject", "学科", r.subject || "物理", "text", ["物理", "化学", "生物", "科学"]) + field("room", "房间号", r.room) + field("area", "实际使用面积（㎡）", r.area || 96, "number", null, true, 'min="1" step="0.01"') + field("seats", "座位数", r.seats || 48, "number", null, true, 'min="1"') + field("type", "实验室类型", r.type || "教学实验室", "text", [...new Set(["教学实验室", ...db.labs.map(l => l.type)])]) + field("builder", "建造商", r.builder || "", "text", null, false) + field("builtAt", "建造日期", r.builtAt || "", "date", null, false) + field("stage", "所属学段", r.stage || get("schools", s)?.stage, "text", [...new Set(["小学", "初中", "高中", "完全中学", "九年一贯制", ...db.schools.map(s => s.stage), ...db.labs.map(l => l.stage).filter(Boolean)])], false) + field("managerId", "管理员（同校）", r.managerId, "text", opts("staff", db.staff.filter(t => t.school === s && t.enabled)), true, 'data-related-school="true"') + field("state", "开放状态", r.state || "可预约", "text", ["可预约", "维护中"]);
      const features = (r.features || "").split(/、|，|,/).filter(Boolean), options = [...new Set([...db.labs.flatMap(l => (l.features || "").split(/、|，|,/)), ...features])].filter(Boolean);
      html += `<fieldset class="full"><legend>特征或功能（可多选）</legend><div class="form-grid">${options.map(f => `<label class="check-field"><input type="checkbox" name="features" value="${h(f)}" ${features.includes(f) ? "checked" : ""}>${h(f)}</label>`).join("")}${field("featureOther", "其他功能", "", "text", null, false)}</div></fieldset>` + field("note", "备注（最多60字）", r.note || "", "textarea", null, false, 'maxlength="60"') + '<p class="help full">面积为实际使用面积；建造日期指主要设施、设备建成日期，不是楼宇竣工日期。</p>';
    }
    if (table === "classes") html += field("grade", "年级", r.grade || "高一", "text", ["一年级", "二年级", "三年级", "四年级", "五年级", "六年级", "初一", "初二", "初三", "高一", "高二", "高三"]) + field("students", "学生人数", r.students || 40, "number", null, true, 'min="1"') + `<fieldset class="field full" data-teacher-options><legend>任课教师（可多选）</legend>${db.staff.filter(t => t.school === s && t.enabled && t.role === "teacher").map(t => `<label class="check-field"><input type="checkbox" name="teacherIds" value="${h(t.id)}" ${r.teacherIds?.includes(t.id) ? "checked" : ""}>${h(t.name)} · ${h(t.subject)}</label>`).join("")}</fieldset>`;
    if (table === "catalog") html += field("code", "实验编号", r.code) + field("subject", "学科", r.subject || "物理", "text", ["物理", "化学", "生物", "科学"]) + field("grade", "适用年级", r.grade || "高一") + field("required", "统计属性", r.required || "必做", "text", ["必做", "选做"]) + field("mode", "实验类型", r.mode || "分组", "text", ["分组", "演示"]) + field("periods", "课时", r.periods || 1, "number", null, true, 'min="1"') + field("version", "教材版本", r.version || "人教版·必修第一册") + field("chapter", "章节", r.chapter) + field("equipment", "器材需求", r.equipment, "textarea");
    if (table === "labs") html += field("openStart", "每日开放开始时间", r.openStart || "07:00", "time") + field("openEnd", "每日开放结束时间", r.openEnd || "18:00", "time");
    form(`${id ? "编辑" : "新增"}${M.tableNames[table]}`, html, "base.save", { table, id, ...(r.school || scope === "school" ? { school: s } : {}) });
  }
  let formRowSeq = 0;
  function itemRow(r = {}, receipt = false, locked = false) {
    const index = ++formRowSeq, f = (key, label, value, type = "text", options = null, required = true, extra = "") => field(`item-${index}-${key}`, label, value, type, options, required, `data-item="${key}" ${extra}`);
    let fields = f("classificationCode", "分类编号", r.classificationCode || "", "text", null, false, `maxlength="60" ${locked && r.classificationCode ? "readonly" : ""}`);
    fields += [["name", "名称", "text", ""], ["model", "规格", "text", ""], ["category", "分类", "text", "物理仪器"], ["unit", "单位", "text", "台"], ["qty", "数量", "number", 1], ["price", "单价（元）", "number", 0]].map(([key, label, type, initial]) => f(key, label, r[key] ?? initial, type, key === "category" ? M.categories : null, true, `${locked ? key === "category" ? "disabled" : "readonly" : ""} ${type === "number" ? `min="${key === "qty" ? 1 : 0}" step="${key === "qty" ? 1 : .01}"` : ""}`)).join("");
    fields += `<p class="help">总价：<output data-item-total>${money((r.qty ?? 1) * (r.price ?? 0))}</output> 元</p>`;
    if (receipt) fields += f("labId", "存放位置（房间）", r.labId || "", "text", [["", "使用单据默认位置"], ...opts("labs", own("labs"), lab => `${lab.room} · ${lab.name}`)], false);
    return `<fieldset class="full" data-item-row><legend>物品明细</legend><div class="form-grid">${fields}<div class="full">${locked ? "" : button("移除", "item-remove")}</div></div></fieldset>`;
  }
  function readItems() { return $$("[data-item-row]").map(row => Object.fromEntries($$("[data-item]", row).map(el => [el.dataset.item, el.value]))); }
  function updateItemTotals() { let total = 0; $$("[data-item-row]").forEach(row => { const value = Number($('[data-item="qty"]', row).value) * Number($('[data-item="price"]', row).value); $('[data-item-total]', row).textContent = Number.isFinite(value) ? money(value) : "—"; total += value; }); if ($('[data-order-total]')) $('[data-order-total]').textContent = Number.isFinite(total) ? money(total) : "—"; }
  function receiptFields() { return field("receiptNumber", "入库单号", "保存后自动生成", "text", null, false, "readonly") + field("operator", "经手人", actor.name, "text", null, false, "readonly") + field("labId", "默认存放位置（房间）", "", "text", opts("labs", own("labs"), lab => `${lab.room} · ${lab.name}`)) + field("supplier", "供应商", "华东教学仪器有限公司") + field("date", "登记日期", M.TODAY, "date") + field("purchaseDate", "购置日期", M.TODAY, "date") + field("nextMaintenance", "下次维保日期", "2027-02-28", "date") + field("note", "备注", "", "textarea", null, false, 'maxlength="500"'); }
  function purchaseForm(receipt = false, id) {
    const order = get("purchases", id);
    let html = receipt ? receiptFields() : field("purpose", "采购用途", "", "textarea") + field("date", "申请日期", M.TODAY, "date");
    html += `<div class="full"><h3>${order ? `采购单 ${h(order.id)} · 整单到货` : "物品明细"}</h3><div class="form-grid" id="itemRows" data-receipt="${receipt}">${(order?.items || [{}]).map(r => itemRow(r, receipt, !!order)).join("")}</div>${order ? "" : button("添加物品", "item-add")}<p>合计：<output data-order-total>${money((order?.items || []).reduce((n, i) => n + i.qty * i.price, 0))}</output> 元</p><p class="help">设备按单件生成唯一资产编号；耗材按存放位置入账。危化品入库待第二人复核后记账。采购单整单收货，数量与单价沿用审批结果。</p></div>`;
    openModal(receipt ? "到货验收入库" : "新建采购申请", fieldsForm(html), v => { const result = commit(receipt ? "receipt.create" : "purchase.create", { ...v, ...(order ? { purchaseId: id, placements: readItems() } : { items: readItems() }) }); closeModal(); render(); detail(receipt ? "receipts" : "purchases", result.id); toast("业务已保存，相关台账已同步。"); }, receipt ? "确认入库" : "提交申请");
  }
  function availablePlans() { return own("plans").filter(p => p.term === view.term && p.state !== "已完成" && (actor.role !== "teacher" || p.teacherId === actor.id) && !db.bookings.some(b => b.planId === p.id && M.activeBooking(b))); }
  function bookingRow(p) {
    const index = ++formRowSeq, e = get("catalog", p.catalogId), lab = own("labs").find(l => l.subject === e.subject && l.state === "可预约"), f = (key, label, value, type = "text", options = null, required = true, extra = "") => field(`booking-${index}-${key}`, label, value, type, options, required, `data-booking-key="${key}" ${extra}`);
    const resourceFields = [...own("assets").filter(a => a.state === "正常使用"), ...own("inventory").filter(i => i.stock > 0)].map(r => `<label class="resource-row"><span>${h(r.name)} <small>分类编号 ${h(r.classificationCode || "未登记")} · ${h(r.model || r.spec)} · 可用 ${r.stock ?? 1}${h(r.unit)}</small></span><input class="input" type="number" min="0" max="${r.stock ?? 1}" step="1" value="0" data-resource="${h(r.id)}" aria-label="${h(r.name)}预约数量"></label>`).join("");
    return `<fieldset class="full" data-booking-row><legend>班级／实验安排</legend><div class="form-grid">${f("planId", "班级实验计划", p.id, "text", opts("plans", availablePlans(), planLabel), true, 'data-booking-plan="true"')}<div class="full" data-plan-info>${planInfo(p)}</div>${f("labId", "实验室", lab?.id, "text", opts("labs", own("labs").filter(l => l.state === "可预约")))}${f("date", "实验日期", p.date, "date")}${f("start", "开始时间", "09:00", "time")}${f("end", "结束时间", "09:45", "time")}${f("period", "节次", "", "number", null, false, 'min="1" max="20" step="1"')}${f("groups", "分组数", 8, "number", null, true, 'min="1" step="1"')}${f("managerId", "实验管理员", lab?.managerId, "text", opts("staff", own("staff").filter(t => t.enabled && ["admin", "technician"].includes(t.role))))}<details class="full"><summary>补充实验仪器（填写所需数量）</summary>${resourceFields}</details><div class="full">${button("移除此安排", "booking-row-remove")}</div></div></fieldset>`;
  }
  function planInfo(p) { const e = get("catalog", p.catalogId); return miniTable(col("chapter:章节|name:实验名称|equipment:实验器材（含材料药品）|mode:实验类型|teacher:任课教师"), [{ ...e, mode: p.mode, teacher: name("staff", p.teacherId) }]); }
  function bookingForm(id) {
    const plans = availablePlans();
    if (!plans.length) throw new Error("当前身份在本学期暂无可预约计划。可先编制计划，或处理已有预约。");
    const p = plans.find(p => p.id === id) || plans[0];
    openModal("新增实验预约", fieldsForm(field("applicant", "预约人", actor.name, "text", null, false, "readonly") + field("bookedAt", "预约登记时间", new Date().toLocaleString("zh-CN"), "text", null, false, "readonly") + `<div class="full form-grid" id="bookingRows">${bookingRow(p)}</div><div class="full">${button("添加班级／实验安排", "booking-row-add")}</div>` + field("note", "备注（最多100字）", "", "textarea", null, false, 'maxlength="100"') + '<p class="help full">每行对应一个班级的一项实验；支持多实验、多班级同批提交。所有安排校验通过后才保存，逐项审批、准备和登记完成。</p>'), v => { const rows = $$("[data-booking-row]").map(row => ({ ...Object.fromEntries($$("[data-booking-key]", row).map(el => [el.dataset.bookingKey, el.value])), note: v.note, resources: $$("[data-resource]", row).filter(el => Number(el.value) > 0).map(el => ({ ref: el.dataset.resource, qty: Number(el.value) })) })); const result = commit("booking.batch", { rows }); closeModal(); render(); detail("bookings", result.id); toast(`已保存${result.ids.length}条实验安排。`); }, "提交预约");
  }
  function planForm() {
    const f = (key, label, value = "", type = "text", options = null, extra = "") => field(key, label, value, type, options, true, `data-plan-field="true" ${extra}`);
    form("编制班级实验计划", f("term", "学期", view.term, "text", opts("terms", db.terms)) + field("name", "计划名称", `${name("terms", view.term)}实验计划`) + f("grade", "选择年级", "", "text", [...new Set(own("classes").filter(c => actor.role !== "teacher" || c.teacherIds.includes(actor.id)).map(c => c.grade))]) + f("subject", "学科", "", "text", [...new Set(db.catalog.filter(e => actor.role !== "teacher" || e.subject === get("staff", actor.id).subject).map(e => e.subject))]) + f("version", "可选教材", "", "text", []) + f("catalogId", "实验名称", "", "text", []) + '<div class="full" id="planMetadata"></div>' + f("classId", "班级", "", "text", []) + f("teacherId", "任课教师", actor.role === "teacher" ? actor.id : "", "text", []) + f("mode", "实验类型", "分组", "text", ["分组", "演示"]) + f("week", "计划周次", 1, "number", null, 'min="1" step="1"') + f("date", "计划日期", get("terms", view.term).start, "date") + '<p class="help full">周次按学期起始日期所在周计算，周一为一周开始。教材、章节、器材来自实验目录；任课关系、学科、年级须一致。</p>', "plan.create");
    updatePlanFields("initial");
  }
  function setOptions(el, options) { const value = el.value; el.innerHTML = options.map(o => { const [v, label] = Array.isArray(o) ? o : [o, o]; return `<option value="${h(v)}">${h(label)}</option>`; }).join(""); if ([...el.options].some(o => o.value === value)) el.value = value; }
  function updatePlanFields(changed) {
    const formEl = $("#modalForm"), value = key => $(`[name="${key}"]`, formEl).value, input = key => $(`[name="${key}"]`, formEl), term = get("terms", value("term"));
    const catalog = db.catalog.filter(e => e.grade === value("grade") && e.subject === value("subject"));
    setOptions(input("version"), [...new Set(catalog.map(e => e.version))]);
    setOptions(input("catalogId"), opts("catalog", catalog.filter(e => e.version === value("version")), e => `${e.code} · ${e.name}`));
    const e = get("catalog", value("catalogId"));
    const classes = own("classes").filter(c => c.grade === value("grade") && (actor.role !== "teacher" || c.teacherIds.includes(actor.id)));
    setOptions(input("classId"), opts("classes", classes));
    const c = get("classes", value("classId"));
    setOptions(input("teacherId"), opts("staff", own("staff").filter(t => t.enabled && t.role === "teacher" && t.subject === e?.subject && c?.teacherIds.includes(t.id) && (actor.role !== "teacher" || t.id === actor.id))));
    $("#planMetadata").innerHTML = e ? miniTable(col("chapter:章节|equipment:实验器材（包括仪器材料药品）"), [e]) : '<p class="help">当前条件下没有实验目录，请先维护对应年级、学科和教材的实验。</p>';
    if (["initial", "grade", "subject", "version", "catalogId"].includes(changed) && e) input("mode").value = e.mode;
    input("date").min = term.start; input("date").max = term.end; input("week").max = M.weekOf(term, term.end);
    if (changed === "term" || value("date") < term.start || value("date") > term.end) input("date").value = term.start;
    if (changed === "week") { const week = Number(value("week")); if (!Number.isInteger(week) || week < 1 || week > Number(input("week").max)) return; input("date").value = M.weekDate(term, week); }
    if (value("date")) input("week").value = M.weekOf(term, value("date"));
  }
  function checkForm(taskId) {
    const task = get("tasks", taskId);
    form("实验室检查记录", field("labId", "检查实验室", task?.labId, "text", opts("labs", own("labs")), true, task ? "disabled" : "") + field("kind", "检查类型", task?.kind || "日常巡查") + field("date", "检查日期", M.TODAY, "date") + field("items", "检查项目", "消防设施、用电安全、化学品储存、应急设施", "textarea") + field("result", "检查结果", "正常", "text", ["正常", "发现隐患"], true, 'data-check-result="true"') + field("note", "检查说明", "", "textarea") + `<fieldset class="full" id="hazardFields" hidden disabled><legend>发现隐患后填写</legend><div class="form-grid">${field("title", "隐患描述")}${field("owner", "整改责任人", actor.name)}${field("level", "处置优先级", "一般关注", "text", ["一般关注", "需优先处理"])}${field("due", "整改期限", addDays(M.TODAY, 3), "date")}</div></fieldset>`, "check.create", task ? { taskId, labId: task.labId } : {}, "提交检查记录");
  }
  function repairForm(assetId) {
    const assets = own("assets").filter(a => a.state === "正常使用");
    if (!assets.length) throw new Error("暂无可申请处理的设备。");
    const selectedId = assetId || assets[0].id;
    openModal("设备维修／报废／维保申请", fieldsForm(`<fieldset class="full"><legend>选择设备（按设备编号，可多选）</legend>${assets.map(a => `<label class="check-field"><input name="assetIds" type="checkbox" value="${h(a.id)}" ${a.id === selectedId ? "checked" : ""}>${h(a.code)} · ${h(a.name)} · ${h(a.model)}</label>`).join("")}</fieldset><div class="full" id="repairAssetInfo"></div>` + field("kind", "申请类型", view.tab === "scrap" ? "报废" : view.tab === "plan" ? "维保" : "维修", "text", ["维修", "报废", "维保"]) + field("date", "报废／维修申请日期", M.TODAY, "date") + field("due", "期望处理日期", addDays(M.TODAY, db.settings.repairDays), "date") + field("reporter", "经办人", actor.name, "text", null, false, "readonly") + field("reason", "维修内容／报废原因", "", "textarea", null, true, 'maxlength="100"') + '<p class="help full">每个资产编号对应1件设备。批量提交生成关联处理单，逐件审批并留痕；维修日期和实际金额在完成维修时登记。</p>'), v => { const r = commit("repair.batch", { rows: v.assetIds.map(assetId => ({ assetId, kind: v.kind, date: v.date, due: v.due, reason: v.reason })) }); closeModal(); render(); detail("repairs", r.id); }, "提交申请");
    updateRepairInfo();
  }
    function updateRepairInfo() { $("#repairAssetInfo").innerHTML = miniTable(col("classificationCode:分类编号|code:设备编号|name:名称|model:规格|stock:现有数量|qty:处理数量|unit:单位|total:总价（元）|purchaseDate:购置日期|location:存放位置（房间）"), $$('[name="assetIds"]:checked').map(el => { const a = get("assets", el.value); return { ...a, classificationCode: a.classificationCode || "未登记", stock: 1, qty: 1, total: money(a.price), location: get("labs", a.labId)?.room || a.location || "未填写" }; })); }
  function updateFlowInfo() { const i = get("inventory", $("#f-itemId").value), qty = Number($("#f-qty").value); $("#flowItemInfo").innerHTML = i ? miniTable(col("classificationCode:分类编号|name:名称|spec:规格|unit:单位|unitPrice:登记单价（元）|total:总价（元）|location:存放位置（房间）"), [{ ...i, classificationCode: i.classificationCode || "未登记", unitPrice: i.unitPrice == null ? "未登记" : money(i.unitPrice), total: i.unitPrice == null ? "未登记单价" : money(qty * i.unitPrice), location: get("labs", i.labId)?.room || i.location || "未填写" }]) : ""; }
  function operation(action, id, table, kind) {
    const r = get(table, id) || {}, asset = get("assets", id), reason = (label = "处理说明", value = "") => field("reason", label, value, "textarea"), dateField = field("date", "业务日期", M.TODAY, "date"), fixed = { id };
    if (action === "asset-edit") return form("编辑资产档案", field("classificationCode", "分类编号", r.classificationCode || "", "text", null, false, 'maxlength="60"') + field("name", "设备名称", r.name) + field("model", "规格型号", r.model) + field("nextMaintenance", "下次维保日期", r.nextMaintenance, "date"), "asset.edit", fixed);
    if (action === "transfer") return form("校内设备调拨", field("labId", "目标存放位置（房间）", "", "text", opts("labs", own("labs").filter(l => l.id !== r.labId), lab => `${lab.room} · ${lab.name}`)) + dateField + reason("调拨原因"), "asset.transfer", fixed);
    if (action === "lend") return form("设备借用登记", field("borrower", "借用人/单位") + dateField + field("due", "应归还日期", addDays(M.TODAY, 7), "date") + reason("借用用途"), "asset.lend", fixed);
    if (action === "return") return form("确认设备归还", dateField + '<p class="help full">归还后资产恢复正常使用，保留借还履历。</p>', "loan.return", fixed);
    if (action === "count") return form("单件资产盘点", field("actual", "实盘数量（单件资产）", 1, "number", null, true, 'min="0" max="1"') + dateField + reason("盘点说明"), "asset.count", fixed);
    if (action === "count-resolve") return form("盘点差异复核", reason("差异处理依据（说明查找结果或关联报废单）"), "count.resolve", fixed);
    if (action === "repair-new") return repairForm(asset?.id);
    if (action === "repair-finish") return form("维修登记并提交验收", field("assetName", "仪器名称", name("assets", r.assetId), "text", null, false, "readonly") + field("qty", "维修数量", 1, "number", null, true, "readonly") + field("maintenanceDate", "维修日期", M.TODAY, "date") + field("vendor", "维修商", r.vendor || "", "text", null, false) + field("cost", "维修金额（元）", r.cost || 0, "number", null, true, 'min="0" step="0.01"') + field("reason", "维修内容（最多100字）", "", "textarea", null, true, 'maxlength="100"'), "repair.finish", fixed);
    if (action === "repair-accept") return form("设备验收", reason("验收意见") + field("nextMaintenance", "下次维保日期", addDays(M.TODAY, 180), "date"), "repair.accept", fixed);
    if (action === "purchase-cancel" || action === "repair-cancel") return form("确认撤销申请", reason("撤销原因"), action === "purchase-cancel" ? "purchase.cancel" : "repair.cancel", fixed, "确认撤销");
    if (action === "inventory-edit") return form("维护耗材档案", field("classificationCode", "分类编号", r.classificationCode || "", "text", null, false, 'maxlength="60"') + field("name", "物品名称", r.name) + field("spec", "规格", r.spec) + field("unit", "计量单位", r.unit || "盒") + field("unitPrice", "登记单价（元）", r.unitPrice ?? "", "number", null, false, 'min="0" step="0.01"') + field("min", "补库阈值", r.min ?? 10, "number", null, true, 'min="0"') + field("labId", "存放位置（房间）", r.labId, "text", opts("labs", own("labs"), lab => `${lab.room} · ${lab.name}`)) + field("expiry", "有效期（无则留空）", r.expiry || "", "date", null, false) + check("hazard", "按危化品管理（业务需双人复核）", r.hazard) + '<p class="help full">库存只通过业务流水调整。存放位置使用实验室房间；登记单价用于数量金额核对，不作财务成本核算；不清楚时留空。</p>', "inventory.save", fixed);
    if (action === "flow") { form("耗材库存业务登记", field("itemId", "物品", id, "text", opts("inventory", own("inventory"), i => `${i.name} · ${i.spec} · ${name("labs", i.labId)} / ${i.location} · 库存${i.stock}${i.unit}`)) + field("kind", "业务类型", kind || "领用", "text", actor.role === "teacher" ? ["领用"] : ["入库", "领用", "退回", "损耗", "处置"]) + field("qty", "数量", 1, "number", null, true, 'min="1"') + field("date", "损耗／业务日期", M.TODAY, "date") + '<div class="full" id="flowItemInfo"></div>' + field("planId", "关联教学计划（选填）", "", "text", [["", "不关联"], ...opts("plans", own("plans").filter(p => actor.role !== "teacher" || p.teacherId === actor.id), planLabel)], false) + reason("损耗原因／业务用途") + '<p class="help full">危化品业务及教师领用均须复核；同一人不能提交并复核。通过后才增减库存。</p>', "flow.create"); updateFlowInfo(); return; }
    if (action === "decide") {
      const command = { purchases: "purchase.decide", repairs: "repair.decide", flows: "flow.decide", bookings: "booking.decide", hazards: "hazard.verify" }[table]; if (!command) throw new Error("当前记录不支持审批。");
      return openModal(table === "hazards" ? "整改复查" : "业务审批/复核", fieldsForm(`<p class="help full">${h(M.tableNames[table])} · ${h(id)} · ${h(r.state)}；处理结果同步到原业务单。</p>` + field("outcome", "处理决定", "approve", "text", [["approve", "通过"], ["reject", table === "hazards" ? "退回继续整改" : "驳回"]]) + reason("审批/复核意见")), v => { commit(command, { id, approve: v.outcome === "approve", reason: v.reason }); closeModal(); render(); toast("处理结果已保存并同步。"); }, "确认处理");
    }
    if (action === "booking-prepare") return form("确认实验准备", reason("器材、耗材、设备与安全检查记录") + '<p class="help full">确认时重新校验资源可用性；实际耗材扣减另行登记领用单。</p>', "booking.prepare", fixed);
    if (action === "booking-complete") return form("实验完成登记", field("attendees", "实际参加人数", get("classes", get("plans", r.planId)?.classId)?.students || 1, "number", null, true, 'min="1"') + field("date", "实际完成日期", r.date || M.TODAY, "date") + reason("实验实施总结") + '<p class="help full">保存后关联班级计划记为已完成，学校及区级开出率同步更新；同一计划只计一次。</p>', "booking.complete", fixed, "确认完成并计入统计");
    if (action === "booking-cancel") return form("取消预约", reason("取消原因"), "booking.cancel", fixed);
    if (action === "hazard-submit") return form("提交整改复查", reason("整改措施及完成情况") + field("attachmentId", "关联整改附件", "", "text", opts("archives", own("archives").filter(f => f.relatedTable === "hazards" && f.relatedId === id))) + '<p class="help full">请先通过“整改附件”上传资料，再提交复查。</p>', "hazard.submit", fixed, "提交区级复查");
    if (action === "archive-confirm") return form("确认资料归档", `<p class="full">将“${h(r.name)}”纳入本校业务归档；原始文件内容保留。</p>`, "archive.confirm", fixed);
    if (action === "training") return form("培训记录登记", field("name", "培训名称") + dateField + field("hours", "培训学时", 4, "number", null, true, 'min="1" step="0.5"') + field("evidence", "证书或记录说明", "", "textarea"), "staff.training", fixed);
    if (action === "task-new") return form("下发专项检查任务", field("labId", "学校/实验室", "", "text", opts("labs", records("labs"), l => `${name("schools", l.school)} · ${l.name}`)) + field("kind", "检查类型", "开学专项检查") + field("due", "截止日期", addDays(M.TODAY, 3), "date") + field("owner", "学校责任人"), "task.create", {}, "下发任务");
    throw new Error("暂不支持该操作。");
  }
  function download(content, filename, mime = "text/plain;charset=utf-8") {
    if (!db.settings.exportEnabled) throw new Error("当前平台已关闭文件导出，请联系区级管理员在设置中开启。");
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime }), url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); toast(`已生成：${filename}，请查看浏览器下载。`);
  }
  function downloadableReport(title, html) {
    return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${h(title)}</title><style>body{font:14px/1.7 system-ui,sans-serif;max-width:1100px;margin:36px auto;padding:24px;color:#17221c}table{border-collapse:collapse;width:100%;margin:20px 0}td,th{border:1px solid #ddd;padding:9px;text-align:left}th{background:#f2f5f1}pre{white-space:pre-wrap}small,p{color:#4f6056}a{color:#2f6b4d}</style><h1>${h(title)}</h1><p>${h(school() ? name("schools", school()) : db.settings.region)} · ${h(name("terms", view.term))} · 统计日期 ${M.TODAY} · 数据版本 ${db.revision}</p>${html}<p>报告生成于当前业务台账，统计范围与口径见正文。</p></html>`;
  }
  function report(title, cols, rows, note = "") {
    const html = `<p class="help">${h(note)}</p>${miniTable(cols, rows)}`; downloadResult = { name: `${title}-${M.TODAY}.html`, content: downloadableReport(title, html) }; openModal(title, `${html}<div class="detail-actions">${button("下载报告（HTML）", "report-download", "", true)}</div>`);
  }
  function exportList() {
    const data = dataset(), rows = selected.size ? data.rows.filter(r => selected.has(r.id)) : data.rows;
    if (!rows.length) throw new Error("当前筛选或选中范围没有可导出记录。");
    const content = M.csv([data.columns.map(([, l]) => l), ...rows.map(r => data.columns.map(([k]) => r[k] ?? ""))]);
    download(content, `${M.tableNames[data.table] || "教学统计"}-${M.TODAY}.csv`, "text/csv;charset=utf-8");
  }
  function showReport(action) {
    if (action === "asset-report") return report("设备资产分析", col("name:学校|assets:设备数（含报废）|normal:正常使用|repair:维修中|value:在账原值（元）|labs:实验室数"), M.scoped(db, "schools", school()).map(s => ({ name: s.name, ...M.metrics(db, s.id, view.term) })), "资产编号唯一；在账原值不含已报废设备。点击台账记录可查看来源单据及处理履历。");
    if (action === "teaching-report") return report("实验教学完成报告", columns.report, M.teaching(db, school(), view.term, "school"), "按班级计划计次；仅已完成登记计为实开。必做与选做分列，演示与分组分列，汇总开出率使用总实开/总应开。");
    if (action === "repair-report") return report("设备处理统计", col("name:学校|pending:待审核|processing:处理中|acceptance:待验收|done:已完成|cost:实际费用（元）"), M.scoped(db, "schools", school()).map(s => { const rows = M.scoped(db, "repairs", s.id); return { name: s.name, pending: rows.filter(r => r.state === "待审核").length, processing: rows.filter(r => r.state === "处理中").length, acceptance: rows.filter(r => r.state === "待验收").length, done: rows.filter(r => r.state === "已完成").length, cost: money(rows.reduce((n, r) => n + (r.cost || 0), 0)) }; }), "维修、维保、报废按真实处理状态汇总，费用来自已登记的处理单。");
    if (action === "training-report") return report("人员培训记录与待办", col("name:人员|schoolName:学校|roleName:角色|qualification:资质|trainingCount:培训记录|next:后续工作"), records("staff").filter(t => t.enabled).map(t => ({ ...decorate("staff", t), next: t.trainings.length ? "已登记；可补充证书附件" : "待补录培训记录" })), "培训记录为空时请补充登记；本页不承担个人合规判定；培训不设置行政审批流程。");
    if (action === "risk-report") return report("耗材风险提示", col("name:物品|schoolName:学校|stockText:当前库存|minText:补库阈值|expiry:有效期|risk:提示"), records("inventory").filter(i => i.stock < i.min || (i.expiry && i.expiry <= addDays(M.TODAY, 30))).map(i => ({ ...decorate("inventory", i), risk: [i.stock < i.min ? "库存低于阈值" : "", i.expiry && i.expiry < M.TODAY ? "已过期" : i.expiry && i.expiry <= addDays(M.TODAY, 30) ? "30天内到期" : ""].filter(Boolean).join("；") })), "根据当前库存、物品有效期及统计日期计算；不是外部安全评级。");
  }
  function importForm() {
    importResult = null;
    openModal("模板导入并生成入库单", fieldsForm(`<div class="full"><p class="help">使用UTF-8 CSV（Excel可另存为CSV UTF-8），1—30行、总量不超过100件。先校验预览，再确认入库；不会覆盖已有资产。</p><div class="inline-actions">${button("下载CSV模板", "template-download")}${button("填入内容", "import-example")}</div><label class="field"><span class="field-label">选择CSV文件</span><input type="file" id="importFile" accept=".csv,text/csv"></label></div>` + field("source", "模板内容", "", "textarea", null, true, 'rows="6"') + `<div class="full">${button("校验并预览", "import-preview")}<div id="importPreview" aria-live="polite"></div></div>` + receiptFields()), v => { const validation = M.validateImport(v.source); if (validation.errors.length) throw new Error(validation.errors.join("\n")); if (!importResult || importResult.source !== v.source) throw new Error("请先校验当前内容并确认预览。"); const result = commit("receipt.create", { ...v, items: validation.items }); closeModal(); render(); detail("receipts", result.id); }, "确认导入入库");
  }
  function attachmentForm(table, id) {
    pendingFile = null;
    const allowedTables = ["assets", "purchases", "repairs", "plans", "bookings", "checks", "hazards", "staff", "receipts"];
    const candidates = allowedTables.flatMap(t => own(t).filter(r => actor.role !== "teacher" || (t === "staff" && r.id === actor.id) || r.teacherId === actor.id || r.reporter === actor.name).map(r => [`${t}|${r.id}`, `${M.tableNames[t]} · ${r.name || r.title || r.id}`]));
    if (!candidates.length) throw new Error("当前身份暂无可关联业务资料。");
    const category = ["checks", "hazards"].includes(table) ? "安全管理" : table === "staff" ? "师资培训" : ["plans", "bookings"].includes(table) ? "实验教学" : "设备建设";
    openModal("上传/生成业务附件", fieldsForm(field("related", "关联业务", table && id ? `${table}|${id}` : candidates[0][0], "text", candidates) + field("category", "资料分类", category, "text", ["实验教学", "安全管理", "师资培训", "设备建设"]) + `<div class="full"><label class="field"><span class="field-label">上传原始文件（最大512KB）</span><input type="file" id="attachmentFile" accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx"></label><p class="help" id="fileStatus">请勿上传真实敏感资料。未上传文件时，可填写文本内容并保存为TXT。</p>${button("生成关联业务说明", "attachment-example")}</div>` + field("name", "保存文件名", "业务说明.txt") + field("content", "文本附件内容（上传文件后无需填写）", "", "textarea", null, false, 'rows="6"') + check("archive", "同时确认归档", actor.role !== "teacher")), v => { const [relatedTable, relatedId] = v.related.split("|"); if (pendingFile && v.name !== pendingFile.name) throw new Error("上传文件须保留原文件名；如需文本内容，请点击生成业务说明。"); const result = commit("archive.create", { ...v, relatedTable, relatedId, ...(pendingFile || { mime: "text/plain;charset=utf-8" }), archive: actor.role !== "teacher" && v.archive }); closeModal(); render(); detail("archives", result.id); }, "保存附件");
  }
  function fileDownload(id) { const f = get("archives", id); if (!f || (scope !== "district" && f.school !== actor.school)) throw new Error("文件不在当前范围。"); if (f.dataUrl) { const [header, encoded] = f.dataUrl.split(","), bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0)); download(new Blob([bytes], { type: header.slice(5).split(";")[0] }), f.name); } else download(f.content, f.name, f.mime); }
  function batchArchives() {
    const rows = dataset().rows.filter(r => !selected.size || selected.has(r.id)); if (!rows.length) throw new Error("当前范围没有资料。");
    const html = `<p>包含${rows.length}份当前范围资料。文本直接阅读；原始附件点击链接保存。此离线资料包可在浏览器打开。</p>` + rows.map(f => { const url = f.dataUrl || `data:${f.mime},${encodeURIComponent(f.content)}`; return `<section><h2>${h(f.name)}</h2><p>${h(f.category)} · ${h(f.relatedName)}</p><a href="${h(url)}" download="${h(f.name)}">保存原文件</a>${f.content ? `<pre>${h(f.content)}</pre>` : ""}</section>`; }).join("");
    download(downloadableReport("业务资料包", html), `业务资料包-${M.TODAY}.html`, "text/html;charset=utf-8");
  }
  function batchApproval() {
    const data = dataset(); if (!["purchases", "repairs"].includes(data.table)) throw new Error("请进入采购或设备申请列表。"); const rows = data.rows.filter(r => selected.has(r.id) && r.state === "待审核");
    if (!rows.length) throw new Error("请先勾选至少一条待审核记录。");
    openModal("批量审批", fieldsForm(`<p class="full">将处理选中的 ${rows.length} 条待审核记录；非待审核记录不处理。</p>${miniTable(data.columns, rows)}${field("outcome", "处理决定", "approve", "text", [["approve", "通过"], ["reject", "驳回"]])}${field("reason", "统一审批意见", "", "textarea")}`), v => {
      if (persistenceError) throw new Error(persistenceError); let next = JSON.parse(localStorage.getItem(M.KEY)); if (next.revision !== modalRevision) throw new Error("数据已更新，请关闭后重新选择。");
      rows.forEach(r => { next = M.transact(next, actor, data.table === "purchases" ? "purchase.decide" : "repair.decide", { id: r.id, approve: v.outcome === "approve", reason: v.reason }).db; });
      localStorage.setItem(M.KEY, JSON.stringify(next)); db = next; selected.clear(); closeModal(); render(); toast(`已完成${rows.length}条审批，逐条留有处理轨迹。`);
    }, "确认批量处理");
  }
  function settingsView() {
    const s = db.settings;
    return `${tabsMarkup()}<section class="panel settings-panel"><h2>平台参数</h2><p class="help">设置即时影响各业务页面；提醒仅在工作台展示，不发送短信、邮件，也不会后台调度。</p><form id="settingsForm" class="form-grid">${field("region", "区域名称", s.region)}${field("authority", "主管单位", s.authority)}${field("repairDays", "维修/维保提前提醒天数", s.repairDays, "number", null, true, 'min="1"')}${check("lowStock", "工作台显示库存不足提醒", s.lowStock)}${check("weeklyReport", "工作台显示教学周报入口", s.weeklyReport)}${check("syncReminder", "学校工作台显示数据上报提醒", s.syncReminder)}${check("exportEnabled", "允许文件导出和下载", s.exportEnabled)}<div class="full"><button class="button primary" type="submit">保存设置</button></div></form></section>`;
  }
  function dashboard() {
    const m = M.metrics(db, school(), view.term), tiles = scope === "district" ? [["纳入学校", M.scoped(db, "schools", school()).length, "所"], ["在账设备原值", money(m.value), "元"], ["必做实验开出率", m.rate, `${m.done}/${m.required}次`], ["待闭环隐患", m.hazards - m.closed, "项"]] : [["设备资产", m.assets, "件（含报废）"], ["待完成必做实验", m.pending, "次"], ["库存不足", m.low, "种"], ["待闭环隐患", m.hazards - m.closed, "项"]];
    const tasks = [];
    if (scope === "district") { records("purchases").filter(r => r.state === "待审核").forEach(r => tasks.push(["采购待审核", "purchases", r])); records("repairs").filter(r => r.state === "待审核").forEach(r => tasks.push([`${r.kind}待审核`, "repairs", r])); records("hazards").filter(r => r.state === "待复查").forEach(r => tasks.push(["整改待复查", "hazards", r])); }
    else { records("bookings").filter(r => get("plans", r.planId)?.term === view.term && M.activeBooking(r) && (actor.role !== "teacher" || r.teacherId === actor.id)).forEach(r => tasks.push([`实验${r.state}`, "bookings", r])); if (actor.role !== "teacher") { records("tasks").filter(r => r.state === "待检查").forEach(r => tasks.push(["检查待填报", "tasks", r])); records("flows").filter(r => r.state === "待复核").forEach(r => tasks.push(["库存待复核", "flows", r])); records("hazards").filter(r => r.state !== "已关闭").forEach(r => tasks.push(["隐患待闭环", "hazards", r])); } }
    const attention = [ ...records("repairs").filter(r => ["待审核", "处理中", "待验收"].includes(r.state) && r.due <= addDays(M.TODAY, db.settings.repairDays)).map(r => ["设备处理临期", "repairs", r]), ...records("assets").filter(a => a.state === "正常使用" && a.nextMaintenance <= addDays(M.TODAY, db.settings.repairDays)).map(r => ["设备维保提醒", "assets", r]), ...(db.settings.lowStock ? records("inventory").filter(i => i.stock < i.min).map(r => ["库存低于阈值", "inventory", r]) : []) ];
    const queue = rows => rows.length ? rows.slice(0, 8).map(([label, table, r]) => `<div class="list-item"><span class="list-mark ${table === "hazards" ? "danger" : "warning"}" aria-hidden="true">${h(label.slice(0, 1))}</span><div><div class="list-title">${h(label)}</div><div class="list-desc">${h(r.title || r.name || (r.planId ? planLabel(get("plans", r.planId)) : r.id))} · ${h(name("schools", r.school))}</div></div>${button("查看处理", "detail", `data-table="${table}" data-id="${h(r.id)}"`)}</div>`).join("") : '<div class="empty-message">当前范围暂无待办。</div>';
    return `<div class="metrics-grid">${tiles.map(([label, value, unit], i) => `<section class="metric${i === 0 ? " featured" : ""}"><div><span class="metric-label">${label}</span><div class="metric-value">${value}</div><div class="metric-meta">${unit}</div></div>${i === 0 ? `<div class="metric-index" aria-hidden="true"><span>${scope === "district" ? "区域" : "资产"}</span></div>` : ""}</section>`).join("")}</div><div class="dashboard-grid"><section class="panel"><div class="panel-header"><h2 class="panel-title">业务待办 <small>${tasks.length}项</small></h2></div><div class="panel-body">${queue(tasks)}${tasks.length > 8 ? '<p class="help">此处显示前8项，完整记录见对应业务列表。</p>' : ""}</div></section><section class="panel"><div class="panel-header"><h2 class="panel-title">运行提醒 <small>${attention.length}项</small></h2></div><div class="panel-body">${queue(attention)}</div></section></div><section class="panel"><div class="panel-header"><h2 class="panel-title">教学执行情况</h2></div><div class="panel-body">${miniTable(columns.report, M.teaching(db, school(), view.term, scope === "district" ? "school" : "subject"))}<div class="detail-actions">${button("查看完成统计", "teaching-report")}${db.settings.weeklyReport ? button("生成本周教学周报", "weekly-report") : ""}${scope === "school" ? button("上报本学期数据", "submission", "", true, permit("admin")) : ""}</div>${scope === "school" && db.settings.syncReminder ? '<p class="help">台账变更实时反映在区域管理页面；“数据上报”另存一份具备版本号的提交快照，便于核对。</p>' : ""}</div></section>`;
  }
  function aiView() {
    return `<div class="ai-layout"><section class="ai-chat"><div class="ai-messages"><div class="message"><span class="message-avatar" aria-hidden="true">AI</span><div class="message-bubble">可以查询设备、耗材、教学完成、安全、维修和培训记录。结果来自当前学校范围及学期台账。</div></div><div id="aiResult" aria-live="polite"><p class="help">输入问题后展示可核对的明细与统计口径。</p></div></div><div class="ai-compose"><form id="askForm" class="compose-row"><input class="input" name="question" placeholder="例如：哪些耗材需要补库？" required aria-label="输入台账问题"><button type="submit" class="button primary">查询</button></form></div></section><aside class="ai-side"><section class="topic-card"><h2 class="topic-title">常用问题</h2><div class="topic-list">${["设备有多少，原值是多少？", "哪些耗材库存不足？", "本学期必做实验完成情况？", "还有哪些安全隐患未关闭？"].map(q => `<button type="button" class="topic-button" data-action="ask-example" data-question="${h(q)}">${h(q)}</button>`).join("")}</div></section><section class="topic-card"><h2 class="topic-title">支持查询</h2><p class="help">支持设备、库存、教学、安全、维修和培训查询；未知问题会说明能力边界，可下载已生成的查询结果。</p></section></aside></div>`;
  }
  function ask(question) {
    let table, rows, answer; const m = M.metrics(db, school(), view.term);
    if (/耗材|库存|补库|危化/.test(question)) { table = "inventory"; rows = records(table).filter(i => /不足|低|补库/.test(question) ? i.stock < i.min : /危化/.test(question) ? i.hazard : true); answer = `匹配${rows.length}种物品；当前范围库存低于阈值的共${m.low}种。`; }
    else if (/隐患|安全|整改|检查/.test(question)) { table = "hazards"; rows = records(table).filter(r => /未|待|还有/.test(question) ? r.state !== "已关闭" : true); answer = `已记录${m.hazards}项隐患，已关闭${m.closed}项，闭环率${m.closure}。`; }
    else if (/维修|报修|报废|维保/.test(question)) { table = "repairs"; rows = records(table); answer = `当前范围有${rows.length}条设备处理记录。`; }
    else if (/教师|人员|培训|实验员/.test(question)) { table = "staff"; rows = records(table).filter(r => r.enabled && (!/未培训|待培训/.test(question) || !r.trainings.length)); answer = `启用人员${m.staff}人，其中实验员${m.technicians}人。`; }
    else if (/教学|完成|开出|应开|实开|实验计划/.test(question)) { table = "report"; rows = M.teaching(db, school(), view.term, "school"); answer = `必做实验应开${m.required}次、实开${m.done}次，开出率${m.rate}。按班级计划计次，不以实验目录条数作分母。`; }
    else if (/设备|资产|原值/.test(question)) { table = "assets"; rows = records(table); answer = `设备${m.assets}件（含报废），正常使用${m.normal}件，在账原值${money(m.value)}元（不含报废）。`; }
    else { $("#aiResult").innerHTML = '<div class="query-answer"><strong>暂不支持此类问题。</strong><p>可以查询设备数量、库存不足、教学完成、安全隐患、维修记录或人员培训。</p></div>'; return; }
    const shown = table === "report" ? rows : rows.map(r => decorate(table, r)), html = `<div class="query-answer"><h3>${h(question)}</h3><p>${h(answer)}</p><p class="help">来源：${h(M.tableNames[table] || "教学计划与完成登记")} · 范围：${h(school() ? name("schools", school()) : "全部学校")} · 学期：${h(name("terms", view.term))} · 版本：${db.revision} · 统计日期：${M.TODAY}</p>${miniTable(columns[table], shown)}${button("下载问数结果（HTML）", "report-download")}</div>`;
    downloadResult = { name: `智能问数结果-${M.TODAY}.html`, content: downloadableReport("智能问数 · 查询结果", html.replace(/<button[\s\S]*?<\/button>/g, "")) }; $("#aiResult").innerHTML = html;
  }
  const descriptions = { dashboard: "待办、异常与教学执行情况集中查看。", schools: "维护学校和实验室档案，核对学校上报的数据快照。", teachers: "维护任课关系、实验员配置、资质与培训记录。", staff: "管理本校人员、岗位与培训资料。", labs: "完善房间、容量、设施、责任人及班级任课关系。", equipment: "统一编号的单件资产台账，支持来源追溯和统计分析。", devices: "采购申请、到货入库、资产调拨、借还与盘点。", consumables: "掌握学校库存、危化品流水与补库风险。", supplies: "按流水管理库存，危化品及教师领用经复核后记账。", maintenance: "处理采购与设备申请，查看维修、报废及维保记录。", repair: "故障上报、处理、验收与资产状态同步。", experiments: "统一实验目录，按班级、学期编制计划并登记完成情况。", schedule: "以班级计划和完成登记为依据，核对各校教学执行情况。", booking: "预约实验室与器材，安排准备工作并登记教学结果。", safety: "检查任务、隐患整改、证据附件与区级复查相互关联。", inspections: "检查任务、隐患整改、证据附件与区级复查相互关联。", archives: "保存原始附件或文本说明，并关联到具体业务记录。", settings: "维护基础数据、平台参数和可追溯的操作日志。", "ai-query": "用自然语言查询当前范围的业务台账。" };
  function identityFields() {
    return field("school", "学校", actor.school || identity.school || "S1", "text", opts("schools", db.schools), true, 'data-identity-school="true"') + field("personId", "学校角色账号", actor.id, "text", opts("staff", db.staff.filter(t => t.enabled && t.school === (actor.school || identity.school || "S1")), t => `${t.name} · ${M.roles[t.role]} · ${t.subject}`));
  }
  function demoControl() {
    openModal("系统控制", fieldsForm(`<p class="help full">仅此处切换身份。操作范围根据所选角色和学校确定。</p>` + identityFields() + `<div class="full inline-actions">${button("进入区级管理员端", "district-login")}${button("备份当前数据（JSON）", "backup")}${button("恢复初始数据", "reset-confirm")}<a class="button" href="../../preview.html" target="_blank" rel="noopener">页面总览与尺寸预览</a></div>`), v => enterSchool(v.school, v.personId), "切换至所选学校账号");
  }
  function enterSchool(s, personId) { const person = get("staff", personId); if (!person?.enabled || person.school !== s) throw new Error("请选择该校启用账号。"); savePref("lab-demo-identity", { role: person.role, school: s, personId }); location.href = scope === "login" ? "pages/school/dashboard.html" : "../school/dashboard.html"; }
  function enterDistrict() { savePref("lab-demo-identity", { ...identity, role: "district" }); location.href = scope === "login" ? "pages/district/dashboard.html" : "../district/dashboard.html"; }
  function renderLogin() {
    app.innerHTML = `<main class="login-page"><section class="login-intro"><div class="login-brand"><span class="brand-mark">实验</span><strong>实验教学与资源管理</strong></div><div class="login-message"><h1>让实验教学<br>有据可查。</h1><p>从一间实验室的日常运行，到区域实验教学与资源的协同管理。</p></div><div class="login-proof"><div class="proof-item"><div class="proof-value">${db.schools.length}</div><div class="proof-label">接入学校</div></div><div class="proof-item"><div class="proof-value">${db.labs.length}</div><div class="proof-label">实验室数量</div></div><div class="proof-item"><div class="proof-value">区校</div><div class="proof-label">协同业务流程</div></div></div></section><section class="login-form-wrap"><div class="login-card"><h2>选择工作身份</h2><p>学校端按管理员、任课教师、实验员区分操作权限。</p><form id="loginForm" class="login-form">${identityFields()}<button class="button primary login-submit" type="submit">进入学校工作台</button>${button("进入区级管理员端", "district-login")}</form><div class="login-help"><span>业务台账</span></div><p class="help">请选择已有身份进入系统；修改后可在各业务页面继续查看。</p>${persistenceError ? `<p class="form-error">${h(persistenceError)}</p>${button("恢复数据", "reset-confirm")}` : ""}</div></section></main>${modalShell()}`;
  }
  function modalShell() { return `<div class="modal-backdrop" id="modalBackdrop" aria-hidden="true"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><header class="modal-head"><h2 id="modalTitle"></h2><button class="modal-close" type="button" id="modalClose" data-action="close" aria-label="关闭对话框">×</button></header><div class="modal-body" id="modalBody"></div><footer class="modal-foot" id="modalFoot"></footer></section></div><div class="toast-region" id="toastRegion" role="status" aria-live="polite"></div>`; }
  function render() {
    if (scope === "login") return renderLogin();
    const nav = M.navigation[scope], current = nav.flatMap(g => g.items).find(i => i.id === (pageId === "inspections" ? "safety" : pageId)), title = current?.label || "业务工作台";
    const data = ["dashboard", "ai-query"].includes(pageId) ? null : dataset();
    document.title = `${title} | 实验教学与资源管理`;
    app.innerHTML = `<div class="app-shell"><aside class="rail"><a class="rail-brand" href="dashboard.html"><span class="brand-mark">实验</span><div><strong class="brand-title">实验教学与资源管理</strong><small class="brand-subtitle">${scope === "district" ? "区域监管端" : "学校业务端"}</small></div></a><nav class="rail-nav" aria-label="主导航">${nav.map(g => `<section class="nav-group"><div class="nav-group-label">${h(g.label)}</div>${g.items.map(i => `<a class="nav-link ${i.id === current?.id ? "active" : ""}" href="${i.href}" ${i.id === current?.id ? 'aria-current="page"' : ""}><span class="nav-mark">${h(i.mark)}</span><span class="nav-text">${h(i.label)}</span></a>`).join("")}</section>`).join("")}</nav><footer class="rail-footer"><div class="identity-card"><span class="identity-avatar" aria-hidden="true">${h(actor.name.slice(0, 1))}</span><div><div class="identity-name">${h(actor.name)}</div><div class="identity-role">${h(M.roles[actor.role])}</div></div></div><div class="identity-role">${scope === "district" ? h(db.settings.authority) : h(name("schools", actor.school))}</div></footer></aside><main class="app-main"><header class="app-topbar"><div class="breadcrumb">${scope === "district" ? h(db.settings.region) : h(name("schools", actor.school))}<span> / </span>${h(title)}</div><div class="topbar-actions">${button("系统控制", "demo-control")}</div></header>${persistenceError ? `<div class="storage-warning" role="alert">${h(persistenceError)}</div>` : ""}<div class="page"><header class="page-header"><div class="page-heading"><div class="page-heading-row"><h1 class="page-title">${h(title)}</h1><p class="page-kicker">${scope === "district" ? "区域监管" : "学校业务"}</p></div><p class="page-description">${h(descriptions[pageId] || "")}</p></div>${data && data.table !== "settings" ? `<div class="page-actions">${actionsFor(data.table)}</div>` : ""}</header><div class="context-bar">${scope === "district" ? field("scopeSchool", "学校范围", view.school, "text", [["", "全部学校"], ...opts("schools", db.schools)], false, 'data-context="school"') : `<span class="scope-label">${h(name("schools", actor.school))} · ${h(M.roles[actor.role])}</span>`}${field("scopeTerm", "学期", view.term, "text", opts("terms", db.terms), true, 'data-context="term"')}</div>${pageId === "dashboard" ? dashboard() : pageId === "ai-query" ? aiView() : listView(data)}<footer class="page-footnote">当前页面与各项统计共用同一套业务台账。设备、耗材和安全记录为当前台账；教学指标按所选学期统计。</footer></div></main></div>${modalShell()}`;
  }
  function handleAction(el) {
    const { action, id, table, kind } = el.dataset;
    if (action === "close") return closeModal();
    if (action === "detail") return detail(table, id);
    if (action === "base-edit") return baseForm(table, id);
    if (action === "tab") { Object.assign(view, { tab: el.dataset.tab, page: 1, state: "", subject: "", grade: "", keyword: "", classId: "", teacherId: "", labId: "", ...(pageId === "booking" ? {} : { date: "" }) }); selected.clear(); render(); return; }
    if (action === "page-prev" || action === "page-next") { view.page += action === "page-prev" ? -1 : 1; render(); return; }
    if (action === "filter-reset") { Object.assign(view, { keyword: "", state: "", subject: "", grade: "", classId: "", teacherId: "", labId: "", date: "", page: 1 }); selected.clear(); render(); return; }
    if (action === "date" || action === "all-dates") { view.date = el.dataset.date || ""; view.page = 1; selected.clear(); render(); return; }
    if (["week-prev", "week-next", "today"].includes(action)) { view.week = action === "today" ? M.TODAY : addDays(view.week, action === "week-prev" ? -7 : 7); view.date = ""; view.page = 1; render(); return; }
    if (action === "my-bookings") { view.tab = "mine"; view.page = 1; selected.clear(); render(); return; }
    if (action === "purchase-new" || action === "receipt") return purchaseForm(action === "receipt", id);
    if (action === "item-add") { if ($$("[data-item-row]").length >= 30) throw new Error("最多30条明细。"); $("#itemRows").insertAdjacentHTML("beforeend", itemRow({}, $("#itemRows").dataset.receipt === "true")); updateItemTotals(); return; }
    if (action === "item-remove") { if ($$("[data-item-row]").length === 1) throw new Error("至少保留一条明细。"); el.closest("[data-item-row]").remove(); updateItemTotals(); return; }
    if (action === "booking-row-add") { if ($$("[data-booking-row]").length >= 30) throw new Error("最多30条安排。"); const selected = $$('[data-booking-key="planId"]').map(el => el.value), p = availablePlans().find(p => !selected.includes(p.id)); if (!p) throw new Error("可预约计划已全部加入，请先编制其他班级或实验的计划。"); $("#bookingRows").insertAdjacentHTML("beforeend", bookingRow(p)); return; }
    if (action === "booking-row-remove") { if ($$("[data-booking-row]").length === 1) throw new Error("至少保留一条实验安排。"); el.closest("[data-booking-row]").remove(); return; }
    if (action === "booking-new") return bookingForm(table === "plans" ? id : "");
    if (action === "plan-new") return planForm();
    if (action === "check-new") return checkForm(table === "tasks" ? id : "");
    if (["asset-report", "repair-report", "teaching-report", "training-report", "risk-report"].includes(action)) return showReport(action);
    if (action === "report-plans") { const r = dataset().rows.find(r => r.name === el.dataset.name); return report(`${r.name} · 班级计划`, columns.plans, r.plans.map(id => decorate("plans", get("plans", id))), "此明细为所选统计行的分子/分母来源。"); }
    if (action === "report-download") { if (!downloadResult) throw new Error("请先生成报告。"); return download(downloadResult.content, downloadResult.name, "text/html;charset=utf-8"); }
    if (action === "weekly-report") { const d = new Date(`${M.TODAY}T12:00:00Z`).getUTCDay(), start = addDays(M.TODAY, -(d + 6) % 7), end = addDays(start, 6); return report("本周实验教学周报", columns.plans, records("plans").filter(p => p.term === view.term && p.date >= start && p.date <= end).map(r => decorate("plans", r)), `统计日期所在周：${start}至${end}；按计划日期筛选，不含其他周。`); }
    if (action === "export") return exportList();
    if (action === "file-download") return fileDownload(id);
    if (action === "archive-batch") return batchArchives();
    if (action === "batch") return batchApproval();
    if (action === "import") return importForm();
    if (action === "template-download") return download(M.csv([M.extendedImportHeader, ["光学显微镜", "XSP-16A", "生物仪器", "台", 2, 3580, "", "", ""]]), "设备耗材入库模板.csv", "text/csv;charset=utf-8");
    if (action === "import-example") { $("#f-source").value = M.csv([M.extendedImportHeader, ["光学显微镜", "XSP-16A", "生物仪器", "台", 2, 3580, "", "", ""]]); importResult = null; $("#importPreview").textContent = "内容已填入，请校验预览。"; return; }
    if (action === "import-preview") { importResult = null; const source = $("#f-source").value, result = M.validateImport(source); result.items.forEach((i, index) => { if (i.labId && !own("labs").some(l => l.id === i.labId)) result.errors.push(`第${index + 2}行：实验室编号不属于本校。`); }); $("#importPreview").innerHTML = result.errors.length ? `<p class="form-error">${result.errors.map(h).join("<br>")}</p>` : `<p class="success-copy">校验通过：${result.items.length}条明细，共${result.items.reduce((n, i) => n + i.qty, 0)}件。存放位置留空时使用单据默认值。</p>${miniTable(col("classificationCode:分类编号|name:名称|model:规格|category:分类|qty:数量|unit:单位|price:单价|labId:实验室编号|location:存放位置（房间）"), result.items)}`; if (!result.errors.length) importResult = { source }; return; }
    if (action === "attachment") return attachmentForm(table, id);
    if (action === "attachment-example") { const [t, key] = $("#f-related").value.split("|"), r = get(t, key); pendingFile = null; $("#attachmentFile").value = ""; $("#f-name").value = `${M.tableNames[t]}-${key}-业务说明.txt`; $("#f-content").value = `业务说明材料\n关联业务：${M.tableNames[t]} ${key}\n学校：${name("schools", r.school)}\n统计日期：${M.TODAY}\n当前状态：${r.state || r.result || "已登记"}\n说明：${t === "hazards" ? "已完成锁具更换及现场检查，申请复查。" : r.title || r.name || "用于记录资料关联与业务处理。"}\n请根据当前业务补充说明。`; $("#fileStatus").textContent = "已生成TXT内容；可修改后保存。"; return; }
    if (action === "asset-label") { const r = get("assets", id); return report("资产标识卡", col("label:字段|value:内容"), [["资产编号", r.code], ["设备名称", r.name], ["规格型号", r.model], ["学校", name("schools", r.school)], ["存放位置（房间）", get("labs", r.labId)?.room || r.location || "未填写"]].map(([label, value]) => ({ label, value })), "编号文本标识卡，可下载后打印；资产查询支持手输编号或外接扫码枪。此卡不伪装成可扫描条码。"); }
    if (action === "ask-example") { $("#askForm [name=question]").value = el.dataset.question; return ask(el.dataset.question); }
    if (action === "submission") return form("上报本学期台账快照", `<p class="full">保存${h(name("schools", actor.school))}在${h(name("terms", view.term))}的当前指标快照（版本${db.revision}）。区级学校管理可查看，后续修改不覆盖本次快照。</p>`, "submission.create", { term: view.term }, "确认上报");
    if (action === "demo-control") return demoControl();
    if (action === "district-login") return enterDistrict();
    if (action === "backup") { const raw = localStorage.getItem(M.KEY); const blob = new Blob([raw || JSON.stringify(db)], { type: "application/json" }); return download(blob, `实验管理备份-v${db.revision}.json`); }
    if (action === "reset-confirm") return openModal("恢复初始数据", fieldsForm('<p class="full">此操作将清除本系统的业务修改和附件，恢复后无法撤销；建议先备份当前数据。</p><div class="full">' + button("先下载备份", "backup") + '</div>' + field("confirm", "输入“恢复数据”确认")), v => { if (v.confirm !== "恢复数据") throw new Error("请输入“恢复数据”确认。"); const next = M.seed(); localStorage.setItem(M.KEY, JSON.stringify(next)); db = next; persistenceError = ""; identity = { role: "admin", school: "S1" }; savePref("lab-demo-identity", identity); actor = M.actorFor(db, scope === "district" ? "district" : "admin", "S1"); selected.clear(); closeModal(); render(); toast("已恢复初始数据；此前修改仅能从已下载备份中找回。"); }, "确认恢复");
    return operation(action, id, table, kind);
  }
  function showError(error) { const box = $("#formError"); if ($("#modalBackdrop.open") && box) { box.textContent = error.message || String(error); box.scrollIntoView?.({ block: "nearest" }); } else toast(error.message || String(error)); }
  document.addEventListener("click", event => { const el = event.target.closest("[data-action]"); if (el && !el.disabled) { try { handleAction(el); } catch (e) { showError(e); } } if (event.target.id === "modalBackdrop") closeModal(); });
  document.addEventListener("submit", event => {
    const formEl = event.target; if (!["modalForm", "filterForm", "settingsForm", "loginForm", "scanForm", "askForm"].includes(formEl.id)) return; event.preventDefault();
    try {
      if (!formEl.reportValidity()) return; const v = valuesOf(formEl);
      if (formEl.id === "modalForm") { $("#formError").textContent = ""; modalSubmit?.(v); }
      if (formEl.id === "filterForm") { Object.assign(view, v, { page: 1 }); selected.clear(); render(); }
      if (formEl.id === "settingsForm") { commit("settings.save", v, db.revision); render(); toast("设置已保存，提醒与导出权限已更新。"); }
      if (formEl.id === "loginForm") enterSchool(v.school, v.personId);
      if (formEl.id === "scanForm") { const asset = records("assets").find(a => a.code.toLowerCase() === v.code.trim().toLowerCase() || a.id.toLowerCase() === v.code.trim().toLowerCase()); if (!asset) throw new Error("当前学校范围未找到该编号，请核对资产标签或学校筛选。"); detail("assets", asset.id); }
      if (formEl.id === "askForm") ask(v.question);
    } catch (e) { showError(e); }
  });
  document.addEventListener("change", async event => {
    const el = event.target;
    try {
      if (el.dataset.context) { view[el.dataset.context] = el.value; if (el.dataset.context === "term") savePref("lab-demo-term", view.term); view.page = 1; selected.clear(); render(); }
      if (el.dataset.select) { el.checked ? selected.add(el.dataset.select) : selected.delete(el.dataset.select); const footer = $(".table-footer > span"); if (footer) footer.textContent = `筛选结果 ${dataset().rows.length} 条 · 已选 ${selected.size} 条 · 每页8条`; }
      if (el.id === "selectAll") { $$("[data-select]").forEach(box => { box.checked = el.checked; box.checked ? selected.add(box.dataset.select) : selected.delete(box.dataset.select); }); render(); }
      if (el.hasAttribute("data-identity-school")) $("#f-personId").innerHTML = opts("staff", db.staff.filter(t => t.enabled && t.school === el.value), t => `${t.name} · ${M.roles[t.role]} · ${t.subject}`).map(([id, label]) => `<option value="${h(id)}">${h(label)}</option>`).join("");
      if (el.hasAttribute("data-base-school")) { const rows = db.staff.filter(t => t.enabled && t.school === el.value); if ($("[data-related-school]")) $("[data-related-school]").innerHTML = opts("staff", rows).map(([id, label]) => `<option value="${h(id)}">${h(label)}</option>`).join(""); if ($("[data-teacher-options]")) $("[data-teacher-options]").innerHTML = `<legend>任课教师（可多选）</legend>${rows.filter(t => t.role === "teacher").map(t => `<label class="check-field"><input type="checkbox" name="teacherIds" value="${h(t.id)}">${h(t.name)} · ${h(t.subject)}</label>`).join("")}`; }
      if (el.hasAttribute("data-check-result")) { $("#hazardFields").hidden = el.value !== "发现隐患"; $("#hazardFields").disabled = el.value !== "发现隐患"; }
      if (el.hasAttribute("data-plan-field")) updatePlanFields(el.name);
      if (el.hasAttribute("data-calendar-week")) { view.week = M.weekDate(get("terms", view.term), el.value); view.date = ""; view.page = 1; selected.clear(); render(); }
      if (el.hasAttribute("data-booking-plan")) { const row = el.closest("[data-booking-row]"), p = get("plans", el.value), lab = own("labs").find(l => l.subject === get("catalog", p.catalogId).subject && l.state === "可预约"); $('[data-booking-key="date"]', row).value = p.date; $('[data-booking-key="labId"]', row).value = lab?.id || ""; $('[data-booking-key="managerId"]', row).value = lab?.managerId || ""; $("[data-plan-info]", row).innerHTML = planInfo(p); }
      if (el.dataset.bookingKey === "labId") { const row = el.closest("[data-booking-row]"); $('[data-booking-key="managerId"]', row).value = get("labs", el.value)?.managerId || ""; }
      if (el.name === "assetIds") updateRepairInfo();
      if ($("#flowItemInfo") && ["itemId", "qty"].includes(el.name)) updateFlowInfo();
      if (el.id === "importFile" && el.files[0]) { if (el.files[0].size > 200000) throw new Error("CSV文件过大，请控制在200KB内。"); $("#f-source").value = await el.files[0].text(); importResult = null; $("#importPreview").textContent = "文件已读取，请校验预览。"; }
      if (el.id === "attachmentFile" && el.files[0]) { pendingFile = null; const f = el.files[0]; if (f.size > 524288) throw new Error("单个附件不能超过512KB。"); if (!/\.(pdf|png|jpe?g|txt|csv|docx|xlsx)$/i.test(f.name)) throw new Error("请选择支持的文档、表格、图片或文本文件。"); const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error("文件读取失败。")); reader.readAsDataURL(f); }); pendingFile = { name: f.name, dataUrl: dataUrl.replace(/^data:;/, "data:application/octet-stream;"), mime: f.type || "application/octet-stream", content: "" }; $("#f-name").value = f.name; $("#f-content").value = ""; $("#fileStatus").textContent = `已读取 ${f.name}（${Math.ceil(f.size / 1024)}KB），保存后可下载原始文件。`; }
    } catch (e) { showError(e); }
  });
  document.addEventListener("input", event => { const el = event.target; if (el.hasAttribute("data-item")) updateItemTotals(); if (el.hasAttribute("data-plan-field") && ["week", "date"].includes(el.name)) updatePlanFields(el.name); if ($("#flowItemInfo") && el.name === "qty") updateFlowInfo(); });
  document.addEventListener("keydown", event => {
    if (!$("#modalBackdrop.open")) return;
    if (event.key === "Escape") closeModal();
    if (event.key === "Tab") { const elements = $$("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], summary", $("#modalBackdrop")).filter(el => el.getClientRects().length); const first = elements[0], last = elements.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
  });
  window.addEventListener("storage", event => { if (event.key !== M.KEY) return; try { const fresh = JSON.parse(event.newValue); if (fresh?.version !== 2) throw new Error(); db = fresh; if (!$("#modalBackdrop.open")) render(); else toast("其他页面已更新台账，请关闭当前对话框后重新操作。"); } catch { persistenceError = "本地数据被移除或格式异常，请在系统控制中恢复数据。"; render(); } });
  render();
})();
