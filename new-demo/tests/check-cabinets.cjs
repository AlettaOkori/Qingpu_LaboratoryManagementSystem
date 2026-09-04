"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const M = require("../assets/mock-data.js");

const iso = "2026-08-31T09:00:00+08:00";
let db = M.seed();
const admin = M.actorFor(db, "admin", "S1");

assert.equal(db.version, 12);
assert.equal(db.cabinets.length, 12);
assert.equal(db.storageMoves.length, 0);
assert.deepEqual(M.auditRelations(db), []);
assert.ok(db.assets.some(row => row.cabinetId));
assert.ok(db.inventory.some(row => row.cabinetId));
const appSource = fs.readFileSync(path.join(__dirname, "../assets/app.js"), "utf8");
assert.match(appSource, /function cabinetCard\(/);
assert.match(appSource, /下载柜卡（HTML）/);

const room = db.rooms.find(row => row.school === "S1" && row.subject === "物理" && row.state === "可用");
const cabinet = db.cabinets.find(row => row.school === "S1" && row.roomId === room.id && row.state === "启用");
db = M.transact(db, admin, "base.save", { table: "cabinets", code: "G99", name: "演示备用柜", roomId: room.id, type: "仪器柜", state: "启用", custodianId: "S1-T0", hazardStorage: false, note: "回归测试" }, iso).db;
assert.ok(db.cabinets.some(row => row.code === "G99"));

const sourceStock = db.inventory.find(row => row.school === "S1" && row.cabinetId && row.stock > 0 && !row.pendingReceiptId && row.state === "在库");
const stockItem = M.itemOf(db, sourceStock);
const targetRoom = db.rooms.find(row => row.school === "S1" && row.id !== sourceStock.roomId && row.state === "可用" && M.roomFitsItem(row, stockItem));
const targetCabinet = db.cabinets.find(row => row.school === "S1" && row.roomId === targetRoom.id && row.state === "启用" && M.cabinetFitsItem(db, row, stockItem));
const beforeQty = sourceStock.stock;
db = M.transact(db, admin, "storage.move", { kind: "inventory", id: sourceStock.id, roomId: targetRoom.id, cabinetId: targetCabinet.id, qty: 2, reason: "回归测试移柜" }, iso).db;
assert.equal(db.inventory.find(row => row.id === sourceStock.id).stock, beforeQty - 2);
assert.equal(db.inventory.find(row => row.id !== sourceStock.id && row.itemId === sourceStock.itemId && row.roomId === targetRoom.id && row.cabinetId === targetCabinet.id).stock, 2);
assert.equal(db.storageMoves.length, 1);
assert.deepEqual(M.auditRelations(db), []);

const used = new Set(db.arrangements.filter(row => row.state !== "已取消").flatMap(row => (row.resources || []).map(resource => resource.ref)));
const asset = db.assets.find(row => row.school === "S1" && row.cabinetId && row.state === "正常使用" && !used.has(row.id));
db = M.transact(db, admin, "base.save", { table: "cabinets", code: "G98", name: "资产备用柜", roomId: asset.roomId, type: "仪器柜", state: "启用", custodianId: "S1-T0", hazardStorage: false, note: "回归测试" }, iso).db;
const assetCabinet = db.cabinets.find(row => row.code === "G98");
db = M.transact(db, admin, "storage.move", { kind: "asset", id: asset.id, roomId: asset.roomId, cabinetId: assetCabinet.id, reason: "回归测试设备移柜" }, iso).db;
assert.equal(db.assets.find(row => row.id === asset.id).cabinetId, assetCabinet.id);
assert.deepEqual(M.auditRelations(db), []);

assert.throws(() => M.transact(db, admin, "base.save", { table: "cabinets", code: "BAD", name: "错误危化品柜", roomId: room.id, type: "危化品专用柜", state: "启用", custodianId: "S1-T0", hazardStorage: true, note: "回归测试" }, iso), /危化品专用柜/);
assert.throws(() => M.transact(db, admin, "base.delete", { table: "cabinets", id: cabinet.id, reason: "不应删除" }, iso), /被设备、库存、入库或位置调整引用/);

const csvRoom = db.rooms.find(row => row.school === "S1" && row.subject === "物理" && row.state === "可用");
const csvCabinet = db.cabinets.find(row => row.school === "S1" && row.roomId === csvRoom.id && row.state === "启用");
const csvRow = ["CSV-REG-001", "导入测试器材", "V1", "物理仪器", "台", "单件设备", "是", 1, 100, csvRoom.roomNo, csvCabinet.code, "2027-02-28", ""];
const parsed = M.validateImport(M.csv([M.importHeader, csvRow]), db, "S1");
assert.deepEqual(parsed.errors, []);
assert.equal(parsed.items[0].cabinetId, csvCabinet.id);

const legacyHeader = M.importHeader.filter(label => label !== "橱柜编号（可选）");
const legacyRow = csvRow.filter((_, index) => index !== 10);
assert.deepEqual(M.validateImport(M.csv([legacyHeader, legacyRow]), db, "S1").errors, []);

const historical = M.clone(M.seed());
historical.version = 11;
delete historical.cabinets;
delete historical.storageMoves;
const migrated = M.migrate(historical);
assert.equal(migrated.version, 12);
assert.ok(migrated.cabinets.length > 0);
assert.deepEqual(M.auditRelations(migrated), []);
assert.deepEqual(M.migrate(migrated), migrated);

console.log("✓ 橱柜主档、入库、移柜、导入、迁移与关系审计通过");
