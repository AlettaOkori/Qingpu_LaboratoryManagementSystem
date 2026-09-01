"use strict";
// Run: node new-demo/tests/check-demo.cjs — standard library only, no browser data changed.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const M = require("../assets/mock-data.js");
let checks = 0;
function test(name, fn) { fn(); checks++; console.log(`✓ ${name}`); }
function fixture() {
  let db = M.seed();
  const actor = role => M.actorFor(db, role, "S1");
  return { get db() { return db; }, actor, run(role, command, input) { const out = M.transact(db, actor(role), command, input, "2026-08-31T09:00:00+08:00"); db = out.db; return out.result; }, reject(role, cmd, p, regex) { const before = JSON.stringify(db); assert.throws(() => M.transact(db, actor(role), cmd, p), regex); assert.equal(JSON.stringify(db), before, "failed operations must be atomic"); } };
}
const line = { name: "测试显微镜", model: "XSP-16A", category: "生物仪器", unit: "台", qty: 2, price: 3580 };
const receipt = { labId: "S1-L3", supplier: "测试供应商", date: M.TODAY, purchaseDate: M.TODAY };
const reservation = { planId: "S1-P3", labId: "S1-L3", date: "2026-09-02", start: "09:00", end: "09:45", groups: 8, resources: [{ ref: "S1-A1", qty: 1 }] };

test("样例主键、资产编号和学校归属唯一", () => { const f = fixture(); for (const table of Object.keys(M.tableNames)) assert.equal(new Set(f.db[table].map(r => r.id)).size, f.db[table].length, table); assert.equal(new Set(f.db.assets.map(a => a.code)).size, 18); f.db.assets.forEach(a => assert.equal(M.find(f.db, "labs", a.labId).school, a.school)); assert.equal(M.metrics(f.db).assets, 18); assert.equal(M.metrics(f.db).required, 12); assert.equal(M.metrics(f.db).done, 0); assert.equal(M.metrics(f.db, "S1").pending, 4); assert.equal(M.metrics(f.db, "S1", "TERM25").rate, "不适用"); });
test("采购→区级审批→整单入库→单件资产来源", () => { const f = fixture(), order = f.run("admin", "purchase.create", { purpose: "教学补充", items: [line], date: M.TODAY }); f.reject("admin", "receipt.create", { ...receipt, purchaseId: order.id }, /状态/); f.run("district", "purchase.decide", { id: order.id, approve: true, reason: "同意" }); const r = f.run("technician", "receipt.create", { ...receipt, purchaseId: order.id }); assert.equal(f.db.assets.length, 20); assert.equal(f.db.assets.filter(a => a.sourceId === r.id).length, 2); assert.equal(M.find(f.db, "purchases", order.id).state, "已入库"); assert.equal(M.metrics(f.db).value - M.metrics(M.seed()).value, 7160); f.reject("admin", "receipt.create", { ...receipt, purchaseId: order.id }, /状态/); });
test("采购驳回、撤销与权限", () => { const f = fixture(); f.reject("teacher", "purchase.create", { items: [line], purpose: "test" }, /身份/); f.run("district", "purchase.decide", { id: "CG-20260831-001", approve: false, reason: "规格待补充" }); f.reject("district", "purchase.decide", { id: "CG-20260831-001", approve: true, reason: "通过" }, /状态/); const p = f.run("admin", "purchase.create", { items: [line], purpose: "测试", date: M.TODAY }); f.run("admin", "purchase.cancel", { id: p.id, reason: "需求调整" }); assert.equal(M.find(f.db, "purchases", p.id).state, "已撤销"); });
test("危险品到货不绕过双人复核", () => { const f = fixture(); const r = f.run("admin", "receipt.create", { ...receipt, labId: "S1-L2", items: [{ ...line, name: "无水乙醇", model: "分析纯500mL", category: "危化品", unit: "瓶", qty: 2, price: 15 }] }); const flow = f.db.flows.find(x => x.receiptId === r.id); assert.equal(flow.itemId, "S1-I3"); assert.equal(flow.state, "待复核"); assert.equal(M.find(f.db, "inventory", "S1-I3").stock, 12); f.reject("admin", "flow.decide", { id: flow.id, approve: true, reason: "同意" }, /本人/); f.run("technician", "flow.decide", { id: flow.id, approve: true, reason: "核验数量" }); assert.equal(M.find(f.db, "inventory", "S1-I3").stock, 14); });
test("普通耗材入库、领用、损耗、退回、处置和库存不足", () => { const f = fixture(); const act = (kind, qty) => f.run("admin", "flow.create", { itemId: "S1-I2", kind, qty, reason: "教学库存调整", date: M.TODAY }); act("入库", 10); assert.equal(M.metrics(f.db, "S1").low, 1); act("领用", 2); act("损耗", 1); act("退回", 1); act("处置", 1); assert.equal(M.find(f.db, "inventory", "S1-I2").stock, 15); f.reject("admin", "flow.create", { itemId: "S1-I2", kind: "领用", qty: 16, reason: "测试", date: M.TODAY }, /库存不足/); });
test("教师领用需复核，驳回不扣库存", () => { const f = fixture(); const r = f.run("teacher", "flow.create", { itemId: "S1-I1", kind: "领用", qty: 2, planId: "S1-P1", reason: "教学", date: M.TODAY }); assert.equal(r.state, "待复核"); f.run("admin", "flow.decide", { id: r.id, approve: false, reason: "数量调整" }); assert.equal(M.find(f.db, "inventory", "S1-I1").stock, 40); f.reject("teacher", "flow.create", { itemId: "S1-I1", kind: "入库", qty: 1, date: M.TODAY, reason: "测试" }, /只能提交领用/); });
test("入库中途异常回滚，不留半单资产", () => { const f = fixture(); f.reject("admin", "receipt.create", { ...receipt, items: [line, { ...line, qty: -1 }] }, /数量/); f.reject("admin", "receipt.create", { ...receipt, labId: "S2-L1", items: [line] }, /其他学校/); });
test("资产调拨与借还维护同一资产", () => { const f = fixture(); f.run("admin", "asset.transfer", { id: "S1-A1", labId: "S1-L2", date: M.TODAY, reason: "临时调配" }); assert.equal(M.find(f.db, "assets", "S1-A1").labId, "S1-L2"); assert.equal(M.find(f.db, "assets", "S1-A1").location, "B201"); const loan = f.run("technician", "asset.lend", { id: "S1-A1", borrower: "示例教师", date: M.TODAY, due: "2026-09-03", reason: "教学借用" }); assert.equal(M.find(f.db, "assets", "S1-A1").state, "借出"); f.run("admin", "loan.return", { id: loan.id, date: "2026-09-01" }); assert.equal(M.find(f.db, "assets", "S1-A1").state, "正常使用"); f.reject("admin", "asset.lend", { id: "S1-A4" }, /有效实验预约/); });
test("盘点差异和复核轨迹", () => { const f = fixture(); const r = f.run("admin", "asset.count", { id: "S1-A1", actual: 0, date: M.TODAY, reason: "存放位置未找到" }); assert.equal(r.difference, -1); f.reject("admin", "asset.count", { id: "S1-A1", actual: 1, date: M.TODAY, reason: "再次盘点" }, /未处理/); f.run("admin", "count.resolve", { id: r.id, reason: "在准备室找到并归位" }); assert.equal(M.find(f.db, "counts", r.id).state, "已复核"); });
test("维修申请、审批、完成及验收", () => { const f = fixture(); const r = f.run("teacher", "repair.create", { assetId: "S1-A2", kind: "维修", reason: "读数异常", due: "2026-09-07" }); f.run("district", "repair.decide", { id: r.id, approve: true, reason: "同意送修" }); f.run("technician", "repair.finish", { id: r.id, vendor: "示例服务商", cost: 120, reason: "已校准" }); assert.equal(M.find(f.db, "assets", "S1-A2").state, "维修中"); f.run("admin", "repair.accept", { id: r.id, reason: "验收正常", nextMaintenance: "2027-02-28" }); assert.equal(M.find(f.db, "assets", "S1-A2").state, "正常使用"); f.reject("admin", "repair.accept", { id: r.id, reason: "重复" }, /状态/); });
test("报废减少在账价值；驳回和撤销恢复原状态", () => { const f = fixture(), before = M.metrics(f.db).value; const r = f.run("admin", "repair.create", { assetId: "S1-A6", kind: "报废", reason: "超期损坏", due: "2026-09-07" }); f.run("district", "repair.decide", { id: r.id, approve: true, reason: "同意" }); assert.equal(M.metrics(f.db).value, before - 680); assert.equal(M.metrics(f.db).assets, 18); const a = f.run("admin", "repair.create", { assetId: "S1-A1", kind: "维保", reason: "周期维护", due: "2026-09-07" }); f.run("district", "repair.decide", { id: a.id, approve: false, reason: "改期" }); assert.equal(M.find(f.db, "assets", "S1-A1").state, "正常使用"); const b = f.run("teacher", "repair.create", { assetId: "S1-A1", kind: "维修", reason: "检查", due: "2026-09-07" }); f.run("teacher", "repair.cancel", { id: b.id, reason: "已排除" }); assert.equal(M.find(f.db, "assets", "S1-A1").state, "正常使用"); });
test("实验完成只计一次，必做与演示/分组分母独立", () => { const f = fixture(); f.run("teacher", "booking.complete", { id: "S1-YY1", attendees: 41, date: M.TODAY, reason: "完成测量并记录" }); assert.equal(M.metrics(f.db, "S1").rate, "25.0%"); assert.equal(M.metrics(f.db).rate, "8.3%"); assert.equal(M.teaching(f.db, "S1", "TERM26", "subject").find(r => r.name === "物理").done, 1); assert.equal(f.db.plans.filter(p => p.school === "S1" && M.find(f.db, "catalog", p.catalogId).required === "必做").length, 4); f.reject("teacher", "booking.complete", { id: "S1-YY1", attendees: 41, date: M.TODAY, reason: "重复" }, /状态/); });
test("预约审批→实验员准备→完成", () => { const f = fixture(); const b = f.run("admin", "booking.create", reservation); f.run("admin", "booking.decide", { id: b.id, approve: true, reason: "确认时段" }); f.run("technician", "booking.prepare", { id: b.id, reason: "器材已检查" }); f.reject("teacher", "booking.complete", { id: b.id, attendees: 41, date: "2026-09-02", reason: "测试越权" }, /本人实验/); f.run("admin", "booking.complete", { id: b.id, attendees: 41, date: "2026-09-02", reason: "已实施" }); assert.equal(M.find(f.db, "plans", "S1-P3").state, "已完成"); });
test("预约同班同教师冲突、学科、数量、重复计划校验", () => { const f = fixture(); f.reject("admin", "booking.create", { ...reservation, date: M.TODAY, start: "08:15", end: "09:00" }, /预约冲突/); f.reject("admin", "booking.create", { ...reservation, labId: "S1-L1" }, /学科/); f.reject("admin", "booking.create", { ...reservation, resources: [{ ref: "S1-A1", qty: 2 }] }, /数量不足/); f.reject("admin", "booking.create", { ...reservation, planId: "S1-P1", labId: "S1-L1" }, /有效预约/); f.reject("admin", "booking.create", { ...reservation, start: "10:00", end: "09:00" }, /时间段/); });
test("编制计划校验任课关系与学期，不重复统计", () => { const f = fixture(); const p = { term: "TERM26", catalogId: "E1", classId: "S1-C2", teacherId: "S1-T1", mode: "演示", date: "2026-09-08" }; f.run("teacher", "plan.create", p); assert.equal(M.metrics(f.db, "S1").required, 5); f.reject("teacher", "plan.create", p, /重复统计/); f.reject("admin", "plan.create", { ...p, catalogId: "E2", classId: "S1-C1" }, /学科不匹配/); });
test("安全任务→检查隐患→附件整改→退回→再复查关闭", () => { const f = fixture(); const task = f.run("district", "task.create", { labId: "S1-L2", kind: "专项检查", due: "2026-09-03", owner: "顾文清" }); f.run("technician", "check.create", { taskId: task.id, date: M.TODAY, items: "锁具检查", result: "发现隐患", note: "损坏", title: "锁具损坏", owner: "顾文清", level: "需优先处理", due: "2026-09-02" }); const hazard = f.db.hazards[0]; f.reject("admin", "hazard.submit", { id: hazard.id, attachmentId: "FILE-001", reason: "更换锁具" }, /关联当前隐患/); const file = f.run("admin", "archive.create", { name: "整改.txt", category: "安全管理", relatedTable: "hazards", relatedId: hazard.id, content: "演示整改材料", archive: true }); f.run("admin", "hazard.submit", { id: hazard.id, reason: "完成锁具更换", attachmentId: file.id }); f.run("district", "hazard.verify", { id: hazard.id, approve: false, reason: "补充复查记录" }); assert.equal(M.find(f.db, "hazards", hazard.id).state, "整改中"); f.run("admin", "hazard.submit", { id: hazard.id, reason: "已补充", attachmentId: file.id }); f.run("district", "hazard.verify", { id: hazard.id, approve: true, reason: "复查通过" }); assert.equal(M.find(f.db, "tasks", task.id).state, "已完成"); assert.equal(M.find(f.db, "hazards", hazard.id).state, "已关闭"); });
test("基础数据不能破坏有效任课关系和预约", () => { const f = fixture(), staff = M.find(f.db, "staff", "S1-T1"), lab = M.find(f.db, "labs", "S1-L1"); f.reject("admin", "base.save", { ...staff, table: "staff", enabled: false }, /未完成计划/); f.reject("admin", "base.save", { ...lab, table: "labs", seats: 10 }, /有效预约冲突/); f.reject("admin", "base.save", { table: "schools", name: "测试", code: "TEST" }, /身份/); f.run("admin", "staff.training", { id: "S1-T2", name: "规范操作培训", date: M.TODAY, hours: 4, evidence: "签到说明" }); assert.equal(M.find(f.db, "staff", "S1-T2").trainings.length, 1); });
test("上报快照不随后续台账改变", () => { const f = fixture(); const snapshot = f.run("admin", "submission.create", { term: "TERM26" }); f.run("teacher", "booking.complete", { id: "S1-YY1", attendees: 41, date: M.TODAY, reason: "完成" }); assert.equal(M.find(f.db, "submissions", snapshot.id).summary.done, 0); assert.equal(M.metrics(f.db, "S1").done, 1); });
test("CSV模板/含逗号和换行字段/非法数量/公式转义", () => { const data = M.csv([M.importHeader, ["设备,测试", '型号"A', "物理仪器", "台", 2, 1.2]]); const result = M.validateImport(data); assert.deepEqual(result.errors, []); assert.equal(result.items[0].name, "设备,测试"); assert.equal(result.items[0].model, '型号"A'); assert.equal(M.parseCSV('"a\nb",c')[0][0], "a\nb"); assert.throws(() => M.parseCSV('"a'), /引号/); assert.equal(M.validateImport(M.csv([M.importHeader, ["设备", "X", "物理仪器", "台", -1, 0]])).errors.length, 1); assert.match(M.csv([["=1+2"]]), /'=1\+2/); });
test("页面与导航目标均存在，新增安全页与内部预览分离", () => { for (const [scope, groups] of Object.entries(M.navigation)) for (const group of groups) for (const item of group.items) assert.ok(fs.existsSync(path.join(__dirname, "../pages", scope, item.href)), `${scope}/${item.href}`); for (const entry of ["index.html", "login.html", "preview.html"]) assert.ok(fs.existsSync(path.join(__dirname, "..", entry))); assert.match(fs.readFileSync(path.join(__dirname, "../index.html"), "utf8"), /data-scope="login"/); assert.equal(M.navigation.district.flatMap(g => g.items).filter(i => i.id === "inspections").length, 0); assert.equal(M.navigation.school[0].items[1].id, "ai-query"); });
test("所有角色、页面及业务标签均可渲染（隔离内存，不访问浏览器）", () => {
  const vm = require("node:vm"), source = fs.readFileSync(path.join(__dirname, "../assets/app.js"), "utf8"); let count = 0;
  const tabs = { schools: ["schools", "labs", "submissions"], labs: ["labs", "classes"], teachers: ["all", "teacher", "technician", "training", "disabled"], staff: ["all", "teacher", "technician", "training", "disabled"], equipment: ["assets", "receipts", "purchases", "moves", "loans", "counts"], devices: ["assets", "receipts", "purchases", "moves", "loans", "counts"], supplies: ["stock", "hazard", "inbound", "outbound", "loss", "pending"], consumables: ["stock", "hazard", "inbound", "outbound", "loss", "pending"], maintenance: ["repair", "scrap", "purchase", "plan", "history"], repair: ["repair", "scrap", "purchase", "plan", "history"], experiments: ["all", "required", "optional", "mine", "catalog"], booking: ["all", "mine", "prepare", "record"], schedule: ["progress", "ranking", "subject", "grade", "class"], safety: ["hazards", "checks", "tasks"], settings: ["settings", "terms", "classes", "catalog", "logs"], archives: ["all", "实验教学", "安全管理", "师资培训", "设备建设"] };
  for (const role of ["district", "admin", "teacher", "technician"]) {
    const scope = role === "district" ? "district" : "school", actor = M.actorFor(M.seed(), role, "S1");
    for (const page of M.navigation[scope].flatMap(g => g.items)) for (const tab of tabs[page.id] || [""]) {
      const app = { innerHTML: "" }, storage = new Map([[M.KEY, JSON.stringify(M.seed())]]), preferences = new Map([["lab-demo-identity", JSON.stringify({ role, school: "S1", personId: actor.id })]]);
      const window = { LabDemo: M, addEventListener() {} }, document = { documentElement: { dataset: {} }, body: { dataset: { scope, page: page.id } }, getElementById: id => id === "app" ? app : null, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
      const store = map => ({ getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value) });
      vm.runInNewContext(source, { window, document, localStorage: store(storage), sessionStorage: store(preferences), location: { search: `?tab=${encodeURIComponent(tab)}` }, URLSearchParams, Blob, console, setTimeout });
      assert.ok(app.innerHTML.includes('<h1 class="page-title">'), `${scope}/${page.id}/${tab}`); assert.doesNotMatch(app.innerHTML, /\bundefined\b|\bNaN\b/, `${scope}/${page.id}/${tab}`); count++;
      const header = app.innerHTML.match(/<header class="page-header">([\s\S]*?)<\/header>/)?.[1];
      assert.ok(header?.includes('class="page-heading-row"'), `compact heading: ${scope}/${page.id}/${tab}`);
      assert.equal((app.innerHTML.match(/class="page-actions"/g) || []).length, ["dashboard", "ai-query"].includes(page.id) || page.id === "settings" && tab === "settings" ? 0 : 1, `one action group: ${scope}/${page.id}/${tab}`);
      if (app.innerHTML.includes('class="page-actions"')) assert.ok(header.includes('class="page-actions"'), `actions stay in header: ${scope}/${page.id}/${tab}`);
      if (page.id === "booking") { assert.match(header, /data-action="booking-new"/); assert.equal((app.innerHTML.match(/class="calendar-day /g) || []).length, 7); if (app.innerHTML.includes("data-select=")) assert.match(app.innerHTML, /<td class="cell-wrap">/); }
    }
  }
  console.log(`  ${count} role/page/tab renders checked`);
});
test("原视觉样式保留，功能扩展不覆盖全站设计", () => {
  const css = fs.readFileSync(path.join(__dirname, "../assets/styles.css"), "utf8"), app = fs.readFileSync(path.join(__dirname, "../assets/app.js"), "utf8"), extensions = css.split("/* Functional additions reuse the original design tokens and components above. */")[1];
  assert.ok(extensions, "keep functional styles separated from original design");
  assert.match(css, /--accent: #c5482f;/);
  assert.match(css, /grid-template-columns: 1\.55fr repeat\(3, minmax\(0, 1fr\)\);/);
  assert.doesNotMatch(extensions, /--accent\s*:|\.page-title\s*\{|\.metric-value\s*\{|\.metrics-grid\s*\{|\.entry-layout\s*\{/);
  for (const component of ["login-page", "login-intro", "login-card", "nav-link", "identity-card", "ai-layout", "ai-chat", "panel-header", "panel-body"]) assert.ok(app.includes(component), `reuse original ${component}`);
  assert.doesNotMatch(app, /entry-layout|metric-card|ai-workspace/);
});
test("参考字段持久化且兼容既有档案，不伪造旧值", () => {
  const f = fixture(), original = JSON.stringify(f.db), lab = M.find(f.db, "labs", "S1-L3");
  assert.equal(lab.builder, undefined);
  const changed = f.run("admin", "base.save", { ...lab, table: "labs", builder: "教学设备服务单位", stage: "高中", features: "灭火器、洗眼器", note: "主要设备于2023年建成" });
  assert.equal(changed.builder, "教学设备服务单位"); assert.equal(changed.features, "灭火器、洗眼器");
  f.reject("admin", "base.save", { ...changed, table: "labs", note: "长".repeat(61) }, /60字/);
  const staff = f.run("admin", "base.save", { ...M.find(f.db, "staff", "S1-T3"), table: "staff", sex: "女", department: "生物实验组" });
  assert.equal(staff.department, "生物实验组"); assert.equal(staff.sex, "女");
  assert.equal(f.db.assets.length, JSON.parse(original).assets.length); assert.equal(f.db.plans.length, 15); assert.equal(f.db.bookings.length, 3);
  const restored = JSON.parse(JSON.stringify(f.db)); assert.equal(M.find(restored, "labs", changed.id).note, changed.note);
});
test("入库逐行位置、分类编号、金额、备注与审批明细保护", () => {
  const f = fixture(), items = [{ ...line, qty: 1, classificationCode: "REF-001", labId: "S1-L1" }, { ...line, qty: 1, classificationCode: "REF-002", labId: "S1-L3" }];
  const r = f.run("admin", "receipt.create", { ...receipt, items, note: "分室存放" });
  assert.equal(r.note, "分室存放"); assert.equal(r.operator, "顾文清");
  const assets = f.db.assets.filter(a => a.sourceId === r.id); assert.deepEqual(new Set(assets.map(a => a.location)), new Set(["A201", "C201"])); assert.ok(assets.some(a => a.classificationCode === "REF-002" && a.location === "C201" && a.labId === "S1-L3"));
  const order = f.run("admin", "purchase.create", { items: [line], purpose: "补充教学" }); f.run("district", "purchase.decide", { id: order.id, approve: true, reason: "通过" });
  const approved = f.run("admin", "receipt.create", { ...receipt, purchaseId: order.id, placements: [{ ...items[0], qty: 99, price: 1 }] });
  assert.equal(approved.items[0].qty, 2); assert.equal(approved.items[0].price, 3580); assert.equal(approved.items[0].labId, "S1-L1");
  f.reject("admin", "receipt.create", { ...receipt, items: [items[0], { ...items[1], labId: "S2-L1" }] }, /其他学校/);
  f.reject("admin", "receipt.create", { ...receipt, items: [line], purchaseDate: "2026-09-01" }, /购置日期/);
});
test("同名耗材按位置分账，损耗快照不随档案编辑变化", () => {
  const f = fixture(), item = { ...line, name: "定性滤纸", model: "中速9cm", category: "耗材", unit: "盒", qty: 2, price: 8 };
  const r = f.run("admin", "receipt.create", { ...receipt, labId: "S1-L1", items: [item] }), stock = f.db.inventory.find(i => i.id === f.db.flows.find(x => x.receiptId === r.id).itemId);
  assert.notEqual(stock.id, "S1-I2"); assert.equal(stock.stock, 2); assert.equal(M.find(f.db, "inventory", "S1-I2").stock, 8);
  const flow = f.run("admin", "flow.create", { itemId: stock.id, kind: "损耗", qty: 1, date: M.TODAY, reason: "破损" }); assert.equal(flow.snapshot.unitPrice, 8); assert.equal(flow.snapshot.location, "A201");
  f.run("admin", "inventory.save", { ...stock, unitPrice: 12, classificationCode: "HC-001" }); assert.equal(M.find(f.db, "flows", flow.id).snapshot.unitPrice, 8);
  const unknown = f.run("admin", "flow.create", { itemId: "S1-I1", kind: "损耗", qty: 1, date: M.TODAY, reason: "破损" }); assert.equal(unknown.snapshot.unitPrice, null);
});
test("计划名称、周次日期一致及分项开出率", () => {
  const f = fixture(), input = { name: "高一物理第一学期计划", term: "TERM26", catalogId: "E1", classId: "S1-C2", teacherId: "S1-T1", mode: "演示", date: "2026-09-08", week: 2 };
  f.reject("admin", "plan.create", { ...input, week: 1 }, /周次/);
  const p = f.run("admin", "plan.create", input); assert.equal(p.name, input.name); assert.equal(p.week, 2);
  assert.equal(M.weekOf({ start: "2026-09-02" }, "2026-09-06"), 1); assert.equal(M.weekOf({ start: "2026-09-02" }, "2026-09-07"), 2); assert.equal(M.weekDate({ start: "2026-09-02" }, 1), "2026-09-02");
  f.run("teacher", "booking.complete", { id: "S1-YY1", attendees: 41, date: M.TODAY, reason: "已完成" });
  const report = M.teaching(f.db, "S1", "TERM26")[0]; assert.equal(report.groupRate, "25.0%"); assert.equal(report.demonstrationRate, "0.0%"); assert.equal(report.total, 6); assert.equal(report.totalRate, "16.7%");
});
test("多班多实验预约整批校验，管理员、时间与器材冲突不能绕过", () => {
  const f = fixture(), other = { ...reservation, planId: "S1-P2", labId: "S1-L2", resources: [{ ref: "S1-A2", qty: 1 }], managerId: "S1-T4", period: 2 };
  f.reject("admin", "booking.batch", { rows: [reservation, { ...other, planId: "S1-P5", labId: "S1-L3" }] }, /预约冲突/);
  f.reject("admin", "booking.batch", { rows: [reservation, { ...other, managerId: "S2-T4" }] }, /本校/);
  f.reject("admin", "booking.batch", { rows: [reservation, { ...other, managerId: "S1-T1" }] }, /实验管理员/);
  f.reject("teacher", "booking.batch", { rows: [reservation] }, /本人/);
  const result = f.run("admin", "booking.batch", { rows: [reservation, other] }); assert.equal(result.ids.length, 2); assert.equal(f.db.bookings.filter(b => b.batchId === result.id).length, 2); assert.equal(M.find(f.db, "bookings", result.ids[1]).period, 2); assert.equal(result.applicant, "顾文清");
  f.run("admin", "booking.decide", { id: result.id, approve: true, reason: "通过" }); f.run("technician", "booking.prepare", { id: result.id, reason: "已准备" }); f.run("admin", "booking.complete", { id: result.id, attendees: 41, date: reservation.date, reason: "完成" });
  assert.equal(M.find(f.db, "plans", "S1-P3").state, "已完成"); assert.equal(M.find(f.db, "plans", "S1-P2").state, "待实施");
});
test("批量设备处理保留单件追溯，维修日期和数量回显", () => {
  const f = fixture(), input = { assetId: "S1-A1", kind: "报废", reason: "丢失", due: "2026-09-07" };
  f.reject("admin", "repair.batch", { rows: [input, input] }, /状态/);
  const r = f.run("admin", "repair.batch", { rows: [input, { ...input, assetId: "S1-A6" }] }); assert.equal(r.ids.length, 2); assert.equal(r.snapshot.purchaseDate, "2024-03-15"); assert.equal(r.qty, 1);
  f.reject("technician", "repair.finish", { id: "WX-20260824-001", maintenanceDate: "2026-08-01", vendor: "", cost: 100, reason: "校准" }, /维修日期/);
  const repair = f.run("technician", "repair.finish", { id: "WX-20260824-001", maintenanceDate: M.TODAY, vendor: "维修服务中心", cost: 120, reason: "校准输出电压" }); assert.equal(repair.maintenanceDate, M.TODAY); assert.equal(repair.qty, 1); assert.equal(repair.cost, 120);
});
test("扩展CSV分类与位置字段、原六列兼容以及教师班级筛选", () => {
  const f = fixture(), parsed = M.validateImport(M.csv([M.extendedImportHeader, ["观察设备", "X1", "生物仪器", "台", 2, 120, "SW-001", "S1-L3", "C201"]]));
  assert.deepEqual(parsed.errors, []); assert.equal(parsed.items[0].classificationCode, "SW-001");
  const r = f.run("admin", "receipt.create", { ...receipt, items: parsed.items }); assert.equal(r.items[0].location, "C201");
  assert.equal(M.validateImport(M.csv([M.importHeader, ["观察设备", "X1", "生物仪器", "台", 2, 120]])).items[0].labId, "");
  assert.throws(() => M.validateImport(M.csv([[...M.importHeader, "分类编号"], ["观察设备", "X1", "生物仪器", "台", 2, 120, "X"]])), /表头/);
  const report = M.teaching(f.db, "S1", "TERM26", "class", { teacherId: "S1-T1", classId: "S1-C2" }); assert.equal(report.length, 1); assert.equal(report[0].total, 1); assert.equal(report[0].teacherNames, "张明华"); assert.equal(report[0].gradeNames, "高一");
});
test("实验计划表单的类型只使用分组与演示", () => {
  const app = fs.readFileSync(path.join(__dirname, "../assets/app.js"), "utf8"), start = app.indexOf("function planForm"), end = app.indexOf("function setOptions"), source = app.slice(start, end);
  assert.match(source, /f\("mode", "实验类型", "分组", "text", \["分组", "演示"\]\)/);
  assert.doesNotMatch(source, /required:实验属性|\["必做", "选做"\]/);
});
console.log(`\n${checks} suites passed. No dependencies and no browser data changed.`);
