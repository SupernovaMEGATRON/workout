/* PABLO — start-up: register the modules, start the shell, keep the app up to date. */
import { $, initUi } from './core/ui.js';
import { register, startShell, refresh } from './core/shell.js';
import { today } from './core/dates.js';

import home from './modules/home.js';
import workout from './modules/workout.js';
import calories from './modules/calories.js';
import projects from './modules/projects.js';
import routine from './modules/routine.js';
import grocery from './modules/grocery.js';
import settings from './modules/settings.js';

// Menu order. To add a module: import it and register it here.
register(home);
register(workout);
register(calories);
register(projects);
register(routine);
register(grocery);
register(settings);

initUi();
startShell();

// When the app comes back to the foreground on a new day, redraw so "today" is right.
let shownDay = today();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || today() === shownDay) return;
  shownDay = today();
  refresh();
});

// Ask the browser not to clear this app's data when the phone runs low on space.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ---------- offline + updates ----------
   The service worker keeps a copy of the app files on the phone. When a new version is
   published it is downloaded in the background, and a bar offers to switch to it.
   Updating replaces app files only; stored data is never touched. */
async function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let reg;
  // updateViaCache 'none': update checks must read sw.js and version.js from the network,
  // never from the browser's HTTP cache, or a new release could go unnoticed.
  try { reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }); } catch (e) { return; }

  // A new version is ready once its worker reaches "installed". The worker is passed
  // around directly: reg.waiting is not always filled in yet when that event fires.
  let ready = null;
  const offer = sw => {
    if (!sw || !navigator.serviceWorker.controller) return;   // first install: nothing to offer
    ready = sw;
    $('#updateBar').classList.remove('hidden');
  };
  // The browser occasionally drops an install for no stated reason (seen when an update
  // lands in the first moments after the app loads). Checking again shortly fixes it.
  let retries = 0;
  const watch = sw => {
    if (!sw) return;
    if (sw.state === 'installed') { offer(sw); return; }
    let installed = false;
    sw.addEventListener('statechange', () => {
      if (sw.state === 'installed') { installed = true; offer(sw); }
      else if (sw.state === 'redundant' && !installed && retries < 3) {
        retries++;
        setTimeout(() => reg.update().catch(() => {}), 4000);
      }
    });
  };
  offer(reg.waiting);
  watch(reg.installing);
  reg.addEventListener('updatefound', () => watch(reg.installing));

  let updating = false;
  $('#updateBtn').addEventListener('click', () => {
    const sw = reg.waiting || ready;
    if (!sw) { location.reload(); return; }
    updating = true;
    sw.postMessage({ type: 'SKIP_WAITING' });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updating) location.reload(); });

  // Look for a new version each time the app comes back to the foreground.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    reg.update().then(() => { offer(reg.waiting); watch(reg.installing); }).catch(() => {});
  });
}
initServiceWorker();
