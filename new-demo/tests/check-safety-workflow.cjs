"use strict";

// Run: node new-demo/tests/check-safety-workflow.cjs
// Standard library only; every transaction works on an in-memory clone.
const assert = require("node:assert/strict");
const M = require("../assets/mock-data.js");

let checks = 0;
function test(name, fn) {
  fn();
  checks++;
  console.log(`✓ ${name}`);
}

function fixture(initial = M.seed()) {
  let db = M.clone(initial);
  let tick = 0;
  const actor = (role, school = "S1", personId = "") => M.actorFor(db, role, school, personId);
  const now = () => `2026-08-31T${String(9 + Math.floor(tick / 60)).padStart(2, "0")}:${String(tick++ % 60).padStart(2, "0")}:00+08:00`;
  return {
    get db() { return db; },
    run(role, command, input, school = "S1", personId = "") {
      const out = M.transact(db, actor(role, school, personId), command, input, now());
      db = out.db;
      return out.result;
    },
    reject(role, command, input, regex, school = "S1", personId = "") {
      const before = JSON.stringify(db);
      assert.throws(() => M.transact(db, actor(role, school, personId), command, input, now()), regex);
      assert.equal(JSON.stringify(db), before, "被拒绝的操作不得修改原数据");
    }
  };
}

const byId = (db, table, id) => M.find(db, table, id);
const hazardStock = (db, school = "S1") => db.inventory.find(row => row.school === school && M.isHazard(M.itemOf(db, row)) && row.roomId && !row.pendingReceiptCreated);
const latest = rows => rows.at(-1);

function assertReview(entry, stage, approve, reviewerId) {
  assert.equal(entry.stage, stage);
  assert.equal(entry.approve, approve);
  assert.equal(entry.result, approve ? "通过" : "驳回");
  assert.equal(entry.reviewerId, reviewerId);
  assert.ok(entry.reviewerName, "复核历史须保存复核人姓名");
  assert.ok(entry.reason, "复核历史须保存意见");
  assert.ok(entry.at, "复核历史须保存时间");
}

function uploadRectification(f, hazardId, suffix) {
  return f.run("admin", "archive.create", {
    relatedTable: "hazards",
    relatedId: hazardId,
    name: `危化品隐患整改材料-${suffix}.txt`,
    category: "安全管理",
    content: `危化品整改核对材料 ${suffix}`,
    archive: true
  });
}

function submitRectification(f, hazardId, suffix) {
  const file = uploadRectification(f, hazardId, suffix);
  f.run("admin", "hazard.submit", {
    id: hazardId,
    attachmentId: file.id,
    reason: `已完成第${suffix}次整改并上传现场核对材料。`
  });
  return file;
}

test("危化品安全样例、对象辅助函数和关系审计可用", () => {
  const db = M.seed();
  for (const name of ["safetyContext", "safetyTargetLabel", "safetyRelatedToStock", "syncSafetyTask", "normalizeSafetyModel"]) {
    assert.equal(typeof M[name], "function", `应导出 ${name}`);
  }
  assert.equal(db.safetyModelVersion, 1, "seed 应完成安全模型标准化");
  assert.equal(db.safetyDemoVersion, 1, "seed 应生成危化品安全演示数据");
  assert.ok(db.hazards.some(row => row.safetyScope === "hazardous" && row.state === "待校内复核"), "样例须包含待校内复核隐患");
  assert.ok(db.hazards.some(row => row.safetyScope === "hazardous" && row.state === "待区级复查"), "样例须包含待区级复查隐患");

  const stock = hazardStock(db);
  assert.ok(stock, "S1 应有可检查的危化品库存");
  const context = M.safetyContext(db, {
    safetyScope: "hazardous",
    targetType: "inventory",
    targetId: stock.id
  }, stock.school);
  assert.deepEqual(context, {
    school: stock.school,
    safetyScope: "hazardous",
    targetType: "inventory",
    targetId: stock.id,
    roomId: stock.roomId
  });
  assert.match(M.safetyTargetLabel(db, context), /具体危化品/);
  assert.equal(M.safetyRelatedToStock(db, context, stock), true);
  assert.deepEqual(M.auditRelations(db), [], "初始安全样例的对象、附件和状态关系应完整");
});

test("整改说明与佐证材料在同一事务内提交", () => {
  const f = fixture(), hazard = f.db.hazards.find(row => row.school === "S1" && row.state === "待整改"), beforeArchives = f.db.archives.length;
  const result = f.run("admin", "hazard.rectify", { id: hazard.id, reason: "已补全标签和责任人并完成现场核对。", attachment: { name: "整改核对记录.txt", mime: "text/plain;charset=utf-8", content: "包装、标签、数量、存放条件和有效期均已核对。" } });
  assert.equal(result.state, "待校内复核");
  assert.equal(f.db.archives.length, beforeArchives + 1);
  const file = byId(f.db, "archives", result.attachmentId);
  assert.equal(file.relatedTable, "hazards");
  assert.equal(file.relatedId, hazard.id);
  assert.equal(file.state, "已归档");
  assert.equal(result.submissionHistory.at(-1).attachmentId, file.id);
  assert.deepEqual(M.auditRelations(f.db), []);
});

test("危化品隐患须依次经过校内复核和区级复查，且多隐患全部关闭后任务才完成", () => {
  const f = fixture();
  const stock = hazardStock(f.db);
  const admin = M.actorFor(f.db, "admin", "S1");
  const reviewer = f.db.staff.find(person => person.school === "S1" && person.role === "admin" && person.enabled && person.id !== admin.id);
  assert.ok(stock && admin && reviewer);

  const task = f.run("district", "task.create", {
    safetyScope: "hazardous",
    targetType: "inventory",
    targetId: stock.id,
    kind: "危化品专项检查",
    due: "2026-09-10",
    owner: admin.name
  });
  assert.equal(task.state, "待检查");
  assert.equal(task.sourceType, "district");
  assert.equal(task.school, "S1");
  assert.equal(M.safetyRelatedToStock(f.db, task, stock), true);

  const check = f.run("admin", "check.create", {
    taskId: task.id,
    date: M.TODAY,
    items: "账物一致、包装标签、有效期、双人领用复核",
    result: "发现隐患",
    title: "试剂标签责任人缺失；领用记录缺少复核签名",
    owner: admin.name,
    level: "需优先处理",
    due: "2026-09-08",
    note: "危化品专项检查测试"
  });
  assert.equal(check.taskId, task.id);
  assert.equal(check.safetyScope, "hazardous");
  assert.equal(check.targetType, "inventory");
  assert.equal(check.targetId, stock.id);
  assert.equal(byId(f.db, "tasks", task.id).state, "待整改");

  const hazards = f.db.hazards.filter(row => row.checkId === check.id);
  assert.equal(hazards.length, 2, "一张检查记录应能生成多项隐患");
  for (const hazard of hazards) {
    assert.equal(hazard.state, "待整改");
    assert.equal(hazard.safetyScope, "hazardous");
    assert.equal(hazard.targetType, "inventory");
    assert.equal(hazard.targetId, stock.id);
    assert.deepEqual(hazard.submissionHistory, []);
    assert.deepEqual(hazard.reviewHistory, []);
    assert.equal(M.safetyRelatedToStock(f.db, hazard, stock), true);
  }
  const [first, second] = hazards;

  f.reject("teacher", "hazard.submit", { id: first.id, attachmentId: "NONE", reason: "越权提交" }, /学校管理员/);
  f.reject("admin", "hazard.schoolReview", { id: first.id, approve: true, reason: "越序复核" }, /当前状态/);

  const firstFile = submitRectification(f, first.id, "一");
  let row = byId(f.db, "hazards", first.id);
  assert.equal(row.state, "待校内复核");
  assert.equal(row.attachmentId, firstFile.id);
  assert.equal(row.submitterId, admin.id);
  assert.equal(row.submitterName, admin.name);
  assert.ok(row.submittedAt);
  assert.equal(row.submissionHistory.length, 1);
  assert.equal(latest(row.submissionHistory).attachmentId, firstFile.id);
  assert.equal(latest(row.submissionHistory).submitterId, admin.id);
  assert.match(latest(row.submissionHistory).rectification, /第一次整改/);

  f.reject("district", "hazard.verify", { id: first.id, approve: true, reason: "越过校内复核" }, /当前状态/);
  f.reject("district", "hazard.schoolReview", { id: first.id, approve: true, reason: "区级越权" }, /学校管理员/);

  f.reject("admin", "hazard.schoolReview", { id: first.id, approve: false, reason: "本人不能复核。" }, /不能复核本人/, "S1", admin.id);
  f.run("admin", "hazard.schoolReview", { id: first.id, approve: false, reason: "整改照片未显示标签责任人，请补充。" }, "S1", reviewer.id);
  row = byId(f.db, "hazards", first.id);
  assert.equal(row.state, "整改中");
  assert.equal(row.reviewHistory.length, 1);
  assertReview(latest(row.reviewHistory), "school", false, reviewer.id);
  assert.equal(byId(f.db, "tasks", task.id).state, "待整改");

  const secondFile = submitRectification(f, first.id, "二");
  row = byId(f.db, "hazards", first.id);
  assert.equal(row.state, "待校内复核");
  assert.equal(row.submissionHistory.length, 2);
  assert.equal(latest(row.submissionHistory).attachmentId, secondFile.id);

  f.run("admin", "hazard.schoolReview", { id: first.id, approve: true, reason: "校内现场核验通过，提交区级复查。" }, "S1", reviewer.id);
  row = byId(f.db, "hazards", first.id);
  assert.equal(row.state, "待区级复查");
  assert.equal(row.reviewHistory.length, 2);
  assertReview(latest(row.reviewHistory), "school", true, reviewer.id);
  f.reject("admin", "hazard.schoolReview", { id: first.id, approve: true, reason: "重复复核" }, /当前状态/);
  f.reject("admin", "hazard.verify", { id: first.id, approve: true, reason: "学校越权区级复查" }, /区级管理员/);

  f.run("district", "hazard.verify", { id: first.id, approve: false, reason: "现场复查发现领用记录签名仍不完整。" });
  row = byId(f.db, "hazards", first.id);
  assert.equal(row.state, "整改中");
  assert.equal(row.reviewHistory.length, 3);
  assertReview(latest(row.reviewHistory), "district", false, "DISTRICT");

  submitRectification(f, first.id, "三");
  f.run("admin", "hazard.schoolReview", { id: first.id, approve: true, reason: "校内复核确认补充完整。" }, "S1", reviewer.id);
  f.run("district", "hazard.verify", { id: first.id, approve: true, reason: "区级复查确认整改到位，同意关闭。" });
  row = byId(f.db, "hazards", first.id);
  assert.equal(row.state, "已关闭");
  assert.equal(row.submissionHistory.length, 3);
  assert.equal(row.reviewHistory.length, 5);
  assertReview(row.reviewHistory[3], "school", true, reviewer.id);
  assertReview(row.reviewHistory[4], "district", true, "DISTRICT");
  assert.equal(byId(f.db, "tasks", task.id).state, "待整改", "同次检查仍有未关闭隐患时任务不能完成");

  submitRectification(f, second.id, "四");
  f.run("admin", "hazard.schoolReview", { id: second.id, approve: true, reason: "第二项隐患校内复核通过。" }, "S1", reviewer.id);
  assert.equal(byId(f.db, "tasks", task.id).state, "待整改");
  f.run("district", "hazard.verify", { id: second.id, approve: true, reason: "第二项隐患区级复查通过。" });
  assert.equal(byId(f.db, "hazards", second.id).state, "已关闭");
  assert.equal(byId(f.db, "tasks", task.id).state, "已完成", "所有隐患均关闭后任务应自动完成");
  assert.equal(byId(f.db, "checks", check.id).result, "发现隐患");
  assert.deepEqual(M.auditRelations(f.db), [], "完整两级复核后的业务关系应保持一致");
});

console.log(`\n${checks}项危化品安全流程测试通过。`);
