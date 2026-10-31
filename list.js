// TabVault list page.
// Everything the owner sees: saved groups (one per archived window), restore,
// search, selection by tab or by window, HTML/JSON export, import, and an
// optional backup into a folder he picks on disk.

const $ = (sel) => document.querySelector(sel);

let groups = [];
let dirHandle = null;
let dirPermission = "prompt";
const selected = new Set(); // "<groupId>:<index>"

const keyOf = (group, index) => `${group.id}:${index}`;

// --- storage -------------------------------------------------------------

async function loadGroups() {
  const data = await chrome.storage.local.get("groups");
  groups = Array.isArray(data.groups) ? data.groups : [];
}

async function save() {
  await chrome.storage.local.set({ groups });
  await writeBackup();
}

// --- IndexedDB: remembers the backup folder between sessions --------------

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("tabvault", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readonly");
    const req = tx.objectStore("kv").get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// --- backup to a real folder ---------------------------------------------

function markdown() {
  const lines = ["# TabVault", "", `Всего групп: ${groups.length}`, ""];
  for (const g of groups) {
    lines.push(`## ${fmtDate(g.savedAt)} — ${g.items.length}`, "");
    for (const item of g.items) {
      const title = item.title.replace(/[[\]]/g, "");
      lines.push(`- [${title}](${item.url})`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function writeFile(name, text) {
  const handle = await dirHandle.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

async function writeBackup() {
  if (!dirHandle) return;
  if (dirPermission !== "granted") {
    updateFolderState("Доступ к папке не подтверждён — нажми «Папка для бэкапа»");
    return;
  }
  try {
    const payload = JSON.stringify(
      { exportedAt: new Date().toISOString(), groups },
      null,
      2,
    );
    await writeFile("tabvault.json", payload);
    await writeFile("tabvault.md", markdown());
    updateFolderState();
  } catch (err) {
    updateFolderState(`Не удалось записать файл: ${err.message}`);
  }
}

function updateFolderState(override) {
  const el = $("#folder-state");
  if (override) {
    el.textContent = override;
    return;
  }
  el.textContent = dirHandle
    ? `Бэкап: ${dirHandle.name}/tabvault.json + tabvault.md`
    : "Бэкап не настроен — данные живут только внутри расширения. Папка внутри Google Drive даёт синхронизацию между машинами бесплатно.";
}

async function restoreHandle() {
  try {
    const handle = await idbGet("dir");
    if (!handle) return;
    dirHandle = handle;
    dirPermission = await handle.queryPermission({ mode: "readwrite" });
    updateFolderState();
  } catch {
    // No stored handle: the owner simply has not bound a folder yet.
  }
}

// --- rendering -----------------------------------------------------------

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function btn(label, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function checkbox(onChange, checked) {
  const box = document.createElement("input");
  box.type = "checkbox";
  box.className = "pick";
  box.checked = Boolean(checked);
  box.addEventListener("change", onChange);
  return box;
}

function itemNode(group, item, index) {
  const key = keyOf(group, index);
  const row = document.createElement("div");
  row.className = "item";
  row.dataset.search = `${item.title} ${item.url}`.toLowerCase();

  const box = checkbox(() => {
    if (selected.has(key)) selected.delete(key);
    else selected.add(key);
    render();
  }, selected.has(key));

  const fav = document.createElement("img");
  fav.className = "fav";
  if (item.favIconUrl) fav.src = item.favIconUrl;
  fav.alt = "";

  const main = document.createElement("div");
  main.className = "item-main";

  const link = document.createElement("a");
  link.className = "item-title";
  link.href = item.url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = item.title;

  const url = document.createElement("span");
  url.className = "item-url";
  url.textContent = item.url;

  main.append(link, url);

  const remove = btn("×", async () => {
    group.items = group.items.filter((i) => i !== item);
    selected.delete(key);
    await saveAndRender();
  });

  row.append(box, fav, main, remove);
  return row;
}

function groupNode(group) {
  const section = document.createElement("section");
  section.className = "group";

  const keys = group.items.map((_, i) => keyOf(group, i));
  const allPicked = keys.length > 0 && keys.every((k) => selected.has(k));

  const head = document.createElement("div");
  head.className = "group-head";

  const box = checkbox(() => {
    for (const k of keys) {
      if (allPicked) selected.delete(k);
      else selected.add(k);
    }
    render();
  }, allPicked);

  const title = document.createElement("span");
  title.className = "group-title";
  title.textContent = fmtDate(group.savedAt);

  const meta = document.createElement("span");
  meta.className = "group-meta";
  const label = group.source ? `${group.source} · ` : "";
  meta.textContent = `${label}${group.items.length} вкладок`;

  const actions = document.createElement("div");
  actions.className = "group-actions";
  actions.append(
    btn("Открыть все", () => openGroup(group)),
    btn("Скопировать", () => copyGroup(group)),
    btn("HTML", () => exportHtml([group], `Окно от ${fmtDate(group.savedAt)}`)),
    btn("Удалить", async () => {
      groups = groups.filter((g) => g !== group);
      for (const k of keys) selected.delete(k);
      await saveAndRender();
    }),
  );

  head.append(box, title, meta, actions);
  section.append(head);

  group.items.forEach((item, i) => section.append(itemNode(group, item, i)));
  return section;
}

function render() {
  const root = $("#groups");
  root.textContent = "";
  for (const group of groups) root.append(groupNode(group));
  $("#empty").hidden = groups.length > 0;
  $("#export-selected").textContent = `Экспорт выбранного (${selected.size})`;
  applySearch();
}

async function saveAndRender() {
  await save();
  render();
}

// --- actions -------------------------------------------------------------

async function openGroup(group) {
  for (const item of group.items) {
    await chrome.tabs.create({ url: item.url, active: false });
  }
}

async function copyGroup(group) {
  await navigator.clipboard.writeText(group.items.map((i) => i.url).join("\n"));
}

function applySearch() {
  const q = $("#search").value.trim().toLowerCase();
  for (const row of document.querySelectorAll(".item")) {
    row.classList.toggle(
      "hidden-by-search",
      Boolean(q) && !row.dataset.search.includes(q),
    );
  }
  for (const section of document.querySelectorAll(".group")) {
    const visible = section.querySelectorAll(".item:not(.hidden-by-search)");
    section.classList.toggle("hidden-by-search", Boolean(q) && visible.length === 0);
  }
}

// Selected tabs, or — when a whole window's group is picked — that window.
function pickSelection() {
  const picked = [];
  for (const group of groups) {
    const items = group.items.filter((_, i) => selected.has(keyOf(group, i)));
    if (items.length) picked.push({ ...group, items });
  }
  return picked;
}

function exportJson() {
  const payload = JSON.stringify(
    { exportedAt: new Date().toISOString(), groups },
    null,
    2,
  );
  const blob = new Blob([payload], { type: "application/json" });
  downloadBlob(blob, `tabvault-${stamp()}.json`);
}

// --- HTML export ---------------------------------------------------------

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function buildHtml(source, subtitle) {
  const total = source.reduce((n, g) => n + g.items.length, 0);
  const parts = source.map((g) => {
    const rows = g.items
      .map(
        (i) =>
          `      <li><a href="${esc(i.url)}" target="_blank" rel="noreferrer">${esc(i.title)}</a><span class="u">${esc(hostOf(i.url))}</span></li>`,
      )
      .join("\n");
    return `    <section>\n      <h2>${esc(fmtDate(g.savedAt))} <span>${g.items.length}</span></h2>\n      <ul>\n${rows}\n      </ul>\n    </section>`;
  });

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(subtitle)} — TabVault</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0 auto; max-width: 780px; padding: 40px 24px 80px;
         font: 16px/1.55 -apple-system, "Segoe UI", Roboto, sans-serif;
         background: #f7f7f5; color: #1a1a1a; }
  h1 { font-size: 22px; margin: 0 0 6px; letter-spacing: -0.01em; }
  .meta { color: #6b6b6b; font-size: 13px; margin: 0 0 28px; }
  section { background: #fff; border: 1px solid #dcdcd6; border-radius: 12px;
            padding: 4px 20px 12px; margin-bottom: 16px; }
  h2 { font-size: 13px; font-weight: 600; color: #6b6b6b; margin: 16px 0 4px;
       text-transform: uppercase; letter-spacing: 0.04em; }
  h2 span { font-weight: 400; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { padding: 10px 0; border-top: 1px solid #eeece8; }
  li a { color: #1a1a1a; text-decoration: none; font-size: 15px; }
  li a:hover { text-decoration: underline; }
  .u { display: block; color: #8a8a8a; font-size: 12px; }
  @media (prefers-color-scheme: dark) {
    body { background: #141414; color: #ececec; }
    section { background: #1c1c1c; border-color: #2e2e2e; }
    li { border-top-color: #262626; }
    li a { color: #ececec; }
    .meta, h2, .u { color: #9a9a9a; }
  }
</style>
</head>
<body>
  <h1>${esc(subtitle)}</h1>
  <p class="meta">${total} вкладок · ${esc(fmtDate(new Date().toISOString()))} · TabVault</p>
${parts.join("\n")}
</body>
</html>
`;
}

function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function exportHtml(source, subtitle) {
  if (!source.length) {
    updateFolderState("Ничего не выбрано — отметь вкладки или целое окно");
    return;
  }
  const html = buildHtml(source, subtitle);
  const name = `tabvault-${stamp()}.html`;
  downloadBlob(new Blob([html], { type: "text/html" }), name);

  // A bound folder is where a share page becomes publishable: drop the file
  // there too, so pushing it to a static host is a one-command step.
  if (dirHandle && dirPermission === "granted") {
    try {
      await writeFile(`shared-${Date.now()}.html`, html);
      updateFolderState(`HTML готов: ${name} и копия в ${dirHandle.name}/`);
    } catch {
      updateFolderState(`HTML готов: ${name}`);
    }
  }
}

// --- import --------------------------------------------------------------

function parseHtmlLinks(text) {
  const doc = new DOMParser().parseFromString(text, "text/html");
  const items = [];
  for (const a of doc.querySelectorAll("a[href]")) {
    const url = a.getAttribute("href");
    if (!/^https?:/i.test(url)) continue;
    items.push({ title: (a.textContent || url).trim(), url, favIconUrl: "" });
  }
  if (!items.length) throw new Error("В HTML не нашлось ссылок");
  return [
    {
      id: Date.now() + Math.floor(Math.random() * 1000),
      savedAt: new Date().toISOString(),
      source: "импорт HTML",
      items,
    },
  ];
}

async function importFile(file) {
  const text = await file.text();
  const trimmed = text.trim();
  const looksJson = trimmed.startsWith("{") || trimmed.startsWith("[");
  const incoming = looksJson
    ? (() => {
        const parsed = JSON.parse(trimmed);
        const list = Array.isArray(parsed) ? parsed : parsed.groups;
        if (!Array.isArray(list)) throw new Error("В файле нет списка групп");
        return list;
      })()
    : parseHtmlLinks(text);

  const known = new Set(groups.map((g) => g.id));
  const fresh = incoming.filter(
    (g) => g && Array.isArray(g.items) && !known.has(g.id),
  );
  groups = [...fresh, ...groups];
  await saveAndRender();
}

// --- wiring --------------------------------------------------------------

$("#search").addEventListener("input", applySearch);
$("#export").addEventListener("click", exportJson);
$("#export-all-html").addEventListener("click", () =>
  exportHtml(groups, "Все окна"),
);
$("#export-selected").addEventListener("click", () =>
  exportHtml(pickSelection(), "Выбранное"),
);
$("#select-none").addEventListener("click", () => {
  selected.clear();
  render();
});

$("#import").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    await importFile(file);
  } catch (err) {
    updateFolderState(`Импорт не удался: ${err.message}`);
  }
  event.target.value = "";
});

$("#bind-folder").addEventListener("click", async () => {
  try {
    dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    dirPermission = "granted";
    await idbSet("dir", dirHandle);
    await writeBackup();
    updateFolderState();
  } catch {
    // Owner cancelled the picker.
  }
});

(async function init() {
  await restoreHandle();
  await loadGroups();
  render();
  updateFolderState();
})();
