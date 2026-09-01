(function () {
  "use strict";

  const data = window.DEMO_DATA;
  const list = document.getElementById("previewList");
  const frame = document.getElementById("previewFrame");
  const frameWrap = document.getElementById("previewFrameWrap");
  const currentTitle = document.getElementById("previewTitle");
  const currentPath = document.getElementById("previewPath");

  const groups = [
    { label: "原型入口", items: [{ label: "登录与角色选择", path: "login.html", code: "LOGIN" }] },
    ...data.navigation.district.map((group) => ({
      label: `区级端 · ${group.label}`,
      items: group.items.map((item) => ({ label: item.label, path: `pages/district/${item.href}`, code: `D-${item.mark}` }))
    })),
    ...data.navigation.school.map((group) => ({
      label: `学校端 · ${group.label}`,
      items: group.items.map((item) => ({ label: item.label, path: `pages/school/${item.href}`, code: `S-${item.mark}` }))
    }))
  ];

  function selectPage(button) {
    document.querySelectorAll(".preview-link").forEach((item) => item.classList.toggle("active", item === button));
    frame.src = button.dataset.path;
    currentTitle.textContent = button.dataset.title;
    currentPath.textContent = button.dataset.path;
  }

  list.innerHTML = groups.map((group) => `
    <section class="preview-group">
      <div class="preview-group-title">${group.label}</div>
      ${group.items.map((item) => `<button class="preview-link" type="button" data-path="${item.path}" data-title="${item.label}"><span>${item.label}</span><span>${item.code}</span></button>`).join("")}
    </section>
  `).join("");

  document.querySelectorAll(".preview-link").forEach((button) => button.addEventListener("click", () => selectPage(button)));
  document.querySelectorAll("[data-viewport]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll("[data-viewport]").forEach((item) => item.classList.toggle("active", item === button));
    frameWrap.classList.remove("tablet", "mobile");
    if (button.dataset.viewport !== "desktop") frameWrap.classList.add(button.dataset.viewport);
  }));
  document.querySelector("[data-reload]").addEventListener("click", () => { frame.src = frame.src; });
  document.querySelector("[data-open]").addEventListener("click", () => window.open(frame.src, "_blank", "noopener"));

  const initial = [...document.querySelectorAll(".preview-link")].find((button) => button.dataset.path.includes("district/dashboard.html"));
  selectPage(initial || document.querySelector(".preview-link"));
})();
