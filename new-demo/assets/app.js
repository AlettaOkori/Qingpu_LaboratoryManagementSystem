(function () {
  "use strict";
  const M = window.LabDemo, app = document.getElementById("app"), scope = document.body.dataset.scope || "district", pageId = document.body.dataset.page || "dashboard";
  const logoPath = scope === "login" ? "assets/qingpu-education-logo.png" : "../../assets/qingpu-education-logo.png";
  const $ = (s, parent = document) => parent.querySelector(s), $$ = (s, parent = document) => [...parent.querySelectorAll(s)];
  const h = x => String(x ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = n => Number(n || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pref = (key, fallback) => { try { return JSON.parse(sessionStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const savePref = (key, value) => { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* Preferences are optional; business persistence is checked separately. */ } };
  let db, persistenceError = "", actor, modalRevision = 0, modalSubmit = null, selected = new Set(), lastFocus, downloadResult, importResult, pendingFile, pendingResourceFile = null, pendingLoss = null, pendingSummaryImages = { OVERVIEW: [], STUDENT: [] };
  try {
    const navigation = performance.getEntriesByType("navigation")[0], forceSeed = !sessionStorage.getItem("lab-demo-seed-v20260903-accounts-v2") || navigation?.type === "reload";
    db = forceSeed ? M.seed() : M.migrate(JSON.parse(localStorage.getItem(M.KEY) || "null"));
    if (!db.assets || !db.planItems || !db.assignments || !db.rooms) throw new Error("数据格式不匹配");
    localStorage.setItem(M.KEY, JSON.stringify(db));
    sessionStorage.setItem("lab-demo-seed-v20260903-accounts-v2", "true");
  }
  catch { db = M.seed(); persistenceError = "本地数据无法保存；当前页面使用最新演示数据，刷新后会重新生成。"; }
  let identity = pref("lab-demo-identity", { role: "admin", school: "S1" });
  try { actor = M.actorFor(db, scope === "district" ? "district" : identity.role === "district" ? "admin" : identity.role, identity.school, identity.personId); }
  catch { actor = scope === "district" ? M.actorFor(db, "district") : { role: "teacher", name: "身份待选择", school: identity.school || "S1", id: "UNAVAILABLE" }; }
  const subjectPrefKey = `lab-demo-subject:${scope}:${actor.school || "district"}:${actor.id || actor.role}`;
  let activeTerm = pref("lab-demo-term", "TERM26");
  const subjectValues = () => {
    if (actor.role !== "teacher") return M.subjects;
    const assigned = db.assignments.filter(row => row.teacherId === actor.id && row.term === activeTerm && row.state === "有效").map(row => M.normalizeSubject(row.subject));
    const own = M.normalizeSubject(db.staff.find(row => row.id === actor.id)?.subject || "");
    return [...new Set([...assigned, own && own !== "综合" ? own : ""].filter(Boolean))];
  };
  const isAllSubject = value => !value || String(value).toUpperCase() === "ALL";
  const subjectAllowed = value => isAllSubject(value) ? actor.role !== "teacher" : subjectValues().some(subject => M.subjectEquals(subject, value));
  const defaultSubject = () => actor.role === "teacher" ? subjectValues()[0] || "" : "ALL";
  let savedSubject = pref(subjectPrefKey, defaultSubject());
  if (!subjectAllowed(savedSubject)) savedSubject = defaultSubject();
  const subjectLabel = value => M.subjectLabel ? M.subjectLabel(value) : value;
  const subjectOptions = () => [...(actor.role === "teacher" ? [] : [["ALL", "全部学科"]]), ...M.subjectOptionsFor(subjectValues())];
  const view = { tab: new URLSearchParams(location.search).get("tab") || (pageId === "inspections" ? "checks" : ""), keyword: "", state: "", subject: savedSubject, grade: "", category: "", itemId: "", page: 1, date: "", endDate: "", year: M.TODAY.slice(0, 4), week: M.TODAY, term: activeTerm, school: "" };
  if (!db.terms.some(t => t.id === view.term)) view.term = db.terms[0].id;
  activeTerm = view.term;
  const baseMetrics = M.metrics;
  M.metrics = (...args) => args.length >= 4 ? baseMetrics(...args) : baseMetrics(...args, (typeof subjectContextEnabled === "function" && subjectContextEnabled() && !isAllSubject(view.subject)) ? view.subject : "");
  const baseTeaching = M.teaching;
  M.teaching = (dbArg, schoolArg, termArg, byArg, filtersArg = {}) => baseTeaching(dbArg, schoolArg, termArg, byArg, { ...filtersArg, ...(filtersArg.subject || typeof subjectContextEnabled !== "function" || !subjectContextEnabled() || isAllSubject(view.subject) ? {} : { subject: view.subject }) });
  const school = () => scope === "district" ? view.school : actor.school;
  const get = (table, id) => db[table]?.find(r => r.id === id);
  const name = (table, id) => get(table, id)?.name || id || "未关联";
  const permit = (...roles) => roles.includes(actor.role);
  const records = table => M.scoped(db, table, school());
  const planLabel = p => p?.name || p?.id || "未关联计划";
  const defaultPlanName = (termName, grade, subject) => `${termName} · ${grade}${subjectLabel(subject)}实验计划`;
  const teacherCanSeePlan = (plan, teacherId = actor.id) => !!plan && (plan.createdBy === teacherId || db.teachingTasks.some(task => task.teacherId === teacherId && get("planItems", task.planItemId)?.planId === plan.id));
  const teachingFilters = filters => ({ ...filters, ...(actor.role === "teacher" ? { teacherId: actor.id } : {}) });
  const enabledPeriodsFor = term => own("periods").filter(period => period.term === term && period.state === "启用");
  const roomCompatibleWithItem = (room, item) => M.roomFitsItem ? M.roomFitsItem(room, item) : (() => { const category = String(item?.category || ""); return !!room && (!room.subject || !category.endsWith("仪器") || category === `${room.subject}仪器`) && (!M.isHazard(item) || room.hazardStorage === true); })();
  const roomFitsStoredItem = (room, item) => room?.state === "可用" && roomCompatibleWithItem(room, item);
  const storageRoomsFor = (item, exclude = "") => own("rooms").filter(room => room.id !== exclude && roomFitsStoredItem(room, item));
  const expiredHazardStock = stock => M.isHazard(M.itemOf(db, stock)) && stock.expiry && stock.expiry < M.TODAY;
  const taskLabel = task => { if (!task) return "未关联计划实验"; const c = M.taskContext(db, task); return `${c.klass.name} / ${c.experiment.name}`; };
  const status = s => `<span class="status ${/已完成|已发布|已安排|已关闭|正常|已入库|已归档|可用|相符|已记账|已复核|已上报|在库/.test(s) ? "success" : /驳回|拒绝|报废|不足|隐患|停用|已过期|逾期|低于阈值/.test(s) ? "danger" : /待|维修|整改|借出|退回|近效期|到期|待分配|待库存/.test(s) ? "warning" : "info"}">${h(s)}</span>`;
  const button = (label, action, extra = "", primary = false, allowed = true) => `<button type="button" class="button ${primary ? "primary" : ""}" data-action="${h(action)}" ${extra} ${allowed ? "" : 'disabled title="当前身份无此操作权限，请在系统控制中选择对应身份"'}>${h(label)}</button>`;
  const col = spec => spec.split("|").map(pair => pair.split(":"));
  const columns = {
    schools: col("code:学校代码|name:学校|stage:学段|labsCount:实验室|assetsCount:设备数|administrators:学校管理员"),
    departments: col("name:部门|schoolName:学校|state:状态"),
    staff: col("name:姓名|sex:性别|departmentName:部门|phone:手机号码|schoolName:学校|roleName:账号角色|subject:专业/学科|teachingClasses:本学期任课班级|qualification:资质|state:账号状态"),
    rooms: col("roomNo:实验室号|name:名称|schoolName:学校|type:类型|subject:学科|hazardStorageText:危化品存放|area:使用面积㎡|seats:座位数|state:可用状态"),
    cabinets: col("code:橱柜编号|name:橱柜名称|roomName:所属房间|type:橱柜类型|custodianName:保管责任人|hazardStorageText:危化品专用|state:使用状态"),
    classes: col("name:班级|schoolName:学校|grade:年级|students:人数|assignmentCount:本学期任课设置"),
    assignments: col("termName:学期|className:班级|subject:学科|teacherName:任课教师|primaryText:主教师|state:状态"),
    terms: col("name:学期|start:开始日期|end:结束日期"),
    periods: col("number:节次|name:名称|schoolName:学校|start:开始时间|end:结束时间|state:状态"),
    assets: col("code:资产编号|name:设备名称|model:规格型号|schoolName:学校|location:存放位置|priceText:原值（元）|state:资产状态"),
    purchases: col("id:申请单号|schoolName:学校|itemsText:采购明细|total:预计金额（元）|applicant:申请人|date:申请日期|state:状态"),
    receipts: col("id:入库单号|schoolName:学校|itemsText:入库明细|total:入库金额（元）|supplier:供应商|date:登记日期|state:状态"),
    inventory: col("id:物品编号|name:名称|spec:规格|schoolName:学校|location:存放位置|stockText:当前库存|minText:补库阈值|hazardText:管理类别|state:库存状态"),
    hazardInventory: col("id:库存编号|name:危化品名称|spec:规格|schoolName:学校|location:存放位置|stockText:现有库存|expiryText:有效期|custodian:保管责任人|riskText:风险状态"),
    flows: col("id:业务单号|kind:业务类型|itemName:物品|qtyText:数量|applicant:申请人|reviewer:复核人|date:登记日期|state:记账状态"),
    plans: col("id:计划编号|name:计划名称|subject:学科|grade:年级|version:教材|termName:学期|targetCount:适用班级|itemCount:实验项|categorySummary:实验属性|taskCount:应开次数|doneCount:已完成|rate:完成率|state:计划状态"),
    planItems: col("experimentName:实验名称|experimentCategory:实验属性|sourceType:来源|chapter:章节|grade:年级|version:教材|scheduleText:建议时间|mode:实施方式|equipment:实验器材"),
    teachingTasks: col("className:班级|teacherName:教师|experimentName:实验|experimentCategory:实验属性|sourceType:来源|scheduleText:建议时间|mode:实施方式|state:执行状态"),
    customExperiments: col("code:编号|name:实验名称|subject:学科|grade:年级|textbookVersion:教材|experimentCategory:实验属性|mode:默认方式|equipmentSummary:自定义器材|state:状态"),
    bookings: col("id:预约编号|experimentName:实验|experimentCategory:实验属性|className:班级|teacherName:教师|requestedDate:申请日期|requestedPeriodText:申请节次|arrangementPlace:安排地点|scheduleText:最终安排|state:状态"),
    arrangements: col("id:安排编号|experimentName:实验|experimentCategory:实验属性|className:班级|roomName:房间|scheduleText:时间|managerName:实验负责人|state:执行状态"),
    summaries: col("id:总结编号|experimentName:实验|experimentCategory:实验属性|className:班级|actualDate:完成日期|effect:实验效果|equipmentCondition:仪器情况"),
    checks: col("id:检查编号|schoolName:学校|targetLabel:检查对象与范围|kind:类型|date:检查日期|inspector:检查人|result:检查结果"),
    hazards: col("id:隐患编号|schoolName:学校|targetLabel:隐患对象与范围|title:隐患描述|owner:责任人|sourceText:来源|due:整改期限|state:处理状态"),
    tasks: col("id:任务编号|schoolName:学校|targetLabel:检查对象与范围|kind:检查类型|owner:责任人|due:截止日期|state:状态"),
    archives: col("name:文件名称|category:分类|relatedName:关联业务|size:文件大小|uploader:上传人|date:日期|state:归档状态"),
    resources: col("title:资源名称|resourceType:资源类型|subject:学科|gradesText:适用年级|experimentCategory:实验属性|fileText:文件|uploaderName:上传人|updatedText:更新时间"),
    submissions: col("id:上报批次|schoolName:学校|termName:学期|at:上报时间|operator:上报人|revision:数据版本|state:状态"),
    logs: col("at:操作时间|actor:操作人|schoolName:学校|tableName:业务类型|recordId:记录编号|action:操作|note:说明"),
    report: col("name:统计维度|required:必做应开|done:必做实开|pending:必做未开|rate:必做开出率|optional:选做应开|optionalDone:选做实开|optionalRate:选做开出率|innovation:创新应开|innovationDone:创新实开|innovationRate:创新开出率|demonstration:演示应开|demonstrationDone:演示实开|demonstrationRate:演示开出率|group:分组应开|groupDone:分组实开|groupRate:分组开出率|total:合计应开|totalDone:合计实开|totalRate:合计开出率")
  };
  const referenceColumns = {
    repair: col("classificationCode:分类编号|itemName:名称|spec:规格|unit:单位|maintenanceDate:维修日期|registrar:登记人|vendor:维修商|qty:维修数量|costText:维修金额|content:维修内容|registeredAt:登记日期"),
    scrap: col("scrapDate:报废日期|code:二维码|classificationCode:分类编号|itemName:名称|spec:规格|unit:单位|qty:数量|total:总价|location:房间或橱柜|reason:报废原因|operator:经办人"),
    loss: col("date:损耗日期|classificationCode:分类编号|itemName:名称|spec:规格|unit:单位|qty:数量|total:总价|location:房间或橱柜|reason:损耗原因|operator:经办人"),
    ledger: col("date:日期|summary:摘要|unitPrice:单价|increaseQty:增加数量|increaseAmount:增加金额(元)|decreaseQty:减少数量|decreaseAmount:减少金额(元)|balanceQty:结存数量|balanceAmount:结存金额(元)")
  };
  const referencePage = () => ["supplies", "consumables", "maintenance", "repair"].includes(pageId);
  const subjectContextPages = new Set(["dashboard", "ai-query", "experiments", "booking", "schedule", "archives", "equipment", "devices", "supplies", "consumables", "maintenance", "repair", "labs"]);
  const subjectContextEnabled = () => subjectContextPages.has(pageId);
  const rowMatchesSubject = (table, row) => {
    if (!subjectContextEnabled() || isAllSubject(view.subject)) return true;
    if (row.subject) return M.subjectEquals(row.subject, view.subject);
    if (["assets", "inventory"].includes(table)) return M.itemFitsSubject(M.itemOf(db, row), view.subject);
    if (["purchases", "receipts"].includes(table)) return (row.items || []).some(item => M.itemFitsSubject(item, view.subject));
    if (["flows", "lossRegisters"].includes(table)) return M.itemFitsSubject(row.snapshot || M.itemOf(db, get("inventory", row.itemId)), view.subject);
    if (["repairs", "repairRegisters", "scrapRegisters"].includes(table)) return M.itemFitsSubject(row.snapshot || M.itemOf(db, get("assets", row.assetId)), view.subject);
    if (table === "rooms") return !row.subject || M.subjectEquals(row.subject, view.subject);
    return true;
  };
  const schoolScopeFields = new Set(["school", "schoolName"]);
  const schoolScopeColumns = cols => scope === "school" ? cols.filter(([key]) => !schoolScopeFields.has(key)) : cols;
  function decorate(table, r) {
    const x = { ...r, _table: table, schoolName: name("schools", r.school), termName: name("terms", r.term), roomName: name("rooms", r.roomId) };
    if (table === "schools") Object.assign(x, { labsCount: M.scoped(db, "rooms", r.id).filter(room => room.type === "教学实验室").length, assetsCount: M.scoped(db, "assets", r.id).length, administrators: M.scoped(db, "staff", r.id).filter(person => person.enabled && person.role === "admin").length });
    if (table === "staff") { const assignments = r.role === "teacher" ? db.assignments.filter(a => a.teacherId === r.id && a.term === view.term && a.state === "有效") : []; Object.assign(x, { roleName: M.roles[r.role], departmentName: name("departments", r.departmentId), teachingClasses: assignments.length ? assignments.map(a => `${name("classes", a.classId)} · ${subjectLabel(a.subject)}${a.primary ? "（主）" : ""}`).join("、") : r.role === "teacher" ? "未设置" : "—", state: r.enabled ? "正常" : "已停用" }); }
    if (table === "classes") x.assignmentCount = db.assignments.filter(a => a.classId === r.id && a.term === view.term && a.state === "有效").length;
    if (table === "assignments") Object.assign(x, { className: name("classes", r.classId), teacherName: name("staff", r.teacherId), primaryText: r.primary ? "是" : "否" });
    if (table === "rooms") x.hazardStorageText = r.hazardStorage ? "具备" : "不具备";
    if (table === "cabinets") { const room = get("rooms", r.roomId), custodian = get("staff", r.custodianId); Object.assign(x, { roomName: room ? `${room.roomNo} · ${room.name}` : "未关联房间", custodianName: custodian?.name || "未指定", hazardStorageText: r.hazardStorage ? "是" : "否" }); }
    if (["assets", "inventory"].includes(table)) { const item = M.itemOf(db, r); Object.assign(x, { name: item?.name, model: item?.spec, spec: item?.spec, category: item?.category, unit: item?.unit, classificationCode: item?.classificationCode, subject: get("rooms", r.roomId)?.subject || "", location: r.roomId ? get("rooms", r.roomId)?.roomNo : "待分配" }); }
    if (["assets", "inventory"].includes(table)) x.location = M.locationLabel ? M.locationLabel(db, r) : x.location;
    if (table === "assets") x.priceText = money(r.price);
    if (r.assetId) { const asset = get("assets", r.assetId), item = M.itemOf(db, asset); x.assetName = item?.name || r.assetId; }
    if (r.items && Array.isArray(r.items)) { x.itemsText = r.items.map(i => `${i.name} × ${i.qty}${i.unit}`).join("；"); x.total = money(r.items.reduce((n, i) => n + i.qty * i.price, 0)); }
    if (table === "inventory") {
      const item = M.itemOf(db, r), hazard = M.isHazard(item), linkedHazards = db.hazards.filter(hazardRow => M.safetyRelatedToStock(db, hazardRow, r) && hazardRow.state !== "已关闭"), risks = [], room = get("rooms", r.roomId), cabinet = get("cabinets", r.cabinetId);
      if (r.pendingReceiptId) risks.push("待库存复核");
      if (!r.roomId) risks.push("待分配");
      if (hazard && r.roomId && !roomFitsStoredItem(room, item)) risks.push("存放房间异常");
      if (hazard && r.cabinetId && (!cabinet || cabinet.state !== "启用" || !M.cabinetFitsItem(db, cabinet, item))) risks.push("存放橱柜异常");
      if (hazard && !r.expiry) risks.push("有效期未登记");
      if (hazard && r.expiry && r.expiry < M.TODAY) risks.push("已过期");
      else if (hazard && r.expiry && r.expiry <= addDays(M.TODAY, 30)) risks.push("30天内到期");
      if (hazard && Number(r.stock) < Number(r.min)) risks.push("补库提示");
      if (hazard && linkedHazards.length) risks.push(`有${linkedHazards.length}项未关闭隐患`);
      Object.assign(x, { hazard, stockText: `${r.stock}${item?.unit || ""}`, minText: `${r.min}${item?.unit || ""}`, hazardText: hazard ? "危化品" : "普通耗材", expiryText: hazard ? (r.expiry ? `${r.expiry}${r.expiry < M.TODAY ? "（已过期）" : r.expiry <= addDays(M.TODAY, 30) ? "（近效期）" : ""}` : "未登记") : "不适用", custodian: r.custodian || "未指定", riskText: hazard ? risks.join("、") || "正常" : "", state: r.pendingReceiptId ? "待库存复核" : r.roomId ? r.stock < r.min ? "库存不足" : "库存充足" : "待分配" });
    }
    if (["checks", "hazards", "tasks"].includes(table)) {
      const sourceCheck = table === "hazards" ? get("checks", r.checkId) : table === "checks" ? r : null;
      Object.assign(x, { targetLabel: M.safetyTargetLabel(db, r), scopeText: r.safetyScope === "hazardous" ? "危化品专项" : "一般实验室安全", sourceText: table === "tasks" || sourceCheck?.taskId ? "区级任务" : "学校自查", owner: get("staff", r.owner)?.name || r.owner });
    }
    if (table === "flows") { const stock = get("inventory", r.itemId), item = r.snapshot || M.itemOf(db, stock); Object.assign(x, { itemName: item?.name, qtyText: `${r.qty}${item?.unit || ""}`, classificationCode: item?.classificationCode || "未登记", spec: item?.spec, unit: item?.unit, category: item?.category, operator: r.operator || r.applicant, location: item?.roomId ? (M.locationLabel ? M.locationLabel(db, item) : get("rooms", item.roomId)?.roomNo) : "待分配", total: money(r.qty * Number(r.snapshot?.unitPrice ?? stock?.unitPrice ?? 0)) }); }
    if (table === "repairs") { const asset = get("assets", r.assetId), item = r.snapshot || M.itemOf(db, asset); Object.assign(x, { itemName: item?.name || r.assetId, classificationCode: item?.classificationCode || "未登记", spec: item?.spec, category: item?.category, unit: item?.unit, code: item?.code || asset?.code || "", location: item?.roomId ? get("rooms", item.roomId)?.roomNo : "未登记", total: money((r.qty || 1) * Number(item?.unitPrice ?? asset?.price ?? 0)), costText: money(r.cost), registrar: r.registrar || r.reporter, registeredAt: r.registeredAt || r.date, maintenanceDate: r.maintenanceDate || r.date, scrapDate: r.scrapDate || r.date, content: r.content || r.result || "", operator: r.operator || r.reporter }); }
    if (table === "plans") { const items = db.planItems.filter(item => item.planId === r.id), tasks = db.teachingTasks.filter(task => items.some(item => item.id === task.planItemId)), done = tasks.filter(task => task.state === "已完成").length, targets = db.planTargets.filter(target => target.planId === r.id), categories = [...new Set(items.map(item => M.experimentOf(db, item).experimentCategory))]; Object.assign(x, { itemCount: items.length, targetCount: targets.length || "全校同年级", taskCount: tasks.length, doneCount: done, rate: M.ratio(done, tasks.length), categorySummary: categories.join("、"), required: categories.join("、") }); }
    if (table === "customExperiments") { const textbook = get("textbooks", r.textbookId); Object.assign(x, { textbookVersion: textbook?.version || r.version || "未指定", equipmentSummary: (r.equipmentRequirements || []).map(item => `${item.name}×${item.quantity || 1}${item.unit || "件"}`).join("、") || r.equipment || "未登记" }); }
    if (["planItems", "teachingTasks"].includes(table)) { const item = table === "planItems" ? r : get("planItems", r.planItemId), plan = get("plans", item?.planId), experiment = M.experimentOf(db, item); Object.assign(x, { experimentName: experiment?.name, chapter: experiment?.chapter, grade: experiment?.grade, version: experiment?.version, equipment: experiment?.equipment, subject: experiment?.subject, required: experiment?.required, experimentCategory: experiment?.experimentCategory, sourceType: experiment?.sourceType, mode: item?.mode, term: plan?.term, scheduleText: item?.scheduleType === "WEEK" ? `第${item.plannedWeek}周` : item?.plannedDate }); if (table === "teachingTasks") Object.assign(x, { className: name("classes", r.classId), teacherName: name("staff", r.teacherId) }); }
    if (table === "bookings") { const context = M.taskContext(db, r.taskId), arrangement = db.arrangements.find(a => a.bookingId === r.id && a.state !== "已取消"); Object.assign(x, { experimentName: context.experiment.name, chapter: context.experiment.chapter, className: context.klass.name, teacherName: context.teacher.name, subject: context.experiment.subject, grade: context.klass.grade, required: context.experiment.required, experimentCategory: context.experiment.experimentCategory, sourceType: context.experiment.sourceType, mode: context.item.mode, term: context.plan.term, requestedPeriodText: `第${r.requestedPeriod}节`, arrangementId: arrangement?.id || "", arrangementPlace: arrangement ? arrangement.venueType === "其他" ? arrangement.venueText : get("rooms", arrangement.roomId)?.roomNo : "待安排", scheduleText: arrangement ? `${arrangement.scheduledDate} 第${arrangement.startPeriod}${arrangement.endPeriod !== arrangement.startPeriod ? `-${arrangement.endPeriod}` : ""}节` : "待安排", requestState: r.state, state: arrangement?.state || r.state }); }
    if (["arrangements", "summaries"].includes(table)) { const arrangement = table === "arrangements" ? r : get("arrangements", r.arrangementId), booking = get("bookings", arrangement?.bookingId), context = booking ? M.taskContext(db, booking.taskId) : null; Object.assign(x, { experimentName: context?.experiment.name, experimentCategory: context?.experiment.experimentCategory, className: context?.klass.name, teacherName: context?.teacher.name, roomName: arrangement?.venueType === "其他" ? arrangement.venueText : name("rooms", arrangement?.roomId), scheduleText: arrangement ? `${arrangement.scheduledDate} 第${arrangement.startPeriod}-${arrangement.endPeriod}节` : "", managerName: name("staff", arrangement?.technicianId) }); }
    if (table === "archives") { x.relatedName = `${M.tableNames[r.relatedTable]} / ${r.relatedId}`; x.size = `${Math.max(1, Math.round((r.dataUrl ? r.dataUrl.length * .75 : new Blob([r.content || ""]).size) / 1024))} KB`; }
    if (table === "resources") { x.gradesText = (r.grades || []).join("、"); x.fileText = `${String(r.extension || "").toUpperCase() || "文件"} · ${r.size ? `${Math.max(1, Math.round(r.size / 1024))} KB` : "演示资源"}`; x.updatedText = String(r.updatedAt || r.createdAt || "").slice(0, 10); x.uploaderName = r.uploaderName || name("staff", r.uploaderId); }
    if (table === "logs") x.tableName = M.tableNames[r.table] || "平台设置";
    if (x.subject) x.subject = subjectLabel(x.subject);
    return x;
  }
  function tabsFor() {
    if (pageId === "schools") return [["schools", "学校档案"], ["rooms", "实验室档案"], ["cabinets", "橱柜管理"], ["submissions", "数据上报"]];
    if (pageId === "teachers") return [["all", "全部人员"], ["teacher", "任课教师"], ["admin", "学校管理员"], ["disabled", "已停用"]];
    if (pageId === "staff") return [["all", "全部人员"], ["teacher", "任课教师"], ["admin", "学校管理员"], ["classes", "班级管理"], ["disabled", "已停用"]];
    if (pageId === "labs") return [["rooms", "实验室档案"], ["cabinets", "橱柜管理"]];
    if (["devices", "equipment"].includes(pageId)) return [["assets", "设备台账"], ["receipts", "入库单"], ["purchases", "采购申请"]];
    if (["supplies", "consumables"].includes(pageId)) return [["total", "易耗品总账"], ["ledger", "易耗品分类账"], ["loss", "易耗品损耗登记"]];
    if (["maintenance", "repair"].includes(pageId)) return [["repair", "仪器设备维修"], ["scrap", "仪器设备报废"]];
    if (pageId === "experiments") return [["plans", "实验计划"], ["innovation", "创新实验"]];
    if (pageId === "schedule") return [["progress", "完成进度"], ["ranking", "学校排行"], ["subject", "学科分析"], ["grade", "年级对比"], ["class", "班级明细"]];
    if (pageId === "booking") return [["booked", "已预约实验"], ["arranged", "已安排实验"], ["pendingSummary", "待登记总结实验"], ["mineBooked", "我预约的实验"], ["mineArranged", "我的已安排实验"], ["minePendingSummary", "我的待登记总结实验"]];
    if (["safety", "inspections"].includes(pageId)) return [["hazardInventory", "危化品台账"], ["hazards", "隐患与整改"], ["checks", "专项检查台账"], ["tasks", "检查任务"], ["hazardFlows", "出入库与复核"], ["generalSafety", "一般安全记录"]];
    if (pageId === "archives") return [["all", "全部资源"], ...M.resourceTypes.map(type => [type, type])];
    if (pageId === "settings") return [["settings", "平台设置"], ["terms", "学年学期"], ["periods", "学校节次"], ["logs", "操作日志"]];
    return [];
  }
  function bookingViewMatch(row, tab) {
    const arrangement = row.arrangementId ? get("arrangements", row.arrangementId) : null;
    const hasArrangement = !!arrangement && arrangement.state !== "已取消";
    const pendingSummary = arrangement?.state === "已安排" && !db.summaries.some(summary => summary.arrangementId === arrangement.id);
    const mineBooking = row.applicantId === actor.id;
    const mineArrangement = hasArrangement && (arrangement.technicianId === actor.id || arrangement.arrangedBy === actor.id);
    if (tab === "booked") return ["待安排", "已退回"].includes(row.requestState);
    if (tab === "arranged") return hasArrangement;
    if (tab === "pendingSummary") return pendingSummary;
    if (tab === "mineBooked") return mineBooking && ["待安排", "已退回"].includes(row.requestState);
    if (tab === "mineArranged") return mineArrangement;
    if (tab === "minePendingSummary") return mineArrangement && pendingSummary;
    return false;
  }
  function postedFlow(flow) { return flow.kind === "损耗" || flow.state === "已记账"; }
  function flowPrice(flow, stock) { return Number(flow.snapshot?.unitPrice ?? stock?.unitPrice ?? 0); }
  function quantityDelta(flow) { return ["入库", "退回"].includes(flow.kind) ? Number(flow.qty || 0) : -Number(flow.qty || 0); }
  function referenceStocks() { return records("inventory").filter(stock => M.itemOf(db, stock)?.category === "耗材" && rowMatchesSubject("inventory", stock)); }
  function openingQuantity(stock, year) {
    const start = `${year}-01-01`, laterDelta = db.flows.filter(flow => flow.itemId === stock.id && postedFlow(flow) && flow.date >= start).reduce((sum, flow) => sum + quantityDelta(flow), 0);
    return Number(stock.stock || 0) - laterDelta;
  }
  function consumableTotalRows(year) {
    return referenceStocks().map(stock => {
      const item = M.itemOf(db, stock), movements = db.flows.filter(flow => flow.itemId === stock.id && postedFlow(flow) && String(flow.date || "").startsWith(`${year}-`)), openingQty = openingQuantity(stock, year), increases = movements.filter(flow => quantityDelta(flow) > 0), decreases = movements.filter(flow => quantityDelta(flow) < 0), increaseQty = increases.reduce((sum, flow) => sum + Number(flow.qty || 0), 0), decreaseQty = decreases.reduce((sum, flow) => sum + Number(flow.qty || 0), 0), closingQty = openingQty + increaseQty - decreaseQty, unitPrice = Number(stock.unitPrice || 0);
      return { id: stock.id, school: stock.school, category: item.category, classificationCode: item.classificationCode, itemName: item.name, spec: item.spec, unit: item.unit, openingQty, openingAmount: money(openingQty * unitPrice), increaseQty, increaseAmount: money(increases.reduce((sum, flow) => sum + Number(flow.qty || 0) * flowPrice(flow, stock), 0)), decreaseQty, decreaseAmount: money(decreases.reduce((sum, flow) => sum + Number(flow.qty || 0) * flowPrice(flow, stock), 0)), closingQty, closingAmount: money(closingQty * unitPrice) };
    });
  }
  function consumableLedgerRows(stock, year) {
    if (!stock) return [];
    let balance = openingQuantity(stock, year), price = Number(stock.unitPrice || 0);
    const opening = { id: `${stock.id}-OPEN-${year}`, school: stock.school, date: `${year}-01-01`, summary: "上年结转", unitPrice: money(price), increaseQty: "", increaseAmount: "", decreaseQty: "", decreaseAmount: "", balanceQty: balance, balanceAmount: money(balance * price) };
    const movements = db.flows.filter(flow => flow.itemId === stock.id && postedFlow(flow) && String(flow.date || "").startsWith(`${year}-`)).slice().sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
    return [opening, ...movements.map(flow => { const delta = quantityDelta(flow); price = flowPrice(flow, stock); balance += delta; return { id: flow.id, school: flow.school, date: flow.date, summary: flow.kind, unitPrice: money(price), increaseQty: delta > 0 ? flow.qty : "", increaseAmount: delta > 0 ? money(flow.qty * price) : "", decreaseQty: delta < 0 ? flow.qty : "", decreaseAmount: delta < 0 ? money(flow.qty * price) : "", balanceQty: balance, balanceAmount: money(balance * price) }; })];
  }
  function referenceDataset(tab) {
    let table, rows, rawColumns;
    if (["supplies", "consumables"].includes(pageId) && tab === "total") {
      table = "consumableTotal"; rows = consumableTotalRows(view.year); rawColumns = col(`classificationCode:分类编号|itemName:名称|spec:规格|unit:单位|openingQty:上年结转数量|openingAmount:上年结转金额|increaseQty:${view.year}增加数量|increaseAmount:${view.year}增加金额|decreaseQty:${view.year}减少数量|decreaseAmount:${view.year}减少金额|closingQty:${view.year}结存数量|closingAmount:${view.year}结存金额`);
    } else if (["supplies", "consumables"].includes(pageId) && tab === "ledger") {
      table = "consumableLedger"; const stocks = referenceStocks().filter(stock => !view.category || M.itemOf(db, stock)?.category === view.category); if (!stocks.some(stock => stock.id === view.itemId)) view.itemId = stocks[0]?.id || ""; rows = consumableLedgerRows(stocks.find(stock => stock.id === view.itemId), view.year); rawColumns = referenceColumns.ledger;
    } else if (["supplies", "consumables"].includes(pageId)) {
      table = "lossRegisters"; rows = records("flows").filter(flow => flow.kind === "损耗" && (flow.snapshot?.category || M.itemOf(db, db.inventory.find(stock => stock.id === flow.itemId))?.category) === "耗材" && !flow.state).map(flow => decorate("flows", flow)); rawColumns = referenceColumns.loss;
    } else if (tab === "repair") {
      table = "repairRegisters"; rows = records("repairs").filter(row => row.kind === "维修").map(row => decorate("repairs", row)); rawColumns = referenceColumns.repair;
    } else {
      table = "scrapRegisters"; rows = records("repairs").filter(row => row.kind === "报废").map(row => decorate("repairs", row)); rawColumns = referenceColumns.scrap;
    }
    if (view.category && table !== "consumableLedger") rows = rows.filter(row => row.category === view.category);
    if (view.date) rows = rows.filter(row => (row.maintenanceDate || row.scrapDate || row.date) >= view.date);
    if (view.endDate) rows = rows.filter(row => (row.maintenanceDate || row.scrapDate || row.date) <= view.endDate);
    if (view.roomId) rows = rows.filter(row => (row.snapshot?.roomId || get("inventory", row.itemId)?.roomId) === view.roomId || row.location === name("rooms", view.roomId) || row.location === get("rooms", view.roomId)?.roomNo);
    rows = rows.filter(row => rowMatchesSubject(table, row));
    if (view.keyword) rows = rows.filter(row => rawColumns.some(([key]) => String(row[key] ?? "").toLowerCase().includes(view.keyword.toLowerCase())));
    return { table, rows, allRows: rows, columns: rawColumns, reference: true };
  }
  function dataset() {
    const tabs = tabsFor(); if (!tabs.some(([id]) => id === view.tab)) view.tab = tabs[0]?.[0] || "";
    let table = "", rows = [], t = view.tab;
    if (referencePage()) return referenceDataset(t);
    if (["schools", "labs", "settings"].includes(pageId)) table = t;
    else if (pageId === "staff") table = t === "classes" ? t : "staff";
    else if (pageId === "teachers") table = "staff";
    else if (["devices", "equipment"].includes(pageId)) table = t;
    else if (pageId === "experiments") table = t === "innovation" ? "customExperiments" : "plans";
    else if (pageId === "booking") table = "bookings";
    else if (["safety", "inspections"].includes(pageId)) table = t === "hazardInventory" ? "inventory" : t === "hazardFlows" ? "flows" : t === "generalSafety" ? "hazards" : t;
    else if (pageId === "archives") table = "resources";
    else if (pageId === "schedule") table = "report";
    if (view.classId) {
      const selectedClass = get("classes", view.classId);
      if (!selectedClass || (view.grade && selectedClass.grade !== view.grade)) view.classId = "";
    }
    if (table === "settings") return { table, rows: [], columns: [] };
    if (table === "report") { rows = M.teaching(db, school(), view.term, ["subject", "grade", "class"].includes(t) ? t : "school", teachingFilters({ subject: view.subject, grade: view.grade, teacherId: view.teacherId, classId: view.classId })); if (t === "ranking") rows.sort((a, b) => (b.done / (b.required || 1)) - (a.done / (a.required || 1))); }
    else rows = (db[table] ? (["terms"].includes(table) ? db[table] : records(table)) : []).map(r => decorate(table, r));
    if (table === "staff") rows = rows.filter(r => t === "all" || (t === "disabled" ? !r.enabled : r.role === t && r.enabled));
    if (table === "inventory" && t === "hazard") rows = rows.filter(r => r.hazard);
    if (table === "inventory" && t === "hazardInventory") rows = rows.filter(r => r.hazard);
    if (["safety", "inspections"].includes(pageId) && ["hazards", "checks", "tasks"].includes(table)) rows = rows.filter(r => t === "generalSafety" ? r.safetyScope !== "hazardous" : r.safetyScope === "hazardous");
    if (table === "flows") rows = rows.filter(r => t === "hazardFlows" ? M.isHazard(M.itemOf(db, get("inventory", r.itemId))) : t === "pending" ? r.state === "待复核" : t === "inbound" ? ["入库", "退回"].includes(r.kind) : t === "outbound" ? r.kind === "领用" : ["损耗", "处置"].includes(r.kind));
    if (table === "flows" && t === "loss") rows = rows.filter(r => (!view.date || r.date === view.date) && (!view.roomId || (r.snapshot?.roomId || get("inventory", r.itemId)?.roomId) === view.roomId));
    if (table === "plans") {
      rows = rows.filter(r => r.term === view.term && (actor.role !== "teacher" || teacherCanSeePlan(r))).filter(r => {
        if (!view.classId) return true;
        const klass = get("classes", view.classId);
        if (!klass) return false;
        const matched = db.planTargets.some(target => target.planId === r.id && target.classId === view.classId);
        return matched || ((r.targetMode === "LEGACY_ALL" || !r.targetMode) && r.grade === klass.grade);
      });
    }
    if (table === "customExperiments") rows = rows.filter(r => r.school === actor.school || scope === "district");
    if (table === "assignments") rows = rows.filter(r => r.term === view.term);
    if (table === "periods") rows = rows.filter(r => r.term === view.term);
    if (table === "bookings") rows = rows.filter(r => r.term === view.term && (actor.role !== "teacher" || r.teacherId === actor.id) && (!view.date || r.requestedDate === view.date) && bookingViewMatch(r, t));
    if (table === "resources" && t !== "all") rows = rows.filter(r => r.resourceType === t);
    if (actor.role === "teacher" && table === "resources") rows = rows.filter(r => r.school === actor.school);
    const allRows = rows;
    const rawColumns = table === "inventory" && t === "hazardInventory" ? columns.hazardInventory : table === "flows" && t === "loss" ? col("date:损耗日期|classificationCode:分类编号|itemName:名称|spec:规格|unit:单位|qty:数量|total:总价（元）|location:存放位置（房间／橱柜）|reason:损耗原因|state:状态") : table === "report" && t === "class" ? [...col("gradeNames:年级|teacherNames:任课教师"), ...columns.report] : columns[table] || [];
    const visibleColumns = schoolScopeColumns(rawColumns);
    rows = rows.filter(r => (!view.state || (table === "inventory" && view.tab === "hazardInventory" ? String(r.riskText || "").split("、").includes(view.state) : (r.state || r.result) === view.state)) && rowMatchesSubject(table, r) && (table === "report" || table === "resources" || (!view.grade || r.grade === view.grade)) && (table !== "resources" || (!view.grade || (r.grades || []).includes(view.grade)) && (!view.category || r.experimentCategory === view.category)) && (!view.keyword || visibleColumns.some(([k]) => String(r[k] ?? "").toLowerCase().includes(view.keyword.toLowerCase()))));
    return { table, rows, allRows, columns: visibleColumns };
  }
  function commit(command, payload, expected = modalRevision) {
    if (persistenceError) throw new Error(persistenceError);
    let latest; try { latest = M.migrate(JSON.parse(localStorage.getItem(M.KEY))); } catch { throw new Error("无法读取本地数据，未保存任何变更。"); }
    if (!latest || latest.revision !== expected) throw new Error("其他页面已更新数据，请关闭此窗口并重新打开后提交，避免覆盖。");
    const out = M.transact(latest, actor, command, payload);
    const issues = M.auditRelations(out.db); if (issues.length) throw new Error(`数据关系校验未通过，本次未保存：${issues[0]}`);
    try { localStorage.setItem(M.KEY, JSON.stringify(out.db)); } catch { throw new Error("本地存储空间不足或不可用，本次未保存。请先备份数据并缩小附件。"); }
    db = out.db; return out.result;
  }
  function refreshLatestLocalData() {
    try {
      const raw = localStorage.getItem(M.KEY); if (!raw) return;
      const latest = M.migrate(JSON.parse(raw));
      if (latest.revision !== db.revision || JSON.stringify(latest.classes) !== JSON.stringify(db.classes)) db = latest;
    } catch { /* Keep the current in-memory data when another tab has incomplete data. */ }
  }
  function toast(message) { const area = $("#toastRegion"); if (!area) return; const el = document.createElement("div"); el.className = "toast"; el.textContent = message; area.append(el); setTimeout(() => el.remove(), 5000); }
  function openModal(title, html, submit = null, label = "确认保存") {
    $(".modal").classList.toggle("wide", /class="(?:table-wrap|detail-grid)|id="itemRows"|id="importPreview"/.test(html));
    lastFocus = document.activeElement; modalRevision = db.revision; modalSubmit = submit; $("#modalTitle").textContent = title; $("#modalBody").innerHTML = `<div class="form-error" role="alert" id="formError"></div>${html}`; $$('[data-equipment-picker]').forEach(picker => { const choice = picker.querySelector('[data-equipment-choice]:checked'), valueInput = picker.querySelector('input[type=hidden][data-equipment-picker-value]'); if (choice && valueInput && !valueInput.value) { const value = choice.getAttribute("value") || choice.value || ""; valueInput.value = value; valueInput.setAttribute("value", value); } }); $("#modalBody").scrollTop = 0; $("#modalFoot").innerHTML = button("关闭", "close") + (submit ? `<button type="submit" form="modalForm" class="button primary">${h(label)}</button>` : ""); $("#modalBackdrop").classList.add("open"); $("#modalBackdrop").setAttribute("aria-hidden", "false"); document.body.classList.add("modal-open"); $("#modalClose").focus();
  }
  function closeModal() { $("#modalBackdrop").classList.remove("open"); $("#modalBackdrop").setAttribute("aria-hidden", "true"); document.body.classList.remove("modal-open"); modalSubmit = null; if (lastFocus?.isConnected) lastFocus.focus(); }
  function fieldsForm(html) { return `<form class="form-grid" id="modalForm">${html}</form>`; }
  function field(key, label, value = "", type = "text", options = null, required = true, extra = "") {
    const common = `name="${h(key)}" id="f-${h(key)}" ${required ? "required" : ""} ${extra}`, input = options ? `<select class="select" ${common}>${options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${h(v)}" ${String(v) === String(value) ? "selected" : ""}>${h(l)}</option>`; }).join("")}</select>` : type === "textarea" ? `<textarea class="textarea" ${common}>${h(value)}</textarea>` : `<input class="input" type="${h(type)}" value="${h(value)}" ${common}>`;
    return `<label class="field ${type === "textarea" ? "full" : ""}"><span class="field-label">${h(label)}${required ? ' <span class="required">*</span>' : ""}</span>${input}</label>`;
  }
  const check = (key, label, value, extra = "") => `<label class="check-field"><input name="${h(key)}" type="checkbox" ${value ? "checked" : ""} ${extra}>${h(label)}</label>`;
  const opts = (table, rows = records(table), label = r => r.name || r.title || r.id) => rows.map(r => [r.id, label(r)]);
  function form(title, fields, command, fixed = {}, label = "确认保存") { openModal(title, fieldsForm(fields), values => { const r = commit(command, { ...values, ...fixed }); closeModal(); render(); toast(`已保存：${r.id}`); return r; }, label); }
  function valuesOf(formEl) { const fd = new FormData(formEl), out = Object.fromEntries(fd); $$('[data-submit-disabled][name]', formEl).forEach(e => { out[e.name] = e.value; }); $$('input[type=checkbox]', formEl).forEach(e => { if (e.name !== "assetIds") out[e.name] = e.checked; }); $$('[data-equipment-picker]', formEl).forEach(picker => { const choice = picker.querySelector('[data-equipment-choice]:checked'), hidden = picker.querySelector('input[type=hidden][data-equipment-picker-value]'); if (choice && hidden?.name) out[hidden.name] = choice.getAttribute("value") || choice.value || hidden.value || ""; }); $$('[data-ledger-item-search]', formEl).forEach(input => { const option = [...formEl.querySelectorAll("#ledgerItemOptions option")].find(item => item.value === input.value); if (option?.dataset.itemId) out.itemId = option.dataset.itemId; }); if ($('[name="assetIds"]', formEl)) out.assetIds = fd.getAll("assetIds"); return out; }
    const moreLabels = { id: "记录编号", code: "统一编号", name: "名称", school: "所属学校", classId: "班级", teacherId: "任课教师", term: "学期", assetId: "关联设备", itemId: "关联物品", planId: "教学计划", checkId: "来源检查", taskId: "检查任务", purchaseId: "采购申请", receiptId: "入库单", sourceId: "来源单据", attachmentId: "整改附件", bookingId: "实施预约", model: "规格型号", category: "分类", unit: "单位", price: "原值/单价（元）", purchaseDate: "购置日期", date: "业务日期", state: "业务状态", supplier: "供应商", nextMaintenance: "下次维保日期", reason: "用途或原因", purpose: "采购用途", applicant: "申请人", reviewer: "复核人", decision: "审批意见", reporter: "提交人", due: "处理期限", vendor: "服务单位", cost: "处理费用（元）", result: "处理/检查结果", acceptance: "验收意见", priorState: "处理前状态", operator: "经办人", spec: "规格", stock: "现有库存", min: "补库阈值", hazard: "危化品", expiry: "有效期", location: "存放位置（房间／橱柜）", qty: "业务数量", kind: "业务类型", reviewNote: "复核意见", mode: "实施方式", completedAt: "完成日期", start: "开始", end: "结束", groups: "分组数", actualDate: "实际完成日期", cancelReason: "取消原因", items: "检查项目", inspector: "检查人", title: "名称/职称", level: "处置优先级", owner: "责任人", note: "说明", rectification: "整改说明", review: "复查意见", relatedTable: "关联业务类型", relatedId: "关联记录", uploader: "上传人", at: "记录时间", revision: "数据版本", area: "使用面积（㎡）", seats: "座位数", type: "实验室类型", builtAt: "建造日期", features: "设施与功能", roomNo: "实验室号", subject: "学科", grade: "年级", students: "班级人数", role: "人员角色", phone: "联系电话", qualification: "资质说明", enabled: "账号启用", version: "教材版本", chapter: "章节", equipment: "所需器材", periods: "课时", required: "实验属性", stage: "学段" };
    Object.assign(moreLabels, { roomId: "实验室", roomNo: "实验室号", cabinetId: "橱柜", cabinetCode: "橱柜编号", cabinetName: "橱柜名称", code: "统一编号", type: "类型", custodianId: "保管责任人", hazardStorage: "危化品存放条件", state: "业务状态", departmentId: "部门", staffId: "人员", assignmentId: "任课班级", planItemId: "计划实验", taskId: "计划实验", arrangementId: "实验安排", requestedDate: "申请日期", requestedPeriod: "申请节次", submittedAt: "预约时间", venueType: "地点类型", venueText: "其他地点", scheduledDate: "安排日期", startPeriod: "开始节次", endPeriod: "结束节次", technicianId: "实验负责人", effect: "实验效果", improvement: "改进意见", equipmentCondition: "仪器完好情况", actualDate: "实际完成日期", submittedBy: "提交人", publishedAt: "发布时间", trackingMode: "管理方式", maintenanceRequired: "需要维保", classificationCode: "分类编号", spec: "规格型号", primary: "主教师" });
  Object.assign(moreLabels, { features: "特征或功能", hazardStorage: "具备危化品存放条件", experimentCategory: "实验属性", sourceType: "实验来源", textbookId: "关联教材", section: "节", page: "页码", safety: "安全提示", targetMode: "班级范围" });
  ["street", "opening", "revisionNo", "sortNo"].forEach(key => delete moreLabels[key]);
  const references = { school: "schools", roomId: "rooms", cabinetId: "cabinets", departmentId: "departments", staffId: "staff", classId: "classes", teacherId: "staff", term: "terms", assetId: "assets", planId: "plans", planItemId: "planItems", assignmentId: "assignments", taskId: "teachingTasks", arrangementId: "arrangements", checkId: "checks", purchaseId: "purchases", receiptId: "receipts", sourceId: "receipts", attachmentId: "archives", bookingId: "bookings", technicianId: "staff", submittedBy: "staff" };
  function miniTable(cols, rows) { const displayColumns = schoolScopeColumns(cols); return `<div class="table-wrap"><table class="data-table"><thead><tr>${displayColumns.map(([, label]) => `<th>${h(label)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map(r => `<tr>${displayColumns.map(([key]) => `<td>${h(r[key] ?? "未填写")}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${displayColumns.length}">暂无记录</td></tr>`}</tbody></table></div>`; }
  function planExecutionTable(rows) {
    const cols = columns.teachingTasks;
    return `<div class="table-wrap"><table class="data-table"><thead><tr>${cols.map(([, label]) => `<th>${h(label)}</th>`).join("")}<th>操作</th></tr></thead><tbody>${rows.length ? rows.map(row => `<tr>${cols.map(([key]) => `<td>${key === "state" ? status(row.state || "未填写") : h(row[key] ?? "未填写")}</td>`).join("")}<td><div class="row-actions">${rowActions("teachingTasks", row)}</div></td></tr>`).join("") : `<tr><td colspan="${cols.length + 1}">暂无班级执行记录</td></tr>`}</tbody></table></div>`;
  }
  function detail(table, id) {
    if (table === "resources") return resourceDetail(id);
    Object.assign(moreLabels, { builder: "建造商", builtAt: "建造日期", sex: "性别", phone: "手机号码", batchId: "关联批次", maintenanceDate: "维修日期", unitPrice: "登记单价（元）", location: "存放位置（房间／橱柜）", trackingText: "管理方式", maintenanceText: "维保要求", requestState: "预约申请状态", arrangementPlace: "安排地点", scheduleText: "安排时间", expiryText: "有效期状态", custodian: "保管责任人", riskText: "风险状态" });
    const stored = get(table, id); if (!stored || (scope !== "district" && stored.school && stored.school !== actor.school)) throw new Error("记录不存在或不在当前数据范围。");
    const r = { ...stored, ...decorate(table, stored) };
    let html = `<dl class="detail-grid">${Object.entries(r).filter(([k, v]) => moreLabels[k] && !Array.isArray(v) && typeof v !== "object" && !(scope === "school" && schoolScopeFields.has(k))).map(([k, v]) => `<div><dt>${h(moreLabels[k])}</dt><dd>${references[k] && v ? `<button type="button" class="row-action" data-action="detail" data-table="${references[k]}" data-id="${h(v)}">${h(name(references[k], v))}</button>` : h(typeof v === "boolean" ? v ? "是" : "否" : k === "role" ? M.roles[v] : k === "relatedTable" ? M.tableNames[v] : v === "" ? "未填写" : v)}</dd></div>`).join("")}</dl>`;
    if (Array.isArray(stored.items)) html += `<h3>业务明细</h3>${miniTable(col("classificationCode:分类编号|name:名称|model:规格|category:分类|qty:数量|unit:单位|price:单价（元）|total:总价（元）|location:存放位置|nextMaintenance:下次维保日期|expiry:有效期"), stored.items.map(item => ({ ...item, price: money(item.price), total: money(item.price * item.qty), location: M.locationLabel ? M.locationLabel(db, item) : item.roomId ? get("rooms", item.roomId)?.roomNo : "待分配", nextMaintenance: item.nextMaintenance || "不适用", expiry: item.expiry || "不适用" })))}`;
    const resourceTable = resources => miniTable(col("classificationCode:分类编号|name:器材|spec:规格|qty:数量|unit:单位|location:存放位置"), (resources || []).map(resource => { const record = get("assets", resource.ref) || get("inventory", resource.ref), item = resource.itemId ? (resource.name ? resource : M.itemById(db, resource.itemId)) : M.itemOf(db, record); return { classificationCode: item?.classificationCode, name: item?.name, spec: item?.spec, unit: item?.unit, qty: resource.qty, location: record ? (M.locationLabel ? M.locationLabel(db, record) : get("rooms", record.roomId)?.roomNo) : resource.itemId ? "申请阶段不指定" : "待分配" }; }));
    if (stored.requestedResources?.length) html += `<h3>预约补充器材需求</h3>${resourceTable(stored.requestedResources)}<p class="help">申请数量只表达教师需求，不占用库存；管理员安排时确定实际资源。</p>`;
    if (stored.resources?.length) html += `<h3>实际安排器材</h3>${resourceTable(stored.resources)}<p class="help">数量型耗材须在“易耗品账目”中关联本安排的领用流水并记账，才能提交实验总结。</p>`;
    if (stored.snapshot) html += `<h3>登记时物品信息</h3>${miniTable(col("classificationCode:分类编号|name:名称|spec:规格|qty:数量|unit:单位|total:总价（元）|location:存放位置"), [{ ...stored.snapshot, qty: stored.qty || 1, total: stored.snapshot.unitPrice == null ? "未登记单价" : money(stored.snapshot.unitPrice * (stored.qty || 1)), location: M.locationLabel ? M.locationLabel(db, stored.snapshot) : stored.snapshot.roomId ? get("rooms", stored.snapshot.roomId)?.roomNo : "待分配" }])}`;
    if (table === "plans") { const items = db.planItems.filter(item => item.planId === id).map(item => decorate("planItems", item)), executions = db.teachingTasks.filter(task => items.some(item => item.id === task.planItemId) && (actor.role !== "teacher" || task.teacherId === actor.id)).map(task => decorate("teachingTasks", task)), targets = db.planTargets.filter(target => target.planId === id).map(target => ({ className: name("classes", target.classId), grade: target.grade })); html += `<h3>适用班级</h3>${targets.length ? miniTable(col("className:班级|grade:年级"), targets) : '<p class="help">此为历史计划，班级执行范围按同年级有效任课关系确定。</p>'}<h3>计划实验</h3>${miniTable(columns.planItems, items)}<h3>班级执行情况</h3><p class="help">每个计划实验按适用班级分别记录进度。待预约或已取消的记录可直接发起预约。</p>${planExecutionTable(executions)}`; }
    if (table === "customExperiments") { html += `<h3>自定义器材需求</h3>${miniTable(col("name:器材名称|spec:规格型号|unit:单位|quantity:数量|note:备注"), stored.equipmentRequirements || [])}<p class="help">创新实验器材仅作为教学需求快照，不会自动变更设备资产或易耗品库存。</p>`; }
    if (table === "teachingTasks") { const booking = db.bookings.find(row => row.taskId === id && M.activeBooking(row)); html += `<h3>有效预约</h3>${miniTable(columns.bookings, booking ? [decorate("bookings", booking)] : [])}`; }
    if (table === "bookings") { const arrangement = db.arrangements.find(row => row.bookingId === id && row.state !== "已取消"); html += `<h3>管理员安排</h3>${miniTable(columns.arrangements, arrangement ? [decorate("arrangements", arrangement)] : [])}`; if (arrangement) { const summary = db.summaries.find(row => row.arrangementId === arrangement.id); html += `<h3>实验总结</h3>${miniTable(columns.summaries, summary ? [decorate("summaries", summary)] : [])}${summary ? `<div class="inline-actions">${button("查看与更正总结", "detail", `data-table="summaries" data-id="${h(summary.id)}"`)}</div>` : ""}`; } }
    if (table === "arrangements") { const summary = db.summaries.find(row => row.arrangementId === id), flows = db.flows.filter(row => row.arrangementId === id); html += `<h3>关联领用流水</h3>${miniTable(columns.flows, flows.map(row => decorate("flows", row)))}<h3>实验总结</h3>${miniTable(columns.summaries, summary ? [decorate("summaries", summary)] : [])}`; }
    if (r.batchId) html += `<h3>同批次记录</h3><div class="inline-actions">${db[table].filter(x => x.batchId === r.batchId).map(x => button(x.id, "detail", `data-table="${table}" data-id="${h(x.id)}"`)).join("")}</div>`;
    if (table === "archives") html += `<h3>附件内容</h3>${r.content ? `<pre class="file-preview">${h(r.content)}</pre>` : `<p>已保存原始附件，可下载后查看。</p>`}${button("下载原文件", "file-download", `data-id="${h(r.id)}"`)}`;
    const attached = db.archives.filter(f => f.relatedTable === table && f.relatedId === id);
    if (attached.length) html += `<h3>关联附件</h3><div class="inline-actions">${attached.map(f => button(f.name, "detail", `data-table="archives" data-id="${h(f.id)}"`)).join("")}</div>`;
    if (table === "checks") html += `<h3>关联隐患</h3>${db.hazards.filter(h => h.checkId === id).map(r => button(r.title, "detail", `data-table="hazards" data-id="${h(r.id)}"`)).join("") || '<p class="help">本次检查无关联隐患。</p>'}`;
    if (table === "assets") {
      const repairs = db.repairs.filter(row => row.assetId === id && row.kind === "维修").map(row => decorate("repairs", row)), scraps = db.repairs.filter(row => row.assetId === id && row.kind === "报废").map(row => decorate("repairs", row));
      html += `<h3>仪器设备维修</h3>${miniTable(referenceColumns.repair, repairs)}<h3>仪器设备报废</h3>${miniTable(referenceColumns.scrap, scraps)}`;
    }
    if (table === "rooms") html += `<h3>下属橱柜</h3>${miniTable(columns.cabinets, db.cabinets.filter(cabinet => cabinet.roomId === id).map(cabinet => decorate("cabinets", cabinet)))}<h3>实验室设备</h3>${miniTable(columns.assets, db.assets.filter(a => a.roomId === id).map(a => decorate("assets", a)))}<h3>实验室库存</h3>${miniTable(columns.inventory, db.inventory.filter(i => i.roomId === id).map(i => decorate("inventory", i)))}<h3>有效实验安排</h3>${miniTable(columns.arrangements, db.arrangements.filter(a => a.roomId === id && M.activeArrangement(a)).map(a => decorate("arrangements", a)))}`;
    if (table === "cabinets") { const items = [...db.assets.filter(asset => asset.cabinetId === id), ...db.inventory.filter(stock => stock.cabinetId === id)].map(record => decorate(record.stock == null ? "assets" : "inventory", record)); html += `<h3>柜内存放明细</h3>${miniTable(col("classificationCode:分类编号|name:物品名称|spec:规格|unit:单位|stockText:数量|location:存放位置"), items)}`; }
    if (table === "inventory" && M.isHazard(stored)) {
      const relatedFlows = db.flows.filter(flow => flow.itemId === stored.id).map(flow => decorate("flows", flow)), relatedChecks = db.checks.filter(checkRow => checkRow.roomId === stored.roomId), relatedHazards = db.hazards.filter(hazard => hazard.roomId === stored.roomId);
      html += `<h3>危化品安全关联</h3><p class="help">以下记录按库存编号和存放房间关联，库存数量仍以“入库、领用、退回、损耗、处置”流水为准。</p>${miniTable(col("id:业务单号|kind:业务类型|qtyText:数量|applicant:申请人|reviewer:复核人|date:登记日期|state:记账状态"), relatedFlows)}<h4>相关专项检查</h4>${miniTable(columns.checks, relatedChecks.map(checkRow => decorate("checks", checkRow)))}<h4>相关隐患</h4>${miniTable(columns.hazards, relatedHazards.map(hazard => decorate("hazards", hazard)))}`;
    }
    if (table === "submissions") html += `<h3>上报时的数据快照</h3>${miniTable(col("label:指标|value:数值"), Object.entries(r.summary).filter(([k]) => ["assets", "required", "done", "rate", "hazards", "closed"].includes(k)).map(([key, value]) => ({ label: { assets: "设备数", required: "必做应开", done: "必做实开", rate: "必做开出率", hazards: "隐患数", closed: "已关闭" }[key], value })))}`;
    html += `<h3>处理轨迹</h3>${miniTable(col("at:时间|actor:操作人|action:操作|note:说明"), db.logs.filter(l => l.table === table && l.recordId === id).slice().reverse())}<div class="detail-actions">${rowActions(table, r, false)}</div>`;
    openModal(`${table === "inventory" && M.isHazard(stored) ? "危化品库存" : M.tableNames[table]}详情`, html);
  }
  function rowActions(table, r, includeView = true) {
    const b = (label, action, allowed = true, extra = "") => button(label, action, `data-table="${table}" data-id="${h(r.id)}" ${extra}`, false, allowed);
    let out = table === "logs" || !includeView ? "" : b("查看", "detail");
    if (table === "repairRegisters") return scope === "school" ? b("修改", "repair-edit", permit("admin", "teacher")) + b("删除", "repair-delete", permit("admin")) : "";
    if (table === "scrapRegisters") return scope === "school" ? b("删除", "scrap-delete", permit("admin")) : "";
    if (table === "lossRegisters") return scope === "school" ? b("删除", "loss-delete", permit("admin")) : "";
    if (["consumableTotal", "consumableLedger"].includes(table)) return "";
    if (["schools", "departments", "staff", "rooms", "cabinets", "classes", "terms", "periods"].includes(table)) { const allowed = ["schools", "terms"].includes(table) ? permit("district") : table === "cabinets" ? permit("admin") : permit("district", "admin"); out += b("编辑", "base-edit", allowed) + b("删除", "base-delete", allowed); }
    if (table === "cabinets") out += b("下载柜卡", "cabinet-card", permit("admin", "district"));
    if (table === "staff" && scope === "school" && r.role === "teacher") out += b("设置任课班级", "teacher-classes", permit("admin"));
    if (table === "assets" && scope === "school" && !r.pendingReceiptId && r.state !== "已报废") out += b("调整位置", "storage-move", permit("admin")) + b("修改", "asset-edit", permit("admin"));
    if (table === "purchases") { if (r.state === "待审核") out += scope === "district" ? b("审批", "decide") : b("修改", "purchase-edit", permit("admin")) + b("撤销", "purchase-cancel", permit("admin")) + b("删除", "purchase-delete", permit("admin")); if (["已驳回", "已撤销"].includes(r.state) && scope === "school") out += b("删除", "purchase-delete", permit("admin")); if (r.state === "已通过" && scope === "school") out += b("到货入库", "receipt", permit("admin")); }
    if (table === "receipts" && scope === "school") { if (["已入库", "待库存复核"].includes(r.state)) out += b("修改", "receipt-edit", permit("admin")); if (["已入库", "待库存复核", "库存复核驳回"].includes(r.state)) out += b("删除", "receipt-delete", permit("admin")); }
    if (table === "inventory" && scope === "school" && !r.pendingReceiptId) {
      const item = M.itemOf(db, r), room = get("rooms", r.roomId), usable = roomFitsStoredItem(room, item), expiredHazard = expiredHazardStock(r), available = flowAvailableStock(r);
      if (r.roomId) {
        if (usable && !expiredHazard && available > 0) out += b("领用", "flow", true, 'data-kind="领用"');
        if (usable && !expiredHazard) out += b("入库", "flow", permit("admin"), 'data-kind="入库"');
        if (permit("admin") && returnableSourcesFor(r.id).length) out += b("退回", "flow", true, 'data-kind="退回"');
        if (available > 0) out += b("损耗/处置", "flow", permit("admin"), 'data-kind="损耗"');
      }
      out += b("调整位置", "storage-move", permit("admin")) + b("编辑阈值", "inventory-edit", permit("admin"));
    }
    if (table === "flows" && r.state === "待复核" && scope === "school") out += b("复核", "decide", permit("admin") && r.applicant !== actor.name);
    if (table === "plans" && scope === "school" && permit("admin")) { if (r.state === "已发布") out += b("修改", "plan-edit") + b("归档", "plan-archive"); if (["已发布", "已归档"].includes(r.state)) out += b("删除", "plan-delete"); }
    if (table === "customExperiments" && scope === "school") { const canMaintain = permit("admin") || (r.createdBy === actor.id || r.createdBy === actor.name) && subjectAllowed(r.subject); out += b("编辑", "innovation-edit", canMaintain); out += b("删除", "innovation-delete", canMaintain); }
    if (table === "teachingTasks" && scope === "school" && ["待预约", "已取消"].includes(r.state)) out += b("预约实验", "booking-new", permit("admin", "teacher") && (actor.role !== "teacher" || r.teacherId === actor.id));
    if (table === "bookings" && scope === "school") { const stored = get("bookings", r.id), arrangement = db.arrangements.find(a => a.bookingId === r.id && a.state !== "已取消"); if (stored.state === "待安排") { out += b("修改预约", "booking-resubmit", permit("admin") || actor.role === "teacher" && stored.teacherId === actor.id); if (permit("admin")) out += b("安排实验", "booking-arrange") + b("退回修改", "booking-return"); } if (stored.state === "已退回" && (permit("admin") || actor.role === "teacher" && stored.teacherId === actor.id)) out += b("修改重提", "booking-resubmit"); if (arrangement?.state === "已安排") out += b("修改安排", "arrangement-edit", permit("admin"), `data-arrangement-id="${h(arrangement.id)}"`) + button("填写总结", "booking-summary", `data-table="arrangements" data-id="${h(arrangement.id)}"`, false, permit("admin", "teacher") && (actor.role !== "teacher" || stored.teacherId === actor.id)); if (["待安排", "已退回"].includes(stored.state) || arrangement?.state === "已安排") out += b(arrangement ? "取消安排" : "取消预约", "booking-cancel", permit("admin", "teacher") && (actor.role !== "teacher" || stored.teacherId === actor.id)); if (["待安排", "已退回", "已取消"].includes(stored.state) && !arrangement) out += b("删除", "booking-delete", permit("admin")); }
    if (table === "arrangements" && scope === "school") { const booking = get("bookings", r.bookingId); if (r.state === "已安排") out += b("修改安排", "arrangement-edit", permit("admin")) + b("填写总结", "booking-summary", permit("admin", "teacher") && (actor.role !== "teacher" || booking?.teacherId === actor.id)); }
    if (table === "summaries" && scope === "school") out += b("修改", "summary-edit", permit("admin", "teacher")) + b("删除", "summary-delete", permit("admin"));
    if (table === "tasks") { if (scope === "school" && r.state === "待检查") out += b("填报检查", "check-new", permit("admin")); if (scope === "district" && r.state === "待检查") out += b("修改", "task-edit") + b("删除", "task-delete-record"); }
    if (table === "checks" && scope === "school" && !db.hazards.some(hazard => hazard.checkId === r.id)) out += b("修改", "check-edit", permit("admin")) + b("删除", "check-delete", permit("admin"));
    if (table === "hazards") { if (scope === "school" && ["待整改", "整改中"].includes(r.state)) out += b("修改", "hazard-edit", permit("admin")) + b("整改附件", "attachment", permit("admin")) + b("提交整改", "hazard-submit", permit("admin")); if (scope === "school" && r.state === "待整改") out += b("删除", "hazard-delete", permit("admin")); if (scope === "district" && r.state === "待复查") out += b("复查", "decide"); }
    if (table === "resources") { const canMaintain = permit("admin") || r.uploaderId === actor.id && subjectAllowed(r.subject); out += b("预览", "resource-preview"); out += b("下载", "resource-download"); out += b("编辑", "resource-edit", canMaintain); out += b("删除", "resource-delete", canMaintain); }
    if (table === "archives") { out += b("下载", "file-download"); if (r.state === "待归档") out += b("修改", "archive-edit", permit("admin")) + b("确认归档", "archive-confirm", permit("admin")) + b("删除", "archive-delete", permit("admin")); }
    return out;
  }
  function actionsFor(table) {
    if (["consumableTotal", "consumableLedger", "lossRegisters", "repairRegisters", "scrapRegisters"].includes(table)) {
      let out = button("导出Excel", "export");
      if (scope === "school" && table === "lossRegisters") out += button("登记损耗", "loss-new", "", true, permit("admin"));
      if (scope === "school" && table === "repairRegisters") out += button("登记", "repair-new", "", true, permit("admin", "teacher"));
      if (scope === "school" && table === "scrapRegisters") out += button("登记报废", "scrap-new", "", true, permit("admin"));
      return out;
    }
    let out = button(pageId === "archives" ? "批量下载" : "导出当前列表", pageId === "archives" ? "archive-batch" : "export");
    if (["schools", "departments", "staff", "rooms", "cabinets", "classes", "terms", "periods"].includes(table)) out += button(`新增${M.tableNames[table]}`, "base-edit", `data-table="${table}"`, true, ["schools", "terms"].includes(table) ? permit("district") : table === "cabinets" ? permit("admin") : permit("district", "admin"));
    if (["devices", "equipment"].includes(pageId)) out += scope === "school" ? button("模板导入", "import", "", false, permit("admin")) + button("采购申请", "purchase-new", "", false, permit("admin")) + button("新增设备/入库", "receipt", "", true, permit("admin")) : button("统计分析", "asset-report", "", true);
    if (["safety", "inspections"].includes(pageId) && table === "inventory") out += scope === "school" ? button("登记危化品库存", "inventory-edit", "", true, permit("admin")) : button("导出风险清单", "risk-report", "", true);
    if (table === "plans") out += button("查看完成统计", "teaching-report") + button("编制实验计划", "plan-new", "", true, permit("admin", "teacher"));
    if (table === "customExperiments") out += button("新建创新实验", "innovation-new", "", true, permit("admin", "teacher"));
    if (pageId === "booking") out += button("新增预约", "booking-new", "", true, permit("admin", "teacher"));
    if (["safety", "inspections"].includes(pageId)) out += scope === "district" ? button("发起危化品专项检查", "task-new", "", true) : button("新增危化品检查", "check-new", "", true, permit("admin"));
    if (pageId === "archives") out += button("上传资源", "resource-new", "", true, permit("admin", "teacher"));
    if (pageId === "schedule") out += button("生成监管报告", "teaching-report", "", true);
    return out;
  }
  function referenceFilterFields(table) {
    const years = [...new Set([M.TODAY.slice(0, 4), ...db.flows.map(flow => String(flow.date || "").slice(0, 4)).filter(Boolean)])].sort().reverse(), categories = [...new Set(referenceStocks().map(stock => M.itemOf(db, stock)?.category).filter(Boolean))], rooms = records("rooms"), dateLabel = table === "repairRegisters" ? "维修日期" : table === "scrapRegisters" ? "报废日期" : "损耗日期";
    if (table === "consumableTotal") return field("year", "年份", view.year, "text", years, false) + field("category", "仪器分类", view.category, "text", [["", "全部分类"], ...categories], false);
    if (table === "consumableLedger") { const stocks = referenceStocks().filter(stock => !view.category || M.itemOf(db, stock)?.category === view.category); return field("year", "年份", view.year, "text", years, false) + field("category", "仪器分类", view.category, "text", [["", "全部分类"], ...categories], false) + ledgerItemFilterField(view.itemId, stocks); }
    const location = table === "repairRegisters" ? field("category", "分类", view.category, "text", [["", "全部分类"], ...new Set(records("assets").map(asset => M.itemOf(db, asset)?.category).filter(Boolean))], false) : field("roomId", "房间或橱柜", view.roomId || "", "text", [["", "全部位置"], ...opts("rooms", rooms, room => `${room.roomNo} · ${room.name}`)], false);
    return field("date", dateLabel, view.date, "date", null, false) + field("endDate", "至", view.endDate, "date", null, false) + location + field("keyword", "检索条件", view.keyword, "text", null, false);
  }
  function safetyOverview() {
    const stocks = records("inventory").filter(row => M.isHazard(M.itemOf(db, row))), openHazards = records("hazards").filter(row => row.state !== "已关闭"), overdue = openHazards.filter(row => row.due && row.due < M.TODAY), pendingChecks = records("tasks").filter(row => row.state === "待检查"), riskStocks = stocks.filter(row => {
      const linked = openHazards.some(hazard => hazard.roomId === row.roomId), expiryRisk = row.expiry && row.expiry <= addDays(M.TODAY, 30);
      return !row.roomId || row.stock < row.min || expiryRisk || linked || row.pendingReceiptId;
    });
    const metric = (value, label, tone = "") => `<div class="summary-item ${tone}"><div class="summary-value">${h(value)}</div><div class="summary-label">${h(label)}</div></div>`;
    return `<section class="safety-overview" aria-label="危化品安全概览"><div class="safety-overview-head"><div><strong>危化品安全概览</strong><p>以危化品库存为对象，集中查看存放、有效期、检查和整改状态。</p></div><div class="safety-overview-actions">${button("查看危化品台账", "tab", 'data-tab="hazardInventory"')}${scope === "district" ? button("生成风险清单", "risk-report") : ""}</div></div><div class="summary-strip">${metric(stocks.length, scope === "district" ? "危化品库存记录" : "本校危化品库存")}${metric(riskStocks.length, "需要关注的库存", riskStocks.length ? "risk" : "")}${metric(pendingChecks.length, "待执行专项检查", pendingChecks.length ? "risk" : "")}${metric(overdue.length, "逾期未关闭隐患", overdue.length ? "risk" : "")}</div><p class="safety-overview-note">检查表建议覆盖账物核对、存放条件、包装标识、有效期、领用复核和待处置物品；检查发现的问题将进入隐患整改和区级复查流程。</p></section>`;
  }
  function listView(data) {
    if (data.table === "settings") return settingsView();
    if (pageId === "archives") return resourceListView(data);
    const states = data.table === "inventory" && view.tab === "hazardInventory" ? [...new Set(data.allRows?.flatMap(r => String(r.riskText || "").split("、")).filter(Boolean))] : [...new Set(data.allRows?.map(r => r.state || r.result).filter(Boolean))];
    const start = (view.page - 1) * 8; if (start >= data.rows.length && view.page > 1) view.page = 1;
    const pageRows = data.rows.slice((view.page - 1) * 8, view.page * 8), max = Math.max(1, Math.ceil(data.rows.length / 8));
    const classFilterOptions = opts("classes", records("classes").filter(c => !view.grade || c.grade === view.grade), c => c.name);
    const showTeacherFilter = data.table === "report" && actor.role !== "teacher";
    const extraFilters = (data.table === "report" || data.table === "plans" || data.table === "teachingTasks")
      ? field("classId", "班级", view.classId || "", "text", [["", "全部班级"], ...classFilterOptions], false)
      + (showTeacherFilter ? field("teacherId", "任课教师", view.teacherId || "", "text", [["", "全部教师"], ...opts("staff", records("staff").filter(t => t.role === "teacher"))], false) : "")
      : "";
    const subjectFilter = !subjectContextEnabled() && !["safety", "inspections"].includes(pageId) && (data.table === "report" || data.allRows?.some(r => r.subject)) ? field("subject", "学科", view.subject, "text", [["", "全部学科"], ...M.subjectOptionsFor(), ["综合", "综合"].filter((value, index, arr) => arr.indexOf(value) === index)], false) : "";
    const filters = data.reference ? referenceFilterFields(data.table) : field("keyword", "关键词", view.keyword, "text", null, false) + (states.length ? field("state", "状态", view.state, "text", [["", "全部状态"], ...states], false) : "") + subjectFilter + (["report", "bookings", "plans", "planItems", "teachingTasks", "classes"].includes(data.table) ? field("grade", "年级", view.grade, "text", [["", "全部年级"], ...new Set(db.classes.map(c => c.grade))], false) : "") + extraFilters;
    const showActions = !data.reference || scope === "school" && ["repairRegisters", "scrapRegisters", "lossRegisters"].includes(data.table);
    return `${["safety", "inspections"].includes(pageId) ? safetyOverview() : ""}${pageId === "booking" ? calendar() : ""}${["devices", "equipment"].includes(pageId) ? `<section class="scanner"><div><strong>资产编号查询</strong><p class="help">扫描条码或输入编号；支持扫码枪键盘输入后回车。</p></div><form id="scanForm" class="compose-row"><input class="input" name="code" aria-label="资产编号" placeholder="例如 QP001-2024-001" required><button class="button primary" type="submit">查询</button></form></section>` : ""}${tabsMarkup()}
      <section class="table-panel"><form class="filter-bar" id="filterForm">${filters}<div class="filter-actions"><button class="button primary" type="submit">查询</button>${button("重置", "filter-reset")}</div></form>
      <div class="table-wrap"><table class="data-table"><thead><tr><th><input type="checkbox" id="selectAll" aria-label="选择本页记录"></th>${data.columns.map(([, label]) => `<th scope="col">${h(label)}</th>`).join("")}${showActions ? "<th>操作</th>" : ""}</tr></thead><tbody>${pageRows.map(r => `<tr><td><input type="checkbox" data-select="${h(r.id)}" aria-label="选择 ${h(r.name || r.id)}" ${selected.has(r.id) ? "checked" : ""}></td>${data.columns.map(([key]) => `<td${["name", "experimentName", "chapter", "itemsText", "reason", "title", "note", "relatedName", "riskText"].includes(key) || String(r[key] ?? "").length > 24 ? ' class="cell-wrap"' : ""}>${key === "state" || key === "result" || key === "riskText" ? status(r[key] || "未填写") : h(r[key] ?? "未填写")}</td>`).join("")}${showActions ? `<td><div class="row-actions">${data.table === "report" ? button("查看明细", "report-plans", `data-name="${h(r.name)}"`) : rowActions(data.table, r)}</div></td>` : ""}</tr>`).join("") || `<tr><td colspan="${data.columns.length + (showActions ? 2 : 1)}"><div class="empty-message">当前条件下暂无记录。可更换筛选条件，或通过页面上方操作新增业务。</div></td></tr>`}</tbody></table></div>
      <footer class="table-footer"><span>筛选结果 ${data.rows.length} 条 · 已选 ${selected.size} 条 · 每页8条</span><div class="pagination">${button("上一页", "page-prev", "", false, view.page > 1)}<span>${view.page} / ${max}</span>${button("下一页", "page-next", "", false, view.page < max)}</div></footer></section>
      ${["schedule", "experiments"].includes(pageId) ? '<p class="help">统计口径：计划实验按“必做、选做、创新实验”分别计数，并按适用班级形成应开次数；只有对应实验安排提交总结后计入实开。计划列表汇总展示各班执行进度。</p>' : ""}`;
  }
  function resourceListView(data) {
    const start = (view.page - 1) * 8, pageRows = data.rows.slice(start, start + 8), max = Math.max(1, Math.ceil(data.rows.length / 8));
    const gradeOptions = M.resourceGrades;
    const filters = field("keyword", "关键词", view.keyword, "text", null, false) + (!subjectContextEnabled() ? field("subject", "学科", view.subject, "text", [["", "全部学科"], ...M.subjectOptionsFor()], false) : "") + field("grade", "年级", view.grade, "text", [["", "全部年级"], ...gradeOptions], false) + field("category", "实验属性", view.category, "text", [["", "全部属性"], ...M.resourceCategories], false);
    const actionRows = row => rowActions("resources", row);
    return `${tabsMarkup()}<section class="resource-library"><form class="filter-bar resource-filter-bar" id="filterForm">${filters}<div class="filter-actions"><button class="button primary" type="submit">查询资源</button>${button("重置", "filter-reset")}</div></form><div class="resource-list-head"><span>共 ${data.rows.length} 份资源</span><span>可按学科、年级和实验属性组合检索</span></div><div class="table-wrap"><table class="data-table resource-table"><thead><tr><th><input type="checkbox" id="selectAll" aria-label="选择本页资源"></th><th>资源名称</th><th>资源类型</th><th>学科</th><th>适用年级</th><th>实验属性</th><th>上传人</th><th>更新时间</th><th>操作</th></tr></thead><tbody>${pageRows.map(row => `<tr><td><input type="checkbox" data-select="${h(row.id)}" aria-label="选择 ${h(row.title)}" ${selected.has(row.id) ? "checked" : ""}></td><td><button type="button" class="resource-title-button" data-action="resource-detail" data-table="resources" data-id="${h(row.id)}"><span class="resource-file-icon ${h(row.extension || "file")}">${h((row.extension || "文件").slice(0, 4).toUpperCase())}</span><span><strong>${h(row.title)}</strong><small>${h(row.originalName || "未登记文件")} · ${h(row.fileText || "")}</small></span></button></td><td>${h(row.resourceType)}</td><td>${h(row.subject)}</td><td><div class="resource-tags">${(row.grades || []).map(grade => `<span class="tag">${h(grade)}</span>`).join("")}</div></td><td><span class="resource-category ${row.experimentCategory === "创新实验" ? "innovative" : row.experimentCategory === "选做" ? "optional" : "required"}">${h(row.experimentCategory)}</span></td><td>${h(row.uploaderName)}</td><td>${h(row.updatedText)}</td><td><div class="row-actions">${actionRows(row)}</div></td></tr>`).join("") || `<tr><td colspan="9"><div class="empty-message">当前条件下暂无资源。请调整筛选条件，或上传第一份教学资源。</div></td></tr>`}</tbody></table></div><footer class="table-footer"><span>筛选结果 ${data.rows.length} 条 · 已选 ${selected.size} 条 · 每页8条</span><div class="pagination">${button("上一页", "page-prev", "", false, view.page > 1)}<span>${view.page} / ${max}</span>${button("下一页", "page-next", "", false, view.page < max)}</div></footer></section>`;
  }
  function tabsMarkup() { return `<div class="tabs" role="tablist" aria-label="业务分类">${tabsFor().map(([id, label]) => `<button class="tab ${view.tab === id ? "active" : ""}" type="button" role="tab" aria-selected="${view.tab === id}" data-action="tab" data-tab="${h(id)}">${h(label)}</button>`).join("")}</div>`; }
  function addDays(d, n) { const date = new Date(`${d}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + n); return date.toISOString().slice(0, 10); }
  function calendar() {
    const term = get("terms", view.term); if (view.week < term.start) view.week = term.start; if (view.week > term.end) view.week = term.end;
    const day = new Date(`${view.week}T12:00:00Z`).getUTCDay(), monday = addDays(view.week, -(day + 6) % 7), days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const rows = records("bookings").map(row => decorate("bookings", row)).filter(row => row.term === view.term && (actor.role !== "teacher" || row.teacherId === actor.id) && rowMatchesSubject("bookings", row));
    const periods = enabledPeriodsFor(view.term).sort((a, b) => Number(a.number) - Number(b.number));
    const eventFor = (date, period) => rows.filter(row => { const arrangement = get("arrangements", row.arrangementId), eventDate = arrangement?.scheduledDate || row.requestedDate, start = arrangement?.startPeriod || row.requestedPeriod, end = arrangement?.endPeriod || start; return eventDate === date && Number(start) <= Number(period.number) && Number(period.number) <= Number(end); });
    const eventClass = row => row.state === "已完成" ? "done" : row.state === "已安排" ? "arranged" : row.state === "已取消" || row.state === "已拒绝" ? "cancelled" : "pending";
    const cell = (date, period) => eventFor(date, period).map(row => `<button type="button" class="timetable-event ${eventClass(row)}" data-action="detail" data-table="bookings" data-id="${h(row.id)}"><strong>${h(row.experimentName)}</strong><span>${h(row.className)} · ${h(row.teacherName)}</span><small>${h(row.arrangementPlace || "待安排")}</small></button>`).join("") || `<button type="button" class="timetable-empty" data-action="date" data-date="${date}" aria-label="${h(date)}第${h(period.number)}节，暂无安排">+</button>`;
    return `<section class="calendar timetable-card"><div class="calendar-head"><div><strong>实验课表</strong><span class="calendar-range">${h(monday)} 至 ${h(addDays(monday, 6))}</span></div>${field("calendarWeek", "课表周次", M.weekOf(term, view.week), "text", Array.from({ length: M.weekOf(term, term.end) }, (_, i) => [i + 1, `第${i + 1}周`]), false, 'data-calendar-week="true"')}<div class="inline-actions">${button("上周", "week-prev")}${button("回到当前日期", "today")}${button("下周", "week-next")}${button("全部日期", "all-dates")}</div></div><div class="timetable-scroll"><div class="timetable-grid"><div class="timetable-corner">节次</div>${days.map((date, i) => `<button type="button" class="timetable-day ${view.date === date ? "selected" : ""}" data-action="date" data-date="${date}"><strong>星期${["一", "二", "三", "四", "五", "六", "日"][i]}</strong><span>${date}</span><small>${rows.filter(row => (get("arrangements", row.arrangementId)?.scheduledDate || row.requestedDate) === date).length} 条安排</small></button>`).join("")}${periods.map(period => `<div class="timetable-period"><strong>${h(period.number)}</strong><span>${h(period.name || `第${period.number}节`)}</span><small>${h(period.start)}-${h(period.end)}</small></div>${days.map(date => `<div class="timetable-cell ${view.date === date ? "is-selected" : ""}">${cell(date, period)}</div>`).join("")}`).join("")}</div></div><div class="timetable-legend"><span><i class="legend-dot arranged"></i>已安排</span><span><i class="legend-dot pending"></i>待安排</span><span><i class="legend-dot done"></i>已完成</span><span><i class="legend-dot cancelled"></i>已取消/拒绝</span></div><p class="help">已安排记录按最终安排日期和节次显示；待安排预约按申请日期和申请节次显示。点击安排可查看详情，点击空白格可筛选当天记录。</p></section>`;
  }
  function own(table) { return M.scoped(db, table, actor.school); }
  function baseForm(table, id) {
    const r = get(table, id) || {}, s = r.school || school() || db.schools[0].id;
    const schoolTables = ["departments", "staff", "rooms", "cabinets", "classes", "assignments", "periods"], activeSubject = !isAllSubject(view.subject) ? M.normalizeSubject(view.subject) : "", subjectContext = r.subject || (actor.role === "teacher" ? M.normalizeSubject(get("staff", actor.id)?.subject || "") : activeSubject || "物理"), roomSubject = r.id ? r.subject || "" : activeSubject, staffIdentityLocked = table === "staff" && r.id && (db.assignments.some(assignment => assignment.teacherId === r.id) || db.teachingTasks.some(task => task.teacherId === r.id)), identityLockAttrs = staffIdentityLocked ? 'disabled data-submit-disabled="true"' : "";
    let html = scope !== "school" && schoolTables.includes(table) ? field("school", "所属学校", s, "text", opts("schools", db.schools), true, r.id ? "disabled" : 'data-base-school="true"') : "";
    if (table === "schools") html += field("name", "学校名称", r.name) + field("code", "学校代码", r.code) + field("stage", "学段", r.stage || "高中", "text", ["小学", "初中", "高中", "完全中学", "九年一贯制"]);
    if (table === "departments") html += field("name", "部门名称", r.name) + field("state", "状态", r.state || "启用", "text", ["启用", "停用"]);
    if (table === "terms") { const scopeLocked = r.id && db.plans.some(plan => plan.term === r.id), lockAttrs = scopeLocked ? 'disabled data-submit-disabled="true"' : ""; html += field("name", "学期名称", r.name) + field("start", "学期开始", r.start || M.TODAY, "date", null, true, lockAttrs) + field("end", "学期结束", r.end || "2027-01-29", "date", null, true, lockAttrs) + (scopeLocked ? '<p class="help full">学期已被实验计划引用，起止日期已锁定；请新建学期。</p>' : ""); }
    if (table === "staff") html += field("name", "姓名", r.name) + field("sex", "性别", r.sex || "", "text", [["", "未登记"], "男", "女"], false) + field("departmentId", "部门", r.departmentId || "", "text", [["", "未登记"], ...opts("departments", db.departments.filter(d => d.school === s && d.state === "启用"))], false) + field("phone", "手机号码", r.phone || "", "text", null, false) + field("role", "账号角色", r.role || "teacher", "text", Object.entries(M.roles).filter(([key]) => key !== "district"), true, identityLockAttrs) + field("subject", "专业／任教学科", r.subject || "物理", "text", [...M.subjectOptionsFor(), ["综合", "综合"]], true, identityLockAttrs) + field("title", "岗位职称", r.title || "一级教师") + field("qualification", "资质说明", r.qualification || "", "textarea", null, false) + check("enabled", "启用账号", r.enabled !== false) + `<p class="help full">人员基本信息与账号角色在真实系统中应分表；任课教师的任课班级请在人员列表中点击“设置任课班级”。${staffIdentityLocked ? "该人员已用于任课或实验计划执行，账号角色和专业学科已锁定。" : ""}</p>`;
    if (table === "rooms") { const activeUse = r.id && db.arrangements.some(arrangement => arrangement.roomId === r.id && M.activeArrangement(arrangement)), stored = r.id && (db.assets.some(asset => asset.roomId === r.id) || db.inventory.some(stock => stock.roomId === r.id)), hazardStored = r.id && db.inventory.some(stock => stock.roomId === r.id && M.isHazard(M.itemOf(db, stock))), activeLock = activeUse ? 'disabled data-submit-disabled="true"' : "", subjectLock = activeUse || stored ? 'disabled data-submit-disabled="true"' : ""; html += field("name", "名称", r.name) + field("type", "实验室类型", r.type || "教学实验室", "text", ["教学实验室", "准备室", "仪器室", "普通教室", "其他"], true, `data-room-type="true" ${activeLock}`) + field("subject", "实验室学科", roomSubject, "text", [["", "不限定学科"], ...M.subjectOptionsFor()], false, subjectLock) + field("state", "实验室状态", r.state || "可用", "text", ["可用", "停用"], true, activeLock) + field("roomNo", "实验室号", r.roomNo) + field("area", "实际使用面积（㎡）", r.area ?? "", "number", null, false, 'min="0.01" step="0.01"') + field("seats", "座位数", r.seats ?? "", "number", null, false, `min="1" step="1" ${activeLock}`) + field("builder", "建造商", r.builder || "", "text", null, false) + field("builtAt", "建造日期", r.builtAt || "", "date", null, false) + field("stage", "所属学段", r.stage || get("schools", s)?.stage, "text", ["小学", "初中", "高中", "完全中学", "九年一贯制"], false) + check("hazardStorage", "具备危化品存放条件", r.hazardStorage === true, hazardStored ? "disabled" : "") + field("features", "特征或功能", r.features || "", "textarea", null, false, 'maxlength="500"') + field("note", "备注（最多60字）", r.note || "", "textarea", null, false, 'maxlength="60"') + `<p class="help full" id="roomSubjectHelp"></p><p class="help full">危化品只能存入明确具备危化品存放条件的可用实验室。面积、座位数均非通用必填项。${activeUse ? "当前存在有效实验安排，类型、学科、状态和座位数已锁定。" : stored ? "当前实验室已存放物品，实验室学科已锁定。" : ""}${hazardStored ? "当前实验室已有危化品库存，危化品存放能力已锁定。" : ""}</p>`; }
    if (table === "cabinets") { const rooms = db.rooms.filter(room => room.school === s && (room.state === "可用" || room.id === r.roomId)), custodians = db.staff.filter(person => person.school === s && (person.enabled || person.id === r.custodianId)); html += field("code", "橱柜编号", r.code || "") + field("name", "橱柜名称", r.name || "") + field("roomId", "所属房间", r.roomId || rooms[0]?.id || "", "text", opts("rooms", rooms, room => `${room.roomNo} · ${room.name}${room.state === "停用" ? "（已停用）" : ""}`)) + field("type", "橱柜类型", r.type || "仪器柜", "text", ["仪器柜", "耗材柜", "危化品专用柜", "其他"]) + field("custodianId", "保管责任人", r.custodianId || "", "text", [["", "未指定"], ...opts("staff", custodians, person => `${person.name} · ${M.roles[person.role]}${person.enabled ? "" : "（已停用）"}`)], false) + check("hazardStorage", "具备危化品存放条件", r.hazardStorage === true) + field("state", "使用状态", r.state || "启用", "text", ["启用", "停用"]) + field("note", "备注", r.note || "", "textarea", null, false, 'maxlength="200"') + `<p class="help full">橱柜必须隶属于可用房间才能启用；危化品专用柜的所属房间须具备危化品存放条件。已有存放物品的橱柜不能直接更换房间。</p>`; }
    if (table === "classes") { const gradeLocked = r.id && db.teachingTasks.some(task => task.classId === r.id), lockAttrs = gradeLocked ? 'disabled data-submit-disabled="true"' : ""; html += field("name", "班级名称", r.name) + field("grade", "年级", r.grade || "高一", "text", ["一年级", "二年级", "三年级", "四年级", "五年级", "六年级", "初一", "初二", "初三", "高一", "高二", "高三"], true, lockAttrs) + field("students", "学生人数", r.students || 40, "number", null, true, 'min="1"') + field("state", "状态", r.state || "在读", "text", ["在读", "停用"]) + `<p class="help full">班级表单只维护班级自身信息；任课教师请在“人员与班级”的“任课教师”中设置。${gradeLocked ? "班级已有实验计划执行记录，年级已锁定。" : ""}</p>`; }
    if (table === "assignments") { const assignmentSubject = r.subject || subjectContext, relationLocked = r.id && db.teachingTasks.some(task => task.assignmentId === r.id), lockAttrs = relationLocked ? 'disabled data-submit-disabled="true"' : ""; html += field("term", "学期", r.term || view.term, "text", opts("terms", db.terms), true, lockAttrs) + field("classId", "班级", r.classId || "", "text", opts("classes", db.classes.filter(c => c.school === s && (c.state === "在读" || c.id === r.classId))), true, lockAttrs) + field("subject", "学科", assignmentSubject, "text", M.subjectOptionsFor(), true, `data-assignment-subject="true" ${lockAttrs}`) + field("teacherId", "任课教师", r.teacherId || "", "text", opts("staff", db.staff.filter(t => t.school === s && t.enabled && t.role === "teacher" && (M.subjectEquals(t.subject, assignmentSubject) || t.subject === "综合")), t => `${t.name} · ${subjectLabel(t.subject)}`), true, lockAttrs) + check("primary", "主教师", r.primary !== false, relationLocked ? "disabled" : "") + field("state", "状态", r.state || "有效", "text", ["有效", "停用"]) + `<p class="help full">任课学科须与教师专业学科一致；“综合”教师可跨学科任教。有效主教师关系用于确定各班实验计划执行人。${relationLocked ? "该任课关系已用于实验计划执行，学期、班级、学科、教师和主教师属性已锁定。" : ""}</p>`; }
    if (table === "periods") { const term = get("terms", view.term), bookingUses = booking => booking.school === s && get("teachingTasks", booking.taskId)?.term === view.term && Number(booking.requestedPeriod) === r.number, arrangementUses = arrangement => { const booking = get("bookings", arrangement.bookingId); return arrangement.school === s && get("teachingTasks", booking?.taskId)?.term === view.term && Number(arrangement.startPeriod) <= r.number && r.number <= Number(arrangement.endPeriod); }, scheduleLocked = r.id && (db.bookings.some(bookingUses) || db.arrangements.some(arrangementUses)), lockAttrs = scheduleLocked ? 'disabled data-submit-disabled="true"' : ""; html += `<div class="full context-note"><strong>当前学期：</strong>${h(term.name)}<br><span class="help">节次表按学期独立维护，保存时固定归入当前学期。</span></div>` + field("number", "节次", r.number || 1, "number", null, true, `min="1" step="1" ${lockAttrs}`) + field("name", "名称", r.name || "第1节") + field("start", "开始时间", r.start || "08:00", "time", null, true, lockAttrs) + field("end", "结束时间", r.end || "08:45", "time", null, true, lockAttrs) + field("state", "状态", r.state || "启用", "text", ["启用", "停用"], true, lockAttrs) + (scheduleLocked ? '<p class="help full">该节次已被当前学期预约或安排引用，编号、时间和状态已锁定。</p>' : ""); }
    form(`${id ? "编辑" : "新增"}${M.tableNames[table]}`, html, "base.save", { table, id, ...(schoolTables.includes(table) ? { school: s } : {}), ...(table === "periods" ? { term: view.term } : {}) });
    if (table === "rooms") updateRoomFields();
    if (table === "assignments") updateAssignmentTeachers();
  }
  function teacherClassRow(teacher, assignment = {}) {
    const rowId = assignment.id || `NEW-${++formRowSeq}`, relationLocked = !!assignment.id && db.teachingTasks.some(task => task.assignmentId === assignment.id), lockAttrs = relationLocked ? 'disabled data-submit-disabled="true"' : "", classOptions = [["", "请选择任课班级"], ...db.classes.filter(klass => klass.school === teacher.school && (klass.state === "在读" || klass.id === assignment.classId)).map(klass => [klass.id, `${klass.name} · ${klass.grade}`])], subjectOptions = teacher.subject === "综合" ? M.subjectOptionsFor() : [[M.normalizeSubject(teacher.subject), subjectLabel(teacher.subject)]], subjectAttrs = teacher.subject === "综合" ? lockAttrs : `disabled data-submit-disabled="true" ${lockAttrs}`;
    return `<fieldset class="full teacher-class-row" data-teacher-class-row data-assignment-id="${h(assignment.id || "")}"><legend>${assignment.id ? "已设置任课班级" : "新增任课班级"}</legend><div class="form-grid">${field(`teacher-class-${rowId}-classId`, "任课班级", assignment.classId || "", "text", classOptions, true, `data-teacher-class-key="classId" ${lockAttrs}`)}${field(`teacher-class-${rowId}-subject`, "任教学科", assignment.subject || (teacher.subject === "综合" ? "物理" : teacher.subject), "text", subjectOptions, true, `data-teacher-class-key="subject" ${subjectAttrs}`)}${check(`teacher-class-${rowId}-primary`, "主教师", assignment.primary !== false, `data-teacher-class-key="primary" ${relationLocked ? "disabled" : ""}`)}${field(`teacher-class-${rowId}-state`, "状态", assignment.state || "有效", "text", ["有效", "停用"], true, 'data-teacher-class-key="state"')}${relationLocked ? '<p class="help full">该任课班级已用于实验计划执行，班级、学科、教师和主教师属性已锁定；如需变更请新增设置。</p>' : assignment.id ? `<div class="full inline-actions">${button("删除此设置", "base-delete", `data-table="assignments" data-id="${h(assignment.id)}"`)}</div>` : `<div class="full inline-actions">${button("移除", "teacher-class-remove")}</div>`}</div></fieldset>`;
  }
  function teacherClassesForm(teacherId) {
    if (!permit("admin")) throw new Error("设置任课班级需要学校管理员身份。");
    const teacher = get("staff", teacherId);
    if (!teacher || teacher.role !== "teacher" || teacher.school !== actor.school) throw new Error("请选择本校任课教师。");
    const term = get("terms", view.term), assignments = db.assignments.filter(assignment => assignment.teacherId === teacher.id && assignment.term === term.id).sort((a, b) => a.classId.localeCompare(b.classId) || a.subject.localeCompare(b.subject)), rows = assignments.length ? assignments.map(assignment => teacherClassRow(teacher, assignment)).join("") : teacherClassRow(teacher);
    openModal("设置任课班级", fieldsForm(`<div class="full context-note"><strong>任课教师：</strong>${h(teacher.name)}　<strong>本学期：</strong>${h(term.name)}　<strong>专业／任教学科：</strong>${h(subjectLabel(teacher.subject))}<br><span class="help">${teacher.subject === "综合" ? "综合教师可在每条任课班级设置中选择具体学科。" : "任课学科由教师专业／任教学科带入。"}主教师将作为该班实验计划的执行教师。</span></div><div class="full" id="teacherClassRows">${rows}</div><div class="full inline-actions">${button("添加任课班级", "teacher-class-add", `data-teacher-id="${h(teacher.id)}"`, false, permit("admin"))}</div><p class="help full">停用任课班级不会删除已完成历史；已有待安排、待修改或已安排的实验时不能停用。需要更换班级或主教师时，请保留原设置并新增一条设置。</p>`), () => { const formRows = $$('[data-teacher-class-row]').map(row => ({ id: row.dataset.assignmentId || "", classId: $('[data-teacher-class-key="classId"]', row)?.value || "", subject: $('[data-teacher-class-key="subject"]', row)?.value || "", primary: $('[data-teacher-class-key="primary"]', row)?.checked === true, state: $('[data-teacher-class-key="state"]', row)?.value || "有效" })); const result = commit("teacher.assignments.save", { teacherId: teacher.id, term: term.id, rows: formRows }); closeModal(); render(); toast(`已保存${result.assignments.filter(assignment => assignment.state === "有效").length}个有效任课班级。`); }, "保存任课班级");
  }
  function updateRoomFields() {
    const formEl = $("#modalForm"), type = formEl && $('[name="type"]', formEl), subject = formEl && $('[name="subject"]', formEl), help = $("#roomSubjectHelp", formEl);
    if (!type || !subject || !help) return;
    const required = !["普通教室", "其他"].includes(type.value);
    subject.required = required;
    const label = $(".field-label", subject.closest(".field"));
    if (label) label.innerHTML = `实验室学科${required ? ' <span class="required">*</span>' : ""}`;
    help.textContent = required ? "教学实验室、准备室和仪器室须明确学科。" : "普通教室和其他房间可选择“不限定学科”，也可按实际用途登记学科。";
  }
  function updateItemRowFields(row) {
    const category = $('[data-item="category"]', row), tracking = $('[data-item="trackingMode"]', row), maintenance = $('[data-item="maintenanceRequired"]', row), expiry = $('[data-item="expiry"]', row), nextMaintenance = $('[data-item="nextMaintenance"]', row);
    if (!category || !tracking || !maintenance) return;
    const forceQuantity = ["耗材", "危化品"].includes(category.value);
    if (forceQuantity) tracking.value = "QUANTITY";
    tracking.disabled = forceQuantity;
    const quantity = tracking.value === "QUANTITY";
    if (quantity) maintenance.checked = false;
    maintenance.disabled = quantity;
    if (expiry) { const required = category.value === "危化品"; expiry.disabled = !quantity; expiry.required = required; }
    if (nextMaintenance) { nextMaintenance.disabled = quantity || !maintenance.checked; if (nextMaintenance.disabled) nextMaintenance.value = ""; }
  }
  function updateAssignmentTeachers() {
    const formEl = $("#modalForm"), subject = formEl && $('[name="subject"]', formEl), teacher = formEl && $('[name="teacherId"]', formEl), schoolInput = formEl && $('[name="school"]', formEl);
    if (!subject || !teacher) return;
    const schoolId = schoolInput?.value || school(), candidates = db.staff.filter(person => person.school === schoolId && person.enabled && person.role === "teacher" && (M.subjectEquals(person.subject, subject.value) || person.subject === "综合"));
    setOptions(teacher, opts("staff", candidates, person => `${person.name} · ${subjectLabel(person.subject)}`));
  }
  let formRowSeq = 0;
  function itemRow(r = {}, receipt = false, locked = false) {
    const index = ++formRowSeq, f = (key, label, value, type = "text", options = null, required = true, extra = "") => field(`item-${index}-${key}`, label, value, type, options, required, `data-item="${key}" ${extra}`), item = M.itemById(db, r.itemId) || r, spec = r.spec || r.model || item.spec || "", trackingMode = r.trackingMode || item.trackingMode || (["耗材", "危化品"].includes(r.category || item.category) ? "QUANTITY" : "SERIALIZED");
    let fields = f("classificationCode", "分类编号", r.classificationCode || item.classificationCode || "", "text", null, true, locked ? 'disabled data-submit-disabled="true"' : "") + f("name", "物品名称", r.name || item.name || "", "text", null, true, locked ? 'disabled data-submit-disabled="true"' : "") + f("spec", "规格型号", spec, "text", null, true, locked ? 'disabled data-submit-disabled="true"' : "") + f("category", "分类", r.category || item.category || "物理仪器", "text", M.categories, true, `data-item-rule="true" ${locked ? 'disabled data-submit-disabled="true"' : ""}`) + f("unit", "单位", r.unit || item.unit || "台", "text", null, true, locked ? 'disabled data-submit-disabled="true"' : "") + f("trackingMode", "管理方式", trackingMode, "text", [["SERIALIZED", "单件设备"], ["QUANTITY", "数量库存"]], true, `data-item-rule="true" ${locked ? 'disabled data-submit-disabled="true"' : ""}`) + check(`item-${index}-maintenanceRequired`, "需要周期维保", r.maintenanceRequired ?? item.maintenanceRequired ?? trackingMode === "SERIALIZED", locked ? 'disabled data-submit-disabled="true" data-item="maintenanceRequired"' : 'data-item="maintenanceRequired"');
    fields += f("qty", "数量", r.qty ?? 1, "number", null, true, `${locked ? "readonly" : ""} min="1" step="1"`) + f("price", "单价（元）", r.price ?? 0, "number", null, true, `${locked ? "readonly" : ""} min="0" step="0.01"`);
    fields += `<p class="help">总价：<output data-item-total>${money((r.qty ?? 1) * (r.price ?? 0))}</output> 元</p>`;
    if (receipt) { const maintenanceDisabled = !r.maintenanceRequired && !item.maintenanceRequired || trackingMode !== "SERIALIZED", expiryDisabled = trackingMode !== "QUANTITY", roomCabinets = db.cabinets.filter(cabinet => cabinet.roomId === r.roomId && cabinet.state === "启用" && (!M.cabinetFitsItem || M.cabinetFitsItem(db, cabinet, item))); fields += f("roomId", "存放位置（房间）", r.roomId || "", "text", [["", "暂不分配"], ...opts("rooms", storageRoomsFor(item), room => `${room.roomNo} · ${room.name}`)], false, 'data-item-room="true"') + f("cabinetId", "橱柜（可选）", r.cabinetId || "", "text", [["", "直接存放于房间"], ...roomCabinets.map(cabinet => [cabinet.id, `${cabinet.code} · ${cabinet.name}`])], false, 'data-item-cabinet="true"') + f("nextMaintenance", "下次维保日期（仅需维保的单件设备）", maintenanceDisabled ? "" : r.nextMaintenance || "", "date", null, false, maintenanceDisabled ? "disabled" : "") + f("expiry", "有效期（危化品必填）", expiryDisabled ? "" : r.expiry || "", "date", null, M.isHazard(item), expiryDisabled ? "disabled" : ""); }
    return `<fieldset class="full" data-item-row><legend>物品明细</legend><div class="form-grid">${fields}<div class="full">${locked ? "" : button("移除", "item-remove")}</div></div></fieldset>`;
  }
  function readItems() { return $$("[data-item-row]").map(row => Object.fromEntries($$("[data-item]", row).map(el => [el.dataset.item, el.type === "checkbox" ? el.checked : el.value]))); }
  function updateItemTotals() { let total = 0; $$("[data-item-row]").forEach(row => { const value = Number($('[data-item="qty"]', row).value) * Number($('[data-item="price"]', row).value); $('[data-item-total]', row).textContent = Number.isFinite(value) ? money(value) : "—"; total += value; }); if ($('[data-order-total]')) $('[data-order-total]').textContent = Number.isFinite(total) ? money(total) : "—"; }
  function updateItemStorageRooms(row, item) { const room = $('[data-item="roomId"]', row), cabinet = $('[data-item="cabinetId"]', row), maintenance = $('[data-item="nextMaintenance"]', row), expiry = $('[data-item="expiry"]', row); if (room) setOptions(room, [["", "暂不分配"], ...opts("rooms", storageRoomsFor(item), candidate => `${candidate.roomNo} · ${candidate.name}`)]); if (cabinet) setOptions(cabinet, [["", "直接存放于房间"], ...db.cabinets.filter(candidate => candidate.state === "启用" && candidate.roomId === room?.value && (!M.cabinetFitsItem || M.cabinetFitsItem(db, candidate, item))).map(candidate => [candidate.id, `${candidate.code} · ${candidate.name}`])]); if (maintenance) { maintenance.disabled = !item?.maintenanceRequired || item.trackingMode !== "SERIALIZED"; if (maintenance.disabled) maintenance.value = ""; } if (expiry) { const required = M.isHazard(item), label = $(".field-label", expiry.closest(".field")); expiry.disabled = item?.trackingMode !== "QUANTITY"; expiry.required = required; if (expiry.disabled) expiry.value = ""; if (label) label.innerHTML = `有效期（危化品必填）${required ? ' <span class="required">*</span>' : ""}`; } }
  function updateInventoryStorageRooms() { const itemId = $("#f-itemId")?.value || $("#f-classificationCode")?.value, inputItem = { classificationCode: $("#f-classificationCode")?.value || "", name: $("#f-name")?.value || "", spec: $("#f-spec")?.value || "", category: $("#f-category")?.value || "耗材", unit: $("#f-unit")?.value || "个", trackingMode: $("#f-trackingMode")?.value || "QUANTITY" }, item = itemId ? (M.itemById(db, itemId) || inputItem) : inputItem, room = $("#f-roomId"), cabinet = $("#f-cabinetId"), expiry = $("#f-expiry"); if (room && room.hasAttribute("data-inventory-room")) setOptions(room, [["", "暂不分配"], ...opts("rooms", storageRoomsFor(item), candidate => candidate.roomNo + " · " + candidate.name)]); if (cabinet && cabinet.hasAttribute("data-inventory-cabinet")) setOptions(cabinet, [["", "直接存放于房间"], ...own("cabinets").filter(row => row.state === "启用" && row.roomId === room?.value && (!M.cabinetFitsItem || M.cabinetFitsItem(db, row, item))).map(row => [row.id, `${row.code} · ${row.name}`])]); if (expiry) { const required = M.isHazard(item), label = $(".field-label", expiry.closest(".field")); expiry.required = required; if (label) label.innerHTML = "有效期（危化品必填）" + (required ? ' <span class="required">*</span>' : ""); } }
  function receiptFields() { return `<p class="full help">入库单号保存后自动生成；经手人：${h(actor.name)}。存放位置逐项填写，允许暂不分配房间。</p>` + field("supplier", "供应商", "华东教学仪器有限公司") + field("date", "登记日期", M.TODAY, "date") + field("purchaseDate", "购置日期", M.TODAY, "date") + field("note", "备注", "", "textarea", null, false, 'maxlength="500"'); }
  function receiptEditForm(id) {
    const row = get("receipts", id); if (!row) throw new Error("入库单不存在，请刷新后重试。");
    openModal("修改入库单信息", fieldsForm(`<p class="full help">入库明细已生成资产或库存，只允许更正供应商、登记日期、购置日期和备注；删除入库单会在无下游业务时统一回滚明细。</p>${field("supplier", "供应商", row.supplier)}${field("date", "登记日期", row.date, "date")}${field("purchaseDate", "购置日期", row.purchaseDate || row.date, "date")}${field("note", "备注", row.note || "", "textarea", null, false, 'maxlength="500"')}`), values => { const result = commit("receipt.update", { id: row.id, ...values }); closeModal(); render(); detail("receipts", result.id); toast("入库单信息已修改。"); }, "保存修改");
  }
  function purchaseForm(receipt = false, id) {
    const order = receipt ? get("purchases", id) : null, current = !receipt && id ? get("purchases", id) : null, lines = order?.items || current?.items || [{}];
    let html = receipt ? receiptFields() : field("purpose", "采购用途", current?.purpose || "", "textarea") + field("date", "申请日期", current?.date || M.TODAY, "date");
    html += `<div class="full"><h3>${order ? `采购单 ${h(order.id)} · 整单到货` : "物品明细"}</h3><div class="form-grid" id="itemRows" data-receipt="${receipt}">${lines.map(r => itemRow(r, receipt, !!order)).join("")}</div>${order ? "" : button("添加物品", "item-add")}<p>合计：<output data-order-total>${money(lines.reduce((n, i) => n + Number(i.qty || 0) * Number(i.price || 0), 0))}</output> 元</p><p class="help">名称、规格、分类和单位直接登记在采购、入库及台账明细中。采购申请仅在待审核时可修改；入库后通过入库单更正或删除回滚。</p></div>`;
    openModal(receipt ? "到货验收入库" : current ? "修改采购申请" : "新建采购申请", fieldsForm(html), v => { const result = commit(receipt ? "receipt.create" : "purchase.create", { ...v, ...(order ? { purchaseId: id, placements: readItems() } : { id: current?.id || "", items: readItems() }) }); closeModal(); render(); detail(receipt ? "receipts" : "purchases", result.id); toast("业务已保存，相关台账已同步。"); }, receipt ? "确认入库" : current ? "保存修改" : "提交申请");
    updateItemTotals();
  }
  function availableTasks() { return own("teachingTasks").filter(task => { const context = M.taskContext(db, task); return task.term === view.term && ["待预约", "已取消"].includes(task.state) && context.plan.state === "已发布" && context.assignment.state === "有效" && context.assignment.primary && context.klass.state === "在读" && (actor.role !== "teacher" || task.teacherId === actor.id) && (isAllSubject(view.subject) || M.subjectEquals(context.experiment.subject, view.subject)) && !db.bookings.some(booking => booking.taskId === task.id && M.activeBooking(booking)); }); }
  function suggestedDate(context) { return context.item.scheduleType === "DATE" ? context.item.plannedDate : M.weekDate(get("terms", context.plan.term), context.item.plannedWeek); }
  function planInfo(task) { const context = M.taskContext(db, task); return miniTable(col("plan:计划|className:班级|teacherName:任课教师|category:实验属性|source:来源|chapter:章节|name:实验名称|equipment:器材需求|mode:实验类型|suggested:建议时间"), [{ ...context.experiment, plan: context.plan.name, className: context.klass.name, teacherName: context.teacher.name, category: context.experiment.experimentCategory, source: context.experiment.sourceType, mode: context.item.mode, suggested: context.item.scheduleType === "WEEK" ? `第${context.item.plannedWeek}周` : context.item.plannedDate }]); }
  function itemTypesFor(subject = "") {
    const map = new Map();
    [...own("assets"), ...own("inventory"), ...own("purchases").flatMap(row => row.items || []), ...own("receipts").flatMap(row => row.items || []), ...own("bookings").flatMap(row => row.requestedResources || [])].forEach(record => {
      const item = record.name ? record : M.itemOf(db, record), key = item?.itemId || item?.classificationCode;
      if (key && item && (!subject || M.itemFitsSubject(item, subject))) map.set(key, item);
    });
    return [...map.values()];
  }
  function resourceItemKey(item) { return item?.itemId || item?.classificationCode || item?.id || ""; }
  function resourceItemSearch(item) { return [item?.name, item?.classificationCode, item?.spec, item?.category, item?.unit].filter(Boolean).join(" ").toLowerCase(); }
  function resourceSelectedRow(resource, dataKey) {
    const key = resourceItemKey(resource);
    return `<div class="resource-selected-row" data-booking-resource-row="${h(dataKey)}" data-resource-item-key="${h(key)}"><input type="hidden" data-booking-resource-item="${h(dataKey)}" value="${h(key)}"><div class="resource-selected-main"><strong>${h(resource.name || key)}</strong><small>${h([resource.classificationCode, resource.spec, resource.category, resource.unit].filter(Boolean).join(" · "))}</small></div><label class="resource-qty-field"><span>数量</span><input class="input" type="number" min="1" max="100" step="1" value="${h(resource.qty || 1)}" data-booking-resource-qty="${h(dataKey)}" aria-label="${h(resource.name || key)}数量"></label>${button("移除", "booking-resource-remove", `data-resource-key="${h(dataKey)}" data-resource-item-key="${h(key)}"`)}</div>`;
  }
  function resourcePickerOptions(candidates, selected, dataKey) {
    const selectedKeys = new Set((selected || []).map(resourceItemKey));
    return candidates.map(item => { const key = resourceItemKey(item); return `<label class="resource-picker-option" data-resource-option-row data-resource-search="${h(resourceItemSearch(item))}" data-resource-category="${h(item.category || "")}" data-resource-item-name="${h(item.name || key)}" data-resource-item-code="${h(item.classificationCode || "")}" data-resource-item-spec="${h(item.spec || "")}" data-resource-item-unit="${h(item.unit || "")}"><input type="checkbox" data-resource-option="${h(dataKey)}" value="${h(key)}" ${selectedKeys.has(key) ? "checked" : ""}><span><strong>${h(item.name || key)}</strong><small>${h([item.classificationCode, item.spec, item.category, item.unit].filter(Boolean).join(" · "))}</small></span></label>`; }).join("") || '<p class="help">当前学科暂无可选择器材。</p>';
  }
  function resourcePickerSync(picker) {
    const dataKey = picker.dataset.resourcePicker, selectedBox = picker.querySelector("[data-resource-selected]"), quantities = new Map([...picker.querySelectorAll("[data-booking-resource-row]")].map(row => [row.dataset.resourceItemKey, Number($('[data-booking-resource-qty]', row)?.value || 1)]));
    const selected = [...picker.querySelectorAll(`[data-resource-option="${dataKey}"]:checked`)].map(input => { const row = input.closest("[data-resource-option-row]"), key = input.value; return { itemId: key, classificationCode: row?.dataset.resourceItemCode || "", name: row?.dataset.resourceItemName || key, spec: row?.dataset.resourceItemSpec || "", category: row?.dataset.resourceCategory || "", unit: row?.dataset.resourceItemUnit || "", qty: quantities.get(key) || 1 }; });
    if (selectedBox) selectedBox.innerHTML = selected.length ? selected.map(resource => resourceSelectedRow(resource, dataKey)).join("") : '<p class="resource-empty">尚未选择器材。点击“选择器材”添加。</p>';
    const count = picker.querySelector("[data-resource-count]"); if (count) count.textContent = `已选 ${selected.length} 项`;
  }
  function filterResourcePicker(picker) {
    const query = (picker.querySelector("[data-resource-search]")?.value || "").trim().toLowerCase(), category = picker.querySelector("[data-resource-filter-category]")?.value || "";
    picker.querySelectorAll("[data-resource-option-row]").forEach(row => { row.hidden = !!((query && !row.dataset.resourceSearch.includes(query)) || (category && row.dataset.resourceCategory !== category)); });
  }
  function filterArrangementResources(details) {
    const query = (details.querySelector("[data-arrange-search]")?.value || "").trim().toLowerCase(), category = details.querySelector("[data-arrange-category]")?.value || "";
    details.querySelectorAll("[data-arrange-resource-row]").forEach(row => { row.hidden = !!((query && !row.dataset.resourceSearch.includes(query)) || (category && row.dataset.resourceCategory !== category)); });
  }
  function equipmentEntry(record, kind = "inventory") {
    const item = M.itemOf(db, record) || record || {}, location = record?.roomId ? (M.locationLabel ? M.locationLabel(db, record) : get("rooms", record.roomId)?.roomNo || "待分配") : "待分配", code = kind === "asset" ? record?.code || item.classificationCode || record?.classificationCode || "" : item.classificationCode || record?.classificationCode || "", name = item.name || record?.name || record?.id || "", spec = item.spec || record?.spec || record?.model || "", category = item.category || record?.category || "", unit = item.unit || record?.unit || "", stockText = record?.stock == null ? "单件设备" : `库存${record.stock}${unit}`;
    return { id: record?.id || "", name, code, spec, category, unit, location, roomId: record?.roomId || "", meta: [code, spec, category, location, stockText].filter(Boolean).join(" · "), search: [record?.id, name, code, spec, category, location].filter(Boolean).join(" ").toLowerCase() };
  }
  function equipmentPickerOption(entry, key, selected = false) {
    return `<label class="equipment-picker-option" data-equipment-option-row data-equipment-search="${h(entry.search)}" data-equipment-category="${h(entry.category)}" data-equipment-room="${h(entry.roomId)}"><input type="radio" name="equipment-choice-${h(key)}" data-equipment-choice="${h(key)}" value="${h(entry.id)}" data-equipment-name="${h(entry.name)}" data-equipment-meta="${h(entry.meta)}" ${selected ? "checked" : ""}><span><strong>${h(entry.name)}</strong><small>${h(entry.meta)}</small></span></label>`;
  }
  function equipmentPicker({ key, label, value = "", candidates = [], helper = "", required = true }) {
    const selected = candidates.find(entry => String(entry.id) === String(value)), categories = [...new Set(candidates.map(entry => entry.category).filter(Boolean))], rooms = [...new Map(candidates.filter(entry => entry.roomId).map(entry => [entry.roomId, entry.location])).entries()], display = selected?.name || (value ? value : `请选择${label}`);
    return `<div class="field full equipment-single-picker" data-equipment-picker="${h(key)}"><span class="field-label">${h(label)}${required ? ' <span class="required">*</span>' : ""}</span><div class="equipment-picker-current"><input class="input equipment-picker-display" type="text" value="${h(display)}" readonly ${required ? "required" : ""} data-equipment-picker-display aria-label="${h(label)}"><input type="hidden" name="${h(key)}" id="f-${h(key)}" value="${h(selected?.id || value)}" data-equipment-picker-value>${button("选择器材", "equipment-picker-open", `data-equipment-picker-key="${h(key)}"`, true, candidates.length > 0)}</div>${helper ? `<p class="help">${h(helper)}</p>` : ""}<div class="equipment-picker-panel" data-equipment-picker-panel hidden><div class="equipment-picker-toolbar"><input class="input" type="search" data-equipment-search placeholder="搜索名称、分类编号、规格或房间" aria-label="搜索${h(label)}"><select class="select" data-equipment-filter-category aria-label="按分类筛选"><option value="">全部分类</option>${categories.map(category => `<option value="${h(category)}">${h(category)}</option>`).join("")}</select><select class="select" data-equipment-filter-room aria-label="按房间筛选"><option value="">全部房间</option>${rooms.map(([roomId, roomName]) => `<option value="${h(roomId)}">${h(roomName)}</option>`).join("")}</select></div><div class="equipment-picker-list" data-equipment-options>${candidates.map(entry => equipmentPickerOption(entry, key, String(entry.id) === String(selected?.id || value))).join("") || '<p class="resource-empty">当前没有符合条件的器材。</p>'}</div><div class="resource-picker-panel-foot"><span class="help">可按名称、编号、规格和存放位置定位</span>${button("完成选择", "equipment-picker-done", `data-equipment-picker-key="${h(key)}"`, true)}</div></div></div>`;
  }
  function setEquipmentPickerOptions(picker, candidates, value = "") {
    if (!picker) return;
    const key = picker.dataset.equipmentPicker, nextValue = candidates.some(entry => String(entry.id) === String(value)) ? value : candidates[0]?.id || "", selected = candidates.find(entry => String(entry.id) === String(nextValue)), valueInput = picker.querySelector("[data-equipment-picker-value]"), display = picker.querySelector("[data-equipment-picker-display]"), list = picker.querySelector("[data-equipment-options]"), category = picker.querySelector("[data-equipment-filter-category]"), room = picker.querySelector("[data-equipment-filter-room]");
    if (valueInput) { valueInput.value = nextValue; valueInput.setAttribute("value", nextValue); }
    if (display) display.value = selected?.name || (nextValue ? nextValue : "暂无可选择器材");
    if (list) list.innerHTML = candidates.map(entry => equipmentPickerOption(entry, key, String(entry.id) === String(nextValue))).join("") || '<p class="resource-empty">当前业务条件下暂无可选择器材。</p>';
    if (category) category.value = "";
    if (room) room.value = "";
    filterEquipmentPicker(picker);
  }
  function filterEquipmentPicker(picker) {
    if (!picker) return;
    const query = (picker.querySelector("[data-equipment-search]")?.value || "").trim().toLowerCase(), category = picker.querySelector("[data-equipment-filter-category]")?.value || "", room = picker.querySelector("[data-equipment-filter-room]")?.value || "";
    picker.querySelectorAll("[data-equipment-option-row]").forEach(row => { row.hidden = !!((query && !row.dataset.equipmentSearch.includes(query)) || (category && row.dataset.equipmentCategory !== category) || (room && row.dataset.equipmentRoom !== room)); });
  }
  function syncEquipmentChoice(choice) {
    if (!choice) return;
    const picker = choice.closest("[data-equipment-picker]"), valueInput = picker?.querySelector("input[type=hidden][data-equipment-picker-value]"), display = picker?.querySelector("[data-equipment-picker-display]"), panel = picker?.querySelector("[data-equipment-picker-panel]"), value = choice.getAttribute("value") || choice.value || "";
    if (valueInput) { valueInput.value = value; valueInput.setAttribute("value", value); }
    if (display) display.value = choice.dataset.equipmentName || value;
    if (panel) panel.hidden = true;
    if (picker?.dataset.equipmentPicker === "itemId") updateFlowFields();
  }
  function equipmentListToolbar(type, entries) {
    const categories = [...new Set(entries.map(entry => entry.category).filter(Boolean))], rooms = [...new Map(entries.filter(entry => entry.roomId).map(entry => [entry.roomId, entry.location])).entries()];
    return `<div class="equipment-list-toolbar" data-equipment-list-toolbar="${h(type)}"><input class="input" type="search" data-equipment-list-search placeholder="搜索名称、分类编号、规格或房间" aria-label="搜索器材"><select class="select" data-equipment-list-category aria-label="按分类筛选"><option value="">全部分类</option>${categories.map(category => `<option value="${h(category)}">${h(category)}</option>`).join("")}</select><select class="select" data-equipment-list-room aria-label="按房间筛选"><option value="">全部房间</option>${rooms.map(([roomId, roomName]) => `<option value="${h(roomId)}">${h(roomName)}</option>`).join("")}</select><span class="equipment-list-count" data-equipment-list-count>共 ${entries.length} 项</span></div>`;
  }
  function updateEquipmentListSummary(root) {
    if (!root) return;
    const rows = [...root.querySelectorAll("[data-equipment-list-row]"), ...root.querySelectorAll("[data-equipment-option-row]")], visible = rows.filter(row => !row.hidden).length, selected = root.querySelectorAll('input[name="assetIds"]:checked').length, filled = root.querySelectorAll("[data-loss-item-qty]").length && [...root.querySelectorAll("[data-loss-item-qty]")].filter(input => input.value !== "").length, count = root.querySelector("[data-equipment-list-count]");
    if (!count) return;
    const extra = selected ? ` · 已选${selected}台` : filled ? ` · 已填${filled}项` : "";
    count.textContent = `显示 ${visible}/${rows.length} 项${extra}`;
  }
  function filterEquipmentList(root) {
    if (!root) return;
    const query = (root.querySelector("[data-equipment-list-search]")?.value || "").trim().toLowerCase(), category = root.querySelector("[data-equipment-list-category]")?.value || "", room = root.querySelector("[data-equipment-list-room]")?.value || "";
    root.querySelectorAll("[data-equipment-list-row]").forEach(row => { row.hidden = !!((query && !row.dataset.equipmentSearch.includes(query)) || (category && row.dataset.equipmentCategory !== category) || (room && row.dataset.equipmentRoom !== room)); });
    updateEquipmentListSummary(root);
  }
  function ledgerItemFilterField(value, stocks) {
    const entries = stocks.map(stock => equipmentEntry(stock, "inventory")), selected = entries.find(entry => String(entry.id) === String(value)), listId = "ledgerItemOptions";
    return `<label class="field"><span class="field-label">仪器名称</span><input class="input" type="search" value="${h(selected ? `${selected.name} · ${selected.spec} · ${selected.code}` : "")}" placeholder="搜索名称、分类编号或规格" list="${listId}" autocomplete="off" data-ledger-item-search aria-label="搜索仪器名称"><input type="hidden" name="itemId" id="f-itemId" value="${h(value)}"><datalist id="${listId}">${entries.map(entry => `<option value="${h(`${entry.name} · ${entry.spec} · ${entry.code}`)}" data-item-id="${h(entry.id)}"></option>`).join("")}</datalist></label>`;
  }
  function bookingResourceFields(context, selected = [], dataKey = "resource") {
    const subject = context.experiment.subject, candidates = itemTypesFor(subject), selectedRows = selected?.length ? selected : [];
    return `<div class="resource-picker" data-resource-picker="${h(dataKey)}"><div class="resource-picker-summary"><div><span class="field-label">补充器材</span><p class="help">可添加计划外器材需求，不绑定具体设备或库存。</p></div><span class="resource-count" data-resource-count>已选 ${selectedRows.length} 项</span>${button("选择器材", "booking-resource-picker-open", `data-resource-key="${h(dataKey)}"`, true)}</div><div class="resource-selected" data-resource-selected>${selectedRows.length ? selectedRows.map(resource => resourceSelectedRow(resource, dataKey)).join("") : '<p class="resource-empty">尚未选择器材。点击“选择器材”添加。</p>'}</div><div class="resource-picker-panel" data-resource-picker-panel hidden><div class="resource-picker-toolbar"><input class="input" type="search" data-resource-search placeholder="搜索名称、分类编号或规格" aria-label="搜索器材"><select class="select" data-resource-filter-category aria-label="筛选器材分类"><option value="">全部分类</option>${[...new Set(candidates.map(item => item.category).filter(Boolean))].map(category => `<option value="${h(category)}">${h(category)}</option>`).join("")}</select></div><div class="resource-picker-list" data-resource-options>${resourcePickerOptions(candidates, selectedRows, dataKey)}</div><div class="resource-picker-panel-foot"><span class="help">已按${h(subjectLabel(subject))}学科筛选</span>${button("完成选择", "booking-resource-picker-done", `data-resource-key="${h(dataKey)}"`, true)}</div></div></div>`;
  }
  function bookingRow(task) {
    const index = ++formRowSeq, context = M.taskContext(db, task), f = (key, label, value, type = "text", options = null, required = true, extra = "") => field(`booking-${index}-${key}`, label, value, type, options, required, `data-booking-key="${key}" ${extra}`), taskOptions = opts("teachingTasks", availableTasks(), taskLabel);
    const resourceFields = bookingResourceFields(context);
    return `<fieldset class="full" data-booking-row><legend>班级实验预约</legend><div class="form-grid">${f("taskId", "计划实验", task.id, "text", taskOptions, true, 'data-booking-task="true"')}<div class="full" data-plan-info>${planInfo(task)}</div>${f("requestedDate", "申请日期", suggestedDate(context), "date")}${f("requestedPeriod", "申请节次", 1, "text", enabledPeriodsFor(context.plan.term).map(period => [period.number, `${period.name} ${period.start}-${period.end}`]))}${context.item.mode === "分组" ? f("groups", "分组数", 8, "number", null, true, 'min="1" step="1"') : '<p class="help">演示实验无需填写分组数。</p>'}<details class="full"><summary>补充器材需求（可添加，不预占）</summary>${resourceFields}</details><div class="full">${button("移除此预约", "booking-row-remove")}</div></div></fieldset>`;
  }
  function bookingForm(id) {
    const tasks = availableTasks(); if (!tasks.length) throw new Error("本学期暂无可预约的计划实验。请检查实验计划是否已发布、是否包含当前班级，以及任课班级设置是否有效。"); const task = tasks.find(row => row.id === id) || tasks[0];
    openModal("新增实验预约", fieldsForm(`<p class="full help">预约人：${h(actor.name)}；预约时间由系统自动记录。预约阶段不填写实验室、最终时间或实验负责人，由管理员在“安排实验”中确定。</p><div class="full form-grid" id="bookingRows">${bookingRow(task)}</div><div class="full">${button("添加班级／实验预约", "booking-row-add")}</div>` + field("note", "备注（最多100字）", "", "textarea", null, false, 'maxlength="100"')), values => { const rows = $$('[data-booking-row]').map(row => ({ ...Object.fromEntries($$('[data-booking-key]', row).map(el => [el.dataset.bookingKey, el.value])), note: values.note, requestedResources: $$('[data-booking-resource-row="resource"]', row).map(resourceRow => ({ itemId: $('[data-booking-resource-item="resource"]', resourceRow)?.value, qty: Number($('[data-booking-resource-qty="resource"]', resourceRow)?.value || 0) })).filter(resource => resource.itemId && resource.qty > 0) })); const result = commit("booking.batch", { rows }); closeModal(); render(); detail("bookings", result.id); toast(`已提交${result.ids.length}条预约，等待管理员安排。`); }, "提交预约");
  }
  function currentPlanSubject() {
    const active = !isAllSubject(view.subject) && subjectAllowed(view.subject) ? M.normalizeSubject(view.subject) : "";
    const ownSubject = actor.role === "teacher" ? M.normalizeSubject(get("staff", actor.id)?.subject || "") : "";
    return active || (ownSubject && ownSubject !== "综合" ? ownSubject : "") || subjectValues()[0] || "物理";
  }
  function planCatalogRows(textbookId, subject, grade, selected = new Map()) {
    const official = db.experimentCatalog.filter(row => row.textbookId === textbookId && row.subject === subject && row.grade === grade && row.state !== "停用"), custom = db.customExperiments.filter(row => row.school === actor.school && row.subject === subject && row.grade === grade && row.state !== "停用" && (!row.textbookId || row.textbookId === textbookId));
    const sourceRows = [...official, ...custom];
    return sourceRows.map(source => { const key = `${source.sourceType}|${source.id}`, item = selected.get(key) || {}, category = source.experimentCategory || "必做", required = category === "必做", selectedNow = selected.has(key) || required; const modes = source.supportedModes?.length ? source.supportedModes : [source.mode || "分组"]; return `<tr data-plan-catalog-row data-source-id="${h(source.id)}" data-source-type="${h(source.sourceType)}" data-category="${h(category)}"><td><input type="checkbox" name="planInclude" data-plan-include ${selectedNow ? "checked" : ""} ${required ? "disabled" : ""} aria-label="${h(source.name)}"></td><td><strong>${h(source.name)}</strong><small>${h(source.code || source.id)} · ${h(source.chapter || "未分章节")}</small></td><td><span class="tag ${category === "创新实验" ? "tag-innovation" : category === "选做" ? "tag-optional" : "tag-required"}">${h(category)}</span></td><td>${h(source.sourceType)}</td><td>${h(source.equipment || source.equipmentRequirements?.map(row => row.name).join("、") || "由教师确认")}</td><td><select class="select" data-plan-mode aria-label="${h(source.name)}实施方式">${modes.map(mode => `<option value="${h(mode)}" ${(item.mode || source.mode || modes[0]) === mode ? "selected" : ""}>${h(mode)}</option>`).join("")}</select></td><td><select class="select" data-plan-schedule-type aria-label="${h(source.name)}时间类型"><option value="WEEK" ${item.scheduleType !== "DATE" ? "selected" : ""}>周次</option><option value="DATE" ${item.scheduleType === "DATE" ? "selected" : ""}>日期</option></select><input class="input" type="number" min="1" max="${M.weekOf(get("terms", view.term), get("terms", view.term).end)}" value="${h(item.plannedWeek || 1)}" data-plan-week aria-label="${h(source.name)}计划周次" ${item.scheduleType === "DATE" ? "disabled" : ""}><input class="input" type="date" value="${h(item.plannedDate || get("terms", view.term).start)}" data-plan-date aria-label="${h(source.name)}计划日期" ${item.scheduleType === "DATE" ? "" : "disabled"}></td></tr>`; }).join("") || `<tr><td colspan="7"><div class="empty-message">当前教材暂无可编入的实验。可先新建学校自定义创新实验。</div></td></tr>`;
  }
  function selectedPlanSources() { const selected = new Map(); $$('[data-plan-catalog-row]').forEach(row => { const include = $('[data-plan-include]', row); if (include?.checked) selected.set(`${row.dataset.sourceType}|${row.dataset.sourceId}`, { mode: $('[data-plan-mode]', row)?.value, scheduleType: $('[data-plan-schedule-type]', row)?.value, plannedWeek: $('[data-plan-week]', row)?.value, plannedDate: $('[data-plan-date]', row)?.value }); }); return selected; }
  function refreshPlanCatalog() { refreshLatestLocalData(); const formEl = $("#modalForm"), subject = $('[name="subject"]', formEl)?.value, grade = $('[name="grade"]', formEl)?.value, textbook = $('[name="textbookId"]', formEl), selected = selectedPlanSources(); if (!subject || !grade || !textbook) return; const options = db.textbooks.filter(row => row.subject === subject && row.grade === grade && row.state !== "停用").map(row => [row.id, `${row.name} · ${row.version}`]); const previousTextbook = textbook.value; setOptions(textbook, options); const selectedTextbook = options.some(([id]) => String(id) === String(previousTextbook)) ? previousTextbook : options[0]?.[0] || ""; textbook.value = selectedTextbook; const box = $("#planCatalogRows", formEl); if (box) box.innerHTML = planCatalogRows(selectedTextbook, subject, grade, selected); }
  function refreshPlanClasses() { refreshLatestLocalData(); const formEl = $("#modalForm"), first = $('input[name="planClassIds"]', formEl); if (!first) return; const box = first.closest(".resource-grade-options"), grade = $('[name="grade"]', formEl)?.value || "", previous = new Set($$('input[name="planClassIds"]:checked', formEl).map(input => input.value)), classes = db.classes.filter(row => row.school === actor.school && row.grade === grade && row.state === "在读"); if (!box) return; box.innerHTML = classes.map(klass => `<label class="check-field"><input type="checkbox" name="planClassIds" value="${h(klass.id)}" ${(previous.has(klass.id) || !previous.size) ? "checked" : ""}>${h(klass.name)} <small>${h(klass.students)}人</small></label>`).join("") || '<span class="help">该年级暂无在读班级。</span>'; }
  function readPlanCompileRows() { return $$('[data-plan-catalog-row]').filter(row => $('[data-plan-include]', row)?.checked).map(row => ({ sourceId: row.dataset.sourceId, sourceType: row.dataset.sourceType, mode: $('[data-plan-mode]', row)?.value, scheduleType: $('[data-plan-schedule-type]', row)?.value, plannedWeek: $('[data-plan-week]', row)?.value, plannedDate: $('[data-plan-date]', row)?.value })); }
  function planForm(id = "") {
    refreshLatestLocalData();
    const current = get("plans", id), term = get("terms", current?.term || view.term), subject = current?.subject || currentPlanSubject(), grade = current?.grade || "高一", textbookId = current?.textbookId || db.textbooks.find(row => row.subject === subject && row.grade === grade)?.id || "", targetIds = new Set(db.planTargets.filter(target => target.planId === current?.id).map(target => target.classId)), classes = db.classes.filter(row => row.school === actor.school && row.grade === grade && row.state === "在读"), selectedClasses = targetIds.size ? targetIds : new Set(classes.map(row => row.id)), selectedSources = new Map((current ? db.planItems.filter(item => item.planId === current.id) : []).map(item => [`${item.sourceType}|${item.sourceId}`, item]));
    const subjectOptions = M.subjectOptionsFor([...new Set([...subjectValues(), current?.subject].filter(Boolean))]);
    const pf = (...args) => field(...args);
    openModal(current ? "修改实验计划" : "编制实验计划", fieldsForm(`<div class="full context-note"><strong>编制说明：</strong>选择学科、年级和教材后，从教材实验目录勾选计划实验；必做实验自动纳入，选做和创新实验按需勾选。各班执行进度将在计划详情中分别记录。<br><span class="help">新建计划名称默认采用“学期 · 年级学科实验计划”格式；实验名称、章节和目录器材为只读快照；学校自定义创新实验请先在“创新实验”页维护。</span></div>${pf("name", "计划名称", current?.name || defaultPlanName(term.name, grade, subject))}${pf("subject", "学科", subject, "text", subjectOptions, true, 'data-plan-filter="true"')}${pf("grade", "适用年级", grade, "text", [...new Set(db.classes.filter(row => row.school === actor.school).map(row => row.grade))], true, 'data-plan-filter="true"')}${pf("textbookId", "教材", textbookId, "text", db.textbooks.filter(row => row.subject === subject && row.grade === grade && row.state !== "停用").map(row => [row.id, `${row.name} · ${row.version}`]), true, 'data-plan-catalog-select="true"')}${pf("term", "学期", term.id, "text", opts("terms", db.terms), true, 'disabled data-submit-disabled="true"') }<div class="full"><span class="field-label">适用班级 <span class="required">*</span></span><div class="resource-grade-options">${classes.map(klass => `<label class="check-field"><input type="checkbox" name="planClassIds" value="${h(klass.id)}" ${selectedClasses.has(klass.id) ? "checked" : ""}>${h(klass.name)} <small>${h(klass.students)}人</small></label>`).join("")}</div></div><div class="full"><div class="panel-header"><h3>教材实验目录</h3><button type="button" class="button" data-action="innovation-new">新建创新实验</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>纳入</th><th>实验名称／章节</th><th>属性</th><th>来源</th><th>目录器材</th><th>实施方式</th><th>周次／日期</th></tr></thead><tbody id="planCatalogRows">${planCatalogRows(textbookId, subject, grade, selectedSources)}</tbody></table></div><p class="help">必做实验不可取消；选做、创新实验可按本学期教学安排勾选。计划提交时会校验必做项、班级范围和日期。</p></div>`), values => { const classIds = $$('input[name="planClassIds"]:checked').map(input => input.value), rows = readPlanCompileRows(); const result = commit("plan.compile", { id: current?.id || "", term: term.id, subject: values.subject, grade: values.grade, textbookId: values.textbookId, name: values.name, classIds, items: rows }); closeModal(); render(); detail("plans", result.id); toast("实验计划已发布，可在计划详情查看各班执行情况。"); }, current ? "保存并重新发布" : "编制并发布");
  }
  function innovationEquipmentRow(row = {}) { return `<div class="resource-selected-row" data-innovation-row><label class="field"><span class="field-label">器材名称 <span class="required">*</span></span><input class="input" data-innovation-key="name" value="${h(row.name || "")}" required></label><label class="field"><span class="field-label">规格型号</span><input class="input" data-innovation-key="spec" value="${h(row.spec || "")}"></label><label class="field"><span class="field-label">单位 <span class="required">*</span></span><input class="input" data-innovation-key="unit" value="${h(row.unit || "件")}" required></label><label class="field"><span class="field-label">数量 <span class="required">*</span></span><input class="input" type="number" min="1" step="1" data-innovation-key="quantity" value="${h(row.quantity || 1)}" required></label>${button("移除", "innovation-equipment-remove")}</div>`; }
  function customExperimentForm(id = "") { const current = get("customExperiments", id), subject = current?.subject || currentPlanSubject(), grade = current?.grade || "高一", allowedSubjects = [...new Set([...subjectValues(), current?.subject].filter(Boolean))], rows = current?.equipmentRequirements?.length ? current.equipmentRequirements : [{ name: "", unit: "件", quantity: 1 }], cf = (...args) => field(...args); openModal(current ? "编辑自定义创新实验" : "新建自定义创新实验", fieldsForm(`<div class="full context-note"><strong>实验属性：</strong>创新实验　<strong>来源：</strong>学校自定义<br><span class="help">可填写教材章节、页码和任意实验器材；不会自动把自定义器材写入设备或库存台账。</span></div>${cf("name", "实验名称", current?.name || "")}${cf("code", "实验编号", current?.code || `CX-${M.TODAY.replaceAll("-", "")}-${String(db.seq + 1).padStart(3, "0")}`)}${cf("subject", "学科", subject, "text", M.subjectOptionsFor(allowedSubjects))}${cf("grade", "适用年级", grade, "text", [...new Set(db.classes.filter(row => row.school === actor.school).map(row => row.grade))])}${cf("textbookId", "关联教材（可选）", current?.textbookId || "", "text", [["", "不关联教材"], ...db.textbooks.filter(row => row.subject === subject && row.grade === grade).map(row => [row.id, `${row.name} · ${row.version}`])], false)}${cf("chapter", "章节", current?.chapter || "", "text", null, false)}${cf("section", "节", current?.section || "", "text", null, false)}${cf("page", "页码", current?.page || "", "text", null, false)}${cf("supportedModes", "可用实施方式", current?.supportedModes?.[0] || current?.mode || "分组", "text", M.implementationModes)}<div class="full"><div class="panel-header"><h3>自定义实验器材需求</h3>${button("添加器材", "innovation-equipment-add")}</div><div id="innovationEquipmentRows">${rows.map(innovationEquipmentRow).join("")}</div></div>${cf("safety", "安全提示", current?.safety || "", "textarea", null, false, 'maxlength="500"')}${cf("note", "实验说明", current?.note || "", "textarea", null, false, 'maxlength="500"')}`), values => { const equipmentRequirements = $$('[data-innovation-row]').map(row => Object.fromEntries($$('[data-innovation-key]', row).map(el => [el.dataset.innovationKey, el.value]))); const result = commit("customExperiment.save", { id: current?.id || "", ...values, term: view.term, supportedModes: [values.supportedModes], equipmentRequirements }); closeModal(); render(); toast(`已保存创新实验：${result.name}`); }, current ? "保存修改" : "创建创新实验"); }
  function setOptions(el, options) { const value = el.value; el.innerHTML = options.map(o => { const [v, label] = Array.isArray(o) ? o : [o, o]; return `<option value="${h(v)}">${h(label)}</option>`; }).join(""); if ([...el.options].some(o => o.value === value)) el.value = value; }
  function taskForm(id = "") {
    const row = get("tasks", id);
    const kinds = ["危化品专项检查", "实验室安全复核", "开学专项检查", "日常安全巡查"], kind = kinds.includes(row?.kind) ? row.kind : row?.kind || kinds[0];
    return form(row ? "修改危化品专项检查任务" : "下发危化品专项检查任务", field("roomId", "学校／房间", row?.roomId || "", "text", opts("rooms", records("rooms"), room => `${name("schools", room.school)} · ${room.roomNo} · ${room.name}`)) + field("kind", "检查类型", kind, "text", [...new Set([...kinds, kind])]) + field("due", "截止日期", row?.due || addDays(M.TODAY, 3), "date") + field("owner", "学校责任人", row?.owner || ""), "task.create", row ? { id: row.id } : {}, row ? "保存修改" : "下发任务");
  }
  function checkForm(taskId = "", checkId = "") {
    const current = get("checks", checkId), task = get("tasks", taskId || current?.taskId), locked = task ? "disabled data-submit-disabled=\"true\"" : "", result = current?.result || "正常", kind = task?.kind || current?.kind || "危化品专项检查", checklist = ["账物数量核对", "存放条件与房间状态", "包装和标签", "有效期与近效期", "领用和双人复核", "待处置物品"];
    const selectedChecklist = checklist.map((label, index) => check(`checkItem${index}`, label, String(current?.items || "").includes(label), 'data-check-item="true"')).join("");
    const fields = field("roomId", "检查房间", task?.roomId || current?.roomId || "", "text", opts("rooms", own("rooms"), room => `${room.roomNo} · ${room.name}`), true, locked) + field("kind", "检查类型", kind, "text", ["危化品专项检查", "实验室安全复核", "开学专项检查", "日常安全巡查"], true, task ? locked : "") + field("date", "检查日期", current?.date || M.TODAY, "date") + `<fieldset class="full checklist-field"><legend>专项检查项目</legend><div class="checklist-grid">${selectedChecklist}</div>${field("itemNote", "补充检查项目", "", "textarea", null, false)}</fieldset>` + field("result", "检查结果", result, "text", ["正常", "发现隐患"], true, 'data-check-result="true"') + field("note", "检查说明", current?.note || "", "textarea", null, false) + `<fieldset class="full" id="hazardFields" ${result === "发现隐患" ? "" : "hidden disabled"}><legend>发现隐患后填写，可每行填写一项</legend><div class="form-grid">${field("title", "隐患描述", current?.title || "", "textarea")}${field("owner", "整改责任人", actor.name)}${field("level", "处置优先级", "一般关注", "text", ["一般关注", "需优先处理"])}${field("due", "整改期限", addDays(current?.date || M.TODAY, 3), "date")}</div></fieldset>`;
    openModal(current ? "修改危化品检查记录" : "危化品专项检查记录", fieldsForm(fields), values => { const selectedItems = checklist.filter((label, index) => values[`checkItem${index}`]).concat(String(values.itemNote || "").split(/[\n；;]+/).map(item => item.trim()).filter(Boolean)); const items = [...new Set(selectedItems)].join("、"); if (!items) throw new Error("请至少选择一项检查项目或填写补充检查项目。"); const resultRow = commit(current ? "check.update" : "check.create", { ...values, items, ...(task ? { taskId: task.id, roomId: task.roomId } : {}), ...(current ? { id: current.id } : {}) }); closeModal(); render(); toast(`已保存检查记录：${resultRow.id}`); }, current ? "保存修改" : "提交检查记录");
    updateCheckFields();
  }
  function updateCheckFields() {
    const resultInput = $("#f-result"), fields = $("#hazardFields");
    if (!resultInput || !fields) return;
    const hasHazard = resultInput.value === "发现隐患";
    fields.hidden = !hasHazard;
    fields.disabled = !hasHazard;
  }
  function hazardEditForm(id) { const row = get("hazards", id); return form("修改隐患信息", field("title", "隐患描述", row.title) + field("owner", "整改责任人", row.owner) + field("level", "处置优先级", row.level, "text", ["一般关注", "需优先处理"]) + field("due", "整改期限", row.due, "date") + field("note", "说明", row.note || "", "textarea", null, false), "hazard.update", { id: row.id }, "保存修改"); }
  function archiveEditForm(id) { const row = get("archives", id), content = row.dataUrl ? '<p class="help full">原始上传文件内容保持不变，可修改文件名和资料分类。</p>' : field("content", "文本附件内容", row.content || "", "textarea", null, true, 'rows="8"'); return form("修改待归档资料", field("name", "保存文件名", row.name) + field("category", "资料分类", row.category, "text", ["实验教学", "安全管理", "人员档案", "设备建设"]) + content, "archive.update", { id: row.id }, "保存修改"); }
  function repairForm(id = "") {
    const current = db.repairs.find(row => row.id === id && row.kind === "维修"), assets = own("assets").filter(asset => (asset.state !== "已报废" || asset.id === current?.assetId) && (asset.id === current?.assetId || rowMatchesSubject("assets", asset)));
    if (!assets.length) throw new Error("暂无可登记维修的仪器设备。");
    const assetId = current?.assetId || assets[0].id;
    const entries = assets.map(asset => equipmentEntry(asset, "asset"));
    openModal(current ? "修改仪器设备维修" : "仪器设备维修", fieldsForm(equipmentPicker({ key: "assetId", label: "仪器名称", value: assetId, candidates: entries, helper: "维修登记针对具体资产，请按名称、分类编号、规格、资产编号或房间定位。" }) + field("qty", "维修数量", current?.qty || 1, "number", null, true, 'min="1" step="1"') + field("cost", "维修金额", current?.cost ?? 0, "number", null, true, 'min="0" step="0.01"') + field("maintenanceDate", "维修日期", current?.maintenanceDate || M.TODAY, "date") + field("vendor", "维修商", current?.vendor || "", "text", null, false) + field("content", "维修内容", current?.content || "", "textarea", null, false, 'maxlength="100"')), values => { const selectedAssetId = values.assetId || $("[data-equipment-picker=assetId] [data-equipment-choice]:checked")?.value || ""; if (!selectedAssetId) throw new Error("请选择需要维修的仪器设备。"); commit("repair.register", { ...values, assetId: selectedAssetId, ...(current ? { id: current.id } : {}) }); closeModal(); render(); toast(current ? "维修登记已修改。" : "维修登记已保存。"); }, current ? "保存" : "确定");
    setEquipmentPickerOptions($("#modalBody [data-equipment-picker]"), entries, assetId);
  }
  function scrapAssets() { return own("assets").filter(asset => rowMatchesSubject("assets", asset) && asset.state === "正常使用" && !asset.pendingReceiptId && !db.arrangements.some(arrangement => M.activeArrangement(arrangement) && (arrangement.resources || []).some(resource => resource.ref === asset.id))); }
  function scrapSelectionTable(assets) {
    const headers = ["操作", "分类编号", "名称", "规格", "现有数量", "报废数量", "单位", "总价", "购置日期", "房间或橱柜"];
    const entries = assets.map(asset => equipmentEntry(asset, "asset"));
    return `<div class="equipment-list" data-equipment-list="scrap">${equipmentListToolbar("scrap", entries)}<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(label => `<th>${h(label)}</th>`).join("")}</tr></thead><tbody>${assets.map((asset, index) => { const item = M.itemOf(db, asset), entry = equipmentEntry(asset, "asset"); return `<tr data-equipment-list-row data-equipment-search="${h(entry.search)}" data-equipment-category="${h(entry.category)}" data-equipment-room="${h(entry.roomId)}"><td><input type="checkbox" name="assetIds" value="${h(asset.id)}" ${index === 0 ? "checked" : ""} aria-label="选择${h(item.name)}"></td><td>${h(item.classificationCode)}</td><td>${h(item.name)}</td><td>${h(item.spec)}</td><td>1</td><td>1</td><td>${h(item.unit)}</td><td>${h(money(asset.price))}</td><td>${h(asset.purchaseDate || "未登记")}</td><td>${h(asset.roomId ? get("rooms", asset.roomId)?.roomNo : "未登记")}</td></tr>`; }).join("")}</tbody></table></div></div>`;
  }
  function scrapForm() {
    const assets = scrapAssets(); if (!assets.length) throw new Error("暂无可登记报废的仪器设备。");
    openModal("仪器设备报废", fieldsForm(field("scrapDate", "报废日期", M.TODAY, "date") + `<fieldset class="full"><legend>选择仪器设备</legend>${scrapSelectionTable(assets)}</fieldset>` + field("reason", "报废原因", "", "textarea", null, true, 'maxlength="100"') + field("operator", "经办人", actor.name)), values => { if (!values.assetIds?.length) throw new Error("请选择至少一台仪器设备。"); commit("scrap.register", values); closeModal(); render(); toast("报废登记已保存。"); }, "确定");
    updateEquipmentListSummary($("#modalBody [data-equipment-list]"));
  }
  function lossSelectionTable(stocks, quantities = new Map()) {
    const headers = ["分类编号", "名称", "规格", "现有数量", "损耗数量", "单位", "单价", "总价", "购置日期", "房间或橱柜"];
    const entries = stocks.map(stock => equipmentEntry(stock, "inventory"));
    return `<div class="equipment-list" data-equipment-list="loss">${equipmentListToolbar("loss", entries)}<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(label => `<th>${h(label)}</th>`).join("")}</tr></thead><tbody>${stocks.map(stock => { const item = M.itemOf(db, stock), entry = equipmentEntry(stock, "inventory"), price = Number(stock.unitPrice || 0), qty = quantities.get(stock.id) || ""; return `<tr data-loss-row="${h(stock.id)}" data-equipment-list-row data-equipment-search="${h(entry.search)}" data-equipment-category="${h(entry.category)}" data-equipment-room="${h(entry.roomId)}"><td>${h(item.classificationCode)}</td><td>${h(item.name)}</td><td>${h(item.spec)}</td><td>${h(stock.stock)}</td><td><input class="input" type="number" min="1" max="${h(stock.stock)}" step="1" value="${h(qty)}" data-loss-item-qty="${h(stock.id)}" aria-label="${h(item.name)}损耗数量"></td><td>${h(item.unit)}</td><td>${h(money(price))}</td><td data-loss-total="${h(stock.id)}">${h(qty ? money(Number(qty) * price) : "")}</td><td>${h(stock.purchaseDate || "未登记")}</td><td>${h(stock.roomId ? get("rooms", stock.roomId)?.roomNo : "未登记")}</td></tr>`; }).join("")}</tbody></table></div></div>`;
  }
  function selectedLossTable(rows) {
    if (!rows.length) return '<p class="empty-state" id="lossEmpty">尚未选择仪器设备。</p>';
    const headers = ["操作", "分类编号", "名称", "规格", "现有数量", "损耗数量", "单位", "单价", "总价", "购置日期", "房间或橱柜"];
    return `<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(label => `<th>${h(label)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => { const stock = get("inventory", row.itemId), item = M.itemOf(db, stock), price = Number(stock.unitPrice || 0); return `<tr data-loss-row="${h(stock.id)}"><td>${button("删除", "loss-row-remove")}</td><td>${h(item.classificationCode)}</td><td>${h(item.name)}</td><td>${h(item.spec)}</td><td>${h(stock.stock)}</td><td><input class="input" type="number" min="1" max="${h(stock.stock)}" step="1" value="${h(row.qty)}" data-loss-item-qty="${h(stock.id)}" aria-label="${h(item.name)}损耗数量"></td><td>${h(item.unit)}</td><td>${h(money(price))}</td><td data-loss-total="${h(stock.id)}">${h(money(Number(row.qty) * price))}</td><td>${h(stock.purchaseDate || "未登记")}</td><td>${h(stock.roomId ? get("rooms", stock.roomId)?.roomNo : "未登记")}</td></tr>`; }).join("")}</tbody></table></div>`;
  }
  function updateLossRow(control) {
    const row = control.closest("[data-loss-row]"), stock = get("inventory", row?.dataset.lossRow), qty = $('[data-loss-item-qty]', row), total = $('[data-loss-total]', row); if (!row || !stock || !qty || !total) return;
    total.textContent = qty.value ? money(Number(qty.value || 0) * Number(stock.unitPrice || 0)) : "";
  }
  function lossRowsFromForm() {
    return $$('[data-loss-item-qty]').filter(control => control.value !== "").map(control => ({ itemId: control.dataset.lossItemQty, qty: Number(control.value) }));
  }
  function rememberLossForm() {
    const formEl = $("#modalForm"); if (!formEl) return;
    const values = valuesOf(formEl); pendingLoss = { date: values.date || M.TODAY, reason: values.reason || "", operator: values.operator || actor.name, rows: lossRowsFromForm() };
  }
  function lossSelector() {
    const stocks = referenceStocks().filter(stock => stock.stock > 0 && !stock.pendingReceiptId && stock.roomId); if (!stocks.length) throw new Error("暂无可登记损耗的易耗品。");
    const quantities = new Map((pendingLoss?.rows || []).map(row => [row.itemId, row.qty]));
    openModal("选择仪器设备", fieldsForm(`<p class="help full">在“损耗数量”列直接填写本次损耗数量；留空表示不选择。</p>${lossSelectionTable(stocks, quantities)}`), () => { const rows = lossRowsFromForm(); if (!rows.length) throw new Error("请至少填写一条损耗数量。"); pendingLoss.rows = rows; lossForm(); }, "选择");
    updateEquipmentListSummary($("#modalBody [data-equipment-list]"));
  }
  function lossForm() {
    const state = pendingLoss || { date: M.TODAY, reason: "", operator: actor.name, rows: [] }, reasons = [...new Set(own("flows").filter(flow => flow.kind === "损耗" && flow.reason).map(flow => flow.reason))]; pendingLoss = state;
    openModal("登记易耗品损耗", fieldsForm(field("date", "损耗日期", state.date, "date") + `<div class="full inline-actions">${button("选择仪器设备", "loss-choose", "", true)}</div><section class="full" aria-label="已选择仪器设备">${selectedLossTable(state.rows)}</section>` + field("reason", "损耗原因", state.reason, "text", null, true, 'maxlength="100" list="lossReasons" placeholder="请选择或录入损耗原因"') + `<datalist id="lossReasons">${reasons.map(reason => `<option value="${h(reason)}"></option>`).join("")}</datalist>` + field("operator", "经办人", state.operator, "text", null, true, "readonly")), values => { const rows = lossRowsFromForm(); if (!rows.length) throw new Error("请先选择仪器设备并填写损耗数量。"); commit("loss.batch", { date: values.date, reason: values.reason, operator: values.operator, rows }); pendingLoss = null; closeModal(); render(); toast("损耗登记已保存，现有数量已同步扣减。"); }, "确定");
  }
  const returnedQty = issue => own("flows").filter(flow => flow.kind === "退回" && flow.sourceFlowId === issue.id && flow.state === "已记账").reduce((sum, flow) => sum + flow.qty, 0);
  const returnableQty = issue => Math.max(0, issue.qty - returnedQty(issue));
  function flowArrangementRemaining(arrangement, stockId) { const configured = (arrangement?.resources || []).find(resource => resource.ref === stockId)?.qty || 0, issues = own("flows").filter(flow => flow.arrangementId === arrangement?.id && flow.itemId === stockId && flow.kind === "领用" && ["待复核", "已记账"].includes(flow.state)); return Math.max(0, configured - issues.reduce((sum, issue) => sum + issue.qty - (issue.state === "已记账" ? returnedQty(issue) : 0), 0)); }
  function flowAvailableStock(stock) { const pending = own("flows").filter(flow => flow.itemId === stock.id && flow.state === "待复核" && ["领用", "损耗", "处置"].includes(flow.kind)).reduce((sum, flow) => sum + flow.qty, 0); return Math.max(0, stock.stock - pending); }
  function returnableSourcesFor(stockId) { return own("flows").filter(flow => flow.itemId === stockId && flow.kind === "领用" && flow.state === "已记账" && returnableQty(flow) > 0); }
  function flowInventories(kind, arrangementId = "") {
    const arrangement = get("arrangements", arrangementId);
    return own("inventory").filter(stock => { const item = M.itemOf(db, stock), room = get("rooms", stock.roomId), clearing = ["退回", "损耗", "处置"].includes(kind); if (!rowMatchesSubject("inventory", stock) && !(kind === "退回" && returnableSourcesFor(stock.id).length)) return false; if (stock.pendingReceiptId) return false; if (kind !== "入库" && (!stock.roomId || !roomCompatibleWithItem(room, item) || !clearing && room?.state !== "可用")) return false; if (kind === "入库" && stock.roomId && !roomFitsStoredItem(room, item)) return false; if (expiredHazardStock(stock) && !clearing) return false; if (!["入库", "退回"].includes(kind) && flowAvailableStock(stock) <= 0) return false; if (kind === "退回" && !returnableSourcesFor(stock.id).length) return false; if (kind === "领用" && arrangement) return (arrangement.resources || []).some(resource => resource.ref === stock.id) && flowArrangementRemaining(arrangement, stock.id) > 0; return true; });
  }
  function updateFlowFields() {
    const kindInput = $("#f-kind"), itemInput = $("#f-itemId"), arrangementInput = $("#f-arrangementId"), sourceInput = $("#f-sourceFlowId"), qtyInput = $("#f-qty"); if (!kindInput || !itemInput || !arrangementInput || !sourceInput || !qtyInput) return;
    const kind = kindInput.value, returnMode = kind === "退回", arrangementMode = kind === "领用";
    arrangementInput.disabled = !arrangementMode; if (!arrangementMode) arrangementInput.value = "";
    const inventories = flowInventories(kind, arrangementInput.value), picker = itemInput.closest("[data-equipment-picker]"), selectedItemId = itemInput.value || picker?.querySelector("[data-equipment-choice]:checked")?.value || "";
    if (picker) setEquipmentPickerOptions(picker, inventories.map(stock => equipmentEntry(stock, "inventory")), selectedItemId);
    const stock = get("inventory", selectedItemId), sources = returnMode && stock ? returnableSourcesFor(stock.id) : [];
    sourceInput.disabled = !returnMode; sourceInput.required = returnMode; setOptions(sourceInput, returnMode ? opts("flows", sources, flow => `${flow.id} · 可退${returnableQty(flow)}${M.itemOf(db, stock)?.unit || ""} · ${flow.date}`) : [["", "不适用"]]);
    let max = Number.POSITIVE_INFINITY;
    if (returnMode) max = returnableQty(get("flows", sourceInput.value) || { qty: 0 });
    else if (kind !== "入库" && stock) max = flowAvailableStock(stock);
    if (arrangementMode && arrangementInput.value && stock) max = Math.min(max, flowArrangementRemaining(get("arrangements", arrangementInput.value), stock.id));
    if (Number.isFinite(max)) { qtyInput.max = String(Math.max(0, max)); if (Number(qtyInput.value) > max || Number(qtyInput.value) < 1) qtyInput.value = max > 0 ? String(Math.min(1, max)) : ""; } else qtyInput.removeAttribute("max");
    updateFlowInfo();
  }
  function updateFlowInfo() { const itemInput = $("#f-itemId"), stockId = itemInput?.value || itemInput?.closest("[data-equipment-picker]")?.querySelector("[data-equipment-choice]:checked")?.value || "", stock = get("inventory", stockId), qty = Number($("#f-qty")?.value), kind = $("#f-kind")?.value; if (!$("#flowItemInfo")) return; const item = M.itemOf(db, stock), max = $("#f-qty")?.max; $("#flowItemInfo").innerHTML = stock ? miniTable(col("classificationCode:分类编号|name:名称|spec:规格|unit:单位|qty:本次数量|stock:当前库存|max:当前上限|location:存放位置（房间／橱柜）"), [{ classificationCode: item.classificationCode, name: item.name, spec: item.spec, unit: item.unit, qty: Number.isFinite(qty) ? qty : "—", stock: stock.stock, max: max || (kind === "入库" ? "不限制" : "—"), location: M.locationLabel ? M.locationLabel(db, stock) : stock.roomId ? get("rooms", stock.roomId)?.roomNo : "待分配" }]) : ""; }
  function flowForm(stockId = "", initialKind = "领用") {
    const arrangements = own("arrangements").filter(arrangement => arrangement.state === "已安排" && (actor.role !== "teacher" || get("bookings", arrangement.bookingId)?.teacherId === actor.id)), kinds = actor.role === "teacher" ? ["领用"] : ["入库", "领用", "退回", "损耗", "处置"], kind = kinds.includes(initialKind) ? initialKind : kinds[0], inventories = flowInventories(kind), selected = inventories.some(stock => stock.id === stockId) ? stockId : inventories[0]?.id || "";
    openModal("耗材库存业务登记", fieldsForm(field("kind", "业务类型", kind, "text", kinds, true, 'data-flow-rule="true"') + field("arrangementId", "关联实验安排（领用时可选）", "", "text", [["", "不关联"], ...opts("arrangements", arrangements, arrangement => taskLabel(get("teachingTasks", get("bookings", arrangement.bookingId).taskId)))], false, 'data-flow-rule="true"') + equipmentPicker({ key: "itemId", label: "物品", value: selected, candidates: inventories.map(stock => equipmentEntry(stock, "inventory")), helper: "按物品名称、分类编号、规格、房间、橱柜或库存编号定位。" }) + field("sourceFlowId", "原领用单（仅退回）", "", "text", [["", "不适用"]], false, 'data-flow-rule="true"') + field("qty", "数量", 1, "number", null, true, 'min="1" step="1"') + field("date", "业务日期", M.TODAY, "date") + '<div class="full" id="flowItemInfo"></div>' + field("reason", "损耗原因／业务用途", "", "textarea") + '<p class="help full">退回必须选择仍有可退数量的原领用单，关联安排和任务由系统继承；选择实验安排后，只能领用该安排中尚未配置完成的数量库存。</p>'), values => { const payload = { ...values, itemId: values.itemId || $("[data-equipment-picker=itemId] [data-equipment-choice]:checked")?.value || "" }; if (!payload.itemId) throw new Error("请选择物品。"); if (payload.kind !== "退回") delete payload.sourceFlowId; if (payload.kind !== "领用") delete payload.arrangementId; const result = commit("flow.create", payload); closeModal(); render(); detail("flows", result.id); }, "确认登记");
    updateFlowFields();
  }
  function updateArrangementVenue() {
    const type = $("#f-venueType")?.value, roomSelect = $("#f-roomId"), venueText = $("#f-venueText"); if (!type || !roomSelect || !venueText) return;
    const subject = roomSelect.dataset.arrangeSubject, students = Number(roomSelect.dataset.arrangeStudents), previous = roomSelect.value, rooms = own("rooms").filter(room => room.state === "可用" && (room.seats == null || room.seats >= students) && (type === "实验室" ? room.type === "教学实验室" && (!room.subject || M.subjectEquals(room.subject, subject)) : type === "教室" ? room.type === "普通教室" : false));
    const requiredRoom = type !== "其他"; roomSelect.disabled = !requiredRoom; roomSelect.required = requiredRoom; venueText.disabled = requiredRoom; venueText.required = !requiredRoom;
    roomSelect.innerHTML = requiredRoom ? rooms.length ? rooms.map(room => `<option value="${h(room.id)}" ${room.id === previous ? "selected" : ""}>${h(room.roomNo)} · ${h(room.name)} · ${h(room.seats ?? "未登记")}座</option>`).join("") : '<option value="">暂无符合条件的房间</option>' : '<option value="">无需选择房间</option>';
    [[roomSelect, "房间", requiredRoom], [venueText, "其他地点说明", !requiredRoom]].forEach(([control, label, required]) => { const title = $(".field-label", control.closest(".field")); if (title) title.innerHTML = `${h(label)}${required ? ' <span class="required">*</span>' : ""}`; });
    const help = $("#venueHelp"); if (help) help.textContent = type === "实验室" ? `仅可选择${subjectLabel(subject)}学科、容量足够且可用的教学实验室。` : type === "教室" ? "仅可选择已维护且可用的普通教室。" : "请填写可识别的其他地点说明，不再关联房间。";
  }
  function arrangementForm(bookingId, arrangementId = "") {
    const current = get("arrangements", arrangementId), booking = get("bookings", current?.bookingId || bookingId), context = M.taskContext(db, booking.taskId), periods = enabledPeriodsFor(context.plan.term), studentCount = booking.studentCount ?? context.klass.students, suggestedEnd = Number(booking.requestedPeriod) + context.experiment.periods - 1, candidates = [...own("assets").filter(asset => { const room = get("rooms", asset.roomId), item = M.itemOf(db, asset); return asset.state === "正常使用" && roomFitsStoredItem(room, item) && M.itemFitsSubject(item, context.experiment.subject) && (!room.subject || room.subject === context.experiment.subject); }), ...own("inventory").filter(stock => { const room = get("rooms", stock.roomId), item = M.itemOf(db, stock); return !stock.pendingReceiptId && !expiredHazardStock(stock) && stock.stock > 0 && roomFitsStoredItem(room, item) && M.itemFitsSubject(item, context.experiment.subject) && (!room.subject || room.subject === context.experiment.subject); })], remainingDemand = new Map((booking.requestedResources || []).map(resource => [resource.itemId, resource.qty])), suggestedResources = new Map((current?.resources || []).map(resource => [resource.ref, resource.qty]));
    if (!current) candidates.forEach(record => { const item = M.itemOf(db, record), remaining = remainingDemand.get((item.itemId || item.classificationCode)) || 0, qty = Math.min(remaining, record.stock ?? 1); suggestedResources.set(record.id, qty); remainingDemand.set((item.itemId || item.classificationCode), remaining - qty); });
    const requestSummary = (booking.requestedResources || []).map(resource => { const item = M.itemById(db, resource.itemId) || (resource.name ? resource : null); return `${item?.name || resource.itemId} ${resource.qty}${item?.unit || ""}`; }).join("、") || "无补充需求", labRooms = own("rooms").filter(room => room.state === "可用" && room.type === "教学实验室" && (!room.subject || room.subject === context.experiment.subject) && (room.seats == null || room.seats >= studentCount)), initialRooms = current?.venueType === "教室" ? own("rooms").filter(room => room.state === "可用" && room.type === "普通教室" && (room.seats == null || room.seats >= studentCount)) : labRooms;
    const resources = candidates.map(record => { const item = M.itemOf(db, record), search = resourceItemSearch(item), roomName = record.roomId ? get("rooms", record.roomId)?.roomNo || "待分配" : "待分配"; return `<label class="resource-row" data-arrange-resource-row data-resource-search="${h(search)}" data-resource-category="${h(item.category || "")}"><span>${h(item.name)} <small>${h(item.classificationCode)} · ${h(item.spec)} · ${h(roomName)} · 可用${record.stock ?? 1}${h(item.unit)}</small></span><input class="input" type="number" min="0" max="${record.stock ?? 1}" step="1" value="${suggestedResources.get(record.id) || 0}" data-arrange-resource="${h(record.id)}" aria-label="${h(item.name)}配置数量"></label>`; }).join("");
    openModal(current ? "修改实验安排" : "安排实验", fieldsForm(`<div class="full">${planInfo(get("teachingTasks", booking.taskId))}</div><p class="help full">申请：${h(booking.requestedDate)} 第${h(booking.requestedPeriod)}节；计划课时：${h(context.experiment.periods)}；补充器材需求：${h(requestSummary)}。已有领用时，修改后的器材数量不得低于已领用及待复核数量。</p>${field("scheduledDate", "实际安排日期", current?.scheduledDate || booking.requestedDate, "date")}${field("startPeriod", "开始节次", current?.startPeriod || booking.requestedPeriod, "text", periods.map(period => [period.number, `${period.name} ${period.start}-${period.end}`]))}${field("endPeriod", "结束节次", current?.endPeriod || (periods.some(period => period.number === suggestedEnd) ? suggestedEnd : booking.requestedPeriod), "text", periods.map(period => [period.number, period.name]))}${field("venueType", "地点类型", current?.venueType || "实验室", "text", ["实验室", "教室", "其他"])}${field("roomId", "房间", current?.roomId || initialRooms[0]?.id || "", "text", initialRooms.length ? opts("rooms", initialRooms, room => `${room.roomNo} · ${room.name} · ${room.seats ?? "未登记"}座`) : [["", "暂无符合条件的房间"]], true, `data-arrange-subject="${h(context.experiment.subject)}" data-arrange-students="${h(studentCount)}"`)}${field("venueText", "其他地点说明", current?.venueText || "", "text", null, false, 'maxlength="100"')}<p class="help full" id="venueHelp"></p>${field("technicianId", "实验负责人", current?.technicianId || "", "text", opts("staff", own("staff").filter(person => person.enabled && person.role === "admin")))}<details class="full" open><summary>实际配置器材</summary>${resources || '<p class="help">当前学科暂无可配置器材。</p>'}</details>${field("note", "安排说明", current?.note || "", "textarea", null, false, 'maxlength="100"')}`), values => { const result = commit(current ? "arrangement.update" : "booking.arrange", { id: current?.id || booking.id, ...values, resources: $$('[data-arrange-resource]').filter(el => Number(el.value) > 0).map(el => ({ ref: el.dataset.arrangeResource, qty: Number(el.value) })) }); closeModal(); render(); detail("arrangements", result.id); }, current ? "保存修改" : "确认安排");
    const resourceDetails = [...document.querySelectorAll("#modalBody details")].find(details => details.querySelector("summary")?.textContent === "实际配置器材");
    if (resourceDetails && !resourceDetails.querySelector("[data-arrange-search]")) {
      resourceDetails.insertAdjacentHTML("afterbegin", `<div class="resource-assignment-toolbar"><input class="input" type="search" data-arrange-search placeholder="搜索器材名称、分类编号或规格" aria-label="搜索实际配置器材"><select class="select" data-arrange-category aria-label="筛选实际器材分类"><option value="">全部分类</option>${[...new Set(candidates.map(record => M.itemOf(db, record)?.category).filter(Boolean))].map(category => `<option value="${h(category)}">${h(category)}</option>`).join("")}</select></div>`);
    }
    updateArrangementVenue();
  }
  function summaryForm(arrangementId, summaryId = "") {
    const current = get("summaries", summaryId), arrangement = get("arrangements", current?.arrangementId || arrangementId), booking = get("bookings", arrangement.bookingId), context = M.taskContext(db, booking.taskId); pendingSummaryImages = { OVERVIEW: [], STUDENT: [] };
    const images = current ? '<p class="help full">修改总结不会删除已归档实验图片；如需回退整条总结，请使用“删除”。</p>' : '<label class="field full"><span class="field-label">实验全景图（可选，最多2张）</span><input type="file" accept="image/png,image/jpeg,image/webp" multiple data-summary-images="OVERVIEW"><small data-summary-status="OVERVIEW">未选择</small></label><label class="field full"><span class="field-label">学生实验图（可选，最多3张）</span><input type="file" accept="image/png,image/jpeg,image/webp" multiple data-summary-images="STUDENT"><small data-summary-status="STUDENT">未选择</small></label>';
    openModal(current ? "修改实验总结" : "实验总结", fieldsForm(`<div class="full">${miniTable(col("experiment:实验|mode:类型|className:班级|teacherName:教师|time:安排时间|room:房间|groups:分组数|equipment:器材需求"), [{ experiment: context.experiment.name, mode: context.item.mode, className: context.klass.name, teacherName: context.teacher.name, time: `${arrangement.scheduledDate} 第${arrangement.startPeriod}-${arrangement.endPeriod}节`, room: arrangement.venueType === "其他" ? arrangement.venueText : name("rooms", arrangement.roomId), groups: booking.groups || "不适用", equipment: context.experiment.equipment }])}</div>${field("actualDate", "实际完成日期", current?.actualDate || arrangement.scheduledDate, "date")}${field("effect", "实验效果", current?.effect || "", "textarea")}${field("improvement", "改进意见", current?.improvement || "", "textarea", null, false)}${field("equipmentCondition", "仪器完好情况", current?.equipmentCondition || "完好", "textarea")}${field("note", "备注", current?.note || "", "textarea", null, false)}${images}<p class="help full">总结保存后同步安排、预约和班级执行状态；删除总结会统一回退为“已安排”。</p>`), values => { const result = commit(current ? "summary.update" : "booking.summary", { id: current?.id || arrangement.id, ...values, overviewImages: pendingSummaryImages.OVERVIEW, studentImages: pendingSummaryImages.STUDENT }); closeModal(); render(); detail("summaries", result.id); }, current ? "保存修改" : "提交总结并完成");
  }
  function operation(action, id, table, kind) {
    const r = get(table, id) || {}, asset = get("assets", id), reason = (label = "处理说明", value = "") => field("reason", label, value, "textarea"), dateField = field("date", "业务日期", M.TODAY, "date"), fixed = { id };
    if (action === "storage-move") {
      const isAsset = table === "assets", item = M.itemOf(db, r), rooms = own("rooms").filter(room => room.state === "可用" && (M.roomFitsItem ? M.roomFitsItem(room, item) : true)), targetRoom = get("rooms", r.roomId) || rooms[0], targetCabinets = roomId => own("cabinets").filter(cabinet => cabinet.state === "启用" && cabinet.roomId === roomId && (!M.cabinetFitsItem || M.cabinetFitsItem(db, cabinet, item))), currentLocation = M.locationLabel ? M.locationLabel(db, r) : "待分配";
      if (!rooms.length) throw new Error("暂无符合物品条件的可用目标房间。");
      const roomOptions = rooms.map(room => [room.id, `${room.roomNo} · ${room.name}`]);
      const cabinetOptions = roomId => [["", "直接存放于房间"], ...targetCabinets(roomId).map(cabinet => [cabinet.id, `${cabinet.code} · ${cabinet.name}`])];
      openModal("调整存放位置", fieldsForm(`<p class="help full">当前位置：${h(currentLocation)}。保存后生成位置调整记录；${isAsset ? "设备资产编号和原值不变。" : "耗材按填写数量从原柜转入目标柜，学校总库存不变。"}</p>${isAsset ? "" : field("qty", "调整数量", 1, "number", null, true, `min="1" max="${h(r.stock)}" step="1"`)}${field("roomId", "目标房间", targetRoom?.id || "", "text", roomOptions, true, `data-storage-room="true" data-storage-item="${h(id)}" data-storage-kind="${isAsset ? "assets" : "inventory"}"`)}${field("cabinetId", "目标橱柜", "", "text", cabinetOptions(targetRoom?.id || ""), false, 'data-storage-cabinet="true"')}${reason("调整原因")}`), values => { const result = commit("storage.move", { kind: isAsset ? "asset" : "inventory", id, ...values }); closeModal(); render(); detail(table, isAsset ? result.id : id); toast("存放位置已调整。"); }, "确认调整");
      return;
    }
    if (action === "asset-edit") { const item = M.itemOf(db, r), rooms = storageRoomsFor(item), cabinets = own("cabinets").filter(cabinet => cabinet.roomId === r.roomId && cabinet.state === "启用" && (!M.cabinetFitsItem || M.cabinetFitsItem(db, cabinet, item))); return form("修改设备台账", `<p class="full help">${h(r.code)} · ${h(item.name)} · ${h(item.spec)}；已用于有效实验安排时不能变更存放位置。</p>` + field("roomId", "存放位置（房间）", r.roomId || "", "text", [["", "暂不分配"], ...opts("rooms", rooms, room => `${room.roomNo} · ${room.name}`)], false) + field("cabinetId", "橱柜（可选）", r.cabinetId || "", "text", [["", "直接存放于房间"], ...cabinets.map(cabinet => [cabinet.id, `${cabinet.code} · ${cabinet.name}`])], false) + field("nextMaintenance", "下次维保日期（无则留空）", r.nextMaintenance || "", "date", null, false), "asset.edit", fixed, "保存修改"); }
    if (action === "repair-new") return repairForm(asset?.id || "");
    if (action === "repair-edit") return repairForm(id);
    if (action === "scrap-new") return scrapForm();
    if (action === "loss-new") { pendingLoss = { date: M.TODAY, reason: "", operator: actor.name, rows: [] }; return lossForm(); }
    if (action === "loss-choose") { rememberLossForm(); return lossSelector(); }
    if (action === "loss-row-remove") { el.closest("[data-loss-row]")?.remove(); return; }
    if (action === "repair-delete") return form("删除维修登记", '<p class="full">确定删除这条维修登记吗？</p>', "repair.delete", fixed, "确定删除");
    if (action === "scrap-delete") return form("删除报废登记", '<p class="full">确定删除这条报废登记吗？删除后对应仪器设备恢复正常使用。</p>', "scrap.delete", fixed, "确定删除");
    if (action === "loss-delete") return form("删除损耗登记", '<p class="full">确定删除这条损耗登记吗？删除后对应数量将恢复。</p>', "loss.delete", fixed, "确定删除");
    if (action === "purchase-edit") return purchaseForm(false, id);
    if (action === "purchase-delete") return form("删除采购申请", reason("删除原因") + '<p class="help full">只有待审核、已驳回或已撤销且没有入库单、附件的申请可以删除。</p>', "purchase.delete", fixed, "确认删除");
    if (action === "purchase-cancel") return form("确认撤销申请", reason("撤销原因"), "purchase.cancel", fixed, "确认撤销");
    if (action === "receipt-edit") return receiptEditForm(id);
    if (action === "receipt-delete") return form("删除并回滚入库单", reason("删除原因") + '<p class="help full">删除将同步冲销该单库存、移除该单生成的设备，并把关联采购恢复为“已通过”。存在维修、报废、安排、附件或冲销后库存不足时会阻止删除。</p>', "receipt.delete", fixed, "确认删除并回滚");
    if (action === "inventory-edit") { const master = M.itemOf(db, r), isNew = !r.id, defaultCategory = isNew && ["safety", "inspections"].includes(pageId) ? "危化品" : "耗材", lock = isNew ? "" : 'disabled data-submit-disabled="true"'; form(isNew ? "新增数量库存档案" : "维护库存阈值", field("classificationCode", "分类编号", master?.classificationCode || "", "text", null, true, lock + (isNew ? 'data-inventory-item="true"' : "")) + field("name", "物品名称", master?.name || "", "text", null, true, lock) + field("spec", "规格型号", master?.spec || "", "text", null, true, lock) + field("category", "分类", master?.category || defaultCategory, "text", M.categories, true, lock) + field("unit", "单位", master?.unit || "个", "text", null, true, lock) + field("trackingMode", "管理方式", master?.trackingMode || "QUANTITY", "text", [["QUANTITY", "数量库存"]], true, lock) + field("custodian", "保管责任人", r.custodian || actor.name, "text", null, true) + field("min", "补库阈值", r.min ?? 10, "number", null, true, 'min="0"') + field("roomId", "初始存放位置（房间）", r.roomId || "", "text", [["", "暂不分配"], ...opts("rooms", storageRoomsFor(master), room => `${room.roomNo} · ${room.name}`)], false, isNew ? 'data-inventory-room="true"' : lock) + field("cabinetId", "橱柜（可选）", r.cabinetId || "", "text", [["", "直接存放于房间"], ...own("cabinets").filter(cabinet => cabinet.roomId === r.roomId && cabinet.state === "启用").map(cabinet => [cabinet.id, `${cabinet.code} · ${cabinet.name}`])], false, isNew ? 'data-inventory-cabinet="true"' : lock) + field("expiry", "有效期（危化品必填）", r.expiry || "", "date", null, M.isHazard(master)) + '<p class="help full">' + (isNew ? "直接登记耗材/危化品信息；危化品须选择符合存放条件的房间并登记未过期有效期。" : h(master?.name || "") + "已有库存，只能维护阈值和有效期；物品和房间变更须走业务。") + "</p>", "inventory.save", { id }); updateInventoryStorageRooms(); return; }
    if (action === "flow") return flowForm(id, kind || "领用");
    if (action === "decide") { const command = { purchases: "purchase.decide", flows: "flow.decide", hazards: "hazard.verify" }[table]; if (!command) throw new Error("当前记录不支持审批。"); return openModal(table === "hazards" ? "整改复查" : "业务审批/复核", fieldsForm(field("outcome", "处理决定", "approve", "text", [["approve", "通过"], ["reject", table === "hazards" ? "退回继续整改" : "驳回"]]) + reason("审批/复核意见")), values => { commit(command, { id, approve: values.outcome === "approve", reason: values.reason }); closeModal(); render(); toast("处理结果已保存并同步。"); }, "确认处理"); }
    if (action === "plan-edit") return planForm(id);
    if (action === "plan-archive") return form("归档实验计划", '<p class="full">计划归档后不再产生新的班级执行记录；未开展记录将失效，已完成记录保留历史。存在待安排、待修改或已安排的实验时不能归档。</p>', "plan.archive", fixed, "确认归档");
    if (action === "plan-delete") return openModal("删除实验计划", fieldsForm(`<p class="full">即将删除“${h(r.name || r.id)}”及其未开展的计划实验和班级执行记录。只允许删除尚未产生预约、安排、总结、流水或附件的计划；已有业务痕迹时请改用归档。</p>${field("reason", "删除原因", "", "textarea", null, true, 'maxlength="100"')}`), values => { const result = commit("plan.delete", { id, reason: values.reason }); closeModal(); render(); toast(`已删除实验计划：${result.id}`); }, "确认删除");
    if (action === "booking-arrange") return arrangementForm(id);
    if (action === "booking-return") return form("退回预约修改", reason("退回原因"), "booking.return", fixed, "确认退回");
    if (action === "booking-resubmit") {
      const booking = get("bookings", id), context = M.taskContext(db, booking.taskId), resourceFields = bookingResourceFields(context, booking.requestedResources, "resubmit-resource");
      return openModal("修改并重新提交预约", fieldsForm(field("requestedDate", "申请日期", booking.requestedDate, "date") + field("requestedPeriod", "申请节次", booking.requestedPeriod, "text", enabledPeriodsFor(context.plan.term).map(period => [period.number, `${period.name} ${period.start}-${period.end}`])) + (context.item.mode === "分组" ? field("groups", "分组数", booking.groups, "number", null, true, 'min="1"') : "") + `<details class="full" open><summary>补充器材需求（可添加，不预占）</summary>${resourceFields}<p class="help">可增删器材或修改数量；管理员安排时再落实到具体设备或库存余额。</p></details>` + field("note", "备注", booking.note || "", "textarea", null, false)), values => { const result = commit("booking.resubmit", { id, ...values, requestedResources: $$('[data-booking-resource-row="resubmit-resource"]').map(resourceRow => ({ itemId: $('[data-booking-resource-item="resubmit-resource"]', resourceRow)?.value, qty: Number($('[data-booking-resource-qty="resubmit-resource"]', resourceRow)?.value || 0) })).filter(resource => resource.itemId && resource.qty > 0) }); closeModal(); render(); detail("bookings", result.id); toast("预约已重新提交，等待管理员安排。"); }, "重新提交");
    }
    if (action === "booking-summary") return summaryForm(id);
    if (action === "booking-delete") return form("删除实验预约", reason("删除原因") + '<p class="help full">只有没有实验安排、库存流水和附件的预约可以删除；删除后对应计划实验恢复为待预约。</p>', "booking.delete", fixed, "确认删除");
    if (action === "booking-cancel") { const arrangement = db.arrangements.find(row => row.bookingId === r.id && row.state !== "已取消"); return form(arrangement ? "取消实验安排" : "取消预约", reason(arrangement ? "取消原因" : "取消原因"), "booking.cancel", fixed); }
    if (action === "summary-edit") return summaryForm("", id);
    if (action === "summary-delete") return form("删除实验总结", reason("删除原因") + '<p class="help full">删除后总结、安排、预约和班级执行状态统一回退为“已安排”；独立业务附件会阻止删除。</p>', "summary.delete", fixed, "确认删除并回退");
    if (action === "check-edit") return checkForm("", id);
    if (action === "check-delete") return form("删除检查记录", reason("删除原因") + '<p class="help full">已有隐患或附件的检查记录不能删除；关联检查任务将恢复为待检查。</p>', "check.delete", fixed, "确认删除");
    if (action === "hazard-edit") return hazardEditForm(id);
    if (action === "hazard-delete") return form("删除隐患记录", reason("删除原因") + '<p class="help full">仅可删除尚未提交整改且没有附件的隐患；最后一条隐患删除后检查结果同步更正为正常。</p>', "hazard.delete", fixed, "确认删除");
    if (action === "hazard-submit") return form("提交整改复查", reason("整改措施及完成情况") + field("attachmentId", "关联整改附件", "", "text", opts("archives", own("archives").filter(file => file.relatedTable === "hazards" && file.relatedId === id))) + '<p class="help full">请先上传关联当前隐患的整改附件。</p>', "hazard.submit", fixed, "提交区级复查");
    if (action === "archive-edit") return archiveEditForm(id);
    if (action === "archive-delete") return form("删除待归档资料", reason("删除原因"), "archive.delete", fixed, "确认删除");
    if (action === "archive-confirm") return form("确认资料归档", `<p class="full">将“${h(r.name)}”纳入本校业务归档。</p>`, "archive.confirm", fixed);
    if (action === "task-new") return taskForm();
    if (action === "task-edit") return taskForm(id);
    if (action === "task-delete-record") return form("删除专项检查任务", reason("删除原因") + '<p class="help full">只有尚未填报检查、没有附件的待检查任务可以删除。</p>', "inspection-task.delete", fixed, "确认删除");
    throw new Error("暂不支持该操作。");
  }
  const RESOURCE_FILE_DB = "lab-demo-resource-files-v1";
  function resourceFileRequest(mode, key, blob = null) {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("当前浏览器不支持资源文件存储。"));
      const request = indexedDB.open(RESOURCE_FILE_DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("files");
      request.onerror = () => reject(request.error || new Error("资源文件存储打开失败。"));
      request.onsuccess = () => { const tx = request.result.transaction("files", mode === "get" ? "readonly" : "readwrite"), store = tx.objectStore("files"), op = mode === "put" ? store.put(blob, key) : mode === "delete" ? store.delete(key) : store.get(key); op.onsuccess = () => resolve(op.result); op.onerror = () => reject(op.error || new Error("资源文件存储失败。")); };
    });
  }
  function download(content, filename, mime = "text/plain;charset=utf-8") {
    if (!db.settings.exportEnabled) throw new Error("当前平台已关闭文件导出，请联系区级管理员在设置中开启。");
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime }), url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); toast(`已生成：${filename}，请查看浏览器下载。`);
  }
  function downloadableReport(title, html) {
    return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${h(title)}</title><style>body{font:14px/1.7 system-ui,sans-serif;max-width:1100px;margin:36px auto;padding:24px;color:#17221c}table{border-collapse:collapse;width:100%;margin:20px 0}td,th{border:1px solid #ddd;padding:9px;text-align:left}th{background:#f2f5f1}pre{white-space:pre-wrap}small,p{color:#4f6056}a{color:#2f6b4d}</style><h1>${h(title)}</h1><p>${h(school() ? name("schools", school()) : db.settings.region)} · ${h(name("terms", view.term))} · 统计日期 ${M.TODAY} · 数据版本 ${db.revision}</p>${html}<p>报告生成于当前业务台账，统计范围与口径见正文。</p></html>`;
  }
  function report(title, cols, rows, note = "") {
    const displayColumns = scope === "school" ? cols.filter(([key, label]) => !schoolScopeFields.has(key) && label !== "学校") : cols;
    const html = `<p class="help">${h(note)}</p>${miniTable(displayColumns, rows)}`; downloadResult = { name: `${title}-${M.TODAY}.html`, content: downloadableReport(title, html) }; openModal(title, `${html}<div class="detail-actions">${button("下载报告（HTML）", "report-download", "", true)}</div>`);
  }
  function cabinetCard(id) {
    const row = get("cabinets", id);
    if (!row || (scope === "school" && row.school !== actor.school)) throw new Error("橱柜不存在或不在当前学校范围。");
    const room = get("rooms", row.roomId), custodian = get("staff", row.custodianId), assets = db.assets.filter(asset => asset.cabinetId === id).map(asset => ({ ...decorate("assets", asset), trackingText: "单件设备", stockText: "1件", state: asset.state || "在库" })), inventory = db.inventory.filter(stock => stock.cabinetId === id).map(stock => ({ ...decorate("inventory", stock), trackingText: "数量库存" }));
    const items = [...assets, ...inventory], meta = miniTable(col("label:项目|value:内容"), [
      { label: "橱柜编号", value: row.code },
      { label: "橱柜名称", value: row.name },
      { label: "所属房间", value: room ? `${room.roomNo} · ${room.name}` : "未关联房间" },
      { label: "橱柜类型", value: row.type },
      { label: "保管责任人", value: custodian?.name || "未指定" },
      { label: "危化品专用", value: row.hazardStorage ? "是" : "否" },
      { label: "使用状态", value: row.state },
      { label: "存放记录", value: `${items.length} 条（设备 ${assets.length}，耗材 ${inventory.length}）` },
      { label: "备注", value: row.note || "未填写" }
    ]);
    const contents = miniTable(col("classificationCode:分类编号|name:物品名称|spec:规格型号|trackingText:管理方式|stockText:数量|location:存放位置|state:状态"), items);
    const html = `${meta}<h3>柜内存放明细</h3>${contents}<p class="help">柜卡按当前台账生成；设备以资产记录为准，耗材以库存余额为准。</p>`;
    downloadResult = { name: `橱柜卡-${row.code || id}-${M.TODAY}.html`, content: downloadableReport(`橱柜卡 · ${row.code || id}`, html) };
    openModal(`橱柜卡 · ${row.code || id}`, `${html}<div class="detail-actions">${button("下载柜卡（HTML）", "report-download", "", true)}</div>`);
  }
  function exportList() {
    const data = dataset(), rows = selected.size ? data.rows.filter(r => selected.has(r.id)) : data.rows;
    if (!rows.length) throw new Error("当前筛选或选中范围没有可导出记录。");
    const content = M.csv([data.columns.map(([, l]) => l), ...rows.map(r => data.columns.map(([k]) => r[k] ?? ""))]);
    const exportNames = { consumableTotal: "易耗品总账", consumableLedger: "易耗品分类账", lossRegisters: "易耗品损耗登记", repairRegisters: "仪器设备维修", scrapRegisters: "仪器设备报废" };
    const exportName = pageId && ["safety", "inspections"].includes(pageId) && view.tab === "hazardInventory" ? "危化品台账" : exportNames[data.table] || M.tableNames[data.table] || "教学统计";
    download(content, `${exportName}-${M.TODAY}.csv`, "text/csv;charset=utf-8");
  }
 function showReport(action) {
    if (action === "asset-report") return report("设备资产分析", col("name:学校|assets:设备数（含报废）|normal:正常使用|value:在账原值（元）|labs:实验室数"), M.scoped(db, "schools", school()).map(s => ({ name: s.name, ...M.metrics(db, s.id, view.term) })), "资产编号唯一；在账原值不含已报废设备。点击台账记录可查看来源单据及维修、报废履历。");
    if (action === "teaching-report") return report("实验教学完成报告", columns.report, M.teaching(db, school(), view.term, "school", teachingFilters({})), "应开次数来自已发布计划实验与适用班级；仅已提交实验总结的班级执行记录计为实开。");
    if (action === "risk-report") return report("危化品风险清单", columns.hazardInventory, records("inventory").filter(i => M.isHazard(M.itemOf(db, i))).map(i => decorate("inventory", i)).filter(i => i.riskText && i.riskText !== "正常"), "根据当前库存、有效期、存放位置、检查隐患和统计日期生成；风险状态用于工作队列，不替代现场安全判断。");
 }
 function importForm() {
   importResult = null;
    openModal("模板导入并生成入库单", fieldsForm(`<div class="full"><p class="help">使用UTF-8 CSV（Excel可另存为CSV UTF-8），模板列与下方“物品明细”字段一致：分类编号、物品名称、规格型号、分类、单位、管理方式、需要周期维保、数量、单价、存放位置（房间）、橱柜编号（可选）、下次维保日期、有效期。兼容旧版12列表头；1—30行、总量不超过100件。填写橱柜编号时必须同时填写所属房间编号。供应商、登记日期、购置日期和备注仍在本弹窗中填写。</p><div class="inline-actions">${button("下载CSV模板", "template-download")}${button("填入内容", "import-example")}</div><label class="field"><span class="field-label">选择CSV文件</span><input type="file" id="importFile" accept=".csv,text/csv"></label></div>` + field("source", "模板内容", "", "textarea", null, true, 'rows="6"') + `<div class="full">${button("校验并预览", "import-preview")}<div id="importPreview" aria-live="polite"></div></div>` + receiptFields()), v => { const validation = M.validateImport(v.source, db, actor.school); if (validation.errors.length) throw new Error(validation.errors.join("\n")); if (!importResult || importResult.source !== v.source) throw new Error("请先校验当前内容并确认预览。"); const result = commit("receipt.create", { ...v, items: validation.items }); closeModal(); render(); detail("receipts", result.id); }, "确认导入入库");
  }
  function attachmentForm(table, id) {
    pendingFile = null;
    const allowedTables = ["assets", "purchases", "repairs", "plans", "bookings", "arrangements", "summaries", "checks", "hazards", "staff", "receipts"];
    const teacherOwns = (t, r) => (t === "staff" && r.id === actor.id) || (t === "plans" && teacherCanSeePlan(r)) || r.teacherId === actor.id || r.reporter === actor.name || t === "arrangements" && get("bookings", r.bookingId)?.teacherId === actor.id || t === "summaries" && get("bookings", get("arrangements", r.arrangementId)?.bookingId)?.teacherId === actor.id;
    const candidates = allowedTables.flatMap(t => own(t).filter(r => actor.role !== "teacher" || teacherOwns(t, r)).map(r => [`${t}|${r.id}`, `${M.tableNames[t]} · ${r.name || r.title || r.id}`]));
    if (!candidates.length) throw new Error("当前身份暂无可关联业务资料。");
    const category = ["checks", "hazards"].includes(table) ? "安全管理" : table === "staff" ? "人员档案" : ["plans", "bookings", "arrangements", "summaries"].includes(table) ? "实验教学" : "设备建设";
    openModal("上传/生成业务附件", fieldsForm(field("related", "关联业务", table && id ? `${table}|${id}` : candidates[0][0], "text", candidates) + field("category", "资料分类", category, "text", ["实验教学", "安全管理", "人员档案", "设备建设"]) + `<div class="full"><label class="field"><span class="field-label">上传原始文件（最大512KB）</span><input type="file" id="attachmentFile" accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx"></label><p class="help" id="fileStatus">请勿上传真实敏感资料。未上传文件时，可填写文本内容并保存为TXT。</p>${button("生成关联业务说明", "attachment-example")}</div>` + field("name", "保存文件名", "业务说明.txt") + field("content", "文本附件内容（上传文件后无需填写）", "", "textarea", null, false, 'rows="6"') + check("archive", "同时确认归档", actor.role !== "teacher")), v => { const [relatedTable, relatedId] = v.related.split("|"); if (pendingFile && v.name !== pendingFile.name) throw new Error("上传文件须保留原文件名；如需文本内容，请点击生成业务说明。"); const result = commit("archive.create", { ...v, relatedTable, relatedId, ...(pendingFile || { mime: "text/plain;charset=utf-8" }), archive: actor.role !== "teacher" && v.archive }); closeModal(); render(); detail("archives", result.id); }, "保存附件");
  }
  function resourceGradeFields(selectedGrades = []) {
    const grades = M.resourceGrades;
    return `<div class="full resource-grade-field"><span class="field-label">适用年级 <span class="required">*</span></span><div class="resource-grade-options">${grades.map(grade => `<label class="check-field"><input type="checkbox" data-resource-grade value="${h(grade)}" ${selectedGrades.includes(grade) ? "checked" : ""}>${h(grade)}</label>`).join("")}</div></div>`;
  }
  function resourceForm(id = "") {
    pendingResourceFile = null;
    const row = id ? get("resources", id) : null, selectedGrades = row?.grades || ["高一"], fileName = row?.originalName || "", allowedSubjects = [...new Set([...subjectValues(), row?.subject].filter(Boolean))];
    const fileHint = row ? `当前文件：${h(fileName)}${row.size ? `（${Math.max(1, Math.round(row.size / 1024))} KB）` : ""}` : "支持 PDF、Word、PPT、Excel、图片、TXT、CSV、MP4、WebM，单个文件最大100MB。";
    const html = field("title", "资源名称", row?.title || "") + field("resourceType", "资源类型", row?.resourceType || "教学设计", "text", M.resourceTypes) + field("subject", "学科", row?.subject || currentPlanSubject(), "text", M.subjectOptionsFor(allowedSubjects)) + resourceGradeFields(selectedGrades) + field("experimentCategory", "实验属性", row?.experimentCategory || "必做", "text", M.resourceCategories) + field("description", "资源说明", row?.description || "", "textarea", null, false, 'maxlength="500" rows="4"') + `<div class="full resource-upload-field"><label class="field"><span class="field-label">${row ? "替换文件（可选）" : "上传资源文件"}${row ? "" : ' <span class="required">*</span>'}</span><input type="file" id="resourceFile" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.txt,.csv,.mp4,.webm"></label><p class="help" id="resourceFileStatus">${fileHint}</p></div>`;
    openModal(id ? "编辑教学资源" : "上传教学资源", fieldsForm(html), values => {
      const grades = $$('[data-resource-grade]:checked').map(input => input.value);
      const payload = { ...values, term: view.term, grades, ...(pendingResourceFile || {}) };
      const previousFileKey = row?.fileKey || "";
      const result = commit(id ? "resource.update" : "resource.create", id ? { ...payload, id } : payload);
      if (previousFileKey && pendingResourceFile?.fileKey && pendingResourceFile.fileKey !== previousFileKey) resourceFileRequest("delete", previousFileKey).catch(() => {});
      closeModal(); render(); resourceDetail(result.id); toast(id ? "教学资源已更新。" : "教学资源已入库。");
    }, id ? "保存修改" : "上传并入库");
  }
  function resourceDetail(id) {
    const row = get("resources", id); if (!row || (scope === "school" && row.school !== actor.school)) throw new Error("资源不存在或不在当前学校范围。");
    const canEdit = actor.role === "admin" || row.uploaderId === actor.id && subjectAllowed(row.subject);
    const actions = button("预览资源", "resource-preview", `data-table="resources" data-id="${h(row.id)}"`, true) + button("下载资源", "resource-download", `data-table="resources" data-id="${h(row.id)}"`) + (canEdit ? button("编辑", "resource-edit", `data-table="resources" data-id="${h(row.id)}"`) : "");
    const html = `<div class="resource-detail-head"><div class="resource-file-icon ${h(row.extension || "file")}">${h((row.extension || "文件").slice(0, 4).toUpperCase())}</div><div><h3>${h(row.title)}</h3><p>${h(row.originalName || "未登记文件")} · ${row.size ? `${Math.max(1, Math.round(row.size / 1024))} KB` : "演示资源"}</p></div></div><dl class="detail-grid resource-detail-grid"><div><dt>资源类型</dt><dd>${h(row.resourceType)}</dd></div><div><dt>学科</dt><dd>${h(subjectLabel(row.subject))}</dd></div><div><dt>适用年级</dt><dd>${h((row.grades || []).join("、"))}</dd></div><div><dt>实验属性</dt><dd>${h(row.experimentCategory)}</dd></div><div><dt>上传人</dt><dd>${h(row.uploaderName || name("staff", row.uploaderId))}</dd></div><div><dt>更新时间</dt><dd>${h(String(row.updatedAt || row.createdAt || "").slice(0, 10))}</dd></div></dl>${row.description ? `<section class="resource-description"><h3>资源说明</h3><p>${h(row.description)}</p></section>` : ""}<div class="detail-actions">${actions}</div>`;
    openModal("教学资源详情", html);
  }
  function resourceBlob(row) {
    if (row.fileKey) return resourceFileRequest("get", row.fileKey).catch(() => null);
    if (row.dataUrl) { const [header, encoded] = row.dataUrl.split(","), bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0)); return Promise.resolve(new Blob([bytes], { type: header.slice(5).split(";")[0] })); }
    if (row.content) return Promise.resolve(new Blob([row.content], { type: row.mime || "text/plain;charset=utf-8" }));
    return Promise.resolve(null);
  }
  async function resourceDownload(id) {
    const row = get("resources", id); if (!row) throw new Error("资源不存在。"); const blob = await resourceBlob(row); if (!blob) throw new Error("该演示资源尚未附加原始文件。"); download(blob, row.originalName || row.title, row.mime);
  }
  async function resourcePreview(id) {
    const row = get("resources", id); if (!row) throw new Error("资源不存在。"); const blob = await resourceBlob(row); if (!blob) return openModal("资源预览", `<div class="resource-empty-preview"><strong>暂无可预览文件</strong><p>这是演示资源条目，请上传原始文件后预览。</p></div>`);
    const url = URL.createObjectURL(blob), mime = row.mime || blob.type || ""; let body = "";
    if (mime.startsWith("video/")) body = `<video class="resource-preview-media" controls src="${url}"></video>`;
    else if (mime.startsWith("image/")) body = `<img class="resource-preview-media" src="${url}" alt="${h(row.title)}">`;
    else if (mime === "application/pdf") body = `<iframe class="resource-preview-frame" src="${url}" title="${h(row.title)}"></iframe>`;
    else if (mime.startsWith("text/") || /csv/.test(mime)) body = `<pre class="file-preview resource-preview-text">${h(await blob.text())}</pre>`;
    else body = `<div class="resource-empty-preview"><strong>该文件格式暂不支持在线预览</strong><p>请下载后使用本地应用打开。</p>${button("下载资源", "resource-download", `data-table="resources" data-id="${h(row.id)}"`, true)}</div>`;
    openModal("预览资源", `<div class="resource-preview">${body}</div>`); setTimeout(() => URL.revokeObjectURL(url), 300000);
  }
  function fileDownload(id) { const f = get("archives", id); if (!f || (scope !== "district" && f.school !== actor.school)) throw new Error("文件不在当前范围。"); if (f.dataUrl) { const [header, encoded] = f.dataUrl.split(","), bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0)); download(new Blob([bytes], { type: header.slice(5).split(";")[0] }), f.name); } else download(f.content, f.name, f.mime); }
  function batchArchives() {
    const rows = dataset().rows.filter(r => !selected.size || selected.has(r.id)); if (!rows.length) throw new Error("当前范围没有资源。");
    const html = `<p>包含${rows.length}份教学资源。支持文本内容的资源可直接阅读，其余资源请在资源库中逐项预览或下载。</p>` + rows.map(f => { const url = f.dataUrl || (f.content ? `data:${f.mime},${encodeURIComponent(f.content)}` : ""); return `<section><h2>${h(f.title)}</h2><p>${h(f.resourceType)} · ${h(subjectLabel(f.subject))} · ${h((f.grades || []).join("、"))} · ${h(f.experimentCategory)}</p>${url ? `<a href="${h(url)}" download="${h(f.originalName || f.title)}">保存原文件</a>` : "<p>此演示资源未附原始文件。</p>"}${f.content ? `<pre>${h(f.content)}</pre>` : ""}</section>`; }).join("");
    download(downloadableReport("教学资源包", html), `教学资源包-${M.TODAY}.html`, "text/html;charset=utf-8");
  }
  function batchApproval() {
    const data = dataset(); if (data.table !== "purchases") throw new Error("请进入采购申请列表。"); const rows = data.rows.filter(r => selected.has(r.id) && r.state === "待审核");
    if (!rows.length) throw new Error("请先勾选至少一条待审核记录。");
    openModal("批量审批", fieldsForm(`<p class="full">将处理选中的 ${rows.length} 条待审核记录；非待审核记录不处理。</p>${miniTable(data.columns, rows)}${field("outcome", "处理决定", "approve", "text", [["approve", "通过"], ["reject", "驳回"]])}${field("reason", "统一审批意见", "", "textarea")}`), v => {
      if (persistenceError) throw new Error(persistenceError); let next = M.migrate(JSON.parse(localStorage.getItem(M.KEY))); if (next.revision !== modalRevision) throw new Error("数据已更新，请关闭后重新选择。");
      rows.forEach(r => { next = M.transact(next, actor, "purchase.decide", { id: r.id, approve: v.outcome === "approve", reason: v.reason }).db; });
      localStorage.setItem(M.KEY, JSON.stringify(next)); db = next; selected.clear(); closeModal(); render(); toast(`已完成${rows.length}条审批，逐条留有处理轨迹。`);
    }, "确认批量处理");
  }
  function settingsView() {
    const s = db.settings;
    return `${tabsMarkup()}<section class="panel settings-panel"><h2>平台参数</h2><p class="help">设置即时影响各业务页面；提醒仅在工作台展示，不发送短信、邮件，也不会后台调度。</p><form id="settingsForm" class="form-grid">${field("region", "区域名称", s.region)}${field("authority", "主管单位", s.authority)}${field("repairDays", "维修/维保提前提醒天数", s.repairDays, "number", null, true, 'min="1"')}${check("lowStock", "工作台显示库存不足提醒", s.lowStock)}${check("weeklyReport", "工作台显示教学周报入口", s.weeklyReport)}${check("syncReminder", "学校总览显示数据上报提醒", s.syncReminder)}${check("exportEnabled", "允许文件导出和下载", s.exportEnabled)}<div class="full"><button class="button primary" type="submit">保存设置</button></div></form></section>`;
  }
  function dashboard() {
    const m = M.metrics(db, school(), view.term), tiles = scope === "district" ? [["纳入学校", M.scoped(db, "schools", school()).length, "所"], ["当前范围设备原值", money(m.value), "元"], ["必做实验开出率", m.rate, `${m.done}/${m.required}次`], ["创新实验开出率", m.innovationRate, `${m.innovationDone}/${m.innovation}次`], ["安全隐患（共享）", m.hazards - m.closed, "项待闭环"]] : [["当前范围设备资产", m.assets, "件（含报废）"], ["待完成必做实验", m.pending, "次"], ["创新实验待完成", m.innovationPending, "次"], ["当前范围库存不足", m.low, "种"], ["安全隐患（共享）", m.hazards - m.closed, "项待闭环"]];
    const tasks = [];
    if (scope === "district") { records("purchases").filter(r => r.state === "待审核").forEach(r => tasks.push(["采购待审核", "purchases", r])); records("hazards").filter(r => r.state === "待复查").forEach(r => tasks.push(["整改待复查", "hazards", r])); }
    else { records("bookings").filter(r => rowMatchesSubject("bookings", r) && M.taskContext(db, r.taskId).plan.term === view.term && M.activeBooking(r) && (actor.role !== "teacher" || r.teacherId === actor.id)).forEach(r => tasks.push([`实验${decorate("bookings", r).state}`, "bookings", r])); if (actor.role !== "teacher") { records("tasks").filter(r => r.state === "待检查").forEach(r => tasks.push(["检查待填报（共享）", "tasks", r])); records("flows").filter(r => rowMatchesSubject("flows", r) && r.state === "待复核").forEach(r => tasks.push(["库存待复核", "flows", r])); records("hazards").filter(r => r.state !== "已关闭").forEach(r => tasks.push(["隐患待闭环（共享）", "hazards", r])); } }
    const attention = [ ...records("assets").filter(a => rowMatchesSubject("assets", a) && a.state === "正常使用" && a.nextMaintenance && a.nextMaintenance <= addDays(M.TODAY, db.settings.repairDays)).map(r => ["设备维保提醒", "assets", r]), ...(db.settings.lowStock ? records("inventory").filter(i => rowMatchesSubject("inventory", i) && i.stock < i.min).map(r => ["库存低于阈值", "inventory", r]) : []) ];
    const queue = rows => rows.length ? rows.slice(0, 8).map(([label, table, r]) => `<div class="list-item"><span class="list-mark ${table === "hazards" ? "danger" : "warning"}" aria-hidden="true">${h(label.slice(0, 1))}</span><div><div class="list-title">${h(label)}</div><div class="list-desc">${h(r.title || r.name || (r.taskId ? taskLabel(get("teachingTasks", r.taskId)) : r.id))} · ${h(name("schools", r.school))}</div></div>${button("查看处理", "detail", `data-table="${table}" data-id="${h(r.id)}"`)}</div>`).join("") : '<div class="empty-message">当前范围暂无待办。</div>';
    return `<div class="metrics-grid">${tiles.map(([label, value, unit], i) => `<section class="metric${i === 0 ? " featured" : ""}"><div><span class="metric-label">${label}</span><div class="metric-value">${value}</div><div class="metric-meta">${unit}</div></div>${i === 0 ? `<div class="metric-index" aria-hidden="true"><span>${scope === "district" ? "区域" : "资产"}</span></div>` : ""}</section>`).join("")}</div><div class="dashboard-grid"><section class="panel"><div class="panel-header"><h2 class="panel-title">业务待办 <small>${tasks.length}项</small></h2></div><div class="panel-body">${queue(tasks)}${tasks.length > 8 ? '<p class="help">此处显示前8项，完整记录见对应业务列表。</p>' : ""}</div></section><section class="panel"><div class="panel-header"><h2 class="panel-title">运行提醒 <small>${attention.length}项</small></h2></div><div class="panel-body">${queue(attention)}</div></section></div><section class="panel"><div class="panel-header"><h2 class="panel-title">教学执行情况</h2></div><div class="panel-body">${miniTable(columns.report, M.teaching(db, school(), view.term, scope === "district" ? "school" : "subject", teachingFilters({})))}<div class="detail-actions">${button("查看完成统计", "teaching-report")}${db.settings.weeklyReport ? button("生成本周教学周报", "weekly-report") : ""}${scope === "school" ? button("上报本学期数据", "submission", "", true, permit("admin")) : ""}</div>${scope === "school" && db.settings.syncReminder ? '<p class="help">台账变更实时反映在区域管理页面；“数据上报”另存一份具备版本号的提交快照，便于核对。</p>' : ""}</div></section>`;
  }
  function aiView() {
    return `<div class="ai-layout"><section class="ai-chat"><div class="ai-messages"><div class="message"><span class="message-avatar" aria-hidden="true">AI</span><div class="message-bubble">可以查询设备、耗材、教学完成、安全、维修和人员信息。结果来自当前学校范围及学期台账。</div></div><div id="aiResult" aria-live="polite"><p class="help">输入问题后展示可核对的明细与统计口径。</p></div></div><div class="ai-compose"><form id="askForm" class="compose-row"><input class="input" name="question" placeholder="例如：哪些耗材需要补库？" required aria-label="输入台账问题"><button type="submit" class="button primary">查询</button></form></div></section><aside class="ai-side"><section class="topic-card"><h2 class="topic-title">常用问题</h2><div class="topic-list">${["设备有多少，原值是多少？", "哪些耗材库存不足？", "本学期必做实验完成情况？", "还有哪些安全隐患未关闭？"].map(q => `<button type="button" class="topic-button" data-action="ask-example" data-question="${h(q)}">${h(q)}</button>`).join("")}</div></section><section class="topic-card"><h2 class="topic-title">支持查询</h2><p class="help">支持设备、库存、教学、安全、维修和人员查询；未知问题会说明能力边界，可下载已生成的查询结果。</p></section></aside></div>`;
  }
  function ask(question) {
    let table, rows, answer; const subject = isAllSubject(view.subject) ? "" : view.subject, m = M.metrics(db, school(), view.term, subject);
    if (/耗材|库存|补库|危化/.test(question)) { table = "inventory"; rows = records(table).filter(i => rowMatchesSubject(table, i)).filter(i => /不足|低|补库/.test(question) ? i.stock < i.min : /危化/.test(question) ? M.isHazard(M.itemOf(db, i)) : true); answer = `匹配${rows.length}种物品；当前范围库存低于阈值的共${m.low}种。`; }
    else if (/隐患|安全|整改|检查/.test(question)) { table = "hazards"; rows = records(table).filter(r => /未|待|还有/.test(question) ? r.state !== "已关闭" : true); answer = `已记录${m.hazards}项隐患，已关闭${m.closed}项，闭环率${m.closure}。`; }
    else if (/维修|报修|报废|维保/.test(question)) { table = "repairs"; rows = records(table).filter(row => rowMatchesSubject(table, row)); answer = `当前范围有${rows.length}条设备处理记录。`; }
    else if (/教师|人员|管理员|实验员/.test(question)) { table = "staff"; rows = records(table).filter(r => r.enabled); const administrators = rows.filter(r => r.role === "admin").length; answer = `启用人员${m.staff}人，其中学校管理员${administrators}人。`; }
    else if (/教学|完成|开出|应开|实开|实验计划/.test(question)) { table = "report"; rows = M.teaching(db, school(), view.term, "school", teachingFilters({ subject })); answer = `必做实验应开${m.required}次、实开${m.done}次，开出率${m.rate}；选做${m.optionalDone}/${m.optional}次，创新实验${m.innovationDone}/${m.innovation}次。应开次数来自已发布计划实验与适用班级，提交总结后计为实开。`; }
    else if (/设备|资产|原值/.test(question)) { table = "assets"; rows = records(table).filter(row => rowMatchesSubject(table, row)); answer = `当前学科范围设备${m.assets}件（含报废），正常使用${m.normal}件，在账原值${money(m.value)}元（不含报废）。`; }
    else { $("#aiResult").innerHTML = '<div class="query-answer"><strong>暂不支持此类问题。</strong><p>可以查询设备数量、库存不足、教学完成、安全隐患、维修记录或人员信息。</p></div>'; return; }
    const shown = table === "report" ? rows : rows.map(r => decorate(table, r)), html = `<div class="query-answer"><h3>${h(question)}</h3><p>${h(answer)}</p><p class="help">来源：${h(M.tableNames[table] || "教学计划与完成登记")} · 范围：${h(school() ? name("schools", school()) : "全部学校")} · 学期：${h(name("terms", view.term))} · 版本：${db.revision} · 统计日期：${M.TODAY}</p>${miniTable(columns[table], shown)}${button("下载问数结果（HTML）", "report-download")}</div>`;
    downloadResult = { name: `智能问数结果-${M.TODAY}.html`, content: downloadableReport("智能问数 · 查询结果", html.replace(/<button[\s\S]*?<\/button>/g, "")) }; $("#aiResult").innerHTML = html;
  }
  const navIcons = {
    dashboard: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="7" height="7" rx="1.2"></rect><rect x="13.5" y="3.5" width="7" height="7" rx="1.2"></rect><rect x="3.5" y="13.5" width="7" height="7" rx="1.2"></rect><rect x="13.5" y="13.5" width="7" height="7" rx="1.2"></rect></svg>',
    "ai-query": '<svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.3"></circle><path d="m16 16 4.5 4.5"></path></svg>',
    schools: '<svg viewBox="0 0 24 24"><path d="M3.5 20.5h17"></path><path d="M5.5 20.5V8.2L12 4l6.5 4.2v12.3"></path><path d="M9 20.5v-5h6v5M8.5 10.5h.1M12 10.5h.1M15.5 10.5h.1"></path></svg>',
    teachers: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"></circle><path d="M3.5 20c.5-3.3 2.4-5 5.5-5s5 1.7 5.5 5M16 5.5a2.5 2.5 0 0 1 0 5M17 15c2 .2 3.3 1.8 3.5 5"></path></svg>',
    staff: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"></circle><path d="M3.5 20c.5-3.3 2.4-5 5.5-5s5 1.7 5.5 5M16 13.5a3.5 3.5 0 0 1 4 3.5v3"></path></svg>',
    equipment: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M8 8h8v8H8zM2.5 9h1.5M2.5 15h1.5M20 9h1.5M20 15h1.5M9 2.5V4M15 2.5V4M9 20v1.5M15 20v1.5"></path></svg>',
    devices: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4" width="17" height="12" rx="1.8"></rect><path d="M8 20h8M12 16v4"></path></svg>',
    consumables: '<svg viewBox="0 0 24 24"><path d="M5 8.5 12 4l7 4.5v7L12 20l-7-4.5z"></path><path d="m5 8.5 7 4.2 7-4.2M12 12.7V20"></path></svg>',
    supplies: '<svg viewBox="0 0 24 24"><path d="M8 3.5h8v4l2.5 3v7.5a3 3 0 0 1-3 3h-7a3 3 0 0 1-3-3v-7.5L8 7.5z"></path><path d="M7.5 13h9M9 16.5h6"></path></svg>',
    maintenance: '<svg viewBox="0 0 24 24"><path d="m14.5 6.5 3-3 3 3-3 3M4 20l8.8-8.8"></path><path d="m13 8 3 3M5 4.5a5.5 5.5 0 0 0 6.8 7.1L20 19.8a1.4 1.4 0 0 1-2 2l-8.2-8.2A5.5 5.5 0 0 0 5 4.5Z"></path></svg>',
    repair: '<svg viewBox="0 0 24 24"><path d="M14.5 5.5a5 5 0 0 0 6 6l-6.8 6.8a2.1 2.1 0 1 1-3-3l6.8-6.8a5 5 0 0 1-3-3Z"></path><path d="m5 5 3 3M4 4l4 4"></path></svg>',
    experiments: '<svg viewBox="0 0 24 24"><path d="M9 3.5h6M10 3.5v6.2l-5 8.5a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-8.5V3.5"></path><path d="M7.3 16h9.4"></path></svg>',
    schedule: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2"></rect><path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17M7.5 13h.1M12 13h.1M16.5 13h.1M7.5 16.5h.1M12 16.5h.1"></path></svg>',
    booking: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2"></rect><path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17M12 12.5v5M9.5 15h5"></path></svg>',
    safety: '<svg viewBox="0 0 24 24"><path d="M12 3.5 19 6v5.7c0 4.2-2.6 7.2-7 8.8-4.4-1.6-7-4.6-7-8.8V6z"></path><path d="m8.5 12 2.2 2.2 4.8-5"></path></svg>',
    inspections: '<svg viewBox="0 0 24 24"><path d="M6 3.5h9l3 3v14H6z"></path><path d="M14.5 3.5v4h3.5M8.5 12h7M8.5 15.5h4"></path></svg>',
    archives: '<svg viewBox="0 0 24 24"><path d="M4 7.5h16v12H4zM3 4h18v3.5H3z"></path><path d="M9 11.5h6"></path></svg>',
    labs: '<svg viewBox="0 0 24 24"><path d="M4 20.5h16M6 20.5V6h12v14.5M9 9.5h.1M12 9.5h.1M15 9.5h.1M9 13h.1M12 13h.1M15 13h.1"></path></svg>',
    settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-2.6V20a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H6v-2.6h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V6h2.6v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v2.6h-.2A1.7 1.7 0 0 0 19.4 15Z"></path></svg>'
  };
  function navIcon(id) { return navIcons[id] || navIcons.dashboard; }
    const descriptions = { dashboard: "待办、异常与教学执行情况集中查看。", schools: "维护学校和实验室档案，核对学校上报的数据快照。", teachers: "维护任课教师、任课班级、实验负责人配置和人员资质记录。", staff: "管理本校人员、班级和任课教师信息。", labs: "维护实验室档案、容量、学科和危化品存放条件。", equipment: "统一编号的单件资产台账，支持来源追溯和统计分析。", devices: "采购申请、到货入库、入库和设备建档。", consumables: "查看易耗品总账、分类账和损耗登记。", supplies: "查看易耗品总账、分类账和损耗登记。", maintenance: "登记和查看仪器设备维修、报废记录。", repair: "登记和查看仪器设备维修、报废记录。", experiments: scope === "district" ? "跨校查看实验计划及各班执行进度，追溯教学统计来源。" : "统一编制实验计划，并在计划详情中查看各班执行进度或发起预约。", schedule: "以实验计划的班级执行情况和已提交实验总结为依据，核对教学完成情况。", booking: "预约与安排共用同一业务台账，按页签查看已预约、已安排和待登记总结实验。", safety: "以危化品台账为对象，贯通存放检查、专项检查、隐患整改和区级复查。", inspections: "以危化品台账为对象，贯通存放检查、专项检查、隐患整改和区级复查。", archives: "集中管理教学设计、教案、学案、课件、实验视频和学习单，支持按学科、年级与实验属性检索。", settings: "维护基础数据、平台参数和可追溯的操作日志。", "ai-query": "用自然语言查询当前范围的业务台账。" };
  function identityFields() {
    return field("school", "学校", actor.school || identity.school || "S1", "text", opts("schools", db.schools), true, 'data-identity-school="true"') + field("personId", "学校角色账号", actor.id, "text", opts("staff", db.staff.filter(t => t.enabled && t.school === (actor.school || identity.school || "S1")), t => `${t.name} · ${M.roles[t.role]} · ${subjectLabel(t.subject)}`));
  }
  function subjectContextField() {
    if (!subjectContextEnabled()) return "";
    const values = subjectValues();
    if (actor.role === "teacher" && values.length <= 1) return `<div class="subject-context-field"><span class="field-label">学科范围</span><span class="scope-label locked">${h(subjectLabel(values[0] || "未分配学科"))}</span><small class="help">按专业学科与本学期任课关系锁定</small></div>`;
    return `<div class="subject-context-field">${field("scopeSubject", "学科范围", view.subject, "text", subjectOptions(), false, 'data-context="subject"') }<small class="help">当前模块的统一工作范围</small></div>`;
  }
  function demoControl() {
    openModal("系统控制", fieldsForm(`<p class="help full">仅此处切换身份。操作范围根据所选角色和学校确定。</p>` + identityFields() + `<div class="full inline-actions">${button("进入区级管理员端", "district-login")}${button("备份当前数据（JSON）", "backup")}<a class="button" href="../../preview.html" target="_blank" rel="noopener">页面总览与尺寸预览</a></div>`), v => enterSchool(v.school, v.personId), "切换至所选学校账号");
  }
  function enterSchool(s, personId) { const person = get("staff", personId); if (!person?.enabled || person.school !== s) throw new Error("请选择该校启用账号。"); savePref("lab-demo-identity", { role: person.role, school: s, personId }); location.href = scope === "login" ? "pages/school/dashboard.html" : "../school/dashboard.html"; }
  function enterDistrict() { savePref("lab-demo-identity", { ...identity, role: "district" }); location.href = scope === "login" ? "pages/district/dashboard.html" : "../district/dashboard.html"; }
  function applyOfficialBranding() {
    $$(".brand-mark").forEach(mark => {
      const frame = document.createElement("span");
      frame.className = "official-logo";
      const image = document.createElement("img");
      image.src = logoPath;
      image.alt = "青浦教育 LOGO";
      frame.append(image);
      mark.replaceWith(frame);
    });
  }
  function renderLogin() {
    app.innerHTML = `<main class="login-page"><section class="login-intro"><div class="login-brand"><span class="brand-mark">实验</span><strong>实验教学设备管理平台</strong></div><div class="login-message"><h1>让实验教学<br>有据可查。</h1><p>从一间实验室的日常运行，到区域实验教学与资源的协同管理。</p></div><div class="login-proof"><div class="proof-item"><div class="proof-value">${db.schools.length}</div><div class="proof-label">接入学校</div></div><div class="proof-item"><div class="proof-value">${db.rooms.filter(room => room.type === "教学实验室").length}</div><div class="proof-label">实验室数量</div></div><div class="proof-item"><div class="proof-value">区校</div><div class="proof-label">协同业务流程</div></div></div></section><section class="login-form-wrap"><div class="login-card"><h2>选择工作身份</h2><p>学校端按学校管理员、任课教师区分操作权限。</p><form id="loginForm" class="login-form">${identityFields()}<button class="button primary login-submit" type="submit">进入学校端</button>${button("进入区级管理员端", "district-login")}</form><div class="login-help"><span>业务台账</span></div><p class="help">请选择已有身份进入系统；修改后可在各业务页面继续查看。</p>${persistenceError ? `<p class="form-error">${h(persistenceError)}</p>${button("恢复数据", "reset-confirm")}` : ""}</div></section></main>${modalShell()}`;
  }
  function modalShell() { return `<div class="modal-backdrop" id="modalBackdrop" aria-hidden="true"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><header class="modal-head"><h2 id="modalTitle"></h2><button class="modal-close" type="button" id="modalClose" data-action="close" aria-label="关闭对话框">×</button></header><div class="modal-body" id="modalBody"></div><footer class="modal-foot" id="modalFoot"></footer></section></div><div class="toast-region" id="toastRegion" role="status" aria-live="polite"></div>`; }
  function render() {
    if (scope === "login") return renderLogin();
    const pageKey = pageId === "inspections" ? "safety" : pageId, nav = M.navigationFor(scope, actor.role), current = (M.navigation[scope] || []).flatMap(g => g.items).find(i => i.id === pageKey), title = current?.label || "业务工作台";
    const data = ["dashboard", "ai-query"].includes(pageId) ? null : dataset();
    const scopeContext = scope === "district" ? field("scopeSchool", "学校范围", view.school, "text", [["", "全部学校"], ...opts("schools", db.schools)], false, 'data-context="school"') : `<span class="scope-label">${h(name("schools", actor.school))} · ${h(M.roles[actor.role])}</span>`, termContext = referencePage() || pageId === "archives" ? "" : field("scopeTerm", "学期", view.term, "text", opts("terms", db.terms), true, 'data-context="term"'), context = scopeContext + termContext + subjectContextField();
    document.title = `${title} | 实验教学设备管理平台`;
    const breadcrumbSubject = subjectContextEnabled() && !isAllSubject(view.subject) ? `<span> / </span>${h(subjectLabel(view.subject))}` : "";
    app.innerHTML = `<div class="app-shell"><aside class="rail"><a class="rail-brand" href="dashboard.html"><span class="brand-mark">实验</span><div><strong class="brand-title">实验教学设备管理平台</strong><small class="brand-subtitle">${scope === "district" ? "区域监管端" : actor.role === "teacher" ? "教师工作端" : "学校管理端"}</small></div></a><nav class="rail-nav" aria-label="主导航">${nav.map((g, index) => `<section class="nav-group" aria-labelledby="nav-group-${index}"><div class="nav-group-label" id="nav-group-${index}">${h(g.label)}</div>${g.items.map(i => `<a class="nav-link ${i.id === pageKey ? "active" : ""}" href="${i.href}" ${i.id === pageKey ? 'aria-current="page"' : ""}><span class="nav-mark" aria-hidden="true">${navIcon(i.id)}</span><span class="nav-text">${h(i.label)}</span></a>`).join("")}</section>`).join("")}</nav><footer class="rail-footer"><div class="identity-card"><span class="identity-avatar" aria-hidden="true">${h(actor.name.slice(0, 1))}</span><div><div class="identity-name">${h(actor.name)}</div><div class="identity-role">${h(M.roles[actor.role])}</div></div></div><div class="identity-role">${scope === "district" ? h(db.settings.authority) : h(name("schools", actor.school))}</div></footer></aside><main class="app-main"><header class="app-topbar"><div class="breadcrumb">${scope === "district" ? h(db.settings.region) : h(name("schools", actor.school))}${breadcrumbSubject}<span> / </span>${h(title)}</div><div class="topbar-actions">${button("系统控制", "demo-control")}</div></header>${persistenceError ? `<div class="storage-warning" role="alert">${h(persistenceError)}</div>` : ""}<div class="page"><header class="page-header"><div class="page-heading"><div class="page-heading-row"><h1 class="page-title">${h(title)}</h1><p class="page-kicker">${scope === "district" ? "区域监管" : actor.role === "teacher" ? "教师工作" : "学校管理"}</p></div><p class="page-description">${h(descriptions[pageId] || "")}</p></div>${data && data.table !== "settings" ? `<div class="page-actions">${actionsFor(data.table)}</div>` : ""}</header><div class="context-bar">${context}</div>${pageId === "dashboard" ? dashboard() : pageId === "ai-query" ? aiView() : listView(data)}<footer class="page-footnote">当前页面与各项统计共用同一套业务台账。设备、耗材和安全记录为当前台账；教学指标按所选学期统计。</footer></div></main></div>${modalShell()}`;
  }
  function handleAction(el) {
    const { action, id, table, kind } = el.dataset;
    if (action === "close") return closeModal();
    if (action === "detail") return detail(table, id);
    if (action === "resource-detail") return resourceDetail(id);
    if (action === "resource-new") return resourceForm();
    if (action === "resource-edit") return resourceForm(id);
    if (action === "resource-preview") return resourcePreview(id);
    if (action === "resource-download") return resourceDownload(id);
    if (action === "resource-delete") return openModal("删除教学资源", fieldsForm(`<p class="full">删除后将从资源库移除该资源。此操作不可撤销。</p>${field("reason", "删除原因", "", "textarea", null, true, 'maxlength="100"')}`), values => { const row = get("resources", id), fileKey = row?.fileKey || ""; const result = commit("resource.delete", { id, reason: values.reason, term: view.term }); if (fileKey) resourceFileRequest("delete", fileKey).catch(() => {}); closeModal(); render(); toast(`已删除教学资源：${result.title}`); });
    if (action === "base-edit") return baseForm(table, id);
    if (action === "base-delete") return openModal(`删除${M.tableNames[table]}`, fieldsForm(`<p class="full">仅可删除没有下游引用的基础档案；已有人员、任课、计划、设备、库存、安排或安全业务时会阻止删除。</p>${field("reason", "删除原因", "", "textarea", null, true, 'maxlength="100"')}`), values => { const result = commit("base.delete", { table, id, reason: values.reason }); closeModal(); render(); toast(`已删除：${result.id}`); }, "确认删除");
    if (action === "teacher-classes") return teacherClassesForm(id);
    if (action === "teacher-class-add") { const teacher = get("staff", el.dataset.teacherId); if (!teacher) throw new Error("任课教师已变更，请重新打开设置。"); if ($$('[data-teacher-class-row]').length >= 30) throw new Error("最多设置30个任课班级。"); $("#teacherClassRows").insertAdjacentHTML("beforeend", teacherClassRow(teacher)); return; }
    if (action === "teacher-class-remove") { if ($$('[data-teacher-class-row]').length === 1) throw new Error("至少保留一条任课班级设置；如需退出请直接关闭窗口。"); el.closest("[data-teacher-class-row]")?.remove(); return; }
    if (action === "innovation-new") return customExperimentForm();
    if (action === "innovation-edit") return customExperimentForm(id);
    if (action === "innovation-delete") return form("删除自定义创新实验", '<p class="full">仅可删除尚未编入实验计划且没有附件的自定义创新实验；删除不会影响设备或库存台账。</p>' + field("reason", "删除原因", "", "textarea", null, true, 'maxlength="100"'), "customExperiment.delete", { id, term: view.term }, "确认删除");
    if (action === "innovation-equipment-add") { if ($$('[data-innovation-row]').length >= 30) throw new Error("最多登记30项器材需求。"); $("#innovationEquipmentRows").insertAdjacentHTML("beforeend", innovationEquipmentRow()); return; }
    if (action === "innovation-equipment-remove") { if ($$('[data-innovation-row]').length === 1) throw new Error("至少保留一项器材需求。"); el.closest('[data-innovation-row]')?.remove(); return; }
    if (action === "tab") { Object.assign(view, { tab: el.dataset.tab, page: 1, state: "", subject: subjectContextEnabled() ? view.subject : "", grade: "", category: "", itemId: "", keyword: "", classId: "", teacherId: "", roomId: "", endDate: "", ...(pageId === "booking" ? {} : { date: "" }) }); selected.clear(); render(); return; }
    if (action === "page-prev" || action === "page-next") { view.page += action === "page-prev" ? -1 : 1; render(); return; }
    if (action === "filter-reset") { Object.assign(view, { keyword: "", state: "", subject: subjectContextEnabled() ? view.subject : "", grade: "", category: "", itemId: "", classId: "", teacherId: "", roomId: "", date: "", endDate: "", year: M.TODAY.slice(0, 4), page: 1 }); selected.clear(); render(); return; }
    if (action === "date" || action === "all-dates") { view.date = el.dataset.date || ""; view.page = 1; selected.clear(); render(); return; }
    if (["week-prev", "week-next", "today"].includes(action)) { view.week = action === "today" ? M.TODAY : addDays(view.week, action === "week-prev" ? -7 : 7); view.date = ""; view.page = 1; render(); return; }
    if (action === "purchase-new" || action === "receipt") return purchaseForm(action === "receipt", id);
    if (action === "item-add") { if ($$("[data-item-row]").length >= 30) throw new Error("最多30条明细。"); $("#itemRows").insertAdjacentHTML("beforeend", itemRow({}, $("#itemRows").dataset.receipt === "true")); updateItemTotals(); return; }
    if (action === "item-remove") { if ($$("[data-item-row]").length === 1) throw new Error("至少保留一条明细。"); el.closest("[data-item-row]").remove(); updateItemTotals(); return; }
    if (action === "equipment-picker-open") { const picker = el.closest("[data-equipment-picker]"), panel = picker?.querySelector("[data-equipment-picker-panel]"); if (!picker || !panel) return; panel.hidden = false; picker.querySelector("[data-equipment-search]")?.focus(); return; }
    if (action === "equipment-picker-done") { const panel = el.closest("[data-equipment-picker]")?.querySelector("[data-equipment-picker-panel]"); if (panel) panel.hidden = true; return; }
    if (action === "booking-resource-picker-open") { const picker = el.closest("[data-resource-picker]"); if (!picker) return; const panel = picker.querySelector("[data-resource-picker-panel]"); if (panel) { panel.hidden = false; picker.querySelector("[data-resource-search]")?.focus(); } return; }
    if (action === "booking-resource-picker-done") { const picker = el.closest("[data-resource-picker]"), panel = picker?.querySelector("[data-resource-picker-panel]"); if (panel) panel.hidden = true; return; }
    if (["booking-resource-add", "booking-resubmit-resource-add"].includes(action)) { const picker = el.closest("[data-resource-picker]"); if (picker) picker.querySelector("[data-resource-picker-panel]")?.removeAttribute("hidden"); return; }
    if (action === "booking-resource-remove") { const row = el.closest("[data-booking-resource-row]"), picker = el.closest("[data-resource-picker]"), key = el.dataset.resourceItemKey; if (row) row.remove(); const option = picker?.querySelector(`[data-resource-option][value="${CSS.escape(key || "")}"]`); if (option) option.checked = false; if (picker) resourcePickerSync(picker); return; }
    if (action === "booking-row-add") { if ($$("[data-booking-row]").length >= 30) throw new Error("最多30条预约。"); const chosen = $$('[data-booking-key="taskId"]').map(node => node.value), task = availableTasks().find(row => !chosen.includes(row.id)); if (!task) throw new Error("可预约的计划实验已全部加入。"); $("#bookingRows").insertAdjacentHTML("beforeend", bookingRow(task)); return; }
    if (action === "booking-row-remove") { if ($$("[data-booking-row]").length === 1) throw new Error("至少保留一条实验安排。"); el.closest("[data-booking-row]").remove(); return; }
    if (action === "booking-new") return bookingForm(table === "teachingTasks" ? id : "");
    if (action === "plan-new") return planForm();
    if (action === "check-new") return checkForm(table === "tasks" ? id : "");
    if (action === "arrangement-edit") return arrangementForm(table === "arrangements" ? get("arrangements", id)?.bookingId : id, el.dataset.arrangementId || (table === "arrangements" ? id : ""));
    if (["asset-report", "teaching-report", "risk-report"].includes(action)) return showReport(action);
    if (action === "cabinet-card") return cabinetCard(id);
    if (action === "report-plans") { const r = dataset().rows.find(row => row.name === el.dataset.name); if (!r) throw new Error("统计行已变更，请刷新后重试。"); return report(`${r.name} · 班级执行明细`, columns.teachingTasks, r.tasks.map(taskId => decorate("teachingTasks", get("teachingTasks", taskId))), "计划实验按适用班级形成应开次数，提交总结后计为实开。"); }
    if (action === "report-download") { if (!downloadResult) throw new Error("请先生成报告。"); return download(downloadResult.content, downloadResult.name, "text/html;charset=utf-8"); }
    if (action === "weekly-report") { const d = new Date(`${M.TODAY}T12:00:00Z`).getUTCDay(), start = addDays(M.TODAY, -(d + 6) % 7), end = addDays(start, 6), rows = records("teachingTasks").filter(task => task.term === view.term && (actor.role !== "teacher" || task.teacherId === actor.id)).filter(task => { const day = suggestedDate(M.taskContext(db, task)); return day >= start && day <= end; }).map(task => decorate("teachingTasks", task)); return report("本周实验教学周报", columns.teachingTasks, rows, `统计日期所在周：${start}至${end}；按计划实验的建议周次或日期展示各班执行情况。`); }
    if (action === "export") return exportList();
    if (action === "file-download") return fileDownload(id);
    if (action === "archive-batch") return batchArchives();
    if (action === "batch") return batchApproval();
    if (action === "import") return importForm();
    if (action === "template-download") return download(M.csv([M.importHeader, ["202020002", "力学轨道小车", "J2101", "物理仪器", "台", "单件设备", "是", 2, 680, "A202", "P01", "2027-02-28", ""]]), "设备耗材入库模板.csv", "text/csv;charset=utf-8");
    if (action === "import-example") { $("#f-source").value = M.csv([M.importHeader, ["202020002", "力学轨道小车", "J2101", "物理仪器", "台", "单件设备", "是", 2, 680, "A202", "P01", "2027-02-28", ""]]); importResult = null; $("#importPreview").textContent = "内容已填入，请校验预览。"; return; }
    if (action === "import-preview") { importResult = null; const source = $("#f-source").value, result = M.validateImport(source, db, actor.school), rows = result.items.map(row => ({ ...row, trackingText: row.trackingMode === "SERIALIZED" ? "单件设备" : "数量库存", maintenanceText: row.maintenanceRequired ? "是" : "否", room: row.roomId ? `${get("rooms", row.roomId)?.roomNo || ""}${row.cabinetId ? ` / ${get("cabinets", row.cabinetId)?.code || ""}` : ""}` : "待分配", nextMaintenance: row.nextMaintenance || "不适用", expiry: row.expiry || "不适用" })); $("#importPreview").innerHTML = result.errors.length ? `<p class="form-error">${result.errors.map(h).join("<br>")}</p>` : `<p class="success-copy">校验通过：${result.items.length}条明细，共${result.items.reduce((n, item) => n + item.qty, 0)}件。存放位置留空时进入待存放或待分配。</p>${miniTable(col("classificationCode:分类编号|name:物品名称|spec:规格型号|category:分类|unit:单位|trackingText:管理方式|maintenanceText:需要周期维保|qty:数量|price:单价（元）|room:存放位置（房间／橱柜）|nextMaintenance:下次维保日期|expiry:有效期"), rows)}`; if (!result.errors.length) importResult = { source }; return; }
    if (action === "attachment") return attachmentForm(table, id);
    if (action === "attachment-example") { const [t, key] = $("#f-related").value.split("|"), r = get(t, key); pendingFile = null; $("#attachmentFile").value = ""; $("#f-name").value = `${M.tableNames[t]}-${key}-业务说明.txt`; $("#f-content").value = `业务说明材料\n关联业务：${M.tableNames[t]} ${key}\n学校：${name("schools", r.school)}\n统计日期：${M.TODAY}\n当前状态：${r.state || r.result || "已登记"}\n说明：${t === "hazards" ? "已完成锁具更换及现场检查，申请复查。" : r.title || r.name || "用于记录资料关联与业务处理。"}\n请根据当前业务补充说明。`; $("#fileStatus").textContent = "已生成TXT内容；可修改后保存。"; return; }
    if (action === "ask-example") { $("#askForm [name=question]").value = el.dataset.question; return ask(el.dataset.question); }
    if (action === "submission") return form("上报本学期台账快照", `<p class="full">保存${h(name("schools", actor.school))}在${h(name("terms", view.term))}的当前指标快照（版本${db.revision}）。区级“学校与上报”可查看，后续修改不覆盖本次快照。</p>`, "submission.create", { term: view.term }, "确认上报");
    if (action === "demo-control") return demoControl();
    if (action === "district-login") return enterDistrict();
    if (action === "backup") { const raw = localStorage.getItem(M.KEY); const blob = new Blob([raw || JSON.stringify(db)], { type: "application/json" }); return download(blob, `实验管理备份-v${db.revision}.json`); }
    return operation(action, id, table, kind);
  }
  function showError(error) { const box = $("#formError"); if ($("#modalBackdrop.open") && box) { box.textContent = error.message || String(error); box.scrollIntoView?.({ block: "nearest" }); } else toast(error.message || String(error)); }
  document.addEventListener("click", event => { const choice = event.target.closest("[data-equipment-choice]") || event.target.closest("[data-equipment-option-row]")?.querySelector("[data-equipment-choice]"); if (choice?.checked) syncEquipmentChoice(choice); const el = event.target.closest("[data-action]"); if (el && !el.disabled) { try { const result = handleAction(el); result?.catch?.(showError); } catch (e) { showError(e); } } if (event.target.id === "modalBackdrop") closeModal(); });
  document.addEventListener("submit", event => {
    const formEl = event.target; if (!["modalForm", "filterForm", "settingsForm", "loginForm", "scanForm", "askForm"].includes(formEl.id)) return; event.preventDefault();
    try {
      if (!formEl.reportValidity()) return; const v = valuesOf(formEl);
      if (formEl.id === "modalForm") { $("#formError").textContent = ""; modalSubmit?.(v); }
      if (formEl.id === "filterForm") { Object.assign(view, v, { page: 1 }); selected.clear(); render(); }
      if (formEl.id === "settingsForm") { commit("settings.save", v, db.revision); render(); toast("设置已保存，提醒与导出权限已更新。"); }
      if (formEl.id === "loginForm") enterSchool(v.school, v.personId);
      if (formEl.id === "scanForm") { const asset = records("assets").find(a => a.code.toLowerCase() === v.code.trim().toLowerCase() || a.id.toLowerCase() === v.code.trim().toLowerCase()); if (!asset) throw new Error("当前学校范围未找到该编号，请核对资产编号或学校筛选。"); detail("assets", asset.id); }
      if (formEl.id === "askForm") ask(v.question);
    } catch (e) { showError(e); }
  });
  document.addEventListener("change", async event => {
    const el = event.target;
    try {
      if (el.dataset.context) {
        if (el.dataset.context === "subject") {
          const next = String(el.value || "ALL");
          if (!subjectAllowed(next)) throw new Error("当前账号没有该学科的任课或管理范围。");
          view.subject = next;
          savePref(subjectPrefKey, view.subject);
        } else {
          view[el.dataset.context] = el.value;
          if (el.dataset.context === "term") { activeTerm = view.term; savePref("lab-demo-term", view.term); if (actor.role === "teacher" && !subjectAllowed(view.subject)) view.subject = defaultSubject(); }
        }
        view.page = 1; selected.clear(); render();
      }
      if (el.closest("#filterForm") && el.name === "grade") {
        const nextGrade = String(el.value || "");
        if (view.grade !== nextGrade) view.classId = "";
        view.grade = nextGrade;
        view.page = 1;
        selected.clear();
        render();
        return;
      }
      if (el.dataset.select) { el.checked ? selected.add(el.dataset.select) : selected.delete(el.dataset.select); const footer = $(".table-footer > span"); if (footer) footer.textContent = `筛选结果 ${dataset().rows.length} 条 · 已选 ${selected.size} 条 · 每页8条`; }
      if (el.id === "selectAll") { $$("[data-select]").forEach(box => { box.checked = el.checked; box.checked ? selected.add(box.dataset.select) : selected.delete(box.dataset.select); }); render(); }
      if (el.hasAttribute("data-identity-school")) $("#f-personId").innerHTML = opts("staff", db.staff.filter(t => t.enabled && t.school === el.value), t => `${t.name} · ${M.roles[t.role]} · ${subjectLabel(t.subject)}`).map(([id, label]) => `<option value="${h(id)}">${h(label)}</option>`).join("");
      if (el.hasAttribute("data-base-school")) { const selectedSchool = el.value, people = db.staff.filter(person => person.enabled && person.school === selectedSchool); if ($("#f-departmentId")) setOptions($("#f-departmentId"), [["", "未登记"], ...opts("departments", db.departments.filter(department => department.school === selectedSchool && department.state === "启用"))]); if ($("#f-classId")) setOptions($("#f-classId"), opts("classes", db.classes.filter(klass => klass.school === selectedSchool && klass.state === "在读"))); if ($("#f-teacherId")) updateAssignmentTeachers(); if ($("#f-roomId")) setOptions($("#f-roomId"), opts("rooms", db.rooms.filter(room => room.school === selectedSchool), room => `${room.roomNo} · ${room.name}`)); if ($("#f-staffId")) setOptions($("#f-staffId"), opts("staff", people)); }
      if (el.hasAttribute("data-room-type")) updateRoomFields();
      if (el.hasAttribute("data-storage-room")) { const cabinet = $("[data-storage-cabinet]"); if (cabinet) { const item = M.itemOf(db, get(el.dataset.storageKind || "inventory", el.dataset.storageItem)); setOptions(cabinet, [["", "直接存放于房间"], ...own("cabinets").filter(row => row.state === "启用" && row.roomId === el.value && (!M.cabinetFitsItem || M.cabinetFitsItem(db, row, item))).map(row => [row.id, `${row.code} · ${row.name}`])]); } }
      if (el.hasAttribute("data-assignment-subject")) updateAssignmentTeachers();
      if (el.hasAttribute("data-check-result")) { $("#hazardFields").hidden = el.value !== "发现隐患"; $("#hazardFields").disabled = el.value !== "发现隐患"; }
      if (el.hasAttribute("data-plan-filter") || el.hasAttribute("data-plan-catalog-select")) { refreshPlanCatalog(); if (el.hasAttribute("data-plan-filter")) refreshPlanClasses(); }
      if (el.hasAttribute("data-plan-schedule-type")) { const row = el.closest("[data-plan-catalog-row]"), week = $("[data-plan-week]", row), date = $("[data-plan-date]", row); if (week && date) { week.disabled = el.value === "DATE"; date.disabled = el.value !== "DATE"; } }
      if (el.hasAttribute("data-calendar-week")) { view.week = M.weekDate(get("terms", view.term), el.value); view.date = ""; view.page = 1; selected.clear(); render(); }
      if (el.hasAttribute("data-booking-task")) { const row = el.closest("[data-booking-row]"), task = get("teachingTasks", el.value); if (!task) throw new Error("计划实验已变更，请重新打开预约。"); row.outerHTML = bookingRow(task); }
      if (el.hasAttribute("data-item-rule") || el.dataset.item === "maintenanceRequired") { const row = el.closest("[data-item-row]"); if (row) { const item = { category: $('[data-item="category"]', row)?.value, trackingMode: $('[data-item="trackingMode"]', row)?.value, maintenanceRequired: $('[data-item="maintenanceRequired"]', row)?.checked }; updateItemStorageRooms(row, item); } }
      if (el.hasAttribute("data-inventory-item")) updateInventoryStorageRooms();
      if (el.hasAttribute("data-flow-rule")) updateFlowFields();
      if (el.hasAttribute("data-equipment-choice")) syncEquipmentChoice(el);
      if (el.hasAttribute("data-equipment-filter-category") || el.hasAttribute("data-equipment-filter-room")) filterEquipmentPicker(el.closest("[data-equipment-picker]"));
      if (el.hasAttribute("data-equipment-list-category") || el.hasAttribute("data-equipment-list-room")) filterEquipmentList(el.closest("[data-equipment-list]"));
      if (el.name === "assetIds") updateEquipmentListSummary(el.closest("[data-equipment-list]"));
      if (el.hasAttribute("data-loss-item-qty")) updateLossRow(el);
      if (el.hasAttribute("data-resource-option")) resourcePickerSync(el.closest("[data-resource-picker]"));
      if (el.hasAttribute("data-resource-filter-category")) filterResourcePicker(el.closest("[data-resource-picker]"));
      if (el.hasAttribute("data-arrange-category")) filterArrangementResources(el.closest("details"));
      if (el.name === "venueType") updateArrangementVenue();
      if ($("#flowItemInfo") && el.name === "qty") updateFlowInfo();
      if (el.id === "importFile" && el.files[0]) { if (el.files[0].size > 200000) throw new Error("CSV文件过大，请控制在200KB内。"); $("#f-source").value = await el.files[0].text(); importResult = null; $("#importPreview").textContent = "文件已读取，请校验预览。"; }
      if (el.id === "resourceFile" && el.files[0]) { const f = el.files[0], allowed = /\.(pdf|docx?|pptx?|xlsx?|png|jpe?g|txt|csv|mp4|webm)$/i; if (!allowed.test(f.name)) throw new Error("请选择PDF、Office、图片、文本或视频文件。"); if (f.size > 100 * 1024 * 1024) throw new Error("资源文件不能超过100MB。"); const fileKey = `RESFILE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; await resourceFileRequest("put", fileKey, f); pendingResourceFile = { fileKey, originalName: f.name, mime: f.type || "application/octet-stream", size: f.size, extension: f.name.split(".").pop().toLowerCase() }; $("#resourceFileStatus").textContent = `已读取 ${f.name}（${Math.ceil(f.size / 1024)} KB），保存后直接进入资源库。`; }
      if (el.id === "attachmentFile" && el.files[0]) { pendingFile = null; const f = el.files[0]; if (f.size > 524288) throw new Error("单个附件不能超过512KB。"); if (!/\.(pdf|png|jpe?g|txt|csv|docx|xlsx)$/i.test(f.name)) throw new Error("请选择支持的文档、表格、图片或文本文件。"); const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error("文件读取失败。")); reader.readAsDataURL(f); }); pendingFile = { name: f.name, dataUrl: dataUrl.replace(/^data:;/, "data:application/octet-stream;"), mime: f.type || "application/octet-stream", content: "" }; $("#f-name").value = f.name; $("#f-content").value = ""; $("#fileStatus").textContent = `已读取 ${f.name}（${Math.ceil(f.size / 1024)}KB），保存后可下载原始文件。`; }
      if (el.hasAttribute("data-summary-images")) { const type = el.dataset.summaryImages, max = type === "OVERVIEW" ? 2 : 3, files = [...el.files]; if (files.length > max) throw new Error(`${type === "OVERVIEW" ? "实验全景图" : "学生实验图"}最多${max}张。`); files.forEach(file => { if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) throw new Error("总结图片仅支持PNG、JPEG或WebP。"); if (file.size > 200000) throw new Error("单张总结图片不能超过200KB。"); }); pendingSummaryImages[type] = await Promise.all(files.map(file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, mime: file.type, dataUrl: reader.result }); reader.onerror = () => reject(new Error("图片读取失败。")); reader.readAsDataURL(file); }))); const statusEl = $(`[data-summary-status="${type}"]`); if (statusEl) statusEl.textContent = files.length ? `已选择${files.length}张` : "未选择"; }
    } catch (e) { showError(e); }
  });
  document.addEventListener("input", event => { const el = event.target; if (el.hasAttribute("data-item")) updateItemTotals(); if ($("#flowItemInfo") && el.name === "qty") updateFlowInfo(); if (el.hasAttribute("data-ledger-item-search")) { const option = [...document.querySelectorAll("#ledgerItemOptions option")].find(item => item.value === el.value), hidden = el.closest(".field")?.querySelector('[name="itemId"]'); if (hidden) hidden.value = option?.dataset.itemId || ""; } if (el.hasAttribute("data-equipment-search")) filterEquipmentPicker(el.closest("[data-equipment-picker]")); if (el.hasAttribute("data-equipment-list-search")) filterEquipmentList(el.closest("[data-equipment-list]")); if (el.hasAttribute("data-loss-item-qty")) { updateLossRow(el); updateEquipmentListSummary(el.closest("[data-equipment-list]")); } if (el.hasAttribute("data-resource-search")) filterResourcePicker(el.closest("[data-resource-picker]")); if (el.hasAttribute("data-arrange-search")) filterArrangementResources(el.closest("details")); });
  document.addEventListener("keydown", event => {
    if (!$("#modalBackdrop.open")) return;
    if (event.key === "Escape") closeModal();
    if (event.key === "Tab") { const elements = $$("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], summary", $("#modalBackdrop")).filter(el => el.getClientRects().length); const first = elements[0], last = elements.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
  });
  window.addEventListener("storage", event => { if (event.key !== M.KEY) return; try { const fresh = M.migrate(JSON.parse(event.newValue)); if (fresh.version !== M.VERSION) throw new Error(); db = fresh; if (!$("#modalBackdrop.open")) render(); else toast("其他页面已更新台账，请关闭当前对话框后重新操作。"); } catch { persistenceError = "本地数据被移除或格式异常，请在系统控制中恢复数据。"; render(); } });
  if (typeof MutationObserver !== "undefined") {
    const brandingObserver = new MutationObserver(applyOfficialBranding);
    brandingObserver.observe(app, { childList: true, subtree: true });
  }
  render();
  applyOfficialBranding();
})();
