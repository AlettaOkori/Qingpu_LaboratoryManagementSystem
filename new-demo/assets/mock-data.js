(function (root) {
  "use strict";
  const KEY = "lab-demo-business-v2", VERSION = 9, TODAY = "2026-08-31";
  const roles = { district: "区级管理员", admin: "学校管理员", teacher: "任课教师" };
  const categories = ["物理仪器", "化学仪器", "生物仪器", "科学仪器", "耗材", "危化品"], subjects = ["物理", "化学", "生物", "科学"], defaultPeriods = [[1, "08:00", "08:45"], [2, "08:55", "09:40"], [3, "10:00", "10:45"], [4, "10:55", "11:40"], [5, "13:30", "14:15"], [6, "14:25", "15:10"], [7, "15:25", "16:10"], [8, "16:20", "17:05"]];
  const group = (label, entries) => ({ label, items: entries.map(([id, label, mark]) => ({ id, label, mark, href: `${id}.html` })) });
  const navigation = {
    district: [group("决策工作区", [["dashboard", "区域总览", "总"], ["ai-query", "智能问数", "问"]]), group("组织与资产", [["schools", "学校管理", "校"], ["teachers", "师资管理", "师"], ["equipment", "设备资产监管", "资"]]), group("运行管理", [["consumables", "耗材危化品", "耗"], ["maintenance", "采购与设备审批", "审"], ["schedule", "教学监管", "教"]]), group("安全与系统", [["safety", "安全管理", "安"], ["settings", "基础数据与设置", "设"]])],
    school: [group("今日工作", [["dashboard", "学校工作台", "工"], ["ai-query", "智能问数", "问"]]), group("基础档案", [["labs", "实验室", "室"], ["staff", "人员管理", "人"]]), group("日常运行", [["devices", "设备与采购", "备"], ["supplies", "耗材管理", "耗"], ["repair", "维修报废", "修"]]), group("教学与安全", [["experiments", "实验教学", "课"], ["booking", "预约与安排", "约"], ["safety", "安全管理", "安"], ["archives", "资料归档", "档"]])]
  };
  const tableNames = { schools: "学校", departments: "部门", staff: "人员", rooms: "实验室", classes: "班级", assignments: "任课班级", terms: "学期", periods: "节次", assets: "设备资产", purchases: "采购申请", receipts: "入库单", repairs: "设备处理单", inventory: "耗材库存", flows: "库存流水", plans: "实验计划", planItems: "计划明细", teachingTasks: "班级实验任务", bookings: "实验预约", arrangements: "实验安排", summaries: "实验总结", checks: "检查记录", hazards: "隐患整改", tasks: "检查任务", archives: "归档资料", submissions: "数据上报", logs: "操作日志" };
  const clone = value => JSON.parse(JSON.stringify(value));
  const must = (ok, message) => { if (!ok) throw new Error(message); };
  const text = (value, label = "内容", max = 2000) => { const s = String(value ?? "").trim(); must(s.length && s.length <= max, `请填写${label}（不超过${max}字）。`); return s; };
  const optional = (value, label, max = 200) => { const s = String(value ?? "").trim(); must(s.length <= max, `${label}不能超过${max}字。`); return s; };
  const num = (value, label, min = 0, integer = false) => { const n = Number(value); must(value !== "" && value != null && Number.isFinite(n) && n >= min && (!integer || Number.isInteger(n)), `${label}须为不小于${min}的${integer ? "整数" : "数值"}。`); return n; };
  const optionalNum = (value, label, min = 0, integer = false) => value === "" || value == null ? null : num(value, label, min, integer);
  const date = value => { const s = String(value || ""); must(/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s, "请选择有效日期。"); return s; };
  const choice = (value, options, label) => { must(options.includes(value), `${label}不在可选范围内。`); return value; };
  const find = (db, table, id) => { const row = db[table]?.find(r => r.id === id); must(row, "关联记录不存在，请刷新后重新选择。"); return row; };
  const scoped = (db, table, school = "") => (db[table] || []).filter(r => !school || r.school === school || table === "schools" && r.id === school);
  const ratio = (done, total) => total ? `${(done / total * 100).toFixed(1)}%` : "不适用";
  function weekOf(term, day) { const start = new Date(`${term.start}T00:00:00Z`); return Math.floor(((Date.parse(day) - start.getTime()) / 86400000 + (start.getUTCDay() + 6) % 7) / 7) + 1; }
  function weekDate(term, week) { const start = new Date(`${term.start}T00:00:00Z`); start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7 + (Number(week) - 1) * 7); return [term.start, start.toISOString().slice(0, 10)].sort().at(-1); }
  const activeBooking = r => ["待安排", "已安排", "已退回"].includes(r.state), activeArrangement = r => r.state === "已安排";
  const itemOf = (db, record) => record || null;
  function itemById(db, itemId) {
    if (!itemId) return null;
    const rows = [
      ...(db.assets || []),
      ...(db.inventory || []),
      ...(db.purchases || []).flatMap(row => row.items || []),
      ...(db.receipts || []).flatMap(row => row.items || []),
      ...(db.flows || []).map(row => row.snapshot).filter(Boolean),
      ...(db.bookings || []).flatMap(row => row.requestedResources || []),
      ...(db.itemCatalog || [])
    ];
    return rows.find(row => row && (row.id === itemId || row.itemId === itemId || row.classificationCode === itemId)) || null;
  }
  function itemRecord(db, raw = {}) {
    const source = itemById(db, raw.itemId || raw.classificationCode) || {};
    const category = raw.category || source.category || (raw.trackingMode === "QUANTITY" ? "耗材" : "物理仪器");
    const trackingMode = raw.trackingMode || source.trackingMode || (["耗材", "危化品"].includes(category) ? "QUANTITY" : "SERIALIZED");
    return {
      itemId: raw.itemId || source.itemId || raw.classificationCode || source.classificationCode || "",
      classificationCode: raw.classificationCode || source.classificationCode || "",
      name: raw.name || source.name || "",
      spec: raw.spec || raw.model || source.spec || source.model || "",
      category,
      unit: raw.unit || source.unit || "件",
      trackingMode,
      maintenanceRequired: raw.maintenanceRequired ?? source.maintenanceRequired ?? trackingMode === "SERIALIZED"
    };
  }
  function assetCode(db, asset, serial) {
    const school = db.schools.find(row => row.id === asset.school), item = itemOf(db, asset);
    return `${school?.code || asset.school}-${item?.classificationCode || asset.classificationCode || "待补录"}-${String(serial).padStart(3, "0")}`;
  }
  function nextAssetSerial(db, schoolId) {
    return Math.max(0, ...(db.assets || []).filter(asset => asset.school === schoolId).map(asset => Number(asset.assetSerial)).filter(Number.isInteger)) + 1;
  }
  function normalizeAssetCodes(db) {
    const serials = new Map();
    (db.assets || []).forEach(asset => {
      const previous = serials.get(asset.school) || 0, stored = Number(asset.assetSerial), serial = Number.isInteger(stored) && stored > previous ? stored : previous + 1;
      asset.assetSerial = serial;
      asset.code = assetCode(db, asset, serial);
      serials.set(asset.school, serial);
    });
  }
  function experimentOf(db, item) {
    const plan = item?.planId ? db.plans?.find(row => row.id === item.planId) : null, legacy = item?.catalogId ? db.catalog?.find(row => row.id === item.catalogId) : null;
    return { ...(legacy || {}), ...(item || {}), id: item?.experimentId || item?.catalogId || item?.id, name: item?.experimentName || legacy?.name || item?.name || "未填写实验名称", subject: item?.subject || plan?.subject || legacy?.subject || "", grade: item?.grade || plan?.grade || legacy?.grade || "", version: item?.version || plan?.version || legacy?.version || "", required: item?.required || legacy?.required || "必做", mode: item?.mode || legacy?.mode || "分组", chapter: item?.chapter || legacy?.chapter || "", equipment: item?.equipment || legacy?.equipment || "", periods: Number(item?.periods || legacy?.periods || 1) };
  }
  function experimentKey(db, item) { const plan = db.plans?.find(row => row.id === item?.planId), experiment = experimentOf(db, item); return [plan?.school || item?.school || "", plan?.subject || experiment.subject, plan?.grade || experiment.grade, plan?.version || experiment.version, experiment.name, experiment.chapter, experiment.mode].map(value => String(value || "").trim()).join("|"); }
  const isHazard = item => item?.category === "危化品";
  const itemFitsSubject = (item, subject) => { const category = String(item?.category || ""); return !!item && (!category.endsWith("仪器") || category === `${subject}仪器`) && (!isHazard(item) || subject === "化学"); };
  const roomFitsItem = (room, item) => { const category = String(item?.category || ""); return !!room && (!isHazard(item) || room.hazardStorage === true) && (!room.subject || !category.endsWith("仪器") || category === `${room.subject}仪器`); };
  const expiredHazard = (db, stock) => isHazard(itemOf(db, stock)) && !!stock.expiry && stock.expiry < TODAY;
  const roomLabel = (db, roomId) => roomId ? find(db, "rooms", roomId).roomNo : "待分配";
  const periodFor = (db, school, number, term) => db.periods.find(p => p.school === school && p.term === term && p.number === Number(number));
  function taskContext(db, taskOrId) { const task = typeof taskOrId === "string" ? find(db, "teachingTasks", taskOrId) : taskOrId, item = find(db, "planItems", task.planItemId), plan = find(db, "plans", item.planId), experiment = experimentOf(db, item), assignment = find(db, "assignments", task.assignmentId), klass = find(db, "classes", task.classId), teacher = find(db, "staff", task.teacherId); return { task, item, plan, experiment, assignment, klass, teacher }; }
  function syncTeachingTasks(db, itemId = "") {
    db.planItems.filter(item => !itemId || item.id === itemId).forEach(item => { const plan = find(db, "plans", item.planId); if (plan.state !== "已发布") return; const experiment = experimentOf(db, item); db.assignments.filter(a => a.school === plan.school && a.term === plan.term && a.subject === plan.subject && a.state === "有效" && a.primary).forEach(a => { const klass = find(db, "classes", a.classId), existing = db.teachingTasks.find(t => t.planItemId === item.id && t.assignmentId === a.id), suppressionKey = `${item.id}|${a.id}`; if ((db.deletedTaskKeys || []).includes(suppressionKey)) return; if (klass.state !== "在读" || klass.grade !== experiment.grade) return; const completedEquivalent = db.teachingTasks.some(task => { if (task.school !== plan.school || task.term !== plan.term || task.classId !== klass.id || task.state !== "已完成") return false; const historicalItem = db.planItems.find(row => row.id === task.planItemId); return experimentKey(db, historicalItem) === experimentKey(db, item); }); if (completedEquivalent) return; if (existing) { if (existing.state === "已失效") existing.state = "待预约"; return; } db.teachingTasks.push({ id: `TASK-${++db.seq}`, school: plan.school, term: plan.term, planItemId: item.id, assignmentId: a.id, classId: klass.id, teacherId: a.teacherId, state: "待预约" }); }); });
  }
  function seed() {
    const db = { version: VERSION, revision: 0, seq: 200, deletedTaskKeys: [], updatedAt: "2026-08-31T08:00:00+08:00", settings: { region: "上海市青浦区", authority: "青浦区教育局", repairDays: 7, lowStock: true, weeklyReport: true, syncReminder: true, exportEnabled: true } };
    Object.keys(tableNames).forEach(table => { db[table] = []; });
    db.schools = [{ id: "S1", code: "QP001", name: "青浦高级中学", stage: "高中" }, { id: "S2", code: "QP002", name: "青浦区第一中学", stage: "高中" }, { id: "S3", code: "QP003", name: "东湖中学", stage: "高中" }];
    db.terms = [{ id: "TERM26", name: "2026-2027学年第一学期", start: TODAY, end: "2027-01-29" }, { id: "TERM25", name: "2025-2026学年第二学期", start: "2026-03-02", end: "2026-07-03" }];
    const experimentRows = [["E1", "WL-01", "测量物体的速度", "物理", "必做", "分组", "第一章 运动的描述", "轨道小车、计时器、刻度尺"], ["E2", "HX-01", "配制一定物质的量浓度的溶液", "化学", "必做", "分组", "第一章 物质及其变化", "电子天平、容量瓶、烧杯"], ["E3", "SW-01", "使用显微镜观察细胞", "生物", "必做", "分组", "第一章 走近细胞", "显微镜、载玻片、盖玻片"], ["E4", "WL-02", "探究加速度与力、质量的关系", "物理", "必做", "演示", "第四章 运动和力的关系", "轨道小车、砝码"], ["E5", "SW-02", "校园植物细胞观察拓展", "生物", "选做", "分组", "显微观察拓展", "显微镜、载玻片、盖玻片"]].map(([id, code, name, subject, required, mode, chapter, equipment]) => ({ id, code, name, subject, required, mode, chapter, equipment, grade: "高一", version: id === "E5" ? "校本拓展2026版" : "人教版·必修第一册", periods: id === "E4" ? 2 : 1 }));
    const itemRows = [["IT1", "202040001", "光学显微镜", "XSP-16A", "生物仪器", "台", "SERIALIZED", true], ["IT2", "202030001", "精密电子天平", "FA2204N", "化学仪器", "台", "SERIALIZED", true], ["IT3", "202020001", "学生电源", "J1202", "物理仪器", "台", "SERIALIZED", true], ["IT4", "202020002", "力学轨道小车", "J2101", "物理仪器", "台", "SERIALIZED", true], ["IT5", "202040002", "解剖显微镜", "XTZ-E", "生物仪器", "台", "SERIALIZED", true], ["IT6", "202030002", "蒸馏装置", "SZ-08", "化学仪器", "套", "SERIALIZED", true], ["IT7", "301010001", "载玻片", "7101型", "耗材", "盒", "QUANTITY", false], ["IT8", "301010002", "定性滤纸", "中速9cm", "耗材", "盒", "QUANTITY", false], ["IT9", "401010001", "无水乙醇", "分析纯500mL", "危化品", "瓶", "QUANTITY", false], ["IT10", "401010002", "浓硫酸", "500mL", "危化品", "瓶", "QUANTITY", false]].map(([id, classificationCode, name, spec, category, unit, trackingMode, maintenanceRequired]) => ({ id, classificationCode, name, spec, category, unit, trackingMode, maintenanceRequired }));
    const seedItem = id => itemRows.find(item => item.id === id) || {};
    const names = [["顾文清", "张明华", "王秀英", "李秀英", "陈小红"], ["吴静", "周明", "沈澜", "陆青", "许晓"], ["赵宁", "李建国", "林芳", "周敏", "陈洁"]], assetRows = [["IT1", 3580, 3], ["IT2", 2860, 2], ["IT3", 450, 1], ["IT4", 680, 1], ["IT5", 4200, 3], ["IT6", 680, 2]];
    db.schools.forEach((school, index) => {
      ["教务处", "物理教研组", "实验中心"].forEach((name, n) => db.departments.push({ id: `${school.id}-D${n + 1}`, school: school.id, name, state: "启用" }));
      db.terms.forEach(term => defaultPeriods.forEach(([number, start, end]) => db.periods.push({ id: term.id === "TERM26" ? `${school.id}-K${number}` : `${school.id}-${term.id}-K${number}`, school: school.id, term: term.id, number, name: `第${number}节`, start, end, state: "启用" })));
      ["admin", "teacher", "teacher", "teacher", "admin"].forEach((role, n) => db.staff.push({ id: `${school.id}-T${n}`, school: school.id, name: names[index][n], role, subject: ["综合", "物理", "化学", "生物", "综合"][n], departmentId: `${school.id}-D${n === 0 ? 1 : n === 4 ? 3 : 2}`, title: n === 4 ? "实验管理员" : "一级教师", phone: `138****${1100 + index * 10 + n}`, enabled: true, qualification: n === 4 ? "实验室管理资质" : "教师资格证", sex: n % 2 ? "男" : "女" }));
      [["L1", "物理实验室 1", "A201", "教学实验室", "物理", 96, 48], ["L2", "化学实验室 1", "B201", "教学实验室", "化学", 96, 48], ["L3", "生物实验室 1", "C201", "教学实验室", "生物", 96, 48], ["R4", "物理仪器室", "A202", "仪器室", "物理", 48, null]].forEach(([suffix, name, roomNo, type, subject, area, seats]) => { db.rooms.push({ id: `${school.id}-${suffix}`, school: school.id, name, roomNo, type, subject, area, seats, builtAt: "2023-08-20", builder: "", stage: school.stage, features: subject === "化学" ? "通风设施、洗眼器、灭火器" : "电源保护、灭火器", hazardStorage: subject === "化学", note: "", state: "可用" }); });
      [1, 2].forEach(n => db.classes.push({ id: `${school.id}-C${n}`, school: school.id, name: `高一${n}班`, grade: "高一", students: 40 + n, state: "在读" }));
      db.classes.filter(c => c.school === school.id).forEach((klass, classIndex) => [["物理", 1], ["化学", 2], ["生物", 3]].forEach(([subject, teacherNo], subjectIndex) => db.assignments.push({ id: `${school.id}-AS${classIndex * 3 + subjectIndex + 1}`, school: school.id, term: "TERM26", classId: klass.id, subject, teacherId: `${school.id}-T${teacherNo}`, primary: true, state: "有效" })));
      assetRows.forEach(([itemId, price, roomNo], n) => { const item = seedItem(itemId), asset = { ...item, id: `${school.id}-A${n + 1}`, school: school.id, itemId, assetSerial: n + 1, price, purchaseDate: n === 5 ? "2015-06-15" : "2024-03-15", roomId: `${school.id}-L${roomNo}`, supplier: "华东教学仪器有限公司", state: "正常使用", sourceId: `${school.id}-RK0`, nextMaintenance: "2026-09-15" }; asset.code = assetCode(db, asset, asset.assetSerial); db.assets.push(asset); });
      db.receipts.push({ id: `${school.id}-RK0`, school: school.id, date: "2024-03-15", purchaseDate: "2024-03-15", supplier: "华东教学仪器有限公司", operator: names[index][0], items: assetRows.map(([itemId, price, roomNo]) => { const item = seedItem(itemId); return { ...item, itemId, model: item.spec, qty: 1, price, roomId: `${school.id}-L${roomNo}`, nextMaintenance: "2026-09-15" }; }), state: "已入库", note: "历史资产入账。" });
      [["IT7", 40, 20, 3], ["IT8", 8, 15, 2], ["IT9", 12, 5, 2], ["IT10", 2, 4, 2]].forEach(([itemId, stock, min, roomNo], n) => db.inventory.push({ ...seedItem(itemId), id: `${school.id}-I${n + 1}`, school: school.id, itemId, stock, min, expiry: "2027-06-30", roomId: `${school.id}-L${roomNo}`, state: "在库" }));
      [[`${school.id}-P1`, "物理实验计划", "物理", [["E1", "WEEK", 1, "", "分组"], ["E4", "DATE", null, "2026-09-07", "演示"]]], [`${school.id}-P2`, "化学实验计划", "化学", [["E2", "WEEK", 1, "", "分组"]]], [`${school.id}-P3`, "生物实验计划", "生物", [["E3", "WEEK", 1, "", "分组"], ["E5", "WEEK", 2, "", "分组"]]]].forEach(([planId, name, subject, items]) => { const plannedExperiments = items.map(([experimentId, scheduleType, plannedWeek, plannedDate, mode]) => ({ experiment: experimentRows.find(row => row.id === experimentId), scheduleType, plannedWeek, plannedDate, mode })), first = plannedExperiments[0]?.experiment || {}; db.plans.push({ id: planId, school: school.id, term: "TERM26", subject, grade: first.grade || "高一", version: first.version || "", name, state: "已发布", createdBy: `${school.id}-T0`, createdAt: db.updatedAt, publishedAt: db.updatedAt }); plannedExperiments.forEach(({ experiment, scheduleType, plannedWeek, plannedDate, mode }) => db.planItems.push({ id: `${planId}-I${db.planItems.filter(item => item.planId === planId).length + 1}`, school: school.id, planId, experimentName: experiment.name, chapter: experiment.chapter, equipment: experiment.equipment, periods: experiment.periods, required: experiment.required, mode, scheduleType, plannedWeek, plannedDate })); });
      syncTeachingTasks(db);
      const task = db.teachingTasks.find(t => t.school === school.id && t.planItemId === `${school.id}-P1-I1` && t.classId === `${school.id}-C1`), bookingItem = seedItem("IT4"), booking = { id: `${school.id}-YY1`, school: school.id, taskId: task.id, planItemId: task.planItemId, assignmentId: task.assignmentId, classId: task.classId, teacherId: task.teacherId, studentCount: find(db, "classes", task.classId).students, applicant: names[index][1], applicantId: `${school.id}-T1`, submittedAt: db.updatedAt, requestedDate: TODAY, requestedPeriod: 1, groups: 8, requestedResources: [{ itemId: bookingItem.id, classificationCode: bookingItem.classificationCode, name: bookingItem.name, spec: bookingItem.spec, category: bookingItem.category, unit: bookingItem.unit, qty: 1 }], note: "", state: index === 0 ? "已安排" : "待安排" }; db.bookings.push(booking);
      if (index === 0) { db.arrangements.push({ id: `${school.id}-AP1`, school: school.id, bookingId: booking.id, venueType: "实验室", roomId: `${school.id}-L1`, venueText: "", scheduledDate: TODAY, startPeriod: 1, endPeriod: 1, technicianId: `${school.id}-T4`, note: "", resources: [{ ref: `${school.id}-A4`, qty: 1 }], state: "已安排", arrangedBy: `${school.id}-T0`, arrangedAt: db.updatedAt }); task.state = "已安排"; } else task.state = "待安排";
      db.tasks.push({ id: `${school.id}-JC1`, school: school.id, roomId: `${school.id}-L2`, kind: "开学专项检查", due: "2026-09-02", state: "待检查", owner: names[index][4] });
    });
    db.assets.find(a => a.id === "S1-A3").state = "维修中";
    db.repairs.push({ id: "WX-20260824-001", school: "S1", assetId: "S1-A3", kind: "维修", state: "处理中", reason: "输出电压不稳定", reporter: "张明华", date: "2026-08-24", due: TODAY, priorState: "正常使用", vendor: "华东校园设备服务有限公司", cost: 0 });
    db.purchases.push({ id: "CG-20260831-001", school: "S1", purpose: "补充高一生物分组实验器材", applicant: "顾文清", date: TODAY, state: "待审核", items: [{ ...seedItem("IT1"), itemId: "IT1", model: "XSP-16A", qty: 2, price: 3580 }] });
    db.checks.push({ id: "JC-20260831-001", school: "S1", roomId: "S1-L2", date: TODAY, kind: "日常巡查", inspector: "陈小红", items: "消防设施、用电安全、化学品储存、应急设施", result: "发现隐患", note: "化学准备室房间门锁损坏。" });
    db.hazards.push({ id: "YH-20260831-001", school: "S1", checkId: "JC-20260831-001", roomId: "S1-L2", title: "化学准备室房间门锁损坏", level: "需优先处理", date: TODAY, due: "2026-09-02", owner: "顾文清", state: "待整改", note: "暂停售用该房间，转移物品后处理门锁。" });
    const chemistryTask = db.teachingTasks.find(t => t.school === "S1" && t.planItemId === "S1-P2-I1");
    db.flows.push({ id: "LY-20260831-001", school: "S1", itemId: "S1-I3", kind: "领用", qty: 1, date: TODAY, applicant: "陈小红", applicantId: "S1-T4", state: "待复核", taskId: chemistryTask.id, arrangementId: "", reason: "下周化学实验", reviewer: "" });
    db.archives.push({ id: "FILE-001", school: "S1", name: "开学实验室安全检查说明.txt", category: "安全管理", relatedTable: "checks", relatedId: "JC-20260831-001", date: TODAY, uploader: "陈小红", state: "已归档", mime: "text/plain;charset=utf-8", content: "安全检查附件\n检查日期：2026-08-31\n检查位置：化学实验室1\n发现问题：房间门锁损坏。" });
    db.archives.push({ id: "FILE-002", school: "S1", name: "物理实验器材清单.csv", category: "实验教学", relatedTable: "bookings", relatedId: "S1-YY1", date: TODAY, uploader: "陈小红", state: "待归档", mime: "text/csv;charset=utf-8", content: "器材,数量,单位\n力学轨道小车,1,台\n刻度尺,8,把\n" });
    Object.entries(tableNames).filter(([table]) => table !== "logs").forEach(([table, label]) => db[table].forEach(row => db.logs.push({ id: `INIT-${table}-${row.id}`, school: row.school || table === "schools" && row.id || "", table, recordId: row.id, action: "初始化数据", actor: "系统管理员", at: db.updatedAt, note: `${label}数据导入` })));
    return db;
  }
  function teaching(db, school = "", term = "TERM26", by = "school", filters = {}) {
    const buckets = new Map(); scoped(db, "teachingTasks", school).filter(task => task.term === term && task.state !== "已失效").forEach(task => { const { item, experiment, klass, teacher } = taskContext(db, task); if (filters.subject && experiment.subject !== filters.subject || filters.grade && klass.grade !== filters.grade || filters.teacherId && teacher.id !== filters.teacherId || filters.classId && klass.id !== filters.classId) return; const label = by === "subject" ? experiment.subject : by === "grade" ? klass.grade : by === "class" ? `${find(db, "schools", task.school).name} · ${klass.name}` : find(db, "schools", task.school).name, b = buckets.get(label) || { id: label, name: label, school: by === "school" ? task.school : "", required: 0, done: 0, optional: 0, optionalDone: 0, demonstration: 0, demonstrationDone: 0, group: 0, groupDone: 0, tasks: [], teacherSet: new Set(), gradeSet: new Set() }, done = task.state === "已完成"; b.tasks.push(task.id); b.teacherSet.add(teacher.name); b.gradeSet.add(klass.grade); if (experiment.required === "必做") { b.required++; if (done) b.done++; } else { b.optional++; if (done) b.optionalDone++; } const mode = item.mode === "演示" ? "demonstration" : "group"; b[mode]++; if (done) b[`${mode}Done`]++; buckets.set(label, b); }); return [...buckets.values()].map(b => ({ ...b, teacherNames: [...b.teacherSet].join("、"), gradeNames: [...b.gradeSet].join("、"), teacherSet: undefined, gradeSet: undefined, pending: b.required - b.done, rate: ratio(b.done, b.required), demonstrationRate: ratio(b.demonstrationDone, b.demonstration), groupRate: ratio(b.groupDone, b.group), total: b.required + b.optional, totalDone: b.done + b.optionalDone, totalRate: ratio(b.done + b.optionalDone, b.required + b.optional) }));
  }
  function metrics(db, school = "", term = "TERM26") { const assets = scoped(db, "assets", school).filter(asset => !asset.pendingReceiptId), stock = scoped(db, "inventory", school).filter(row => !row.pendingReceiptId || !row.pendingReceiptCreated), expected = scoped(db, "teachingTasks", school).filter(task => task.term === term && task.state !== "已失效" && taskContext(db, task).experiment.required === "必做"), hazards = scoped(db, "hazards", school), done = expected.filter(task => task.state === "已完成").length; return { assets: assets.length, normal: assets.filter(a => a.state === "正常使用").length, repair: assets.filter(a => a.state === "维修中").length, value: assets.filter(a => a.state !== "已报废").reduce((sum, a) => sum + a.price, 0), labs: scoped(db, "rooms", school).filter(r => r.type === "教学实验室").length, required: expected.length, done, pending: expected.length - done, rate: ratio(done, expected.length), low: stock.filter(r => r.stock < r.min).length, chemicals: stock.filter(r => isHazard(itemOf(db, r))).length, hazards: hazards.length, closed: hazards.filter(r => r.state === "已关闭").length, closure: ratio(hazards.filter(r => r.state === "已关闭").length, hazards.length), staff: scoped(db, "staff", school).filter(r => r.enabled).length, administrators: scoped(db, "staff", school).filter(r => r.enabled && r.role === "admin").length }; }
  function normalizeMergedRoles(db) { (db.staff || []).forEach(person => { if (person.role === "technician") { person.role = "admin"; person.legacyRole = "technician"; if (["实验员", "实验技术人员"].includes(person.title)) person.title = "实验管理员"; } }); }
  function removeTrainingData(db) { (db.staff || []).forEach(person => { delete person.trainings; delete person.trainingCount; delete person.trainingStatus; }); db.archives = (db.archives || []).filter(file => file.category !== "师资培训"); }
  function normalizeExecutionStates(db) {
    ["arrangements", "bookings", "teachingTasks"].forEach(table => (db[table] || []).forEach(row => {
      if (row.state === "已准备" || row.state === "待总结") row.state = "已安排";
    }));
    (db.arrangements || []).forEach(arrangement => {
      if (arrangement.preparation) arrangement.note = [arrangement.note, `历史准备记录：${arrangement.preparation}`].filter(Boolean).join("；");
      delete arrangement.preparation;
      delete arrangement.preparedBy;
      delete arrangement.preparedAt;
    });
  }
  function actorFor(db, role, school = "S1", personId) { const legacyTechnician = role === "technician"; if (legacyTechnician) role = "admin"; choice(role, Object.keys(roles), "身份"); if (role === "district") return { role, name: "周岚", school: "", id: "DISTRICT" }; find(db, "schools", school); const person = db.staff.find(p => p.school === school && p.role === role && p.enabled && (!personId || p.id === personId) && (!legacyTechnician || p.legacyRole === "technician" || p.title === "实验管理员" || p.title === "实验员")); must(person, "该校暂无可用的对应角色账号，请先维护人员。"); return { role, school, name: person.name, id: person.id }; }

  function transact(original, actor, command, input = {}, now = new Date().toISOString()) {
    if (["booking.batch", "repair.batch"].includes(command)) {
      must(Array.isArray(input.rows) && input.rows.length > 0 && input.rows.length <= 30, "请填写1至30条业务明细。"); let next = original; const ids = [], table = command === "booking.batch" ? "bookings" : "repairs";
      input.rows.forEach(row => { const out = transact(next, actor, command.replace("batch", "create"), row, now); next = out.db; ids.push(out.result.id); }); ids.forEach(id => { find(next, table, id).batchId = ids[0]; }); return { db: next, result: { ...find(next, table, ids[0]), ids } };
    }
    const db = clone(original), p = clone(input); let result;
    must(actor && roles[actor.role], "请选择有效身份。"); if (actor.role !== "district") { const person = find(db, "staff", actor.id); must(person.enabled && person.role === actor.role && person.school === actor.school, "账号身份已变更，请重新选择身份。"); }
    const id = prefix => `${prefix}-${TODAY.replaceAll("-", "")}-${++db.seq}`, permit = allowed => must(allowed.includes(actor.role), `该操作需要${allowed.map(role => roles[role]).join("或")}身份。`), get = (table, key = p.id) => { const row = find(db, table, key); must(actor.role === "district" || row.school === actor.school || table === "schools" && row.id === actor.school, "不能操作其他学校的数据。"); return row; }, state = (row, allowed) => must(allowed.includes(row.state), `当前状态“${row.state}”不能执行此操作。`);
    function log(table, row, action, note = "") { db.logs.push({ id: id("LOG"), school: row.school || "", table, recordId: row.id, action, note, actor: actor.name, at: now }); result = row; }
    function add(table, row, action) { db[table].unshift(row); log(table, row, action); return row; }
    function sameSchool(table, key, school) { const row = find(db, table, key); must(!row.school || row.school === school, "关联档案须属于同一学校。"); return row; }
    function lineItems(raw, receiving = false) { must(Array.isArray(raw) && raw.length > 0 && raw.length <= 30, "请填写1至30条物品明细。"); return raw.map(row => { const item = itemRecord(db, row); item.classificationCode = text(item.classificationCode, "分类编号", 60); item.name = text(item.name, "物品名称"); item.spec = text(item.spec, "规格型号"); item.unit = text(item.unit, "单位"); must(!item.maintenanceRequired || item.trackingMode === "SERIALIZED", "周期维保只适用于单件编号设备。"); must(!["耗材", "危化品"].includes(item.category) || item.trackingMode === "QUANTITY", "耗材和危化品须按数量库存管理。"); const nextMaintenance = row.nextMaintenance || "", expiry = row.expiry || ""; if (nextMaintenance) { must(item.trackingMode === "SERIALIZED" && item.maintenanceRequired, `“${item.name}”不需要登记维保日期。`); date(nextMaintenance); } if (expiry) { must(item.trackingMode === "QUANTITY", `“${item.name}”不是数量库存，不登记有效期。`); date(expiry); } if (receiving && isHazard(item)) must(expiry, `请登记“${item.name}”的有效期。`); return { itemId: item.itemId || item.classificationCode, classificationCode: item.classificationCode, name: item.name, model: item.spec, spec: item.spec, category: item.category, unit: item.unit, trackingMode: item.trackingMode, maintenanceRequired: item.maintenanceRequired, qty: num(row.qty, "数量", 1, true), price: num(row.price, "单价"), roomId: row.roomId || "", nextMaintenance, expiry }; }); }
    function resourceFitsSubject(resource, subject) { const record = db.assets.find(row => row.id === resource.ref) || db.inventory.find(row => row.id === resource.ref), item = itemOf(db, record), room = record?.roomId ? find(db, "rooms", record.roomId) : null; return itemFitsSubject(item, subject) && (!room?.subject || room.subject === subject); }
    const overlaps = (left, right) => left.scheduledDate === right.scheduledDate && Number(left.startPeriod) <= Number(right.endPeriod) && Number(right.startPeriod) <= Number(left.endPeriod);
    function resourceRows(raw, school, reserve = false, arrangementId = "", window = null) {
      must(Array.isArray(raw) && raw.length <= 30, "器材明细格式不正确。"); must(new Set(raw.map(r => r.ref)).size === raw.length, "同一器材请合并数量。");
      return raw.map(row => { const asset = db.assets.find(a => a.id === row.ref), stock = db.inventory.find(i => i.id === row.ref), record = asset || stock; must(record && record.school === school, "请选择本校器材。"); const qty = num(row.qty, "器材数量", 1, true), item = itemOf(db, record), room = record.roomId ? find(db, "rooms", record.roomId) : null; if (asset) { must(qty === 1 && asset.state === "正常使用" && room?.school === school && room.state === "可用", `“${item.name}”不可用、尚未分配房间或存放房间已停用。`); if (reserve) { const conflict = db.arrangements.find(a => a.id !== arrangementId && a.state !== "已取消" && window && overlaps(a, window) && (a.resources || []).some(resource => resource.ref === asset.id)); must(!conflict, `“${item.name}”已被重叠实验安排${conflict?.id || ""}占用。`); } } if (stock) { must(!stock.pendingReceiptId, `“${item.name}”正在等待整单入库复核。`); must(!expiredHazard(db, stock), `“${item.name}”已过期，只能办理退回、损耗或处置。`); must(room?.school === school && room.state === "可用" && roomFitsItem(room, item), `“${item.name}”尚未分配合规存放房间或存放房间已停用。`); const pending = db.flows.filter(f => f.itemId === stock.id && f.state === "待复核" && ["领用", "损耗", "处置"].includes(f.kind)).reduce((sum, f) => sum + f.qty, 0), reserved = reserve ? db.arrangements.filter(a => a.id !== arrangementId && activeArrangement(a) && window && overlaps(a, window)).reduce((sum, a) => sum + (a.resources || []).filter(x => x.ref === stock.id).reduce((n, x) => n + x.qty, 0), 0) : 0, issues = arrangementId ? db.flows.filter(flow => flow.arrangementId === arrangementId && flow.itemId === stock.id && flow.kind === "领用" && flow.state === "已记账") : [], issued = issues.reduce((sum, issue) => sum + issue.qty - db.flows.filter(flow => flow.kind === "退回" && flow.sourceFlowId === issue.id && flow.state === "已记账").reduce((n, flow) => n + flow.qty, 0), 0); must(qty + pending + reserved <= stock.stock + issued, `“${item.name}”可用库存不足。`); } return { ref: record.id, qty }; });
    }
    function requestRows(raw) { must(Array.isArray(raw) && raw.length <= 30, "补充器材需求格式不正确。"); must(new Set(raw.map(row => row.itemId || row.classificationCode)).size === raw.length, "同一补充器材请合并数量。"); return raw.map(row => { const item = itemRecord(db, row); item.classificationCode = text(item.classificationCode, "分类编号", 60); item.name = text(item.name, "物品名称"); item.spec = text(item.spec, "规格型号"); item.unit = text(item.unit, "单位"); must(itemFitsSubject(item, row.subject || item.subject || "") || !row.subject, "补充器材与实验学科不匹配。"); return { itemId: item.itemId || item.classificationCode, classificationCode: item.classificationCode, name: item.name, spec: item.spec, category: item.category, unit: item.unit, qty: num(row.qty, "需求数量", 1, true) }; }); }
    const returnedQty = issue => db.flows.filter(flow => flow.kind === "退回" && flow.sourceFlowId === issue.id && flow.state === "已记账").reduce((sum, flow) => sum + flow.qty, 0);
    function netIssued(arrangementId, stockId) { return db.flows.filter(flow => flow.arrangementId === arrangementId && flow.itemId === stockId && flow.kind === "领用" && flow.state === "已记账").reduce((sum, issue) => sum + issue.qty - returnedQty(issue), 0); }
    function validateArrangementIssue(arrangement, stock, qty, excludeFlowId = "") { const resource = (arrangement.resources || []).find(row => row.ref === stock.id); must(resource, "领用物品不在该实验安排的实际器材中。"); const pending = db.flows.filter(flow => flow.id !== excludeFlowId && flow.arrangementId === arrangement.id && flow.itemId === stock.id && flow.kind === "领用" && flow.state === "待复核").reduce((sum, flow) => sum + flow.qty, 0); must(netIssued(arrangement.id, stock.id) + pending + qty <= resource.qty, `领用数量超过实验安排配置量${resource.qty}${itemOf(db, stock).unit}。`); }
    function stockPost(flow) { const stock = find(db, "inventory", flow.itemId), item = itemOf(db, stock), delta = ["入库", "退回"].includes(flow.kind) ? flow.qty : -flow.qty; if (flow.kind === "领用") must(!expiredHazard(db, stock), `“${item.name}”已过期，不能复核领用。`); if (stock.roomId) { const room = find(db, "rooms", stock.roomId), mayClearStoppedRoom = ["退回", "损耗", "处置"].includes(flow.kind); must(room.school === stock.school && (room.state === "可用" || mayClearStoppedRoom) && roomFitsItem(room, item), `“${item.name}”的存放房间已停用或不符合存放条件，不能记账。`); } must(!stock.pendingReceiptId || stock.pendingReceiptId === flow.receiptId, "库存正在等待其他入库单整单复核。"); must(stock.stock + delta >= 0, `“${item.name}”库存不足。`); stock.stock += delta; flow.state = "已记账"; log("inventory", stock, flow.kind, `${flow.id}：${delta}${item.unit}`); }
    function requestedConflict(booking, exclude = "") { return db.bookings.find(other => { if (other.id === exclude || other.classId !== booking.classId && other.teacherId !== booking.teacherId) return false; const arrangement = db.arrangements.find(row => row.bookingId === other.id && row.state !== "已取消"); if (arrangement) return arrangement.scheduledDate === booking.requestedDate && Number(arrangement.startPeriod) <= Number(booking.requestedPeriod) && Number(booking.requestedPeriod) <= Number(arrangement.endPeriod); return other.state === "待安排" && other.requestedDate === booking.requestedDate && Number(other.requestedPeriod) === Number(booking.requestedPeriod); }); }
    function arrangementCheck(arrangement, exclude = "") {
      const booking = find(db, "bookings", arrangement.bookingId), context = taskContext(db, booking.taskId), term = find(db, "terms", context.plan.term); must(arrangement.scheduledDate >= term.start && arrangement.scheduledDate <= term.end, "安排日期须在当前计划学期内。"); const start = num(arrangement.startPeriod, "开始节次", 1, true), end = num(arrangement.endPeriod, "结束节次", 1, true), covered = Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => periodFor(db, booking.school, start + index, term.id)); must(end >= start && covered.length >= context.experiment.periods && covered.every(period => period?.state === "启用"), `安排须覆盖至少${context.experiment.periods}个连续启用节次。`);
      if (arrangement.venueType === "其他") { arrangement.venueText = text(arrangement.venueText, "其他地点说明", 100); arrangement.roomId = ""; } else { const room = find(db, "rooms", arrangement.roomId), studentCount = booking.studentCount ?? context.klass.students; arrangement.venueText = ""; must(room.school === booking.school && room.state === "可用", "房间不属于本校或不可用。"); if (arrangement.venueType === "实验室") must(room.type === "教学实验室" && (!room.subject || room.subject === context.experiment.subject), "请选择符合实验学科的教学实验室。"); if (arrangement.venueType === "教室") must(room.type === "普通教室", "地点类型为教室时须选择普通教室。"); must(room.seats == null || room.seats >= studentCount, `房间容量不足：${studentCount}人 / ${room.seats}座。`); }
      const manager = find(db, "staff", arrangement.technicianId); must(manager.school === booking.school && manager.enabled && manager.role === "admin", "请选择本校启用的学校管理员作为实验负责人。"); const conflict = db.arrangements.filter(other => other.id !== exclude && other.state !== "已取消" && other.scheduledDate === arrangement.scheduledDate && Number(other.startPeriod) <= end && start <= Number(other.endPeriod)).find(other => { const otherBooking = find(db, "bookings", other.bookingId); return arrangement.roomId && other.roomId === arrangement.roomId || otherBooking.classId === booking.classId || otherBooking.teacherId === booking.teacherId || other.technicianId === arrangement.technicianId; }); must(!conflict, `安排冲突：${conflict?.id || ""}已占用房间、班级、教师或实验负责人。`); arrangement.startPeriod = start; arrangement.endPeriod = end; arrangement.resources = resourceRows(arrangement.resources || [], booking.school, true, exclude, arrangement); must(arrangement.resources.every(resource => resourceFitsSubject(resource, context.experiment.subject)), "实际器材须与当前实验学科一致。");
    }
    function validateBookingRequest(booking, context, exclude = "") { must(periodFor(db, booking.school, booking.requestedPeriod, context.plan.term)?.state === "启用", "请选择学校当学期已启用的节次。"); const term = find(db, "terms", context.plan.term); must(booking.requestedDate >= term.start && booking.requestedDate <= term.end, "申请日期须在计划学期内。"); if (context.item.mode === "分组") must(booking.groups >= 1 && booking.groups <= context.klass.students, "分组数必须在1与班级人数之间。"); else booking.groups = null; must((booking.requestedResources || []).every(resource => itemFitsSubject(resource, context.experiment.subject)), "补充器材须与当前实验学科一致；危化品只用于化学实验。"); const conflict = requestedConflict(booking, exclude); must(!conflict, `预约申请冲突：${conflict?.id || ""}的班级或教师已申请该节次。`); }

    if (command === "purchase.create") { permit(["admin"]); add("purchases", { id: id("CG"), school: actor.school, purpose: text(p.purpose, "采购用途"), items: lineItems(p.items).map(({ roomId, nextMaintenance, expiry, ...line }) => line), applicant: actor.name, date: date(p.date || TODAY), state: "待审核" }, "提交采购申请"); }
    else if (command === "purchase.decide") { permit(["district"]); const row = get("purchases"); state(row, ["待审核"]); row.decision = text(p.reason, "审批意见"); row.state = p.approve === true ? "已通过" : "已驳回"; log("purchases", row, row.state, row.decision); }
    else if (command === "purchase.cancel") { permit(["admin"]); const row = get("purchases"); state(row, ["待审核"]); row.cancelReason = text(p.reason, "撤销原因"); row.state = "已撤销"; log("purchases", row, "撤销申请", row.cancelReason); }
    else if (command === "receipt.create") {
      permit(["admin"]);
      const order = p.purchaseId ? get("purchases", p.purchaseId) : null;
      if (order) state(order, ["已通过"]);
      if (order) must(Array.isArray(p.placements) && p.placements.length === order.items.length, "存放信息须与已审批采购明细逐行对应。");
      const raw = order ? order.items.map((item, index) => ({ ...item, roomId: p.placements[index]?.roomId || "", nextMaintenance: p.placements[index]?.nextMaintenance || "", expiry: p.placements[index]?.expiry || "" })) : p.items;
      const items = lineItems(raw, true);
      must(items.reduce((sum, row) => sum + row.qty, 0) <= 100, "单次入库最多100件。");
      const requiresReview = items.some(line => isHazard(line));
      const receipt = { id: id("RK"), school: actor.school, purchaseId: order?.id || "", items, date: date(p.date), purchaseDate: date(p.purchaseDate || p.date), supplier: text(p.supplier, "供应商"), operator: actor.name, note: optional(p.note, "备注", 500), state: requiresReview ? "待库存复核" : "已入库" };
      must(receipt.purchaseDate <= receipt.date, "购置日期不能晚于登记日期。");
      items.forEach(line => {
        const master = line;
        must(!isHazard(master) || master.trackingMode === "QUANTITY", "危化品须按数量库存管理。");
        if (isHazard(master)) must(line.expiry >= receipt.date, `“${master.name}”的有效期不能早于登记日期。`);
        if (line.roomId) { const room = sameSchool("rooms", line.roomId, actor.school); must(room.state === "可用", "存放房间当前不可用。"); must(roomFitsItem(room, master), `“${master.name}”与存放房间学科不一致。`); }
        if (master.trackingMode === "SERIALIZED") {
          for (let n = 0; n < line.qty; n++) {
            const key = id("ZC"), assetSerial = nextAssetSerial(db, actor.school), asset = { id: key, school: actor.school, itemId: master.itemId || master.classificationCode, classificationCode: master.classificationCode, name: master.name, spec: master.spec, category: master.category, unit: master.unit, trackingMode: master.trackingMode, maintenanceRequired: master.maintenanceRequired, assetSerial, price: line.price, purchaseDate: receipt.purchaseDate, roomId: line.roomId, supplier: receipt.supplier, state: requiresReview ? "待库存复核" : line.roomId ? "正常使用" : "待存放", sourceId: receipt.id, pendingReceiptId: requiresReview ? receipt.id : "", nextMaintenance: line.nextMaintenance || "" };
            asset.code = assetCode(db, asset, assetSerial);
            add("assets", asset, requiresReview ? "随整单待库存复核" : line.roomId ? "入库建档" : "入库待分配房间");
          }
          return;
        }
        let stock = db.inventory.find(row => row.school === actor.school && row.itemId === (master.itemId || master.classificationCode) && row.roomId === line.roomId);
        const createdForReceipt = !stock;
        if (stock && expiredHazard(db, stock)) must(stock.stock === 0, `“${master.name}”的过期库存尚未清零，不能与新到货混存。请先完成损耗或处置。`);
        if (!stock) stock = add("inventory", { id: id("HC"), school: actor.school, itemId: master.itemId || master.classificationCode, classificationCode: master.classificationCode, name: master.name, spec: master.spec, category: master.category, unit: master.unit, trackingMode: master.trackingMode, maintenanceRequired: master.maintenanceRequired, stock: 0, min: 0, expiry: line.expiry, roomId: line.roomId, state: line.roomId ? "在库" : "待分配", pendingReceiptId: "", pendingReceiptCreated: false }, "建立库存余额");
        else if (line.expiry) { if (requiresReview && !Object.hasOwn(stock, "pendingReceiptPriorExpiry")) stock.pendingReceiptPriorExpiry = stock.expiry || ""; stock.expiry = stock.stock === 0 ? line.expiry : [stock.expiry, line.expiry].filter(Boolean).sort()[0] || ""; }
        if (requiresReview) {
          must(!stock.pendingReceiptId || stock.pendingReceiptId === receipt.id, `“${master.name}”已有其他整单入库等待复核。`);
          must(!db.arrangements.some(arrangement => activeArrangement(arrangement) && (arrangement.resources || []).some(resource => resource.ref === stock.id)), `“${master.name}”正在有效实验安排中使用。`);
          if (!stock.pendingReceiptId) stock.pendingReceiptPriorState = stock.state;
          stock.pendingReceiptId = receipt.id;
          stock.pendingReceiptCreated = stock.pendingReceiptCreated || createdForReceipt;
          stock.state = "待库存复核";
        }
        const flow = { id: id("KC"), school: actor.school, itemId: stock.id, kind: "入库", qty: line.qty, date: receipt.date, applicant: actor.name, applicantId: actor.id, reviewer: "", reason: `入库单${receipt.id}`, state: requiresReview ? "待复核" : "已记账", receiptId: receipt.id, arrangementId: "", taskId: "", snapshot: { itemId: master.itemId || master.classificationCode, classificationCode: master.classificationCode, name: master.name, spec: master.spec, unit: master.unit, unitPrice: line.price, roomId: line.roomId, expiry: line.expiry } };
        if (!requiresReview) stockPost(flow);
        add("flows", flow, requiresReview ? "整单库存复核" : "入库记账");
      });
      if (order) { order.state = receipt.state; order.receiptId = receipt.id; log("purchases", order, order.state, receipt.id); } add("receipts", receipt, receipt.state);
    }
    else if (command === "repair.create") {
      permit(["admin", "teacher"]);
      const asset = get("assets", p.assetId), kind = choice(p.kind, ["维修", "报废", "维保"], "处理类型");
      state(asset, ["正常使用"]);
      must(actor.role !== "teacher" || kind === "维修", "教师只能提交报修。");
      must(kind !== "维保" || itemOf(db, asset)?.maintenanceRequired, "该设备不需要周期维保。");
      must(!db.repairs.some(row => row.assetId === asset.id && ["待执行", "待审核", "处理中", "待验收"].includes(row.state)), "该设备已有在途处理单。");
      const registeredAt = date(p.date || TODAY), due = date(p.due), row = { id: id(kind === "报废" ? "BF" : "WX"), school: asset.school, assetId: asset.id, kind, reason: text(p.reason, "故障或申请原因"), date: registeredAt, due, reporter: actor.name, reporterId: actor.id, state: kind === "维修" ? "处理中" : kind === "维保" ? "待执行" : "待审核", priorState: asset.state, cost: 0, qty: 1, snapshot: { ...itemOf(db, asset), code: asset.code, purchaseDate: asset.purchaseDate, roomId: asset.roomId } };
      must(row.date <= TODAY, "登记日期不能晚于当前日期。");
      must(row.due >= row.date, "处理期限不能早于提交日期。");
      if (kind === "维修") asset.state = "维修中";
      if (kind === "报废") asset.state = "待报废";
      log("assets", asset, `提交${kind}`, row.id); add("repairs", row, `提交${kind}申请`);
    }
    else if (["repair.start", "repair.decide", "repair.finish", "repair.accept", "repair.cancel"].includes(command)) {
      const row = get("repairs"), asset = get("assets", row.assetId);
      if (command === "repair.start") { permit(["admin"]); must(row.kind === "维保", "只有待执行维保计划需要开始操作。"); state(row, ["待执行"]); state(asset, ["正常使用"]); must(!db.arrangements.some(arrangement => activeArrangement(arrangement) && (arrangement.resources || []).some(resource => resource.ref === asset.id)), "该设备有有效实验安排，不能开始维保。"); row.startedAt = date(p.date || TODAY); must(row.startedAt >= row.date && row.startedAt <= TODAY, "维保开始日期不能早于登记日期或晚于当前日期。"); row.state = "处理中"; asset.state = "维修中"; }
      if (command === "repair.decide") { permit(["district"]); must(row.kind === "报废", "维修和维保不设置区级审批。"); state(row, ["待审核"]); state(asset, ["待报废"]); row.decision = text(p.reason, "审批意见"); if (p.approve === true) { row.state = "已完成"; asset.state = "已报废"; } else { row.state = "已驳回"; asset.state = row.priorState; } }
      if (command === "repair.finish") { permit(["admin"]); state(row, ["处理中"]); state(asset, ["维修中"]); row.vendor = optional(p.vendor, "维修商"); row.cost = num(p.cost, "维修金额"); row.maintenanceDate = date(p.maintenanceDate || TODAY); must(row.maintenanceDate >= (row.startedAt || row.date) && row.maintenanceDate <= TODAY, "维修或维保日期不能早于开始日期或晚于当前日期。"); row.result = text(p.reason, "维修内容", 100); row.state = "待验收"; }
      if (command === "repair.accept") { permit(["admin"]); state(row, ["待验收"]); state(asset, ["维修中"]); row.acceptance = text(p.reason, "验收意见"); row.state = "已完成"; asset.state = "正常使用"; if (p.nextMaintenance) { must(itemOf(db, asset).maintenanceRequired, "该物品不需要维保日期。"); asset.nextMaintenance = date(p.nextMaintenance); must(asset.nextMaintenance > row.maintenanceDate, "下次维保日期须晚于本次处理日期。"); } }
      if (command === "repair.cancel") { permit(["admin", "teacher"]); state(row, row.kind === "报废" ? ["待审核"] : ["待执行", "处理中"]); must(actor.role === "admin" || (row.reporterId ? row.reporterId === actor.id : row.reporter === actor.name), "只能撤销本人申请。"); if (row.state === "处理中") { state(asset, ["维修中"]); asset.state = row.priorState; } else if (row.kind === "报废") { state(asset, ["待报废"]); asset.state = row.priorState; } row.state = "已撤销"; }
      log("assets", asset, `${row.kind}状态更新`, row.id); log("repairs", row, row.state, p.reason || "");
    }
    else if (command === "inventory.save") { permit(["admin"]); const row = p.id ? get("inventory") : { id: id("HC"), school: actor.school, stock: 0, roomId: "", state: "待分配" }, master = itemRecord(db, p.id ? row : p), previousExpiry = row.expiry || ""; master.classificationCode = text(master.classificationCode, "分类编号", 60); master.name = text(master.name, "物品名称"); master.spec = text(master.spec, "规格型号"); master.unit = text(master.unit, "单位"); if (p.id) must(!row.pendingReceiptId, "库存正在等待整单入库复核，不能修改。"); must(master.trackingMode === "QUANTITY", "耗材库存只能登记数量型物品。"); if (p.id) must(row.itemId === master.itemId, "已有库存不能直接更换物品信息。"); Object.assign(row, master, { id: row.id, school: row.school }); row.min = num(p.min, "补库阈值"); row.expiry = p.expiry ? date(p.expiry) : ""; if (isHazard(master)) { must(row.expiry, `请登记“${master.name}”的有效期。`); must(row.expiry === previousExpiry || row.expiry >= TODAY, "新登记或更新的危化品库存有效期不能早于当前日期。"); } if (!p.id && p.roomId) { const room = sameSchool("rooms", p.roomId, actor.school); must(room.state === "可用", "存放房间当前不可用。"); must(roomFitsItem(room, master), `“${master.name}”与存放房间学科或存放条件不一致。`); row.roomId = p.roomId; row.state = "在库"; } must(!db.inventory.some(stock => stock.id !== row.id && stock.school === row.school && stock.itemId === row.itemId && stock.roomId === row.roomId), "同一物品在该房间已有库存余额。"); p.id ? log("inventory", row, "维护库存阈值") : add("inventory", row, "新增库存档案"); }
    else if (command === "flow.create") {
      permit(["admin", "teacher"]); const stock = get("inventory", p.itemId), master = itemOf(db, stock), kind = choice(p.kind, ["入库", "领用", "损耗", "退回", "处置"], "业务类型"); must(!stock.pendingReceiptId, "库存正在等待整单入库复核，不能办理其他业务。"); if (actor.role === "teacher") must(kind === "领用", "教师只能提交领用申请。"); if (expiredHazard(db, stock)) must(["退回", "损耗", "处置"].includes(kind), "过期危化品只能办理退回、损耗或处置。"); if (kind !== "入库") must(stock.roomId, "物品尚未分配存放房间，不能办理出库或退回。"); if (stock.roomId) { const room = find(db, "rooms", stock.roomId), mayClearStoppedRoom = ["退回", "损耗", "处置"].includes(kind); must(room.school === stock.school && (room.state === "可用" || mayClearStoppedRoom) && roomFitsItem(room, master), "存放房间已停用或不符合存放条件，不能办理该库存业务。"); }
      const qty = num(p.qty, "数量", 1, true), businessDate = date(p.date); let arrangement = null, source = null, taskId = "";
      if (kind === "退回") {
        source = get("flows", p.sourceFlowId); must(source.kind === "领用" && source.state === "已记账" && source.itemId === stock.id, "退回必须关联同一物品的已记账领用单。"); must(!p.arrangementId || p.arrangementId === source.arrangementId, "退回须继承原领用所属实验安排。"); must(!p.taskId || p.taskId === source.taskId, "退回须继承原领用所属实验任务。"); must(businessDate >= source.date, "退回日期不能早于原领用日期。"); const returned = returnedQty(source); must(returned + qty <= source.qty, "退回数量不能超过原领用数量。"); arrangement = source.arrangementId ? get("arrangements", source.arrangementId) : null; taskId = source.taskId || "";
      } else {
        must(!p.sourceFlowId, "只有退回业务可以关联原领用单。"); arrangement = p.arrangementId ? get("arrangements", p.arrangementId) : null; taskId = arrangement ? find(db, "bookings", arrangement.bookingId).taskId : p.taskId || ""; if (arrangement) { must(kind === "领用", "实验安排只关联领用业务，退回由原领用单自动继承。"); state(arrangement, ["已安排"]); if (actor.role === "teacher") must(find(db, "bookings", arrangement.bookingId).teacherId === actor.id, "只能关联本人实验安排。"); validateArrangementIssue(arrangement, stock, qty); }
      }
      const pending = db.flows.filter(flow => flow.itemId === stock.id && flow.state === "待复核" && ["领用", "损耗", "处置"].includes(flow.kind)).reduce((sum, flow) => sum + flow.qty, 0); if (!["入库", "退回"].includes(kind)) must(qty + pending <= stock.stock, `库存不足：当前可用${stock.stock - pending}${master.unit}。`); const row = { id: id("KC"), school: stock.school, itemId: stock.id, kind, qty, date: businessDate, reason: text(p.reason, "用途或原因"), applicant: actor.name, applicantId: actor.id, arrangementId: source?.arrangementId || arrangement?.id || "", taskId, ...(source ? { sourceFlowId: source.id } : {}), state: isHazard(master) || actor.role === "teacher" ? "待复核" : "已记账", reviewer: "", snapshot: { itemId: master.itemId || master.classificationCode, classificationCode: master.classificationCode, name: master.name, spec: master.spec, unit: master.unit, roomId: stock.roomId } }; if (row.state === "已记账") stockPost(row); add("flows", row, row.state === "待复核" ? "提交库存业务复核" : `${kind}记账`);
    }
    else if (command === "flow.decide") {
      permit(["admin"]);
      const row = get("flows");
      state(row, ["待复核"]);
      must(row.applicantId !== actor.id, "不能复核本人记录，请由另一名责任人确认。");
      const approve = p.approve === true, reviewNote = text(p.reason, "复核意见");
      if (approve && row.kind === "领用" && row.arrangementId) { const arrangement = get("arrangements", row.arrangementId), stock = get("inventory", row.itemId); state(arrangement, ["已安排"]); validateArrangementIssue(arrangement, stock, row.qty, row.id); must(!expiredHazard(db, stock), "过期危化品不能复核领用。"); }
      row.reviewNote = reviewNote;
      row.reviewer = actor.name;
      if (!row.receiptId) {
        if (approve) stockPost(row); else row.state = "已驳回";
        log("flows", row, row.state, reviewNote);
      } else {
        const receipt = find(db, "receipts", row.receiptId), related = db.flows.filter(flow => flow.receiptId === receipt.id);
        state(receipt, ["待库存复核"]);
        must(related.length > 0 && related.every(flow => ["待复核", "复核通过"].includes(flow.state)), "整单库存复核状态不一致，请刷新后重试。");
        if (!approve) {
          related.forEach(flow => {
            flow.state = flow.id === row.id ? "已驳回" : "整单撤销";
            if (flow.id !== row.id) { flow.reviewer = actor.name; flow.reviewNote = `整单因${row.id}驳回：${reviewNote}`; }
            log("flows", flow, flow.state, flow.reviewNote);
          });
          db.assets.filter(asset => asset.pendingReceiptId === receipt.id).forEach(asset => log("assets", asset, "整单驳回，撤销暂存资产", receipt.id));
          db.assets = db.assets.filter(asset => asset.pendingReceiptId !== receipt.id);
          db.inventory.filter(stock => stock.pendingReceiptId === receipt.id).forEach(stock => {
            must(stock.stock === 0 || !stock.pendingReceiptCreated, "整单暂存库存出现异常余额，已阻止回滚。");
            stock.state = stock.pendingReceiptPriorState || (stock.roomId ? "在库" : "待分配");
            if (Object.hasOwn(stock, "pendingReceiptPriorExpiry")) stock.expiry = stock.pendingReceiptPriorExpiry;
            delete stock.pendingReceiptId;
            delete stock.pendingReceiptCreated;
            delete stock.pendingReceiptPriorState;
            delete stock.pendingReceiptPriorExpiry;
            log("inventory", stock, "整单入库驳回，解除库存锁定", receipt.id);
          });
          receipt.state = "库存复核驳回";
          receipt.reviewNote = reviewNote;
          receipt.rejectedAt = now;
          log("receipts", receipt, "库存复核驳回", reviewNote);
          if (receipt.purchaseId) {
            const purchase = find(db, "purchases", receipt.purchaseId);
            purchase.state = "已通过";
            purchase.receiptId = "";
            purchase.rejectedReceiptId = receipt.id;
            log("purchases", purchase, "库存复核驳回，可重新入库", receipt.id);
          }
        } else {
          row.state = "复核通过";
          log("flows", row, "明细复核通过，等待整单", reviewNote);
          if (related.every(flow => flow.state === "复核通过")) {
            related.forEach(flow => { stockPost(flow); log("flows", flow, "整单复核通过并记账", receipt.id); });
            db.assets.filter(asset => asset.pendingReceiptId === receipt.id).forEach(asset => {
              asset.state = asset.roomId ? "正常使用" : "待存放";
              delete asset.pendingReceiptId;
              log("assets", asset, "整单复核通过，激活资产", receipt.id);
            });
            db.inventory.filter(stock => stock.pendingReceiptId === receipt.id).forEach(stock => {
              stock.state = stock.roomId ? "在库" : "待分配";
              delete stock.pendingReceiptId;
              delete stock.pendingReceiptCreated;
              delete stock.pendingReceiptPriorState;
              delete stock.pendingReceiptPriorExpiry;
              log("inventory", stock, "整单复核通过，解除库存锁定", receipt.id);
            });
            receipt.state = "已入库";
            receipt.reviewedAt = now;
            log("receipts", receipt, "整单库存复核完成");
            if (receipt.purchaseId) {
              const purchase = find(db, "purchases", receipt.purchaseId);
              purchase.state = "已入库";
              delete purchase.rejectedReceiptId;
              log("purchases", purchase, "到货及库存复核完成", receipt.id);
            }
          }
        }
      }
      result = row;
    }
    else if (command === "plan.create") {
      permit(["admin", "teacher"]); const term = find(db, "terms", p.term), subject = choice(p.subject, subjects, "当前学科"); if (actor.role === "teacher") { const person = find(db, "staff", actor.id); must(person.subject === subject || person.subject === "综合", "只能编制本人学科的计划；综合教师可跨学科编制。"); } must(Array.isArray(p.items) && p.items.length > 0 && p.items.length <= 30, "请填写1至30项实验计划明细。");
      const plan = { id: id("JH"), school: actor.school, term: term.id, subject, grade: text(p.grade, "适用年级", 30), version: text(p.version, "教材版本", 100), name: text(p.name, "计划名称", 100), state: "已发布", createdBy: actor.id, createdAt: now, publishedAt: now }, scopePlans = db.plans.filter(row => row.school === plan.school && row.term === plan.term && row.subject === subject && row.state === "已发布"); must(!scopePlans.some(row => row.name === plan.name), "当前学校、学期和学科已有同名已发布计划。");
      const scopePlanIds = new Set(scopePlans.map(row => row.id)), scopeItemKeys = new Set(db.planItems.filter(item => scopePlanIds.has(item.planId)).map(item => experimentKey(db, item))), seen = new Set(), items = p.items.map(raw => { const experimentName = text(raw.experimentName, "实验名称", 100), chapter = text(raw.chapter, "章节", 100), equipment = text(raw.equipment, "器材需求", 1000), periods = num(raw.periods, "课时", 1, true), required = choice(raw.required || "必做", ["必做", "选做"], "实验属性"), mode = choice(raw.mode || "分组", ["演示", "分组"], "实验类型"), candidate = { school: actor.school, planId: plan.id, experimentName, chapter, equipment, periods, required, mode, grade: plan.grade, version: plan.version, subject }, key = experimentKey(db, candidate); must(!seen.has(key), "同一计划内不能重复添加相同实验和类型。"); must(!scopeItemKeys.has(key), "当前学校、学期和学科的其他已发布计划已包含相同实验和类型。"); seen.add(key); const scheduleType = choice(raw.scheduleType, ["WEEK", "DATE"], "计划时间类型"); let plannedWeek = null, plannedDate = ""; if (scheduleType === "WEEK") { plannedWeek = num(raw.plannedWeek, "计划周次", 1, true); must(plannedWeek <= weekOf(term, term.end), "计划周次超出学期。"); } else { plannedDate = date(raw.plannedDate); must(plannedDate >= term.start && plannedDate <= term.end, "计划日期须在当前学期内。"); } return { id: id("JHMZ"), school: actor.school, planId: plan.id, subject, grade: plan.grade, version: plan.version, experimentName, chapter, equipment, periods, required, scheduleType, plannedWeek, plannedDate, mode }; });
      db.plans.unshift(plan); items.forEach(item => db.planItems.push(item)); items.forEach(item => syncTeachingTasks(db, item.id)); log("plans", plan, "保存并发布实验计划", `${items.length}项明细`);
    }
    else if (command === "plan.archive") { permit(["admin"]); const plan = get("plans"); state(plan, ["已发布"]); const tasks = db.teachingTasks.filter(task => find(db, "planItems", task.planItemId).planId === plan.id); must(!tasks.some(task => ["待安排", "待修改"].includes(task.state)), "计划仍有在途实验任务，不能归档。"); tasks.filter(task => ["待预约", "已取消"].includes(task.state)).forEach(task => { task.state = "已失效"; log("teachingTasks", task, "计划归档，未开展任务失效", plan.id); }); plan.state = "已归档"; log("plans", plan, "归档计划"); }
    else if (command === "plan.delete") {
      permit(["admin"]);
      const plan = get("plans");
      state(plan, ["已发布", "已归档"]);
      const items = db.planItems.filter(item => item.planId === plan.id), itemIds = new Set(items.map(item => item.id));
      const tasks = db.teachingTasks.filter(task => itemIds.has(task.planItemId)), taskIds = new Set(tasks.map(task => task.id));
      const bookings = db.bookings.filter(booking => taskIds.has(booking.taskId)), bookingIds = new Set(bookings.map(booking => booking.id));
      const arrangements = db.arrangements.filter(arrangement => bookingIds.has(arrangement.bookingId)), arrangementIds = new Set(arrangements.map(arrangement => arrangement.id));
      const summaries = db.summaries.filter(summary => arrangementIds.has(summary.arrangementId)), summaryIds = new Set(summaries.map(summary => summary.id));
      const flows = db.flows.filter(flow => taskIds.has(flow.taskId) || arrangementIds.has(flow.arrangementId));
      const archives = db.archives.filter(file => file.relatedTable === "plans" && file.relatedId === plan.id || file.relatedTable === "planItems" && itemIds.has(file.relatedId) || file.relatedTable === "teachingTasks" && taskIds.has(file.relatedId) || file.relatedTable === "bookings" && bookingIds.has(file.relatedId) || file.relatedTable === "arrangements" && arrangementIds.has(file.relatedId) || file.relatedTable === "summaries" && summaryIds.has(file.relatedId));
      must(!tasks.some(task => !["待预约", "已失效"].includes(task.state)) && !bookings.length && !arrangements.length && !summaries.length && !flows.length && !archives.length, "计划已有预约、安排、总结、流水、附件或在途任务，不能删除；请改用归档。");
      const reason = text(p.reason, "删除原因", 100);
      log("plans", plan, "删除实验计划", reason);
      tasks.forEach(task => log("teachingTasks", task, "随计划删除", plan.id));
      db.teachingTasks = db.teachingTasks.filter(task => !taskIds.has(task.id));
      db.planItems = db.planItems.filter(item => !itemIds.has(item.id));
      db.plans = db.plans.filter(row => row.id !== plan.id);
      result = plan;
    }
    else if (command === "task.delete") {
      permit(["admin"]);
      const task = get("teachingTasks");
      state(task, ["待预约", "已失效"]);
      const bookings = db.bookings.filter(booking => booking.taskId === task.id), bookingIds = new Set(bookings.map(booking => booking.id));
      const arrangements = db.arrangements.filter(arrangement => bookingIds.has(arrangement.bookingId)), arrangementIds = new Set(arrangements.map(arrangement => arrangement.id));
      const flows = db.flows.filter(flow => flow.taskId === task.id || arrangementIds.has(flow.arrangementId));
      const archives = db.archives.filter(file => file.relatedTable === "teachingTasks" && file.relatedId === task.id || file.relatedTable === "bookings" && bookingIds.has(file.relatedId) || file.relatedTable === "arrangements" && arrangementIds.has(file.relatedId));
      must(!bookings.length && !arrangements.length && !flows.length && !archives.length, "实验任务已有预约、安排、流水或附件，不能删除；请保留历史记录。");
      const reason = text(p.reason, "删除原因", 100);
      log("teachingTasks", task, "删除实验任务", reason);
      db.deletedTaskKeys ||= [];
      const suppressionKey = `${task.planItemId}|${task.assignmentId}`;
      if (!db.deletedTaskKeys.includes(suppressionKey)) db.deletedTaskKeys.push(suppressionKey);
      db.teachingTasks = db.teachingTasks.filter(row => row.id !== task.id);
      result = task;
    }
    else if (command === "booking.create") {
      permit(["admin", "teacher"]); const task = get("teachingTasks", p.taskId), context = taskContext(db, task); state(task, ["待预约", "已取消"]); must(context.assignment.state === "有效" && context.assignment.primary && context.plan.state === "已发布" && context.klass.state === "在读", "主教师任课关系、班级或计划已失效。"); if (actor.role === "teacher") must(task.teacherId === actor.id, "只能预约本人任课班级实验。"); const booking = { id: id("YY"), school: task.school, taskId: task.id, planItemId: task.planItemId, assignmentId: task.assignmentId, classId: task.classId, teacherId: task.teacherId, studentCount: context.klass.students, applicant: actor.name, applicantId: actor.id, submittedAt: now, requestedDate: date(p.requestedDate), requestedPeriod: num(p.requestedPeriod, "申请节次", 1, true), groups: context.item.mode === "分组" ? num(p.groups, "分组数", 1, true) : null, requestedResources: requestRows(p.requestedResources || []), note: optional(p.note, "备注", 100), state: "待安排" };
      validateBookingRequest(booking, context); must(!db.bookings.some(row => row.taskId === task.id && activeBooking(row)), "该班级实验任务已有有效预约。"); task.state = "待安排"; log("teachingTasks", task, "提交预约", booking.id); add("bookings", booking, "提交实验预约");
    }
    else if (command === "booking.arrange") {
      permit(["admin"]); const booking = get("bookings"); state(booking, ["待安排"]); const arrangement = { id: id("AP"), school: booking.school, bookingId: booking.id, venueType: choice(p.venueType, ["实验室", "教室", "其他"], "地点类型"), roomId: p.roomId || "", venueText: optional(p.venueText, "其他地点说明", 100), scheduledDate: date(p.scheduledDate), startPeriod: p.startPeriod, endPeriod: p.endPeriod, technicianId: p.technicianId, note: optional(p.note, "安排说明", 100), resources: p.resources || [], state: "已安排", arrangedBy: actor.id, arrangedAt: now }; arrangementCheck(arrangement); booking.state = "已安排"; const task = find(db, "teachingTasks", booking.taskId); task.state = "已安排"; db.arrangements.unshift(arrangement); log("bookings", booking, "管理员完成实验安排", arrangement.id); log("teachingTasks", task, "已安排", arrangement.id); log("arrangements", arrangement, "确认安排");
    }
    else if (command === "booking.return") { permit(["admin"]); const booking = get("bookings"); state(booking, ["待安排"]); booking.returnReason = text(p.reason, "退回原因"); booking.state = "已退回"; find(db, "teachingTasks", booking.taskId).state = "待修改"; log("bookings", booking, "退回修改", booking.returnReason); }
    else if (command === "booking.resubmit") { permit(["admin", "teacher"]); const booking = get("bookings"); state(booking, ["已退回"]); must(actor.role !== "teacher" || booking.teacherId === actor.id, "只能修改本人预约。"); const context = taskContext(db, booking.taskId); must(context.assignment.state === "有效" && context.assignment.primary && context.plan.state === "已发布" && context.klass.state === "在读", "主教师任课关系、班级或计划已失效。"); booking.requestedDate = date(p.requestedDate); booking.requestedPeriod = num(p.requestedPeriod, "申请节次", 1, true); booking.groups = context.item.mode === "分组" ? num(p.groups, "分组数", 1, true) : null; booking.studentCount = context.klass.students; booking.requestedResources = requestRows(p.requestedResources ?? booking.requestedResources ?? []); booking.note = optional(p.note, "备注", 100); validateBookingRequest(booking, context, booking.id); booking.state = "待安排"; find(db, "teachingTasks", booking.taskId).state = "待安排"; log("bookings", booking, "修改后重新提交"); }
    else if (command === "booking.summary") {
      permit(["admin", "teacher"]); const arrangement = get("arrangements", p.id); state(arrangement, ["已安排"]); const booking = find(db, "bookings", arrangement.bookingId), task = find(db, "teachingTasks", booking.taskId); must(actor.role !== "teacher" || booking.teacherId === actor.id, "只能登记本人实验总结。"); must(!db.summaries.some(summary => summary.arrangementId === arrangement.id), "该实验安排已提交总结。"); (arrangement.resources || []).filter(resource => db.inventory.some(stock => stock.id === resource.ref)).forEach(resource => { must(netIssued(arrangement.id, resource.ref) >= resource.qty, "安排中的耗材须先完成关联领用并记账，才能提交总结。"); }); const actualDate = date(p.actualDate || arrangement.scheduledDate); must(actualDate >= arrangement.scheduledDate && actualDate <= TODAY, "实际完成日期不能早于安排日期或晚于统计日期。"); const summary = { id: id("SYZJ"), school: booking.school, arrangementId: arrangement.id, actualDate, effect: text(p.effect, "实验效果"), improvement: optional(p.improvement, "改进意见", 500), equipmentCondition: text(p.equipmentCondition, "仪器完好情况"), note: optional(p.note, "备注", 500), submittedBy: actor.id, submittedAt: now };
      [["OVERVIEW", p.overviewImages || [], 2, "实验全景图"], ["STUDENT", p.studentImages || [], 3, "学生实验图"]].forEach(([type, files, max, label]) => { must(Array.isArray(files) && files.length <= max, `${label}最多${max}张。`); files.forEach(file => { const name = text(file.name, "图片文件名", 120), dataUrl = String(file.dataUrl || ""); must(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(dataUrl) && dataUrl.length <= 300000, `${label}格式或大小不符合要求。`); db.archives.push({ id: id("FILE"), school: booking.school, name, category: "实验教学", relatedTable: "summaries", relatedId: summary.id, attachmentType: type, date: actualDate, uploader: actor.name, state: "已归档", mime: file.mime || "image/jpeg", dataUrl, content: "" }); }); });
      db.summaries.unshift(summary); arrangement.state = "已完成"; arrangement.completedAt = actualDate; booking.state = "已完成"; task.state = "已完成"; log("bookings", booking, "实验已完成", summary.id); log("arrangements", arrangement, "提交实验总结并完成", summary.id); log("teachingTasks", task, "完成班级实验任务", summary.id); log("summaries", summary, "提交实验总结");
    }
    else if (command === "booking.cancel") {
      permit(["admin", "teacher"]);
      const booking = get("bookings"), cancelReason = text(p.reason, "取消原因");
      state(booking, ["待安排", "已退回", "已安排"]);
      must(actor.role !== "teacher" || booking.teacherId === actor.id, "只能取消本人预约。");
      const arrangement = db.arrangements.find(row => row.bookingId === booking.id && row.state !== "已取消");
      if (arrangement) {
        state(arrangement, ["已安排"]);
        const cancelledFrom = arrangement.state;
        const issues = db.flows.filter(flow => flow.arrangementId === arrangement.id && flow.kind === "领用" && flow.state === "已记账");
        must(issues.every(issue => db.flows.filter(flow => flow.kind === "退回" && flow.sourceFlowId === issue.id && flow.itemId === issue.itemId && flow.state === "已记账").reduce((sum, flow) => sum + flow.qty, 0) >= issue.qty), "安排已有已记账耗材领用，请先按原领用单完成足量退回后再取消。");
        db.flows.filter(flow => flow.arrangementId === arrangement.id && flow.kind === "领用" && flow.state === "待复核").forEach(flow => {
          flow.state = "已撤销";
          flow.reviewer = actor.name;
          flow.reviewNote = `随实验安排取消：${cancelReason}`;
          log("flows", flow, "随实验安排取消，撤销待复核领用", cancelReason);
        });
        arrangement.state = "已取消";
        arrangement.cancelReason = cancelReason;
        arrangement.cancelledFrom = cancelledFrom;
        log("arrangements", arrangement, "取消实验安排并释放资源", cancelReason);
      }
      booking.cancelledFrom = booking.state;
      booking.cancelReason = cancelReason;
      booking.state = "已取消";
      find(db, "teachingTasks", booking.taskId).state = "已取消";
      log("bookings", booking, arrangement ? "取消实验安排" : "取消预约", cancelReason);
    }
    else if (command === "task.create") { permit(["district"]); const room = find(db, "rooms", p.roomId); add("tasks", { id: id("JCJH"), school: room.school, roomId: room.id, kind: text(p.kind, "检查类型"), due: date(p.due), owner: text(p.owner, "责任人"), state: "待检查" }, "下发检查任务"); }
    else if (command === "check.create") { permit(["admin"]); const task = p.taskId ? get("tasks", p.taskId) : null; if (task) state(task, ["待检查"]); const room = get("rooms", task?.roomId || p.roomId), outcome = choice(p.result, ["正常", "发现隐患"], "检查结果"), row = { id: id("JC"), school: room.school, roomId: room.id, taskId: task?.id || "", kind: task?.kind || text(p.kind, "类型"), date: date(p.date), inspector: actor.name, items: text(p.items, "检查项目"), result: outcome, note: optional(p.note, "检查说明", 500) }; add("checks", row, "提交检查记录"); if (task) { task.state = outcome === "正常" ? "已完成" : "待整改"; task.checkId = row.id; log("tasks", task, task.state, row.id); } if (outcome === "发现隐患") { const due = date(p.due); must(due >= row.date, "整改期限不能早于检查日期。"); add("hazards", { id: id("YH"), school: room.school, checkId: row.id, roomId: room.id, title: text(p.title, "隐患描述"), owner: text(p.owner, "责任人"), level: choice(p.level, ["一般关注", "需优先处理"], "优先级"), due, date: row.date, state: "待整改", note: row.note }, "检查发现隐患"); } }
    else if (command === "hazard.submit") { permit(["admin"]); const row = get("hazards"); state(row, ["待整改", "整改中"]); row.rectification = text(p.reason, "整改说明"); const file = get("archives", p.attachmentId); must(file.relatedTable === "hazards" && file.relatedId === row.id, "请选择关联当前隐患的整改附件。"); row.attachmentId = file.id; row.state = "待复查"; log("hazards", row, "提交整改复查", row.rectification); }
    else if (command === "hazard.verify") { permit(["district"]); const row = get("hazards"); state(row, ["待复查"]); row.review = text(p.reason, "复查意见"); row.reviewer = actor.name; row.state = p.approve === true ? "已关闭" : "整改中"; if (row.state === "已关闭") { const check = find(db, "checks", row.checkId); if (check.taskId && !db.hazards.some(h => h.checkId === check.id && h.id !== row.id && h.state !== "已关闭")) { const task = find(db, "tasks", check.taskId); task.state = "已完成"; log("tasks", task, "整改复查完成"); } } log("hazards", row, row.state, row.review); }
    else if (command === "archive.create") { permit(["admin", "teacher"]); const table = choice(p.relatedTable, ["assets", "purchases", "repairs", "plans", "bookings", "arrangements", "summaries", "checks", "hazards", "staff", "receipts"], "关联业务"), linked = get(table, p.relatedId); if (actor.role === "teacher") { const canSeePlan = table === "plans" && (linked.createdBy === actor.id || db.teachingTasks.some(task => task.teacherId === actor.id && find(db, "planItems", task.planItemId).planId === linked.id)), allowed = table === "staff" && linked.id === actor.id || linked.teacherId === actor.id || linked.reporter === actor.name || canSeePlan || table === "arrangements" && find(db, "bookings", linked.bookingId).teacherId === actor.id || table === "summaries" && find(db, "bookings", find(db, "arrangements", linked.arrangementId).bookingId).teacherId === actor.id; must(allowed, "教师只能上传本人业务资料。"); } const name = text(p.name, "文件名"); must(!/\.(html?|svg|js|exe|sh)$/i.test(name), "不接受可执行文件、HTML或SVG附件。"); const content = String(p.content || ""), dataUrl = String(p.dataUrl || ""); must(content || /^data:[\w.+/-]+;base64,[A-Za-z0-9+/=]+$/.test(dataUrl), "请上传文件或填写文本内容。"); must(content.length + dataUrl.length <= 750000, "单个附件限512KB左右。"); add("archives", { id: id("FILE"), school: actor.school, name, category: choice(p.category, ["实验教学", "安全管理", "人员档案", "设备建设"], "资料分类"), relatedTable: table, relatedId: linked.id, attachmentType: p.attachmentType || "OTHER", date: TODAY, uploader: actor.name, state: p.archive === true ? "已归档" : "待归档", mime: String(p.mime || "text/plain;charset=utf-8"), content, dataUrl }, "上传业务资料"); }
    else if (command === "archive.confirm") { permit(["admin"]); const row = get("archives"); state(row, ["待归档"]); row.state = "已归档"; log("archives", row, "确认归档"); }
    else if (command === "teacher.assignments.save") {
      permit(["admin"]);
      const teacher = get("staff", p.teacherId), term = find(db, "terms", p.term);
      must(teacher.role === "teacher" && teacher.enabled, "请选择启用的任课教师。");
      must(Array.isArray(p.rows) && p.rows.length > 0 && p.rows.length <= 30, "请至少设置一个任课班级，最多30个。");
      const submitted = new Set();
      p.rows.forEach(raw => {
        const klass = sameSchool("classes", raw.classId, teacher.school), subject = choice(raw.subject, subjects, "学科"), primary = raw.primary !== false, nextState = choice(raw.state || "有效", ["有效", "停用"], "状态"), row = raw.id ? sameSchool("assignments", raw.id, teacher.school) : { id: id("AS"), school: teacher.school }, tasks = raw.id ? db.teachingTasks.filter(task => task.assignmentId === row.id) : [];
        must(!raw.id || row.teacherId === teacher.id && row.term === term.id, "只能维护该教师当前学期的任课班级。");
        must(teacher.subject === subject || teacher.subject === "综合", "任课学科须与教师专业学科一致；综合教师可跨学科任教。");
        if (tasks.length) must(term.id === row.term && klass.id === row.classId && subject === row.subject && teacher.id === row.teacherId && primary === row.primary, "该任课班级已生成实验任务，请新建设置，不要改班级、学科、教师或主教师属性。");
        if (nextState === "停用") { must(!tasks.some(task => ["待安排", "待修改"].includes(task.state)), "该任课班级仍有在途实验任务，不能停用。"); tasks.filter(task => ["待预约", "已取消"].includes(task.state)).forEach(task => { task.state = "已失效"; }); }
        const key = `${term.id}|${klass.id}|${subject}|${teacher.id}`;
        must(!submitted.has(key), "本次设置中不能重复选择同一班级和学科。");
        must(!db.assignments.some(a => a.id !== row.id && a.term === term.id && a.classId === klass.id && a.subject === subject && a.teacherId === teacher.id && a.state === "有效"), "该教师已经设置了此班级和学科。");
        if (primary && nextState === "有效") must(!db.assignments.some(a => a.id !== row.id && a.term === term.id && a.classId === klass.id && a.subject === subject && a.primary && a.state === "有效"), "同一学期、班级和学科只能有一个主教师。");
        row.name = `${klass.name} · ${subject} · ${teacher.name}`; row.term = term.id; row.classId = klass.id; row.subject = subject; row.teacherId = teacher.id; row.primary = primary; row.state = nextState;
        submitted.add(key);
        raw.id ? log("assignments", row, "更新任课班级") : add("assignments", row, "新增任课班级");
      });
      syncTeachingTasks(db);
      result = { id: teacher.id, teacherId: teacher.id, term: term.id, assignments: db.assignments.filter(row => row.teacherId === teacher.id && row.term === term.id) };
    }
    else if (command === "base.save") {
      const table = choice(p.table, ["schools", "departments", "staff", "rooms", "classes", "assignments", "terms", "periods"], "基础数据"); permit(["district", "admin"]); if (["schools", "terms"].includes(table)) permit(["district"]); const row = p.id ? get(table) : { id: id(table.toUpperCase()) }, school = ["departments", "staff", "rooms", "classes", "assignments", "periods"].includes(table) ? row.school || (actor.role === "district" ? text(p.school, "学校") : actor.school) : ""; if (school) { find(db, "schools", school); row.school = school; }
      if (table === "schools") { row.name = text(p.name, "学校名称"); row.code = text(p.code, "学校代码"); must(!db.schools.some(s => s.id !== row.id && s.code === row.code), "学校代码已存在。"); row.stage = text(p.stage, "学段"); delete row.street; }
      if (table === "departments") { row.name = text(p.name, "部门名称"); row.state = choice(p.state || "启用", ["启用", "停用"], "状态"); must(!db.departments.some(d => d.id !== row.id && d.school === school && d.name === row.name), "同校部门名称已存在。"); }
      if (table === "terms") { const start = date(p.start), end = date(p.end), used = p.id && db.plans.some(plan => plan.term === row.id); if (used) must(start === row.start && end === row.end, "学期已被计划引用，不能修改起止日期。"); row.name = text(p.name, "学期名称"); row.start = start; row.end = end; must(row.end > row.start, "学期结束须晚于开始日期。"); }
      if (table === "staff") { const previous = p.id ? find(original, "staff", p.id) : null, assignmentRefs = p.id ? db.assignments.filter(a => a.teacherId === row.id) : [], hasTaskRefs = p.id && db.teachingTasks.some(task => task.teacherId === row.id); row.name = text(p.name, "姓名"); row.role = choice(p.role, ["admin", "teacher"], "角色"); row.subject = text(p.subject, "专业或任教学科"); row.title = text(p.title, "岗位职称"); row.phone = optional(p.phone, "手机号码", 30); row.qualification = optional(p.qualification, "资质说明", 200); row.sex = choice(p.sex || "", ["", "男", "女"], "性别"); row.departmentId = p.departmentId ? sameSchool("departments", p.departmentId, school).id : ""; row.enabled = p.enabled !== false; must(row.id !== actor.id || row.enabled && row.role === actor.role, "不能停用或变更当前操作账号身份。"); if (previous && (assignmentRefs.length || hasTaskRefs)) must(row.role === previous.role && row.subject === previous.subject, "该人员已被任课关系或实验任务引用，不能变更角色或学科。"); const activeAssignments = assignmentRefs.filter(a => a.state === "有效"); must(activeAssignments.every(a => row.enabled && row.role === "teacher" && (row.subject === a.subject || row.subject === "综合")), "该人员仍有与账号状态、角色或学科不兼容的有效任课关系。"); }
      if (table === "rooms") { const type = choice(p.type, ["教学实验室", "准备室", "仪器室", "普通教室", "其他"], "类型"), subject = p.subject ? choice(p.subject, subjects, "学科") : "", seats = optionalNum(p.seats, "座位数", 1, true), nextState = choice(p.state || row.state || "可用", ["可用", "停用"], "状态"), hazardStorage = p.hazardStorage === true, activeUse = p.id && db.arrangements.some(arrangement => arrangement.roomId === row.id && activeArrangement(arrangement)), stored = p.id && (db.assets.some(asset => asset.roomId === row.id) || db.inventory.some(stock => stock.roomId === row.id)), storedHazard = p.id && db.inventory.some(stock => stock.roomId === row.id && isHazard(itemOf(db, stock))); must(!["教学实验室", "准备室", "仪器室"].includes(type) || subject, "教学实验室、准备室和仪器室须选择学科。"); if (activeUse) { must(type === row.type && subject === row.subject && seats === row.seats, "房间有有效实验安排，不能修改类型、学科或座位数。"); must(nextState === "可用", "房间有有效实验安排，不能停用。"); } if (stored) must(subject === row.subject, "房间已存放物品，不能直接修改学科。"); if (storedHazard) must(hazardStorage, "房间仍存放危化品，不能取消危化品存放条件。"); row.name = text(p.name, "名称"); row.roomNo = text(p.roomNo, "房间号", 60); row.type = type; row.subject = subject; row.area = optionalNum(p.area, "实际使用面积", .01); row.seats = seats; row.builder = optional(p.builder, "建造商"); row.builtAt = p.builtAt ? date(p.builtAt) : ""; row.stage = optional(p.stage || find(db, "schools", school).stage, "所属学段", 60); row.features = optional(p.features, "设施功能", 500); row.hazardStorage = hazardStorage; row.note = optional(p.note, "备注", 60); row.state = nextState; must(!db.rooms.some(room => room.id !== row.id && room.school === school && room.roomNo === row.roomNo), "同校房间号已存在。"); }
      if (table === "classes") { const grade = text(p.grade, "年级"), students = num(p.students, "班级人数", 1, true), nextState = choice(p.state || "在读", ["在读", "停用"], "状态"), tasks = p.id ? db.teachingTasks.filter(task => task.classId === row.id) : []; if (tasks.length) must(grade === row.grade, "班级已生成实验任务，不能修改年级。"); if (nextState === "停用") { must(!tasks.some(task => ["待安排", "待修改"].includes(task.state)), "班级仍有在途实验任务，不能停用。"); tasks.filter(task => ["待预约", "已取消"].includes(task.state)).forEach(task => { task.state = "已失效"; }); } row.name = text(p.name, "班级名称"); must(!db.classes.some(klass => klass.id !== row.id && klass.school === school && klass.name === row.name), "同校班级名称已存在。"); row.grade = grade; row.students = students; row.state = nextState; }
      if (table === "assignments") { const term = find(db, "terms", p.term), klass = sameSchool("classes", p.classId, school), teacher = sameSchool("staff", p.teacherId, school), subject = choice(p.subject, subjects, "学科"), primary = p.primary !== false, nextState = choice(p.state || "有效", ["有效", "停用"], "状态"), tasks = p.id ? db.teachingTasks.filter(task => task.assignmentId === row.id) : []; must(teacher.enabled && teacher.role === "teacher", "请选择启用的任课教师。"); must(teacher.subject === subject || teacher.subject === "综合", "任课学科须与教师专业学科一致；综合教师可跨学科任教。"); if (tasks.length) must(term.id === row.term && klass.id === row.classId && subject === row.subject && teacher.id === row.teacherId && primary === row.primary, "任课关系已生成实验任务，请新建关系，不要改班级、学科、教师或主教师属性。"); if (nextState === "停用") { must(!tasks.some(task => ["待安排", "待修改"].includes(task.state)), "任课关系仍有在途实验任务，不能停用。"); tasks.filter(task => ["待预约", "已取消"].includes(task.state)).forEach(task => { task.state = "已失效"; }); } row.name = `${klass.name} · ${subject} · ${teacher.name}`; row.term = term.id; row.classId = klass.id; row.subject = subject; row.teacherId = teacher.id; row.primary = primary; row.state = nextState; must(!db.assignments.some(a => a.id !== row.id && a.term === row.term && a.classId === row.classId && a.subject === row.subject && a.teacherId === row.teacherId && a.state === "有效"), "该任课关系已存在。"); if (row.primary && row.state === "有效") must(!db.assignments.some(a => a.id !== row.id && a.term === row.term && a.classId === row.classId && a.subject === row.subject && a.primary && a.state === "有效"), "同一学期、班级和学科只能有一个主教师。"); }
      if (table === "periods") { const term = find(db, "terms", p.term || row.term || db.terms.find(item => item.start <= TODAY && TODAY <= item.end)?.id || db.terms[0]?.id), referenceTerm = row.term || term.id, number = num(p.number, "节次", 1, true), start = text(p.start, "开始时间"), end = text(p.end, "结束时间"), nextState = choice(p.state || "启用", ["启用", "停用"], "状态"), bookingUses = booking => booking.school === school && find(db, "teachingTasks", booking.taskId).term === referenceTerm && Number(booking.requestedPeriod) === row.number, arrangementUses = arrangement => { const booking = find(db, "bookings", arrangement.bookingId); return arrangement.school === school && find(db, "teachingTasks", booking.taskId).term === referenceTerm && Number(arrangement.startPeriod) <= row.number && row.number <= Number(arrangement.endPeriod); }, used = p.id && (db.bookings.some(bookingUses) || db.arrangements.some(arrangementUses)); if (used) must(term.id === row.term && number === row.number && start === row.start && end === row.end && nextState === row.state, "节次已被预约或安排引用，不能修改学期、编号、时间或状态。"); row.name = text(p.name || `第${number}节`, "节次名称"); row.term = term.id; row.number = number; row.start = start; row.end = end; must(/^([01]\d|2[0-3]):[0-5]\d$/.test(row.start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(row.end) && row.start < row.end, "节次时间无效。"); row.state = nextState; const peers = db.periods.filter(period => period.id !== row.id && period.school === school && period.term === row.term); must(!peers.some(period => period.number === row.number), "同校同学期节次编号已存在。"); must(!peers.some(period => row.start < period.end && period.start < row.end), "同校同学期节次时间不能重叠。"); }
      p.id ? log(table, row, "更新基础档案") : add(table, row, "新增基础档案"); if ((table === "assignments" && row.state === "有效") || (table === "classes" && row.state === "在读")) syncTeachingTasks(db);
    }
    else if (command === "settings.save") { permit(["district"]); db.settings = { region: text(p.region, "区域"), authority: text(p.authority, "主管单位"), repairDays: num(p.repairDays, "提醒天数", 1, true), lowStock: p.lowStock === true, weeklyReport: p.weeklyReport === true, syncReminder: p.syncReminder === true, exportEnabled: p.exportEnabled === true }; log("settings", { id: "SETTINGS", school: "" }, "保存平台设置"); }
    else if (command === "submission.create") { permit(["admin"]); find(db, "terms", p.term); add("submissions", { id: id("SB"), school: actor.school, term: p.term, date: TODAY, at: now, operator: actor.name, revision: original.revision, summary: metrics(db, actor.school, p.term), state: "已上报" }, "上报当前台账快照"); }
    else throw new Error("不支持的业务操作。");
    db.revision++; db.updatedAt = now; return { db, result };
  }

  function parseCSV(source) {
    const rows = []; let row = [], cell = "", quoted = false; const input = String(source).replace(/^\uFEFF/, "");
    for (let index = 0; index < input.length; index++) { const char = input[index]; if (char === '"') { if (quoted && input[index + 1] === '"') { cell += '"'; index++; } else quoted = !quoted; } else if (char === "," && !quoted) { row.push(cell.trim()); cell = ""; } else if ((char === "\n" || char === "\r") && !quoted) { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; if (char === "\r" && input[index + 1] === "\n") index++; } else cell += char; }
    must(!quoted, "CSV引号未闭合。"); row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); return rows;
  }
  const importHeader = ["分类编号", "物品名称", "规格型号", "分类", "单位", "管理方式", "需要周期维保", "数量", "单价（元）", "存放位置（房间）", "下次维保日期", "有效期"];
  const importTrackingModes = { "单件设备": "SERIALIZED", "数量库存": "QUANTITY", SERIALIZED: "SERIALIZED", QUANTITY: "QUANTITY" };
  const importBoolean = value => ["是", "true", "TRUE", "1"].includes(String(value).trim()) ? true : ["否", "false", "FALSE", "0"].includes(String(value).trim()) ? false : null;
  function validateImport(source, db = null, school = "") {
    const rows = parseCSV(source), errors = [];
    must(rows.length > 1 && rows.length <= 31, "模板需包含表头和1至30行数据。");
    must(rows[0].length === importHeader.length && importHeader.every((label, index) => rows[0][index] === label), `模板表头应为：${importHeader.join("、")}。`);
    const items = rows.slice(1).map((row, index) => {
      const [classificationCode = "", name = "", spec = "", category = "", unit = "", trackingModeValue = "", maintenanceValue = "", qty, price, roomNo = "", nextMaintenance = "", expiry = ""] = row;
      const trackingMode = importTrackingModes[String(trackingModeValue).trim()] || String(trackingModeValue).trim(), maintenanceRequired = importBoolean(maintenanceValue), validMaintenance = maintenanceRequired !== null;
      const direct = { classificationCode: classificationCode.trim(), name: name.trim(), spec: spec.trim(), category: category.trim(), unit: unit.trim(), trackingMode, maintenanceRequired: validMaintenance ? maintenanceRequired : false },
        existing = db ? itemById(db, direct.classificationCode) : null, item = itemRecord(db, { ...direct, itemId: existing?.itemId || direct.classificationCode }),
        basicInvalid = row.length !== importHeader.length || !direct.classificationCode || !direct.name || !direct.spec || !categories.includes(direct.category) || !direct.unit || !["SERIALIZED", "QUANTITY"].includes(trackingMode) || !validMaintenance || !Number.isInteger(Number(qty)) || Number(qty) <= 0 || price === "" || !Number.isFinite(Number(price)) || Number(price) < 0 || nextMaintenance && !/^\d{4}-\d{2}-\d{2}$/.test(nextMaintenance) || expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry);
      if (basicInvalid) errors.push(`第${index + 2}行：检查分类编号、物品名称、规格型号、分类、单位、管理方式、维保要求、数量、单价、存放位置、维保日期及有效期。`);
      if (item.maintenanceRequired && item.trackingMode !== "SERIALIZED") errors.push(`第${index + 2}行：周期维保只适用于单件编号设备。`);
      if (["耗材", "危化品"].includes(item.category) && item.trackingMode !== "QUANTITY") errors.push(`第${index + 2}行：耗材和危化品须按数量库存管理。`);
      const room = roomNo && db ? db.rooms.find(r => r.school === school && r.roomNo === roomNo) : null;
      if (roomNo && db && !room) errors.push(`第${index + 2}行：房间编号不属于当前学校。`);
      if (room && room.state !== "可用") errors.push(`第${index + 2}行：存放房间已停用。`);
      if (room && !roomFitsItem(room, item)) errors.push(`第${index + 2}行：物品与${room.subject && item.category?.endsWith("仪器") && item.category !== `${room.subject}仪器` ? "存放房间学科" : "存放条件"}不一致。`);
      if (nextMaintenance && (!item.maintenanceRequired || item.trackingMode !== "SERIALIZED")) errors.push(`第${index + 2}行：该物品不需要维保日期。`);
      if (expiry && item.trackingMode !== "QUANTITY") errors.push(`第${index + 2}行：单件编号物品不登记有效期。`);
      if (isHazard(item) && (!expiry || expiry < TODAY)) errors.push(`第${index + 2}行：危化品须登记未过期的有效期。`);
      return { itemId: item.itemId || direct.classificationCode, classificationCode: direct.classificationCode, name: direct.name, spec: direct.spec, category: direct.category, unit: direct.unit, trackingMode: item.trackingMode, maintenanceRequired: item.maintenanceRequired, qty: Number(qty), price: Number(price), roomId: room?.id || "", roomNo, nextMaintenance, expiry };
    });
    if (items.reduce((sum, row) => sum + row.qty, 0) > 100) errors.push("单次入库最多100件。");
    return { items, errors };
 }
 function csv(rows) { return "\uFEFF" + rows.map(row => row.map(value => { let s = String(value ?? ""); if (/^[\s]*[=+@-]/.test(s)) s = "'" + s; return `"${s.replaceAll('"', '""')}"`; }).join(",")).join("\r\n"); }

  function migrate(raw) {
    if (!raw || typeof raw !== "object") throw new Error("数据格式不匹配");
    const normalizeRequestedResources = (db, resources = []) => { const grouped = new Map(); resources.forEach(resource => { const record = db.assets?.find(row => row.id === resource.ref) || db.inventory?.find(row => row.id === resource.ref), item = itemRecord(db, resource.itemId ? resource : record || resource), itemId = item.itemId || resource.itemId || resource.classificationCode; if (!itemId) return; const previous = grouped.get(itemId) || { ...item, qty: 0 }; previous.qty += Number(resource.qty || 0); grouped.set(itemId, previous); }); return [...grouped.values()].filter(row => row.qty > 0); };
    const inlineCatalog = db => {
      const catalog = db.catalog || [];
      (db.plans || []).forEach(plan => {
        const first = (db.planItems || []).find(item => item.planId === plan.id), experiment = first ? catalog.find(row => row.id === first.catalogId) : null;
        plan.grade ||= first?.grade || experiment?.grade || "";
        plan.version ||= first?.version || experiment?.version || "";
      });
      (db.planItems || []).forEach(item => {
        const plan = (db.plans || []).find(row => row.id === item.planId), experiment = catalog.find(row => row.id === item.catalogId) || {};
        item.subject ||= plan?.subject || experiment.subject || "";
        item.grade ||= plan?.grade || experiment.grade || "";
        item.version ||= plan?.version || experiment.version || "";
        item.experimentName ||= experiment.name || item.name || "";
        item.chapter ||= experiment.chapter || "";
        item.equipment ||= experiment.equipment || "";
        item.periods ||= experiment.periods || 1;
        item.required ||= experiment.required || "必做";
        delete item.catalogId;
        delete item.name;
      });
      delete db.catalog;
    };
    const inlineItemData = db => {
      const catalog = db.itemCatalog || [], resolve = record => catalog.find(item => item.id === record?.itemId || item.classificationCode === record?.classificationCode) || itemById(db, record?.itemId) || record || {};
      const fields = (record, source = resolve(record)) => {
        const item = { itemId: record.itemId || source.itemId || source.id || record.classificationCode || source.classificationCode || "", classificationCode: record.classificationCode || source.classificationCode || "", name: record.name || source.name || "", spec: record.spec || record.model || source.spec || source.model || "", category: record.category || source.category || (record.hazard ? "危化品" : record.stock == null ? "物理仪器" : "耗材"), unit: record.unit || source.unit || "件", trackingMode: record.trackingMode || source.trackingMode || (record.stock == null ? "SERIALIZED" : "QUANTITY"), maintenanceRequired: record.maintenanceRequired ?? source.maintenanceRequired ?? record.stock == null };
        return item;
      };
      (db.assets || []).forEach(asset => Object.assign(asset, fields(asset)));
      (db.inventory || []).forEach(stock => Object.assign(stock, fields(stock)));
      ["purchases", "receipts"].forEach(table => (db[table] || []).forEach(document => (document.items || []).forEach(line => { const item = fields(line); Object.assign(line, item, { model: item.spec }); })));
      (db.flows || []).forEach(flow => { if (flow.snapshot) Object.assign(flow.snapshot, fields(flow.snapshot)); });
      (db.bookings || []).forEach(booking => { booking.requestedResources = (booking.requestedResources || []).map(resource => ({ ...resource, ...fields(resource), qty: resource.qty })); });
      (db.assets || []).forEach(asset => { if (asset.state === "借出") asset.state = "正常使用"; });
      delete db.itemCatalog;
      delete db.moves;
      delete db.loans;
    };
    const removeCountData = db => {
      delete db.counts;
      (db.assets || []).forEach(row => { delete row.countLockId; });
      (db.inventory || []).forEach(row => { delete row.countLockId; });
      (db.repairs || []).forEach(row => { delete row.countId; });
    };
    if ([VERSION, 8, 7, 6, 5, 4, 3].includes(raw.version)) {
      const current = clone(raw), fallbackTerm = current.terms?.find(term => term.start <= TODAY && TODAY <= term.end)?.id || current.terms?.[0]?.id;
      delete current.roomAssignments;
      current.version = VERSION;
      current.deletedTaskKeys ||= [];
      normalizeMergedRoles(current);
      normalizeExecutionStates(current);
      inlineCatalog(current);
      inlineItemData(current);
      removeCountData(current);
      normalizeAssetCodes(current);
      if (current.periods?.some(period => !period.term)) { const aware = current.periods.filter(period => period.term); current.periods.filter(period => !period.term).forEach(period => (current.terms || [{ id: fallbackTerm }]).forEach(term => { if (!aware.some(row => row.school === period.school && row.term === term.id && row.number === period.number)) aware.push({ ...period, id: term.id === fallbackTerm ? period.id : `${period.id}-${term.id}`, term: term.id }); })); current.periods = aware; }
      (current.schools || []).forEach(school => { delete school.street; });
      (current.rooms || []).forEach(room => { if (!Object.hasOwn(room, "hazardStorage")) room.hazardStorage = room.subject === "化学"; });
      (current.inventory || []).forEach(stock => { delete stock.opening; delete stock.lastRejectedReceiptId; });
      (current.flows || []).forEach(flow => { if (flow.kind !== "退回") delete flow.sourceFlowId; });
      (current.plans || []).forEach(plan => { delete plan.revisionNo; });
      (current.planItems || []).forEach(item => { delete item.sortNo; });
      (current.bookings || []).forEach(booking => { booking.requestedResources = normalizeRequestedResources(current, booking.requestedResources); });
      removeTrainingData(current);
      return current;
    }
    if (raw.version !== 2) throw new Error("仅支持从v2/v3/v4/v5/v6/v7/v8升级到当前版本");
    const source = clone(raw), db = clone(raw); db.version = VERSION; db.seq = Math.max(Number(db.seq) || 0, 500); db.deletedTaskKeys ||= []; Object.keys(tableNames).forEach(table => { db[table] ||= []; });
    normalizeMergedRoles(db);
    db.schools.forEach(school => { delete school.street; });
    db.rooms = (source.labs || []).map(lab => ({ id: lab.id, school: lab.school, name: lab.name, roomNo: lab.room || lab.name, type: lab.type || "教学实验室", subject: lab.subject || "", area: lab.area ?? null, seats: lab.seats ?? null, builder: lab.builder || "", builtAt: lab.builtAt || "", stage: lab.stage || find(db, "schools", lab.school).stage, features: lab.features || "", hazardStorage: lab.subject === "化学", note: lab.note || "", state: lab.state === "维护中" ? "停用" : "可用", legacyId: lab.id }));
    delete db.roomAssignments; db.departments = [];
    db.schools.forEach(school => { const department = { id: `MIG-D-${school.id}`, school: school.id, name: "实验中心", state: "启用" }; db.departments.push(department); db.staff.filter(person => person.school === school.id).forEach(person => { person.departmentId = department.id; delete person.department; }); });
    db.periods = []; const fallbackTerm = db.terms.find(term => term.start <= TODAY && TODAY <= term.end)?.id || db.terms[0]?.id; db.schools.forEach(school => db.terms.forEach(term => defaultPeriods.forEach(([number, start, end]) => db.periods.push({ id: term.id === fallbackTerm ? `${school.id}-K${number}` : `${school.id}-${term.id}-K${number}`, school: school.id, term: term.id, number, name: `第${number}节`, start, end, state: "启用" }))));
    db.itemCatalog = [];
    function masterFor(record) { const classificationCode = record.classificationCode || `MIG-${String(record.name || "物品").replace(/\s+/g, "-")}-${String(record.model || record.spec || "默认").replace(/\s+/g, "-")}`; let item = db.itemCatalog.find(row => row.classificationCode === classificationCode && row.name === record.name && row.spec === (record.model || record.spec)); if (!item) { item = { id: `MIG-IT-${++db.seq}`, classificationCode, name: record.name, spec: record.model || record.spec || "未登记", category: record.category || (record.hazard ? "危化品" : "耗材"), unit: record.unit || "件", trackingMode: record.stock == null ? "SERIALIZED" : "QUANTITY", maintenanceRequired: record.stock == null, state: "启用", legacy: true }; db.itemCatalog.push(item); } return item; }
    db.assets = (source.assets || []).map(asset => { const master = masterFor(asset), copy = { ...asset, itemId: master.id, roomId: asset.labId || "", legacyId: asset.id }; ["name", "model", "category", "unit", "classificationCode", "labId", "location"].forEach(key => delete copy[key]); return copy; });
    db.inventory = (source.inventory || []).map(stock => { const master = masterFor(stock), copy = { ...stock, itemId: master.id, roomId: stock.labId || "", state: stock.labId ? "在库" : "待分配", legacyId: stock.id }; ["name", "spec", "unit", "classificationCode", "hazard", "opening", "labId", "location", "unitPrice"].forEach(key => delete copy[key]); return copy; });
    ["purchases", "receipts"].forEach(table => (db[table] || []).forEach(document => { document.items = (document.items || []).map(line => { const master = masterFor(line); return { ...line, itemId: master.id, classificationCode: master.classificationCode, name: master.name, model: master.spec, category: master.category, unit: master.unit, roomId: line.labId || document.labId || "", nextMaintenance: master.trackingMode === "SERIALIZED" && master.maintenanceRequired ? document.nextMaintenance || "" : "" }; }); delete document.labId; delete document.nextMaintenance; }));
    ["checks", "hazards", "tasks"].forEach(table => (db[table] || []).forEach(row => { row.roomId = row.labId || ""; delete row.labId; }));
    db.assignments = []; const assignmentMap = new Map();
    function ensureAssignment(school, term, classId, subject, teacherId) { const key = `${term}|${classId}|${subject}|${teacherId}`; if (!assignmentMap.has(key)) { const row = { id: `MIG-AS-${++db.seq}`, school, term, classId, subject, teacherId, primary: !db.assignments.some(a => a.term === term && a.classId === classId && a.subject === subject && a.primary), state: "有效", legacy: true }; db.assignments.push(row); assignmentMap.set(key, row); } return assignmentMap.get(key); }
    (source.plans || []).forEach(plan => { const experiment = find(db, "catalog", plan.catalogId); ensureAssignment(plan.school, plan.term, plan.classId, experiment.subject, plan.teacherId); }); (source.classes || []).forEach(klass => (klass.teacherIds || []).forEach(teacherId => { const teacher = db.staff.find(person => person.id === teacherId); if (teacher?.role === "teacher") ensureAssignment(klass.school, "TERM26", klass.id, teacher.subject, teacher.id); })); db.classes = (source.classes || []).map(klass => { const copy = { ...klass, state: "在读", legacyId: klass.id }; delete copy.teacherIds; return copy; });
    db.plans = []; db.planItems = []; db.teachingTasks = []; const oldPlanMap = new Map(), groups = new Map();
    (source.plans || []).forEach(old => { const experiment = find(db, "catalog", old.catalogId), key = `${old.school}|${old.term}|${experiment.subject}`; let plan = groups.get(key); if (!plan) { plan = { id: `MIG-P-${++db.seq}`, school: old.school, term: old.term, subject: experiment.subject, name: old.name || `${experiment.subject}实验计划`, state: "已发布", createdBy: old.teacherId, createdAt: db.updatedAt, publishedAt: db.updatedAt, legacy: true }; db.plans.push(plan); groups.set(key, plan); } let item = db.planItems.find(row => row.planId === plan.id && row.catalogId === old.catalogId && row.mode === old.mode && row.plannedDate === old.date); if (!item) { item = { id: `MIG-PI-${++db.seq}`, school: old.school, planId: plan.id, catalogId: old.catalogId, scheduleType: "DATE", plannedWeek: null, plannedDate: old.date, mode: old.mode || experiment.mode, legacy: true }; db.planItems.push(item); } const assignment = ensureAssignment(old.school, old.term, old.classId, experiment.subject, old.teacherId); let task = db.teachingTasks.find(row => row.planItemId === item.id && row.assignmentId === assignment.id); if (!task) { task = { id: `MIG-TASK-${++db.seq}`, school: old.school, term: old.term, planItemId: item.id, assignmentId: assignment.id, classId: old.classId, teacherId: old.teacherId, state: old.state === "已完成" ? "已完成" : "待预约", legacyId: old.id }; db.teachingTasks.push(task); } oldPlanMap.set(old.id, { old, item, task }); }); syncTeachingTasks(db);
    inlineCatalog(db);
    inlineItemData(db);
    removeCountData(db);
    normalizeAssetCodes(db);
    db.bookings = []; db.arrangements = []; db.summaries = [];
    (source.bookings || []).forEach(old => { const mapped = oldPlanMap.get(old.planId); if (!mapped) return; const stateMap = { 待审批: "待安排", 已拒绝: "已拒绝", 已取消: "已取消", 已通过: "已安排", 已准备: "已安排", 已完成: "已完成" }, booking = { id: old.id, school: old.school, taskId: mapped.task.id, planItemId: mapped.item.id, assignmentId: mapped.task.assignmentId, classId: mapped.task.classId, teacherId: mapped.task.teacherId, studentCount: find(db, "classes", mapped.task.classId).students, applicant: old.applicant || find(db, "staff", mapped.task.teacherId).name, applicantId: old.applicantId || mapped.task.teacherId, submittedAt: old.bookedAt || db.updatedAt, requestedDate: old.date, requestedPeriod: old.period || 1, groups: old.groups || null, requestedResources: normalizeRequestedResources(db, old.resources || []), note: old.note || "", state: stateMap[old.state] || "待安排", cancelReason: old.cancelReason || "", legacyId: old.id }; db.bookings.push(booking); if (["已通过", "已准备", "已完成"].includes(old.state)) { const startPeriod = old.period || db.periods.find(p => p.school === old.school && p.term === mapped.task.term && p.start === old.start)?.number || 1, technician = old.managerId && db.staff.some(p => p.id === old.managerId && ["admin"].includes(p.role)) ? old.managerId : db.staff.find(person => person.school === old.school && person.role === "admin")?.id, legacyNotes = [old.decision, old.preparation && `历史准备记录：${old.preparation}`].filter(Boolean).join("；"), arrangement = { id: `MIG-AP-${++db.seq}`, school: old.school, bookingId: booking.id, venueType: "实验室", roomId: old.labId || "", venueText: "", scheduledDate: old.date, startPeriod, endPeriod: startPeriod, technicianId: technician, note: legacyNotes, resources: old.resources || [], state: old.state === "已完成" ? "已完成" : "已安排", arrangedBy: "MIGRATION", arrangedAt: db.updatedAt, legacyId: old.id }; db.arrangements.push(arrangement); mapped.task.state = arrangement.state; if (old.state === "已完成") { db.summaries.push({ id: `MIG-SUM-${++db.seq}`, school: old.school, arrangementId: arrangement.id, actualDate: old.actualDate || old.date, effect: old.summary || "历史完成记录", improvement: "", equipmentCondition: "历史记录未登记", note: "由v2完成登记迁移", submittedBy: mapped.task.teacherId, submittedAt: db.updatedAt, legacy: true }); mapped.task.state = "已完成"; } } });
    (db.flows || []).forEach(flow => { if (flow.planId && oldPlanMap.has(flow.planId)) flow.taskId = oldPlanMap.get(flow.planId).task.id; flow.arrangementId ||= ""; delete flow.planId; if (flow.kind !== "退回") delete flow.sourceFlowId; if (flow.snapshot?.labId) { flow.snapshot.roomId = flow.snapshot.labId; delete flow.snapshot.labId; delete flow.snapshot.location; } }); (db.archives || []).forEach(file => { if (file.relatedTable === "plans" && oldPlanMap.has(file.relatedId)) file.relatedId = oldPlanMap.get(file.relatedId).item.planId; }); delete db.labs;
    removeTrainingData(db);
    db.logs.push({ id: `MIGRATION-V9-${++db.seq}`, school: "", table: "settings", recordId: "DATA", action: "数据结构升级", actor: "系统", at: new Date().toISOString(), note: "v2升级为v9：移除历史人员培训信息；设备与耗材信息直接保存在业务台账，移除物品目录、调整和借还" }); return db;
  }

  const api = { KEY, VERSION, TODAY, roles, navigation, tableNames, categories, subjects, seed, clone, find, scoped, metrics, teaching, taskContext, experimentOf, itemOf, itemById, itemRecord, isHazard, itemFitsSubject, roomLabel, periodFor, syncTeachingTasks, actorFor, transact, ratio, weekOf, weekDate, parseCSV, validateImport, importHeader, csv, activeBooking, activeArrangement, migrate };
  if (typeof module !== "undefined") module.exports = api;
  if (root) { root.LabDemo = api; root.DEMO_DATA = { navigation }; }
})(typeof window === "undefined" ? null : window);
