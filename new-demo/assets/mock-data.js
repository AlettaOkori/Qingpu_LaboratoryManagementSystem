(function (root) {
  "use strict";
  const KEY = "lab-demo-business-v2", VERSION = 12, TODAY = "2026-08-31";
  const roles = { district: "区级管理员", admin: "学校管理员", teacher: "任课教师" };
  const categories = ["物理仪器", "化学仪器", "生物仪器", "科学仪器", "耗材", "危化品"], subjects = ["科学", "物理", "化学", "生物"], subjectDefinitions = [
    { code: "SCI", value: "科学", label: "科学", aliases: ["科学"] },
    { code: "PHY", value: "物理", label: "物理", aliases: ["物理"] },
    { code: "CHEM", value: "化学", label: "化学", aliases: ["化学"] },
    { code: "BIO", value: "生物", label: "生物学", aliases: ["生物", "生物学", "生命科学"] }
  ], subjectOptions = subjectDefinitions.map(item => [item.value, item.label]), subjectCodes = subjectDefinitions.map(item => item.code), resourceTypes = ["教学设计", "教案", "学案", "课件", "实验视频", "学习单"], resourceGrades = ["一年级", "二年级", "三年级", "四年级", "五年级", "六年级", "初一", "初二", "初三", "高一", "高二", "高三"], resourceCategories = ["必做", "选做", "创新实验"], experimentCategories = ["必做", "选做", "创新实验"], experimentSources = ["官方目录", "学校自定义", "历史来源"], implementationModes = ["分组", "演示"], defaultPeriods = [[1, "08:00", "08:45"], [2, "08:55", "09:40"], [3, "10:00", "10:45"], [4, "10:55", "11:40"], [5, "13:30", "14:15"], [6, "14:25", "15:10"], [7, "15:25", "16:10"], [8, "16:20", "17:05"]];
  const subjectDefinition = value => subjectDefinitions.find(item => item.code === value || item.value === value || item.label === value || item.aliases.includes(value));
  const normalizeSubject = value => subjectDefinition(value)?.value || String(value || "").trim();
  const subjectLabel = value => subjectDefinition(value)?.label || String(value || "").trim();
  const subjectCode = value => subjectDefinition(value)?.code || "";
  const subjectEquals = (left, right) => !right || String(right).toUpperCase() === "ALL" || normalizeSubject(left) === normalizeSubject(right);
  const subjectOptionsFor = values => (values || subjects).map(value => { const definition = subjectDefinition(value); return [definition?.value || value, definition?.label || value]; });
  const group = (label, entries) => ({ label, items: entries.map(([id, label, mark, roles]) => ({ id, label, mark, href: `${id}.html`, ...(roles ? { roles } : {}) })) });
  const navigation = {
    district: [
      group("工作台", [["dashboard", "区域总览", "总"], ["ai-query", "智能问数", "问"]]),
      group("组织与配置", [["schools", "学校与上报", "校"], ["teachers", "人员与任课", "师"], ["settings", "基础数据与设置", "设"]]),
      group("教学监管", [["experiments", "实验计划监管", "课"], ["schedule", "实验开出统计", "统"]]),
      group("资产监管", [["equipment", "设备资产", "资"], ["consumables", "易耗品账目", "耗"], ["maintenance", "维修与报废", "修"]]),
      group("安全监管", [["safety", "危化品安全监管", "安"]])
    ],
    school: [
      group("工作台", [["dashboard", "学校总览", "工"], ["ai-query", "智能问数", "问"], ["archives", "教学资源库", "资"]]),
      group("教学运行", [["experiments", "实验计划", "课"], ["booking", "预约与安排", "约"]]),
      group("资产物资", [["devices", "设备与入库", "备"], ["supplies", "易耗品账目", "耗"], ["repair", "维修与报废", "修"]]),
      group("安全管理", [["safety", "危化品安全管理", "安", ["admin"]]]),
      group("基础设置", [["labs", "实验室档案", "室", ["admin"]], ["staff", "人员与班级", "人", ["admin"]]])
    ]
  };
  function navigationFor(scope, role) {
    return (navigation[scope] || []).map(section => ({ ...section, items: section.items.filter(item => !item.roles || item.roles.includes(role)) })).filter(section => section.items.length);
  }
  const tableNames = { schools: "学校", departments: "部门", staff: "人员", rooms: "实验室", cabinets: "橱柜", storageMoves: "存放位置调整", classes: "班级", assignments: "任课班级", terms: "学期", periods: "节次", assets: "设备资产", purchases: "采购申请", receipts: "入库单", repairs: "仪器设备维修报废", inventory: "易耗品账目", flows: "易耗品登记", plans: "实验计划", planTargets: "计划适用班级", planItems: "计划实验", textbooks: "教材", experimentCatalog: "官方实验目录", customExperiments: "学校自定义实验", teachingTasks: "班级执行记录", bookings: "实验预约", arrangements: "实验安排", summaries: "实验总结", checks: "检查记录", hazards: "隐患整改", tasks: "检查任务", archives: "业务附件", resources: "教学资源", submissions: "数据上报", logs: "操作日志" };
  const clone = value => JSON.parse(JSON.stringify(value));
  const must = (ok, message) => { if (!ok) throw new Error(message); };
  const text = (value, label = "内容", max = 2000) => { const s = String(value ?? "").trim(); must(s.length && s.length <= max, `请填写${label}（不超过${max}字）。`); return s; };
  const optional = (value, label, max = 200) => { const s = String(value ?? "").trim(); must(s.length <= max, `${label}不能超过${max}字。`); return s; };
  const num = (value, label, min = 0, integer = false) => { const n = Number(value); must(value !== "" && value != null && Number.isFinite(n) && n >= min && (!integer || Number.isInteger(n)), `${label}须为不小于${min}的${integer ? "整数" : "数值"}。`); return n; };
  const optionalNum = (value, label, min = 0, integer = false) => value === "" || value == null ? null : num(value, label, min, integer);
  const date = value => { const s = String(value || ""); must(/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s, "请选择有效日期。"); return s; };
  const choice = (value, options, label) => { const normalized = options.includes(value) ? value : normalizeSubject(value); must(options.includes(normalized), `${label}不在可选范围内。`); return normalized; };
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
    const subjectScopes = [...new Set((raw.subjectScopes || source.subjectScopes || []).map(normalizeSubject).filter(subject => subjects.includes(subject)))];
    return {
      itemId: raw.itemId || source.itemId || raw.classificationCode || source.classificationCode || "",
      classificationCode: raw.classificationCode || source.classificationCode || "",
      name: raw.name || source.name || "",
      spec: raw.spec || raw.model || source.spec || source.model || "",
      category,
      unit: raw.unit || source.unit || "件",
      trackingMode,
      maintenanceRequired: raw.maintenanceRequired ?? source.maintenanceRequired ?? trackingMode === "SERIALIZED",
      ...(subjectScopes.length ? { subjectScopes } : {}),
      ...((raw.shared ?? source.shared) === true ? { shared: true } : {}),
      ...((raw.subjectScope || source.subjectScope) === "通用" ? { subjectScope: "通用" } : {})
    };
  }
  function referenceSnapshot(db, record, unitPrice = 0) {
    const item = itemRecord(db, record);
    return { itemId: item.itemId || item.classificationCode, classificationCode: item.classificationCode, name: item.name, spec: item.spec, category: item.category, unit: item.unit, code: record?.code || "", purchaseDate: record?.purchaseDate || "", roomId: record?.roomId || "", ...(record?.cabinetId ? { cabinetId: record.cabinetId } : {}), custodian: record?.custodian || "", unitPrice: Number(unitPrice || 0), ...(item.subjectScopes?.length ? { subjectScopes: [...item.subjectScopes] } : {}), ...(item.shared === true ? { shared: true } : {}), ...(item.subjectScope === "通用" ? { subjectScope: "通用" } : {}) };
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
    const plan = item?.planId ? db.plans?.find(row => row.id === item.planId) : null;
    const official = item?.sourceType === "官方目录" || item?.experimentSource === "官方目录" ? db.experimentCatalog?.find(row => row.id === (item.sourceId || item.experimentId)) : null;
    const custom = item?.sourceType === "学校自定义" || item?.experimentSource === "学校自定义" ? db.customExperiments?.find(row => row.id === (item.sourceId || item.experimentId)) : null;
    const legacy = item?.catalogId ? db.catalog?.find(row => row.id === item.catalogId) : null;
    const source = official || custom || legacy;
    const category = item?.experimentCategory || item?.category || source?.experimentCategory || source?.category || item?.required || source?.required || "必做";
    return { ...(source || {}), ...(item || {}), id: item?.sourceId || item?.experimentId || item?.catalogId || item?.id, name: item?.experimentName || source?.name || item?.name || "未填写实验名称", subject: normalizeSubject(item?.subject || plan?.subject || source?.subject || ""), grade: item?.grade || plan?.grade || source?.grade || "", version: item?.version || plan?.version || source?.version || source?.textbook || "", required: category === "必做" ? "必做" : category === "选做" ? "选做" : item?.required || "选做", experimentCategory: category, category, sourceType: item?.sourceType || source?.sourceType || (custom ? "学校自定义" : official ? "官方目录" : "历史来源"), mode: item?.mode || source?.mode || "分组", chapter: item?.chapter || source?.chapter || "", equipment: item?.equipment || source?.equipment || source?.equipmentText || "", equipmentRequirements: item?.equipmentRequirements || source?.equipmentRequirements || [], periods: Number(item?.periods || source?.periods || 1) };
  }
  function equipmentRows(raw, fallback = "") {
    const rows = Array.isArray(raw) ? raw : [];
    const normalized = rows.map(row => ({ name: String(row?.name || row?.equipmentName || "").trim(), spec: String(row?.spec || row?.model || "").trim(), unit: String(row?.unit || "件").trim(), quantity: Number(row?.quantity ?? row?.qty ?? 1), note: String(row?.note || "").trim() })).filter(row => row.name);
    return normalized.length ? normalized : (String(fallback || "").split(/[、,，;；\n]/).map(name => name.trim()).filter(Boolean).map(name => ({ name, spec: "", unit: "件", quantity: 1, note: "" })));
  }
  function normalizeExperimentModel(db) {
    db.textbooks ||= [];
    db.experimentCatalog ||= [];
    db.customExperiments ||= [];
    db.planTargets ||= [];
    db.seq = Number(db.seq) || 0;
    const textbookByKey = new Map(db.textbooks.map(row => [`${row.subject || ""}|${row.grade || ""}|${row.version || ""}`, row]));
    const ensureTextbook = (subject, grade, version, preferredId = "") => {
      const key = `${subject || ""}|${grade || ""}|${version || ""}`;
      let textbook = preferredId && db.textbooks.find(row => row.id === preferredId) || textbookByKey.get(key);
      if (!textbook) {
        textbook = { id: preferredId || `MIG-TB-${++db.seq}`, name: `${subject || "实验"} · ${version || "教材"}`, subject: subject || "", grade: grade || "", version: version || "", state: "启用", legacy: true };
        db.textbooks.push(textbook);
      }
      textbookByKey.set(key, textbook);
      return textbook;
    };
    db.experimentCatalog.forEach(row => { const textbook = ensureTextbook(row.subject, row.grade, row.version, row.textbookId); row.textbookId = textbook.id; });
    db.customExperiments.forEach(row => { if (row.textbookId) { const textbook = ensureTextbook(row.subject, row.grade, row.version, row.textbookId); row.textbookId = textbook.id; } });
    // Earlier v11 migrations could already have removed db.catalog before the
    // new catalog tables were introduced. Rebuild an official catalog from
    // the preserved plan snapshots so the compile page remains usable.
    if (!db.experimentCatalog.length) {
      const rebuilt = new Map();
      (db.planItems || []).forEach(item => {
        const plan = db.plans?.find(row => row.id === item.planId), subject = item.subject || plan?.subject || "", grade = item.grade || plan?.grade || "", version = plan?.version || item.version || "历史教材", existingTextbook = item.textbookId && db.textbooks.find(row => row.id === item.textbookId && row.subject === subject && row.grade === grade && row.version === version), textbook = ensureTextbook(subject, grade, version, existingTextbook?.id || ""), category = experimentCategories.includes(item.experimentCategory || item.category || item.required) ? item.experimentCategory || item.category || item.required : "必做", key = `${textbook.id}|${subject}|${grade}|${item.experimentName || item.name || item.id}|${item.chapter || ""}`;
        let source = rebuilt.get(key);
        if (!source) {
          source = { id: `MIG-EC-${++db.seq}`, code: `HIST-${db.seq}`, name: item.experimentName || item.name || `历史实验 ${item.id}`, subject, grade, version, textbookId: textbook.id, sourceType: "官方目录", experimentCategory: category, category, required: category === "必做" ? "必做" : "选做", mode: item.mode || "分组", supportedModes: [item.mode || "分组"], chapter: item.chapter || "未分章节", equipment: item.equipment || "", equipmentRequirements: equipmentRows(item.equipmentRequirements, item.equipment), periods: Number(item.periods || 1), state: "启用", legacy: true };
          rebuilt.set(key, source);
          db.experimentCatalog.push(source);
        }
        item.sourceId = source.id;
        item.sourceType = "官方目录";
        item.textbookId = textbook.id;
      });
    }
    // The demo may already have been opened with an earlier v11 seed that
    // only contained 高一. Keep that local dataset usable by adding the
    // higher-grade sample choices without touching non-demo datasets.
    const isDemoSeed = ["S1", "S2", "S3"].every(id => db.schools?.some(row => row.id === id));
    if (isDemoSeed) {
      const gradeSpecs = [["高一", 1], ["高二", 2], ["高三", 3]], subjectsForGrade = [["科学", "KX"], ["物理", "WL"], ["化学", "HX"], ["生物", "SW"]];
      // Complete demo datasets that were saved by an earlier v11 build. The
      // marker prevents a user-deleted sample from being recreated later.
      if (db.subjectModelVersion !== 1) {
        const scienceItem = { itemId: "IT11", classificationCode: "202010001", name: "手持放大镜", spec: "5倍", category: "科学仪器", unit: "个", trackingMode: "SERIALIZED", maintenanceRequired: false };
        let scienceTextbook = db.textbooks.find(row => row.subject === "科学" && row.grade === "高一");
        if (!scienceTextbook) {
          scienceTextbook = { id: db.textbooks.some(row => row.id === "TB-KX-01") ? `DEMO-TB-KX-${++db.seq}` : "TB-KX-01", name: "高中科学·校本探究册", subject: "科学", grade: "高一", version: "校本探究册", state: "启用", legacy: true };
          db.textbooks.push(scienceTextbook);
        }
        let scienceSource = db.experimentCatalog.find(row => row.subject === "科学" && row.grade === "高一" && row.sourceType === "官方目录");
        if (!scienceSource) {
          scienceSource = { id: db.experimentCatalog.some(row => row.id === "E7") ? `DEMO-E-KX-${++db.seq}` : "E7", code: "KX-01", name: "观察与测量身边的生物多样性", subject: "科学", grade: "高一", version: scienceTextbook.version, textbookId: scienceTextbook.id, sourceType: "官方目录", experimentCategory: "必做", category: "必做", required: "必做", mode: "分组", supportedModes: ["分组", "演示"], chapter: "第一章 科学探究", equipment: "放大镜、刻度尺、记录单", equipmentRequirements: [], periods: 1, state: "启用", legacy: true };
          db.experimentCatalog.push(scienceSource);
        }
        db.schools.forEach((school, schoolIndex) => {
          let scienceTeacher = db.staff.find(row => row.school === school.id && row.role === "teacher" && normalizeSubject(row.subject) === "科学");
          if (!scienceTeacher) {
            const preferredId = `${school.id}-T5`, fallbackNames = ["林晓岚", "蒋星河", "孙若谷"];
            scienceTeacher = { id: db.staff.some(row => row.id === preferredId) ? `DEMO-SCI-T-${school.id}` : preferredId, school: school.id, name: fallbackNames[schoolIndex] || `${school.name}科学教师`, role: "teacher", subject: "科学", departmentId: db.departments.find(row => row.school === school.id && row.name.includes("教研"))?.id || db.departments.find(row => row.school === school.id)?.id || "", title: "一级教师", phone: "", enabled: true, qualification: "教师资格证", sex: "", legacy: true };
            db.staff.push(scienceTeacher);
          }
          let scienceRoom = db.rooms.find(row => row.school === school.id && normalizeSubject(row.subject) === "科学" && row.type === "教学实验室");
          if (!scienceRoom) {
            const preferredId = `${school.id}-L4`;
            scienceRoom = { id: db.rooms.some(row => row.id === preferredId) ? `DEMO-SCI-L-${school.id}` : preferredId, school: school.id, name: "科学探究实验室 1", roomNo: db.rooms.some(row => row.school === school.id && row.roomNo === "D201") ? `SCI-${school.id}` : "D201", type: "教学实验室", subject: "科学", area: 96, seats: 48, builtAt: "2023-08-20", builder: "", stage: school.stage, features: "电源保护、灭火器", hazardStorage: false, note: "", state: "可用", legacy: true };
            db.rooms.push(scienceRoom);
          }
          if (!db.assets.some(row => row.school === school.id && itemFitsSubject(itemOf(db, row), "科学") && (row.classificationCode === scienceItem.classificationCode || row.itemId === scienceItem.itemId))) {
            const receipt = db.receipts.find(row => row.id === `${school.id}-RK0`) || db.receipts.find(row => row.school === school.id);
            const assetId = db.assets.some(row => row.id === `${school.id}-A7`) ? `DEMO-SCI-A-${school.id}` : `${school.id}-A7`, assetSerial = nextAssetSerial(db, school.id);
            const asset = { ...scienceItem, id: assetId, school: school.id, assetSerial, price: 45, purchaseDate: receipt?.purchaseDate || "2024-03-15", roomId: scienceRoom.id, supplier: receipt?.supplier || "华东教学仪器有限公司", state: "正常使用", sourceId: receipt?.id || "", nextMaintenance: "", legacy: true };
            asset.code = assetCode(db, asset, assetSerial);
            db.assets.push(asset);
            if (receipt && !(receipt.items || []).some(line => line.classificationCode === scienceItem.classificationCode)) (receipt.items ||= []).push({ ...scienceItem, model: scienceItem.spec, qty: 1, price: 45, roomId: scienceRoom.id, nextMaintenance: "" });
          }
          const sciencePlan = db.plans.find(row => row.school === school.id && row.term === "TERM26" && normalizeSubject(row.subject) === "科学" && row.state === "已发布");
          if (!sciencePlan) {
            const preferredId = `${school.id}-P4`, planId = db.plans.some(row => row.id === preferredId) ? `DEMO-SCI-P-${school.id}` : preferredId;
            const plan = { id: planId, school: school.id, term: "TERM26", subject: "科学", grade: "高一", version: scienceTextbook.version, textbookId: scienceTextbook.id, targetMode: "EXPLICIT", name: `2026-2027学年第一学期 · 高一科学实验计划`, state: "已发布", createdBy: db.staff.find(row => row.school === school.id && row.role === "admin")?.id || "MIGRATION", createdAt: db.updatedAt, publishedAt: db.updatedAt, legacy: true };
            const item = { id: `${planId}-I1`, school: school.id, planId, sourceId: scienceSource.id, sourceType: "官方目录", textbookId: scienceTextbook.id, subject: "科学", grade: "高一", version: scienceTextbook.version, experimentName: scienceSource.name, chapter: scienceSource.chapter, equipment: scienceSource.equipment, equipmentRequirements: equipmentRows(scienceSource.equipmentRequirements, scienceSource.equipment), periods: 1, required: "必做", experimentCategory: "必做", category: "必做", mode: "分组", scheduleType: "WEEK", plannedWeek: 3, plannedDate: "", legacy: true };
            db.plans.push(plan);
            db.planItems.push(item);
            db.classes.filter(row => row.school === school.id && row.grade === "高一" && row.state === "在读").forEach(klass => db.planTargets.push({ id: `${planId}-${klass.id}`, school: school.id, planId, classId: klass.id, grade: klass.grade, state: "启用", legacy: true }));
          }
        });
        gradeSpecs.forEach(([grade, gradeIndex]) => {
        // Keep every demo grade selectable even when an older local dataset
        // has lost its catalog rows. Classes and teaching assignments are
        // independent of the catalog migration.
        db.schools.forEach(school => {
          [1, 2].forEach(n => {
            const classId = `${school.id}-C${(gradeIndex - 1) * 2 + n}`;
            if (!db.classes.some(row => row.id === classId)) db.classes.push({ id: classId, school: school.id, name: `${grade}${n}班`, grade, students: 40 + n + gradeIndex - 1, state: "在读", legacy: true });
            subjectsForGrade.forEach(([subject]) => {
              const teacher = db.staff.find(row => row.school === school.id && row.role === "teacher" && row.subject === subject) || db.staff.find(row => row.school === school.id && row.role === "teacher" && row.subject === "综合");
              if (teacher && !db.assignments.some(row => row.school === school.id && row.term === "TERM26" && row.classId === classId && row.subject === subject && row.state === "有效")) db.assignments.push({ id: `DEMO-AS-${school.id}-${gradeIndex}-${subject}-${n}`, school: school.id, term: "TERM26", classId, subject, teacherId: teacher.id, primary: true, state: "有效", legacy: true });
            });
          });
        });
        if (grade === "高一") return;
        subjectsForGrade.forEach(([subject, prefix], subjectIndex) => {
          const base = db.experimentCatalog.find(row => row.subject === subject && row.grade === "高一" && row.sourceType === "官方目录");
          if (!base) return;
          const textbookId = `TB-${prefix}-${gradeIndex}`, version = `人教版·${grade}实验册`;
          if (!db.textbooks.some(row => row.id === textbookId)) db.textbooks.push({ id: textbookId, name: `高中${subject}·${version}`, subject, grade, version, state: "启用", legacy: true });
          const preferredCatalogId = `E${8 + (gradeIndex - 2) * 4 + subjectIndex}`, catalogId = db.experimentCatalog.some(row => row.id === preferredCatalogId) ? `DEMO-EC-${prefix}-${gradeIndex}` : preferredCatalogId;
          if (!db.experimentCatalog.some(row => row.subject === subject && row.grade === grade && row.sourceType === "官方目录")) db.experimentCatalog.push({ ...base, id: catalogId, code: `${prefix}-${gradeIndex}01`, name: `${base.name}（${grade}）`, grade, version, textbookId, sourceType: "官方目录", experimentCategory: base.experimentCategory || base.required || "必做", category: base.experimentCategory || base.required || "必做", supportedModes: base.supportedModes || [base.mode || "分组"], equipmentRequirements: equipmentRows(base.equipmentRequirements, base.equipment) });
        });
        });
        db.subjectModelVersion = 1;
      }
      (db.planItems || []).filter(item => normalizeSubject(db.plans.find(plan => plan.id === item.planId)?.subject) === "科学").forEach(item => syncTeachingTasks(db, item.id));
    }
    db.experimentCatalog.forEach(row => {
      row.sourceType = "官方目录";
      row.experimentCategory ||= row.experimentCategory || row.category || row.required || "必做";
      row.category = row.experimentCategory;
      row.supportedModes ||= [row.mode || "分组"];
      row.equipmentRequirements = equipmentRows(row.equipmentRequirements, row.equipment);
    });
    db.customExperiments.forEach(row => {
      row.sourceType = "学校自定义";
      row.experimentCategory = "创新实验";
      row.category = "创新实验";
      row.equipmentRequirements = equipmentRows(row.equipmentRequirements, row.equipment);
      row.equipment = row.equipment || row.equipmentRequirements.map(item => item.name).join("、");
      row.supportedModes ||= [row.mode || "分组"];
    });
    const catalogById = new Map(db.experimentCatalog.map(row => [row.id, row])), customById = new Map(db.customExperiments.map(row => [row.id, row]));
    (db.plans || []).forEach(plan => {
      const first = (db.planItems || []).find(item => item.planId === plan.id);
      plan.grade ||= first?.grade || "";
      plan.version ||= first?.version || first?.textbookVersion || "";
      plan.textbookId ||= first?.textbookId || "";
      const termName = db.terms?.find(term => term.id === plan.term)?.name || "", displaySubject = subjectLabel(plan.subject), expectedName = termName && plan.grade && plan.subject ? `${termName} · ${plan.grade}${displaySubject}实验计划` : "", legacyNames = new Set([`${plan.subject}实验计划`, `${plan.grade}-${plan.subject}实验计划`, `${plan.grade}${plan.subject}实验计划`, `${displaySubject}实验计划`, `${plan.grade}-${displaySubject}实验计划`, `${plan.grade}${displaySubject}实验计划`]);
      if (expectedName && (!plan.name || legacyNames.has(plan.name))) plan.name = expectedName;
    });
    (db.planItems || []).forEach(item => {
      const plan = db.plans?.find(row => row.id === item.planId), source = item.sourceType === "学校自定义" ? customById.get(item.sourceId || item.experimentId) : item.sourceType === "官方目录" ? catalogById.get(item.sourceId || item.experimentId) : null;
      const category = item.experimentCategory || item.category || source?.experimentCategory || item.required || "必做";
      item.experimentCategory = experimentCategories.includes(category) ? category : "必做";
      item.category = item.experimentCategory;
      item.sourceType ||= source ? source.sourceType : "历史来源";
      item.sourceId ||= source?.id || "";
      item.subject = normalizeSubject(plan?.subject || source?.subject || item.subject || "");
      item.grade = plan?.grade || source?.grade || item.grade || "";
      item.version = source?.version || item.version || plan?.version || "";
      item.textbookId = source?.textbookId || item.textbookId || plan?.textbookId || "";
      item.equipmentRequirements = equipmentRows(item.equipmentRequirements || source?.equipmentRequirements, item.equipment || source?.equipment);
      item.equipment ||= item.equipmentRequirements.map(row => row.name).join("、");
      item.required = item.experimentCategory === "必做" ? "必做" : "选做";
    });
    db.planTargets = db.planTargets.filter(target => db.plans.some(plan => plan.id === target.planId) && db.classes.some(klass => klass.id === target.classId));
    (db.plans || []).forEach(plan => {
      if (!["EXPLICIT", "LEGACY_ALL"].includes(plan.targetMode)) plan.targetMode = db.planTargets.some(target => target.planId === plan.id) ? "EXPLICIT" : "LEGACY_ALL";
    });
    return db;
  }
  function normalizeSubjectFields(db) {
    const directTables = ["staff", "rooms", "assignments", "plans", "planItems", "textbooks", "experimentCatalog", "customExperiments", "resources"];
    directTables.forEach(table => (db[table] || []).forEach(row => {
      if (!row.subject) { delete row.subjectCode; return; }
      row.subject = normalizeSubject(row.subject);
      const code = subjectCode(row.subject);
      if (code) row.subjectCode = code;
      else delete row.subjectCode;
    }));
    (db.planItems || []).forEach(item => {
      const plan = db.plans?.find(row => row.id === item.planId), source = db.experimentCatalog?.find(row => row.id === item.sourceId) || db.customExperiments?.find(row => row.id === item.sourceId), subject = plan?.subject || source?.subject || item.subject;
      if (subject) { item.subject = normalizeSubject(subject); item.subjectCode = subjectCode(item.subject); }
    });
    (db.teachingTasks || []).forEach(task => {
      const item = db.planItems?.find(row => row.id === task.planItemId), plan = item && db.plans?.find(row => row.id === item.planId), subject = item?.subject || plan?.subject || task.subject;
      if (subject) { task.subject = normalizeSubject(subject); task.subjectCode = subjectCode(task.subject); }
    });
    (db.bookings || []).forEach(booking => {
      const task = db.teachingTasks?.find(row => row.id === booking.taskId), subject = task?.subject || booking.subject;
      if (subject) { booking.subject = normalizeSubject(subject); booking.subjectCode = subjectCode(booking.subject); }
    });
    (db.arrangements || []).forEach(arrangement => {
      const booking = db.bookings?.find(row => row.id === arrangement.bookingId), subject = booking?.subject || arrangement.subject;
      if (subject) { arrangement.subject = normalizeSubject(subject); arrangement.subjectCode = subjectCode(arrangement.subject); }
    });
    (db.summaries || []).forEach(summary => {
      const arrangement = db.arrangements?.find(row => row.id === summary.arrangementId), subject = arrangement?.subject || summary.subject;
      if (subject) { summary.subject = normalizeSubject(subject); summary.subjectCode = subjectCode(summary.subject); }
    });
    const normalizeScopes = record => {
      if (!record || !Array.isArray(record.subjectScopes)) return;
      record.subjectScopes = [...new Set(record.subjectScopes.map(normalizeSubject).filter(subject => subjects.includes(subject)))];
      if (!record.subjectScopes.length) delete record.subjectScopes;
    };
    [...(db.assets || []), ...(db.inventory || []), ...(db.bookings || []).flatMap(row => row.requestedResources || [])].forEach(normalizeScopes);
    ["purchases", "receipts"].forEach(table => (db[table] || []).forEach(document => (document.items || []).forEach(normalizeScopes)));
    (db.flows || []).forEach(flow => normalizeScopes(flow.snapshot));
    return db;
  }
  function experimentKey(db, item) { const plan = db.plans?.find(row => row.id === item?.planId), experiment = experimentOf(db, item), sourceKey = experiment.sourceType === "历史来源" ? experiment.name : experiment.id; return [plan?.school || item?.school || "", plan?.subject || experiment.subject, plan?.grade || experiment.grade, plan?.version || experiment.version, experiment.category, experiment.sourceType, sourceKey, experiment.chapter, experiment.mode].map(value => String(value || "").trim()).join("|"); }
  const isHazard = item => item?.category === "危化品";
  const itemSubjectScopes = item => {
    if (Array.isArray(item?.subjectScopes) && item.subjectScopes.length) return item.subjectScopes.map(normalizeSubject);
    const category = String(item?.category || "");
    if (category.endsWith("仪器")) return [normalizeSubject(category.replace(/仪器$/, ""))];
    if (isHazard(item)) return ["化学"];
    return [];
  };
  const itemFitsSubject = (item, subject) => {
    if (!item) return false;
    if (!subject || String(subject).toUpperCase() === "ALL") return true;
    const normalized = normalizeSubject(subject), scopes = itemSubjectScopes(item);
    return !scopes.length || scopes.includes(normalized) || item.shared === true || item.subjectScope === "通用";
  };
  const roomFitsItem = (room, item) => !!room && (!isHazard(item) || room.hazardStorage === true) && (!room.subject || itemFitsSubject(item, room.subject));
  const expiredHazard = (db, stock) => isHazard(itemOf(db, stock)) && !!stock.expiry && stock.expiry < TODAY;
  const roomLabel = (db, roomId) => roomId ? find(db, "rooms", roomId).roomNo : "待分配";
  const cabinetOf = (db, record) => record?.cabinetId ? db.cabinets?.find(cabinet => cabinet.id === record.cabinetId) || null : null;
  const cabinetFitsItem = (db, cabinet, item) => {
    if (!cabinet || cabinet.state !== "启用") return false;
    const room = db.rooms?.find(row => row.id === cabinet.roomId);
    return !!room && room.state === "可用" && roomFitsItem(room, item) && (!isHazard(item) || cabinet.hazardStorage === true);
  };
  const locationLabel = (db, record, snapshot = record) => {
    const room = snapshot?.roomId ? db.rooms?.find(row => row.id === snapshot.roomId) : null;
    const cabinet = snapshot?.cabinetId ? db.cabinets?.find(row => row.id === snapshot.cabinetId) : null;
    if (!room) return "待分配";
    return `${room.roomNo}${cabinet ? ` / ${cabinet.code} ${cabinet.name}` : " / 直接存放"}`;
  };
  function normalizeCabinets(db) {
      db.cabinets ||= [];
      db.storageMoves ||= [];
      if (!db.cabinets.length && db.rooms?.length) {
        db.rooms.filter(room => room.type !== "普通教室").forEach(room => db.cabinets.push({ id: `MIG-CAB-${room.id}`, school: room.school, roomId: room.id, code: `MIG-${room.roomNo || room.id}`, name: "默认存放柜", type: room.hazardStorage ? "危化品专用柜" : "其他", state: "启用", custodianId: db.staff?.find(person => person.school === room.school && person.role === "admin" && person.enabled)?.id || "", hazardStorage: room.hazardStorage === true, note: "由历史数据迁移生成，可按学校实际柜位调整。", legacy: true }));
      }
      const validCabinetIds = new Set(db.cabinets.filter(cabinet => cabinet.id && cabinet.school && db.schools.some(school => school.id === cabinet.school) && db.rooms.some(room => room.id === cabinet.roomId && room.school === cabinet.school)).map(cabinet => cabinet.id));
    ["tasks", "checks", "hazards"].forEach(table => (db[table] || []).forEach(row => {
      if (row.targetType !== "cabinet" || validCabinetIds.has(row.targetId)) return;
      const replacement = db.cabinets.find(cabinet => cabinet.school === row.school && cabinet.roomId === row.roomId && (row.safetyScope !== "hazardous" || cabinet.hazardStorage === true));
      if (replacement) row.targetId = replacement.id;
      else { row.targetType = "room"; row.targetId = row.roomId; }
    }));
    ["assets", "inventory"].forEach(table => (db[table] || []).forEach(row => { if (!validCabinetIds.has(row.cabinetId)) delete row.cabinetId; }));
    ["purchases", "receipts"].forEach(table => (db[table] || []).forEach(document => (document.items || []).forEach(row => { if (!validCabinetIds.has(row.cabinetId)) delete row.cabinetId; })));
    (db.flows || []).forEach(flow => { if (flow.snapshot && !validCabinetIds.has(flow.snapshot.cabinetId)) delete flow.snapshot.cabinetId; });
    return db;
  }
  function safetyContext(db, input = {}, school = input.school || "") {
    const safetyScope = choice(input.safetyScope || "general", ["hazardous", "general"], "安全管理范围"), targetType = choice(input.targetType || (safetyScope === "general" ? "room" : ""), ["inventory", "cabinet", "room"], "检查对象类型"), targetId = text(input.targetId || (targetType === "room" ? input.roomId : ""), "检查对象");
    const target = find(db, { inventory: "inventory", cabinet: "cabinets", room: "rooms" }[targetType], targetId), roomId = targetType === "room" ? target.id : target.roomId, room = find(db, "rooms", roomId);
    must(!school || target.school === school, "检查对象须属于当前学校。");
    must(room.school === target.school, "检查对象与存放房间学校不一致。");
    must(!input.roomId || input.roomId === roomId, "检查对象与所选房间不一致。");
    if (safetyScope === "hazardous") {
      must(room.state === "可用", "危化品检查须选择当前可用的存放房间。");
      must(room.hazardStorage === true, "危化品检查须选择具备危化品存放条件的房间。");
      if (targetType === "inventory") must(isHazard(itemOf(db, target)) && !target.pendingReceiptCreated, "请选择正式登记的危化品库存。");
      if (targetType === "cabinet") must(target.state === "启用" && target.hazardStorage === true, "请选择当前启用且具备危化品存放条件的专柜。");
    } else must(targetType === "room", "一般安全检查按房间登记。");
    return { school: target.school, safetyScope, targetType, targetId, roomId };
  }
  function safetyTargetLabel(db, record) {
    const room = db.rooms?.find(row => row.id === record?.roomId), scope = record?.safetyScope === "hazardous";
    if (!scope) return `一般安全 · ${room?.name || record?.roomId || "未登记房间"}`;
    if (record.targetType === "inventory") { const stock = db.inventory?.find(row => row.id === record.targetId); return `具体危化品 · ${stock?.name || record.targetId}（${record.targetId}）`; }
    if (record.targetType === "cabinet") { const cabinet = db.cabinets?.find(row => row.id === record.targetId); return `危化品专柜 · ${cabinet?.code || ""} ${cabinet?.name || record.targetId}（柜级范围）`; }
    return `危化品存放房间 · ${room?.name || record.targetId}（房间环境范围）`;
  }
  function safetyRelatedToStock(db, record, stock) {
    if (!record || !stock || record.safetyScope !== "hazardous" || record.school !== stock.school || !isHazard(itemOf(db, stock))) return false;
    if (record.targetType === "inventory") return record.targetId === stock.id;
    if (record.targetType === "cabinet") return !!stock.cabinetId && record.targetId === stock.cabinetId;
    return record.targetType === "room" && !!stock.roomId && record.targetId === stock.roomId;
  }
  const sameSafetyTarget = (left, right) => left.safetyScope === right.safetyScope && left.targetType === right.targetType && left.targetId === right.targetId && left.roomId === right.roomId;
  function syncSafetyTask(db, check) {
    if (!check?.taskId) return null;
    const task = find(db, "tasks", check.taskId), hazards = db.hazards.filter(row => row.checkId === check.id);
    task.state = hazards.length ? hazards.every(row => row.state === "已关闭") ? "已完成" : "待整改" : check.result === "正常" ? "已完成" : "待检查";
    return task;
  }
  function normalizeSafetyModel(db) {
    const legacyModel = db.safetyModelVersion !== 1;
    ["tasks", "checks", "hazards"].forEach(table => { db[table] ||= []; });
    ["tasks", "checks"].forEach(table => db[table].forEach(row => {
      if (!row.safetyScope || !row.targetType || !row.targetId) Object.assign(row, { safetyScope: "general", targetType: "room", targetId: row.roomId || "" });
      if (table === "tasks") row.sourceType ||= "district";
    }));
    db.hazards.forEach(row => {
      const check = db.checks.find(item => item.id === row.checkId);
      if (!row.safetyScope || !row.targetType || !row.targetId) Object.assign(row, check ? { safetyScope: check.safetyScope, targetType: check.targetType, targetId: check.targetId, roomId: check.roomId } : { safetyScope: "general", targetType: "room", targetId: row.roomId || "" });
      row.reviewHistory ||= [];
      row.submissionHistory ||= [];
      if (row.state === "待复查") {
        const complete = !!row.rectification && !!row.attachmentId;
        row.state = complete ? "待校内复核" : "整改中";
        row.migrationNote = complete ? "历史待复查转入校内复核，保留原整改材料。" : "历史待复查缺少完整整改材料，转回整改中。";
      }
      if (row.rectification && row.attachmentId && !row.submissionHistory.length) row.submissionHistory.push({ submitterId: row.submitterId || "", submitterName: row.submitterName || row.owner || "历史未登记", at: row.submittedAt || "", rectification: row.rectification, attachmentId: row.attachmentId, legacy: true });
      if (legacyModel && row.state === "已关闭" && (!row.rectification || !row.attachmentId || !row.reviewHistory.length)) row.legacyClosed = true;
    });
    db.checks.forEach(check => { if (db.hazards.some(row => row.checkId === check.id)) check.result = "发现隐患"; else if (check.result === "通过") check.result = "正常"; syncSafetyTask(db, check); });
    db.safetyModelVersion = 1;
    return db;
  }
  function seedHazardSafetyExamples(db) {
    if (db.safetyDemoVersion === 1) return;
    db.schools.forEach(school => {
      const stock = db.inventory.find(row => row.school === school.id && isHazard(row)), other = db.inventory.find(row => row.school === school.id && isHazard(row) && row.id !== stock?.id), admin = db.staff.find(row => row.school === school.id && row.role === "admin" && row.enabled);
      if (!stock || !other || !admin) return;
      const cabinet = db.cabinets.find(row => row.id === stock.cabinetId && row.hazardStorage), suffix = school.id;
      const specs = [
        ["OPEN", "inventory", stock.id, "无水乙醇标签信息不完整，需补全有效期与责任人标识", "待整改", false],
        ["SCHOOL", "inventory", other.id, "浓硫酸库存台账与现场清点记录不一致，需复核并补充凭证", "待校内复核", false],
        ["DISTRICT", cabinet ? "cabinet" : "room", cabinet?.id || stock.roomId, "危化品专柜领用登记缺少复核签名", "待区级复查", true],
        ["RETURNED", "inventory", stock.id, "无水乙醇近效期处置记录缺少现场核对材料", "整改中", true],
        ["CLOSED", "inventory", other.id, "浓硫酸容器标签字迹不清，已完成标签信息核对", "已关闭", false]
      ];
      specs.forEach(([key, targetType, targetId, title, state, district]) => {
        const checkId = `HZ-${suffix}-CHECK-${key}`, hazardId = `HZ-${suffix}-${key}`, taskId = district ? `HZ-${suffix}-TASK-${key}` : "", context = safetyContext(db, { safetyScope: "hazardous", targetType, targetId }, school.id), attachmentId = state === "待整改" ? "" : `HZ-${suffix}-FILE-${key}`, at = "2026-08-31T08:00:00+08:00";
        if (db.hazards.some(row => row.id === hazardId)) return;
        const check = { id: checkId, ...context, taskId, kind: "危化品专项检查", date: TODAY, inspector: admin.name, inspectorId: admin.id, items: "账物数量核对、包装和标签、有效期与近效期、领用和双人复核", result: "发现隐患", note: `检查范围：${safetyTargetLabel(db, context)}` };
        db.checks.push(check);
        if (taskId) db.tasks.push({ id: taskId, ...context, sourceType: "district", createdBy: "DISTRICT", kind: "危化品专项检查", due: "2026-09-05", owner: admin.name, state: "待整改", checkId });
        const hazard = { id: hazardId, ...context, checkId, title, owner: admin.name, level: "需优先处理", date: TODAY, due: "2026-09-05", state, note: "危化品专项检查演示记录。", reviewHistory: [], submissionHistory: [] };
        if (attachmentId) {
          const rectification = key === "RETURNED" ? "已补充近效期登记，但现场核对材料仍需完善。" : "已按检查项完成核对并补充整改记录，请管理员验收。";
          db.archives.push({ id: attachmentId, school: school.id, name: `危化品整改核对记录-${key}.txt`, category: "安全管理", relatedTable: "hazards", relatedId: hazardId, date: TODAY, uploader: admin.name, state: "已归档", mime: "text/plain;charset=utf-8", content: `检查对象：${safetyTargetLabel(db, context)}\n隐患：${title}\n整改说明：${rectification}\n核对人：${admin.name}\n日期：${TODAY}` });
          Object.assign(hazard, { attachmentId, rectification, submitterId: admin.id, submitterName: admin.name, submittedAt: at });
          hazard.submissionHistory.push({ submitterId: admin.id, submitterName: admin.name, at, rectification, attachmentId });
        }
        if (["待区级复查", "已关闭", "整改中"].includes(state)) {
          const schoolReason = "核对整改材料及检查对象，校内复核通过。";
          hazard.reviewHistory.push({ stage: "school", approve: true, result: "通过", reason: schoolReason, reviewerId: admin.id, reviewerName: admin.name, at });
          Object.assign(hazard, { review: schoolReason, reviewer: admin.name, reviewerId: admin.id, reviewedAt: at });
          if (["已关闭", "整改中"].includes(state)) {
            const districtApprove = state === "已关闭", districtReason = districtApprove ? "区级复查确认整改到位，同意关闭。" : "区级复查退回：请补充现场核对材料后重新提交。";
            hazard.reviewHistory.push({ stage: "district", approve: districtApprove, result: districtApprove ? "通过" : "驳回", reason: districtReason, reviewerId: "DISTRICT", reviewerName: "周岚", at });
            Object.assign(hazard, { review: districtReason, reviewer: "周岚", reviewerId: "DISTRICT", reviewedAt: at });
          }
        }
        db.hazards.push(hazard); syncSafetyTask(db, check);
      });
      const pendingId = `HZ-${suffix}-TASK-PENDING`;
      if (!db.tasks.some(row => row.id === pendingId)) db.tasks.push({ id: pendingId, ...safetyContext(db, { safetyScope: "hazardous", targetType: "inventory", targetId: stock.id }, school.id), sourceType: "district", createdBy: "DISTRICT", kind: "危化品专项检查", due: "2026-09-05", owner: admin.name, state: "待检查" });
    });
    db.safetyDemoVersion = 1;
  }
  const periodFor = (db, school, number, term) => db.periods.find(p => p.school === school && p.term === term && p.number === Number(number));
  function taskContext(db, taskOrId) { const task = typeof taskOrId === "string" ? find(db, "teachingTasks", taskOrId) : taskOrId, item = find(db, "planItems", task.planItemId), plan = find(db, "plans", item.planId), experiment = experimentOf(db, item), assignment = find(db, "assignments", task.assignmentId), klass = find(db, "classes", task.classId), teacher = find(db, "staff", task.teacherId); return { task, item, plan, experiment, assignment, klass, teacher }; }
  function syncTeachingTasks(db, itemId = "") {
    db.planItems.filter(item => !itemId || item.id === itemId).forEach(item => { const plan = find(db, "plans", item.planId); if (plan.state !== "已发布") return; const experiment = experimentOf(db, item), targetIds = new Set((db.planTargets || []).filter(target => target.planId === plan.id).map(target => target.classId)), explicitTargets = plan.targetMode === "EXPLICIT"; db.assignments.filter(a => a.school === plan.school && a.term === plan.term && a.subject === plan.subject && a.state === "有效" && a.primary && (!explicitTargets || targetIds.has(a.classId))).forEach(a => { const klass = find(db, "classes", a.classId), existing = db.teachingTasks.find(t => t.planItemId === item.id && t.assignmentId === a.id), suppressionKey = `${item.id}|${a.id}`; if ((db.deletedTaskKeys || []).includes(suppressionKey)) return; if (klass.state !== "在读" || klass.grade !== experiment.grade) return; const completedEquivalent = db.teachingTasks.some(task => { if (task.school !== plan.school || task.term !== plan.term || task.classId !== klass.id || task.state !== "已完成") return false; const historicalItem = db.planItems.find(row => row.id === task.planItemId); return experimentKey(db, historicalItem) === experimentKey(db, item); }); if (completedEquivalent) return; if (existing) { if (existing.state === "已失效") existing.state = "待预约"; return; } db.teachingTasks.push({ id: `TASK-${++db.seq}`, school: plan.school, term: plan.term, planItemId: item.id, assignmentId: a.id, classId: a.classId, teacherId: a.teacherId, category: experiment.experimentCategory, sourceType: experiment.sourceType, experimentIdentityKey: experimentKey(db, item), state: "待预约" }); }); });
  }
  function seed() {
    const db = { version: VERSION, revision: 0, seq: 200, deletedTaskKeys: [], updatedAt: "2026-08-31T08:00:00+08:00", settings: { region: "上海市青浦区", authority: "青浦区教育局", repairDays: 7, lowStock: true, weeklyReport: true, syncReminder: true, exportEnabled: true } };
    Object.keys(tableNames).forEach(table => { db[table] = []; });
    db.schools = [{ id: "S1", code: "QP001", name: "青浦高级中学", stage: "高中" }, { id: "S2", code: "QP002", name: "青浦区第一中学", stage: "高中" }, { id: "S3", code: "QP003", name: "东湖中学", stage: "高中" }];
    db.terms = [{ id: "TERM26", name: "2026-2027学年第一学期", start: TODAY, end: "2027-01-29" }, { id: "TERM25", name: "2025-2026学年第二学期", start: "2026-03-02", end: "2026-07-03" }];
    const experimentRows = [["E1", "WL-01", "测量物体的速度", "物理", "必做", "分组", "第一章 运动的描述", "轨道小车、计时器、刻度尺"], ["E2", "HX-01", "配制一定物质的量浓度的溶液", "化学", "必做", "分组", "第一章 物质及其变化", "电子天平、容量瓶、烧杯"], ["E3", "SW-01", "使用显微镜观察细胞", "生物", "必做", "分组", "第一章 走近细胞", "显微镜、载玻片、盖玻片"], ["E4", "WL-02", "探究加速度与力、质量的关系", "物理", "必做", "演示", "第四章 运动和力的关系", "轨道小车、砝码"], ["E5", "SW-02", "校园植物细胞观察拓展", "生物", "选做", "分组", "显微观察拓展", "显微镜、载玻片、盖玻片"], ["E6", "WL-X01", "纸桥承重结构创新探究", "物理", "创新实验", "分组", "结构创新探究", "结构纸、木夹、砝码", "创新探究"], ["E7", "KX-01", "观察与测量身边的生物多样性", "科学", "必做", "分组", "第一章 科学探究", "放大镜、刻度尺、记录单"]].map(([id, code, name, subject, category, mode, chapter, equipment, note]) => ({ id, code, name, subject, required: category === "必做" ? "必做" : category === "选做" ? "选做" : "选做", experimentCategory: category, category, sourceType: "官方目录", mode, chapter, equipment, note: note || "", grade: "高一", version: id === "E5" ? "校本拓展2026版" : "人教版·必修第一册", periods: id === "E4" ? 2 : 1 }));
    const textbookRows = [{ id: "TB-WL-01", name: "高中物理·人教版·必修第一册", subject: "物理", grade: "高一", version: "人教版·必修第一册", state: "启用" }, { id: "TB-HX-01", name: "高中化学·人教版·必修第一册", subject: "化学", grade: "高一", version: "人教版·必修第一册", state: "启用" }, { id: "TB-SW-01", name: "高中生物·人教版·必修第一册", subject: "生物", grade: "高一", version: "人教版·必修第一册", state: "启用" }, { id: "TB-SW-02", name: "高中生物·校本拓展2026版", subject: "生物", grade: "高一", version: "校本拓展2026版", state: "启用" }, { id: "TB-KX-01", name: "高中科学·校本探究册", subject: "科学", grade: "高一", version: "校本探究册", state: "启用" }];
    textbookRows.forEach(textbook => db.textbooks.push(textbook));
    const textbookFor = row => row.subject === "物理" ? "TB-WL-01" : row.subject === "化学" ? "TB-HX-01" : row.subject === "科学" ? "TB-KX-01" : row.id === "E5" ? "TB-SW-01" : "TB-SW-01";
    experimentRows.forEach(row => db.experimentCatalog.push({ ...row, textbookId: textbookFor(row), sourceType: "官方目录", experimentCategory: row.experimentCategory || row.required, category: row.experimentCategory || row.required, supportedModes: row.mode === "演示" ? ["演示"] : ["分组", "演示"], equipmentRequirements: [] }));
    ["高二", "高三"].forEach((grade, gradeIndex) => {
      [["物理", "WL"], ["化学", "HX"], ["生物", "SW"], ["科学", "KX"]].forEach(([subject, prefix], subjectIndex) => {
        const base = experimentRows.find(row => row.subject === subject), version = `人教版·${grade}实验册`, textbook = { id: `TB-${prefix}-${gradeIndex + 2}`, name: `高中${subject}·${version}`, subject, grade, version, state: "启用" }, catalogId = `E${8 + gradeIndex * 4 + subjectIndex}`;
        db.textbooks.push(textbook);
        db.experimentCatalog.push({ ...base, id: catalogId, code: `${prefix}-${gradeIndex + 2}01`, name: `${base.name}（${grade}）`, grade, version, chapter: `${grade} · ${base.chapter}`, textbookId: textbook.id, sourceType: "官方目录", experimentCategory: base.experimentCategory || base.required, category: base.experimentCategory || base.required, supportedModes: base.mode === "演示" ? ["演示"] : ["分组", "演示"], equipmentRequirements: [] });
      });
    });
    db.customExperiments.push({ id: "CE-S1-001", school: "S1", name: "校园材料纸桥承重挑战", code: "S1-CX-001", subject: "物理", grade: "高一", textbookId: "TB-WL-01", version: "人教版·必修第一册", sourceType: "学校自定义", experimentCategory: "创新实验", category: "创新实验", mode: "分组", supportedModes: ["分组", "演示"], chapter: "结构与力的探究", section: "跨学科实践", page: "", equipment: "A4纸、木夹、砝码", equipmentRequirements: [{ name: "A4纸", spec: "70g", unit: "张", quantity: 10, note: "可替换为废旧打印纸" }, { name: "木夹", spec: "中号", unit: "个", quantity: 4, note: "" }, { name: "砝码", spec: "50g", unit: "个", quantity: 10, note: "" }], safety: "保持桌面整洁，砝码轻拿轻放。", note: "用于创新实验示范。", state: "启用", createdBy: "S1-T0", createdAt: db.updatedAt, updatedAt: db.updatedAt });
    const itemRows = [["IT1", "202040001", "光学显微镜", "XSP-16A", "生物仪器", "台", "SERIALIZED", true], ["IT2", "202030001", "精密电子天平", "FA2204N", "化学仪器", "台", "SERIALIZED", true], ["IT3", "202020001", "学生电源", "J1202", "物理仪器", "台", "SERIALIZED", true], ["IT4", "202020002", "力学轨道小车", "J2101", "物理仪器", "台", "SERIALIZED", true], ["IT5", "202040002", "解剖显微镜", "XTZ-E", "生物仪器", "台", "SERIALIZED", true], ["IT6", "202030002", "蒸馏装置", "SZ-08", "化学仪器", "套", "SERIALIZED", true], ["IT7", "301010001", "载玻片", "7101型", "耗材", "盒", "QUANTITY", false], ["IT8", "301010002", "定性滤纸", "中速9cm", "耗材", "盒", "QUANTITY", false], ["IT9", "401010001", "无水乙醇", "分析纯500mL", "危化品", "瓶", "QUANTITY", false], ["IT10", "401010002", "浓硫酸", "500mL", "危化品", "瓶", "QUANTITY", false], ["IT11", "202010001", "手持放大镜", "5倍", "科学仪器", "个", "SERIALIZED", false], ["IT12", "301020001", "防护护目镜", "通用款", "耗材", "副", "QUANTITY", false], ["IT13", "301020002", "实验用纸巾", "100抽/包", "耗材", "包", "QUANTITY", false], ["IT14", "301020003", "一次性丁腈手套", "100只/盒", "耗材", "盒", "QUANTITY", false], ["IT15", "301020004", "广泛pH试纸", "1-14范围", "耗材", "盒", "QUANTITY", false], ["IT16", "301020005", "棉签", "医用100支/包", "耗材", "包", "QUANTITY", false]].map(([id, classificationCode, name, spec, category, unit, trackingMode, maintenanceRequired]) => ({ id, classificationCode, name, spec, category, unit, trackingMode, maintenanceRequired }));
    const seedItem = id => itemRows.find(item => item.id === id) || {};
    const names = [["顾文清", "张明华", "王秀英", "李秀英", "陈小红", "赵晓雯", "高远", "宋怡", "周凯", "何婉", "郭晨", "叶楠", "马骁", "唐菲", "沈越"], ["吴静", "周明", "沈澜", "陆青", "许晓", "蒋晨", "韩露", "方宁", "唐毅", "夏琳", "蒋晨曦", "林致远", "秦悦", "邵杰", "白露"], ["赵宁", "李建国", "林芳", "周敏", "陈洁", "唐悦", "黄诚", "杜鹃", "郑航", "谢雨", "冯超", "许安", "彭媛", "吕航", "孟雪"]];
    const assetRows = [["IT1", 3580, 3], ["IT2", 2860, 2], ["IT3", 450, 1], ["IT4", 680, 1], ["IT5", 4200, 3], ["IT6", 680, 2], ["IT11", 45, 4], ["IT4", 680, 1], ["IT3", 450, 1], ["IT6", 680, 2], ["IT4", 680, 2], ["IT11", 45, 4], ["IT5", 4200, 3], ["IT1", 3580, 3], ["IT2", 2860, 2], ["IT3", 450, 1], ["IT4", 680, 1], ["IT5", 4200, 3], ["IT6", 680, 2], ["IT11", 45, 4], ["IT1", 3580, 3], ["IT2", 2860, 2], ["IT3", 450, 1], ["IT4", 680, 1], ["IT5", 4200, 3], ["IT6", 680, 2], ["IT11", 45, 4], ["IT1", 3580, 3], ["IT2", 2860, 2], ["IT3", 450, 1]];
    const classesPerGrade = { "高一": 4, "高二": 4, "高三": 4 };
    const planSubjects = ["物理", "化学", "生物", "科学"];
    const classGrades = ["高一", "高二", "高三"];
    const planItemsByGradeSubject = (grade, subject) => { const catalog = db.experimentCatalog.filter(row => row.grade === grade && normalizeSubject(row.subject) === normalizeSubject(subject)).sort((left, right) => left.id.localeCompare(right.id)), textbookId = catalog.find(item => item.experimentCategory === "必做")?.textbookId || catalog[0]?.textbookId || "", sameTextbook = catalog.filter(item => !textbookId || item.textbookId === textbookId), required = sameTextbook.filter(item => item.experimentCategory === "必做"), optional = sameTextbook.filter(item => item.experimentCategory === "选做"); return [...required, ...(optional.length ? [optional[0]] : [])]; };
    db.schools.forEach((school, index) => {
      ["教务处", "理科教研组", "实验中心"].forEach((name, n) => db.departments.push({ id: `${school.id}-D${n + 1}`, school: school.id, name, state: "启用" }));
      db.terms.forEach(term => defaultPeriods.forEach(([number, start, end]) => db.periods.push({ id: term.id === "TERM26" ? `${school.id}-K${number}` : `${school.id}-${term.id}-K${number}`, school: school.id, term: term.id, number, name: `第${number}节`, start, end, state: "启用" })));
      ["admin", "teacher", "teacher", "teacher", "teacher", "teacher", "teacher", "teacher", "teacher", "teacher", "teacher", "teacher", "teacher", "teacher", "admin"].forEach((role, n) => db.staff.push({ id: `${school.id}-T${n}`, school: school.id, name: names[index][n], role, subject: ["综合", "物理", "化学", "生物", "科学", "物理", "化学", "生物", "科学", "物理", "化学", "生物", "科学", "物理", "综合"][n], departmentId: `${school.id}-D${n === 0 ? 1 : n === 14 ? 3 : 2}`, title: n === 0 || n === 14 ? "实验管理员" : "一级教师", phone: `138****${1100 + index * 20 + n}`, enabled: n === 0 || index === 0 && n === 1, qualification: n === 0 || n === 14 ? "实验室管理资质" : "教师资格证", sex: n % 2 ? "男" : "女", ...((n === 14 || n === 4) ? { legacyRole: "technician" } : {}) }));
      [["L1", "物理实验室 1", "A201", "教学实验室", "物理", 96, 48], ["L2", "化学实验室 1", "B201", "教学实验室", "化学", 96, 48], ["L3", "生物学实验室 1", "C201", "教学实验室", "生物", 96, 48], ["L4", "科学探究实验室 1", "D201", "教学实验室", "科学", 96, 48], ["R4", "物理仪器室", "A202", "仪器室", "物理", 48, null]].forEach(([suffix, name, roomNo, type, subject, area, seats]) => { db.rooms.push({ id: `${school.id}-${suffix}`, school: school.id, name, roomNo, type, subject, area, seats, builtAt: "2023-08-20", builder: "", stage: school.stage, features: subject === "化学" ? "通风设施、洗眼器、灭火器" : "电源保护、灭火器", hazardStorage: subject === "化学", note: "", state: "可用" }); });
      [["L1", "G01", "光学仪器柜", "仪器柜", false], ["L2", "H01", "化学品专用柜", "危化品专用柜", true], ["L3", "S01", "生物观察柜", "仪器柜", false], ["R4", "P01", "物理器材柜", "耗材柜", false]].forEach(([roomSuffix, code, name, type, hazardStorage]) => db.cabinets.push({ id: `${school.id}-CAB-${code}`, school: school.id, roomId: `${school.id}-${roomSuffix}`, code, name, type, state: "启用", custodianId: `${school.id}-T0`, hazardStorage, note: "演示柜位" }));
      let classIndex = 1;
      classGrades.forEach((grade) => { const total = classesPerGrade[grade] || 2; for (let i = 1; i <= total; i++) { const students = 36 + i + (index % 3) * 2 + classIndex; db.classes.push({ id: `${school.id}-C${classIndex++}`, school: school.id, name: `${grade}${i}班`, grade, students, state: "在读" }); } });
      const teacherPools = { "物理": [1, 5, 9, 13], "化学": [2, 6, 10], "生物": [3, 7, 11], "科学": [4, 8, 12] };
      db.classes.filter(c => c.school === school.id).forEach((klass, classIndex) => [["物理", 1], ["化学", 2], ["生物", 3], ["科学", 5]].forEach(([subject], subjectIndex) => { const pool = teacherPools[subject]; db.assignments.push({ id: `${school.id}-AS${classIndex * 4 + subjectIndex + 1}`, school: school.id, term: "TERM26", classId: klass.id, subject, teacherId: `${school.id}-T${pool[classIndex % pool.length]}`, primary: true, state: "有效" }); }));
      assetRows.forEach(([itemId, price, roomNo], n) => { const item = seedItem(itemId), roomId = `${school.id}-L${roomNo}`, asset = { ...item, id: `${school.id}-A${n + 1}`, school: school.id, itemId, assetSerial: n + 1, price, purchaseDate: n === 5 ? "2015-06-15" : "2024-03-15", roomId, cabinetId: db.cabinets.find(cabinet => cabinet.roomId === roomId)?.id || "", supplier: "华东教学仪器有限公司", state: "正常使用", sourceId: `${school.id}-RK0`, nextMaintenance: item.maintenanceRequired ? "2026-09-15" : "" }; asset.code = assetCode(db, asset, asset.assetSerial); db.assets.push(asset); });
      db.receipts.push({ id: `${school.id}-RK0`, school: school.id, date: "2024-03-15", purchaseDate: "2024-03-15", supplier: "华东教学仪器有限公司", operator: names[index][0], items: assetRows.map(([itemId, price, roomNo]) => { const item = seedItem(itemId), roomId = `${school.id}-L${roomNo}`; return { ...item, itemId, model: item.spec, qty: 1, price, roomId, cabinetId: db.cabinets.find(cabinet => cabinet.roomId === roomId)?.id || "", nextMaintenance: item.maintenanceRequired ? "2026-09-15" : "" }; }), state: "已入库", note: "历史资产入账。" });
      [["IT7", 40, 20, 3, 18.5], ["IT8", 8, 15, 2, 12], ["IT9", 12, 5, 2, 32], ["IT10", 2, 4, 2, 18], ["IT12", 22, 8, 1, 5], ["IT13", 30, 12, 3, 8], ["IT14", 20, 10, 4, 25], ["IT15", 16, 8, 2, 15], ["IT16", 40, 15, 1, 6]].forEach(([itemId, stock, min, roomNo, unitPrice], n) => { const roomId = `${school.id}-L${roomNo}`; db.inventory.push({ ...seedItem(itemId), id: `${school.id}-I${n + 1}`, school: school.id, itemId, stock, min, unitPrice, purchaseDate: "2024-03-15", expiry: itemId === "IT9" ? "2026-09-18" : "2027-06-30", custodian: names[index][4], roomId, cabinetId: db.cabinets.find(cabinet => cabinet.roomId === roomId)?.id || "", state: "在库" }); });
      ["高一"].forEach((grade, gradeIndex) => { const gradePlans = planSubjects.map(subject => ({ grade, subject, items: planItemsByGradeSubject(grade, subject) })).filter(plan => plan.items.length); gradePlans.forEach(({ grade, subject, items }, subjectIndex) => { const planId = `${school.id}-P${subjectIndex + 1}`; const plannedWeekStart = gradeIndex + 1; const first = items[0]; db.plans.push({ id: planId, school: school.id, term: "TERM26", subject, grade, version: first.version || "", textbookId: first.textbookId || "", targetMode: "EXPLICIT", name: `2026-2027学年第一学期 · ${grade}${subjectLabel(subject)}实验计划`, state: "已发布", createdBy: `${school.id}-T0`, createdAt: db.updatedAt, publishedAt: db.updatedAt }); const targetClasses = db.classes.filter(klass => klass.school === school.id && klass.grade === grade); targetClasses.forEach(klass => { db.planTargets.push({ id: `${planId}-${klass.id}`, school: school.id, planId, classId: klass.id, grade: klass.grade, state: "启用" }); }); items.forEach((item, itemIndex) => { db.planItems.push({ id: `${planId}-I${itemIndex + 1}`, school: school.id, planId, sourceId: item.id, sourceType: "官方目录", textbookId: item.textbookId || first.textbookId || "", experimentName: item.name, chapter: item.chapter, equipment: item.equipment, equipmentRequirements: item.equipmentRequirements || [], periods: item.periods, required: item.required, experimentCategory: item.experimentCategory || item.required, category: item.experimentCategory || item.required, mode: item.mode || "分组", scheduleType: item.mode === "演示" ? "DATE" : "WEEK", plannedWeek: item.mode === "演示" ? "" : Math.min(plannedWeekStart + itemIndex + subjectIndex, 12), plannedDate: item.mode === "演示" ? "2026-09-05" : "" }); });
      });
      });
      syncTeachingTasks(db);
      const bookingItem = seedItem("IT4"), baseTask = db.teachingTasks.find(task => task.school === school.id && task.classId === `${school.id}-C1` && task.state !== "已失效");
      if (baseTask) {
        const booking = { id: `${school.id}-YY1`, school: school.id, taskId: baseTask.id, planItemId: baseTask.planItemId, assignmentId: baseTask.assignmentId, classId: baseTask.classId, teacherId: baseTask.teacherId, studentCount: find(db, "classes", baseTask.classId).students, applicant: names[index][1], applicantId: `${school.id}-T1`, submittedAt: db.updatedAt, requestedDate: index === 0 ? TODAY : "2026-09-08", requestedPeriod: index === 0 ? 1 : 2, groups: 8, requestedResources: [{ itemId: bookingItem.id, classificationCode: bookingItem.classificationCode, name: bookingItem.name, spec: bookingItem.spec, category: bookingItem.category, unit: bookingItem.unit, qty: 1 }], note: "", state: index % 2 ? "待安排" : "已安排" };
        db.bookings.push(booking);
        if (index === 0) { db.arrangements.push({ id: `${school.id}-AP1`, school: school.id, bookingId: booking.id, venueType: "实验室", roomId: `${school.id}-L1`, venueText: "", scheduledDate: TODAY, startPeriod: 1, endPeriod: 1, technicianId: `${school.id}-T0`, note: "", resources: [{ ref: `${school.id}-A4`, qty: 1 }], state: "已安排", arrangedBy: `${school.id}-T0`, arrangedAt: db.updatedAt }); baseTask.state = "已安排"; booking.state = "已安排"; }
      }
      const bookedTaskIds = new Set([baseTask && baseTask.id].filter(Boolean)), demoDates = ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"];
      db.teachingTasks.filter(task => task.school === school.id && task.state !== "已失效" && !bookedTaskIds.has(task.id)).slice(0, 12).forEach((task, extraIndex) => {
        const context = taskContext(db, task), subject = context.experiment.subject, resourceMap = { "物理": ["IT4", "A4", "L1"], "化学": ["IT2", "A2", "L2"], "生物": ["IT1", "A1", "L3"], "科学": ["IT11", "A7", "L4"] }, [resourceId, assetId, roomId] = resourceMap[subject] || resourceMap["物理"], resource = seedItem(resourceId), classRow = find(db, "classes", task.classId), state = extraIndex === 1 || extraIndex === 4 ? "已完成" : extraIndex % 2 ? "已安排" : "待安排", bookingId = `${school.id}-YY${extraIndex + 2}`, bookingDate = demoDates[extraIndex % demoDates.length];
        const booking = { id: bookingId, school: school.id, taskId: task.id, planItemId: task.planItemId, assignmentId: task.assignmentId, classId: task.classId, teacherId: task.teacherId, studentCount: classRow.students, applicant: find(db, "staff", task.teacherId).name, applicantId: task.teacherId, submittedAt: db.updatedAt, requestedDate: bookingDate, requestedPeriod: extraIndex % 4 + 1, groups: Math.ceil(classRow.students / 6), requestedResources: [{ itemId: resource.id, classificationCode: resource.classificationCode, name: resource.name, spec: resource.spec, category: resource.category, unit: resource.unit, qty: extraIndex % 3 + 1 }], note: "已根据班级人数和实验分组需求提交预约。", state };
        db.bookings.push(booking);
        if (state !== "待安排") { const arrangementId = `${school.id}-AP${extraIndex + 2}`; db.arrangements.push({ id: arrangementId, school: school.id, bookingId, venueType: "实验室", roomId: `${school.id}-${roomId}`, venueText: "", scheduledDate: bookingDate, startPeriod: booking.requestedPeriod, endPeriod: booking.requestedPeriod, technicianId: `${school.id}-T0`, note: state === "已完成" ? "实验完成，器材已清点归还。" : "已完成实验室和器材预留。", resources: [{ ref: `${school.id}-${assetId}`, qty: 1 }], state, arrangedBy: `${school.id}-T0`, arrangedAt: db.updatedAt }); task.state = state; if (state === "已完成") db.summaries.push({ id: `${school.id}-SUM${extraIndex + 1}`, school: school.id, arrangementId, actualDate: bookingDate, effect: "学生完成分组实验并提交数据记录。", improvement: "增加变量控制和误差分析讨论。", equipmentCondition: "良好", note: "本次实验过程顺利。", submittedBy: task.teacherId, submittedAt: db.updatedAt, legacy: false }); }
      });
      db.tasks.push({ id: `${school.id}-JC1`, school: school.id, roomId: `${school.id}-L2`, kind: "开学专项检查", due: "2026-09-02", state: "待检查", owner: names[index][4] });
      const followupTaskId = `${school.id}-JC2`, followupCheckId = `${school.id}-CHK2`;
      db.tasks.push({ id: followupTaskId, school: school.id, roomId: `${school.id}-L3`, kind: "实验室安全复核", due: "2026-09-05", state: index % 2 ? "已完成" : "待检查", owner: names[index][4], checkId: followupCheckId });
      db.checks.push({ id: followupCheckId, school: school.id, roomId: `${school.id}-L3`, date: "2026-09-01", kind: "安全复核", inspector: names[index][4], result: index % 2 ? "通过" : "待复核", note: index % 2 ? "通风、用电及危险品柜状态正常。" : "已完成首轮检查，待管理员确认整改项。", taskId: followupTaskId });
      db.repairs.push({ id: `${school.id}-WX2`, school: school.id, assetId: `${school.id}-A2`, kind: "维修", qty: 1, cost: 120 + index * 35, maintenanceDate: `2026-08-${24 + index}`, vendor: "华东校园设备服务有限公司", content: index % 2 ? "玻璃仪器收纳盒破损，申请更换。" : "加热组件接触不良，申请检修。", registrar: names[index][4], registeredAt: db.updatedAt, snapshot: referenceSnapshot(db, find(db, "assets", `${school.id}-A2`), 2860) });
      db.purchases.push({ id: `${school.id}-CG2`, school: school.id, purpose: "补充新学期分组实验耗材", applicant: names[index][4], date: `2026-08-${20 + index}`, state: ["已通过", "待审核", "已通过", "已驳回"][index], items: [{ ...seedItem("IT7"), itemId: "IT7", qty: 4 + index, price: 18 }] });
      db.submissions.push({ id: `${school.id}-SB1`, school: school.id, term: "TERM26", date: TODAY, at: db.updatedAt, operator: names[index][0], revision: db.revision, summary: metrics(db, school.id, "TERM26"), state: "已上报" });
    });
    db.schools.forEach((school, index) => {
      const checkId = `${school.id}-CHK2`, stock = db.inventory.find(row => row.school === school.id && row.itemId === "IT7"), scrapAsset = db.assets.find(row => row.id === `${school.id}-A3`);
      db.hazards.push({ id: `${school.id}-YH2`, school: school.id, checkId, roomId: `${school.id}-L3`, title: index % 2 ? "显微镜使用后未及时归位" : "实验台面清洁记录不完整", level: index === 0 ? "需优先处理" : "一般关注", date: "2026-09-01", due: `2026-09-${5 + index}`, owner: `${school.id}-T4`, state: index === 1 ? "整改中" : index === 3 ? "已关闭" : "待整改", note: index % 2 ? "已提醒任课教师课后完成设备归位。" : "请按实验室值日表补全清洁记录。", rectification: index === 3 ? "已补录清洁记录并由管理员复查。" : "" });
      if (stock) {
        stock.stock = Math.max(0, stock.stock - 1);
        db.flows.push({ id: `${school.id}-SH2`, school: school.id, itemId: stock.id, kind: "损耗", qty: 1, date: `2026-08-${27 + index}`, reason: "分组实验中耗材损坏", operator: `${school.id}-T4`, snapshot: referenceSnapshot(db, stock, stock.unitPrice) });
      }
      if (scrapAsset) { scrapAsset.state = "已报废"; db.repairs.push({ id: `${school.id}-BF1`, school: school.id, assetId: scrapAsset.id, kind: "报废", qty: 1, cost: 0, scrapDate: `2026-08-${18 + index}`, vendor: "", content: "设备老化且维修成本较高，申请报废处置。", registrar: `${school.id}-T4`, registeredAt: db.updatedAt, snapshot: referenceSnapshot(db, scrapAsset, scrapAsset.price) }); }
      db.archives.push({ id: `${school.id}-FILE3`, school: school.id, name: `实验室巡查照片说明-${school.name}.txt`, category: "安全管理", relatedTable: "hazards", relatedId: `${school.id}-YH2`, date: "2026-09-01", uploader: `${school.id}-T4`, state: "已归档", mime: "text/plain;charset=utf-8", content: `隐患记录：${school.name}\n检查房间：生物学实验室 1\n处理期限：2026-09-${5 + index}\n当前状态：${index === 1 ? "整改中" : index === 3 ? "已关闭" : "待整改"}` });
    });
    const seedRepairAsset = db.assets.find(a => a.id === "S1-A3");
    db.repairs.push({ id: "WX-20260824-001", school: "S1", assetId: seedRepairAsset.id, kind: "维修", qty: 1, cost: 80, maintenanceDate: "2026-08-24", vendor: "华东校园设备服务有限公司", content: "输出电压不稳定，检查并更换保险管。", registrar: "张明华", registeredAt: "2026-08-24", snapshot: referenceSnapshot(db, seedRepairAsset, seedRepairAsset.price) });
    db.purchases.push({ id: "CG-20260831-001", school: "S1", purpose: "补充高一生物分组实验器材", applicant: "顾文清", date: TODAY, state: "待审核", items: [{ ...seedItem("IT1"), itemId: "IT1", model: "XSP-16A", qty: 2, price: 3580 }] });
    db.checks.push({ id: "JC-20260831-001", school: "S1", roomId: "S1-L2", date: TODAY, kind: "日常巡查", inspector: "陈小红", items: "消防设施、用电安全、化学品储存、应急设施", result: "发现隐患", note: "化学准备室房间门锁损坏。" });
    db.hazards.push({ id: "YH-20260831-001", school: "S1", checkId: "JC-20260831-001", roomId: "S1-L2", title: "化学准备室房间门锁损坏", level: "需优先处理", date: TODAY, due: "2026-09-02", owner: "顾文清", state: "待整改", note: "暂停售用该房间，转移物品后处理门锁。" });
    const chemistryTask = db.teachingTasks.find(task => {
      const item = db.planItems.find(row => row.id === task.planItemId);
      const plan = item ? db.plans.find(row => row.id === item.planId) : null;
      return task.school === "S1" && task.state !== "已失效" && plan?.subject === "化学";
    }) || db.teachingTasks.find(task => task.school === "S1" && task.state !== "已失效");
    if (chemistryTask) db.flows.push({ id: "LY-20260831-001", school: "S1", itemId: "S1-I3", kind: "领用", qty: 1, date: TODAY, applicant: "陈小红", applicantId: "S1-T4", state: "待复核", taskId: chemistryTask.id, arrangementId: "", reason: "下周化学实验", reviewer: "" });
    const seedLossStock = db.inventory.find(stock => stock.id === "S1-I1");
    seedLossStock.stock -= 2;
    db.flows.push({ id: "SH-20260830-001", school: "S1", itemId: seedLossStock.id, kind: "损耗", qty: 2, date: "2026-08-30", reason: "实验操作中破损", operator: "陈小红", snapshot: referenceSnapshot(db, seedLossStock, seedLossStock.unitPrice) });
    db.archives.push({ id: "FILE-001", school: "S1", name: "开学实验室安全检查说明.txt", category: "安全管理", relatedTable: "checks", relatedId: "JC-20260831-001", date: TODAY, uploader: "陈小红", state: "已归档", mime: "text/plain;charset=utf-8", content: "安全检查附件\n检查日期：2026-08-31\n检查位置：化学实验室1\n发现问题：房间门锁损坏。" });
    db.archives.push({ id: "FILE-002", school: "S1", name: "物理实验器材清单.csv", category: "实验教学", relatedTable: "bookings", relatedId: "S1-YY1", date: TODAY, uploader: "陈小红", state: "待归档", mime: "text/csv;charset=utf-8", content: "器材,数量,单位\n力学轨道小车,1,台\n刻度尺,8,把\n" });
    const resourceSeed = [
      ["教学设计", "物理", ["高一"], "必做", "测量物体的速度教学设计", "物理实验教学设计\n目标：理解速度测量方法，完成数据记录与误差分析。", "测量物体的速度教学设计.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      ["教案", "化学", ["高一"], "必做", "溶液配制实验教案", "配制一定物质的量浓度的溶液实验教案\n课时：1课时。", "溶液配制实验教案.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      ["学案", "生物", ["高一"], "选做", "校园植物细胞观察学案", "观察校园植物细胞，记录显微镜下的结构特征。", "植物细胞观察学案.pdf", "application/pdf"],
      ["课件", "物理", ["高一"], "创新实验", "加速度与力、质量关系课件", "探究加速度与力、质量的关系，含课堂演示与讨论页。", "加速度探究课件.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
      ["实验视频", "物理", ["高一"], "必做", "测量物体的速度实验视频", "演示实验视频资源，上传后可在线预览。", "测量物体的速度实验视频.mp4", "video/mp4"],
      ["学习单", "化学", ["高一"], "创新实验", "溶液配制实验学习单", "学生实验前预习、实验中记录、课后反思使用。", "溶液配制实验学习单.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      ["学习单", "科学", ["高一"], "必做", "科学探究观察记录单", "用于记录观察对象、测量数据和结论，支持科学探究过程留痕。", "科学探究观察记录单.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
    ];
    resourceSeed.forEach(([resourceType, subject, grades, experimentCategory, title, content, originalName, mime], index) => { const uploader = db.staff.find(person => person.school === "S1" && person.role === "teacher" && person.subject === subject) || db.staff.find(person => person.id === "S1-T0"); db.resources.push({ id: `RES-${String(index + 1).padStart(3, "0")}`, school: "S1", title, resourceType, subject, grades, experimentCategory, description: content.split("\n")[0], originalName, mime, extension: originalName.split(".").pop(), size: mime === "video/mp4" ? 0 : content.length, content: mime === "video/mp4" ? "" : content, dataUrl: "", fileKey: "", uploaderId: uploader?.id || "S1-T0", uploaderName: uploader?.name || "顾文清", createdAt: db.updatedAt, updatedAt: db.updatedAt, demo: true }); });
    normalizeExperimentModel(db);
    normalizeSubjectFields(db);
    normalizeCabinets(db);
    normalizeSafetyModel(db);
    seedHazardSafetyExamples(db);
    normalizeSafetyModel(db);
    Object.entries(tableNames).filter(([table]) => table !== "logs").forEach(([table, label]) => db[table].forEach(row => db.logs.push({ id: `INIT-${table}-${row.id}`, school: row.school || table === "schools" && row.id || "", table, recordId: row.id, action: "初始化数据", actor: "系统管理员", at: db.updatedAt, note: `${label}数据导入` })));
    return db;
  }
  function teaching(db, school = "", term = "TERM26", by = "school", filters = {}) {
    const buckets = new Map();
    scoped(db, "teachingTasks", school).filter(task => task.term === term && task.state !== "已失效").forEach(task => {
      const { item, experiment, klass, teacher } = taskContext(db, task);
      if (filters.subject && !subjectEquals(experiment.subject, filters.subject) || filters.grade && klass.grade !== filters.grade || filters.teacherId && teacher.id !== filters.teacherId || filters.classId && klass.id !== filters.classId || filters.experimentCategory && experiment.experimentCategory !== filters.experimentCategory) return;
      const label = by === "subject" ? subjectLabel(experiment.subject) : by === "grade" ? klass.grade : by === "class" ? `${find(db, "schools", task.school).name} · ${klass.name}` : find(db, "schools", task.school).name;
      const b = buckets.get(label) || { id: label, name: label, school: by === "school" ? task.school : "", required: 0, done: 0, optional: 0, optionalDone: 0, innovation: 0, innovationDone: 0, demonstration: 0, demonstrationDone: 0, group: 0, groupDone: 0, tasks: [], teacherSet: new Set(), gradeSet: new Set() }, done = task.state === "已完成";
      b.tasks.push(task.id); b.teacherSet.add(teacher.name); b.gradeSet.add(klass.grade);
      if (experiment.experimentCategory === "必做") { b.required++; if (done) b.done++; } else if (experiment.experimentCategory === "创新实验") { b.innovation++; if (done) b.innovationDone++; } else { b.optional++; if (done) b.optionalDone++; }
      const mode = item.mode === "演示" ? "demonstration" : "group"; b[mode]++; if (done) b[`${mode}Done`]++; buckets.set(label, b);
    });
    return [...buckets.values()].map(b => ({ ...b, teacherNames: [...b.teacherSet].join("、"), gradeNames: [...b.gradeSet].join("、"), teacherSet: undefined, gradeSet: undefined, pending: b.required - b.done, rate: ratio(b.done, b.required), optionalPending: b.optional - b.optionalDone, optionalRate: ratio(b.optionalDone, b.optional), innovationPending: b.innovation - b.innovationDone, innovationRate: ratio(b.innovationDone, b.innovation), demonstrationRate: ratio(b.demonstrationDone, b.demonstration), groupRate: ratio(b.groupDone, b.group), total: b.required + b.optional + b.innovation, totalDone: b.done + b.optionalDone + b.innovationDone, totalRate: ratio(b.done + b.optionalDone + b.innovationDone, b.required + b.optional + b.innovation) }));
  }
  function metrics(db, school = "", term = "TERM26", subject = "") {
    const assets = scoped(db, "assets", school).filter(asset => !asset.pendingReceiptId && itemFitsSubject(itemOf(db, asset), subject)), stock = scoped(db, "inventory", school).filter(row => !row.pendingReceiptId || !row.pendingReceiptCreated), tasks = scoped(db, "teachingTasks", school).filter(task => task.term === term && task.state !== "已失效" && (!subject || subjectEquals(taskContext(db, task).experiment.subject, subject))), expected = tasks.filter(task => taskContext(db, task).experiment.experimentCategory === "必做"), optional = tasks.filter(task => taskContext(db, task).experiment.experimentCategory === "选做"), innovation = tasks.filter(task => taskContext(db, task).experiment.experimentCategory === "创新实验"), hazards = scoped(db, "hazards", school).filter(row => row.safetyScope === "hazardous"), done = expected.filter(task => task.state === "已完成").length, optionalDone = optional.filter(task => task.state === "已完成").length, innovationDone = innovation.filter(task => task.state === "已完成").length;
    return { assets: assets.length, normal: assets.filter(a => a.state === "正常使用").length, repair: assets.filter(a => a.state === "维修中").length, value: assets.filter(a => a.state !== "已报废").reduce((sum, a) => sum + a.price, 0), labs: scoped(db, "rooms", school).filter(r => r.type === "教学实验室" && (!subject || !r.subject || subjectEquals(r.subject, subject))).length, required: expected.length, done, pending: expected.length - done, rate: ratio(done, expected.length), optional: optional.length, optionalDone, optionalPending: optional.length - optionalDone, optionalRate: ratio(optionalDone, optional.length), innovation: innovation.length, innovationDone, innovationPending: innovation.length - innovationDone, innovationRate: ratio(innovationDone, innovation.length), totalTasks: tasks.length, totalDone: done + optionalDone + innovationDone, totalRate: ratio(done + optionalDone + innovationDone, tasks.length), low: stock.filter(r => r.stock < r.min && itemFitsSubject(itemOf(db, r), subject)).length, chemicals: stock.filter(r => isHazard(itemOf(db, r)) && (!subject || subjectEquals("化学", subject))).length, hazards: hazards.length, closed: hazards.filter(r => r.state === "已关闭").length, closure: ratio(hazards.filter(r => r.state === "已关闭").length, hazards.length), staff: scoped(db, "staff", school).filter(r => r.enabled).length, administrators: scoped(db, "staff", school).filter(r => r.enabled && r.role === "admin").length };
  }
  // Read-only overview projection. Counts and drill-down rows always share the same scope.
  function overview(db, options = {}) {
    const actor = options.actor || { role: "district" }, personal = actor.role === "teacher", district = actor.role === "district";
    const schoolId = district ? options.school || "" : actor.school, termId = options.term || "TERM26", subject = options.subject === "ALL" ? "" : normalizeSubject(options.subject || "");
    const today = options.today || TODAY, term = db.terms.find(row => row.id === termId);
    const dayAfter = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const clamp = day => term ? [term.start, day, term.end].sort()[1] : day;
    const anchor = clamp(options.week || today), monday = dayAfter(anchor, -(new Date(`${anchor}T12:00:00Z`).getUTCDay() + 6) % 7), sunday = dayAfter(monday, 6);
    const weekStart = term && term.start > monday ? term.start : monday, weekEnd = term && term.end < sunday ? term.end : sunday;
    const inSchool = row => !schoolId || row.school === schoolId;
    const schools = db.schools.filter(row => !schoolId || row.id === schoolId);
    const lookup = (table, id) => db[table]?.find(row => row.id === id);
    const label = (table, id) => lookup(table, id)?.name || id || "未登记";
    const row = (table, record, title, description = "", due = "", priority = 3) => ({ table, id: record.id, school: record.school, title, description, due, priority, state: record.state || "待核对" });
    const tasks = db.teachingTasks.filter(task => inSchool(task) && task.term === termId && task.state !== "已失效" && (!personal || task.teacherId === actor.id)).filter(task => subjectEquals(taskContext(db, task).experiment.subject, subject));
    const taskIds = new Set(tasks.map(task => task.id));
    const plannedDeadline = task => { const { item } = taskContext(db, task); return item.scheduleType === "DATE" ? item.plannedDate : term && item.plannedWeek ? [term.end, dayAfter(weekDate(term, item.plannedWeek), 6 - (new Date(`${weekDate(term, item.plannedWeek)}T12:00:00Z`).getUTCDay() + 6) % 7)].sort()[0] : ""; };
    const taskRow = task => { const c = taskContext(db, task); return { ...row("teachingTasks", task, c.experiment.name, `${c.klass.name} · ${c.teacher.name}`, plannedDeadline(task)), subject: c.experiment.subject, grade: c.klass.grade, category: c.experiment.experimentCategory }; };
    const taskRows = tasks.map(taskRow), required = taskRows.filter(r => r.category === "必做"), completed = required.filter(r => r.state === "已完成"), late = taskRows.filter(r => r.state !== "已完成" && r.due && r.due < today);
    const bookings = db.bookings.filter(r => inSchool(r) && taskIds.has(r.taskId));
    const bookingIds = new Set(bookings.map(r => r.id));
    const arrangements = db.arrangements.filter(r => inSchool(r) && bookingIds.has(r.bookingId) && r.state !== "已取消");
    const arrangementRow = r => { const booking = lookup("bookings", r.bookingId), c = taskContext(db, booking.taskId); return { ...row("arrangements", r, c.experiment.name, `${c.klass.name} · ${c.teacher.name}`, r.scheduledDate), className: c.klass.name, teacher: c.teacher.name, manager: label("staff", r.technicianId), period: `第${r.startPeriod}${r.endPeriod !== r.startPeriod ? `-${r.endPeriod}` : ""}节`, startPeriod: r.startPeriod, place: r.venueType === "其他" ? r.venueText : label("rooms", r.roomId), hasSummary: db.summaries.some(s => s.arrangementId === r.id) }; };
    const allArrangements = arrangements.map(arrangementRow), weekRows = allArrangements.filter(r => r.due >= weekStart && r.due <= weekEnd).sort((a, b) => a.due.localeCompare(b.due) || a.startPeriod - b.startPeriod);
    const pendingSummary = allArrangements.filter(r => r.state === "已安排" && !r.hasSummary && r.due <= today);
    const pendingBookings = bookings.filter(r => ["待安排", "已退回"].includes(r.state)).map(r => { const c = taskContext(db, r.taskId); return row("bookings", r, r.state === "已退回" ? "预约退回待修改" : "实验待安排", `${c.klass.name} · ${c.experiment.name}`, r.requestedDate); });
    const assets = personal ? [] : db.assets.filter(r => inSchool(r) && !r.pendingReceiptId && itemFitsSubject(r, subject));
    const stocks = personal ? [] : db.inventory.filter(r => inSchool(r) && (!r.pendingReceiptId || !r.pendingReceiptCreated) && itemFitsSubject(r, subject));
    const rooms = personal ? [] : db.rooms.filter(r => inSchool(r) && (!subject || !r.subject || subjectEquals(r.subject, subject)));
    const resourceAlerts = [];
    for (const r of assets) {
      if (r.state === "已报废") continue;
      const reasons = [];
      if (!r.roomId) reasons.push("待存放");
      if (r.state === "正常使用" && r.nextMaintenance && r.nextMaintenance <= dayAfter(today, Number(db.settings.repairDays || 7))) reasons.push(r.nextMaintenance < today ? "维保日期已过" : "临近维保");
      if (reasons.length) resourceAlerts.push(row("assets", r, r.name, reasons.join("、"), r.nextMaintenance || ""));
    }
    for (const r of stocks) {
      const reasons = [];
      if (db.settings.lowStock && r.stock < r.min) reasons.push(`库存 ${r.stock}${r.unit}，阈值 ${r.min}${r.unit}`);
      if (!r.roomId && !r.pendingReceiptId) reasons.push("待分配位置");
      if (reasons.length) resourceAlerts.push(row("inventory", r, r.name, reasons.join("；")));
    }
    // Safety is school-wide shared data, even while a teaching subject is selected.
    const hazards = personal ? [] : db.hazards.filter(r => inSchool(r) && r.safetyScope === "hazardous"), openHazards = hazards.filter(r => r.state !== "已关闭");
    const hazardRows = openHazards.map(r => row("hazards", r, r.title, `${r.level} · ${label("staff", r.owner)}`, r.due, r.level === "需优先处理" ? 1 : 3));
    const chemicalAlerts = personal ? [] : db.inventory.filter(r => inSchool(r) && isHazard(r) && Number(r.stock) > 0 && (!r.pendingReceiptId || !r.pendingReceiptCreated)).flatMap(r => {
      const reasons = [], roomRecord = lookup("rooms", r.roomId), cabinet = lookup("cabinets", r.cabinetId);
      if (!r.expiry) reasons.push("未登记有效期");
      else if (r.expiry < today) reasons.push("已过期");
      else if (r.expiry <= dayAfter(today, 30)) reasons.push("30天内到期");
      if (!roomRecord || roomRecord.state !== "可用" || !roomRecord.hazardStorage) reasons.push("房间存放条件待核对");
      if (r.cabinetId && (!cabinet || cabinet.state !== "启用" || !cabinet.hazardStorage || cabinet.roomId !== r.roomId)) reasons.push("柜位条件待核对");
      return reasons.length ? [row("inventory", r, r.name, reasons.join("、"), r.expiry || "", r.expiry && r.expiry < today ? 0 : 2)] : [];
    });
    const checks = personal ? [] : db.tasks.filter(r => inSchool(r) && r.safetyScope === "hazardous"), checkRows = checks.filter(r => r.state === "待检查").map(r => row("tasks", r, r.kind, `${safetyTargetLabel(db, r)} · ${r.owner || "未登记"}`, r.due));
    const safetyRows = [...hazardRows, ...chemicalAlerts, ...checkRows];
    const purchaseRows = personal ? [] : db.purchases.filter(r => inSchool(r) && (!subject || (r.items || []).some(item => itemFitsSubject(item, subject)))).filter(r => district ? r.state === "待审核" : r.state === "已驳回" || r.state === "已通过" && !r.receiptId).map(r => row("purchases", r, district ? "采购待审核" : r.state === "已通过" ? "采购已通过，待到货入库" : "采购已驳回", r.purpose || r.id));
    const reviewRows = personal || district ? [] : db.flows.filter(r => inSchool(r) && r.state === "待复核" && r.applicantId !== actor.id && itemFitsSubject(r.snapshot || lookup("inventory", r.itemId), subject)).map(r => row("flows", r, "库存待第二人复核", `${label("inventory", r.itemId)} · ${r.kind}`));
    const todo = district ? [...purchaseRows, ...hazardRows.filter(r => r.state === "待区级复查")] : personal ? [...pendingBookings.filter(r => r.state === "已退回"), ...pendingSummary.map(r => ({ ...r, title: "实验待登记总结", description: `${r.className} · ${r.title}` }))] : [...pendingBookings.filter(r => r.state === "待安排"), ...pendingSummary.map(r => ({ ...r, title: "实验待登记总结", description: `${r.className} · ${r.title}` })), ...checkRows, ...hazardRows.filter(r => ["待整改", "整改中", "待校内复核"].includes(r.state)), ...reviewRows, ...purchaseRows];
    const urgency = r => r.priority === 0 || r.due && r.due < today ? 0 : r.priority === 1 || r.due === today ? 1 : r.due && r.due <= dayAfter(today, 3) ? 2 : r.priority;
    const sort = rows => rows.map(r => ({ ...r, urgency: urgency(r), timing: r.due ? r.due < today ? "已过期/超期" : r.due === today ? "今日" : r.due <= dayAfter(today, 3) ? "三天内" : r.due : "待处理" })).sort((a, b) => a.urgency - b.urgency || (a.due || "9999").localeCompare(b.due || "9999") || a.id.localeCompare(b.id));
    const configRows = [], submissionRows = [];
    if (!personal) for (const school of schools) {
      const activeClasses = db.classes.filter(r => r.school === school.id && r.state === "在读");
      const assignments = db.assignments.filter(r => r.school === school.id && r.term === termId && r.state === "有效" && r.primary && activeClasses.some(c => c.id === r.classId) && subjectEquals(r.subject, subject));
      const plans = db.plans.filter(r => r.school === school.id && r.term === termId && r.state === "已发布" && subjectEquals(r.subject, subject));
      const targetMatches = (plan, classId) => db.planTargets.some(t => t.planId === plan.id && t.classId === classId) || plan.targetMode !== "EXPLICIT" && !db.planTargets.some(t => t.planId === plan.id) && plan.grade === lookup("classes", classId)?.grade;
      for (const a of assignments) if (!plans.some(p => subjectEquals(p.subject, a.subject) && targetMatches(p, a.classId) && db.planItems.some(i => i.planId === p.id))) configRows.push(row("classes", lookup("classes", a.classId), "任课范围尚无实验计划", `${label("classes", a.classId)} · ${subjectLabel(a.subject)}`));
      for (const p of plans) {
        if (!db.planItems.some(i => i.planId === p.id)) configRows.push(row("plans", p, "计划尚无实验明细", p.name));
        const targets = db.planTargets.filter(t => t.planId === p.id);
        if (p.targetMode === "EXPLICIT" && !targets.length) configRows.push(row("plans", p, "计划未设置适用班级", p.name));
        for (const t of targets) if (!assignments.some(a => a.classId === t.classId && subjectEquals(a.subject, p.subject))) configRows.push(row("plans", p, "适用班级缺少有效主教师", `${label("classes", t.classId)} · ${subjectLabel(p.subject)}`));
      }
      if (!db.periods.some(p => p.school === school.id && p.term === termId && p.state === "启用")) configRows.push(row("schools", { ...school, school: school.id }, "本学期未设置启用节次", "请在基础数据中核对"));
      for (const r of rooms.filter(r => r.school === school.id && r.type === "教学实验室" && r.state === "可用")) if (!r.seats || !r.area) configRows.push(row("rooms", r, "实验室档案待补充", `${r.name}：座位数或面积未登记`));
      const submissions = db.submissions.filter(r => r.school === school.id && r.term === termId).slice().sort((a, b) => (b.at || b.date).localeCompare(a.at || a.date) || b.revision - a.revision), latest = submissions[0];
      const submissionIndex = latest ? db.logs.findLastIndex(l => l.table === "submissions" && l.recordId === latest.id) : -1;
      const changes = latest ? db.logs.filter((l, index) => l.school === school.id && l.table !== "submissions" && l.action !== "初始化数据" && (Number.isFinite(l.revision) ? l.revision > latest.revision : l.at > latest.at || submissionIndex >= 0 && index > submissionIndex)) : [];
      submissionRows.push({ school: school.id, name: school.name, latest, changes: changes.length, state: !latest ? "尚未上报" : changes.length ? "上报后有变更" : "已留存快照" });
    }
    const schoolRows = personal ? [] : schools.map(s => {
      const requiredRows = required.filter(r => r.school === s.id), done = requiredRows.filter(r => r.state === "已完成").length;
      const issues = { late: late.filter(r => r.school === s.id).length, resources: resourceAlerts.filter(r => r.school === s.id).length, hazards: hazardRows.filter(r => r.school === s.id).length, chemicals: chemicalAlerts.filter(r => r.school === s.id).length, config: configRows.filter(r => r.school === s.id).length };
      const submission = submissionRows.find(r => r.school === s.id);
      return { id: s.id, name: s.name, required: requiredRows.length, done, rate: ratio(done, requiredRows.length), ...issues, submission, attention: Object.values(issues).some(Boolean) || submission.state !== "已留存快照" };
    });
    return { personal, district, schoolId, subject, termId, today, term, weekStart, weekEnd, weekNumber: term ? weekOf(term, anchor) : 1, updatedAt: db.updatedAt, required: required.length, done: completed.length, rate: ratio(completed.length, required.length), pending: required.length - completed.length, late: late.length, weekCount: weekRows.length, todayCount: allArrangements.filter(r => r.due === today).length, pendingBookings: pendingBookings.length, pendingSummary: pendingSummary.length, todoCount: todo.length, attentionSchools: schoolRows.filter(r => r.attention).length, schools: schoolRows,
      teaching: teaching(db, schoolId, termId, options.by || "subject", { subject, ...(personal ? { teacherId: actor.id } : {}) }),
      lists: { required, late, week: weekRows, pendingBookings, pendingSummary, todo: sort(todo), resources: sort(resourceAlerts), safety: sort(safetyRows), hazards: sort(hazardRows), chemicals: sort(chemicalAlerts), checks: sort(checkRows), config: configRows, assets: assets.map(r => row("assets", r, r.name, r.state)), rooms: rooms.filter(r => r.type === "教学实验室").map(r => row("rooms", r, r.name, r.state)) },
      resources: { assets: assets.length, normal: assets.filter(r => r.state === "正常使用").length, scrapped: assets.filter(r => r.state === "已报废").length, value: assets.filter(r => r.state !== "已报废").reduce((n, r) => n + Number(r.price || 0), 0), labs: rooms.filter(r => r.type === "教学实验室").length, availableLabs: rooms.filter(r => r.type === "教学实验室" && r.state === "可用").length, cabinets: personal ? 0 : db.cabinets.filter(r => inSchool(r) && rooms.some(room => room.id === r.roomId) && r.state === "启用").length, low: stocks.filter(r => r.stock < r.min).length },
      safety: { open: hazardRows.length, overdue: hazardRows.filter(r => r.due && r.due < today).length, closed: hazards.length - hazardRows.length, closure: ratio(hazards.length - hazardRows.length, hazards.length), checks: checkRows.length, monthChecks: personal ? 0 : db.checks.filter(r => inSchool(r) && r.safetyScope === "hazardous" && r.date >= `${today.slice(0, 7)}-01` && r.date <= today).length }, submissions: submissionRows };
  }
  function auditRelations(db) {
    const issues = [], exists = (table, id) => !!id && !!db[table]?.some(row => row.id === id), has = (table, id) => !id || exists(table, id), rowOf = (table, id) => db[table]?.find(row => row.id === id), need = (ok, message) => { if (!ok) issues.push(message); };
    const sameSchool = (left, right, message) => { if (left && right) need(!left.school || !right.school || left.school === right.school, message); };
    const checkSubject = (row, label, required = true, allowGeneral = false) => {
      const raw = String(row?.subject || "").trim();
      if (!raw) { need(!required, `${label}未登记学科`); need(!row?.subjectCode, `${label}无学科却保留编码${row?.subjectCode}`); return ""; }
      if (allowGeneral && raw === "综合") { need(!row.subjectCode, `${label}综合角色不应登记学科编码`); return raw; }
      const normalized = normalizeSubject(raw), code = subjectCode(normalized);
      need(subjects.includes(normalized), `${label}学科无效：${raw}`);
      need(raw === normalized, `${label}学科别名未归一：${raw}`);
      need(!!code && row.subjectCode === code, `${label}学科编码不匹配：${row.subjectCode || "空"}`);
      return normalized;
    };
    const checkScopes = (row, label) => {
      if (!Array.isArray(row?.subjectScopes)) return;
      const normalized = row.subjectScopes.map(normalizeSubject);
      need(normalized.length > 0 && normalized.every(subject => subjects.includes(subject)), `${label}适用学科范围无效`);
      need(new Set(normalized).size === normalized.length && normalized.every((subject, index) => subject === row.subjectScopes[index]), `${label}适用学科范围未归一或重复`);
    };
    Object.keys(tableNames).forEach(table => { const ids = new Set(); (db[table] || []).forEach(row => { need(row.id && !ids.has(row.id), `${table}存在空ID或重复ID：${row.id || "空"}`); ids.add(row.id); if (row.school) need(has("schools", row.school), `${table}.${row.id}关联学校不存在：${row.school}`); }); });
    (db.staff || []).forEach(row => { const department = rowOf("departments", row.departmentId); need(has("departments", row.departmentId), `人员${row.id}部门不存在`); sameSchool(row, department, `人员${row.id}与部门学校不一致`); checkSubject(row, `人员${row.id}`, row.role === "teacher", true); });
    (db.rooms || []).forEach(row => checkSubject(row, `房间${row.id}`, ["教学实验室", "准备室", "仪器室"].includes(row.type)));
    (db.cabinets || []).forEach(row => {
      const room = rowOf("rooms", row.roomId), custodian = rowOf("staff", row.custodianId);
      need(!!row.roomId && !!room, `橱柜${row.id}所属房间不存在`);
      need(["仪器柜", "耗材柜", "危化品专用柜", "其他"].includes(row.type), `橱柜${row.id}类型无效`);
      need(["启用", "停用"].includes(row.state), `橱柜${row.id}状态无效`);
      need(!!row.code && !!row.name, `橱柜${row.id}编号或名称为空`);
      sameSchool(row, room, `橱柜${row.id}与房间学校不一致`);
      if (custodian) sameSchool(row, custodian, `橱柜${row.id}与保管责任人学校不一致`);
      if (row.hazardStorage) need(room?.hazardStorage === true, `橱柜${row.id}标记危化品专用但所属房间不具备存放条件`);
    });
    (db.textbooks || []).forEach(row => checkSubject(row, `教材${row.id}`));
    (db.assignments || []).forEach(row => {
      const subject = checkSubject(row, `任课班级${row.id}`), term = rowOf("terms", row.term), klass = rowOf("classes", row.classId), teacher = rowOf("staff", row.teacherId);
      need(!!term, `任课班级${row.id}学期不存在`); need(!!klass, `任课班级${row.id}班级不存在`); need(!!teacher, `任课班级${row.id}教师不存在`);
      sameSchool(row, klass, `任课班级${row.id}与班级学校不一致`); sameSchool(row, teacher, `任课班级${row.id}与教师学校不一致`);
      if (teacher) need(teacher.role === "teacher" && (teacher.subject === "综合" || normalizeSubject(teacher.subject) === subject), `任课班级${row.id}与教师角色或专业学科不一致`);
    });
    (db.periods || []).forEach(row => need(!!row.term && exists("terms", row.term), `节次${row.id}学期不存在`));
    (db.assets || []).forEach(row => { const room = rowOf("rooms", row.roomId), cabinet = rowOf("cabinets", row.cabinetId), receipt = rowOf("receipts", row.sourceId); need(has("rooms", row.roomId), `设备${row.id}房间不存在`); need(has("cabinets", row.cabinetId), `设备${row.id}橱柜不存在`); need(has("receipts", row.sourceId), `设备${row.id}来源入库单不存在`); sameSchool(row, room, `设备${row.id}与房间学校不一致`); sameSchool(row, cabinet, `设备${row.id}与橱柜学校不一致`); sameSchool(row, receipt, `设备${row.id}与入库单学校不一致`); if (cabinet) need(cabinet.roomId === row.roomId, `设备${row.id}与橱柜所属房间不一致`); checkScopes(row, `设备${row.id}`); });
    (db.inventory || []).forEach(row => { const room = rowOf("rooms", row.roomId), cabinet = rowOf("cabinets", row.cabinetId); need(has("rooms", row.roomId), `库存${row.id}房间不存在`); need(has("cabinets", row.cabinetId), `库存${row.id}橱柜不存在`); need(Number(row.stock) >= 0, `库存${row.id}数量为负数`); sameSchool(row, room, `库存${row.id}与房间学校不一致`); sameSchool(row, cabinet, `库存${row.id}与橱柜学校不一致`); if (cabinet) need(cabinet.roomId === row.roomId, `库存${row.id}与橱柜所属房间不一致`); checkScopes(row, `库存${row.id}`); });
    (db.purchases || []).forEach(row => { const receipt = rowOf("receipts", row.receiptId); need(has("receipts", row.receiptId), `采购${row.id}关联入库单不存在`); if (receipt) { sameSchool(row, receipt, `采购${row.id}与入库单学校不一致`); need(receipt.purchaseId === row.id, `采购${row.id}与入库单反向关系不一致`); } (row.items || []).forEach((line, index) => { need(Number(line.qty) > 0 && Number(line.price) >= 0, `采购${row.id}第${index + 1}行数量或单价无效`); checkScopes(line, `采购${row.id}第${index + 1}行`); }); });
    (db.receipts || []).forEach(row => { const purchase = rowOf("purchases", row.purchaseId); need(has("purchases", row.purchaseId), `入库单${row.id}关联采购不存在`); if (purchase) { sameSchool(row, purchase, `入库单${row.id}与采购学校不一致`); need(purchase.receiptId === row.id, `入库单${row.id}与采购反向关系不一致`); } (row.items || []).forEach((line, index) => { const room = rowOf("rooms", line.roomId), cabinet = rowOf("cabinets", line.cabinetId); need(has("rooms", line.roomId), `入库单${row.id}第${index + 1}行房间不存在`); need(has("cabinets", line.cabinetId), `入库单${row.id}第${index + 1}行橱柜不存在`); need(Number(line.qty) > 0 && Number(line.price) >= 0, `入库单${row.id}第${index + 1}行数量或单价无效`); sameSchool(row, room, `入库单${row.id}第${index + 1}行与房间学校不一致`); sameSchool(row, cabinet, `入库单${row.id}第${index + 1}行与橱柜学校不一致`); if (cabinet) need(cabinet.roomId === line.roomId, `入库单${row.id}第${index + 1}行与橱柜所属房间不一致`); checkScopes(line, `入库单${row.id}第${index + 1}行`); }); });
    (db.repairs || []).forEach(row => { const asset = rowOf("assets", row.assetId); need(!!row.assetId && exists("assets", row.assetId), `维修报废${row.id}设备不存在`); if (asset) sameSchool(row, asset, `维修报废${row.id}与设备学校不一致`); need(Number(row.qty) > 0, `维修报废${row.id}数量无效`); });
    (db.flows || []).forEach(row => { const stock = rowOf("inventory", row.itemId), source = rowOf("flows", row.sourceFlowId), task = rowOf("teachingTasks", row.taskId), arrangement = rowOf("arrangements", row.arrangementId), receipt = rowOf("receipts", row.receiptId), snapshotCabinet = row.snapshot?.cabinetId ? rowOf("cabinets", row.snapshot.cabinetId) : null; need(!!row.itemId && exists("inventory", row.itemId), `库存流水${row.id}库存不存在`); need(row.kind === "退回" ? !!source : !row.sourceFlowId, `库存流水${row.id}来源流水关系无效`); need(has("teachingTasks", row.taskId), `库存流水${row.id}班级执行记录不存在`); need(has("arrangements", row.arrangementId), `库存流水${row.id}实验安排不存在`); need(has("receipts", row.receiptId), `库存流水${row.id}入库单不存在`); need(Number(row.qty) > 0, `库存流水${row.id}数量无效`); if (stock) sameSchool(row, stock, `库存流水${row.id}与库存学校不一致`); if (source) { sameSchool(row, source, `库存流水${row.id}与来源流水学校不一致`); need(source.kind === "领用" && source.itemId === row.itemId, `库存流水${row.id}退回来源不一致`); } if (task) sameSchool(row, task, `库存流水${row.id}与班级执行记录学校不一致`); if (arrangement) { sameSchool(row, arrangement, `库存流水${row.id}与实验安排学校不一致`); const booking = rowOf("bookings", arrangement.bookingId); if (task && booking) need(booking.taskId === task.id, `库存流水${row.id}与安排的班级执行记录不一致`); } if (receipt) sameSchool(row, receipt, `库存流水${row.id}与入库单学校不一致`); if (snapshotCabinet) { sameSchool(row.snapshot, snapshotCabinet, `库存流水${row.id}快照与橱柜学校不一致`); need(!row.snapshot.roomId || snapshotCabinet.roomId === row.snapshot.roomId, `库存流水${row.id}快照与橱柜所属房间不一致`); } need(has("cabinets", row.snapshot?.cabinetId), `库存流水${row.id}快照橱柜不存在`); checkScopes(row.snapshot, `库存流水${row.id}快照`); });
    (db.storageMoves || []).forEach(row => {
      const source = rowOf(row.kind === "asset" ? "assets" : "inventory", row.kind === "asset" ? row.assetId : row.inventoryId), fromRoom = rowOf("rooms", row.fromRoomId), toRoom = rowOf("rooms", row.toRoomId), toCabinet = rowOf("cabinets", row.toCabinetId);
      need(["asset", "inventory"].includes(row.kind), `存放调整${row.id}类型无效`);
      need(!!source, `存放调整${row.id}来源记录不存在`);
      need(!!fromRoom && !!toRoom, `存放调整${row.id}房间不存在`);
      need(has("cabinets", row.fromCabinetId) && has("cabinets", row.toCabinetId), `存放调整${row.id}橱柜不存在`);
      if (source) { sameSchool(row, source, `存放调整${row.id}与来源记录学校不一致`); const atFrom = source.roomId === row.fromRoomId && (source.cabinetId || "") === (row.fromCabinetId || ""), atTo = source.roomId === row.toRoomId && (source.cabinetId || "") === (row.toCabinetId || ""); need(atFrom || row.kind === "asset" && atTo, `存放调整${row.id}原存放位置与来源记录不一致`); }
      sameSchool(row, fromRoom, `存放调整${row.id}原房间学校不一致`); sameSchool(row, toRoom, `存放调整${row.id}目标房间学校不一致`); sameSchool(row, toCabinet, `存放调整${row.id}目标橱柜学校不一致`);
      if (toCabinet) need(toCabinet.roomId === row.toRoomId, `存放调整${row.id}目标橱柜所属房间不一致`);
      need(Number(row.qty) > 0, `存放调整${row.id}数量无效`);
    });
    (db.experimentCatalog || []).forEach(row => {
      const subject = checkSubject(row, `官方实验目录${row.id}`), textbook = rowOf("textbooks", row.textbookId);
      need(!!textbook, `官方实验目录${row.id}教材不存在`); if (textbook) need(normalizeSubject(textbook.subject) === subject && textbook.grade === row.grade, `官方实验目录${row.id}与教材学科或年级不一致`);
      need(experimentCategories.includes(row.experimentCategory), `官方实验目录${row.id}实验属性无效`); need(Array.isArray(row.equipmentRequirements), `官方实验目录${row.id}器材需求格式无效`);
    });
    (db.customExperiments || []).forEach(row => {
      const subject = checkSubject(row, `自定义实验${row.id}`), textbook = row.textbookId ? rowOf("textbooks", row.textbookId) : null;
      need(has("schools", row.school), `自定义实验${row.id}学校不存在`); need(has("textbooks", row.textbookId), `自定义实验${row.id}教材不存在`);
      if (textbook) need(normalizeSubject(textbook.subject) === subject && textbook.grade === row.grade, `自定义实验${row.id}与教材学科或年级不一致`);
      need(row.experimentCategory === "创新实验", `自定义实验${row.id}必须标记为创新实验`); need(Array.isArray(row.equipmentRequirements) && row.equipmentRequirements.length > 0, `自定义实验${row.id}未登记器材需求`);
    });
    (db.plans || []).forEach(row => {
      const subject = checkSubject(row, `实验计划${row.id}`), textbook = row.textbookId ? rowOf("textbooks", row.textbookId) : null;
      need(has("terms", row.term), `实验计划${row.id}学期不存在`); need(has("textbooks", row.textbookId), `实验计划${row.id}教材不存在`);
      if (textbook) need(normalizeSubject(textbook.subject) === subject && textbook.grade === row.grade, `实验计划${row.id}与教材学科或年级不一致`);
      need(["EXPLICIT", "LEGACY_ALL"].includes(row.targetMode), `实验计划${row.id}适用班级模式无效`);
      if (row.targetMode === "EXPLICIT") need((db.planTargets || []).some(target => target.planId === row.id), `实验计划${row.id}未登记适用班级`);
    });
    const targetKeys = new Set();
    (db.planTargets || []).forEach(row => {
      const plan = rowOf("plans", row.planId), klass = rowOf("classes", row.classId);
      need(!!plan, `计划适用班级${row.id}计划不存在`); need(!!klass, `计划适用班级${row.id}班级不存在`);
      const targetKey = `${row.planId}|${row.classId}`; need(!targetKeys.has(targetKey), `计划适用班级${row.id}存在重复目标班级`); targetKeys.add(targetKey);
      if (plan && klass) need(row.school === plan.school && klass.school === plan.school && klass.grade === plan.grade && row.grade === plan.grade, `计划适用班级${row.id}与计划学校或年级不一致`);
    });
    (db.planItems || []).forEach(row => {
      const subject = checkSubject(row, `计划明细${row.id}`), plan = rowOf("plans", row.planId), source = row.sourceType === "官方目录" ? rowOf("experimentCatalog", row.sourceId) : row.sourceType === "学校自定义" ? rowOf("customExperiments", row.sourceId) : null;
      need(!!plan, `计划明细${row.id}计划不存在`);
      if (plan) need(row.school === plan.school && row.grade === plan.grade && subject === normalizeSubject(plan.subject) && (!row.textbookId || !plan.textbookId || plan.targetMode === "LEGACY_ALL" || row.textbookId === plan.textbookId), `计划明细${row.id}与计划学校、学科、年级或教材不一致`);
      if (["官方目录", "学校自定义"].includes(row.sourceType)) need(!!source, `计划明细${row.id}实验来源不存在`);
      if (source) { if (row.sourceType === "学校自定义") sameSchool(plan, source, `计划明细${row.id}与自定义实验学校不一致`); need(subject === normalizeSubject(source.subject) && row.grade === source.grade && (!row.textbookId || !source.textbookId || row.textbookId === source.textbookId), `计划明细${row.id}与实验来源学科、年级或教材不一致`); }
    });
    (db.teachingTasks || []).forEach(row => {
      const subject = checkSubject(row, `班级执行记录${row.id}`), item = rowOf("planItems", row.planItemId), assignment = rowOf("assignments", row.assignmentId), klass = rowOf("classes", row.classId), teacher = rowOf("staff", row.teacherId), plan = item && rowOf("plans", item.planId);
      need(!!item, `班级执行记录${row.id}计划实验不存在`); need(!!assignment, `班级执行记录${row.id}任课关系不存在`); need(!!klass, `班级执行记录${row.id}班级不存在`); need(!!teacher, `班级执行记录${row.id}教师不存在`);
      if (item && assignment && klass && teacher && plan) need(row.school === plan.school && assignment.school === plan.school && klass.school === plan.school && teacher.school === plan.school && row.term === plan.term && assignment.term === plan.term && row.classId === assignment.classId && row.classId === klass.id && row.teacherId === assignment.teacherId && subject === normalizeSubject(item.subject) && subject === normalizeSubject(assignment.subject), `班级执行记录${row.id}与计划实验、任课、班级或教师不一致`);
    });
    (db.bookings || []).forEach(row => {
      const subject = checkSubject(row, `预约${row.id}`), task = rowOf("teachingTasks", row.taskId);
      need(!!task, `预约${row.id}对应的计划实验不存在`); if (task) need(row.school === task.school && row.planItemId === task.planItemId && row.assignmentId === task.assignmentId && row.classId === task.classId && row.teacherId === task.teacherId && subject === normalizeSubject(task.subject), `预约${row.id}与计划实验、班级或学科不一致`);
      (row.requestedResources || []).forEach((resource, index) => { need(Number(resource.qty) > 0, `预约${row.id}第${index + 1}项器材数量无效`); checkScopes(resource, `预约${row.id}第${index + 1}项器材`); if (task) need(itemFitsSubject(resource, task.subject), `预约${row.id}第${index + 1}项器材与实验学科不一致`); });
    });
    (db.arrangements || []).forEach(row => {
      const subject = checkSubject(row, `安排${row.id}`), booking = rowOf("bookings", row.bookingId), task = booking && rowOf("teachingTasks", booking.taskId), room = row.roomId ? rowOf("rooms", row.roomId) : null, technician = rowOf("staff", row.technicianId);
      need(!!booking, `安排${row.id}预约不存在`); need(row.venueType === "其他" ? !row.roomId : !!room, `安排${row.id}房间不存在或地点类型不一致`); need(!!technician, `安排${row.id}实验负责人不存在`);
      if (booking) need(row.school === booking.school && subject === normalizeSubject(booking.subject), `安排${row.id}与预约学校或学科不一致`);
      if (room) { need(room.school === row.school, `安排${row.id}与房间学校不一致`); if (row.venueType === "实验室") need(room.type === "教学实验室" && (!room.subject || subjectEquals(room.subject, subject)), `安排${row.id}实验室类型或学科不一致`); if (row.venueType === "教室") need(room.type === "普通教室", `安排${row.id}教室类型不一致`); }
      if (technician) need(technician.school === row.school && technician.role === "admin" && technician.enabled, `安排${row.id}实验负责人身份或学校不一致`);
      (row.resources || []).forEach(resource => { const record = rowOf("assets", resource.ref) || rowOf("inventory", resource.ref); need(Number(resource.qty) > 0, `安排${row.id}器材数量无效`); need(!!resource.ref && !!record, `安排${row.id}器材不存在：${resource.ref || "空"}`); if (record) { need(record.school === row.school, `安排${row.id}器材与学校不一致：${resource.ref}`); if (task) need(itemFitsSubject(itemOf(db, record), task.subject), `安排${row.id}器材与实验学科不一致：${resource.ref}`); } });
    });
    (db.summaries || []).forEach(row => {
      const subject = checkSubject(row, `总结${row.id}`), arrangement = rowOf("arrangements", row.arrangementId), booking = arrangement && rowOf("bookings", arrangement.bookingId), task = booking && rowOf("teachingTasks", booking.taskId);
      need(!!arrangement, `总结${row.id}安排不存在`); if (arrangement) need(row.school === arrangement.school && subject === normalizeSubject(arrangement.subject), `总结${row.id}与安排学校或学科不一致`);
      need(arrangement?.state === "已完成" && booking?.state === "已完成" && task?.state === "已完成", `总结${row.id}未同步完成安排、预约和任务`);
    });
    const safetyTarget = (row, label) => {
      const targetTable = { inventory: "inventory", cabinet: "cabinets", room: "rooms" }[row.targetType], target = targetTable && rowOf(targetTable, row.targetId), roomId = row.targetType === "room" ? row.targetId : target?.roomId, room = rowOf("rooms", row.roomId);
      need(["hazardous", "general"].includes(row.safetyScope), `${label}安全范围无效`);
      need(!!targetTable && !!target, `${label}检查对象不存在`);
      need(!!row.roomId && !!room, `${label}房间不存在`);
      if (target) { sameSchool(row, target, `${label}与检查对象学校不一致`); need(roomId === row.roomId, `${label}检查对象与房间不一致`); }
      if (room) sameSchool(row, room, `${label}与房间学校不一致`);
      if (row.safetyScope === "general") need(row.targetType === "room", `${label}一般安全检查须以房间为对象`);
      if (row.safetyScope === "hazardous" && room) {
        need(room.hazardStorage === true, `${label}危化品检查房间不具备存放条件`);
        if (row.targetType === "inventory" && target) need(isHazard(itemOf(db, target)) && !target.pendingReceiptCreated, `${label}库存对象不是正式危化品库存`);
        if (row.targetType === "cabinet" && target) need(target.hazardStorage === true, `${label}橱柜对象不是危化品专柜`);
      }
    };
    (db.tasks || []).forEach(row => {
      const check = rowOf("checks", row.checkId); safetyTarget(row, `检查任务${row.id}`);
      need(has("checks", row.checkId), `检查任务${row.id}检查记录不存在`);
      need(["待检查", "待整改", "已完成"].includes(row.state), `检查任务${row.id}状态无效：${row.state}`);
      if (check) {
        sameSchool(row, check, `检查任务${row.id}与检查记录学校不一致`);
        need(!check.taskId || check.taskId === row.id, `检查任务${row.id}与检查记录反向关系不一致`);
        need(sameSafetyTarget(row, check), `检查任务${row.id}与检查记录对象不一致`);
        const hazards = (db.hazards || []).filter(hazard => hazard.checkId === check.id), expected = hazards.length ? hazards.every(hazard => hazard.state === "已关闭") ? "已完成" : "待整改" : check.result === "正常" ? "已完成" : "待检查";
        need(row.state === expected, `检查任务${row.id}未同步检查与隐患状态`);
      }
    });
    (db.checks || []).forEach(row => {
      const task = rowOf("tasks", row.taskId); safetyTarget(row, `检查记录${row.id}`);
      need(has("tasks", row.taskId), `检查记录${row.id}检查任务不存在`);
      if (task) { sameSchool(row, task, `检查记录${row.id}与检查任务学校不一致`); need(!task.checkId || task.checkId === row.id, `检查记录${row.id}与检查任务反向关系不一致`); need(sameSafetyTarget(row, task), `检查记录${row.id}与检查任务对象不一致`); }
    });
    (db.hazards || []).forEach(row => {
      const check = rowOf("checks", row.checkId), archive = rowOf("archives", row.attachmentId), submissions = Array.isArray(row.submissionHistory) ? row.submissionHistory : [], reviews = Array.isArray(row.reviewHistory) ? row.reviewHistory : [];
      safetyTarget(row, `隐患${row.id}`);
      need(!!row.checkId && exists("checks", row.checkId), `隐患${row.id}检查记录不存在`);
      need(["待整改", "整改中", "待校内复核", "待区级复查", "已关闭"].includes(row.state), `隐患${row.id}状态无效：${row.state}`);
      need(Array.isArray(row.submissionHistory), `隐患${row.id}整改提交历史格式无效`);
      need(Array.isArray(row.reviewHistory), `隐患${row.id}审核历史格式无效`);
      need(has("archives", row.attachmentId), `隐患${row.id}整改附件不存在`);
      if (check) { sameSchool(row, check, `隐患${row.id}与检查记录学校不一致`); need(sameSafetyTarget(row, check), `隐患${row.id}与检查对象不一致`); }
      if (archive) { sameSchool(row, archive, `隐患${row.id}与附件学校不一致`); need(archive.relatedTable === "hazards" && archive.relatedId === row.id, `隐患${row.id}与整改附件反向关系不一致`); }
      submissions.forEach((submission, index) => {
        const file = rowOf("archives", submission.attachmentId);
        need(!!submission.rectification && (!!submission.at || submission.legacy === true), `隐患${row.id}第${index + 1}次整改提交信息不完整`);
        need(!!file, `隐患${row.id}第${index + 1}次整改附件不存在`);
        if (file) need(file.school === row.school && file.relatedTable === "hazards" && file.relatedId === row.id, `隐患${row.id}第${index + 1}次整改附件关系不一致`);
      });
      let schoolApproved = false;
      reviews.forEach((review, index) => {
        need(["school", "district"].includes(review.stage), `隐患${row.id}第${index + 1}次审核阶段无效`);
        need(["通过", "驳回"].includes(review.result) && review.approve === (review.result === "通过"), `隐患${row.id}第${index + 1}次审核结果无效`);
        need(!!review.reason && !!review.reviewerName && !!review.at, `隐患${row.id}第${index + 1}次审核信息不完整`);
        if (review.stage === "school") schoolApproved = review.approve === true;
        if (review.stage === "district") { need(schoolApproved, `隐患${row.id}区级复查前缺少校内通过记录`); schoolApproved = false; }
      });
      if (["待校内复核", "待区级复查"].includes(row.state) || row.state === "已关闭" && !row.legacyClosed) need(!!row.rectification && !!row.attachmentId && submissions.length > 0, `隐患${row.id}当前状态缺少整改提交材料`);
      if (row.state === "待区级复查") need(reviews.at(-1)?.stage === "school" && reviews.at(-1)?.approve === true, `隐患${row.id}待区级复查但缺少最近一次校内通过记录`);
      if (row.state === "已关闭" && !row.legacyClosed) need(reviews.at(-1)?.stage === "district" && reviews.at(-1)?.approve === true, `隐患${row.id}已关闭但缺少区级通过记录`);
    });
    (db.archives || []).forEach(row => { const linked = db[row.relatedTable]?.find(record => record.id === row.relatedId); need(!!row.relatedTable && !!row.relatedId && !!linked, `附件${row.id}关联记录不存在：${row.relatedTable}.${row.relatedId}`); if (linked) sameSchool(row, linked, `附件${row.id}与关联记录学校不一致`); });
    (db.resources || []).forEach(row => {
      const uploader = rowOf("staff", row.uploaderId); checkSubject(row, `教学资源${row.id}`); need(has("schools", row.school), `教学资源${row.id}学校不存在`); need(has("staff", row.uploaderId), `教学资源${row.id}上传人不存在`); if (uploader) sameSchool(row, uploader, `教学资源${row.id}与上传人学校不一致`); need(resourceTypes.includes(row.resourceType), `教学资源${row.id}类型无效`);
      need(Array.isArray(row.grades) && row.grades.length > 0, `教学资源${row.id}未登记适用年级`); need(row.grades.every(grade => resourceGrades.includes(grade)), `教学资源${row.id}适用年级无效`);
      need(resourceCategories.includes(row.experimentCategory), `教学资源${row.id}实验属性无效`); need(!!row.title, `教学资源${row.id}未登记名称`);
    });
    (db.submissions || []).forEach(row => need(!!row.term && exists("terms", row.term), `上报${row.id}学期不存在`));
    (db.repairs || []).filter(row => row.kind === "报废").forEach(row => need(db.assets?.find(asset => asset.id === row.assetId)?.state === "已报废", `报废登记${row.id}未同步设备状态`));
    return issues;
  }
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
  function actorFor(db, role, school = "S1", personId) { const legacyTechnician = role === "technician"; if (legacyTechnician) role = "admin"; choice(role, Object.keys(roles), "身份"); if (role === "district") return { role, name: "周岚", school: "", id: "DISTRICT" }; find(db, "schools", school); const matches = db.staff.filter(p => p.school === school && p.role === role && p.enabled && (!personId || p.id === personId)); const person = legacyTechnician ? (matches.find(p => p.legacyRole === "technician") || matches.find(p => p.title === "实验管理员" || p.title === "实验员")) : matches[0]; must(person, "该校暂无可用的对应角色账号，请先维护人员。"); return { role, school, name: person.name, id: person.id }; }

  function transact(original, actor, command, input = {}, now = new Date().toISOString()) {
    if (command === "loss.batch") {
      must(Array.isArray(input.rows) && input.rows.length > 0 && input.rows.length <= 30, "请选择1至30条易耗品损耗明细。"); let next = original; const ids = [];
      input.rows.forEach(row => { const out = transact(next, actor, "loss.register", { ...row, date: input.date, reason: input.reason, operator: input.operator }, now); next = out.db; ids.push(out.result.id); }); ids.forEach(id => { find(next, "flows", id).batchId = ids[0]; }); return { db: next, result: { ...find(next, "flows", ids[0]), ids } };
    }
    if (command === "booking.batch") {
      must(Array.isArray(input.rows) && input.rows.length > 0 && input.rows.length <= 30, "请填写1至30条业务明细。"); let next = original; const ids = [];
      input.rows.forEach(row => { const out = transact(next, actor, "booking.create", row, now); next = out.db; ids.push(out.result.id); }); ids.forEach(id => { find(next, "bookings", id).batchId = ids[0]; }); return { db: next, result: { ...find(next, "bookings", ids[0]), ids } };
    }
    const db = clone(original), p = clone(input); let result;
    must(actor && roles[actor.role], "请选择有效身份。"); if (actor.role !== "district") { const person = find(db, "staff", actor.id); must(person.enabled && person.role === actor.role && person.school === actor.school, "账号身份已变更，请重新选择身份。"); }
    const id = prefix => `${prefix}-${TODAY.replaceAll("-", "")}-${++db.seq}`, permit = allowed => must(allowed.includes(actor.role), `该操作需要${allowed.map(role => roles[role]).join("或")}身份。`), get = (table, key = p.id) => { const row = find(db, table, key); must(actor.role === "district" || row.school === actor.school || table === "schools" && row.id === actor.school, "不能操作其他学校的数据。"); return row; }, state = (row, allowed) => must(allowed.includes(row.state), `当前状态“${row.state}”不能执行此操作。`);
    function log(table, row, action, note = "") { db.logs.push({ id: id("LOG"), school: row.school || "", table, recordId: row.id, action, note, actor: actor.name, at: now, revision: original.revision + 1 }); result = row; }
    function add(table, row, action) { db[table].unshift(row); log(table, row, action); return row; }
    function remove(table, row, action, note = "") { log(table, row, action, note); db[table] = db[table].filter(item => item.id !== row.id); result = row; return row; }
    const hasArchive = (table, recordId) => db.archives.some(file => file.relatedTable === table && file.relatedId === recordId);
    function sameSchool(table, key, school) { const row = find(db, table, key); must(!row.school || row.school === school, "关联档案须属于同一学校。"); return row; }
    const activeTermId = db.terms.find(term => term.start <= TODAY && TODAY <= term.end)?.id || db.terms[0]?.id || "";
    function teacherCanUseSubject(subject, term = activeTermId) {
      if (actor.role !== "teacher") return true;
      const person = find(db, "staff", actor.id), normalized = normalizeSubject(subject);
      if (person.subject !== "综合") return normalizeSubject(person.subject) === normalized;
      return db.assignments.some(assignment => assignment.teacherId === actor.id && assignment.state === "有效" && normalizeSubject(assignment.subject) === normalized && (!term || assignment.term === term));
    }
    function requireTeacherSubject(subject, term = activeTermId) { must(teacherCanUseSubject(subject, term), "教师只能维护本人专业学科；综合教师须具备当前学期对应学科的有效任课关系。"); }
    const subjectScopeFields = item => ({ ...(item.subjectScopes?.length ? { subjectScopes: [...item.subjectScopes] } : {}), ...(item.shared === true ? { shared: true } : {}), ...(item.subjectScope === "通用" ? { subjectScope: "通用" } : {}) });
    function lineItems(raw, receiving = false) { must(Array.isArray(raw) && raw.length > 0 && raw.length <= 30, "请填写1至30条物品明细。"); return raw.map(row => { const item = itemRecord(db, row); item.classificationCode = text(item.classificationCode, "分类编号", 60); item.name = text(item.name, "物品名称"); item.spec = text(item.spec, "规格型号"); item.unit = text(item.unit, "单位"); must(!item.maintenanceRequired || item.trackingMode === "SERIALIZED", "周期维保只适用于单件编号设备。"); must(!["耗材", "危化品"].includes(item.category) || item.trackingMode === "QUANTITY", "耗材和危化品须按数量库存管理。"); const nextMaintenance = row.nextMaintenance || "", expiry = row.expiry || "", roomId = row.roomId || "", cabinetId = row.cabinetId || ""; if (nextMaintenance) { must(item.trackingMode === "SERIALIZED" && item.maintenanceRequired, `“${item.name}”不需要登记维保日期。`); date(nextMaintenance); } if (expiry) { must(item.trackingMode === "QUANTITY", `“${item.name}”不是数量库存，不登记有效期。`); date(expiry); } if (receiving && isHazard(item)) must(expiry, `请登记“${item.name}”的有效期。`); if (cabinetId) { const cabinet = sameSchool("cabinets", cabinetId, actor.school); must(roomId && cabinet.roomId === roomId && cabinetFitsItem(db, cabinet, item), `“${item.name}”与橱柜存放条件不一致。`); } return { itemId: item.itemId || item.classificationCode, classificationCode: item.classificationCode, name: item.name, model: item.spec, spec: item.spec, category: item.category, unit: item.unit, trackingMode: item.trackingMode, maintenanceRequired: item.maintenanceRequired, ...subjectScopeFields(item), qty: num(row.qty, "数量", 1, true), price: num(row.price, "单价"), roomId, ...(cabinetId ? { cabinetId } : {}), nextMaintenance, expiry }; }); }
    function resourceFitsSubject(resource, subject) { const record = db.assets.find(row => row.id === resource.ref) || db.inventory.find(row => row.id === resource.ref), item = itemOf(db, record), room = record?.roomId ? find(db, "rooms", record.roomId) : null; return itemFitsSubject(item, subject) && (!room?.subject || subjectEquals(room.subject, subject)); }
    const overlaps = (left, right) => left.scheduledDate === right.scheduledDate && Number(left.startPeriod) <= Number(right.endPeriod) && Number(right.startPeriod) <= Number(left.endPeriod);
    function resourceRows(raw, school, reserve = false, arrangementId = "", window = null) {
      must(Array.isArray(raw) && raw.length <= 30, "器材明细格式不正确。"); must(new Set(raw.map(r => r.ref)).size === raw.length, "同一器材请合并数量。");
      return raw.map(row => { const asset = db.assets.find(a => a.id === row.ref), stock = db.inventory.find(i => i.id === row.ref), record = asset || stock; must(record && record.school === school, "请选择本校器材。"); const qty = num(row.qty, "器材数量", 1, true), item = itemOf(db, record), room = record.roomId ? find(db, "rooms", record.roomId) : null; if (asset) { must(qty === 1 && asset.state === "正常使用" && room?.school === school && room.state === "可用", `“${item.name}”不可用、尚未分配房间或存放房间已停用。`); if (reserve) { const conflict = db.arrangements.find(a => a.id !== arrangementId && a.state !== "已取消" && window && overlaps(a, window) && (a.resources || []).some(resource => resource.ref === asset.id)); must(!conflict, `“${item.name}”已被重叠实验安排${conflict?.id || ""}占用。`); } } if (stock) { must(!stock.pendingReceiptId, `“${item.name}”正在等待整单入库复核。`); must(!expiredHazard(db, stock), `“${item.name}”已过期，只能办理退回、损耗或处置。`); must(room?.school === school && room.state === "可用" && roomFitsItem(room, item), `“${item.name}”尚未分配合规存放房间或存放房间已停用。`); const pending = db.flows.filter(f => f.itemId === stock.id && f.state === "待复核" && ["领用", "损耗", "处置"].includes(f.kind)).reduce((sum, f) => sum + f.qty, 0), reserved = reserve ? db.arrangements.filter(a => a.id !== arrangementId && activeArrangement(a) && window && overlaps(a, window)).reduce((sum, a) => sum + (a.resources || []).filter(x => x.ref === stock.id).reduce((n, x) => n + x.qty, 0), 0) : 0, issues = arrangementId ? db.flows.filter(flow => flow.arrangementId === arrangementId && flow.itemId === stock.id && flow.kind === "领用" && flow.state === "已记账") : [], issued = issues.reduce((sum, issue) => sum + issue.qty - db.flows.filter(flow => flow.kind === "退回" && flow.sourceFlowId === issue.id && flow.state === "已记账").reduce((n, flow) => n + flow.qty, 0), 0); must(qty + pending + reserved <= stock.stock + issued, `“${item.name}”可用库存不足。`); } return { ref: record.id, qty }; });
    }
    function requestRows(raw) { must(Array.isArray(raw) && raw.length <= 30, "补充器材需求格式不正确。"); must(new Set(raw.map(row => row.itemId || row.classificationCode)).size === raw.length, "同一补充器材请合并数量。"); return raw.map(row => { const item = itemRecord(db, row); item.classificationCode = text(item.classificationCode, "分类编号", 60); item.name = text(item.name, "物品名称"); item.spec = text(item.spec, "规格型号"); item.unit = text(item.unit, "单位"); must(itemFitsSubject(item, row.subject || item.subject || "") || !row.subject, "补充器材与实验学科不匹配。"); return { itemId: item.itemId || item.classificationCode, classificationCode: item.classificationCode, name: item.name, spec: item.spec, category: item.category, unit: item.unit, trackingMode: item.trackingMode, maintenanceRequired: item.maintenanceRequired, ...subjectScopeFields(item), qty: num(row.qty, "需求数量", 1, true) }; }); }
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

    function validateResourcePayload(payload, existing = null) {
      const resourceType = choice(payload.resourceType, resourceTypes, "资源类型"), subject = choice(payload.subject, subjects, "学科");
      requireTeacherSubject(subject, payload.term || activeTermId);
      const grades = Array.isArray(payload.grades) ? payload.grades.map(String).filter(Boolean) : String(payload.grades || "").split(",").map(s => s.trim()).filter(Boolean);
      must(grades.length > 0 && grades.length <= 12, "请选择至少一个适用年级。");
      must(grades.every(grade => resourceGrades.includes(grade)), "适用年级不在平台标签范围内。");
      const experimentCategory = choice(payload.experimentCategory, resourceCategories, "实验属性"), title = text(payload.title, "资源名称", 100), description = optional(payload.description, "资源说明", 500);
      const fileKey = String(payload.fileKey || existing?.fileKey || ""), dataUrl = String(payload.dataUrl || existing?.dataUrl || ""), content = String(payload.content || (payload.fileKey ? "" : existing?.content || ""));
      must(fileKey || dataUrl || content || payload.demo === true || existing?.demo === true, "请上传资源文件。");
      const originalName = text(payload.originalName || payload.name || existing?.originalName || title, "文件名", 160), mime = String(payload.mime || existing?.mime || "application/octet-stream"), size = Number(payload.size ?? existing?.size ?? (dataUrl ? Math.round(dataUrl.length * 0.75) : content.length));
      must(Number.isFinite(size) && size >= 0 && size <= 100 * 1024 * 1024, "资源文件不能超过100MB。");
      return { resourceType, subject, grades, experimentCategory, title, description, originalName, mime, size, extension: String(payload.extension || existing?.extension || originalName.split(".").pop() || "").toLowerCase(), fileKey, dataUrl, content };
    }
    if (command === "resource.create") { permit(["admin", "teacher"]); const payload = validateResourcePayload(p), row = { id: id("RES"), school: actor.school, ...payload, uploaderId: actor.id, uploaderName: actor.name, createdAt: now, updatedAt: now, demo: false }; add("resources", row, "上传教学资源"); }
    else if (command === "resource.update") { const row = get("resources"); permit(["admin", "teacher"]); must(row.school === actor.school, "教学资源不属于当前学校。"); must(actor.role === "admin" || row.uploaderId === actor.id, "教师只能修改本人上传的资源。"); const payload = validateResourcePayload(p, row), hasOriginal = !!(payload.fileKey || payload.dataUrl || payload.content); Object.assign(row, payload, { updatedAt: now, demo: hasOriginal ? false : row.demo === true }); log("resources", row, "修改教学资源"); }
    else if (command === "resource.delete") { const row = get("resources"); permit(["admin", "teacher"]); must(row.school === actor.school, "教学资源不属于当前学校。"); must(actor.role === "admin" || row.uploaderId === actor.id, "教师只能删除本人上传的资源。"); requireTeacherSubject(row.subject, p.term || activeTermId); remove("resources", row, "删除教学资源", text(p.reason, "删除原因", 100)); }

    else if (command === "purchase.create") { permit(["admin"]); const row = p.id ? get("purchases") : { id: id("CG"), school: actor.school, applicant: actor.name, state: "待审核" }; if (p.id) state(row, ["待审核"]); row.purpose = text(p.purpose, "采购用途"); row.items = lineItems(p.items).map(({ roomId, nextMaintenance, expiry, ...line }) => line); row.date = date(p.date || TODAY); must(row.date <= TODAY, "申请日期不能晚于当前日期。"); p.id ? log("purchases", row, "修改采购申请") : add("purchases", row, "提交采购申请"); }
    else if (command === "purchase.decide") { permit(["district"]); const row = get("purchases"); state(row, ["待审核"]); row.decision = text(p.reason, "审批意见"); row.state = p.approve === true ? "已通过" : "已驳回"; log("purchases", row, row.state, row.decision); }
    else if (command === "purchase.cancel") { permit(["admin"]); const row = get("purchases"); state(row, ["待审核"]); row.cancelReason = text(p.reason, "撤销原因"); row.state = "已撤销"; log("purchases", row, "撤销申请", row.cancelReason); }
    else if (command === "purchase.delete") { permit(["admin"]); const row = get("purchases"); state(row, ["待审核", "已驳回", "已撤销"]); must(!row.receiptId && !db.receipts.some(receipt => receipt.purchaseId === row.id), "采购申请已有入库单，不能删除。"); must(!hasArchive("purchases", row.id), "采购申请已有附件，不能删除。"); remove("purchases", row, "删除采购申请", text(p.reason, "删除原因", 100)); }
    else if (command === "receipt.create") {
      permit(["admin"]);
      const order = p.purchaseId ? get("purchases", p.purchaseId) : null;
      if (order) state(order, ["已通过"]);
      if (order) must(Array.isArray(p.placements) && p.placements.length === order.items.length, "存放信息须与已审批采购明细逐行对应。");
      const raw = order ? order.items.map((item, index) => ({ ...item, roomId: p.placements[index]?.roomId || "", cabinetId: p.placements[index]?.cabinetId || "", nextMaintenance: p.placements[index]?.nextMaintenance || "", expiry: p.placements[index]?.expiry || "" })) : p.items;
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
            const key = id("ZC"), assetSerial = nextAssetSerial(db, actor.school), asset = { id: key, school: actor.school, itemId: master.itemId || master.classificationCode, classificationCode: master.classificationCode, name: master.name, spec: master.spec, category: master.category, unit: master.unit, trackingMode: master.trackingMode, maintenanceRequired: master.maintenanceRequired, ...subjectScopeFields(master), assetSerial, price: line.price, purchaseDate: receipt.purchaseDate, roomId: line.roomId, ...(line.cabinetId ? { cabinetId: line.cabinetId } : {}), supplier: receipt.supplier, state: requiresReview ? "待库存复核" : line.roomId ? "正常使用" : "待存放", sourceId: receipt.id, pendingReceiptId: requiresReview ? receipt.id : "", nextMaintenance: line.nextMaintenance || "" };
            asset.code = assetCode(db, asset, assetSerial);
            add("assets", asset, requiresReview ? "随整单待库存复核" : line.roomId ? "入库建档" : "入库待分配房间");
          }
          return;
        }
        let stock = db.inventory.find(row => row.school === actor.school && row.itemId === (master.itemId || master.classificationCode) && row.roomId === line.roomId && (row.cabinetId || "") === (line.cabinetId || ""));
        const createdForReceipt = !stock;
        if (stock && expiredHazard(db, stock)) must(stock.stock === 0, `“${master.name}”的过期库存尚未清零，不能与新到货混存。请先完成损耗或处置。`);
        if (!stock) stock = add("inventory", { id: id("HC"), school: actor.school, itemId: master.itemId || master.classificationCode, classificationCode: master.classificationCode, name: master.name, spec: master.spec, category: master.category, unit: master.unit, trackingMode: master.trackingMode, maintenanceRequired: master.maintenanceRequired, ...subjectScopeFields(master), stock: 0, min: 0, unitPrice: line.price, purchaseDate: receipt.purchaseDate, expiry: line.expiry, roomId: line.roomId, ...(line.cabinetId ? { cabinetId: line.cabinetId } : {}), state: line.roomId ? "在库" : "待分配", pendingReceiptId: "", pendingReceiptCreated: false }, "建立库存余额");
        else if (line.expiry) { if (requiresReview && !Object.hasOwn(stock, "pendingReceiptPriorExpiry")) stock.pendingReceiptPriorExpiry = stock.expiry || ""; stock.expiry = stock.stock === 0 ? line.expiry : [stock.expiry, line.expiry].filter(Boolean).sort()[0] || ""; }
        stock.unitPrice = line.price;
        stock.purchaseDate ||= receipt.purchaseDate;
        if (requiresReview) {
          must(!stock.pendingReceiptId || stock.pendingReceiptId === receipt.id, `“${master.name}”已有其他整单入库等待复核。`);
          must(!db.arrangements.some(arrangement => activeArrangement(arrangement) && (arrangement.resources || []).some(resource => resource.ref === stock.id)), `“${master.name}”正在有效实验安排中使用。`);
          if (!stock.pendingReceiptId) stock.pendingReceiptPriorState = stock.state;
          stock.pendingReceiptId = receipt.id;
          stock.pendingReceiptCreated = stock.pendingReceiptCreated || createdForReceipt;
          stock.state = "待库存复核";
        }
        const flow = { id: id("KC"), school: actor.school, itemId: stock.id, kind: "入库", qty: line.qty, date: receipt.date, applicant: actor.name, applicantId: actor.id, reviewer: "", reason: `入库单${receipt.id}`, state: requiresReview ? "待复核" : "已记账", receiptId: receipt.id, arrangementId: "", taskId: "", snapshot: { itemId: master.itemId || master.classificationCode, classificationCode: master.classificationCode, name: master.name, spec: master.spec, category: master.category, unit: master.unit, trackingMode: master.trackingMode, maintenanceRequired: master.maintenanceRequired, ...subjectScopeFields(master), unitPrice: line.price, roomId: line.roomId, ...(line.cabinetId ? { cabinetId: line.cabinetId } : {}), expiry: line.expiry } };
        if (!requiresReview) stockPost(flow);
        add("flows", flow, requiresReview ? "整单库存复核" : "入库记账");
      });
      if (order) { order.state = receipt.state; order.receiptId = receipt.id; log("purchases", order, order.state, receipt.id); } add("receipts", receipt, receipt.state);
    }
    else if (command === "receipt.update") {
      permit(["admin"]); const row = get("receipts"); state(row, ["已入库", "待库存复核"]);
      const businessDate = date(p.date), purchaseDate = date(p.purchaseDate); must(purchaseDate <= businessDate, "购置日期不能晚于登记日期。"); must(businessDate <= TODAY, "登记日期不能晚于当前日期。");
      row.supplier = text(p.supplier, "供应商"); row.date = businessDate; row.purchaseDate = purchaseDate; row.note = optional(p.note, "备注", 500);
      db.assets.filter(asset => asset.sourceId === row.id).forEach(asset => { asset.supplier = row.supplier; asset.purchaseDate = purchaseDate; });
      db.flows.filter(flow => flow.receiptId === row.id).forEach(flow => { flow.date = businessDate; });
      log("receipts", row, "修改入库单信息");
    }
    else if (command === "receipt.delete") {
      permit(["admin"]); const row = get("receipts"); state(row, ["已入库", "待库存复核", "库存复核驳回"]); must(!hasArchive("receipts", row.id), "入库单已有附件，不能删除。");
      const assets = db.assets.filter(asset => asset.sourceId === row.id), assetIds = new Set(assets.map(asset => asset.id));
      must(!db.repairs.some(record => assetIds.has(record.assetId)) && !db.arrangements.some(arrangement => (arrangement.resources || []).some(resource => assetIds.has(resource.ref))) && !db.archives.some(file => file.relatedTable === "assets" && assetIds.has(file.relatedId)), "入库单生成的设备已有维修、报废、实验安排或附件，不能删除。");
      const flows = db.flows.filter(flow => flow.receiptId === row.id), flowIds = new Set(flows.map(flow => flow.id));
      const flowItemIds = new Set(flows.map(flow => flow.itemId));
      must(!db.storageMoves.some(move => assetIds.has(move.assetId) || flowItemIds.has(move.inventoryId)), "入库单生成的资产或库存已有位置调整，不能删除入库单。");
      for (const stockId of new Set(flows.map(flow => flow.itemId))) {
        const stock = get("inventory", stockId);
        must(!db.flows.some(flow => flow.itemId === stock.id && !flowIds.has(flow.id)), `“${itemOf(db, stock).name}”已有其他库存流水，不能删除入库单。`);
      }
      for (const flow of flows) {
        const stock = get("inventory", flow.itemId);
        must(!db.arrangements.some(arrangement => (arrangement.resources || []).some(resource => resource.ref === stock.id)), `“${itemOf(db, stock).name}”已用于实验安排，不能删除入库单。`);
        if (flow.state === "已记账") { must(stock.stock >= flow.qty, `“${itemOf(db, stock).name}”当前结余不足以冲销该入库单。`); stock.stock -= flow.qty; }
        if (stock.pendingReceiptId === row.id) { stock.state = stock.pendingReceiptPriorState || (stock.roomId ? "在库" : "待分配"); if (Object.hasOwn(stock, "pendingReceiptPriorExpiry")) stock.expiry = stock.pendingReceiptPriorExpiry; delete stock.pendingReceiptId; delete stock.pendingReceiptCreated; delete stock.pendingReceiptPriorState; delete stock.pendingReceiptPriorExpiry; }
        log("inventory", stock, "删除入库单并冲销数量", `${row.id}：-${flow.state === "已记账" ? flow.qty : 0}${itemOf(db, stock).unit}`);
      }
      db.flows = db.flows.filter(flow => !flowIds.has(flow.id)); db.assets = db.assets.filter(asset => !assetIds.has(asset.id));
      const stockIds = new Set(flows.map(flow => flow.itemId)); db.inventory = db.inventory.filter(stock => !(stockIds.has(stock.id) && stock.stock === 0 && !db.flows.some(flow => flow.itemId === stock.id) && !db.arrangements.some(arrangement => (arrangement.resources || []).some(resource => resource.ref === stock.id))));
      if (row.purchaseId) { const purchase = find(db, "purchases", row.purchaseId); purchase.state = "已通过"; delete purchase.receiptId; delete purchase.rejectedReceiptId; log("purchases", purchase, "删除入库单，恢复待入库", row.id); }
      remove("receipts", row, "删除入库单", text(p.reason, "删除原因", 100));
    }
    else if (command === "storage.move") {
      permit(["admin"]);
      const kind = choice(p.kind || "inventory", ["asset", "inventory"], "调整对象"), table = kind === "asset" ? "assets" : "inventory", row = get(table), master = itemOf(db, row), fromRoomId = row.roomId || "", fromCabinetId = row.cabinetId || "", roomId = p.roomId || "", cabinetId = p.cabinetId || "", qty = kind === "asset" ? 1 : num(p.qty, "调整数量", 1, true), reason = text(p.reason, "调整原因", 100);
      must(row.state !== "已报废" && !row.pendingReceiptId, "待复核或已报废记录不能调整存放位置。");
      must(fromRoomId !== roomId || fromCabinetId !== cabinetId, "目标存放位置须与当前位置不同。");
      const room = roomId ? sameSchool("rooms", roomId, row.school) : null;
      if (room) must(room.state === "可用" && roomFitsItem(room, master), "请选择符合物品条件的可用房间。");
      if (cabinetId) { const cabinet = sameSchool("cabinets", cabinetId, row.school); must(roomId && cabinet.roomId === roomId && cabinetFitsItem(db, cabinet, master), "请选择目标房间下符合物品条件的启用橱柜。"); }
      if (kind === "asset") {
        must(!db.arrangements.some(arrangement => activeArrangement(arrangement) && (arrangement.resources || []).some(resource => resource.ref === row.id)), "设备已用于有效实验安排，不能调整存放位置。");
        row.roomId = roomId; if (cabinetId) row.cabinetId = cabinetId; else delete row.cabinetId; row.state = roomId ? "正常使用" : "待存放";
      } else {
        must(qty <= Number(row.stock || 0), "调整数量不能超过当前库存。");
        must(!db.flows.some(flow => flow.itemId === row.id && flow.state === "待复核"), "该库存有待复核流水，不能调整位置。");
        let target = db.inventory.find(stock => stock.id !== row.id && stock.school === row.school && stock.itemId === row.itemId && stock.roomId === roomId && (stock.cabinetId || "") === cabinetId);
        if (!target) { target = { ...row, id: id("HC"), stock: 0, roomId, state: roomId ? "在库" : "待分配", ...(cabinetId ? { cabinetId } : {}) }; if (!cabinetId) delete target.cabinetId; add("inventory", target, "建立移柜目标库存"); }
        target.stock += qty; row.stock -= qty;
        if (!row.stock && !row.pendingReceiptId) row.state = row.roomId ? "在库" : "待分配";
        target.state = target.roomId ? "在库" : "待分配";
      }
      const move = { id: id("MOVE"), school: row.school, kind, assetId: kind === "asset" ? row.id : "", inventoryId: kind === "inventory" ? row.id : "", qty, fromRoomId, fromCabinetId, toRoomId: roomId, toCabinetId: cabinetId, reason, operator: actor.name, date: TODAY, state: "已完成" };
      add("storageMoves", move, "调整存放位置");
    }
    else if (command === "asset.edit") {
      permit(["admin"]); const row = get("assets"), master = itemOf(db, row); must(!row.pendingReceiptId && row.state !== "已报废", "待复核或已报废设备不能修改。");
      const roomId = p.roomId || "", cabinetId = p.cabinetId || "", activeUse = db.arrangements.some(arrangement => activeArrangement(arrangement) && (arrangement.resources || []).some(resource => resource.ref === row.id));
      if (activeUse) must(roomId === row.roomId, "设备已用于有效实验安排，不能变更存放位置。");
      if (roomId) { const room = sameSchool("rooms", roomId, row.school); must(room.state === "可用" && roomFitsItem(room, master), "请选择符合设备学科且可用的存放房间。"); }
      if (cabinetId) { const cabinet = sameSchool("cabinets", cabinetId, row.school); must(roomId && cabinet.roomId === roomId && cabinetFitsItem(db, cabinet, master), "请选择当前房间下符合设备条件的启用橱柜。"); }
      const nextMaintenance = p.nextMaintenance || ""; if (nextMaintenance) { must(row.maintenanceRequired, "该设备不需要登记维保日期。"); date(nextMaintenance); }
      row.roomId = roomId; if (cabinetId) row.cabinetId = cabinetId; else delete row.cabinetId; row.nextMaintenance = nextMaintenance; row.state = roomId ? "正常使用" : "待存放"; log("assets", row, "修改设备台账");
    }
    else if (command === "repair.register") {
      permit(["admin", "teacher"]);
      const previous = p.id ? get("repairs") : null;
      if (previous) must(previous.kind === "维修", "只能修改维修登记。");
      const asset = get("assets", p.assetId || previous?.assetId), businessDate = date(p.maintenanceDate), qty = num(p.qty, "维修数量", 1, true), cost = num(p.cost, "维修金额"), vendor = optional(p.vendor, "维修商"), content = optional(p.content, "维修内容", 100);
      must(asset.state !== "已报废", "已报废设备不能登记维修。");
      must(businessDate <= TODAY, "维修日期不能晚于当前日期。");
      const row = previous || { id: id("WX"), school: asset.school, kind: "维修", registeredAt: TODAY, registrar: actor.name };
      Object.assign(row, { assetId: asset.id, qty, cost, maintenanceDate: businessDate, vendor, content, snapshot: referenceSnapshot(db, asset, asset.price) });
      previous ? log("repairs", row, "修改维修登记") : add("repairs", row, "维修登记");
    }
    else if (command === "repair.delete") {
      permit(["admin"]);
      const row = get("repairs"); must(row.kind === "维修", "只能删除维修登记。");
      db.repairs.splice(db.repairs.findIndex(item => item.id === row.id), 1); log("repairs", row, "删除维修登记");
    }
    else if (command === "scrap.register") {
      permit(["admin"]);
      must(Array.isArray(p.assetIds) && p.assetIds.length > 0 && p.assetIds.length <= 30, "请选择1至30台仪器设备。");
      must(new Set(p.assetIds).size === p.assetIds.length, "请勿重复选择仪器设备。");
      const scrapDate = date(p.scrapDate), reason = text(p.reason, "报废原因"), operator = text(p.operator, "经办人", 100), batchId = id("BFP");
      must(scrapDate <= TODAY, "报废日期不能晚于当前日期。");
      const rows = p.assetIds.map(assetId => { const asset = get("assets", assetId); state(asset, ["正常使用"]); must(!db.arrangements.some(arrangement => activeArrangement(arrangement) && (arrangement.resources || []).some(resource => resource.ref === asset.id)), `“${itemOf(db, asset).name}”已有有效实验安排，不能报废。`); return { asset }; });
      rows.forEach(({ asset }) => { const row = { id: id("BF"), school: asset.school, assetId: asset.id, kind: "报废", qty: 1, scrapDate, reason, operator, batchId, snapshot: referenceSnapshot(db, asset, asset.price) }; asset.state = "已报废"; log("assets", asset, "报废登记", row.id); add("repairs", row, "报废登记"); });
      result = { ...db.repairs.find(row => row.batchId === batchId), ids: db.repairs.filter(row => row.batchId === batchId).map(row => row.id) };
    }
    else if (command === "scrap.delete") {
      permit(["admin"]);
      const row = get("repairs"), asset = get("assets", row.assetId); must(row.kind === "报废", "只能删除报废登记。");
      db.repairs.splice(db.repairs.findIndex(item => item.id === row.id), 1);
      if (!db.repairs.some(item => item.kind === "报废" && item.assetId === asset.id)) { asset.state = "正常使用"; log("assets", asset, "删除报废登记，恢复在用", row.id); }
      log("repairs", row, "删除报废登记");
    }
    else if (command === "inventory.save") { permit(["admin"]); const row = p.id ? get("inventory") : { id: id("HC"), school: actor.school, stock: 0, roomId: "", state: "待分配" }, master = itemRecord(db, p.id ? row : p), previousExpiry = row.expiry || ""; master.classificationCode = text(master.classificationCode, "分类编号", 60); master.name = text(master.name, "物品名称"); master.spec = text(master.spec, "规格型号"); master.unit = text(master.unit, "单位"); if (p.id) must(!row.pendingReceiptId, "库存正在等待整单入库复核，不能修改。"); must(master.trackingMode === "QUANTITY", "耗材库存只能登记数量型物品。"); if (p.id) must(row.itemId === master.itemId, "已有库存不能直接更换物品信息。"); Object.assign(row, master, { id: row.id, school: row.school }); row.custodian = text(p.custodian || actor.name, "保管责任人", 100); row.min = num(p.min, "补库阈值"); row.expiry = p.expiry ? date(p.expiry) : ""; if (isHazard(master)) { must(row.expiry, `请登记“${master.name}”的有效期。`); must(row.expiry === previousExpiry || row.expiry >= TODAY, "新登记或更新的危化品库存有效期不能早于当前日期。"); } if (!p.id && p.roomId) { const room = sameSchool("rooms", p.roomId, actor.school); must(room.state === "可用", "存放房间当前不可用。"); must(roomFitsItem(room, master), `“${master.name}”与存放房间学科或存放条件不一致。`); row.roomId = p.roomId; row.state = "在库"; } if (p.cabinetId) { const cabinet = sameSchool("cabinets", p.cabinetId, actor.school); must(row.roomId && cabinet.roomId === row.roomId && cabinetFitsItem(db, cabinet, master), `“${master.name}”与橱柜存放条件不一致。`); row.cabinetId = cabinet.id; } else if (!p.id) delete row.cabinetId; must(!db.inventory.some(stock => stock.id !== row.id && stock.school === row.school && stock.itemId === row.itemId && stock.roomId === row.roomId && (stock.cabinetId || "") === (row.cabinetId || "")), "同一物品在该存放位置已有库存余额。"); p.id ? log("inventory", row, "维护库存阈值") : add("inventory", row, "新增库存档案"); }
    else if (command === "inventory.delete") { permit(["admin"]); const row = get("inventory"); must(!row.pendingReceiptId && row.stock === 0, "只有无待复核且结余为0的库存档案可以删除。"); must(!db.flows.some(flow => flow.itemId === row.id) && !db.arrangements.some(arrangement => (arrangement.resources || []).some(resource => resource.ref === row.id)), "库存已有流水或实验安排，不能删除。"); remove("inventory", row, "删除空库存档案", text(p.reason, "删除原因", 100)); }
    else if (command === "loss.register") {
      permit(["admin"]);
      const stock = get("inventory", p.itemId), master = itemOf(db, stock), qty = num(p.qty, "损耗数量", 1, true), businessDate = date(p.date), reason = text(p.reason, "损耗原因"), operator = text(p.operator, "经办人", 100);
      must(master.category === "耗材", "易耗品损耗登记只能选择耗材。");
      must(!stock.pendingReceiptId, "该易耗品正在等待入库复核，不能登记损耗。");
      must(stock.roomId, "该易耗品尚未登记房间或橱柜，不能登记损耗。");
      must(businessDate <= TODAY, "损耗日期不能晚于当前日期。");
      must(qty <= stock.stock, `库存不足：当前现有数量为${stock.stock}${master.unit}。`);
      const row = { id: id("SH"), school: stock.school, itemId: stock.id, kind: "损耗", qty, date: businessDate, reason, operator, snapshot: referenceSnapshot(db, stock, stock.unitPrice) };
      stockPost(row); delete row.state; add("flows", row, "损耗登记");
    }
    else if (command === "loss.delete") {
      permit(["admin"]);
      const row = get("flows"), stock = get("inventory", row.itemId); must(row.kind === "损耗", "只能删除损耗登记。");
      stock.stock += row.qty; log("inventory", stock, "删除损耗登记，恢复数量", `${row.id}：+${row.qty}${itemOf(db, stock).unit}`);
      db.flows.splice(db.flows.findIndex(item => item.id === row.id), 1); log("flows", row, "删除损耗登记");
    }
    else if (command === "flow.create") {
      permit(["admin", "teacher"]); const stock = get("inventory", p.itemId), master = itemOf(db, stock), kind = choice(p.kind, ["入库", "领用", "损耗", "退回", "处置"], "业务类型"); must(!stock.pendingReceiptId, "库存正在等待整单入库复核，不能办理其他业务。"); if (actor.role === "teacher") must(kind === "领用", "教师只能提交领用申请。"); if (expiredHazard(db, stock)) must(["退回", "损耗", "处置"].includes(kind), "过期危化品只能办理退回、损耗或处置。"); if (kind !== "入库") must(stock.roomId, "物品尚未分配存放房间，不能办理出库或退回。"); if (stock.roomId) { const room = find(db, "rooms", stock.roomId), mayClearStoppedRoom = ["退回", "损耗", "处置"].includes(kind); must(room.school === stock.school && (room.state === "可用" || mayClearStoppedRoom) && roomFitsItem(room, master), "存放房间已停用或不符合存放条件，不能办理该库存业务。"); }
      const qty = num(p.qty, "数量", 1, true), businessDate = date(p.date); let arrangement = null, source = null, taskId = "";
      if (kind === "退回") {
        source = get("flows", p.sourceFlowId); must(source.kind === "领用" && source.state === "已记账" && source.itemId === stock.id, "退回必须关联同一物品的已记账领用单。"); must(!p.arrangementId || p.arrangementId === source.arrangementId, "退回须继承原领用所属实验安排。"); must(!p.taskId || p.taskId === source.taskId, "退回须继承原领用所属计划实验。"); must(businessDate >= source.date, "退回日期不能早于原领用日期。"); const returned = returnedQty(source); must(returned + qty <= source.qty, "退回数量不能超过原领用数量。"); arrangement = source.arrangementId ? get("arrangements", source.arrangementId) : null; taskId = source.taskId || "";
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
    else if (["customExperiment.save", "experiment.custom.save"].includes(command)) {
      permit(["admin", "teacher"]);
      const previous = p.id ? get("customExperiments") : null;
      if (previous) { state(previous, ["启用", "停用"]); must(actor.role === "admin" || previous.createdBy === actor.id || previous.createdBy === actor.name, "教师只能修改本人创建的自定义实验。"); }
      const subject = choice(p.subject, subjects, "学科"), grade = text(p.grade, "适用年级", 30), textbook = p.textbookId ? find(db, "textbooks", p.textbookId) : null;
      if (textbook) must(textbook.subject === subject && textbook.grade === grade, "教材与学科、年级不匹配。");
      requireTeacherSubject(subject, p.term || activeTermId);
      const name = text(p.name, "实验名称", 100), duplicate = db.customExperiments.find(row => row.id !== previous?.id && row.school === actor.school && row.subject === subject && row.grade === grade && row.name === name && row.state !== "停用"); must(!duplicate, "当前学校、学科和年级已有同名自定义实验。");
      const modes = Array.isArray(p.supportedModes) ? p.supportedModes : [p.mode || "分组"]; must(modes.length > 0 && modes.every(mode => implementationModes.includes(mode)), "实验实施方式无效。");
      const requirements = Array.isArray(p.equipmentRequirements) ? p.equipmentRequirements : []; must(requirements.length > 0 && requirements.length <= 30, "创新实验至少登记1项器材需求，最多30项。");
      const equipmentRequirements = requirements.map(row => ({ name: text(row.name || row.equipmentName, "器材名称", 100), spec: optional(row.spec || row.model, "规格型号", 100), unit: text(row.unit || "件", "单位", 20), quantity: num(row.quantity ?? row.qty ?? 1, "数量", 1, true), note: optional(row.note, "器材备注", 200) }));
      const row = previous || { id: id("CX"), school: actor.school, sourceType: "学校自定义", createdBy: actor.id, createdAt: now, state: "启用" };
      Object.assign(row, { name, code: text(p.code || previous?.code || row.id, "实验编号", 60), subject, grade, textbookId: textbook?.id || p.textbookId || "", version: textbook?.version || text(p.version || previous?.version || "校本拓展", "教材版本", 100), sourceType: "学校自定义", experimentCategory: "创新实验", category: "创新实验", mode: modes[0], supportedModes: modes, chapter: optional(p.chapter, "章节", 100), section: optional(p.section, "节", 100), page: optional(p.page, "页码", 30), equipmentRequirements, equipment: equipmentRequirements.map(item => item.name).join("、"), safety: optional(p.safety, "安全提示", 500), note: optional(p.note, "实验说明", 500), updatedAt: now });
      previous ? log("customExperiments", row, "修改自定义创新实验") : add("customExperiments", row, "创建自定义创新实验");
    }
    else if (["customExperiment.delete", "experiment.custom.delete"].includes(command)) {
      permit(["admin", "teacher"]); const row = get("customExperiments"); must(actor.role === "admin" || row.createdBy === actor.id || row.createdBy === actor.name, "教师只能删除本人创建的自定义实验。"); requireTeacherSubject(row.subject, p.term || activeTermId); must(!db.planItems.some(item => item.sourceType === "学校自定义" && item.sourceId === row.id), "该创新实验已编入实验计划，不能删除；请先从计划中移除。"); must(!hasArchive("customExperiments", row.id), "该创新实验已有附件，不能删除。"); remove("customExperiments", row, "删除自定义创新实验", text(p.reason, "删除原因", 100));
    }
    else if (command === "plan.compile") {
      permit(["admin", "teacher"]); const previous = p.id ? get("plans") : null; if (previous) { permit(["admin"]); state(previous, ["已发布"]); }
      const term = find(db, "terms", p.term), subject = choice(p.subject, subjects, "当前学科"), grade = text(p.grade, "适用年级", 30), textbook = find(db, "textbooks", p.textbookId); must(textbook.subject === subject && textbook.grade === grade, "教材与学科、年级不匹配。");
      requireTeacherSubject(subject, term.id);
      const classIds = [...new Set((Array.isArray(p.classIds) ? p.classIds : []).map(String))]; must(classIds.length > 0, "请至少选择一个适用班级。"); classIds.forEach(classId => { const klass = find(db, "classes", classId); must(klass.school === actor.school && klass.grade === grade && klass.state === "在读", "适用班级必须是本校在读班级且与年级一致。"); });
      must(Array.isArray(p.items) && p.items.length > 0 && p.items.length <= 30, "请至少编入1项实验，最多30项。");
      const oldItems = previous ? db.planItems.filter(item => item.planId === previous.id) : [], oldItemIds = new Set(oldItems.map(item => item.id)), oldTasks = previous ? db.teachingTasks.filter(task => oldItemIds.has(task.planItemId)) : [], oldTaskIds = new Set(oldTasks.map(task => task.id));
      if (previous) { const bookings = db.bookings.filter(booking => oldTaskIds.has(booking.taskId)), bookingIds = new Set(bookings.map(booking => booking.id)), arrangements = db.arrangements.filter(arrangement => bookingIds.has(arrangement.bookingId)), arrangementIds = new Set(arrangements.map(arrangement => arrangement.id)); must(!bookings.length && !arrangements.length && !db.summaries.some(summary => arrangementIds.has(summary.arrangementId)) && !db.flows.some(flow => oldTaskIds.has(flow.taskId) || arrangementIds.has(flow.arrangementId)) && !db.archives.some(file => file.relatedTable === "plans" && file.relatedId === previous.id || file.relatedTable === "planItems" && oldItemIds.has(file.relatedId)), "计划已有预约、安排、流水或附件，不能修改；请归档后新建计划。"); must(oldTasks.every(task => ["待预约", "已失效"].includes(task.state)), "计划仍有待处理或已完成的班级实验，不能修改。"); }
      const plan = previous || { id: id("JH"), school: actor.school, state: "已发布", createdBy: actor.id, createdAt: now, publishedAt: now };
      Object.assign(plan, { term: term.id, subject, grade, version: textbook.version, textbookId: textbook.id, targetMode: "EXPLICIT", name: text(p.name, "计划名称", 100) });
      const scopePlans = db.plans.filter(row => row.id !== plan.id && row.school === plan.school && row.term === plan.term && row.subject === subject && row.state === "已发布"); must(!scopePlans.some(row => row.name === plan.name), "当前学校、学期和学科已有同名已发布计划。");
      const scopePlanIds = new Set(scopePlans.map(row => row.id)), scopeItemKeys = new Set(db.planItems.filter(item => scopePlanIds.has(item.planId)).map(item => experimentKey(db, item))), seen = new Set();
      const items = p.items.map(raw => {
        const sourceType = choice(raw.sourceType || "官方目录", experimentSources, "实验来源");
        let source = null;
        if (sourceType === "官方目录") source = db.experimentCatalog.find(row => row.id === raw.sourceId);
        else if (sourceType === "学校自定义") source = db.customExperiments.find(row => row.id === raw.sourceId && row.school === actor.school);
        must(source || sourceType === "历史来源", "请选择有效的实验目录或自定义实验。");
        if (sourceType === "学校自定义") { must(source.state !== "停用" && source.experimentCategory === "创新实验", "自定义实验须为启用的创新实验。"); must(source.subject === subject && source.grade === grade && (!source.textbookId || source.textbookId === textbook.id), "所选自定义实验与当前学科、年级或教材不匹配。"); }
        if (sourceType === "官方目录") must(source.state !== "停用" && source.subject === subject && source.grade === grade && source.textbookId === textbook.id, "所选官方实验与当前学科、年级或教材不匹配。");
        const experimentCategory = source?.experimentCategory || choice(raw.experimentCategory || raw.required || "必做", experimentCategories, "实验属性"), mode = choice(raw.mode || source?.mode || "分组", implementationModes, "实施方式");
        if (source?.supportedModes?.length) must(source.supportedModes.includes(mode), `“${source.name}”不支持${mode}方式。`);
        const scheduleType = choice(raw.scheduleType, ["WEEK", "DATE"], "计划时间类型"); let plannedWeek = null, plannedDate = "";
        if (scheduleType === "WEEK") { plannedWeek = num(raw.plannedWeek, "计划周次", 1, true); must(plannedWeek <= weekOf(term, term.end), "计划周次超出学期。"); } else { plannedDate = date(raw.plannedDate); must(plannedDate >= term.start && plannedDate <= term.end, "计划日期须在当前学期内。"); }
        const snapshot = { school: actor.school, planId: plan.id, sourceId: source?.id || raw.sourceId || "", sourceType, textbookId: textbook.id, subject, grade, version: textbook.version, experimentName: source?.name || text(raw.experimentName, "实验名称", 100), chapter: source?.chapter || text(raw.chapter || "未分章节", "章节", 100), equipment: source?.equipment || text(raw.equipment || "器材由教师现场确认", "器材需求", 1000), equipmentRequirements: equipmentRows(source?.equipmentRequirements || raw.equipmentRequirements, source?.equipment || raw.equipment), periods: Number(source?.periods || raw.periods || 1), required: experimentCategory === "必做" ? "必做" : "选做", experimentCategory, category: experimentCategory, mode, scheduleType, plannedWeek, plannedDate };
        const key = experimentKey(db, snapshot); must(!seen.has(key), "同一计划内不能重复添加相同实验和实施方式。"); must(!scopeItemKeys.has(key), "当前学校、学期和学科的其他已发布计划已包含相同实验和实施方式。"); seen.add(key); return { id: id("JHMZ"), ...snapshot };
      });
      const requiredIds = new Set(db.experimentCatalog.filter(row => row.textbookId === textbook.id && row.experimentCategory === "必做").map(row => row.id)); const includedRequired = new Set(items.filter(item => item.sourceType === "官方目录" && item.experimentCategory === "必做").map(item => item.sourceId)); must([...requiredIds].every(sourceId => includedRequired.has(sourceId)), "当前教材的必做实验必须全部编入计划。");
      if (previous) { db.teachingTasks = db.teachingTasks.filter(task => !oldTaskIds.has(task.id)); db.planItems = db.planItems.filter(item => !oldItemIds.has(item.id)); db.planTargets = db.planTargets.filter(target => target.planId !== previous.id); db.deletedTaskKeys = (db.deletedTaskKeys || []).filter(key => ![...oldItemIds].some(itemId => key.startsWith(`${itemId}|`))); } else db.plans.unshift(plan);
      classIds.forEach(classId => db.planTargets.push({ id: `${plan.id}-${classId}`, school: actor.school, planId: plan.id, classId, grade, state: "启用" })); items.forEach(item => db.planItems.push(item)); items.forEach(item => syncTeachingTasks(db, item.id)); log("plans", plan, previous ? "修改并发布实验计划" : "编制并发布实验计划", `${items.length}项实验，${classIds.length}个班级`);
    }
    else if (command === "plan.create") {
      permit(["admin", "teacher"]); const previous = p.id ? get("plans") : null; if (previous) { permit(["admin"]); state(previous, ["已发布"]); }
      const term = find(db, "terms", p.term), subject = choice(p.subject, subjects, "当前学科"); requireTeacherSubject(subject, term.id); must(Array.isArray(p.items) && p.items.length > 0 && p.items.length <= 30, "请填写1至30项实验计划明细。");
      const oldItems = previous ? db.planItems.filter(item => item.planId === previous.id) : [], oldItemIds = new Set(oldItems.map(item => item.id)), oldTasks = previous ? db.teachingTasks.filter(task => oldItemIds.has(task.planItemId)) : [], oldTaskIds = new Set(oldTasks.map(task => task.id));
      if (previous) { const bookings = db.bookings.filter(booking => oldTaskIds.has(booking.taskId)), bookingIds = new Set(bookings.map(booking => booking.id)), arrangements = db.arrangements.filter(arrangement => bookingIds.has(arrangement.bookingId)), arrangementIds = new Set(arrangements.map(arrangement => arrangement.id)); must(!bookings.length && !arrangements.length && !db.summaries.some(summary => arrangementIds.has(summary.arrangementId)) && !db.flows.some(flow => oldTaskIds.has(flow.taskId) || arrangementIds.has(flow.arrangementId)) && !db.archives.some(file => file.relatedTable === "plans" && file.relatedId === previous.id || file.relatedTable === "planItems" && oldItemIds.has(file.relatedId) || file.relatedTable === "teachingTasks" && oldTaskIds.has(file.relatedId)), "计划已有预约、安排、流水或附件，不能修改；请归档后新建计划。"); must(oldTasks.every(task => ["待预约", "已失效"].includes(task.state)), "计划仍有待处理或已完成的班级实验，不能修改。"); }
      const plan = previous || { id: id("JH"), school: actor.school, state: "已发布", createdBy: actor.id, createdAt: now, publishedAt: now }; Object.assign(plan, { term: term.id, subject, grade: text(p.grade, "适用年级", 30), version: text(p.version, "教材版本", 100), targetMode: Array.isArray(p.classIds) && p.classIds.length ? "EXPLICIT" : (previous?.targetMode || "LEGACY_ALL"), name: text(p.name, "计划名称", 100) });
      const scopePlans = db.plans.filter(row => row.id !== plan.id && row.school === plan.school && row.term === plan.term && row.subject === subject && row.state === "已发布"); must(!scopePlans.some(row => row.name === plan.name), "当前学校、学期和学科已有同名已发布计划。");
      const scopePlanIds = new Set(scopePlans.map(row => row.id)), scopeItemKeys = new Set(db.planItems.filter(item => scopePlanIds.has(item.planId)).map(item => experimentKey(db, item))), seen = new Set(), items = p.items.map(raw => { const experimentName = text(raw.experimentName, "实验名称", 100), chapter = text(raw.chapter, "章节", 100), equipment = text(raw.equipment, "器材需求", 1000), periods = num(raw.periods, "课时", 1, true), experimentCategory = choice(raw.experimentCategory || raw.required || "必做", experimentCategories, "实验属性"), required = experimentCategory === "必做" ? "必做" : "选做", mode = choice(raw.mode || "分组", ["演示", "分组"], "实验类型"), candidate = { school: actor.school, planId: plan.id, experimentName, chapter, equipment, periods, required, experimentCategory, category: experimentCategory, sourceType: "历史来源", mode, grade: plan.grade, version: plan.version, subject }, key = experimentKey(db, candidate); must(!seen.has(key), "同一计划内不能重复添加相同实验和类型。"); must(!scopeItemKeys.has(key), "当前学校、学期和学科的其他已发布计划已包含相同实验和类型。"); seen.add(key); const scheduleType = choice(raw.scheduleType, ["WEEK", "DATE"], "计划时间类型"); let plannedWeek = null, plannedDate = ""; if (scheduleType === "WEEK") { plannedWeek = num(raw.plannedWeek, "计划周次", 1, true); must(plannedWeek <= weekOf(term, term.end), "计划周次超出学期。"); } else { plannedDate = date(raw.plannedDate); must(plannedDate >= term.start && plannedDate <= term.end, "计划日期须在当前学期内。"); } return { id: id("JHMZ"), school: actor.school, planId: plan.id, subject, grade: plan.grade, version: plan.version, experimentName, chapter, equipment, equipmentRequirements: equipmentRows(raw.equipmentRequirements, equipment), periods, required, experimentCategory, category: experimentCategory, sourceType: "历史来源", scheduleType, plannedWeek, plannedDate, mode }; });
      if (previous) { db.teachingTasks = db.teachingTasks.filter(task => !oldTaskIds.has(task.id)); db.planItems = db.planItems.filter(item => !oldItemIds.has(item.id)); db.planTargets = db.planTargets.filter(target => target.planId !== previous.id); db.deletedTaskKeys = (db.deletedTaskKeys || []).filter(key => ![...oldItemIds].some(itemId => key.startsWith(`${itemId}|`))); } else db.plans.unshift(plan);
      if (Array.isArray(p.classIds) && p.classIds.length) p.classIds.forEach(classId => { const klass = find(db, "classes", classId); must(klass.school === actor.school && klass.grade === plan.grade && klass.state === "在读", "适用班级必须是本校在读班级且与年级一致。"); db.planTargets.push({ id: `${plan.id}-${classId}`, school: actor.school, planId: plan.id, classId, grade: klass.grade, state: "启用" }); });
      items.forEach(item => db.planItems.push(item)); items.forEach(item => syncTeachingTasks(db, item.id)); log("plans", plan, previous ? "修改实验计划并重建未开展班级执行记录" : "保存并发布实验计划", `${items.length}项计划实验`);
    }
    else if (command === "plan.archive") { permit(["admin"]); const plan = get("plans"); state(plan, ["已发布"]); const tasks = db.teachingTasks.filter(task => find(db, "planItems", task.planItemId).planId === plan.id); must(!tasks.some(task => ["待安排", "待修改"].includes(task.state)), "计划仍有待处理的班级实验，不能归档。"); tasks.filter(task => ["待预约", "已取消"].includes(task.state)).forEach(task => { task.state = "已失效"; log("teachingTasks", task, "计划归档，未开展班级执行记录失效", plan.id); }); plan.state = "已归档"; log("plans", plan, "归档计划"); }
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
      must(!tasks.some(task => !["待预约", "已失效"].includes(task.state)) && !bookings.length && !arrangements.length && !summaries.length && !flows.length && !archives.length, "计划已有预约、安排、总结、流水、附件或待处理实验，不能删除；请改用归档。");
      const reason = text(p.reason, "删除原因", 100);
      log("plans", plan, "删除实验计划", reason);
      tasks.forEach(task => log("teachingTasks", task, "随计划删除", plan.id));
      db.teachingTasks = db.teachingTasks.filter(task => !taskIds.has(task.id));
      db.planItems = db.planItems.filter(item => !itemIds.has(item.id));
      db.planTargets = db.planTargets.filter(target => target.planId !== plan.id);
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
      must(!bookings.length && !arrangements.length && !flows.length && !archives.length, "班级执行记录已有预约、安排、流水或附件，不能删除；请保留历史记录。");
      const reason = text(p.reason, "删除原因", 100);
      log("teachingTasks", task, "删除班级执行记录", reason);
      db.deletedTaskKeys ||= [];
      const suppressionKey = `${task.planItemId}|${task.assignmentId}`;
      if (!db.deletedTaskKeys.includes(suppressionKey)) db.deletedTaskKeys.push(suppressionKey);
      db.teachingTasks = db.teachingTasks.filter(row => row.id !== task.id);
      result = task;
    }
    else if (command === "booking.create") {
      permit(["admin", "teacher"]); const task = get("teachingTasks", p.taskId), context = taskContext(db, task); state(task, ["待预约", "已取消"]); must(context.assignment.state === "有效" && context.assignment.primary && context.plan.state === "已发布" && context.klass.state === "在读", "主教师任课关系、班级或计划已失效。"); if (actor.role === "teacher") must(task.teacherId === actor.id, "只能预约本人任课班级实验。"); const booking = { id: id("YY"), school: task.school, taskId: task.id, planItemId: task.planItemId, assignmentId: task.assignmentId, classId: task.classId, teacherId: task.teacherId, studentCount: context.klass.students, applicant: actor.name, applicantId: actor.id, submittedAt: now, requestedDate: date(p.requestedDate), requestedPeriod: num(p.requestedPeriod, "申请节次", 1, true), groups: context.item.mode === "分组" ? num(p.groups, "分组数", 1, true) : null, requestedResources: requestRows(p.requestedResources || []), note: optional(p.note, "备注", 100), state: "待安排" };
      validateBookingRequest(booking, context); must(!db.bookings.some(row => row.taskId === task.id && activeBooking(row)), "该计划实验在本班已有有效预约。"); task.state = "待安排"; log("teachingTasks", task, "提交预约", booking.id); add("bookings", booking, "提交实验预约");
    }
    else if (command === "booking.arrange") {
      permit(["admin"]); const booking = get("bookings"); state(booking, ["待安排"]); const arrangement = { id: id("AP"), school: booking.school, bookingId: booking.id, venueType: choice(p.venueType, ["实验室", "教室", "其他"], "地点类型"), roomId: p.roomId || "", venueText: optional(p.venueText, "其他地点说明", 100), scheduledDate: date(p.scheduledDate), startPeriod: p.startPeriod, endPeriod: p.endPeriod, technicianId: p.technicianId, note: optional(p.note, "安排说明", 100), resources: p.resources || [], state: "已安排", arrangedBy: actor.id, arrangedAt: now }; arrangementCheck(arrangement); booking.state = "已安排"; const task = find(db, "teachingTasks", booking.taskId); task.state = "已安排"; db.arrangements.unshift(arrangement); log("bookings", booking, "管理员完成实验安排", arrangement.id); log("teachingTasks", task, "已安排", arrangement.id); log("arrangements", arrangement, "确认安排");
    }
    else if (command === "arrangement.update") {
      permit(["admin"]); const row = get("arrangements"); state(row, ["已安排"]); must(!db.summaries.some(summary => summary.arrangementId === row.id), "实验安排已有总结，不能修改。"); const candidate = { ...row, venueType: choice(p.venueType, ["实验室", "教室", "其他"], "地点类型"), roomId: p.roomId || "", venueText: optional(p.venueText, "其他地点说明", 100), scheduledDate: date(p.scheduledDate), startPeriod: p.startPeriod, endPeriod: p.endPeriod, technicianId: p.technicianId, note: optional(p.note, "安排说明", 100), resources: p.resources || [] }; arrangementCheck(candidate, row.id); Object.assign(row, candidate); log("arrangements", row, "修改实验安排");
    }
    else if (command === "booking.return") { permit(["admin"]); const booking = get("bookings"); state(booking, ["待安排"]); booking.returnReason = text(p.reason, "退回原因"); booking.state = "已退回"; find(db, "teachingTasks", booking.taskId).state = "待修改"; log("bookings", booking, "退回修改", booking.returnReason); }
    else if (command === "booking.resubmit") { permit(["admin", "teacher"]); const booking = get("bookings"), previousState = booking.state; state(booking, ["待安排", "已退回"]); must(actor.role !== "teacher" || booking.teacherId === actor.id, "只能修改本人预约。"); const context = taskContext(db, booking.taskId); must(context.assignment.state === "有效" && context.assignment.primary && context.plan.state === "已发布" && context.klass.state === "在读", "主教师任课关系、班级或计划已失效。"); booking.requestedDate = date(p.requestedDate); booking.requestedPeriod = num(p.requestedPeriod, "申请节次", 1, true); booking.groups = context.item.mode === "分组" ? num(p.groups, "分组数", 1, true) : null; booking.studentCount = context.klass.students; booking.requestedResources = requestRows(p.requestedResources ?? booking.requestedResources ?? []); booking.note = optional(p.note, "备注", 100); validateBookingRequest(booking, context, booking.id); booking.state = "待安排"; find(db, "teachingTasks", booking.taskId).state = "待安排"; log("bookings", booking, previousState === "已退回" ? "修改后重新提交" : "修改实验预约"); }
    else if (command === "booking.delete") { permit(["admin"]); const row = get("bookings"); state(row, ["待安排", "已退回", "已取消"]); must(!db.arrangements.some(arrangement => arrangement.bookingId === row.id) && !db.flows.some(flow => flow.taskId === row.taskId) && !hasArchive("bookings", row.id), "预约已有安排、库存流水或附件，不能删除。"); const task = find(db, "teachingTasks", row.taskId), context = taskContext(db, task); task.state = context.plan.state === "已发布" && context.assignment.state === "有效" && context.klass.state === "在读" ? "待预约" : "已失效"; log("teachingTasks", task, "删除预约后恢复任务", row.id); remove("bookings", row, "删除实验预约", text(p.reason, "删除原因", 100)); }
    else if (command === "booking.summary") {
      permit(["admin", "teacher"]); const arrangement = get("arrangements", p.id); state(arrangement, ["已安排"]); const booking = find(db, "bookings", arrangement.bookingId), task = find(db, "teachingTasks", booking.taskId); must(actor.role !== "teacher" || booking.teacherId === actor.id, "只能登记本人实验总结。"); must(!db.summaries.some(summary => summary.arrangementId === arrangement.id), "该实验安排已提交总结。"); (arrangement.resources || []).filter(resource => db.inventory.some(stock => stock.id === resource.ref)).forEach(resource => { must(netIssued(arrangement.id, resource.ref) >= resource.qty, "安排中的耗材须先完成关联领用并记账，才能提交总结。"); }); const actualDate = date(p.actualDate || arrangement.scheduledDate); must(actualDate >= arrangement.scheduledDate && actualDate <= TODAY, "实际完成日期不能早于安排日期或晚于统计日期。"); const summary = { id: id("SYZJ"), school: booking.school, arrangementId: arrangement.id, actualDate, effect: text(p.effect, "实验效果"), improvement: optional(p.improvement, "改进意见", 500), equipmentCondition: text(p.equipmentCondition, "仪器完好情况"), note: optional(p.note, "备注", 500), submittedBy: actor.id, submittedAt: now };
      [["OVERVIEW", p.overviewImages || [], 2, "实验全景图"], ["STUDENT", p.studentImages || [], 3, "学生实验图"]].forEach(([type, files, max, label]) => { must(Array.isArray(files) && files.length <= max, `${label}最多${max}张。`); files.forEach(file => { const name = text(file.name, "图片文件名", 120), dataUrl = String(file.dataUrl || ""); must(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(dataUrl) && dataUrl.length <= 300000, `${label}格式或大小不符合要求。`); db.archives.push({ id: id("FILE"), school: booking.school, name, category: "实验教学", relatedTable: "summaries", relatedId: summary.id, attachmentType: type, date: actualDate, uploader: actor.name, state: "已归档", mime: file.mime || "image/jpeg", dataUrl, content: "" }); }); });
      db.summaries.unshift(summary); arrangement.state = "已完成"; arrangement.completedAt = actualDate; booking.state = "已完成"; task.state = "已完成"; log("bookings", booking, "实验已完成", summary.id); log("arrangements", arrangement, "提交实验总结并完成", summary.id); log("teachingTasks", task, "班级执行完成", summary.id); log("summaries", summary, "提交实验总结");
    }
    else if (command === "summary.update") {
      permit(["admin", "teacher"]); const row = get("summaries"), arrangement = find(db, "arrangements", row.arrangementId), booking = find(db, "bookings", arrangement.bookingId); must(actor.role !== "teacher" || booking.teacherId === actor.id, "只能修改本人实验总结。"); const actualDate = date(p.actualDate); must(actualDate >= arrangement.scheduledDate && actualDate <= TODAY, "实际完成日期不能早于安排日期或晚于统计日期。"); row.actualDate = actualDate; row.effect = text(p.effect, "实验效果"); row.improvement = optional(p.improvement, "改进意见", 500); row.equipmentCondition = text(p.equipmentCondition, "仪器完好情况"); row.note = optional(p.note, "备注", 500); arrangement.completedAt = actualDate; log("summaries", row, "修改实验总结");
    }
    else if (command === "summary.delete") {
      permit(["admin"]); const row = get("summaries"), arrangement = find(db, "arrangements", row.arrangementId), booking = find(db, "bookings", arrangement.bookingId), task = find(db, "teachingTasks", booking.taskId), files = db.archives.filter(file => file.relatedTable === "summaries" && file.relatedId === row.id); must(files.every(file => ["OVERVIEW", "STUDENT"].includes(file.attachmentType)), "实验总结已有独立业务附件，不能删除。"); db.archives = db.archives.filter(file => !(file.relatedTable === "summaries" && file.relatedId === row.id)); arrangement.state = "已安排"; delete arrangement.completedAt; booking.state = "已安排"; task.state = "已安排"; log("arrangements", arrangement, "删除总结后恢复已安排", row.id); log("bookings", booking, "删除总结后恢复已安排", row.id); log("teachingTasks", task, "删除总结后恢复已安排", row.id); remove("summaries", row, "删除实验总结", text(p.reason, "删除原因", 100));
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
    else if (command === "task.create") {
      permit(["district"]);
      const row = p.id ? get("tasks") : { id: id("JCJH"), state: "待检查" };
      if (p.id) state(row, ["待检查"]);
      const context = safetyContext(db, { ...row, ...p });
      Object.assign(row, context, { sourceType: "district", createdBy: row.createdBy || actor.id, kind: text(p.kind, "检查类型"), due: date(p.due), owner: text(p.owner, "责任人") });
      p.id ? log("tasks", row, "修改检查任务") : add("tasks", row, "下发检查任务");
    }
    else if (command === "inspection-task.delete") { permit(["district"]); const row = get("tasks"); state(row, ["待检查"]); must(!row.checkId && !db.checks.some(check => check.taskId === row.id) && !hasArchive("tasks", row.id), "检查任务已有检查记录或附件，不能删除。"); remove("tasks", row, "删除检查任务", text(p.reason, "删除原因", 100)); }
    else if (command === "check.create") {
      permit(["admin"]);
      const task = p.taskId ? get("tasks", p.taskId) : null;
      if (task) state(task, ["待检查"]);
      const context = task ? safetyContext(db, task, actor.school) : safetyContext(db, p, actor.school), outcome = choice(p.result, ["正常", "发现隐患"], "检查结果"), row = { id: id("JC"), ...context, taskId: task?.id || "", kind: task?.kind || text(p.kind, "类型"), date: date(p.date), inspector: actor.name, inspectorId: actor.id, items: text(p.items, "检查项目"), result: outcome, note: optional(p.note, "检查说明", 500) };
      add("checks", row, "提交检查记录");
      if (task) { task.checkId = row.id; log("tasks", task, outcome === "正常" ? "检查完成" : "检查发现隐患", row.id); }
      if (outcome === "发现隐患") {
        const due = date(p.due); must(due >= row.date, "整改期限不能早于检查日期。");
        const titles = String(p.title || "").split(/[\n；;]+/).map(title => title.trim()).filter(Boolean); must(titles.length > 0, "请填写至少一项隐患描述。");
        titles.forEach(title => add("hazards", { id: id("YH"), ...context, checkId: row.id, title: text(title, "隐患描述"), owner: text(p.owner, "责任人"), level: choice(p.level, ["一般关注", "需优先处理"], "优先级"), due, date: row.date, state: "待整改", note: row.note, reviewHistory: [], submissionHistory: [] }, "检查发现隐患"));
      }
      syncSafetyTask(db, row); result = row;
    }
    else if (command === "check.update") {
      permit(["admin"]);
      const row = get("checks"); must(!db.hazards.some(hazard => hazard.checkId === row.id), "检查记录已形成隐患，请在隐患记录中修改整改信息。");
      const task = row.taskId ? find(db, "tasks", row.taskId) : null, context = task ? safetyContext(db, task, actor.school) : safetyContext(db, { ...row, ...p }, actor.school), outcome = choice(p.result, ["正常", "发现隐患"], "检查结果");
      Object.assign(row, context, { kind: task?.kind || text(p.kind, "类型"), date: date(p.date), items: text(p.items, "检查项目"), result: outcome, note: optional(p.note, "检查说明", 500) });
      log("checks", row, "修改检查记录");
      if (task) { task.checkId = row.id; log("tasks", task, outcome === "正常" ? "检查完成" : "检查发现隐患", row.id); }
      if (outcome === "发现隐患") {
        const due = date(p.due); must(due >= row.date, "整改期限不能早于检查日期。");
        const titles = String(p.title || "").split(/[\n；;]+/).map(title => title.trim()).filter(Boolean); must(titles.length > 0, "请填写至少一项隐患描述。");
        titles.forEach(title => add("hazards", { id: id("YH"), ...context, checkId: row.id, title: text(title, "隐患描述"), owner: text(p.owner, "责任人"), level: choice(p.level, ["一般关注", "需优先处理"], "优先级"), due, date: row.date, state: "待整改", note: row.note, reviewHistory: [], submissionHistory: [] }, "检查修改后形成隐患"));
      }
      syncSafetyTask(db, row); result = row;
    }
    else if (command === "check.delete") { permit(["admin"]); const row = get("checks"); must(!db.hazards.some(hazard => hazard.checkId === row.id) && !hasArchive("checks", row.id), "检查记录已有隐患或附件，不能删除。"); if (row.taskId) { const task = find(db, "tasks", row.taskId); task.state = "待检查"; delete task.checkId; log("tasks", task, "删除检查记录后恢复待检查", row.id); } remove("checks", row, "删除检查记录", text(p.reason, "删除原因", 100)); }
    else if (command === "hazard.update") { permit(["admin"]); const row = get("hazards"); state(row, ["待整改", "整改中"]); row.title = text(p.title, "隐患描述"); row.owner = text(p.owner, "责任人"); row.level = choice(p.level, ["一般关注", "需优先处理"], "优先级"); row.due = date(p.due); must(row.due >= row.date, "整改期限不能早于检查日期。"); row.note = optional(p.note, "说明", 500); log("hazards", row, "修改隐患信息"); }
    else if (command === "hazard.delete") { permit(["admin"]); const row = get("hazards"); state(row, ["待整改"]); must(!row.attachmentId && !hasArchive("hazards", row.id), "隐患已有整改附件，不能删除。"); const check = find(db, "checks", row.checkId); remove("hazards", row, "删除隐患记录", text(p.reason, "删除原因", 100)); if (!db.hazards.some(hazard => hazard.checkId === check.id)) { check.result = "正常"; log("checks", check, "删除隐患后更正检查结果为正常", row.id); if (check.taskId) { const task = find(db, "tasks", check.taskId); task.state = "已完成"; log("tasks", task, "删除隐患后完成检查", row.id); } } result = row; }
    else if (command === "hazard.submit") {
      permit(["admin"]);
      const row = get("hazards"); state(row, ["待整改", "整改中"]);
      const rectification = text(p.reason, "整改说明"), file = get("archives", p.attachmentId);
      must(file.relatedTable === "hazards" && file.relatedId === row.id, "请选择关联当前隐患的整改附件。");
      Object.assign(row, { rectification, attachmentId: file.id, submitterId: actor.id, submitterName: actor.name, submittedAt: now, state: "待校内复核" });
      row.submissionHistory ||= [];
      row.submissionHistory.push({ submitterId: actor.id, submitterName: actor.name, at: now, rectification, attachmentId: file.id });
      syncSafetyTask(db, find(db, "checks", row.checkId));
      log("hazards", row, "提交校内复核", rectification);
    }
    else if (command === "hazard.schoolReview") {
      permit(["admin"]);
      const row = get("hazards"); state(row, ["待校内复核"]);
      const approve = p.approve === true, review = text(p.reason, "校内复核意见");
      row.reviewHistory ||= [];
      row.reviewHistory.push({ stage: "school", approve, result: approve ? "通过" : "驳回", reason: review, reviewerId: actor.id, reviewerName: actor.name, at: now });
      Object.assign(row, { reviewStage: "school", review, reviewer: actor.name, reviewerId: actor.id, reviewedAt: now, state: approve ? "待区级复查" : "整改中" });
      syncSafetyTask(db, find(db, "checks", row.checkId));
      log("hazards", row, approve ? "校内复核通过" : "校内复核驳回", review);
    }
    else if (command === "hazard.verify") {
      permit(["district"]);
      const row = get("hazards"); state(row, ["待区级复查"]);
      const approve = p.approve === true, review = text(p.reason, "区级复查意见");
      row.reviewHistory ||= [];
      row.reviewHistory.push({ stage: "district", approve, result: approve ? "通过" : "驳回", reason: review, reviewerId: actor.id, reviewerName: actor.name, at: now });
      Object.assign(row, { reviewStage: "district", review, reviewer: actor.name, reviewerId: actor.id, reviewedAt: now, state: approve ? "已关闭" : "整改中" });
      syncSafetyTask(db, find(db, "checks", row.checkId));
      log("hazards", row, approve ? "区级复查通过并关闭" : "区级复查驳回", review);
    }
    else if (command === "archive.create") { permit(["admin", "teacher"]); const table = choice(p.relatedTable, ["assets", "purchases", "repairs", "plans", "bookings", "arrangements", "summaries", "checks", "hazards", "staff", "receipts"], "关联业务"), linked = get(table, p.relatedId); if (actor.role === "teacher") { const canSeePlan = table === "plans" && (linked.createdBy === actor.id || db.teachingTasks.some(task => task.teacherId === actor.id && find(db, "planItems", task.planItemId).planId === linked.id)), allowed = table === "staff" && linked.id === actor.id || linked.teacherId === actor.id || linked.reporter === actor.name || canSeePlan || table === "arrangements" && find(db, "bookings", linked.bookingId).teacherId === actor.id || table === "summaries" && find(db, "bookings", find(db, "arrangements", linked.arrangementId).bookingId).teacherId === actor.id; must(allowed, "教师只能上传本人业务资料。"); } const name = text(p.name, "文件名"); must(!/\.(html?|svg|js|exe|sh)$/i.test(name), "不接受可执行文件、HTML或SVG附件。"); const content = String(p.content || ""), dataUrl = String(p.dataUrl || ""); must(content || /^data:[\w.+/-]+;base64,[A-Za-z0-9+/=]+$/.test(dataUrl), "请上传文件或填写文本内容。"); must(content.length + dataUrl.length <= 750000, "单个附件限512KB左右。"); add("archives", { id: id("FILE"), school: actor.school, name, category: choice(p.category, ["实验教学", "安全管理", "人员档案", "设备建设"], "资料分类"), relatedTable: table, relatedId: linked.id, attachmentType: p.attachmentType || "OTHER", date: TODAY, uploader: actor.name, state: p.archive === true ? "已归档" : "待归档", mime: String(p.mime || "text/plain;charset=utf-8"), content, dataUrl }, "上传业务资料"); }
    else if (command === "archive.confirm") { permit(["admin"]); const row = get("archives"); state(row, ["待归档"]); row.state = "已归档"; log("archives", row, "确认归档"); }
    else if (command === "archive.update") { permit(["admin"]); const row = get("archives"); state(row, ["待归档"]); row.name = text(p.name, "文件名"); must(!/\.(html?|svg|js|exe|sh)$/i.test(row.name), "不接受可执行文件、HTML或SVG附件。"); row.category = choice(p.category, ["实验教学", "安全管理", "人员档案", "设备建设"], "资料分类"); if (!row.dataUrl) { row.content = text(p.content, "文本附件内容", 750000); row.mime = "text/plain;charset=utf-8"; } log("archives", row, "修改待归档资料"); }
    else if (command === "archive.delete") { permit(["admin"]); const row = get("archives"); state(row, ["待归档"]); must(!db.hazards.some(hazard => hazard.attachmentId === row.id || (hazard.submissionHistory || []).some(item => item.attachmentId === row.id)), "附件已用于隐患整改，不能删除。"); remove("archives", row, "删除待归档资料", text(p.reason, "删除原因", 100)); }
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
        if (tasks.length) must(term.id === row.term && klass.id === row.classId && subject === row.subject && teacher.id === row.teacherId && primary === row.primary, "该任课班级已用于实验计划执行，请新建设置，不要改班级、学科、教师或主教师属性。");
        if (nextState === "停用") { must(!tasks.some(task => ["待安排", "待修改"].includes(task.state)), "该任课班级仍有待处理实验，不能停用。"); tasks.filter(task => ["待预约", "已取消"].includes(task.state)).forEach(task => { task.state = "已失效"; }); }
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
      const table = choice(p.table, ["schools", "departments", "staff", "rooms", "cabinets", "classes", "assignments", "terms", "periods"], "基础数据"); permit(["district", "admin"]); if (["schools", "terms"].includes(table)) permit(["district"]); const row = p.id ? get(table) : { id: id(table.toUpperCase()) }, school = ["departments", "staff", "rooms", "cabinets", "classes", "assignments", "periods"].includes(table) ? row.school || (actor.role === "district" ? text(p.school, "学校") : actor.school) : ""; if (school) { find(db, "schools", school); row.school = school; }
      if (table === "schools") { row.name = text(p.name, "学校名称"); row.code = text(p.code, "学校代码"); must(!db.schools.some(s => s.id !== row.id && s.code === row.code), "学校代码已存在。"); row.stage = text(p.stage, "学段"); delete row.street; }
      if (table === "departments") { row.name = text(p.name, "部门名称"); row.state = choice(p.state || "启用", ["启用", "停用"], "状态"); must(!db.departments.some(d => d.id !== row.id && d.school === school && d.name === row.name), "同校部门名称已存在。"); }
      if (table === "terms") { const start = date(p.start), end = date(p.end), used = p.id && db.plans.some(plan => plan.term === row.id); if (used) must(start === row.start && end === row.end, "学期已被计划引用，不能修改起止日期。"); row.name = text(p.name, "学期名称"); row.start = start; row.end = end; must(row.end > row.start, "学期结束须晚于开始日期。"); }
      if (table === "staff") { const previous = p.id ? find(original, "staff", p.id) : null, assignmentRefs = p.id ? db.assignments.filter(a => a.teacherId === row.id) : [], hasTaskRefs = p.id && db.teachingTasks.some(task => task.teacherId === row.id); row.name = text(p.name, "姓名"); row.role = choice(p.role, ["admin", "teacher"], "角色"); row.subject = text(p.subject, "专业或任教学科"); row.title = text(p.title, "岗位职称"); row.phone = optional(p.phone, "手机号码", 30); row.qualification = optional(p.qualification, "资质说明", 200); row.sex = choice(p.sex || "", ["", "男", "女"], "性别"); row.departmentId = p.departmentId ? sameSchool("departments", p.departmentId, school).id : ""; row.enabled = p.enabled !== false; must(row.id !== actor.id || row.enabled && row.role === actor.role, "不能停用或变更当前操作账号身份。"); if (previous && (assignmentRefs.length || hasTaskRefs)) must(row.role === previous.role && row.subject === previous.subject, "该人员已用于任课或实验计划执行，不能变更角色或学科。"); const activeAssignments = assignmentRefs.filter(a => a.state === "有效"); must(activeAssignments.every(a => row.enabled && row.role === "teacher" && (row.subject === a.subject || row.subject === "综合")), "该人员仍有与账号状态、角色或学科不兼容的有效任课关系。"); }
      if (table === "rooms") { const type = choice(p.type, ["教学实验室", "准备室", "仪器室", "普通教室", "其他"], "类型"), subject = p.subject ? choice(p.subject, subjects, "学科") : "", seats = optionalNum(p.seats, "座位数", 1, true), nextState = choice(p.state || row.state || "可用", ["可用", "停用"], "状态"), hazardStorage = p.hazardStorage === true, activeUse = p.id && db.arrangements.some(arrangement => arrangement.roomId === row.id && activeArrangement(arrangement)), stored = p.id && (db.assets.some(asset => asset.roomId === row.id) || db.inventory.some(stock => stock.roomId === row.id)), storedHazard = p.id && db.inventory.some(stock => stock.roomId === row.id && isHazard(itemOf(db, stock))); must(!["教学实验室", "准备室", "仪器室"].includes(type) || subject, "教学实验室、准备室和仪器室须选择学科。"); if (activeUse) { must(type === row.type && subject === row.subject && seats === row.seats, "房间有有效实验安排，不能修改类型、学科或座位数。"); must(nextState === "可用", "房间有有效实验安排，不能停用。"); } if (stored) must(subject === row.subject, "房间已存放物品，不能直接修改学科。"); if (storedHazard) must(hazardStorage, "房间仍存放危化品，不能取消危化品存放条件。"); row.name = text(p.name, "名称"); row.roomNo = text(p.roomNo, "房间号", 60); row.type = type; row.subject = subject; row.area = optionalNum(p.area, "实际使用面积", .01); row.seats = seats; row.builder = optional(p.builder, "建造商"); row.builtAt = p.builtAt ? date(p.builtAt) : ""; row.stage = optional(p.stage || find(db, "schools", school).stage, "所属学段", 60); row.features = optional(p.features, "设施功能", 500); row.hazardStorage = hazardStorage; row.note = optional(p.note, "备注", 60); row.state = nextState; must(!db.rooms.some(room => room.id !== row.id && room.school === school && room.roomNo === row.roomNo), "同校房间号已存在。"); }
      if (table === "cabinets") { const room = sameSchool("rooms", p.roomId, school), nextState = choice(p.state || row.state || "启用", ["启用", "停用"], "橱柜状态"), code = text(p.code, "橱柜编号", 60), nameValue = text(p.name, "橱柜名称", 100), type = choice(p.type || "其他", ["仪器柜", "耗材柜", "危化品专用柜", "其他"], "橱柜类型"), hazardStorage = p.hazardStorage === true; must(room.state === "可用" || nextState === "停用", "橱柜所属房间不可用，不能启用橱柜。"); if (hazardStorage) must(room.hazardStorage === true, "危化品专用柜所属房间须具备危化品存放条件。"); const stored = p.id && (db.assets.some(asset => asset.cabinetId === row.id) || db.inventory.some(stock => stock.cabinetId === row.id)); if (stored) must(room.id === row.roomId, "橱柜已有存放物品，不能直接更换所属房间。"); row.roomId = room.id; row.code = code; row.name = nameValue; row.type = type; row.state = nextState; row.custodianId = p.custodianId ? sameSchool("staff", p.custodianId, school).id : ""; row.hazardStorage = hazardStorage; row.note = optional(p.note, "备注", 200); must(!db.cabinets.some(cabinet => cabinet.id !== row.id && cabinet.school === school && cabinet.code === code), "同校橱柜编号已存在。"); }
      if (table === "classes") { const grade = text(p.grade, "年级"), students = num(p.students, "班级人数", 1, true), nextState = choice(p.state || "在读", ["在读", "停用"], "状态"), tasks = p.id ? db.teachingTasks.filter(task => task.classId === row.id) : []; if (tasks.length) must(grade === row.grade, "班级已有实验计划执行记录，不能修改年级。"); if (nextState === "停用") { must(!tasks.some(task => ["待安排", "待修改"].includes(task.state)), "班级仍有待处理实验，不能停用。"); tasks.filter(task => ["待预约", "已取消"].includes(task.state)).forEach(task => { task.state = "已失效"; }); } row.name = text(p.name, "班级名称"); must(!db.classes.some(klass => klass.id !== row.id && klass.school === school && klass.name === row.name), "同校班级名称已存在。"); row.grade = grade; row.students = students; row.state = nextState; }
      if (table === "assignments") { const term = find(db, "terms", p.term), klass = sameSchool("classes", p.classId, school), teacher = sameSchool("staff", p.teacherId, school), subject = choice(p.subject, subjects, "学科"), primary = p.primary !== false, nextState = choice(p.state || "有效", ["有效", "停用"], "状态"), tasks = p.id ? db.teachingTasks.filter(task => task.assignmentId === row.id) : []; must(teacher.enabled && teacher.role === "teacher", "请选择启用的任课教师。"); must(teacher.subject === subject || teacher.subject === "综合", "任课学科须与教师专业学科一致；综合教师可跨学科任教。"); if (tasks.length) must(term.id === row.term && klass.id === row.classId && subject === row.subject && teacher.id === row.teacherId && primary === row.primary, "任课关系已用于实验计划执行，请新建关系，不要改班级、学科、教师或主教师属性。"); if (nextState === "停用") { must(!tasks.some(task => ["待安排", "待修改"].includes(task.state)), "任课关系仍有待处理实验，不能停用。"); tasks.filter(task => ["待预约", "已取消"].includes(task.state)).forEach(task => { task.state = "已失效"; }); } row.name = `${klass.name} · ${subject} · ${teacher.name}`; row.term = term.id; row.classId = klass.id; row.subject = subject; row.teacherId = teacher.id; row.primary = primary; row.state = nextState; must(!db.assignments.some(a => a.id !== row.id && a.term === row.term && a.classId === row.classId && a.subject === row.subject && a.teacherId === row.teacherId && a.state === "有效"), "该任课关系已存在。"); if (row.primary && row.state === "有效") must(!db.assignments.some(a => a.id !== row.id && a.term === row.term && a.classId === row.classId && a.subject === row.subject && a.primary && a.state === "有效"), "同一学期、班级和学科只能有一个主教师。"); }
      if (table === "periods") { const term = find(db, "terms", p.term || row.term || db.terms.find(item => item.start <= TODAY && TODAY <= item.end)?.id || db.terms[0]?.id), referenceTerm = row.term || term.id, number = num(p.number, "节次", 1, true), start = text(p.start, "开始时间"), end = text(p.end, "结束时间"), nextState = choice(p.state || "启用", ["启用", "停用"], "状态"), bookingUses = booking => booking.school === school && find(db, "teachingTasks", booking.taskId).term === referenceTerm && Number(booking.requestedPeriod) === row.number, arrangementUses = arrangement => { const booking = find(db, "bookings", arrangement.bookingId); return arrangement.school === school && find(db, "teachingTasks", booking.taskId).term === referenceTerm && Number(arrangement.startPeriod) <= row.number && row.number <= Number(arrangement.endPeriod); }, used = p.id && (db.bookings.some(bookingUses) || db.arrangements.some(arrangementUses)); if (used) must(term.id === row.term && number === row.number && start === row.start && end === row.end && nextState === row.state, "节次已被预约或安排引用，不能修改学期、编号、时间或状态。"); row.name = text(p.name || `第${number}节`, "节次名称"); row.term = term.id; row.number = number; row.start = start; row.end = end; must(/^([01]\d|2[0-3]):[0-5]\d$/.test(row.start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(row.end) && row.start < row.end, "节次时间无效。"); row.state = nextState; const peers = db.periods.filter(period => period.id !== row.id && period.school === school && period.term === row.term); must(!peers.some(period => period.number === row.number), "同校同学期节次编号已存在。"); must(!peers.some(period => row.start < period.end && period.start < row.end), "同校同学期节次时间不能重叠。"); }
      p.id ? log(table, row, "更新基础档案") : add(table, row, "新增基础档案"); if ((table === "assignments" && row.state === "有效") || (table === "classes" && row.state === "在读")) syncTeachingTasks(db);
    }
    else if (command === "base.delete") {
      const table = choice(p.table, ["schools", "departments", "staff", "rooms", "cabinets", "classes", "assignments", "terms", "periods"], "基础数据"); permit(["district", "admin"]); if (["schools", "terms"].includes(table)) permit(["district"]); const row = get(table), reason = text(p.reason, "删除原因", 100);
      if (table === "schools") { const scopedTables = ["departments", "staff", "rooms", "classes", "assignments", "periods", "assets", "purchases", "receipts", "repairs", "inventory", "flows", "plans", "planItems", "teachingTasks", "bookings", "arrangements", "summaries", "checks", "hazards", "tasks", "archives", "resources", "submissions", "logs"]; must(!scopedTables.some(name => (db[name] || []).some(record => record.school === row.id)), "学校已有人房数据、业务记录或历史日志，不能删除。"); }
      if (table === "departments") must(!db.staff.some(person => person.departmentId === row.id), "部门仍有关联人员，不能删除。");
      if (table === "staff") { must(row.id !== actor.id, "不能删除当前操作账号。"); must(!db.assignments.some(item => item.teacherId === row.id) && !db.teachingTasks.some(task => task.teacherId === row.id) && !db.bookings.some(booking => booking.teacherId === row.id || booking.applicantId === row.id) && !db.arrangements.some(arrangement => arrangement.technicianId === row.id || arrangement.arrangedBy === row.id) && !db.plans.some(plan => plan.createdBy === row.id) && !db.summaries.some(summary => summary.submittedBy === row.id) && !hasArchive("staff", row.id), "人员已被任课、计划、预约、安排、总结或附件引用，不能删除；请停用账号。"); }
      if (table === "rooms") must(!db.assets.some(asset => asset.roomId === row.id) && !db.inventory.some(stock => stock.roomId === row.id) && !db.receipts.some(receipt => (receipt.items || []).some(line => line.roomId === row.id)) && !db.repairs.some(record => record.snapshot?.roomId === row.id) && !db.flows.some(flow => flow.snapshot?.roomId === row.id) && !db.arrangements.some(arrangement => arrangement.roomId === row.id) && !db.checks.some(check => check.roomId === row.id) && !db.hazards.some(hazard => hazard.roomId === row.id) && !db.tasks.some(task => task.roomId === row.id), "实验室已被设备、库存、入库、安排或安全业务引用，不能删除；请停用。");
      if (table === "cabinets") must(!db.assets.some(asset => asset.cabinetId === row.id) && !db.inventory.some(stock => stock.cabinetId === row.id) && !db.receipts.some(receipt => (receipt.items || []).some(line => line.cabinetId === row.id)) && !db.storageMoves.some(move => move.fromCabinetId === row.id || move.toCabinetId === row.id), "橱柜已被设备、库存、入库或位置调整引用，不能删除；请停用。");
      if (table === "classes") must(!db.assignments.some(item => item.classId === row.id) && !db.teachingTasks.some(task => task.classId === row.id) && !db.bookings.some(booking => booking.classId === row.id), "班级已有任课或实验业务，不能删除；请停用。");
      if (table === "assignments") must(!db.teachingTasks.some(task => task.assignmentId === row.id), "任课班级已用于实验计划执行，不能删除；请停用。");
      if (table === "terms") must(!db.periods.some(period => period.term === row.id) && !db.plans.some(plan => plan.term === row.id) && !db.assignments.some(item => item.term === row.id) && !db.teachingTasks.some(task => task.term === row.id) && !db.submissions.some(item => item.term === row.id), "学期已有节次、任课、计划、任务或上报数据，不能删除。");
      if (table === "periods") { const used = db.bookings.some(booking => booking.school === row.school && find(db, "teachingTasks", booking.taskId).term === row.term && Number(booking.requestedPeriod) === row.number) || db.arrangements.some(arrangement => { const booking = find(db, "bookings", arrangement.bookingId); return arrangement.school === row.school && find(db, "teachingTasks", booking.taskId).term === row.term && Number(arrangement.startPeriod) <= row.number && row.number <= Number(arrangement.endPeriod); }); must(!used, "节次已被预约或安排引用，不能删除。"); }
      remove(table, row, "删除基础档案", reason);
    }
    else if (command === "settings.save") { permit(["district"]); db.settings = { region: text(p.region, "区域"), authority: text(p.authority, "主管单位"), repairDays: num(p.repairDays, "提醒天数", 1, true), lowStock: p.lowStock === true, weeklyReport: p.weeklyReport === true, syncReminder: p.syncReminder === true, exportEnabled: p.exportEnabled === true }; log("settings", { id: "SETTINGS", school: "" }, "保存平台设置"); }
    else if (command === "submission.create") { permit(["admin"]); find(db, "terms", p.term); add("submissions", { id: id("SB"), school: actor.school, term: p.term, date: TODAY, at: now, operator: actor.name, revision: original.revision, summary: metrics(db, actor.school, p.term), state: "已上报" }, "上报当前台账快照"); }
    else throw new Error("不支持的业务操作。");
    normalizeSubjectFields(db);
    normalizeSafetyModel(db);
    db.revision++; db.updatedAt = now; return { db, result };
  }

  function parseCSV(source) {
    const rows = []; let row = [], cell = "", quoted = false; const input = String(source).replace(/^\uFEFF/, "");
    for (let index = 0; index < input.length; index++) { const char = input[index]; if (char === '"') { if (quoted && input[index + 1] === '"') { cell += '"'; index++; } else quoted = !quoted; } else if (char === "," && !quoted) { row.push(cell.trim()); cell = ""; } else if ((char === "\n" || char === "\r") && !quoted) { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; if (char === "\r" && input[index + 1] === "\n") index++; } else cell += char; }
    must(!quoted, "CSV引号未闭合。"); row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); return rows;
  }
  const importHeader = ["分类编号", "物品名称", "规格型号", "分类", "单位", "管理方式", "需要周期维保", "数量", "单价（元）", "存放位置（房间）", "橱柜编号（可选）", "下次维保日期", "有效期"];
  const legacyImportHeader = importHeader.filter(label => label !== "橱柜编号（可选）");
  const importTrackingModes = { "单件设备": "SERIALIZED", "数量库存": "QUANTITY", SERIALIZED: "SERIALIZED", QUANTITY: "QUANTITY" };
  const importBoolean = value => ["是", "true", "TRUE", "1"].includes(String(value).trim()) ? true : ["否", "false", "FALSE", "0"].includes(String(value).trim()) ? false : null;
  function validateImport(source, db = null, school = "") {
    const rows = parseCSV(source), errors = [];
    must(rows.length > 1 && rows.length <= 31, "模板需包含表头和1至30行数据。");
    const isLegacy = rows[0].length === legacyImportHeader.length && legacyImportHeader.every((label, index) => rows[0][index] === label);
    must(!isLegacy ? rows[0].length === importHeader.length && importHeader.every((label, index) => rows[0][index] === label) : true, `模板表头应为：${importHeader.join("、")}。`);
    const items = rows.slice(1).map((row, index) => {
      const [classificationCode = "", name = "", spec = "", category = "", unit = "", trackingModeValue = "", maintenanceValue = "", qty, price, roomNo = "", cabinetCode = "", nextMaintenance = "", expiry = ""] = isLegacy ? [...row.slice(0, 10), "", ...row.slice(10)] : row;
      const trackingMode = importTrackingModes[String(trackingModeValue).trim()] || String(trackingModeValue).trim(), maintenanceRequired = importBoolean(maintenanceValue), validMaintenance = maintenanceRequired !== null;
      const direct = { classificationCode: classificationCode.trim(), name: name.trim(), spec: spec.trim(), category: category.trim(), unit: unit.trim(), trackingMode, maintenanceRequired: validMaintenance ? maintenanceRequired : false },
        existing = db ? itemById(db, direct.classificationCode) : null, item = itemRecord(db, { ...direct, itemId: existing?.itemId || direct.classificationCode }),
        basicInvalid = (!isLegacy && row.length !== importHeader.length) || (isLegacy && row.length !== legacyImportHeader.length) || !direct.classificationCode || !direct.name || !direct.spec || !categories.includes(direct.category) || !direct.unit || !["SERIALIZED", "QUANTITY"].includes(trackingMode) || !validMaintenance || !Number.isInteger(Number(qty)) || Number(qty) <= 0 || price === "" || !Number.isFinite(Number(price)) || Number(price) < 0 || nextMaintenance && !/^\d{4}-\d{2}-\d{2}$/.test(nextMaintenance) || expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry);
      if (basicInvalid) errors.push(`第${index + 2}行：检查分类编号、物品名称、规格型号、分类、单位、管理方式、维保要求、数量、单价、存放位置、维保日期及有效期。`);
      if (item.maintenanceRequired && item.trackingMode !== "SERIALIZED") errors.push(`第${index + 2}行：周期维保只适用于单件编号设备。`);
      if (["耗材", "危化品"].includes(item.category) && item.trackingMode !== "QUANTITY") errors.push(`第${index + 2}行：耗材和危化品须按数量库存管理。`);
      const room = roomNo && db ? db.rooms.find(r => r.school === school && r.roomNo === roomNo) : null;
      if (roomNo && db && !room) errors.push(`第${index + 2}行：房间编号不属于当前学校。`);
      if (room && room.state !== "可用") errors.push(`第${index + 2}行：存放房间已停用。`);
      if (room && !roomFitsItem(room, item)) errors.push(`第${index + 2}行：物品与${room.subject && item.category?.endsWith("仪器") && item.category !== `${room.subject}仪器` ? "存放房间学科" : "存放条件"}不一致。`);
      const cabinet = cabinetCode && db ? db.cabinets.find(c => c.school === school && c.code === cabinetCode) : null;
      if (cabinetCode && db && !cabinet) errors.push(`第${index + 2}行：橱柜编号不属于当前学校。`);
      if (cabinetCode && db && !roomNo) errors.push(`第${index + 2}行：填写橱柜时必须同时填写房间编号。`);
      if (cabinet && room && (cabinet.roomId !== room.id || !cabinetFitsItem(db, cabinet, item))) errors.push(`第${index + 2}行：橱柜不属于所选房间或不符合物品存放条件。`);
      if (nextMaintenance && (!item.maintenanceRequired || item.trackingMode !== "SERIALIZED")) errors.push(`第${index + 2}行：该物品不需要维保日期。`);
      if (expiry && item.trackingMode !== "QUANTITY") errors.push(`第${index + 2}行：单件编号物品不登记有效期。`);
      if (isHazard(item) && (!expiry || expiry < TODAY)) errors.push(`第${index + 2}行：危化品须登记未过期的有效期。`);
      return { itemId: item.itemId || direct.classificationCode, classificationCode: direct.classificationCode, name: direct.name, spec: direct.spec, category: direct.category, unit: direct.unit, trackingMode: item.trackingMode, maintenanceRequired: item.maintenanceRequired, qty: Number(qty), price: Number(price), roomId: room?.id || "", roomNo, cabinetId: cabinet?.id || "", cabinetCode, nextMaintenance, expiry };
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
      db.textbooks ||= [];
      db.experimentCatalog ||= [];
      const textbookByKey = new Map(db.textbooks.map(row => [`${row.subject}|${row.grade}|${row.version}`, row]));
      const catalogById = new Map(catalog.map(row => [row.id, row]));
      catalog.forEach(row => {
        const key = `${row.subject || ""}|${row.grade || ""}|${row.version || ""}`;
        let textbook = textbookByKey.get(key);
        if (!textbook) {
          textbook = { id: `MIG-TB-${String(db.textbooks.length + 1).padStart(3, "0")}`, name: `${row.subject || "实验"} · ${row.version || "教材"}`, subject: row.subject || "", grade: row.grade || "", version: row.version || "", state: "启用", legacy: true };
          db.textbooks.push(textbook);
          textbookByKey.set(key, textbook);
        }
        if (!db.experimentCatalog.some(item => item.id === row.id)) db.experimentCatalog.push({ ...row, textbookId: textbook.id, sourceType: "官方目录", experimentCategory: row.experimentCategory || row.category || row.required || "必做", category: row.experimentCategory || row.category || row.required || "必做", supportedModes: row.supportedModes || [row.mode || "分组"], equipmentRequirements: equipmentRows(row.equipmentRequirements, row.equipment) });
        row.textbookId = textbook.id;
      });
      (db.plans || []).forEach(plan => {
        const first = (db.planItems || []).find(item => item.planId === plan.id), experiment = first ? catalogById.get(first.catalogId) : null;
        plan.grade ||= first?.grade || experiment?.grade || "";
        plan.version ||= first?.version || experiment?.version || "";
        plan.textbookId ||= first?.textbookId || experiment?.textbookId || "";
      });
      (db.planItems || []).forEach(item => {
        const plan = (db.plans || []).find(row => row.id === item.planId), experiment = catalogById.get(item.catalogId) || {};
        item.subject ||= plan?.subject || experiment.subject || "";
        item.grade ||= plan?.grade || experiment.grade || "";
        item.version ||= plan?.version || experiment.version || "";
        item.sourceId ||= experiment.id || "";
        item.sourceType ||= experiment.id ? "官方目录" : "历史来源";
        item.textbookId ||= experiment.textbookId || plan?.textbookId || "";
        item.experimentName ||= experiment.name || item.name || "";
        item.chapter ||= experiment.chapter || "";
        item.equipment ||= experiment.equipment || "";
        item.periods ||= experiment.periods || 1;
        item.required ||= experiment.required || experiment.experimentCategory || "必做";
        item.experimentCategory ||= experiment.experimentCategory || experiment.category || item.required || "必做";
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
    const normalizeReferenceWorkflows = db => {
      const receiptIds = new Set((db.receipts || []).map(receipt => receipt.id));
      (db.assets || []).forEach(asset => { if (asset.sourceId && !receiptIds.has(asset.sourceId)) asset.sourceId = ""; });
      (db.purchases || []).forEach(purchase => { if (purchase.receiptId && !receiptIds.has(purchase.receiptId)) purchase.receiptId = ""; });
      (db.flows || []).forEach(flow => { if (flow.receiptId && !receiptIds.has(flow.receiptId)) flow.receiptId = ""; });
      (db.inventory || []).forEach(stock => {
        const related = (db.flows || []).filter(flow => flow.itemId === stock.id && flow.snapshot).slice().reverse(), priced = related.find(flow => flow.snapshot?.unitPrice != null), dated = related.find(flow => flow.snapshot?.purchaseDate);
        stock.unitPrice = Number(stock.unitPrice ?? priced?.snapshot?.unitPrice ?? 0);
        stock.purchaseDate ||= dated?.snapshot?.purchaseDate || "";
      });
      (db.assets || []).forEach(asset => { if (["维修中", "待报废"].includes(asset.state)) asset.state = "正常使用"; });
      db.repairs = (db.repairs || []).filter(row => !["已撤销", "已驳回"].includes(row.state)).map(row => {
        const asset = (db.assets || []).find(item => item.id === row.assetId), master = asset || row.snapshot || {};
        if (row.kind === "维保") row.kind = "维修";
        row.qty = Number(row.qty || 1);
        row.snapshot = referenceSnapshot(db, { ...master, ...(row.snapshot || {}), code: row.snapshot?.code || asset?.code || "", purchaseDate: row.snapshot?.purchaseDate || asset?.purchaseDate || "", roomId: row.snapshot?.roomId || asset?.roomId || "" }, row.snapshot?.unitPrice ?? asset?.price ?? row.cost ?? 0);
        if (row.kind === "报废") {
          const normalized = { id: row.id, school: row.school, assetId: row.assetId, kind: "报废", qty: row.qty, scrapDate: row.scrapDate || row.maintenanceDate || row.date || TODAY, reason: row.reason || row.result || "历史报废登记", operator: row.operator || row.reporter || "未登记", snapshot: row.snapshot, ...(row.batchId ? { batchId: row.batchId } : {}) };
          if (asset) asset.state = "已报废";
          return normalized;
        }
        return { id: row.id, school: row.school, assetId: row.assetId, kind: "维修", qty: row.qty, cost: Number(row.cost || 0), maintenanceDate: row.maintenanceDate || row.date || TODAY, vendor: row.vendor || "", content: row.content || row.result || row.reason || "", registrar: row.registrar || row.reporter || "未登记", registeredAt: row.registeredAt || row.date || TODAY, snapshot: row.snapshot };
      });
      db.flows = (db.flows || []).filter(flow => {
        const stock = (db.inventory || []).find(item => item.id === flow.itemId), master = stock || flow.snapshot || {}, category = itemRecord(db, master).category;
        if (flow.kind !== "损耗" || category !== "耗材") return true;
        if (["已驳回", "整单撤销", "已撤销"].includes(flow.state)) return false;
        if (["待复核", "复核通过"].includes(flow.state) && stock) {
          const qty = Number(flow.qty || 0);
          if (qty <= 0 || qty > Number(stock.stock || 0)) return false;
          stock.stock -= qty;
        }
        flow.operator ||= flow.applicant || "未登记";
        flow.snapshot = referenceSnapshot(db, { ...master, ...(flow.snapshot || {}), purchaseDate: flow.snapshot?.purchaseDate || stock?.purchaseDate || "", roomId: flow.snapshot?.roomId || stock?.roomId || "" }, flow.snapshot?.unitPrice ?? stock?.unitPrice ?? 0);
        ["state", "applicant", "applicantId", "reviewer", "reviewNote", "arrangementId", "taskId", "sourceFlowId"].forEach(key => delete flow[key]);
        return true;
      });
    };
    if ([VERSION, 11, 10, 9, 8, 7, 6, 5, 4, 3].includes(raw.version)) {
      const current = clone(raw), fallbackTerm = current.terms?.find(term => term.start <= TODAY && TODAY <= term.end)?.id || current.terms?.[0]?.id;
      delete current.roomAssignments;
      current.version = VERSION;
      current.resources ||= [];
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
      normalizeReferenceWorkflows(current);
      normalizeExperimentModel(current);
      normalizeSubjectFields(current);
      normalizeCabinets(current);
      normalizeSafetyModel(current);
      return current;
    }
    if (raw.version !== 2) throw new Error("仅支持从v2至v12升级到当前版本");
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
    normalizeExperimentModel(db);
    normalizeSubjectFields(db);
    removeCountData(db);
    normalizeAssetCodes(db);
    db.bookings = []; db.arrangements = []; db.summaries = [];
    (source.bookings || []).forEach(old => { const mapped = oldPlanMap.get(old.planId); if (!mapped) return; const stateMap = { 待审批: "待安排", 已拒绝: "已拒绝", 已取消: "已取消", 已通过: "已安排", 已准备: "已安排", 已完成: "已完成" }, booking = { id: old.id, school: old.school, taskId: mapped.task.id, planItemId: mapped.item.id, assignmentId: mapped.task.assignmentId, classId: mapped.task.classId, teacherId: mapped.task.teacherId, studentCount: find(db, "classes", mapped.task.classId).students, applicant: old.applicant || find(db, "staff", mapped.task.teacherId).name, applicantId: old.applicantId || mapped.task.teacherId, submittedAt: old.bookedAt || db.updatedAt, requestedDate: old.date, requestedPeriod: old.period || 1, groups: old.groups || null, requestedResources: normalizeRequestedResources(db, old.resources || []), note: old.note || "", state: stateMap[old.state] || "待安排", cancelReason: old.cancelReason || "", legacyId: old.id }; db.bookings.push(booking); if (["已通过", "已准备", "已完成"].includes(old.state)) { const startPeriod = old.period || db.periods.find(p => p.school === old.school && p.term === mapped.task.term && p.start === old.start)?.number || 1, technician = old.managerId && db.staff.some(p => p.id === old.managerId && ["admin"].includes(p.role)) ? old.managerId : db.staff.find(person => person.school === old.school && person.role === "admin")?.id, legacyNotes = [old.decision, old.preparation && `历史准备记录：${old.preparation}`].filter(Boolean).join("；"), arrangement = { id: `MIG-AP-${++db.seq}`, school: old.school, bookingId: booking.id, venueType: "实验室", roomId: old.labId || "", venueText: "", scheduledDate: old.date, startPeriod, endPeriod: startPeriod, technicianId: technician, note: legacyNotes, resources: old.resources || [], state: old.state === "已完成" ? "已完成" : "已安排", arrangedBy: "MIGRATION", arrangedAt: db.updatedAt, legacyId: old.id }; db.arrangements.push(arrangement); mapped.task.state = arrangement.state; if (old.state === "已完成") { db.summaries.push({ id: `MIG-SUM-${++db.seq}`, school: old.school, arrangementId: arrangement.id, actualDate: old.actualDate || old.date, effect: old.summary || "历史完成记录", improvement: "", equipmentCondition: "历史记录未登记", note: "由v2完成登记迁移", submittedBy: mapped.task.teacherId, submittedAt: db.updatedAt, legacy: true }); mapped.task.state = "已完成"; } } });
    (db.flows || []).forEach(flow => { if (flow.planId && oldPlanMap.has(flow.planId)) flow.taskId = oldPlanMap.get(flow.planId).task.id; flow.arrangementId ||= ""; delete flow.planId; if (flow.kind !== "退回") delete flow.sourceFlowId; if (flow.snapshot?.labId) { flow.snapshot.roomId = flow.snapshot.labId; delete flow.snapshot.labId; delete flow.snapshot.location; } }); (db.archives || []).forEach(file => { if (file.relatedTable === "plans" && oldPlanMap.has(file.relatedId)) file.relatedId = oldPlanMap.get(file.relatedId).item.planId; }); delete db.labs;
    removeTrainingData(db);
    normalizeReferenceWorkflows(db);
    normalizeSubjectFields(db);
    normalizeCabinets(db);
    normalizeSafetyModel(db);
    db.logs.push({ id: `MIGRATION-V12-${++db.seq}`, school: "", table: "settings", recordId: "DATA", action: "数据结构升级", actor: "系统", at: new Date().toISOString(), note: "v2-v12升级：新增房间下橱柜与位置调整" }); return db;
  }

  const api = { KEY, VERSION, TODAY, roles, navigation, navigationFor, tableNames, categories, subjects, subjectDefinitions, subjectOptions, subjectCodes, normalizeSubject, subjectLabel, subjectCode, subjectEquals, subjectOptionsFor, normalizeSubjectFields, resourceTypes, resourceGrades, resourceCategories, experimentCategories, experimentSources, implementationModes, seed, clone, find, scoped, metrics, overview, auditRelations, teaching, taskContext, experimentOf, equipmentRows, normalizeExperimentModel, itemOf, itemById, itemRecord, isHazard, itemFitsSubject, itemSubjectScopes, roomFitsItem, roomLabel, cabinetOf, cabinetFitsItem, locationLabel, normalizeCabinets, safetyContext, safetyTargetLabel, safetyRelatedToStock, syncSafetyTask, normalizeSafetyModel, periodFor, syncTeachingTasks, actorFor, transact, ratio, weekOf, weekDate, parseCSV, validateImport, importHeader, csv, activeBooking, activeArrangement, migrate };
  if (typeof module !== "undefined") module.exports = api;
  if (root) { root.LabDemo = api; root.DEMO_DATA = { navigation }; }
})(typeof window === "undefined" ? null : window);
