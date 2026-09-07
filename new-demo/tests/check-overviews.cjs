"use strict";

// Run: node new-demo/tests/check-overviews.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const M = require("../assets/mock-data.js");

let checks = 0;
function test(name, fn) {
  fn();
  checks++;
  console.log(`✓ ${name}`);
}

const district = { role: "district", id: "DISTRICT", name: "周岚", school: "" };

test("总览投影只读，卡片数量与下钻列表使用同一口径", () => {
  const db = M.seed(), before = JSON.stringify(db);
  const result = M.overview(db, { actor: district, term: "TERM26", subject: "", by: "school" });
  assert.equal(JSON.stringify(db), before, "生成总览不得修改业务台账");
  assert.equal(result.required, result.lists.required.length);
  assert.equal(result.late, result.lists.late.length);
  assert.equal(result.pendingBookings, result.lists.pendingBookings.length);
  assert.equal(result.pendingSummary, result.lists.pendingSummary.length);
  assert.equal(result.todoCount, result.lists.todo.length);
  assert.equal(result.schools.length, db.schools.length);
  assert.equal(result.attentionSchools, result.schools.filter(row => row.attention).length);
  assert.equal(result.done, result.lists.required.filter(row => row.state === "已完成").length);
});

test("区域总览支持学校和学科联动，并保留安全的跨学科共享口径", () => {
  const db = M.seed();
  const all = M.overview(db, { actor: district, term: "TERM26", subject: "", by: "school" });
  const school = M.overview(db, { actor: district, school: "S1", term: "TERM26", subject: "物理", by: "school" });
  assert.equal(school.schoolId, "S1");
  assert.deepEqual(school.schools.map(row => row.id), ["S1"]);
  assert.ok(school.lists.required.every(row => row.school === "S1" && M.subjectEquals(row.subject, "物理")));
  assert.ok(school.lists.todo.every(row => row.school === "S1"));
  assert.ok(school.teaching.every(row => row.school === "S1"));
  assert.ok(all.lists.todo.some(row => row.table === "purchases"));
  assert.ok(all.lists.todo.some(row => row.table === "hazards" && row.state === "待区级复查"));

  const admin = M.actorFor(db, "admin", "S1");
  const physics = M.overview(db, { actor: admin, term: "TERM26", subject: "物理" });
  const chemistry = M.overview(db, { actor: admin, term: "TERM26", subject: "化学" });
  assert.deepEqual(physics.safety, chemistry.safety, "安全指标不应随教学学科过滤");
  assert.equal(physics.resources.assets, M.metrics(db, "S1", "TERM26", "物理").assets);
  assert.equal(chemistry.resources.low, M.metrics(db, "S1", "TERM26", "化学").low);
});

test("学校管理员总览固定本校，实验执行待办区分待安排与退回", () => {
  const db = M.seed(), actor = M.actorFor(db, "admin", "S1");
  const result = M.overview(db, { actor, term: "TERM26", subject: "", by: "subject" });
  const pendingArrange = result.lists.pendingBookings.filter(row => row.state === "待安排");
  const returned = result.lists.pendingBookings.filter(row => row.state === "已退回");
  assert.equal(result.schoolId, "S1");
  assert.equal(result.schools.length, 1);
  assert.ok(result.lists.week.every(row => row.school === "S1"));
  assert.ok(result.lists.resources.every(row => row.school === "S1"));
  assert.ok(result.lists.safety.every(row => row.school === "S1"));
  assert.ok(result.lists.todo.some(row => row.table === "bookings") === (pendingArrange.length > 0));
  assert.ok(result.lists.todo.every(row => row.table !== "bookings" || row.state === "待安排"));
  assert.ok(returned.every(row => !result.lists.todo.some(todo => todo.id === row.id)));
});

test("教师工作台仅汇总本人教学链，不暴露学校管理数据", () => {
  const db = M.seed(), actor = M.actorFor(db, "teacher", "S1");
  const result = M.overview(db, { actor, term: "TERM26", subject: actor.subject, by: "class" });
  assert.equal(result.personal, true);
  assert.equal(result.schoolId, "S1");
  assert.deepEqual(result.schools, []);
  assert.deepEqual(result.submissions, []);
  assert.deepEqual(result.lists.resources, []);
  assert.deepEqual(result.lists.safety, []);
  assert.equal(result.resources.assets, 0);
  assert.equal(result.safety.open, 0);
  assert.ok(result.lists.required.every(row => db.teachingTasks.find(task => task.id === row.id)?.teacherId === actor.id));
  assert.ok(result.lists.week.every(row => {
    const arrangement = db.arrangements.find(item => item.id === row.id);
    const booking = db.bookings.find(item => item.id === arrangement.bookingId);
    return booking.teacherId === actor.id;
  }));
  assert.ok(result.lists.todo.every(row => ["bookings", "arrangements"].includes(row.table)));
});

test("页面实现包含区域、学校和教师三种总览结构", () => {
  const source = fs.readFileSync(path.join(__dirname, "../assets/app.js"), "utf8");
  const styles = fs.readFileSync(path.join(__dirname, "../assets/styles.css"), "utf8");
  for (const marker of ["M.overview", "学校教学与风险态势", "区级优先待办", "本周实验运行", "分学科教学执行进度", "我的工作台", "我的班级执行进度", "安全为学校共享口径"]) assert.match(source, new RegExp(marker));
  for (const selector of ["overview-context", "overview-metrics", "overview-primary-grid", "overview-schedule-row", "overview-lower-grid", "overview-actions-bar"]) assert.match(styles, new RegExp(`\\.${selector}`));
});

console.log(`\n${checks}项两级总览专项检查通过。`);
