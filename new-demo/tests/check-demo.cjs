"use strict";
// Run: node new-demo/tests/check-demo.cjs — standard library only; no browser data is changed.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const M = require("../assets/mock-data.js");

let checks = 0;
function test(name, fn) { fn(); checks++; console.log(`✓ ${name}`); }
function fixture(initial = M.seed()) {
  let db = M.clone(initial);
  const actor = (role, personId) => M.actorFor(db, role, "S1", personId);
  return {
    get db() { return db; },
    run(role, command, input, personId) {
      const out = M.transact(db, actor(role, personId), command, input, "2026-08-31T09:00:00+08:00");
      db = out.db;
      return out.result;
    },
    reject(role, command, input, regex, personId) {
      const before = JSON.stringify(db);
      assert.throws(() => M.transact(db, actor(role, personId), command, input, "2026-08-31T09:00:00+08:00"), regex);
      assert.equal(JSON.stringify(db), before, "failed operations must be atomic");
    }
  };
}
const get = (db, table, id) => M.find(db, table, id);
const physicalTask = (db, classId = "S1-C2", planItemId = "S1-P1-I1") => db.teachingTasks.find(task => task.school === "S1" && task.classId === classId && task.planItemId === planItemId);
const experimentFixtures = {
  E1: { experimentName: "测量物体的速度", chapter: "第一章 运动的描述", equipment: "轨道小车、计时器、刻度尺", periods: 1, required: "必做", mode: "分组" },
  E2: { experimentName: "配制一定物质的量浓度的溶液", chapter: "第一章 物质及其变化", equipment: "电子天平、容量瓶、烧杯", periods: 1, required: "必做", mode: "分组" },
  E3: { experimentName: "使用显微镜观察细胞", chapter: "第一章 走近细胞", equipment: "显微镜、载玻片、盖玻片", periods: 1, required: "必做", mode: "分组" },
  E4: { experimentName: "探究加速度与力、质量的关系", chapter: "第四章 运动和力的关系", equipment: "轨道小车、砝码", periods: 2, required: "必做", mode: "演示" },
  EXTRA: { experimentName: "探究平抛运动", chapter: "第五章 抛体运动", equipment: "平抛运动实验器", periods: 1, required: "必做", mode: "分组" }
};
function planItemInput(key, overrides = {}) { return { ...experimentFixtures[key], scheduleType: "WEEK", plannedWeek: 3, plannedDate: "", ...overrides }; }
function createPhysicsBooking(f, overrides = {}) {
  const { classId = "S1-C2", planItemId = "S1-P1-I1", personId, ...input } = overrides;
  const task = physicalTask(f.db, classId, planItemId);
  assert.ok(task, "physics teaching task must exist");
  return f.run("teacher", "booking.create", {
    taskId: task.id,
    requestedDate: M.TODAY,
    requestedPeriod: 2,
    groups: 8,
    requestedResources: [],
    note: "测试预约",
    ...input
  }, personId || task.teacherId);
}
function createPhysicalStock(f) {
  const stock = f.run("admin", "inventory.save", {
    classificationCode: "TEST-PH-QTY-001",
    name: "物理实验记录纸",
    spec: "A4实验记录纸",
    category: "耗材",
    unit: "包",
    trackingMode: "QUANTITY",
    min: 2,
    expiry: "",
    roomId: "S1-L1"
  });
  f.run("admin", "flow.create", { itemId: stock.id, kind: "入库", qty: 10, date: M.TODAY, reason: "建立测试库存" });
  return get(f.db, "inventory", stock.id);
}
function arrange(f, bookingId, overrides = {}) {
  return f.run("admin", "booking.arrange", {
    id: bookingId,
    venueType: "实验室",
    roomId: "S1-L1",
    venueText: "",
    scheduledDate: M.TODAY,
    startPeriod: 2,
    endPeriod: 2,
    technicianId: "S1-T0",
    resources: [],
    note: "按课表安排",
    ...overrides
  });
}

test("v12样例接入橱柜并不再保存旧计划、预约和班级字段", () => {
  const db = M.seed();
  assert.equal(db.version, M.VERSION);
  assert.equal(M.roles.technician, undefined, "实验员不再作为独立角色");
  assert.equal(db.staff.filter(person => person.role === "technician").length, 0, "初始人员不再使用实验员角色");
  assert.equal(db.staff.filter(person => person.role === "admin").length, 6, "原实验员并入学校管理员");
  assert.equal(db.labs, undefined);
  for (const school of db.schools) assert.equal(Object.hasOwn(school, "street"), false, "schools.street");
  for (const plan of db.plans) for (const key of ["classId", "teacherId", "catalogId", "date", "week", "mode", "revisionNo"]) assert.equal(Object.hasOwn(plan, key), false, `plans.${key}`);
  for (const item of db.planItems) { assert.equal(Object.hasOwn(item, "sortNo"), false, "planItems.sortNo"); assert.ok(item.experimentName && item.chapter && item.equipment && item.periods >= 1, "计划明细直接保存实验业务字段"); }
  assert.ok(Array.isArray(db.experimentCatalog), "当前模型保留教材实验目录");
  assert.ok(Array.isArray(db.textbooks), "当前模型保留教材关系");
  assert.ok(Array.isArray(db.customExperiments), "当前模型保留学校自定义创新实验");
  assert.ok(Array.isArray(db.planTargets), "当前模型保留计划适用班级");
  assert.deepEqual([...new Set(db.classes.filter(row => row.school === "S1").map(row => row.grade))], ["高一", "高二", "高三"], "编制计划的适用年级应至少覆盖高中三个年级");
  assert.ok(db.textbooks.some(row => row.subject === "物理" && row.grade === "高二"), "高二教材应可供切换");
  assert.ok(db.experimentCatalog.some(row => row.subject === "物理" && row.grade === "高三"), "高三教材实验目录应可供切换");
  assert.ok(db.plans.every(plan => plan.name === `${db.terms.find(term => term.id === plan.term)?.name} · ${plan.grade}${M.subjectLabel(plan.subject)}实验计划`), "样例计划名称应与四学科编制计划默认格式一致");
  assert.equal(db.itemCatalog, undefined, "当前模型取消独立物品目录");
  assert.equal(db.moves, undefined, "当前模型取消调拨记录");
  assert.equal(db.loans, undefined, "当前模型取消借还记录");
  assert.ok(db.rooms.every(room => typeof room.hazardStorage === "boolean"));
  assert.equal(get(db, "rooms", "S1-L2").hazardStorage, true);
  assert.equal(get(db, "rooms", "S1-L1").hazardStorage, false);
  assert.equal(db.cabinets.length, 12, "每校演示库提供房间内橱柜");
  assert.ok(db.assets.some(row => row.cabinetId) && db.inventory.some(row => row.cabinetId), "设备和库存示例带有柜位");
  for (const klass of db.classes) assert.equal(Object.hasOwn(klass, "teacherIds"), false, "classes.teacherIds");
  for (const booking of db.bookings) for (const key of ["planId", "labId", "managerId", "date", "start", "end", "period", "resources"]) assert.equal(Object.hasOwn(booking, key), false, `bookings.${key}`);
  assert.ok(db.bookings.every(booking => booking.requestedResources.every(resource => resource.itemId && resource.name && !Object.hasOwn(resource, "ref"))), "预约需求直接保存物品类型信息，不提前锁定资产或库存余额");
  assert.ok(db.periods.every(period => period.term && period.school), "every period belongs to one school and term");
  for (const row of [...db.assets, ...db.inventory]) {
    assert.ok(Object.hasOwn(row, "roomId"));
    for (const key of ["name", "spec", "classificationCode", "category", "unit", "trackingMode"]) assert.ok(Object.hasOwn(row, key), `${row.id}.${key}`);
    assert.ok(M.itemOf(db, row));
  }
  assert.ok(db.inventory.every(row => !Object.hasOwn(row, "opening")));
  assert.ok(db.inventory.every(row => Object.hasOwn(row, "unitPrice") && Object.hasOwn(row, "purchaseDate")), "易耗品账目保留分类账所需单价和购置日期");
  for (const row of db.repairs) for (const key of ["state", "due", "decision", "acceptance", "priorState", "startedAt"]) assert.equal(Object.hasOwn(row, key), false, `repairs.${key}`);
  for (const row of db.flows.filter(flow => flow.kind === "损耗")) for (const key of ["state", "reviewer", "reviewNote", "arrangementId", "taskId"]) assert.equal(Object.hasOwn(row, key), false, `loss.${key}`);
  assert.equal(M.extendedImportHeader, undefined);
  const source = fs.readFileSync(path.join(__dirname, "../assets/app.js"), "utf8");
  const subjectContextDeclaration = source.slice(source.indexOf("const subjectContextPages"), source.indexOf("const subjectContextEnabled"));
  const planCatalogRefresh = source.slice(source.indexOf("function refreshPlanCatalog"), source.indexOf("function refreshPlanClasses"));
  const planClassesRefresh = source.slice(source.indexOf("function refreshPlanClasses"), source.indexOf("function readPlanCompileRows"));
  const planForm = source.slice(source.indexOf("function planForm"), source.indexOf("function setOptions"));
  const bookingForm = source.slice(source.indexOf("function bookingForm"), source.indexOf("function planItemEditor"));
  assert.doesNotMatch(planForm, /pf\("(?:classId|teacherId)"/);
  assert.match(planForm, /pf\("subject"/, "计划编制页须允许确认本计划学科");
  assert.match(planForm, /pf\("term"[\s\S]*?data-submit-disabled/, "计划编制页学期须由当前上下文带入且只读");
  assert.doesNotMatch(bookingForm, /f\("(?:labId|managerId|start|end)"/);
  assert.match(source, /function currentPlanSubject\(\)/, "综合教师须从页面上下文选择具体计划学科");
  assert.doesNotMatch(subjectContextDeclaration, /"safety"/, "跨学科共享的安全模块不应显示伪学科切换");
  assert.match(source, /defaultPlanName[^\n]*subjectLabel\(subject\)/, "计划默认名称须使用标准学科显示名");
  assert.match(planCatalogRefresh, /const formEl = \$\("#modalForm"\)/, "切换计划学科时须读取计划弹窗内的字段");
  assert.match(planCatalogRefresh, /previousTextbook[\s\S]*options\.some\(\(\[id\]\)/, "切换计划学科后教材必须重置为当前学科的有效选项");
  assert.match(planClassesRefresh, /const formEl = \$\("#modalForm"\)/, "切换计划年级时须读取计划弹窗内的字段");
  assert.match(source, /教材实验清单|planCatalogRows/, "计划页面按教材清单编制");
  assert.match(planForm, /name="planClassIds"/, "编制计划须显示适用班级选择");
  assert.match(planForm, /refreshLatestLocalData\(\)/, "打开编制计划时须读取最新班级数据");
  assert.match(planForm, /defaultPlanName\(term\.name, grade, subject\)/, "新建计划默认名称应与样例格式一致");
  assert.doesNotMatch(planForm, /plan-item-add|plan-item-remove|data-plan-item/, "编制页不再提供自由添加实验明细行");
  assert.doesNotMatch(planForm, /参考系统流程|参考系统/, "编制计划页面不得出现参考系统说明");
  assert.doesNotMatch(source, /booking-prepare|booking\.prepare|确认实验准备/, "页面不再提供独立实验准备动作");
  assert.doesNotMatch(source, /preparation|preparedBy|preparedAt|my-bookings|view\.tab = "mine"/, "页面不再保留旧准备或旧个人预约入口");
  assert.match(source, /function bookingResourceFields[\s\S]*data-resource-option/, "预约表单须提供可搜索的多选器材入口");
  assert.match(bookingForm, /data-booking-resource-row/, "预约表单须渲染可增删的器材明细行");
  assert.match(source, /plan-delete/, "计划列表须提供学校管理员删除入口");
  assert.doesNotMatch(source, /data-action="task-delete"/, "班级执行记录不应提供独立删除入口");
  assert.doesNotMatch(source, /\["tasks", "班级实验任务"\]|\["mine", "我的任务"\]/, "实验计划页不应保留独立任务页签");
  assert.match(source, /<h3>班级执行情况<\/h3>/, "计划详情须集中展示各班执行进度");
  assert.match(source, /f\("taskId", "计划实验"/, "预约表单应从计划实验发起，不暴露内部任务概念");
  for (const label of ["已预约实验", "已安排实验", "待登记总结实验", "我预约的实验", "我的已安排实验", "我的待登记总结实验"]) assert.match(source, new RegExp(label), `预约与安排页签：${label}`);
  assert.match(source, /\["pendingSummary", "待登记总结实验"\]/, "安排完成后进入待登记总结页签");
 assert.match(source, /maintenanceDisabled \? "" : r\.nextMaintenance/, "数量型采购明细打开时须清空并禁用维保日期");
  assert.match(source, /String\(item\?\.category \|\| ""\)/, "新增设备/入库的空白明细不得因未选分类而阻断弹窗");
 assert.match(source, /state: r\.pendingReceiptId \? "待库存复核"/, "待整单复核库存须显示锁定状态");
  assert.match(source, /table === "inventory" && scope === "school" && !r\.pendingReceiptId/, "待整单复核库存不应显示其他库存业务入口");
  assert.doesNotMatch(source, /资产业务|asset-actions/, "设备台账不再使用资产业务折叠菜单");
  assert.doesNotMatch(source, /资产标签|资产标识卡|asset-label/, "设备台账不再提供资产标签功能");
  const repairForm = source.slice(source.indexOf("function repairForm"), source.indexOf("function scrapAssets"));
  const scrapPicker = source.slice(source.indexOf("function scrapSelectionTable"), source.indexOf("function scrapForm"));
  const scrapForm = source.slice(source.indexOf("function scrapForm"), source.indexOf("function lossSelectionTable"));
  const lossForm = source.slice(source.indexOf("function lossSelectionTable"), source.indexOf("const returnedQty"));
  for (const label of ["仪器名称", "维修数量", "维修金额", "维修日期", "维修商", "维修内容"]) assert.match(repairForm, new RegExp(label), `维修表单字段：${label}`);
  assert.match(repairForm, /equipmentPicker/, "维修表单须使用可搜索的器材单选器");
  for (const label of ["报废日期", "报废原因", "经办人"]) assert.match(scrapForm, new RegExp(label), `报废表单字段：${label}`);
  assert.match(scrapPicker, /equipmentListToolbar|data-equipment-list-row/, "报废选择须支持器材搜索");
  for (const label of ["损耗日期", "损耗数量", "损耗原因", "经办人"]) assert.match(lossForm, new RegExp(label), `损耗表单字段：${label}`);
  assert.match(lossForm, /选择仪器设备/, "损耗登记须先进入参考系统的仪器设备选择步骤");
  assert.match(lossForm, /equipmentListToolbar|data-equipment-list-row/, "损耗选择须支持器材搜索");
  assert.match(lossForm, /placeholder=\"请选择或录入损耗原因\"/, "损耗原因须支持选择或自行录入");
  assert.match(lossForm, /field\(\"operator\"[\s\S]*\"readonly\"/, "损耗经办人须由当前账号带出且只读");
  assert.doesNotMatch(lossForm, /data-loss-select|name=\"lossItems\"/, "损耗数量应直接填写，不使用额外复选框代替参考交互");
  for (const formSource of [repairForm, scrapForm, lossForm]) assert.doesNotMatch(formSource, /期望处理日期|处理类型|业务类型|关联实验安排|状态|审批|复核|验收|下次维保/, "参考表单不得增加流程字段");
  for (const action of ["base-delete", "purchase-edit", "receipt-edit", "plan-edit", "arrangement-edit", "summary-edit", "check-edit", "hazard-edit", "archive-edit"]) assert.match(source, new RegExp(action), `管理员更正入口：${action}`);
});

test("实验计划按三类属性编制并限制到适用班级", () => {
  const initial = M.seed();
  const baselineInnovation = M.metrics(initial, "S1", "TERM26", "物理").innovation;
  initial.textbooks.push({ id: "TB-TEST-CX", name: "物理校本创新实验册", subject: "物理", grade: "高一", version: "校本创新2026版", state: "启用" });
  const f = fixture(initial), custom = f.run("admin", "customExperiment.save", { name: "自制电磁秋千", code: "CX-TEST-001", subject: "物理", grade: "高一", textbookId: "TB-TEST-CX", chapter: "校本实践", supportedModes: ["分组"], equipmentRequirements: [{ name: "铜线", spec: "漆包线", unit: "米", quantity: 3 }, { name: "磁铁", spec: "圆片", unit: "块", quantity: 4 }] });
  assert.equal(custom.experimentCategory, "创新实验");
  assert.equal(custom.equipmentRequirements[1].quantity, 4);
  const plan = f.run("admin", "plan.compile", { term: "TERM26", subject: "物理", grade: "高一", textbookId: "TB-TEST-CX", name: "校本创新实验计划", classIds: ["S1-C1"], items: [{ sourceType: "学校自定义", sourceId: custom.id, mode: "分组", scheduleType: "WEEK", plannedWeek: 4 }] });
  const item = f.db.planItems.find(row => row.planId === plan.id), tasks = f.db.teachingTasks.filter(row => row.planItemId === item.id);
  assert.equal(item.experimentCategory, "创新实验");
  assert.equal(item.sourceType, "学校自定义");
  assert.deepEqual([...new Set(tasks.map(row => row.classId))], ["S1-C1"]);
  assert.equal(M.metrics(f.db, "S1", "TERM26", "物理").innovation, baselineInnovation + 1);
  f.reject("admin", "customExperiment.delete", { id: custom.id, reason: "已编入计划" }, /已编入实验计划/);
});

test("关系审计器覆盖主外键、状态同步和负库存", () => {
  assert.deepEqual(M.auditRelations(M.seed()), [], "初始数据关系应完整");
  const broken = M.seed();
  broken.bookings[0].taskId = "MISSING-TASK";
  broken.inventory[0].stock = -1;
  broken.teachingTasks[0].subject = "化学";
  broken.teachingTasks[0].subjectCode = "PHY";
  broken.arrangements[0].resources = [{ ref: "MISSING-RESOURCE", qty: 1 }];
  const explicitPlan = broken.plans.find(plan => plan.id === "S1-P1");
  explicitPlan.targetMode = "EXPLICIT";
  broken.planTargets = broken.planTargets.filter(target => target.planId !== explicitPlan.id);
  const issues = M.auditRelations(broken);
  assert.ok(issues.some(message => /预约.*计划实验不存在/.test(message)));
  assert.ok(issues.some(message => /库存.*数量为负数/.test(message)));
  assert.ok(issues.some(message => /班级执行记录.*学科编码不匹配|班级执行记录.*计划实验.*不一致/.test(message)), "审计器应识别学科编码或上下游漂移");
  assert.ok(issues.some(message => /安排.*器材不存在/.test(message)), "审计器应识别安排中的悬空器材");
  assert.ok(issues.some(message => /实验计划.*未登记适用班级/.test(message)), "审计器应识别显式计划缺少班级范围");
  const crossSchool = M.seed();
  crossSchool.assets[0].roomId = "S2-L1";
  crossSchool.periods[0].term = "";
  assert.ok(M.auditRelations(crossSchool).some(message => /设备.*与房间学校不一致/.test(message)), "审计器应识别资产跨校存放");
  assert.ok(M.auditRelations(crossSchool).some(message => /节次.*学期不存在/.test(message)), "审计器应识别节次悬空学期");
  const mismatchedPurchase = M.seed();
  mismatchedPurchase.purchases[0].receiptId = "S1-RK0";
  assert.ok(M.auditRelations(mismatchedPurchase).some(message => /采购.*反向关系不一致/.test(message)), "审计器应识别采购与入库单错配");
});

test("同学期学科可发布多份计划，但名称和实验明细不得重复，归档后可重新使用", () => {
  const f = fixture();
  const secondTeacher = f.run("admin", "base.save", {
    table: "staff", name: "赵物理", role: "teacher", subject: "物理", title: "一级教师", phone: "", qualification: "教师资格证", sex: "女", departmentId: "S1-D2", enabled: true
  });
  const primary1 = f.run("admin", "base.save", { table: "assignments", term: "TERM25", classId: "S1-C1", subject: "物理", teacherId: "S1-T1", primary: true, state: "有效" });
  const primary2 = f.run("admin", "base.save", { table: "assignments", term: "TERM25", classId: "S1-C2", subject: "物理", teacherId: "S1-T1", primary: true, state: "有效" });
  const secondary = f.run("admin", "base.save", { table: "assignments", term: "TERM25", classId: "S1-C1", subject: "物理", teacherId: secondTeacher.id, primary: false, state: "有效" });
  f.reject("teacher", "plan.create", {
    term: "TERM25", subject: "物理", grade: "高一", version: "人教版·必修第一册", name: "计划重复明细校验",
    items: [
      planItemInput("E1"),
      planItemInput("E1", { scheduleType: "DATE", plannedWeek: "", plannedDate: "2026-06-15" })
    ]
  }, /不能重复/);
  const plan = f.run("teacher", "plan.create", {
    term: "TERM25",
    subject: "物理",
    grade: "高一",
    version: "人教版·必修第一册",
    name: "物理实验计划·测试版",
    items: [
      planItemInput("E1"),
      planItemInput("E4", { scheduleType: "DATE", plannedWeek: "", plannedDate: "2026-06-15" })
    ]
  });
  assert.equal(plan.state, "已发布");
  assert.equal(plan.subject, "物理");
  assert.equal(plan.grade, "高一");
  assert.equal(plan.version, "人教版·必修第一册");
  assert.equal(Object.hasOwn(plan, "classId"), false);
  assert.equal(Object.hasOwn(plan, "teacherId"), false);
  const items = f.db.planItems.filter(item => item.planId === plan.id);
  assert.equal(items.length, 2);
  assert.ok(items.every(item => !Object.hasOwn(item, "sortNo")));
  assert.equal(items[0].plannedWeek, 3);
  assert.equal(items[1].plannedDate, "2026-06-15");
  const generated = f.db.teachingTasks.filter(task => items.some(item => item.id === task.planItemId));
  assert.equal(generated.length, 4, "two details × two primary physical assignments");
  assert.deepEqual(new Set(generated.map(task => task.assignmentId)), new Set([primary1.id, primary2.id]));
  assert.ok(generated.every(task => task.assignmentId !== secondary.id), "secondary teachers do not generate duplicate class tasks");
  f.reject("teacher", "plan.create", {
    term: "TERM25", subject: "物理", grade: "高一", version: "人教版·必修第一册", name: plan.name,
    items: [planItemInput("EXTRA", { plannedWeek: 4 })]
  }, /同名已发布计划/);
  f.reject("teacher", "plan.create", {
    term: "TERM25", subject: "物理", grade: "高一", version: "人教版·必修第一册", name: "跨计划重复明细",
    items: [planItemInput("E1", { plannedWeek: 4 })]
  }, /其他已发布计划已包含相同实验和类型/);
  const secondPlan = f.run("teacher", "plan.create", {
    term: "TERM25", subject: "物理", grade: "高一", version: "人教版·必修第二册", name: "高一物理实验计划·第二册",
    items: [planItemInput("EXTRA", { plannedWeek: 4 })]
  });
  assert.equal(secondPlan.state, "已发布");
  assert.equal(f.db.plans.filter(row => row.school === "S1" && row.term === "TERM25" && row.subject === "物理" && row.state === "已发布").length, 2);
  assert.equal(f.db.teachingTasks.filter(task => f.db.planItems.some(item => item.planId === secondPlan.id && item.id === task.planItemId)).length, 2);
  f.run("admin", "plan.archive", { id: plan.id });
  assert.equal(get(f.db, "plans", plan.id).state, "已归档");
  assert.ok(generated.every(task => get(f.db, "teachingTasks", task.id).state === "已失效"));
  const replacement = f.run("teacher", "plan.create", {
    term: "TERM25", subject: "物理", grade: "高一", version: "人教版·必修第一册", name: plan.name,
    items: [planItemInput("E1", { plannedWeek: 4 })]
  });
  assert.equal(replacement.state, "已发布");
  assert.equal(f.db.plans.filter(row => row.school === "S1" && row.term === "TERM25" && row.subject === "物理" && row.state === "已发布").length, 2);
  assert.equal(f.db.teachingTasks.filter(task => f.db.planItems.some(item => item.planId === replacement.id && item.id === task.planItemId)).length, 2, "全未开展的归档计划应为两个班级重新生成任务");

  const mixed = fixture();
  const mixedAssignment1 = mixed.run("admin", "base.save", { table: "assignments", term: "TERM25", classId: "S1-C1", subject: "物理", teacherId: "S1-T1", primary: true, state: "有效" });
  mixed.run("admin", "base.save", { table: "assignments", term: "TERM25", classId: "S1-C2", subject: "物理", teacherId: "S1-T1", primary: true, state: "有效" });
  const mixedPlan = mixed.run("teacher", "plan.create", {
    term: "TERM25", subject: "物理", grade: "高一", version: "人教版·必修第一册", name: "归档复用履约去重计划",
    items: [planItemInput("E1")]
  });
  const mixedItem = mixed.db.planItems.find(item => item.planId === mixedPlan.id);
  const mixedTasks = mixed.db.teachingTasks.filter(task => task.planItemId === mixedItem.id);
  assert.equal(mixedTasks.length, 2);
  const completedTask = mixedTasks.find(task => task.classId === "S1-C1");
  const completedBooking = mixed.run("teacher", "booking.create", { taskId: completedTask.id, requestedDate: "2026-06-15", requestedPeriod: 2, groups: 8, requestedResources: [], note: "归档复用前已完成" });
  const completedArrangement = arrange(mixed, completedBooking.id, { scheduledDate: "2026-06-15", startPeriod: 2, endPeriod: 2 });
  mixed.run("teacher", "booking.summary", { id: completedArrangement.id, actualDate: "2026-06-15", effect: "实验完成", improvement: "", equipmentCondition: "完好", note: "", overviewImages: [], studentImages: [] });
  mixed.run("admin", "plan.archive", { id: mixedPlan.id });
  assert.equal(get(mixed.db, "teachingTasks", completedTask.id).state, "已完成");
  assert.equal(get(mixed.db, "teachingTasks", mixedTasks.find(task => task.classId === "S1-C2").id).state, "已失效");
  const replacementTeacher = mixed.run("admin", "base.save", { table: "staff", name: "钱物理", role: "teacher", subject: "物理", title: "一级教师", phone: "", qualification: "教师资格证", sex: "男", departmentId: "S1-D2", enabled: true });
  mixed.run("admin", "base.save", { table: "assignments", id: mixedAssignment1.id, term: mixedAssignment1.term, classId: mixedAssignment1.classId, subject: mixedAssignment1.subject, teacherId: mixedAssignment1.teacherId, primary: mixedAssignment1.primary, state: "停用" });
  mixed.run("admin", "base.save", { table: "assignments", term: "TERM25", classId: "S1-C1", subject: "物理", teacherId: replacementTeacher.id, primary: true, state: "有效" });
  const archivedMetrics = M.metrics(mixed.db, "S1", "TERM25");
  assert.deepEqual({ required: archivedMetrics.required, done: archivedMetrics.done }, { required: 1, done: 1 });
  const mixedReplacement = mixed.run("teacher", "plan.create", {
    term: "TERM25", subject: "物理", grade: "高一", version: "人教版·必修第一册", name: mixedPlan.name,
    items: [planItemInput("E1", { plannedWeek: 4 })]
  });
  const mixedReplacementItem = mixed.db.planItems.find(item => item.planId === mixedReplacement.id);
  const replacementTasks = mixed.db.teachingTasks.filter(task => task.planItemId === mixedReplacementItem.id);
  assert.deepEqual(replacementTasks.map(task => task.classId), ["S1-C2"], "已完成班级不重复生成，未开展后失效班级生成新版任务");
  const replacementMetrics = M.metrics(mixed.db, "S1", "TERM25");
  assert.deepEqual({ required: replacementMetrics.required, done: replacementMetrics.done }, { required: 2, done: 1 }, "归档复用后完成量和应开数不应翻倍");
});

test("学校管理员可删除无执行记录的计划，并保护已有业务历史", () => {
  const f = fixture();
  f.run("admin", "base.save", { table: "assignments", term: "TERM25", classId: "S1-C2", subject: "物理", teacherId: "S1-T1", primary: true, state: "有效" });
  const plan = f.run("teacher", "plan.create", {
    term: "TERM25", subject: "物理", grade: "高一", version: "人教版·必修第一册", name: "可删除的物理实验计划",
    items: [planItemInput("EXTRA", { plannedWeek: 3 })]
  });
  const itemIds = f.db.planItems.filter(item => item.planId === plan.id).map(item => item.id);
  const taskIds = f.db.teachingTasks.filter(task => itemIds.includes(task.planItemId)).map(task => task.id);
  assert.ok(taskIds.length > 0, "删除测试计划应生成班级任务");
  f.run("admin", "plan.delete", { id: plan.id, reason: "计划内容录入错误，重新编制" });
  assert.equal(f.db.plans.some(row => row.id === plan.id), false);
  assert.equal(f.db.planItems.some(item => itemIds.includes(item.id)), false);
  assert.equal(f.db.teachingTasks.some(task => taskIds.includes(task.id)), false);
  assert.ok(f.db.logs.some(log => log.table === "plans" && log.recordId === plan.id && log.action === "删除实验计划"));

  f.reject("admin", "plan.delete", { id: "S1-P1", reason: "误删测试" }, /预约、安排、总结、流水、附件或待处理实验|不能删除/);
});

test("学期任课关系为已发布计划生成班级执行记录", () => {
  const f = fixture();
  const klass = f.run("admin", "base.save", { table: "classes", name: "高一5班", grade: "高一", students: 39, state: "在读" });
  f.db.planTargets.push({ id: `S1-P1-${klass.id}`, school: "S1", planId: "S1-P1", classId: klass.id, grade: "高一", state: "启用" });
  const assignment = f.run("admin", "base.save", { table: "assignments", term: "TERM26", classId: klass.id, subject: "物理", teacherId: "S1-T1", primary: true, state: "有效" });
  assert.equal(assignment.classId, klass.id);
  const tasks = f.db.teachingTasks.filter(task => task.assignmentId === assignment.id);
  assert.equal(tasks.length, 2, "seed physical plan has two details");
  assert.ok(tasks.every(task => task.classId === klass.id && task.teacherId === "S1-T1" && task.term === "TERM26"));
  assert.deepEqual(new Set(tasks.map(task => M.taskContext(f.db, task).experiment.name)), new Set(["测量物体的速度", "探究加速度与力、质量的关系"]));
  const teacher = get(f.db, "staff", "S1-T1"), teacherForm = { table: "staff", id: teacher.id, name: teacher.name, role: teacher.role, subject: teacher.subject, title: teacher.title, phone: teacher.phone, qualification: teacher.qualification, sex: teacher.sex, departmentId: teacher.departmentId, enabled: true };
  f.reject("admin", "base.save", { ...teacherForm, subject: "化学" }, /任课或实验计划执行/);
  f.reject("admin", "base.save", { ...teacherForm, enabled: false }, /有效任课关系/);
  assert.equal(get(f.db, "staff", "S1-T1").subject, "物理");
  f.reject("admin", "base.save", { table: "assignments", term: "TERM26", classId: klass.id, subject: "物理", teacherId: "S1-T1", primary: true, state: "有效" }, /已存在/);
});

test("任课教师可批量设置任课班级并继续生成班级执行记录", () => {
  const f = fixture();
  const klass = f.run("admin", "base.save", { table: "classes", name: "高一5班", grade: "高一", students: 39, state: "在读" });
  f.db.planTargets.push({ id: `S1-P1-${klass.id}`, school: "S1", planId: "S1-P1", classId: klass.id, grade: "高一", state: "启用" });
  const result = f.run("admin", "teacher.assignments.save", { teacherId: "S1-T1", term: "TERM26", rows: [{ classId: klass.id, subject: "物理", primary: true, state: "有效" }] });
  const assignment = result.assignments.find(row => row.classId === klass.id);
  assert.ok(assignment);
  assert.equal(assignment.teacherId, "S1-T1");
  assert.equal(assignment.primary, true);
  assert.equal(f.db.teachingTasks.filter(task => task.assignmentId === assignment.id).length, 2, "物理计划的两项明细应生成该班级任务");
  f.reject("teacher", "teacher.assignments.save", { teacherId: "S1-T1", term: "TERM26", rows: [{ classId: klass.id, subject: "物理", primary: true, state: "有效" }] }, /学校管理员/);
  f.reject("admin", "teacher.assignments.save", { teacherId: "S1-T1", term: "TERM26", rows: [{ classId: klass.id, subject: "物理", primary: true, state: "有效" }] }, /已经设置/);
});

test("班级名称在同一学校内唯一", () => {
  const f = fixture();
  f.reject("admin", "base.save", { table: "classes", name: "高一1班", grade: "高一", students: 36, state: "在读" }, /同校班级名称已存在/);
  const second = get(f.db, "classes", "S1-C2");
  f.reject("admin", "base.save", { table: "classes", id: second.id, name: "高一1班", grade: second.grade, students: second.students, state: second.state }, /同校班级名称已存在/);
});

test("预约只表达申请日期节次与物品类型需求，并允许新增计划外器材", () => {
  const f = fixture(), task = physicalTask(f.db, "S1-C2", "S1-P1-I1");
  f.reject("teacher", "booking.create", { taskId: task.id, requestedDate: M.TODAY, requestedPeriod: 2, groups: 8, requestedResources: [{ itemId: "IT10", qty: 1 }], note: "物理实验不应申请危化品" }, /危化品只用于化学实验/, task.teacherId);
  const booking = createPhysicsBooking(f, { requestedResources: [{ itemId: "IT3", qty: 2 }] });
  assert.equal(booking.state, "待安排");
  assert.equal(booking.requestedDate, M.TODAY);
  assert.equal(booking.requestedPeriod, 2);
  for (const key of ["roomId", "technicianId", "scheduledDate", "startPeriod", "endPeriod", "labId", "managerId", "start", "end"]) assert.equal(Object.hasOwn(booking, key), false, key);
  assert.ok(booking.requestedResources[0].itemId === "IT3" && booking.requestedResources[0].name, "预约明细直接保存物品类型信息");
  assert.equal(get(f.db, "teachingTasks", booking.taskId).state, "待安排");
  f.reject("teacher", "booking.create", { taskId: booking.taskId, requestedDate: M.TODAY, requestedPeriod: 3, groups: 8, requestedResources: [] }, /状态|有效预约/, task.teacherId);
});

test("预约物品快照保留显式学科范围并拦截不兼容学科", () => {
  const scopedItem = { itemId: "TEST-MULTI-SCOPE", classificationCode: "TEST-MULTI-SCOPE", name: "跨学科观察记录套件", spec: "V1", category: "耗材", unit: "套", trackingMode: "QUANTITY", maintenanceRequired: false, subjectScopes: ["物理", "生物学"], qty: 1 };
  const f = fixture(), booking = createPhysicsBooking(f, { requestedResources: [scopedItem] }), saved = booking.requestedResources[0];
  assert.deepEqual(saved.subjectScopes, ["物理", "生物"], "兼容范围应以标准内部值持久化");
  assert.equal(M.itemFitsSubject(saved, "生物学"), true);
  assert.deepEqual(M.auditRelations(f.db), []);
  const incompatible = fixture(), task = physicalTask(incompatible.db);
  incompatible.reject("teacher", "booking.create", { taskId: task.id, requestedDate: M.TODAY, requestedPeriod: 2, groups: 8, requestedResources: [{ ...scopedItem, itemId: "TEST-CHEM-ONLY", classificationCode: "TEST-CHEM-ONLY", subjectScopes: ["化学"] }], note: "不应保存" }, /补充器材须与当前实验学科一致/, task.teacherId);
});

test("管理员安排校验权限、学科、容量以及房间班级教师实验负责人冲突", () => {
  const f = fixture(), booking = createPhysicsBooking(f);
  f.reject("teacher", "booking.arrange", { id: booking.id }, /学校管理员/);
  f.reject("admin", "booking.arrange", { id: booking.id, venueType: "实验室", roomId: "S1-L2", scheduledDate: M.TODAY, startPeriod: 2, endPeriod: 2, technicianId: "S1-T0", resources: [] }, /实验学科/);
  const small = f.run("admin", "base.save", { table: "rooms", name: "物理小教室", roomNo: "A099", type: "教学实验室", subject: "物理", area: 30, seats: 20, builder: "", builtAt: "", stage: "高中", features: "", note: "", state: "可用" });
  f.reject("admin", "booking.arrange", { id: booking.id, venueType: "实验室", roomId: small.id, scheduledDate: M.TODAY, startPeriod: 2, endPeriod: 2, technicianId: "S1-T0", resources: [] }, /容量不足/);
  f.reject("admin", "booking.arrange", { id: booking.id, venueType: "实验室", roomId: "S1-L1", scheduledDate: M.TODAY, startPeriod: 1, endPeriod: 1, technicianId: "S1-T0", resources: [] }, /安排冲突/);
  f.reject("admin", "booking.arrange", { id: booking.id, venueType: "实验室", roomId: "S1-L1", scheduledDate: M.TODAY, startPeriod: 3, endPeriod: 3, technicianId: "S1-T0", resources: [{ ref: "S1-I4", qty: 1 }] }, /实际器材须与当前实验学科一致/);
  const arrangement = arrange(f, booking.id, { startPeriod: 3, endPeriod: 3 });
  assert.equal(arrangement.state, "已安排");
  assert.equal(arrangement.roomId, "S1-L1");
  assert.equal(arrangement.technicianId, "S1-T0");
  assert.equal(get(f.db, "teachingTasks", booking.taskId).state, "已安排");
  const nextClass = f.run("admin", "base.save", { table: "classes", name: "高一5班", grade: "高一", students: 39, state: "在读" });
  f.db.planTargets.push({ id: `S1-P1-${nextClass.id}`, school: "S1", planId: "S1-P1", classId: nextClass.id, grade: "高一", state: "启用" });
  f.run("admin", "base.save", { table: "assignments", term: "TERM26", classId: nextClass.id, subject: "物理", teacherId: "S1-T1", primary: true, state: "有效" });
  const nextTask = physicalTask(f.db, nextClass.id);
  const oldRequestSlot = f.run("teacher", "booking.create", { taskId: nextTask.id, requestedDate: M.TODAY, requestedPeriod: 2, groups: 8, requestedResources: [], note: "原申请节次已释放" });
  assert.equal(oldRequestSlot.state, "待安排");
  const conflictClass = f.run("admin", "base.save", { table: "classes", name: "高一6班", grade: "高一", students: 38, state: "在读" });
  f.db.planTargets.push({ id: `S1-P1-${conflictClass.id}`, school: "S1", planId: "S1-P1", classId: conflictClass.id, grade: "高一", state: "启用" });
  f.run("admin", "base.save", { table: "assignments", term: "TERM26", classId: conflictClass.id, subject: "物理", teacherId: "S1-T1", primary: true, state: "有效" });
  const conflictTask = physicalTask(f.db, conflictClass.id);
  f.reject("teacher", "booking.create", { taskId: conflictTask.id, requestedDate: M.TODAY, requestedPeriod: 3, groups: 8, requestedResources: [], note: "应与最终安排冲突" }, /预约申请冲突/);
});

test("安排地点按实验室、教室、其他三分支联动并只保存对应字段", () => {
  {
    const f = fixture(), booking = createPhysicsBooking(f);
    const row = arrange(f, booking.id, { venueType: "实验室", roomId: "S1-L1", venueText: "应被清空" });
    assert.equal(row.roomId, "S1-L1");
    assert.equal(row.venueText, "");
  }
  {
    const f = fixture();
    const classroom = f.run("admin", "base.save", { table: "rooms", name: "高一普通教室", roomNo: "A101", type: "普通教室", subject: "", area: 72, seats: 50, builder: "", builtAt: "", stage: "高中", features: "多媒体", note: "", state: "可用" });
    const booking = createPhysicsBooking(f);
    f.reject("admin", "booking.arrange", { id: booking.id, venueType: "教室", roomId: "S1-L1", venueText: "", scheduledDate: M.TODAY, startPeriod: 2, endPeriod: 2, technicianId: "S1-T0", resources: [] }, /普通教室/);
    const row = arrange(f, booking.id, { venueType: "教室", roomId: classroom.id, venueText: "应被清空" });
    assert.equal(row.roomId, classroom.id);
    assert.equal(row.venueText, "");
  }
  {
    const f = fixture(), booking = createPhysicsBooking(f);
    f.reject("admin", "booking.arrange", { id: booking.id, venueType: "其他", roomId: "S1-L1", venueText: "", scheduledDate: M.TODAY, startPeriod: 2, endPeriod: 2, technicianId: "S1-T0", resources: [] }, /其他地点说明/);
    const row = arrange(f, booking.id, { venueType: "其他", roomId: "S1-L1", venueText: "校园科技馆" });
    assert.equal(row.roomId, "");
    assert.equal(row.venueText, "校园科技馆");
  }
});

test("停用节次不可预约或安排，两课时实验须覆盖连续启用节次", () => {
  const f = fixture(), fourth = get(f.db, "periods", "S1-K4");
  f.run("admin", "base.save", { table: "periods", id: fourth.id, name: fourth.name, number: fourth.number, start: fourth.start, end: fourth.end, state: "停用" });
  const onePeriodTask = physicalTask(f.db, "S1-C2", "S1-P1-I1");
  f.reject("teacher", "booking.create", { taskId: onePeriodTask.id, requestedDate: M.TODAY, requestedPeriod: 4, groups: 8, requestedResources: [], note: "停用节次" }, /已启用的节次/, onePeriodTask.teacherId);
  const booking = createPhysicsBooking(f, { planItemId: "S1-P1-I2", requestedPeriod: 3 });
  f.reject("admin", "booking.arrange", { id: booking.id, venueType: "实验室", roomId: "S1-L1", venueText: "", scheduledDate: M.TODAY, startPeriod: 3, endPeriod: 3, technicianId: "S1-T0", resources: [] }, /至少2个连续启用节次/);
  f.reject("admin", "booking.arrange", { id: booking.id, venueType: "实验室", roomId: "S1-L1", venueText: "", scheduledDate: M.TODAY, startPeriod: 3, endPeriod: 4, technicianId: "S1-T0", resources: [] }, /至少2个连续启用节次/);
  const row = arrange(f, booking.id, { startPeriod: 5, endPeriod: 6 });
  assert.deepEqual([row.startPeriod, row.endPeriod], [5, 6]);
});

test("节次按学校和学期分版，同版编号与时间不得冲突", () => {
  const f = fixture(), current = M.periodFor(f.db, "S1", 1, "TERM26"), previous = M.periodFor(f.db, "S1", 1, "TERM25");
  assert.equal(current.id, "S1-K1");
  assert.equal(current.term, "TERM26");
  assert.equal(previous.term, "TERM25");
  assert.notEqual(previous.id, current.id);
  f.reject("admin", "base.save", { table: "periods", term: "TERM26", number: 1, name: "重复第1节", start: "07:00", end: "07:30", state: "启用" }, /同校同学期节次编号已存在/);
  f.reject("admin", "base.save", { table: "periods", term: "TERM26", number: 9, name: "重叠早课", start: "08:10", end: "08:30", state: "启用" }, /节次时间不能重叠/);
  const revised = f.run("admin", "base.save", { table: "periods", id: previous.id, term: "TERM25", number: 1, name: previous.name, start: "07:50", end: "08:40", state: previous.state });
  assert.deepEqual([revised.term, revised.start, revised.end], ["TERM25", "07:50", "08:40"]);
  assert.deepEqual([M.periodFor(f.db, "S1", 1, "TERM26").start, M.periodFor(f.db, "S1", 1, "TERM26").end], ["08:00", "08:45"]);
  f.reject("admin", "base.save", { table: "periods", id: current.id, term: "TERM26", number: 1, name: current.name, start: "07:55", end: "08:40", state: current.state }, /已被预约或安排引用/);
});

test("单件资产按实验时段并发占用，重叠拒绝而不重叠可复用", () => {
  const f = fixture();
  const teacher = f.run("admin", "base.save", { table: "staff", name: "钱物理", role: "teacher", subject: "物理", title: "一级教师", phone: "", qualification: "教师资格证", sex: "男", departmentId: "S1-D2", enabled: true });
  const klass = f.run("admin", "base.save", { table: "classes", name: "高一5班", grade: "高一", students: 38, state: "在读" });
  f.db.planTargets.push({ id: `S1-P1-${klass.id}`, school: "S1", planId: "S1-P1", classId: klass.id, grade: "高一", state: "启用" });
  f.run("admin", "base.save", { table: "assignments", term: "TERM26", classId: klass.id, subject: "物理", teacherId: teacher.id, primary: true, state: "有效" });
  const secondLab = f.run("admin", "base.save", { table: "rooms", name: "物理实验室 2", roomNo: "A203", type: "教学实验室", subject: "物理", area: 96, seats: 48, builder: "", builtAt: "", stage: "高中", features: "", note: "", state: "可用" });
  const first = createPhysicsBooking(f);
  arrange(f, first.id, { resources: [{ ref: "S1-A4", qty: 1 }] });
  const second = createPhysicsBooking(f, { classId: klass.id, personId: teacher.id });
  f.reject("admin", "booking.arrange", { id: second.id, venueType: "实验室", roomId: secondLab.id, venueText: "", scheduledDate: M.TODAY, startPeriod: 2, endPeriod: 2, technicianId: "S1-T0", resources: [{ ref: "S1-A4", qty: 1 }] }, /已被重叠实验安排.*占用/);
  const nonOverlapping = arrange(f, second.id, { roomId: secondLab.id, startPeriod: 3, endPeriod: 3, technicianId: "S1-T0", resources: [{ ref: "S1-A4", qty: 1 }] });
  assert.deepEqual(nonOverlapping.resources, [{ ref: "S1-A4", qty: 1 }]);
});

test("安排后的耗材须在总结前完成关联领用并记账", () => {
  const f = fixture(), stock = createPhysicalStock(f), booking = createPhysicsBooking(f), arrangement = arrange(f, booking.id, { resources: [{ ref: stock.id, qty: 2 }] });
  f.reject("teacher", "booking.summary", { id: arrangement.id, actualDate: M.TODAY, effect: "效果良好", improvement: "", equipmentCondition: "完好", note: "", overviewImages: [], studentImages: [] }, /耗材须先完成关联领用并记账/);
  const issue = f.run("teacher", "flow.create", { itemId: stock.id, kind: "领用", qty: 2, date: M.TODAY, arrangementId: arrangement.id, reason: "本次物理实验使用" });
  assert.equal(issue.state, "待复核");
  assert.equal(issue.taskId, booking.taskId);
  f.run("admin", "flow.decide", { id: issue.id, approve: true, reason: "数量和用途核验通过" });
  assert.equal(get(f.db, "inventory", stock.id).stock, 8);
  const summary = f.run("teacher", "booking.summary", { id: arrangement.id, actualDate: M.TODAY, effect: "实验完成", improvement: "", equipmentCondition: "完好", note: "", overviewImages: [], studentImages: [] });
  assert.equal(summary.arrangementId, arrangement.id);
  assert.equal(get(f.db, "arrangements", arrangement.id).state, "已完成");
  assert.equal(get(f.db, "teachingTasks", booking.taskId).state, "已完成");
});

test("取消已安排预约会同步撤销尚未记账的关联领用", () => {
  const f = fixture(), stock = createPhysicalStock(f), opening = stock.stock;
  const booking = createPhysicsBooking(f), arrangement = arrange(f, booking.id, { resources: [{ ref: stock.id, qty: 2 }] });
  const issue = f.run("teacher", "flow.create", { itemId: stock.id, kind: "领用", qty: 2, date: M.TODAY, arrangementId: arrangement.id, reason: "为安排提前申请" });
  assert.equal(issue.state, "待复核");
  f.run("admin", "booking.cancel", { id: booking.id, reason: "课程临时调整" });
  assert.equal(get(f.db, "arrangements", arrangement.id).state, "已取消");
  assert.equal(get(f.db, "flows", issue.id).state, "已撤销");
  assert.equal(get(f.db, "inventory", stock.id).stock, opening, "pending issue was never posted");
  assert.equal(get(f.db, "teachingTasks", booking.taskId).state, "已取消");
  f.reject("technician", "flow.decide", { id: issue.id, approve: true, reason: "已取消不应再复核" }, /状态/);
});

test("已安排实验可取消，已记账领用须足量真实退回", () => {
  const f = fixture(), stock = createPhysicalStock(f), booking = createPhysicsBooking(f), arrangement = arrange(f, booking.id, { resources: [{ ref: stock.id, qty: 2 }] });
  const issue = f.run("teacher", "flow.create", { itemId: stock.id, kind: "领用", qty: 2, date: M.TODAY, arrangementId: arrangement.id, reason: "实验耗材领用" });
  f.run("admin", "flow.decide", { id: issue.id, approve: true, reason: "领用核验通过" });
  f.reject("admin", "booking.cancel", { id: booking.id, reason: "突发停课" }, /完成足量退回/);
  const returned = f.run("admin", "flow.create", { itemId: stock.id, kind: "退回", qty: 2, date: M.TODAY, arrangementId: arrangement.id, sourceFlowId: issue.id, reason: "取消后原单退回" });
  assert.equal(returned.state, "已记账");
  f.run("admin", "booking.cancel", { id: booking.id, reason: "突发停课" });
  assert.equal(get(f.db, "arrangements", arrangement.id).cancelledFrom, "已安排");
  assert.equal(get(f.db, "arrangements", arrangement.id).state, "已取消");
  assert.equal(get(f.db, "teachingTasks", booking.taskId).state, "已取消");
});

test("实验总结完成班级任务但不完成计划，并拦截未来完成日期", () => {
  const f = fixture(), booking = createPhysicsBooking(f), arrangement = arrange(f, booking.id);
  const task = get(f.db, "teachingTasks", booking.taskId), plan = get(f.db, "plans", get(f.db, "planItems", task.planItemId).planId), before = M.metrics(f.db, "S1").done;
  f.reject("teacher", "booking.summary", { id: arrangement.id, actualDate: "2026-09-01", effect: "效果良好", improvement: "", equipmentCondition: "完好", note: "", overviewImages: [], studentImages: [] }, /晚于统计日期/);
  const summary = f.run("teacher", "booking.summary", { id: arrangement.id, actualDate: M.TODAY, effect: "学生完成测量并形成记录", improvement: "增加一次误差讨论", equipmentCondition: "全部完好", note: "", overviewImages: [], studentImages: [] });
  assert.equal(summary.arrangementId, arrangement.id);
  assert.equal(get(f.db, "teachingTasks", task.id).state, "已完成");
  assert.equal(get(f.db, "arrangements", arrangement.id).state, "已完成");
  assert.equal(get(f.db, "plans", plan.id).state, "已发布");
  assert.equal(M.metrics(f.db, "S1").done, before + 1);
  f.reject("teacher", "booking.summary", { id: arrangement.id, actualDate: M.TODAY, effect: "重复", equipmentCondition: "完好" }, /状态|已提交/);
});

test("科学学科可独立完成计划任务、预约、安排、总结和统计闭环", () => {
  const f = fixture(), task = f.db.teachingTasks.find(row => row.school === "S1" && row.classId === "S1-C2" && row.planItemId === "S1-P4-I1"), before = M.metrics(f.db, "S1", "TERM26", "科学").done;
  assert.ok(task, "科学班级实验任务应由计划和任课关系生成");
  const booking = f.run("teacher", "booking.create", { taskId: task.id, requestedDate: M.TODAY, requestedPeriod: 3, groups: 8, requestedResources: [], note: "科学探究预约" }, task.teacherId);
  const arrangement = f.run("admin", "booking.arrange", { id: booking.id, venueType: "实验室", roomId: "S1-L4", venueText: "", scheduledDate: M.TODAY, startPeriod: 3, endPeriod: 3, technicianId: "S1-T0", resources: [{ ref: "S1-A7", qty: 1 }], note: "科学实验室安排" });
  const summary = f.run("teacher", "booking.summary", { id: arrangement.id, actualDate: M.TODAY, effect: "学生完成观察、测量与记录", improvement: "补充校园样方对比", equipmentCondition: "放大镜完好", note: "", overviewImages: [], studentImages: [] }, task.teacherId);
  for (const row of [get(f.db, "teachingTasks", task.id), get(f.db, "bookings", booking.id), get(f.db, "arrangements", arrangement.id), get(f.db, "summaries", summary.id)]) {
    assert.equal(row.subject, "科学");
    assert.equal(row.subjectCode, "SCI");
  }
  assert.equal(M.metrics(f.db, "S1", "TERM26", "科学").done, before + 1);
  assert.deepEqual(M.auditRelations(f.db), []);
});

test("入库明细直接保存物品信息并受管理方式约束", () => {
  const f = fixture();
  const base = { supplier: "测试供应商", date: M.TODAY, purchaseDate: M.TODAY, note: "" };
  f.reject("admin", "receipt.create", { ...base, items: [{ classificationCode: "BAD-QTY-MAINT", name: "错误数量型维保物品", spec: "测试", category: "耗材", unit: "件", trackingMode: "QUANTITY", maintenanceRequired: true, qty: 1, price: 10, roomId: "" }] }, /周期维保只适用于单件编号设备/);
  f.reject("admin", "receipt.create", { ...base, items: [{ classificationCode: "BAD-CONSUMABLE-SERIAL", name: "错误单件耗材", spec: "测试", category: "耗材", unit: "件", trackingMode: "SERIALIZED", maintenanceRequired: false, qty: 1, price: 10, roomId: "" }] }, /耗材和危化品须按数量库存管理/);
  f.reject("admin", "receipt.create", { ...base, items: [{ classificationCode: "BAD-HAZ-SERIAL", name: "错误单件危化品", spec: "测试", category: "危化品", unit: "瓶", trackingMode: "SERIALIZED", maintenanceRequired: false, qty: 1, price: 10, roomId: "" }] }, /耗材和危化品须按数量库存管理/);
  const receipt = f.run("admin", "receipt.create", { ...base, items: [{ classificationCode: "OK-SERIAL-MAINT", name: "周期维保测试设备", spec: "V1", category: "物理仪器", unit: "台", trackingMode: "SERIALIZED", maintenanceRequired: true, qty: 1, price: 100, roomId: "", nextMaintenance: "2027-01-01" }] });
  const asset = f.db.assets.find(row => row.sourceId === receipt.id);
  assert.equal(asset.classificationCode, "OK-SERIAL-MAINT");
  assert.equal(asset.name, "周期维保测试设备");
  assert.equal(asset.maintenanceRequired, true);
});

test("数量库存的存放房间必须与仪器学科兼容", () => {
  const f = fixture();
  const item = { classificationCode: "TEST-PH-QTY-ROOM", name: "物理数量型配件", spec: "P1", category: "物理仪器", unit: "套", trackingMode: "QUANTITY", maintenanceRequired: false };
  f.reject("admin", "inventory.save", { ...item, min: 1, expiry: "", roomId: "S1-L2" }, /与存放房间学科或存放条件不一致/);
  f.reject("admin", "receipt.create", { supplier: "测试供应商", date: M.TODAY, purchaseDate: M.TODAY, note: "", items: [{ ...item, qty: 2, price: 20, roomId: "S1-L2", nextMaintenance: "" }] }, /与存放房间学科不一致/);
  const pending = f.run("admin", "inventory.save", { ...item, min: 1, expiry: "", roomId: "" });
  assert.equal(pending.roomId, "");
  assert.equal(pending.state, "待分配");
  f.reject("admin", "inventory.place", { id: pending.id, roomId: "S1-R4" }, /暂不支持|未知|不支持/);
  const stoppedRoom = get(f.db, "rooms", "S1-L2");
  f.run("admin", "base.save", { table: "rooms", id: stoppedRoom.id, name: stoppedRoom.name, type: stoppedRoom.type, subject: stoppedRoom.subject, state: "停用", roomNo: stoppedRoom.roomNo, area: stoppedRoom.area, seats: stoppedRoom.seats, builder: stoppedRoom.builder, builtAt: stoppedRoom.builtAt, stage: stoppedRoom.stage, features: stoppedRoom.features, hazardStorage: true, note: stoppedRoom.note });
  const chemistryTask = f.db.teachingTasks.find(task => task.school === "S1" && task.classId === "S1-C2" && task.planItemId === "S1-P2-I1");
  const request = f.run("admin", "booking.create", { taskId: chemistryTask.id, requestedDate: M.TODAY, requestedPeriod: 2, groups: 8, requestedResources: [{ itemId: "IT2", qty: 1 }, { itemId: "IT8", qty: 1 }], note: "按物品类型提出补充需求" });
  assert.ok(request.requestedResources.every(resource => resource.name && resource.itemId), "预约明细直接保存物品类型");
  f.reject("admin", "booking.arrange", { id: request.id, venueType: "其他", roomId: "", venueText: "临时实验场地", scheduledDate: M.TODAY, startPeriod: 2, endPeriod: 2, technicianId: "S1-T0", resources: [{ ref: "S1-A2", qty: 1 }] }, /房间已停用/);
  f.reject("admin", "booking.arrange", { id: request.id, venueType: "其他", roomId: "", venueText: "临时实验场地", scheduledDate: M.TODAY, startPeriod: 2, endPeriod: 2, technicianId: "S1-T0", resources: [{ ref: "S1-I2", qty: 1 }] }, /房间已停用/);
  f.reject("admin", "flow.create", { itemId: "S1-I2", kind: "领用", qty: 1, date: M.TODAY, reason: "停用房间不得出库" }, /存放房间已停用/);
  f.reject("admin", "flow.decide", { id: "LY-20260831-001", approve: true, reason: "停用后不得复核记账" }, /存放房间已停用/);
});

test("房间是资产、库存和入库明细的唯一存放关系", () => {
  const f = fixture();
  assert.equal(f.db.labs, undefined);
  for (const row of [...f.db.assets, ...f.db.inventory]) {
    assert.equal(Object.hasOwn(row, "labId"), false);
    assert.equal(Object.hasOwn(row, "location"), false);
    assert.ok(Object.hasOwn(row, "roomId"));
    assert.ok(row.name && row.classificationCode && row.spec && row.unit);
  }
  const receipt = f.run("admin", "receipt.create", {
    supplier: "测试供应商", date: M.TODAY, purchaseDate: M.TODAY, note: "逐项维保日期",
    items: [
      { itemId: "IT3", qty: 1, price: 450, roomId: "", nextMaintenance: "2027-01-15" },
      { itemId: "IT4", qty: 1, price: 680, roomId: "", nextMaintenance: "2027-03-20" }
    ]
  });
  const assets = f.db.assets.filter(asset => asset.sourceId === receipt.id);
  assert.equal(assets.length, 2);
  assert.ok(assets.every(asset => asset.state === "待存放" && asset.roomId === ""));
  assert.equal(assets.find(asset => asset.itemId === "IT3").nextMaintenance, "2027-01-15");
  assert.equal(assets.find(asset => asset.itemId === "IT4").nextMaintenance, "2027-03-20");
  f.reject("admin", "asset.transfer", { id: assets[0].id, roomId: "S1-R4", date: M.TODAY, reason: "不提供存放调拨" }, /暂不支持|未知|不支持/);
  assert.equal(receipt.items.every(item => Object.hasOwn(item, "roomId") && !Object.hasOwn(item, "labId")), true);
});

test("入库即建立库存余额，未分配房间保持待分配", () => {
  const f = fixture(), target = get(f.db, "inventory", "S1-I2"), before = target.stock;
  const receipt = f.run("admin", "receipt.create", { supplier: "耗材供应商", date: M.TODAY, purchaseDate: M.TODAY, note: "先入库后分配", items: [{ itemId: "IT8", qty: 3, price: 9, roomId: "", nextMaintenance: "" }] });
  const source = f.db.inventory.find(row => row.itemId === "IT8" && row.roomId === "");
  const flow = f.db.flows.find(row => row.receiptId === receipt.id);
  assert.ok(source);
  assert.equal(source.stock, 3);
  assert.equal(flow.itemId, source.id);
  f.reject("admin", "inventory.place", { id: source.id, roomId: "S1-L2" }, /暂不支持|未知|不支持/);
  assert.equal(get(f.db, "inventory", target.id).stock, before);
  assert.equal(f.db.inventory.some(row => row.id === source.id), true);
});

test("危化品入库保持待库存复核，第二人通过后才完成入库", () => {
  const f = fixture(), before = get(f.db, "inventory", "S1-I4").stock;
  const receipt = f.run("admin", "receipt.create", { supplier: "危化品供应商", date: M.TODAY, purchaseDate: M.TODAY, note: "", items: [{ itemId: "IT10", qty: 2, price: 15, roomId: "S1-L2", nextMaintenance: "", expiry: "2027-12-31" }] });
  const flow = f.db.flows.find(row => row.receiptId === receipt.id);
  assert.equal(receipt.state, "待库存复核");
  assert.equal(flow.state, "待复核");
  assert.equal(get(f.db, "inventory", "S1-I4").stock, before);
  assert.equal(get(f.db, "inventory", "S1-I4").pendingReceiptId, receipt.id);
  f.reject("admin", "flow.decide", { id: flow.id, approve: true, reason: "本人确认" }, /不能复核本人/);
  f.run("technician", "flow.decide", { id: flow.id, approve: true, reason: "第二人核对数量和批次" });
  assert.equal(get(f.db, "inventory", "S1-I4").stock, before + 2);
  assert.equal(get(f.db, "inventory", "S1-I4").expiry, "2027-06-30", "同房间混合余额保留较早有效期作为保守口径");
  assert.equal(get(f.db, "inventory", "S1-I4").pendingReceiptId, undefined);
  assert.equal(get(f.db, "receipts", receipt.id).state, "已入库");
});

test("含危化品的整单入库任一明细驳回时整单回滚且采购可重新入库", () => {
  const f = fixture(), filterPaper = get(f.db, "inventory", "S1-I2"), hazardousStock = get(f.db, "inventory", "S1-I4");
  const beforePaper = filterPaper.stock, beforeHazard = hazardousStock.stock;
  const purchase = f.run("admin", "purchase.create", {
    purpose: "含危化品的整单驳回测试", date: M.TODAY,
    items: [
      { itemId: "IT3", qty: 1, price: 450 },
      { itemId: "IT8", qty: 2, price: 9 },
      { itemId: "IT10", qty: 1, price: 15 }
    ]
  });
  f.run("district", "purchase.decide", { id: purchase.id, approve: true, reason: "同意采购" });
  const placements = [
    { itemId: "IT9", qty: 7, price: 1, roomId: "S1-L1", nextMaintenance: "2027-01-15" },
    { roomId: "S1-L2", nextMaintenance: "" },
    { roomId: "S1-L2", nextMaintenance: "", expiry: "2027-12-31" }
  ];
  const receipt = f.run("admin", "receipt.create", { purchaseId: purchase.id, supplier: "综合供应商", date: M.TODAY, purchaseDate: M.TODAY, note: "整单到货", placements });
  assert.deepEqual(receipt.items.map(({ itemId, qty, price }) => ({ itemId, qty, price })), [{ itemId: "IT3", qty: 1, price: 450 }, { itemId: "IT8", qty: 2, price: 9 }, { itemId: "IT10", qty: 1, price: 15 }], "到货存放信息不得覆盖已审批采购明细");
  const relatedFlows = f.db.flows.filter(row => row.receiptId === receipt.id), provisionalAssets = f.db.assets.filter(row => row.sourceId === receipt.id);
  assert.equal(receipt.state, "待库存复核");
  assert.equal(relatedFlows.length, 2);
  assert.ok(relatedFlows.every(row => row.state === "待复核"));
  assert.ok(provisionalAssets.every(row => row.state === "待库存复核"));
  assert.equal(filterPaper.stock, beforePaper);
  assert.equal(hazardousStock.stock, beforeHazard);
  const hazardFlow = relatedFlows.find(row => row.snapshot.itemId === "IT10");
  f.run("technician", "flow.decide", { id: hazardFlow.id, approve: false, reason: "危化品批次信息不完整，整单驳回" });
  assert.equal(get(f.db, "receipts", receipt.id).state, "库存复核驳回");
  assert.equal(get(f.db, "purchases", purchase.id).state, "已通过");
  assert.equal(get(f.db, "purchases", purchase.id).receiptId, "");
  const rolledBack = f.db.flows.filter(row => row.receiptId === receipt.id);
  assert.equal(rolledBack.filter(row => row.state === "已驳回").length, 1);
  assert.ok(rolledBack.filter(row => row.id !== hazardFlow.id).every(row => row.state === "整单撤销"));
  assert.equal(get(f.db, "inventory", "S1-I2").stock, beforePaper);
  assert.equal(get(f.db, "inventory", "S1-I4").stock, beforeHazard);
  assert.equal(f.db.assets.some(row => row.sourceId === receipt.id && row.state === "待库存复核"), false);
  const retry = f.run("admin", "receipt.create", { purchaseId: purchase.id, supplier: "综合供应商", date: M.TODAY, purchaseDate: M.TODAY, note: "补全批次后重新入库", placements });
  assert.equal(retry.state, "待库存复核");
  assert.notEqual(retry.id, receipt.id);
  assert.equal(get(f.db, "purchases", purchase.id).receiptId, retry.id);
});

test("危化品到货必须登记有效期且不得与未清零的过期余额混存", () => {
  const missing = fixture();
  missing.reject("admin", "inventory.save", { itemId: "IT10", min: 1, expiry: "", roomId: "" }, /登记.*有效期/);
  missing.reject("admin", "inventory.save", { itemId: "IT10", min: 1, expiry: "2026-08-30", roomId: "" }, /不能早于当前日期/);
  missing.reject("admin", "receipt.create", { supplier: "危化品供应商", date: M.TODAY, purchaseDate: M.TODAY, note: "", items: [{ itemId: "IT10", qty: 1, price: 15, roomId: "S1-L2", nextMaintenance: "", expiry: "" }] }, /登记.*有效期/);

  const f = fixture(), stock = get(f.db, "inventory", "S1-I4");
  stock.expiry = "2026-08-30";
  f.reject("admin", "receipt.create", { supplier: "危化品供应商", date: M.TODAY, purchaseDate: M.TODAY, note: "", items: [{ itemId: "IT10", qty: 1, price: 15, roomId: "S1-L2", nextMaintenance: "", expiry: "2027-12-31" }] }, /过期库存尚未清零/);
  const disposal = f.run("admin", "flow.create", { itemId: stock.id, kind: "处置", qty: stock.stock, date: M.TODAY, reason: "清理过期库存" });
  f.run("technician", "flow.decide", { id: disposal.id, approve: true, reason: "核对后处置" });
  const receipt = f.run("admin", "receipt.create", { supplier: "危化品供应商", date: M.TODAY, purchaseDate: M.TODAY, note: "新批次", items: [{ itemId: "IT10", qty: 1, price: 15, roomId: "S1-L2", nextMaintenance: "", expiry: "2027-12-31" }] });
  const flow = f.db.flows.find(row => row.receiptId === receipt.id);
  assert.equal(get(f.db, "inventory", stock.id).expiry, "2027-12-31");
  f.run("technician", "flow.decide", { id: flow.id, approve: true, reason: "核对新批次有效期" });
  assert.equal(get(f.db, "inventory", stock.id).stock, 1);
  assert.equal(get(f.db, "inventory", stock.id).expiry, "2027-12-31");
});

test("待复核出库占用可用库存，不能由多笔申请超量", () => {
  const f = fixture(), stock = get(f.db, "inventory", "S1-I4");
  assert.equal(stock.stock, 2);
  const pending = f.run("admin", "flow.create", { itemId: stock.id, kind: "处置", qty: 2, date: M.TODAY, reason: "到期处置" });
  assert.equal(pending.state, "待复核");
  assert.equal(get(f.db, "inventory", stock.id).stock, 2, "pending flow reserves but does not post");
  f.reject("technician", "flow.create", { itemId: stock.id, kind: "领用", qty: 1, date: M.TODAY, reason: "超量申请" }, /当前可用0瓶|库存不足/);
  f.run("technician", "flow.decide", { id: pending.id, approve: true, reason: "处置数量核对" });
  assert.equal(get(f.db, "inventory", stock.id).stock, 0);
});

test("耗材退回必须关联原已记账领用且不得超量", () => {
  const f = fixture(), stock = get(f.db, "inventory", "S1-I2"), opening = stock.stock;
  const issue = f.run("admin", "flow.create", { itemId: stock.id, kind: "领用", qty: 3, date: M.TODAY, reason: "实验领用" });
  assert.equal(issue.state, "已记账");
  assert.equal(get(f.db, "inventory", stock.id).stock, opening - 3);
  f.reject("admin", "flow.create", { itemId: stock.id, kind: "退回", qty: 1, date: M.TODAY, reason: "无来源退回", sourceFlowId: "" }, /关联记录不存在/);
  const returned = f.run("admin", "flow.create", { itemId: stock.id, kind: "退回", qty: 2, date: M.TODAY, reason: "剩余物料退回", sourceFlowId: issue.id });
  assert.equal(returned.sourceFlowId, issue.id);
  assert.equal(get(f.db, "inventory", stock.id).stock, opening - 1);
  f.reject("admin", "flow.create", { itemId: stock.id, kind: "退回", qty: 2, date: M.TODAY, reason: "超过原领用", sourceFlowId: issue.id }, /不能超过原领用/);
});

test("退回是唯一可关联原流水的业务并继承原安排任务，净领用只扣真实退回", () => {
  const f = fixture(), stock = createPhysicalStock(f), booking = createPhysicsBooking(f), arrangement = arrange(f, booking.id, { resources: [{ ref: stock.id, qty: 2 }] });
  const issue = f.run("admin", "flow.create", { itemId: stock.id, kind: "领用", qty: 2, date: M.TODAY, arrangementId: arrangement.id, reason: "安排领用" });
  assert.equal(issue.state, "已记账");
  assert.equal(Object.hasOwn(issue, "sourceFlowId"), false);
  f.reject("admin", "flow.create", { itemId: stock.id, kind: "损耗", qty: 1, date: M.TODAY, sourceFlowId: issue.id, reason: "伪装退回" }, /只有退回业务/);
  f.reject("admin", "flow.create", { itemId: stock.id, kind: "退回", qty: 1, date: "2026-08-30", sourceFlowId: issue.id, reason: "日期过早" }, /不能早于原领用日期/);
  f.reject("admin", "flow.create", { itemId: stock.id, kind: "退回", qty: 1, date: M.TODAY, sourceFlowId: issue.id, arrangementId: "S1-AP1", reason: "篡改安排" }, /继承原领用所属实验安排/);
  f.db.flows.push({ id: "LEGACY-NOT-RETURN", school: "S1", itemId: stock.id, kind: "损耗", qty: 2, date: M.TODAY, sourceFlowId: issue.id, state: "已记账" });
  f.reject("admin", "booking.cancel", { id: booking.id, reason: "伪关联不能冲销领用" }, /完成足量退回/);
  const returned = f.run("admin", "flow.create", { itemId: stock.id, kind: "退回", qty: 2, date: M.TODAY, sourceFlowId: issue.id, reason: "原单退回" });
  assert.equal(returned.arrangementId, arrangement.id);
  assert.equal(returned.taskId, booking.taskId);
  assert.equal(returned.sourceFlowId, issue.id);
  f.run("admin", "booking.cancel", { id: booking.id, reason: "真实退回后取消" });
});

test("关联实验安排的领用必须命中实际器材且净领用与待复核合计不超配置", () => {
  const f = fixture(), stock = createPhysicalStock(f), booking = createPhysicsBooking(f), arrangement = arrange(f, booking.id, { resources: [{ ref: stock.id, qty: 2 }] });
  f.reject("teacher", "flow.create", { itemId: "S1-I2", kind: "领用", qty: 1, date: M.TODAY, arrangementId: arrangement.id, reason: "未配置物品" }, /不在该实验安排/);
  f.reject("teacher", "flow.create", { itemId: stock.id, kind: "领用", qty: 3, date: M.TODAY, arrangementId: arrangement.id, reason: "超过配置" }, /超过实验安排配置量/);
  const first = f.run("teacher", "flow.create", { itemId: stock.id, kind: "领用", qty: 1, date: M.TODAY, arrangementId: arrangement.id, reason: "第一笔待复核" });
  f.reject("teacher", "flow.create", { itemId: stock.id, kind: "领用", qty: 2, date: M.TODAY, arrangementId: arrangement.id, reason: "待复核叠加超量" }, /超过实验安排配置量/);
  f.run("admin", "flow.decide", { id: first.id, approve: true, reason: "第一笔通过" });
  const second = f.run("teacher", "flow.create", { itemId: stock.id, kind: "领用", qty: 1, date: M.TODAY, arrangementId: arrangement.id, reason: "第二笔待复核" });
  f.reject("teacher", "flow.create", { itemId: stock.id, kind: "领用", qty: 1, date: M.TODAY, arrangementId: arrangement.id, reason: "记账与待复核合计超量" }, /超过实验安排配置量/);
  f.run("admin", "flow.decide", { id: second.id, approve: true, reason: "第二笔通过" });
  f.run("admin", "flow.create", { itemId: stock.id, kind: "退回", qty: 1, date: M.TODAY, sourceFlowId: first.id, reason: "退回后释放领用额度" });
  const replacement = f.run("teacher", "flow.create", { itemId: stock.id, kind: "领用", qty: 1, date: M.TODAY, arrangementId: arrangement.id, reason: "使用释放额度" });
  assert.equal(replacement.state, "待复核");
});

test("设备处理不含借还动作，旧维修状态机命令不可用", () => {
  const noLoan = fixture();
  noLoan.reject("admin", "asset.lend", { id: "S1-A5", borrower: "校内教师", date: M.TODAY, due: "2026-09-05", reason: "不提供借用" }, /暂不支持|未知|不支持/);
  noLoan.reject("admin", "loan.return", { id: "S1-A5", date: M.TODAY }, /暂不支持|未知|不支持/);
  for (const command of ["repair.create", "repair.start", "repair.finish", "repair.accept", "repair.cancel", "repair.decide"]) noLoan.reject("admin", command, { id: "WX-20260824-001" }, /暂不支持|未知|不支持/);
});

test("系统不提供设备调拨、库存调拨和借还业务", () => {
  const f = fixture();
  assert.equal(f.db.moves, undefined);
  assert.equal(f.db.loans, undefined);
  f.reject("admin", "asset.transfer", { id: "S1-A1", roomId: "S1-L1", date: M.TODAY, reason: "不提供调拨" }, /暂不支持|未知|不支持/);
  f.reject("admin", "inventory.transfer", { id: "S1-I2", roomId: "S1-L1", qty: 1, date: M.TODAY, reason: "不提供调拨" }, /暂不支持|未知|不支持/);
});

test("危化品存放条件和过期限制覆盖入库、实际安排、领用与复核", () => {
  const storage = fixture();
  storage.reject("admin", "receipt.create", { supplier: "危化品供应商", date: M.TODAY, purchaseDate: M.TODAY, note: "", items: [{ itemId: "IT10", qty: 1, price: 15, roomId: "S1-L1", nextMaintenance: "", expiry: "2027-12-31" }] }, /存放房间学科不一致/);
  const chemicalRoom = storage.run("admin", "base.save", { table: "rooms", name: "化学准备室", roomNo: "B202", type: "准备室", subject: "化学", area: 40, seats: "", builder: "", builtAt: "", stage: "高中", features: "通风", hazardStorage: false, note: "", state: "可用" });
  storage.reject("admin", "inventory.save", { classificationCode: "401010009", name: "测试危化品", spec: "500mL", category: "危化品", unit: "瓶", trackingMode: "QUANTITY", min: 1, expiry: "2027-12-31", roomId: chemicalRoom.id }, /存放条件不一致/);
  const hazardRoom = storage.run("admin", "base.save", { table: "rooms", name: "危化品储存室", roomNo: "B203", type: "准备室", subject: "化学", area: 30, seats: "", builder: "", builtAt: "", stage: "高中", features: "防爆柜与通风", hazardStorage: true, note: "", state: "可用" });
  const hazardStock = storage.run("admin", "inventory.save", { classificationCode: "401010009", name: "测试危化品", spec: "500mL", category: "危化品", unit: "瓶", trackingMode: "QUANTITY", min: 1, expiry: "2027-12-31", roomId: hazardRoom.id });
  assert.equal(get(storage.db, "inventory", hazardStock.id).roomId, hazardRoom.id);
  const currentChemical = get(storage.db, "rooms", "S1-L2");
  storage.reject("admin", "base.save", { table: "rooms", id: currentChemical.id, name: currentChemical.name, type: currentChemical.type, subject: currentChemical.subject, state: currentChemical.state, roomNo: currentChemical.roomNo, area: currentChemical.area, seats: currentChemical.seats, builder: currentChemical.builder, builtAt: currentChemical.builtAt, stage: currentChemical.stage, features: currentChemical.features, hazardStorage: false, note: currentChemical.note }, /仍存放危化品/);

  const initial = M.seed(), expired = get(initial, "inventory", "S1-I4"); expired.expiry = "2026-08-30"; const f = fixture(initial), chemistryTask = f.db.teachingTasks.find(task => task.school === "S1" && task.classId === "S1-C2" && task.planItemId === "S1-P2-I1");
  const booking = f.run("teacher", "booking.create", { taskId: chemistryTask.id, requestedDate: M.TODAY, requestedPeriod: 2, groups: 8, requestedResources: [{ itemId: "IT10", qty: 1 }], note: "申请物品类型，不指定过期库存余额" }, "S1-T2");
  assert.equal(booking.requestedResources[0].itemId, "IT10");
  assert.equal(booking.requestedResources[0].name, "浓硫酸");
  f.reject("admin", "booking.arrange", { id: booking.id, venueType: "实验室", roomId: "S1-L2", venueText: "", scheduledDate: M.TODAY, startPeriod: 2, endPeriod: 2, technicianId: "S1-T0", resources: [{ ref: expired.id, qty: 1 }] }, /已过期/);
  f.reject("admin", "flow.create", { itemId: expired.id, kind: "领用", qty: 1, date: M.TODAY, reason: "过期仍领用" }, /过期危化品/);
  f.reject("admin", "flow.create", { itemId: expired.id, kind: "入库", qty: 1, date: M.TODAY, reason: "过期仍入库" }, /过期危化品/);
  assert.equal(f.run("admin", "flow.create", { itemId: expired.id, kind: "损耗", qty: 1, date: M.TODAY, reason: "过期破损核销" }).state, "待复核");
  assert.equal(f.run("admin", "flow.create", { itemId: expired.id, kind: "处置", qty: 1, date: M.TODAY, reason: "过期处置" }).state, "待复核");

  const reviewFixture = fixture(), reviewStock = get(reviewFixture.db, "inventory", "S1-I4"), pendingIssue = reviewFixture.run("admin", "flow.create", { itemId: reviewStock.id, kind: "领用", qty: 1, date: M.TODAY, reason: "到期前申请" });
  get(reviewFixture.db, "inventory", reviewStock.id).expiry = "2026-08-30";
  reviewFixture.reject("technician", "flow.decide", { id: pendingIssue.id, approve: true, reason: "到期后不得通过" }, /已过期|过期危化品/);
});

test("维修、报废和易耗品损耗严格按参考系统直接登记", () => {
  const f = fixture();
  const repair = f.run("teacher", "repair.register", { assetId: "S1-A1", qty: 2, cost: 120.5, maintenanceDate: M.TODAY, vendor: "青浦维修服务部", content: "调焦机构维修" });
  assert.deepEqual(Object.keys(repair).sort(), ["assetId", "content", "cost", "id", "kind", "maintenanceDate", "qty", "registeredAt", "registrar", "school", "snapshot", "vendor"].sort());
  assert.equal(repair.kind, "维修");
  assert.equal(get(f.db, "assets", "S1-A1").state, "正常使用", "维修登记不改变设备状态");
  assert.equal(repair.registrar, "张明华");
  const edited = f.run("teacher", "repair.register", { id: repair.id, assetId: "S1-A1", qty: 1, cost: 88, maintenanceDate: M.TODAY, vendor: "青浦维修服务部", content: "更换调焦齿轮" });
  assert.equal(edited.content, "更换调焦齿轮");
  assert.equal(edited.cost, 88);
  f.reject("admin", "repair.register", { assetId: "S1-A2", qty: 1, cost: 0, maintenanceDate: "2026-09-01", vendor: "", content: "未来日期" }, /维修日期不能晚于当前日期/);

  const scrap = f.run("admin", "scrap.register", { assetIds: ["S1-A6"], scrapDate: M.TODAY, reason: "达到报废年限且无法修复", operator: "顾文清" });
  assert.deepEqual(Object.keys(get(f.db, "repairs", scrap.id)).sort(), ["assetId", "batchId", "id", "kind", "operator", "qty", "reason", "school", "scrapDate", "snapshot"].sort());
  assert.equal(get(f.db, "assets", "S1-A6").state, "已报废");
  f.run("admin", "scrap.delete", { id: scrap.id });
  assert.equal(get(f.db, "assets", "S1-A6").state, "正常使用", "删除报废登记恢复设备状态");

  const stock = get(f.db, "inventory", "S1-I2"), before = stock.stock;
  const loss = f.run("admin", "loss.register", { itemId: stock.id, qty: 2, date: M.TODAY, reason: "实验操作中破损", operator: "顾文清" });
  assert.deepEqual(Object.keys(loss).sort(), ["date", "id", "itemId", "kind", "operator", "qty", "reason", "school", "snapshot"].sort());
  assert.equal(get(f.db, "inventory", stock.id).stock, before - 2, "损耗登记直接扣减现有数量");
  f.run("admin", "loss.delete", { id: loss.id });
  assert.equal(get(f.db, "inventory", stock.id).stock, before, "删除损耗登记恢复现有数量");

  const first = get(f.db, "inventory", "S1-I1"), second = get(f.db, "inventory", "S1-I2"), firstBefore = first.stock, secondBefore = second.stock;
  const batch = f.run("admin", "loss.batch", { date: M.TODAY, reason: "批量登记课堂实验损耗", operator: "顾文清", rows: [{ itemId: first.id, qty: 1 }, { itemId: second.id, qty: 2 }] });
  assert.equal(batch.ids.length, 2, "一次表单可登记多条易耗品明细");
  assert.equal(get(f.db, "inventory", first.id).stock, firstBefore - 1);
  assert.equal(get(f.db, "inventory", second.id).stock, secondBefore - 2);
});

test("管理员可更正和删除无下游记录的采购入库并保持账实一致", () => {
  const f = fixture();
  let purchase = f.run("admin", "purchase.create", { purpose: "测试采购", date: M.TODAY, items: [{ classificationCode: "TEST-CRUD-E", name: "测试器材", spec: "T1", category: "物理仪器", unit: "台", trackingMode: "SERIALIZED", maintenanceRequired: false, qty: 1, price: 10 }] });
  purchase = f.run("admin", "purchase.create", { id: purchase.id, purpose: "更正后的采购用途", date: M.TODAY, items: purchase.items });
  assert.equal(purchase.purpose, "更正后的采购用途");
  f.run("admin", "purchase.delete", { id: purchase.id, reason: "测试删除" });
  assert.equal(f.db.purchases.some(row => row.id === purchase.id), false);

  const receipt = f.run("admin", "receipt.create", { supplier: "测试供应商", date: M.TODAY, purchaseDate: M.TODAY, note: "", items: [{ classificationCode: "TEST-ROLLBACK-E", name: "可回滚设备", spec: "T1", category: "物理仪器", unit: "台", trackingMode: "SERIALIZED", maintenanceRequired: false, qty: 1, price: 10, roomId: "", nextMaintenance: "", expiry: "" }] });
  const generated = f.db.assets.find(asset => asset.sourceId === receipt.id);
  assert.ok(generated);
  f.run("admin", "receipt.update", { id: receipt.id, supplier: "更正供应商", date: M.TODAY, purchaseDate: M.TODAY, note: "已更正" });
  assert.equal(get(f.db, "assets", generated.id).supplier, "更正供应商");
  f.run("admin", "receipt.delete", { id: receipt.id, reason: "录入错误" });
  assert.equal(f.db.receipts.some(row => row.id === receipt.id), false);
  assert.equal(f.db.assets.some(asset => asset.sourceId === receipt.id), false);

  const stockReceipt = f.run("admin", "receipt.create", { supplier: "测试供应商", date: M.TODAY, purchaseDate: M.TODAY, note: "", items: [{ classificationCode: "TEST-ROLLBACK-Q", name: "回滚保护耗材", spec: "T1", category: "耗材", unit: "包", trackingMode: "QUANTITY", maintenanceRequired: false, qty: 5, price: 2, roomId: "S1-L1", nextMaintenance: "", expiry: "" }] });
  const stockFlow = f.db.flows.find(flow => flow.receiptId === stockReceipt.id), stock = get(f.db, "inventory", stockFlow.itemId);
  f.run("admin", "flow.create", { itemId: stock.id, kind: "领用", qty: 1, date: M.TODAY, reason: "形成下游流水" });
  f.reject("admin", "receipt.delete", { id: stockReceipt.id, reason: "不应删除" }, /已有其他库存流水/);
  f.reject("admin", "receipt.delete", { id: "S1-RK0", reason: "不应删除" }, /已有维修、报废、实验安排或附件/);
  assert.deepEqual(M.auditRelations(f.db), []);
});

test("管理员可更正未执行计划、预约、安排和总结并同步回退状态", () => {
  const f = fixture();
  let plan = f.run("admin", "plan.create", { term: "TERM26", subject: "物理", name: "可修改测试计划", grade: "高一", version: "测试版", items: [planItemInput("EXTRA", { experimentName: "全新测试实验", chapter: "测试章", required: "选做", mode: "演示", plannedWeek: 4 })] });
  plan = f.run("admin", "plan.create", { id: plan.id, term: "TERM26", subject: "物理", name: "已修改测试计划", grade: "高一", version: "测试版2", items: [planItemInput("EXTRA", { experimentName: "全新测试实验2", chapter: "测试章2", required: "选做", mode: "演示", plannedWeek: 5 })] });
  assert.equal(plan.name, "已修改测试计划");
  const planItemIds = new Set(f.db.planItems.filter(item => item.planId === plan.id).map(item => item.id)), task = f.db.teachingTasks.find(row => planItemIds.has(row.planItemId));
  const booking = f.run("admin", "booking.create", { taskId: task.id, requestedDate: M.TODAY, requestedPeriod: 3, requestedResources: [], note: "测试预约" });
  f.run("admin", "booking.resubmit", { id: booking.id, requestedDate: M.TODAY, requestedPeriod: 4, requestedResources: [], note: "已修改" });
  assert.equal(get(f.db, "bookings", booking.id).requestedPeriod, 4);
  f.run("admin", "booking.delete", { id: booking.id, reason: "测试删除" });
  assert.equal(get(f.db, "teachingTasks", task.id).state, "待预约");

  const arrangement = get(f.db, "arrangements", "S1-AP1");
  f.run("admin", "arrangement.update", { id: arrangement.id, venueType: arrangement.venueType, roomId: arrangement.roomId, venueText: arrangement.venueText, scheduledDate: arrangement.scheduledDate, startPeriod: arrangement.startPeriod, endPeriod: arrangement.endPeriod, technicianId: arrangement.technicianId, note: "更正安排说明", resources: arrangement.resources });
  const summary = f.run("admin", "booking.summary", { id: arrangement.id, actualDate: M.TODAY, effect: "良好", improvement: "", equipmentCondition: "完好", note: "", overviewImages: [], studentImages: [] });
  f.run("admin", "summary.update", { id: summary.id, actualDate: M.TODAY, effect: "更正为优秀", improvement: "", equipmentCondition: "完好", note: "" });
  assert.equal(get(f.db, "summaries", summary.id).effect, "更正为优秀");
  f.run("admin", "summary.delete", { id: summary.id, reason: "需重新填写" });
  assert.equal(get(f.db, "arrangements", arrangement.id).state, "已安排");
  assert.equal(get(f.db, "bookings", arrangement.bookingId).state, "已安排");
  assert.deepEqual(M.auditRelations(f.db), []);
});

test("基础档案、安全记录和待归档资料支持受保护的改删", () => {
  const f = fixture();
  const emptySchool = f.run("district", "base.save", { table: "schools", name: "临时空学校", code: "TMP001", stage: "高中" });
  f.run("district", "base.delete", { table: "schools", id: emptySchool.id, reason: "测试删除" });
  assert.equal(f.db.schools.some(row => row.id === emptySchool.id), false);
  const department = f.run("admin", "base.save", { table: "departments", name: "临时部门", state: "启用" });
  f.run("admin", "base.delete", { table: "departments", id: department.id, reason: "测试删除" });
  f.reject("admin", "base.delete", { table: "departments", id: "S1-D2", reason: "不应删除" }, /关联人员/);

  let task = f.run("district", "task.create", { roomId: "S1-L1", kind: "测试检查", due: M.TODAY, owner: "顾文清" });
  task = f.run("district", "task.create", { id: task.id, roomId: "S1-L1", kind: "修改后的检查", due: M.TODAY, owner: "顾文清" });
  const check = f.run("admin", "check.create", { taskId: task.id, roomId: task.roomId, kind: task.kind, date: M.TODAY, items: "检查项目", result: "正常", note: "" });
  f.run("admin", "check.update", { id: check.id, roomId: task.roomId, kind: task.kind, date: M.TODAY, items: "更正检查项目", result: "发现隐患", note: "", title: "测试隐患", owner: "顾文清", level: "一般关注", due: M.TODAY });
  const hazard = f.db.hazards.find(row => row.checkId === check.id);
  f.run("admin", "hazard.update", { id: hazard.id, title: "更正后的隐患", owner: "顾文清", level: "需优先处理", due: M.TODAY, note: "" });
  f.run("admin", "hazard.delete", { id: hazard.id, reason: "确认误报" });
  assert.equal(get(f.db, "checks", check.id).result, "正常");
  f.run("admin", "check.delete", { id: check.id, reason: "测试删除" });
  assert.equal(get(f.db, "tasks", task.id).state, "待检查");
  f.run("district", "inspection-task.delete", { id: task.id, reason: "测试删除" });

  const file = f.run("admin", "archive.create", { relatedTable: "assets", relatedId: "S1-A1", name: "待修改.txt", category: "设备建设", content: "原内容", dataUrl: "", mime: "text/plain", archive: false });
  f.run("admin", "archive.update", { id: file.id, name: "已修改.txt", category: "设备建设", content: "新内容" });
  assert.equal(get(f.db, "archives", file.id).content, "新内容");
  f.run("admin", "archive.delete", { id: file.id, reason: "测试删除" });
  assert.deepEqual(M.auditRelations(f.db), []);
});

test("教师可为本人创建或本人任务关联的计划上传附件", () => {
  const f = fixture(), attachment = f.run("teacher", "archive.create", { relatedTable: "plans", relatedId: "S1-P1", name: "物理计划说明.txt", category: "实验教学", content: "计划执行说明", dataUrl: "", mime: "text/plain", archive: false }, "S1-T1");
  assert.equal(attachment.relatedId, "S1-P1");
  f.reject("teacher", "archive.create", { relatedTable: "plans", relatedId: "S1-P1", name: "无关学科计划.txt", category: "实验教学", content: "不应上传", dataUrl: "", mime: "text/plain", archive: false }, /教师只能上传本人业务资料/, "S1-T2");
});

test("教学资源上传即入库并支持教师本人维护与管理员维护", () => {
  const f = fixture();
  const created = f.run("teacher", "resource.create", { resourceType: "课件", subject: "物理", grades: ["高一", "高二"], experimentCategory: "创新实验", title: "牛顿第二定律课件", description: "课堂讲解与探究活动", originalName: "newton.pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", size: 2048, content: "课件文本摘要" }, "S1-T1");
  assert.ok(get(f.db, "resources", created.id), "教师上传后应直接出现在资源库");
  assert.deepEqual(get(f.db, "resources", created.id).grades, ["高一", "高二"]);
  f.run("teacher", "resource.update", { id: created.id, resourceType: "课件", subject: "物理", grades: ["高一"], experimentCategory: "必做", title: "牛顿第二定律课件（修订）", description: "修订版", content: "修订内容" }, "S1-T1");
  assert.equal(get(f.db, "resources", created.id).title, "牛顿第二定律课件（修订）");
  f.reject("teacher", "resource.update", { id: created.id, resourceType: "课件", subject: "物理", grades: ["高一"], experimentCategory: "必做", title: "越权修改", content: "不应写入" }, /教师只能修改本人上传的资源。/, "S1-T2");
  f.run("admin", "resource.update", { id: created.id, resourceType: "课件", subject: "物理", grades: ["高一"], experimentCategory: "选做", title: "管理员修订", content: "管理员修订内容" }, "S1-T0");
  assert.equal(get(f.db, "resources", created.id).experimentCategory, "选做");
  f.run("admin", "resource.delete", { id: created.id, reason: "测试清理" }, "S1-T0");
  assert.equal(f.db.resources.some(row => row.id === created.id), false);
  assert.deepEqual(M.auditRelations(f.db), []);
});

test("教师写入按专业学科或当前学期有效任课授权，计划拒绝跨学科实验来源", () => {
  const resource = { resourceType: "课件", subject: "化学", grades: ["高一"], experimentCategory: "必做", title: "跨学科越权资源", description: "", originalName: "forbidden.txt", mime: "text/plain", size: 8, content: "forbidden", term: "TERM26" };
  const f = fixture();
  f.reject("teacher", "resource.create", resource, /教师只能维护本人专业学科/, "S1-T1");
  f.reject("teacher", "customExperiment.save", { name: "跨学科越权实验", code: "FORBIDDEN-CX", subject: "化学", grade: "高一", textbookId: "TB-HX-01", term: "TERM26", supportedModes: ["分组"], equipmentRequirements: [{ name: "烧杯", unit: "个", quantity: 1 }] }, /教师只能维护本人专业学科/, "S1-T1");

  const comprehensiveSeed = M.seed(), scienceTeacher = get(comprehensiveSeed, "staff", "S1-T5");
  scienceTeacher.subject = "综合";
  M.normalizeSubjectFields(comprehensiveSeed);
  const comprehensive = fixture(comprehensiveSeed);
  comprehensive.reject("teacher", "resource.create", { ...resource, subject: "物理" }, /综合教师须具备当前学期对应学科的有效任课关系/, "S1-T5");
  const allowed = comprehensive.run("teacher", "resource.create", { ...resource, subject: "科学", title: "综合教师科学资源", originalName: "science.txt", content: "science" }, "S1-T5");
  assert.equal(allowed.subjectCode, "SCI");
  comprehensive.reject("teacher", "resource.delete", { id: allowed.id, reason: "错误学期删除", term: "TERM25" }, /综合教师须具备当前学期对应学科的有效任课关系/, "S1-T5");
  comprehensive.run("teacher", "resource.delete", { id: allowed.id, reason: "当前学期删除", term: "TERM26" }, "S1-T5");

  const custom = f.run("admin", "customExperiment.save", { name: "化学自定义实验来源", code: "CHEM-CX-SOURCE", subject: "化学", grade: "高一", textbookId: "TB-HX-01", supportedModes: ["分组"], equipmentRequirements: [{ name: "烧杯", unit: "个", quantity: 1 }] });
  f.reject("admin", "plan.compile", { term: "TERM26", subject: "物理", grade: "高一", textbookId: "TB-WL-01", name: "跨学科来源注入计划", classIds: ["S1-C2"], items: [{ sourceType: "学校自定义", sourceId: custom.id, mode: "分组", scheduleType: "WEEK", plannedWeek: 4 }] }, /自定义实验与当前学科、年级或教材不匹配/);
});

function legacyV2() {
  return {
    version: 2, revision: 4, seq: 20, updatedAt: "2026-08-31T08:00:00+08:00",
    settings: { region: "上海市青浦区", authority: "青浦区教育局", repairDays: 7, lowStock: true, weeklyReport: true, syncReminder: true, exportEnabled: true },
    schools: [{ id: "S1", code: "QP001", name: "迁移测试学校", stage: "高中", street: "测试街道" }],
    terms: [{ id: "TERM26", name: "2026-2027学年第一学期", start: M.TODAY, end: "2027-01-29" }],
    catalog: [{ id: "E1", code: "WL-01", name: "测量物体的速度", subject: "物理", required: "必做", mode: "分组", chapter: "第一章", equipment: "小车、刻度尺", grade: "高一", version: "人教版", periods: 1 }],
    staff: [
      { id: "S1-T0", school: "S1", name: "管理员", role: "admin", subject: "综合", title: "管理员", phone: "", enabled: true, qualification: "" },
      { id: "S1-T1", school: "S1", name: "物理教师", role: "teacher", subject: "物理", title: "教师", phone: "", enabled: true, qualification: "教师资格证" },
      { id: "S1-T4", school: "S1", name: "实验员", role: "technician", subject: "综合", title: "实验员", phone: "", enabled: true, qualification: "实验室管理资质" }
    ],
    labs: [{ id: "S1-L1", school: "S1", name: "物理实验室", subject: "物理", room: "A201", area: 96, seats: 48, type: "教学实验室", managerId: "S1-T4", state: "可预约" }],
    classes: [{ id: "S1-C1", school: "S1", name: "高一1班", grade: "高一", students: 41, teacherIds: ["S1-T1"] }],
    assets: [{ id: "S1-A1", code: "QP001-001", school: "S1", classificationCode: "202020002", name: "力学轨道小车", model: "J2101", category: "物理仪器", unit: "台", price: 680, purchaseDate: "2024-03-15", labId: "S1-L1", location: "A201", supplier: "测试供应商", state: "正常使用", sourceId: "S1-RK1", nextMaintenance: "2027-01-01" }],
    inventory: [{ id: "S1-I1", school: "S1", classificationCode: "301010001", name: "记录纸", spec: "A4", unit: "包", unitPrice: 10, stock: 5, opening: 5, min: 1, hazard: false, expiry: "2027-06-30", labId: "S1-L1", location: "A201" }],
    purchases: [], receipts: [], repairs: [], moves: [], loans: [], flows: [],
    plans: [{ id: "S1-P1", school: "S1", term: "TERM26", catalogId: "E1", classId: "S1-C1", teacherId: "S1-T1", mode: "分组", date: M.TODAY, state: "已完成", name: "旧版物理计划" }],
    bookings: [{ id: "S1-YY1", school: "S1", planId: "S1-P1", teacherId: "S1-T1", labId: "S1-L1", managerId: "S1-T4", applicant: "物理教师", applicantId: "S1-T1", bookedAt: "2026-08-31T08:00:00+08:00", date: M.TODAY, start: "08:00", end: "08:45", period: 1, groups: 8, resources: [{ ref: "S1-A1", qty: 1 }], state: "已完成", actualDate: M.TODAY, summary: "完成实验" }],
    checks: [], hazards: [], tasks: [], archives: [], submissions: [], logs: []
  };
}

test("v2数据可迁移为v11且保留房间、任课、计划任务和完成总结", () => {
  const migrated = M.migrate(legacyV2());
  assert.equal(migrated.version, M.VERSION);
  assert.equal(migrated.labs, undefined);
  assert.equal(Object.hasOwn(migrated.schools[0], "street"), false);
  assert.equal(get(migrated, "rooms", "S1-L1").roomNo, "A201");
  assert.equal(get(migrated, "rooms", "S1-L1").hazardStorage, false);
  assert.equal(Object.hasOwn(get(migrated, "classes", "S1-C1"), "teacherIds"), false);
  assert.equal(migrated.assignments.length, 1);
  assert.equal(migrated.plans.length, 1);
  assert.equal(migrated.planItems.length, 1);
  assert.equal(migrated.catalog, undefined, "迁移后移除独立实验目录");
  assert.equal(migrated.textbooks.length, 1, "旧版教材应迁移为新版教材档案");
  assert.equal(migrated.experimentCatalog.length, 1, "旧版实验目录应迁移为官方实验目录");
  assert.equal(migrated.planItems[0].sourceType, "官方目录");
  assert.equal(migrated.planItems[0].experimentName, "测量物体的速度");
  assert.equal(migrated.planItems[0].equipment, "小车、刻度尺");
  assert.equal(migrated.teachingTasks.length, 1);
  assert.equal(migrated.teachingTasks[0].state, "已完成");
  assert.equal(Object.hasOwn(migrated.plans[0], "classId"), false);
  assert.equal(Object.hasOwn(migrated.plans[0], "revisionNo"), false);
  assert.equal(Object.hasOwn(migrated.planItems[0], "sortNo"), false);
  assert.equal(Object.hasOwn(migrated.bookings[0], "planId"), false);
  assert.equal(Object.hasOwn(migrated.bookings[0], "labId"), false);
  assert.equal(migrated.arrangements.length, 1);
  assert.equal(get(migrated, "staff", "S1-T4").role, "admin");
  assert.equal(migrated.summaries.length, 1);
  for (const row of [migrated.plans[0], migrated.planItems[0], migrated.teachingTasks[0], migrated.bookings[0], migrated.arrangements[0], migrated.summaries[0]]) {
    assert.equal(row.subject, "物理", `${row.id}应继承物理学科`);
    assert.equal(row.subjectCode, "PHY", `${row.id}应补齐PHY编码`);
  }
  assert.ok(migrated.periods.every(period => period.term), "migrated periods must be term-scoped");
  assert.equal(M.periodFor(migrated, "S1", 1, "TERM26").id, "S1-K1");
  assert.equal(migrated.assets[0].roomId, "S1-L1");
  assert.equal(migrated.assets[0].sourceId, "", "旧入库单不存在时清除悬空来源引用");
  assert.equal(Object.hasOwn(migrated.assets[0], "labId"), false);
  assert.equal(Object.hasOwn(migrated.inventory[0], "opening"), false);
  assert.equal(migrated.itemCatalog, undefined, "迁移后取消独立物品目录");
  assert.ok(migrated.logs.some(log => log.action === "数据结构升级"));
  assert.deepEqual(M.auditRelations(migrated), [], "迁移后不应保留悬空引用或失配状态");
  assert.deepEqual(M.migrate(migrated), migrated, "migrating v11 is idempotent");
  assert.throws(() => M.migrate({ version: 1 }), /仅支持从v2至v10升级到当前版本/);
});

test("同版本v11也会归一学科别名、修正编码并按上游覆盖漂移", () => {
  const raw = M.seed(), biologyPlan = get(raw, "plans", "S1-P3"), biologyItem = get(raw, "planItems", "S1-P3-I1"), biologyTask = raw.teachingTasks.find(row => row.planItemId === biologyItem.id), booking = get(raw, "bookings", "S1-YY1"), arrangement = raw.arrangements.find(row => row.bookingId === booking.id);
  biologyPlan.subject = "生命科学"; biologyPlan.subjectCode = "WRONG";
  biologyItem.subject = "物理"; biologyItem.subjectCode = "PHY";
  biologyTask.subject = "化学"; biologyTask.subjectCode = "CHEM";
  get(raw, "rooms", "S1-L3").subject = "生物学";
  get(raw, "textbooks", "TB-SW-01").subject = "生物学";
  raw.resources.find(row => row.subject === "生物").subject = "生命科学";
  booking.subject = "化学"; booking.subjectCode = "CHEM";
  arrangement.subject = "化学"; arrangement.subjectCode = "CHEM";
  const migrated = M.migrate(raw);
  for (const row of [get(migrated, "plans", biologyPlan.id), get(migrated, "planItems", biologyItem.id), get(migrated, "teachingTasks", biologyTask.id)]) {
    assert.equal(row.subject, "生物");
    assert.equal(row.subjectCode, "BIO");
  }
  assert.equal(get(migrated, "rooms", "S1-L3").subject, "生物");
  assert.equal(get(migrated, "rooms", "S1-L3").subjectCode, "BIO");
  assert.equal(get(migrated, "bookings", booking.id).subject, "物理");
  assert.equal(get(migrated, "bookings", booking.id).subjectCode, "PHY");
  assert.equal(get(migrated, "arrangements", arrangement.id).subject, "物理");
  assert.equal(get(migrated, "arrangements", arrangement.id).subjectCode, "PHY");
  assert.deepEqual(M.auditRelations(migrated), []);
  assert.deepEqual(M.migrate(migrated), migrated, "同版本学科归一应保持幂等");
});

test("早期v11三学科样例会幂等补齐科学业务链", () => {
  const old = M.seed(), sciencePlanIds = new Set(old.plans.filter(row => row.subject === "科学").map(row => row.id)), scienceItemIds = new Set(old.planItems.filter(row => sciencePlanIds.has(row.planId)).map(row => row.id));
  delete old.subjectModelVersion;
  old.staff = old.staff.filter(row => row.subject !== "科学");
  old.rooms = old.rooms.filter(row => row.subject !== "科学");
  old.assignments = old.assignments.filter(row => row.subject !== "科学");
  old.plans = old.plans.filter(row => !sciencePlanIds.has(row.id));
  old.planTargets = old.planTargets.filter(row => !sciencePlanIds.has(row.planId));
  old.planItems = old.planItems.filter(row => !scienceItemIds.has(row.id));
  old.teachingTasks = old.teachingTasks.filter(row => !scienceItemIds.has(row.planItemId));
  old.textbooks = old.textbooks.filter(row => row.subject !== "科学");
  old.experimentCatalog = old.experimentCatalog.filter(row => row.subject !== "科学");
  old.resources = old.resources.filter(row => row.subject !== "科学");
  old.assets = old.assets.filter(row => row.category !== "科学仪器");
  old.receipts.forEach(receipt => { receipt.items = receipt.items.filter(row => row.category !== "科学仪器"); });
  const migrated = M.migrate(old);
  assert.equal(migrated.subjectModelVersion, 1);
  assert.equal(migrated.staff.filter(row => row.subject === "科学").length, 3);
  assert.equal(migrated.rooms.filter(row => row.subject === "科学" && row.type === "教学实验室").length, 3);
  assert.equal(migrated.assignments.filter(row => row.subject === "科学").length, 18);
  assert.equal(migrated.plans.filter(row => row.subject === "科学").length, 3);
  assert.equal(migrated.teachingTasks.filter(row => row.subject === "科学").length, 6);
  assert.equal(migrated.assets.filter(row => row.category === "科学仪器").length, 3);
  assert.deepEqual(M.auditRelations(migrated), []);
  assert.deepEqual(M.migrate(migrated), migrated, "科学样例补齐不可重复执行");
});

test("已迁移v11缺少教材目录时可从计划快照恢复编制数据", () => {
  const raw = M.seed();
  delete raw.subjectModelVersion;
  raw.classes = raw.classes.filter(row => row.grade === "高一");
  raw.assignments = raw.assignments.filter(row => raw.classes.some(klass => klass.id === row.classId));
  raw.plans.forEach(plan => { plan.name = `${plan.subject}实验计划`; });
  delete raw.textbooks;
  delete raw.experimentCatalog;
  raw.plans.forEach(plan => { delete plan.textbookId; });
  raw.planItems.forEach(item => { item.sourceType = "历史来源"; item.sourceId = ""; delete item.textbookId; });
  const repaired = M.migrate(raw);
  assert.ok(repaired.textbooks.length > 0, "应恢复教材档案");
  assert.ok(repaired.experimentCatalog.length > 0, "应恢复官方实验目录");
  assert.ok(repaired.planItems.every(item => item.sourceType === "官方目录" && item.sourceId), "计划项应重新绑定官方目录");
  assert.deepEqual([...new Set(repaired.classes.filter(row => row.school === "S1").map(row => row.grade))], ["高一", "高二", "高三"], "旧版本地数据应补齐其他年级班级");
  assert.equal(repaired.classes.filter(row => row.school === "S1" && row.grade === "高二").length, 2, "高二应补齐两个示例班级");
  assert.equal(repaired.classes.filter(row => row.school === "S1" && row.grade === "高三").length, 2, "高三应补齐两个示例班级");
  assert.ok(repaired.plans.every(plan => new RegExp(`^${repaired.terms[0].name} · 高一(${M.subjects.map(M.subjectLabel).join("|")})实验计划$`).test(plan.name)), "旧样例计划名称应升级为四学科统一格式");
  assert.deepEqual(M.auditRelations(repaired), []);
  const userEdited = M.clone(repaired);
  userEdited.classes = userEdited.classes.filter(row => row.id !== "S1-C3");
  userEdited.assignments = userEdited.assignments.filter(row => row.classId !== "S1-C3");
  const reopened = M.migrate(userEdited);
  assert.equal(reopened.classes.some(row => row.id === "S1-C3"), false, "已完成补齐标记后不应重建用户删除的示例班级");
  assert.equal(reopened.assignments.some(row => row.classId === "S1-C3"), false, "已完成补齐标记后不应重建用户删除的任课关系");
  assert.deepEqual(M.auditRelations(reopened), []);
});

test("旧版待复核易耗品损耗升级为直接登记并同步库存", () => {
  const legacy = M.seed(), stock = get(legacy, "inventory", "S1-I2"), before = stock.stock;
  legacy.version = 9;
  legacy.flows.unshift({ id: "LEGACY-LOSS-PENDING", school: "S1", itemId: stock.id, kind: "损耗", qty: 2, date: M.TODAY, reason: "历史待复核损耗", applicant: "顾文清", applicantId: "S1-T0", reviewer: "", state: "待复核", snapshot: { itemId: stock.itemId, classificationCode: stock.classificationCode, name: stock.name, spec: stock.spec, unit: stock.unit, roomId: stock.roomId } });
  legacy.flows.unshift({ id: "LEGACY-LOSS-REJECTED", school: "S1", itemId: stock.id, kind: "损耗", qty: 1, date: M.TODAY, reason: "历史已驳回损耗", applicant: "顾文清", applicantId: "S1-T0", reviewer: "陈小红", state: "已驳回", snapshot: { itemId: stock.itemId, classificationCode: stock.classificationCode, name: stock.name, spec: stock.spec, unit: stock.unit, roomId: stock.roomId } });
  const migrated = M.migrate(legacy), migratedLoss = get(migrated, "flows", "LEGACY-LOSS-PENDING");
  assert.equal(get(migrated, "inventory", stock.id).stock, before - 2);
  assert.equal(migratedLoss.operator, "顾文清");
  assert.equal(Object.hasOwn(migratedLoss, "state"), false);
  assert.equal(migrated.flows.some(flow => flow.id === "LEGACY-LOSS-REJECTED"), false);
  assert.deepEqual(M.migrate(migrated), migrated, "直接登记迁移不可重复扣减库存");
});

test("历史人员培训数据迁移后不再保留", () => {
  const legacy = M.seed();
  legacy.version = 7;
  legacy.staff[0].trainings = [{ name: "历史记录", date: M.TODAY, hours: 1, evidence: "历史附件" }];
  legacy.staff[0].trainingCount = "1次";
  legacy.staff[0].trainingStatus = "已完成";
  legacy.archives.push({ id: "FILE-TRAINING", category: "师资培训" });
  const migrated = M.migrate(legacy);
  assert.ok(migrated.staff.every(person => !["trainings", "trainingCount", "trainingStatus"].some(key => Object.hasOwn(person, key))));
  assert.ok(migrated.archives.every(file => file.category !== "师资培训"));
});

test("早期v3无学期节次可就地升级为学期分版数据", () => {
  const legacy = M.seed();
  legacy.periods = legacy.periods.filter(period => period.term === "TERM26").map(period => { const copy = { ...period }; delete copy.term; return copy; });
  delete get(legacy, "rooms", "S1-L2").hazardStorage;
  legacy.schools[0].street = "应移除街镇";
  legacy.itemCatalog = [{ id: "IT1", classificationCode: "202040001", name: "光学显微镜", spec: "XSP-16A", category: "生物仪器", unit: "台", trackingMode: "SERIALIZED", maintenanceRequired: true, hazard: false }];
  legacy.inventory[0].opening = legacy.inventory[0].stock;
  legacy.plans[0].revisionNo = 1;
  legacy.planItems[0].sortNo = 1;
  legacy.flows[0].sourceFlowId = "INVALID-SOURCE";
  legacy.bookings[0].requestedResources = [{ ref: "S1-A4", qty: 2 }];
  legacy.bookings[0].state = "待总结";
  legacy.arrangements.find(row => row.bookingId === legacy.bookings[0].id).state = "待总结";
  legacy.teachingTasks.find(row => row.id === legacy.bookings[0].taskId).state = "待总结";
  const upgraded = M.migrate(legacy);
  assert.ok(upgraded.periods.every(period => period.term));
  assert.ok(M.periodFor(upgraded, "S1", 1, "TERM26"));
  assert.ok(M.periodFor(upgraded, "S1", 1, "TERM25"));
  assert.equal(get(upgraded, "rooms", "S1-L2").hazardStorage, true);
  assert.equal(Object.hasOwn(upgraded.schools[0], "street"), false);
  assert.equal(upgraded.itemCatalog, undefined);
  assert.equal(Object.hasOwn(upgraded.inventory[0], "opening"), false);
  assert.equal(Object.hasOwn(upgraded.plans[0], "revisionNo"), false);
  assert.equal(Object.hasOwn(upgraded.planItems[0], "sortNo"), false);
  assert.equal(Object.hasOwn(upgraded.flows[0], "sourceFlowId"), false);
  assert.equal(upgraded.bookings[0].requestedResources[0].itemId, get(upgraded, "assets", "S1-A4").itemId);
  assert.equal(upgraded.bookings[0].requestedResources[0].qty, 2);
  assert.equal(upgraded.bookings[0].requestedResources[0].name, "力学轨道小车");
  assert.equal(upgraded.bookings[0].state, "已安排");
  assert.equal(upgraded.arrangements.find(row => row.bookingId === upgraded.bookings[0].id).state, "已安排");
  assert.equal(upgraded.teachingTasks.find(row => row.id === upgraded.bookings[0].taskId).state, "已安排");
  assert.deepEqual(M.migrate(upgraded), upgraded);
});

test("v5历史已准备状态迁移为已安排并保留说明", () => {
  const legacy = M.seed(), booking = legacy.bookings[0], arrangement = legacy.arrangements.find(row => row.bookingId === booking.id), task = legacy.teachingTasks.find(row => row.id === booking.taskId);
  legacy.version = 5;
  booking.state = "已准备";
  arrangement.state = "已准备";
  arrangement.preparation = "器材和环境已检查";
  arrangement.preparedBy = "S1-T4";
  arrangement.preparedAt = "2026-08-31T08:30:00+08:00";
  task.state = "已准备";
  const upgraded = M.migrate(legacy), migratedArrangement = upgraded.arrangements.find(row => row.bookingId === booking.id);
  assert.equal(upgraded.version, M.VERSION);
  assert.equal(upgraded.bookings[0].state, "已安排");
  assert.equal(migratedArrangement.state, "已安排");
  assert.equal(migratedArrangement.note, "历史准备记录：器材和环境已检查");
  assert.equal(Object.hasOwn(migratedArrangement, "preparation"), false);
  assert.equal(Object.hasOwn(migratedArrangement, "preparedAt"), false);
  assert.equal(upgraded.teachingTasks.find(row => row.id === task.id).state, "已安排");
});

test("CSV导入字段与设备/耗材入库表单一致，并直接保存物品信息", () => {
  const db = M.seed(), row = ["NEW-IMPORT-001", "新型光电门", "G1", "物理仪器", "套", "单件设备", "是", 2, 450, "A202", "P01", "2027-02-28", ""], source = M.csv([M.importHeader, row]), parsed = M.validateImport(source, db, "S1");
 assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.items[0].itemId, "NEW-IMPORT-001");
  assert.equal(parsed.items[0].name, "新型光电门");
  assert.equal(parsed.items[0].spec, "G1");
  assert.equal(parsed.items[0].category, "物理仪器");
  assert.equal(parsed.items[0].unit, "套");
  assert.equal(parsed.items[0].trackingMode, "SERIALIZED");
  assert.equal(parsed.items[0].maintenanceRequired, true);
  assert.equal(parsed.items[0].qty, 2);
 assert.equal(parsed.items[0].price, 450);
 assert.equal(parsed.items[0].roomId, "S1-R4");
 assert.equal(parsed.items[0].cabinetId, "S1-CAB-P01");
 assert.equal(parsed.items[0].nextMaintenance, "2027-02-28");
  assert.deepEqual(M.importHeader, ["分类编号", "物品名称", "规格型号", "分类", "单位", "管理方式", "需要周期维保", "数量", "单价（元）", "存放位置（房间）", "橱柜编号（可选）", "下次维保日期", "有效期"]);
  const incompatible = M.validateImport(M.csv([M.importHeader, [...row.slice(0, 9), "B201", ...row.slice(10)]]), db, "S1");
 assert.ok(incompatible.errors.some(message => /与存放房间学科不一致/.test(message)));
 get(db, "rooms", "S1-R4").state = "停用";
 const stopped = M.validateImport(source, db, "S1");
 assert.ok(stopped.errors.some(message => /存放房间已停用/.test(message)));
  const invalid = M.validateImport(M.csv([M.importHeader, ["NEW-CONSUMABLE", "载玻片", "7101型", "耗材", "盒", "数量库存", "否", 1, 10, "A201", "", "2027-02-28", ""]]), db, "S1");
 assert.ok(invalid.errors.some(message => /不需要维保日期/.test(message)));
  const hazardWithoutExpiry = M.validateImport(M.csv([M.importHeader, ["NEW-HAZARD", "新危化品", "500mL", "危化品", "瓶", "数量库存", "否", 1, 15, "B201", "", "", ""]]), db, "S1");
 assert.ok(hazardWithoutExpiry.errors.some(message => /危化品须登记未过期的有效期/.test(message)));
  const receiptFixture = fixture(), receipt = receiptFixture.run("admin", "receipt.create", { supplier: "测试供应商", date: M.TODAY, purchaseDate: M.TODAY, note: "", items: parsed.items });
  assert.equal(receipt.items[0].name, "新型光电门");
  assert.equal(receiptFixture.db.assets.filter(asset => asset.sourceId === receipt.id).length, 2);
 assert.throws(() => M.validateImport(M.csv([["名称", "规格", "数量"], ["旧模板", "X", 1]]), db, "S1"), /模板表头/);
});

test("四学科字典、显示别名和器材兼容范围稳定", () => {
  assert.deepEqual(M.subjectCodes, ["SCI", "PHY", "CHEM", "BIO"]);
  assert.equal(M.normalizeSubject("生物学"), "生物");
  assert.equal(M.subjectLabel("生物"), "生物学");
  assert.equal(M.subjectCode("生命科学"), "BIO");
  assert.equal(M.itemFitsSubject({ category: "科学仪器" }, "科学"), true);
  assert.equal(M.itemFitsSubject({ category: "科学仪器" }, "物理"), false);
  assert.equal(M.itemFitsSubject({ category: "危化品" }, "物理"), false);
  assert.equal(M.itemFitsSubject({ category: "耗材", subjectScopes: ["物理", "生物学"] }, "生物"), true);
  const seed = M.seed();
  assert.deepEqual({ schools: seed.schools.length, staff: seed.staff.length, rooms: seed.rooms.length, teachingLabs: seed.rooms.filter(row => row.type === "教学实验室").length, classes: seed.classes.length, assignments: seed.assignments.length, periods: seed.periods.length, assets: seed.assets.length, inventory: seed.inventory.length, plans: seed.plans.length, planItems: seed.planItems.length, teachingTasks: seed.teachingTasks.length, bookings: seed.bookings.length, arrangements: seed.arrangements.length, resources: seed.resources.length }, { schools: 3, staff: 18, rooms: 15, teachingLabs: 12, classes: 18, assignments: 72, periods: 48, assets: 21, inventory: 12, plans: 12, planItems: 18, teachingTasks: 36, bookings: 3, arrangements: 1, resources: 7 });
  assert.ok(seed.experimentCatalog.some(row => row.subject === "科学"));
  assert.ok(seed.resources.some(row => row.subject === "科学"));
  for (const subject of M.subjects) {
    const code = M.subjectCode(subject);
    assert.ok(seed.staff.some(row => row.role === "teacher" && row.subject === subject && row.subjectCode === code), `${subject}应有教师`);
    assert.ok(seed.rooms.some(row => row.type === "教学实验室" && row.subject === subject && row.subjectCode === code), `${subject}应有教学实验室`);
    assert.ok(seed.assignments.some(row => row.subject === subject && row.subjectCode === code), `${subject}应有任课关系`);
    assert.ok(seed.plans.some(row => row.subject === subject && row.subjectCode === code), `${subject}应有实验计划`);
    assert.ok(seed.teachingTasks.some(row => row.subject === subject && row.subjectCode === code), `${subject}应有班级实验任务`);
    assert.ok(M.metrics(seed, "S1", "TERM26", subject).required > 0, `${subject}应进入独立统计口径`);
  }
  assert.deepEqual(M.auditRelations(seed), []);
});

test("导航目标存在且区级、学校各角色的所有页面标签均可渲染", () => {
  assert.deepEqual(M.navigation.district.map(group => [group.label, ...group.items.map(item => item.label)]), [
    ["工作台", "区域总览", "智能问数"],
    ["组织与配置", "学校与上报", "人员与任课", "基础数据与设置"],
    ["教学监管", "实验计划监管", "实验开出统计"],
    ["资产监管", "设备资产", "易耗品账目", "维修与报废"],
    ["安全监管", "危化品安全监管"]
  ]);
  assert.deepEqual(M.navigation.school.map(group => [group.label, ...group.items.map(item => item.label)]), [
    ["工作台", "学校总览", "智能问数", "教学资源库"],
    ["教学运行", "实验计划", "预约与安排"],
    ["资产物资", "设备与入库", "易耗品账目", "维修与报废"],
    ["安全管理", "危化品安全管理"],
    ["基础设置", "实验室档案", "人员与班级"]
  ]);
  assert.deepEqual(M.navigationFor("school", "admin").flatMap(group => group.items.map(item => item.id)), M.navigation.school.flatMap(group => group.items.map(item => item.id)));
  assert.deepEqual(M.navigationFor("school", "teacher").flatMap(group => group.items.map(item => item.id)), ["dashboard", "ai-query", "archives", "experiments", "booking", "devices", "supplies", "repair"]);
  for (const [scope, groups] of Object.entries(M.navigation)) for (const group of groups) for (const item of group.items) {
    const target = path.join(__dirname, "../pages", scope, item.href);
    assert.ok(fs.existsSync(target), `${scope}/${item.href}`);
    assert.ok(fs.readFileSync(target, "utf8").includes(`<title>${item.label}</title>`), `${scope}/${item.href}标题须与菜单一致`);
  }
  const source = fs.readFileSync(path.join(__dirname, "../assets/app.js"), "utf8");
  const tabs = {
    schools: ["schools", "rooms", "cabinets", "submissions"], teachers: ["all", "teacher", "admin", "disabled"], staff: ["all", "teacher", "admin", "classes", "disabled"],
    labs: ["rooms", "cabinets"], equipment: ["assets", "receipts", "purchases"], devices: ["assets", "receipts", "purchases"],
    supplies: ["total", "ledger", "loss"], consumables: ["total", "ledger", "loss"], maintenance: ["repair", "scrap"], repair: ["repair", "scrap"],
    experiments: ["plans", "tasks", "mine"], booking: ["booked", "arranged", "pendingSummary", "mineBooked", "mineArranged", "minePendingSummary"], schedule: ["progress", "ranking", "subject", "grade", "class"], safety: ["hazards", "checks", "tasks"],
    settings: ["settings", "terms", "periods", "logs"], archives: ["all", "教学设计", "教案", "学案", "课件", "实验视频", "学习单"]
  };
  let rendered = 0;
  assert.doesNotMatch(source, /\["assignments", "任课关系"\]/, "人员管理不再单列任课关系页签");
  assert.doesNotMatch(source, /实验室人员分工/, "界面不再出现额外人员关系名称");
  assert.doesNotMatch(source, /roomAssignments\s*:/, "数据模型不再声明额外人员关系表");
  assert.doesNotMatch(source, /table === ["']roomAssignments["']/, "业务操作不再提供额外人员关系表单");
  assert.match(source, /设置任课班级/, "任课教师列表提供任课班级设置入口");
  assert.match(source, /scope !== "school" && schoolTables\.includes\(table\)/, "学校端基础表单不展示所属学校字段");
  assert.match(source, /schoolScopeColumns\(rawColumns\)/, "学校端列表按当前账号范围隐藏学校列");
  for (const label of ["易耗品总账", "易耗品分类账", "易耗品损耗登记", "仪器设备维修", "仪器设备报废"]) assert.match(source, new RegExp(label), `参考系统页签：${label}`);
  for (const label of ["classificationCode:分类编号", "maintenanceDate:维修日期", "scrapDate:报废日期", "date:损耗日期", "operator:经办人", "location:房间或橱柜"]) assert.match(source, new RegExp(label), `参考列表字段：${label}`);
  assert.match(source, /schoolScopeFields\.has\(k\)/, "学校端详情不展示所属学校字段");
  for (const role of ["district", "admin", "teacher"]) {
    const scope = role === "district" ? "district" : "school", seed = M.seed(), actor = M.actorFor(seed, role, "S1");
    for (const page of M.navigation[scope].flatMap(group => group.items)) {
      const pageTabs = page.id === "experiments" && scope === "district" ? ["plans", "tasks"] : tabs[page.id] || [""];
      for (const tab of pageTabs) {
        const app = { innerHTML: "" }, storage = new Map([[M.KEY, JSON.stringify(seed)]]), preferences = new Map([["lab-demo-identity", JSON.stringify({ role, school: "S1", personId: actor.id })]]);
        const store = map => ({ getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value) });
        const document = { documentElement: { dataset: {} }, body: { dataset: { scope, page: page.id } }, title: "", getElementById: id => id === "app" ? app : null, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
        const window = { LabDemo: M, addEventListener() {} };
        vm.runInNewContext(source, { window, document, localStorage: store(storage), sessionStorage: store(preferences), location: { search: `?tab=${encodeURIComponent(tab)}` }, URLSearchParams, Blob, console, setTimeout });
        assert.match(app.innerHTML, /<h1 class="page-title">/, `${scope}/${page.id}/${tab}`);
        assert.doesNotMatch(app.innerHTML, /\bundefined\b|\bNaN\b/, `${scope}/${page.id}/${tab}`);
        rendered++;
      }
    }
  }
  for (const [page, tabsForPage] of [["devices", ["assets", "receipts", "purchases"]], ["supplies", ["total", "ledger", "loss"]], ["repair", ["repair", "scrap"]]]) {
    const seed = M.seed(), actor = M.actorFor(seed, "admin", "S1");
    for (const tab of tabsForPage) {
      const app = { innerHTML: "" }, storage = new Map([[M.KEY, JSON.stringify(seed)]]), preferences = new Map([["lab-demo-identity", JSON.stringify({ role: "admin", school: "S1", personId: actor.id })]]);
      const store = map => ({ getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value) });
      const document = { documentElement: { dataset: {} }, body: { dataset: { scope: "school", page } }, title: "", getElementById: id => id === "app" ? app : null, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
      const window = { LabDemo: M, addEventListener() {} };
      vm.runInNewContext(source, { window, document, localStorage: store(storage), sessionStorage: store(preferences), location: { search: `?tab=${encodeURIComponent(tab)}` }, URLSearchParams, Blob, console, setTimeout });
      assert.doesNotMatch(app.innerHTML, /<th scope="col">学校<\/th>/, `学校端${page}/${tab}不显示学校列`);
    }
  }
  const scopedSeed = M.seed();
  const biologyOnlyLine = { itemId: "BIO-ONLY-ITEM", classificationCode: "BIO-ONLY", name: "仅生物观察仪", spec: "BIO-X", category: "生物仪器", unit: "台", trackingMode: "SERIALIZED", maintenanceRequired: false, qty: 1, price: 1, roomId: "S1-L3" };
  scopedSeed.purchases.unshift({ id: "BIO-ONLY-PURCHASE", school: "S1", purpose: "仅生物学设备", applicant: "顾文清", date: M.TODAY, state: "待审核", items: [biologyOnlyLine] });
  scopedSeed.receipts.unshift({ id: "BIO-ONLY-RECEIPT", school: "S1", purchaseId: "", date: M.TODAY, purchaseDate: M.TODAY, supplier: "测试供应商", operator: "顾文清", state: "已入库", note: "", items: [biologyOnlyLine] });
  const renderScoped = (tab, subject) => {
    const app = { innerHTML: "" }, storage = new Map([[M.KEY, JSON.stringify(scopedSeed)]]), actor = M.actorFor(scopedSeed, "admin", "S1"), preferences = new Map([["lab-demo-seed-active", "true"], ["lab-demo-identity", JSON.stringify({ role: "admin", school: "S1", personId: actor.id })], ["lab-demo-subject:school:S1:S1-T0", JSON.stringify(subject)]]);
    const store = map => ({ getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value) });
    const document = { documentElement: { dataset: {} }, body: { dataset: { scope: "school", page: "devices" } }, title: "", getElementById: id => id === "app" ? app : null, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
    const window = { LabDemo: M, addEventListener() {} };
    vm.runInNewContext(source, { window, document, localStorage: store(storage), sessionStorage: store(preferences), location: { search: `?tab=${encodeURIComponent(tab)}` }, URLSearchParams, Blob, console, setTimeout, performance: { getEntriesByType: () => [] } });
    return app.innerHTML;
  };
  for (const tab of ["purchases", "receipts"]) {
    assert.doesNotMatch(renderScoped(tab, "物理"), /仅生物观察仪/, `物理范围下${tab}不应显示纯生物采购记录`);
    assert.match(renderScoped(tab, "生物学"), /仅生物观察仪/, `生物学范围下${tab}应显示匹配记录`);
  }
  assert.ok(rendered >= 95, "合并实验员后按三种当前身份覆盖页面渲染");
  console.log(`  ${rendered} role/page/tab renders checked`);
});

console.log(`\n${checks} suites passed. v12 business relations, teaching resources, migration and rendering verified.`);
