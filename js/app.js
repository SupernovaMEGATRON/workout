/* PABLO — start-up: register the modules, start the shell, keep the app up to date. */
import { $, initUi } from './core/ui.js';
import { register, startShell } from './core/shell.js';

import home from './modules/home.js';
import workout from './modules/workout.js';
import settings from './modules/settings.js';

// Menu order. To add a module: import it and register it here.
register(home);
register(workout);
register(settings);

initUi();
startShell();

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

  const offer = () => { if (reg.waiting && navigator.serviceWorker.controller) $('#updateBar').classList.remove('hidden'); };
  const watch = sw => { if (sw) sw.addEventListener('statechange', () => { if (sw.state === 'installed') offer(); }); };
  offer();
  watch(reg.installing);
  reg.addEventListener('updatefound', () => watch(reg.installing));

  let updating = false;
  $('#updateBtn').addEventListener('click', () => {
    if (!reg.waiting) { location.reload(); return; }
    updating = true;
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updating) location.reload(); });

  // Look for a new version each time the app comes back to the foreground.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reg.update().catch(() => {});
  });
}
initServiceWorker();
