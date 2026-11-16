/* =========================================================================
   Navigation — routes live in the URL hash and in the browser history, so the
   phone's back gesture works:
     1. it closes an open menu or popup,
     2. then it goes to the previous screen,
     3. on the first screen it asks for a second back before leaving the app.

   A route is a plain string: "<module>/<tab>/<more…>", e.g. "workout/session".
   ========================================================================= */

let current = '';
let onChange = () => {};
let onRootBack = () => {};

const overlays = [];   // close functions of open overlays (menu, popup), innermost last
let pending = [];      // our own history.go(-n) calls that have not landed yet

const hashOf = route => '#/' + route;
const stateIs = kind => !!(history.state && history.state.pablo === kind);

export const routeFromHash = () => location.hash.replace(/^#\/?/, '').replace(/\/+$/, '');
export const currentRoute = () => current;

export function start(route, handlers) {
  current = route;
  onChange = handlers.onChange;
  onRootBack = handlers.onRootBack || (() => {});

  // After a reload the history entries (and the exit guard) are already there.
  const reloaded = !!(history.state && history.state.pablo);
  history.replaceState({ pablo: 'screen' }, '', hashOf(current));
  if (!reloaded) waitForInteraction();

  window.addEventListener('popstate', onPop);
  onChange(current);
}

/* ---------- exit guard ----------
   A "root" entry sits under the first screen. Going back onto it does not leave the
   app; it shows a hint, and only a second back exits.
   The entry is created on the first tap rather than at startup: browsers skip history
   entries that a page added before the user touched it. */
const INTERACTION = ['click', 'touchend', 'keydown'];
function waitForInteraction() { INTERACTION.forEach(t => window.addEventListener(t, armGuard, true)); }
function stopWaiting() { INTERACTION.forEach(t => window.removeEventListener(t, armGuard, true)); }
function armGuard() {
  stopWaiting();
  if (overlays.length || pending.length) return;
  if (!stateIs('root')) history.replaceState({ pablo: 'root' }, '', hashOf(current));
  history.pushState({ pablo: 'screen' }, '', hashOf(current));
}

/* ---------- screens ---------- */
export function go(route, opts = {}) {
  // Navigating from inside a menu or popup: close it first, then move.
  if (overlays.length) { closeAllOverlays(() => go(route, opts)); return; }
  if (pending.length) { pending[pending.length - 1].after.push(() => go(route, opts)); return; }

  if (route !== current) {
    current = route;
    if (opts.replace && !stateIs('root')) history.replaceState({ pablo: 'screen' }, '', hashOf(route));
    else history.pushState({ pablo: 'screen' }, '', hashOf(route));
    stopWaiting();
  }
  onChange(current);
}

// Correct the address of the current screen without adding a history entry or re-rendering.
export function replaceRoute(route) {
  current = route;
  if (!stateIs('root')) history.replaceState({ pablo: 'screen' }, '', hashOf(route));
}

/* ---------- overlays (menu, popups) ---------- */
export function pushOverlay(close) {
  overlays.push(close);
  const push = () => { if (overlays.includes(close)) history.pushState({ pablo: 'overlay' }, '', hashOf(current)); };
  if (pending.length) pending[pending.length - 1].after.push(push);
  else push();
}

// Close the innermost overlay from the interface (× button, Save…). `after` runs once
// the history has caught up, which is when it is safe to navigate.
export function closeOverlay(after) {
  const close = overlays.pop();
  if (!close) { if (after) after(); return; }
  close();
  back(1, after);
}

export function closeAllOverlays(after) {
  const n = overlays.length;
  if (!n) { if (after) after(); return; }
  while (overlays.length) overlays.pop()();
  back(n, after);
}

function back(n, after) {
  const token = { done: false, after: after ? [after] : [] };
  pending.push(token);
  history.go(-n);
  setTimeout(() => settle(token), 500);   // safety net if the browser never reports back
}
function settle(token) {
  if (token.done) return;
  token.done = true;
  pending = pending.filter(t => t !== token);
  token.after.forEach(fn => fn());
}

/* ---------- back gesture / back button ---------- */
function onPop(e) {
  if (pending.length) { settle(pending[0]); return; }          // our own back()
  if (overlays.length) { overlays.pop()(); return; }           // close menu / popup
  if (e.state && e.state.pablo === 'root') {                   // first screen: ask again
    waitForInteraction();
    onRootBack();
    return;
  }
  const route = routeFromHash();
  if (route && route !== current) { current = route; onChange(current); }
}
