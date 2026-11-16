/* =========================================================================
   Shell — the frame around the modules: header, module menu, bottom tab bar.

   A module is an object:
     id        short name used in routes and storage keys ("workout")
     name      shown in the menu and the header
     icon      one character shown in the menu
     tabs      [{ id, label, icon, badge?() }] — the module's bottom tabs ([] for none)
     render    (el, { tab, params }) — draw the screen into a fresh, empty element
     status?   () => { label, route } | null — something in progress, shown in the
               header from every module (one tap goes to `route`)
     footer?   true to list the module at the bottom of the menu (Settings)
     remember? false so the app never reopens on this module
     backup?   { describe(storage) } — one-line summary of this module's data in a backup

   Adding a module = one file in js/modules/ + one register() line in js/app.js
   (+ the file name in sw.js).
   ========================================================================= */
import * as nav from './nav.js';
import { $, esc, toast } from './ui.js';

const SHELL_KEY = 'pablo_shell_v1';      // last screen used; not user data
const DEFAULT_ROUTE = 'workout/history';

const modules = [];
const byId = id => modules.find(m => m.id === id);

export function register(mod) { modules.push(mod); }
export const allModules = () => modules;

/* ---------- remembered screen ---------- */
let shellState = (() => {
  try { return JSON.parse(localStorage.getItem(SHELL_KEY)) || {}; } catch (e) { return {}; }
})();
function saveShell() {
  try { localStorage.setItem(SHELL_KEY, JSON.stringify(shellState)); } catch (e) {}
}

/* ---------- routes ---------- */
const hasTabs = mod => !!(mod.tabs && mod.tabs.length);

function defaultTab(mod) {
  const last = shellState.lastTab && shellState.lastTab[mod.id];
  return mod.tabs.some(t => t.id === last) ? last : mod.tabs[0].id;
}

// Turn any string into a route that exists.
export function normalise(route) {
  const segs = String(route || '').split('/').filter(Boolean);
  const mod = byId(segs[0]) || byId(DEFAULT_ROUTE.split('/')[0]) || modules[0];
  if (mod.id !== segs[0]) return hasTabs(mod) ? mod.id + '/' + defaultTab(mod) : mod.id;
  if (!hasTabs(mod)) return segs.join('/');
  if (!mod.tabs.some(t => t.id === segs[1])) return mod.id + '/' + defaultTab(mod);
  return segs.join('/');
}

export function go(route, opts) { nav.go(normalise(route), opts); }

// Re-draw the current screen. { keepScroll: true } keeps the scroll position.
export function refresh(opts) { render(nav.currentRoute(), opts || {}); }

/* ---------- rendering ---------- */
function render(route, opts = {}) {
  const norm = normalise(route);
  if (norm !== route) { nav.replaceRoute(norm); route = norm; }

  const segs = route.split('/');
  const mod = byId(segs[0]);
  const tab = hasTabs(mod) ? segs[1] : null;
  const params = segs.slice(hasTabs(mod) ? 2 : 1);

  if (mod.remember !== false) shellState.route = tab ? mod.id + '/' + tab : mod.id;
  if (tab) { shellState.lastTab = shellState.lastTab || {}; shellState.lastTab[mod.id] = tab; }
  saveShell();

  renderChrome(mod, tab);

  const el = document.createElement('div');
  if (!opts.keepScroll) el.className = 'view-enter';
  const main = $('#view');
  main.classList.toggle('pb-28', hasTabs(mod));
  main.classList.toggle('pb-10', !hasTabs(mod));
  main.replaceChildren(el);
  mod.render(el, { tab, params });
  if (!opts.keepScroll) window.scrollTo(0, 0);
}

function renderChrome(mod, tab) {
  $('#title').textContent = mod.name;

  // something in progress in any module (e.g. a workout session)
  const status = modules.map(m => (m.status ? m.status() : null)).find(Boolean) || null;
  const st = $('#headerStatus');
  st.classList.toggle('hidden', !status);
  if (status) { st.textContent = status.label; st.dataset.route = status.route; }

  // bottom tabs of the open module
  const bar = $('#tabbar');
  bar.classList.toggle('hidden', !hasTabs(mod));
  if (hasTabs(mod)) {
    $('#tabs').style.gridTemplateColumns = `repeat(${mod.tabs.length}, minmax(0, 1fr))`;
    $('#tabs').innerHTML = mod.tabs.map(t => `
      <button data-route="${esc(mod.id + '/' + t.id)}" class="py-3 flex flex-col items-center gap-1 relative ${t.id === tab ? 'text-amber' : 'text-mut'}">
        <span class="text-base leading-none">${esc(t.icon || '•')}</span>
        <span class="text-[11px] font-500 tracking-wide">${esc(t.label)}</span>
        ${t.badge && t.badge() ? '<span class="absolute top-2 right-1/2 translate-x-4 w-1.5 h-1.5 rounded-full bg-amber"></span>' : ''}
      </button>`).join('');
  }

  // module menu
  const item = m => `
    <button data-module="${esc(m.id)}" class="w-full flex items-center gap-3 px-4 py-3.5 text-left ${m.id === mod.id ? 'text-amber bg-panel2' : 'text-fg'}">
      <span class="w-6 text-center text-lg leading-none ${m.id === mod.id ? '' : 'text-mut'}">${esc(m.icon || '•')}</span>
      <span class="font-disp text-base font-600">${esc(m.name)}</span>
    </button>`;
  $('#menuList').innerHTML = modules.filter(m => !m.footer).map(item).join('');
  $('#menuFoot').innerHTML = modules.filter(m => m.footer).map(item).join('');
}

/* ---------- module menu ---------- */
let menuOpen = false;
function openMenu() {
  if (menuOpen) return;
  menuOpen = true;
  $('#menu').classList.remove('hidden');
  nav.pushOverlay(hideMenu);
}
function hideMenu() {
  menuOpen = false;
  $('#menu').classList.add('hidden');
}
function closeMenu() { if (menuOpen) nav.closeOverlay(); }

/* ---------- start ---------- */
export function startShell() {
  $('#menuBtn').addEventListener('click', openMenu);
  $('#menuClose').addEventListener('click', closeMenu);
  $('#menuBackdrop').addEventListener('click', closeMenu);
  $('#menuPanel').addEventListener('click', e => {
    const btn = e.target.closest('[data-module]');
    if (btn) go(btn.dataset.module);          // nav.go closes the menu first
  });
  $('#tabs').addEventListener('click', e => {
    const btn = e.target.closest('[data-route]');
    if (btn) go(btn.dataset.route);
  });
  $('#headerStatus').addEventListener('click', e => go(e.currentTarget.dataset.route));

  // Reopen where the user left off (an address typed or reloaded wins).
  const initial = normalise(nav.routeFromHash() || shellState.route || DEFAULT_ROUTE);
  nav.start(initial, {
    onChange: route => render(route),
    onRootBack: () => toast('Swipe back again to exit'),
  });
}
