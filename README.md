# TabVault

A OneTab-style archiver built around one idea: **you keep one window, everything
else goes into a list — and that list is a plain file you own.**

Manifest V3, no build step, no dependencies, no network calls, no accounts.
MIT licensed.

## What it does

- **Click the toolbar icon.** Every *other* window is saved as a group, those
  windows close, and the list page opens. The window you clicked from is left
  untouched — that is the one you are working in.
- **Right-click the icon** for two more actions: archive all other windows, or
  collapse just this window's tabs without closing the window itself.
- The list page shows one card per archived window, tagged with how it was
  captured ("окно целиком" / "вкладки окна") and when.
- Restore a tab (click its title), a whole window ("Открыть все"), or copy its
  URLs to the clipboard.
- Search across titles and URLs; delete a single tab or a whole card.

## Picking and exporting what you want

Every tab and every window card has a checkbox. Tick individual tabs, tick a
whole card, or mix the two; the toolbar count follows the selection.

- **Экспорт выбранного (HTML)** — the ticked tabs become one self-contained HTML
  page: no scripts, no external assets, readable on a phone, links open in a new
  tab. That file is the shareable artifact.
- **Всё в HTML** — the same page for the entire vault.
- **Экспорт JSON** — the full vault, for re-import on another machine.
- **Импорт** — takes either a JSON export or an HTML page; from HTML it harvests
  every `http(s)` link into a new card.

## Sharing: a permanent address

An extension cannot publish to the web by itself — that needs a host and
credentials it has no business holding. So the honest split:

1. Today: the HTML export is a single file. Drop it anywhere (a chat, a shared
   folder, a USB stick) and it opens in any browser.
2. The stable address: the same file committed to `volosati-team/tabvault` is
   served by GitHub Pages at
   `https://volosati-team.github.io/tabvault/s/<id>.html` — a URL that keeps
   working after the tab list is long gone. When the backup folder is bound,
   every HTML export is also written into it as `shared-<timestamp>.html`, so
   publishing is `git add` + push, nothing more.

## Sync between machines

No OAuth, no server, no sync code in the extension. Bind the backup folder
("Папка для бэкапа") to a directory inside Google Drive, Yandex Disk, or
Syncthing — Drive does the syncing, the extension just keeps rewriting the same
two files. The data stays plain text on every device.

## The files are the point

"Папка для бэкапа" binds a folder through the File System Access API; the handle
is remembered in IndexedDB and re-permissioned on demand. Every change rewrites:

- `tabvault.json` — the full machine-readable vault;
- `tabvault.md` — the same list as readable Markdown, one bullet per tab.

So the real store is a file you can open in an editor, diff, grep, back up with
your own tooling, or hand to another browser. Without a bound folder the vault
lives only in `chrome.storage.local`, and the page says so.

## Install

1. Unzip `tabvault.zip`.
2. `chrome://extensions` → enable "Режим разработчика".
3. "Загрузить распакованное" → pick the unzipped folder.
4. Pin the icon to the toolbar.

## Limits, deliberately

- Pinned tabs are never archived or closed — they are infrastructure, not
  reading.
- Incognito windows are skipped.
- Stars, notes and named groups are not in this pass.

## Layout

```
manifest.json   MV3 manifest
background.js   service worker: archive other windows / collapse this one
list.html       list page shell
list.css        styling, light and dark
list.js         groups, selection, restore, search, HTML/JSON export, import, backup
LICENSE         MIT
```
