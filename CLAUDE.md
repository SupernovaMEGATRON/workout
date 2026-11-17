# PABLO

Personal daily app: Home (today's summary), Workout, Calories, Projects, Routine, Planning, Grocery list, Settings. One user, phone only (Android, installed from Chrome). Published with GitHub Pages from `main` at `/workout/`.

## Rules that must not be broken

- **Existing data.** Workout data lives in LocalStorage under `ledger_data_v1` and `ledger_active_v1` (names from the original app). Never rename, delete or destructively rewrite them. Migrations (`migrate()` in `js/modules/workout.js`) must stay idempotent and non-destructive.
- **No build step.** Plain static files, native ES modules, no npm. Everything the app needs is in this repository; nothing is loaded from the network at runtime.
- **Relative URLs only.** The site is served under `/workout/`.
- **No swipe-from-the-edge gestures.** That is the phone's back gesture. The menu opens only from the ≡ button.
- **Every release:** change the version in `version.js` and run `python3 tools/check_files.py`. A file missing from the list in `sw.js` is not available offline; a listed file missing on disk makes the update fail to install.
- **Backup files** (`pablo-backup-*`) hold personal data and the repository is public. They are git-ignored; never commit one.

## Layout

```
index.html              shell markup (header, menu, tab bar, popup, toast, update bar)
version.js              app version, read by the page and by sw.js
sw.js                   service worker: offline copy of the app files + update flow
css/app.css             the few styles Tailwind does not cover
vendor/                 Tailwind runtime and fonts, stored locally
js/app.js               registers modules, starts the shell, registers the service worker
js/core/nav.js          routes in the URL hash + history; back-gesture handling
js/core/shell.js        header, module menu, bottom tabs; module interface (documented at the top)
js/core/ui.js           $, esc, uid, toast, popup, readNumber, copyText
js/core/backup.js       export / import of all modules' data
js/core/dates.js        local calendar days ("YYYY-MM-DD") and date formatting
js/core/icons.js        drawn (SVG) icons for menus and tabs
js/core/daynav.js       header of a "one day" screen with ‹ › day stepping (Calories, Routine)
js/modules/<name>.js    one file per module
tools/check_files.py    release check
```

## How it fits together

- **Modules** are objects registered in `js/app.js` (the order is the menu order). Each declares its name, icon, bottom tabs and a `render(el, { tab, params })`. Adding a module means one file in `js/modules/`, one `register()` line, and the file name in `sw.js`.
- **Routes** are `module/tab/…` in the URL hash. `shell.go(route)` navigates (`{ replace: true }` to step sideways without adding history); `shell.up(route)` returns to a parent screen; `shell.refresh()` redraws the current screen. Each render gets a fresh element, so a module attaches its listeners to it without leaking.
- **Back gesture** (`nav.js`): menu and popups add a history entry, so back closes them; then back goes to the previous screen; on the first screen a second back is needed to leave. Never call `history.pushState` or `history.back` outside `nav.js`.
- **Storage:** LocalStorage, one key per module, named `pablo_<module>_v1` (workout keeps its `ledger_` keys). Any key with the `pablo_` or `ledger_` prefix is included in backups automatically. `pablo_shell_v1` (last screen) is the only one excluded.
- **Updates:** the service worker precaches the files listed in `sw.js` under a cache named after the version. A new version installs in the background and waits; the page shows "New version available" and switches when the user taps Update. Stored data is never involved.
- **Dates:** a day is a local calendar day written `YYYY-MM-DD` (`js/core/dates.js`), never a UTC timestamp. When the app returns to the foreground on a new day, the current screen is redrawn (`js/app.js`).
- **Icons:** use the drawn icons in `js/core/icons.js` for new modules; text symbols render differently from phone to phone. Workout keeps its original symbols.
- **Routine keeps past days frozen:** every day up to yesterday is written down before any todo is edited or deleted (`freeze()` in `routine.js`), so history never changes. Any new code that changes todos must call `freeze()` first.
- **Cross-module reads:** a module exports the functions other modules may use (for example `daySummary(day)` in `calories.js`, for Home). Data has one owner; nothing is copied. Planning (`planning.js`) and Home (`home.js`) store nothing: it reads and changes Projects and Routine through their exports (`datedTasks`, `toggleTask`, `setTaskDate`, `itemsOn`, `bump`, `addOneOff`, `setOneOffDate`…).

## Look

Dark theme, amber accent, Space Grotesk for text and JetBrains Mono (`.num`) for numbers. Colours and fonts are defined in `js/tailwind-config.js`. Interface in English.

## Publishing

`git push origin main` works from this folder through a deploy key (repository-local SSH settings and commit identity; nothing global was changed). GitHub Pages rebuilds in about a minute.

The full specification of the planned modules is in `PABLO-v2-prompt.md` (kept locally, not in the repository).
