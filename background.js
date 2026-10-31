// TabVault service worker.
//
// Toolbar click: archive every window except the current one, then close those
// windows and show the list page.
// Context menu: same thing for all windows, or collapse just this window's
// tabs while keeping the window.

const LIST_PAGE = chrome.runtime.getURL("list.html");
const OWN_PREFIX = chrome.runtime.getURL("");

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "archive-others",
    title: "Заархивировать все остальные окна",
    contexts: ["action"],
  });
  chrome.contextMenus.create({
    id: "collapse-window",
    title: "Свернуть вкладки этого окна",
    contexts: ["action"],
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "archive-others") archiveOtherWindows();
  if (info.menuItemId === "collapse-window") collapseCurrentWindow();
});

chrome.action.onClicked.addListener(() => archiveOtherWindows());

// --- helpers -------------------------------------------------------------

function tabItems(tabs) {
  return tabs
    .filter((t) => t.url && !t.pinned && !t.url.startsWith(OWN_PREFIX))
    .map((t) => ({
      title: t.title || t.url,
      url: t.url,
      favIconUrl: t.favIconUrl || "",
    }));
}

async function addGroups(newGroups) {
  const { groups = [] } = await chrome.storage.local.get("groups");
  await chrome.storage.local.set({ groups: [...newGroups, ...groups] });
}

function makeGroup(items, source) {
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    savedAt: new Date().toISOString(),
    source,
    items,
  };
}

// --- the two actions -----------------------------------------------------

async function archiveOtherWindows() {
  const current = await chrome.windows.getCurrent();
  const all = await chrome.windows.getAll({ populate: true });
  const others = all.filter((w) => w.id !== current.id && !w.incognito);

  const fresh = [];
  const toClose = [];
  for (const win of others) {
    const items = tabItems(win.tabs || []);
    if (items.length === 0) continue; // all-pinned window: leave it alone
    fresh.push(makeGroup(items, "окно целиком"));
    toClose.push(win.id);
  }

  if (fresh.length === 0) {
    await chrome.tabs.create({ url: LIST_PAGE });
    return;
  }

  await addGroups(fresh.reverse());
  await chrome.tabs.create({ url: LIST_PAGE, active: true });
  for (const id of toClose) await chrome.windows.remove(id).catch(() => {});
}

async function collapseCurrentWindow() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const items = tabItems(tabs);
  if (items.length === 0) {
    await chrome.tabs.create({ url: LIST_PAGE });
    return;
  }

  await addGroups([makeGroup(items, "вкладки окна")]);
  await chrome.tabs.create({ url: LIST_PAGE, active: true });

  const closable = tabs
    .filter((t) => !t.pinned && !t.url.startsWith(OWN_PREFIX))
    .map((t) => t.id);
  await chrome.tabs.remove(closable);
}
