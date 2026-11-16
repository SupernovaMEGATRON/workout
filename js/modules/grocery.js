/* =========================================================================
   Grocery list — check the items needed, pick a shop, and get the list copied
   to the clipboard in the order of the route through that shop.

   Stored under "pablo_grocery_v1":
     shops    [{ id, name }]
     items    [{ id, name, pos: { <shopId>: number } }]
              pos = where the item sits along the route through that shop
              (1 = at the entrance). A shop missing from pos = no position there.
     checked  [itemId] — ticked in the List tab, kept until Generate
     shop     id of the shop last selected
     last     { shopId, shopName, text, count, at } — the last generated list

   No quantities, no one-off items, no checklist for use in the shop.
   ========================================================================= */
import { $, esc, uid, toast, openModal, closeModal, readNumber, copyText } from '../core/ui.js';
import { go, refresh } from '../core/shell.js';
import { icons } from '../core/icons.js';

const KEY = 'pablo_grocery_v1';

let state = load();
let itemSort = 'az';        // Items tab: 'az' or a shop id
let lastOpen = false;       // List tab: is the last generated list unfolded

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) {}
  return { shops: [{ id: uid(), name: 'Delhaize' }, { id: uid(), name: 'Intermarché' }], items: [], checked: [], shop: null, last: null };
}
// Must stay idempotent and non-destructive.
function migrate(data) {
  if (!Array.isArray(data.shops)) data.shops = [];
  if (!Array.isArray(data.items)) data.items = [];
  if (!Array.isArray(data.checked)) data.checked = [];
  data.items.forEach(i => { if (!i.pos || typeof i.pos !== 'object') i.pos = {}; });
  if (data.last === undefined) data.last = null;
  return data;
}
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

/* ---------- helpers ---------- */
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
const hasPos = (item, shopId) => typeof item.pos[shopId] === 'number';
const fmtPos = n => String(Math.round(n * 100) / 100);

const currentShop = () => state.shops.find(s => s.id === state.shop) || state.shops[0] || null;

// Route order for a shop: by position, same position alphabetically, items without a
// position for that shop at the end (alphabetically).
function inShopOrder(items, shopId) {
  return [...items].sort((a, b) => {
    const pa = hasPos(a, shopId), pb = hasPos(b, shopId);
    if (pa && pb) return a.pos[shopId] - b.pos[shopId] || byName(a, b);
    if (pa !== pb) return pa ? -1 : 1;
    return byName(a, b);
  });
}

const inputCls = 'w-full bg-panel2 border border-line rounded-xl px-3 py-3 text-fg outline-none focus:border-amber/60';
const sectionTitle = (text, action) => `
  <div class="flex items-baseline justify-between mb-3">
    <h2 class="font-disp text-sm uppercase tracking-widest text-mut">${text}</h2>
    ${action || ''}
  </div>`;
const chip = (on, attrs, label) =>
  `<button ${attrs} class="shrink-0 text-sm rounded-full px-3.5 py-2 border ${on ? 'bg-amberd/60 border-amber/60 text-amber font-600' : 'bg-panel2 border-line text-mut'}">${label}</button>`;

/* =========================================================================
   LIST — tick what is needed, generate
   ========================================================================= */
function renderList(el) {
  const shop = currentShop();
  const items = [...state.items].sort(byName);
  const checked = new Set(state.checked);

  if (!items.length) {
    el.innerHTML = `
      <div class="text-center text-mut text-sm py-12 border border-dashed border-line rounded-2xl">
        No items yet.<br>Create the things you usually buy first.
        <div class="mt-4"><button data-act="toitems" class="bg-panel2 border border-line rounded-xl px-5 py-2.5 text-fg">Go to Items →</button></div>
      </div>
      ${lastCard()}`;
  } else {
    el.innerHTML = `
      <div class="sticky z-20 -mx-4 px-4 pt-1 pb-3 mb-1 bg-ink/95 backdrop-blur" style="top: calc(3.5rem + env(safe-area-inset-top));">
        <div class="flex gap-2 overflow-x-auto mb-2.5">
          ${state.shops.map(s => chip(shop && s.id === shop.id, `data-act="shop" data-id="${esc(s.id)}"`, esc(s.name))).join('')}
        </div>
        <button data-act="generate" class="w-full bg-amber text-ink font-700 rounded-xl py-3.5 text-base active:scale-[.99] transition">
          Generate list<span id="gcount"></span>
        </button>
      </div>

      ${lastCard()}

      ${items.length > 8 ? `<input id="gfilter" autocomplete="off" placeholder="Find an item…" class="${inputCls} mb-3" />` : ''}
      <div id="grows" class="space-y-2">
        ${items.map(i => `
          <button data-act="toggle" data-id="${esc(i.id)}" data-name="${esc(i.name.toLowerCase())}"
                  class="w-full text-left bg-panel border rounded-2xl px-4 py-3 flex items-center gap-3 transition ${checked.has(i.id) ? 'border-amber/60' : 'border-line'}">
            <span class="box shrink-0 w-6 h-6 rounded-md border flex items-center justify-center text-sm font-700 ${checked.has(i.id) ? 'bg-amber border-amber text-ink' : 'border-mut/60 text-transparent'}">✓</span>
            <span class="flex-1 min-w-0 truncate">${esc(i.name)}</span>
            <span class="num text-xs shrink-0 ${shop && hasPos(i, shop.id) ? 'text-steel' : 'text-mut/60'}">${shop && hasPos(i, shop.id) ? fmtPos(i.pos[shop.id]) : '—'}</span>
          </button>`).join('')}
      </div>
      <div id="gnone" class="hidden text-center text-mut text-sm py-6">No item matches.</div>`;
    updateCount(el);
  }

  el.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    switch (btn.dataset.act) {
      case 'toitems': go('grocery/items'); break;
      case 'shop': state.shop = btn.dataset.id; save(); refresh({ keepScroll: true }); break;
      case 'toggle': toggle(el, btn); break;
      case 'generate': generate(); break;
      case 'copyagain': copyAgain(); break;
      case 'togglelast': lastOpen = !lastOpen; refresh({ keepScroll: true }); break;
    }
  });
  el.addEventListener('input', e => {
    if (e.target.id !== 'gfilter') return;
    const needle = e.target.value.trim().toLowerCase();
    let shown = 0;
    el.querySelectorAll('#grows [data-act="toggle"]').forEach(row => {
      const match = !needle || row.dataset.name.includes(needle);
      row.classList.toggle('hidden', !match);
      if (match) shown++;
    });
    $('#gnone', el).classList.toggle('hidden', shown > 0);
  });
}

function updateCount(el) {
  const n = state.checked.length;
  const span = $('#gcount', el);
  if (span) span.textContent = n ? ` · ${n} ${n === 1 ? 'item' : 'items'}` : '';
}

// Tick / untick in place, so the list does not jump and the search box keeps its text.
function toggle(el, row) {
  const id = row.dataset.id;
  const on = !state.checked.includes(id);
  state.checked = on ? [...state.checked, id] : state.checked.filter(x => x !== id);
  save();
  row.classList.toggle('border-amber/60', on);
  row.classList.toggle('border-line', !on);
  const box = $('.box', row);
  ['bg-amber', 'border-amber', 'text-ink'].forEach(c => box.classList.toggle(c, on));
  ['border-mut/60', 'text-transparent'].forEach(c => box.classList.toggle(c, !on));
  updateCount(el);
}

function lastCard() {
  const l = state.last;
  if (!l) return '';
  const d = new Date(l.at);
  const when = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' +
               d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `
    <div class="bg-panel border border-line rounded-2xl p-4 mb-4">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="text-[11px] uppercase tracking-widest text-mut mb-1">Last list</div>
          <div class="truncate"><span class="font-600">${esc(l.shopName)}</span> <span class="text-mut">· ${l.count} ${l.count === 1 ? 'item' : 'items'}</span></div>
          <div class="text-[11px] text-mut num mt-0.5">${esc(when)}</div>
        </div>
        <button data-act="copyagain" class="shrink-0 border border-amber/50 text-amber rounded-xl px-4 py-2.5 text-sm font-600 active:bg-amberd/60">Copy again</button>
      </div>
      <button data-act="togglelast" class="text-xs text-mut mt-3 active:text-fg">${lastOpen ? 'Hide list ▴' : 'Show list ▾'}</button>
      ${lastOpen ? `<pre id="lastText" class="mt-2 text-sm leading-relaxed whitespace-pre-wrap bg-panel2 border border-line rounded-xl p-3 select-all" style="font-family: inherit">${esc(l.text)}</pre>` : ''}
    </div>`;
}

async function generate() {
  const shop = currentShop();
  if (!shop) { toast('Add a shop in Items first'); return; }
  const picked = state.items.filter(i => state.checked.includes(i.id));
  if (!picked.length) { toast('Check at least one item'); return; }

  const text = inShopOrder(picked, shop.id).map(i => i.name).join('\n');
  const copied = await copyText(text);          // first, while the tap still counts

  state.last = { shopId: shop.id, shopName: shop.name, text, count: picked.length, at: Date.now() };
  state.checked = [];                           // ready for next time
  save();
  if (!copied) lastOpen = true;                 // so the text can at least be selected by hand
  refresh();
  toast(copied ? `Copied ${picked.length} ${picked.length === 1 ? 'item' : 'items'} for ${shop.name}`
               : 'Could not copy — the list is shown below');
}

async function copyAgain() {
  if (!state.last) return;
  toast((await copyText(state.last.text)) ? 'List copied' : 'Could not copy');
}

/* =========================================================================
   ITEMS — the catalogue and the shops
   ========================================================================= */
function renderItems(el) {
  if (itemSort !== 'az' && !state.shops.some(s => s.id === itemSort)) itemSort = 'az';
  const items = itemSort === 'az' ? [...state.items].sort(byName) : inShopOrder(state.items, itemSort);
  const addBtn = act => `<button data-act="${act}" class="text-xs text-amber font-600">+ New</button>`;

  el.innerHTML = `
    ${sectionTitle('Shops', addBtn('newshop'))}
    <div class="flex flex-wrap gap-2 mb-7">
      ${state.shops.map(s => `<button data-act="editshop" data-id="${esc(s.id)}" class="text-sm rounded-full px-3.5 py-2 border bg-panel border-line text-fg active:border-mut/60">${esc(s.name)}</button>`).join('')
        || '<span class="text-xs text-mut">No shop yet.</span>'}
    </div>

    ${sectionTitle(`Items <span class="num normal-case tracking-normal">· ${state.items.length}</span>`, addBtn('newitem'))}
    ${state.items.length > 1 ? `
      <div class="flex items-center gap-2 overflow-x-auto mb-3">
        <span class="text-[11px] uppercase tracking-widest text-mut shrink-0">Order</span>
        ${chip(itemSort === 'az', 'data-act="sort" data-id="az"', 'A–Z')}
        ${state.shops.map(s => chip(itemSort === s.id, `data-act="sort" data-id="${esc(s.id)}"`, esc(s.name))).join('')}
      </div>` : ''}
    ${items.length ? `<div class="space-y-2">${items.map(itemRow).join('')}</div>`
      : `<div class="text-center text-mut text-sm py-8 border border-dashed border-line rounded-2xl">
           No items yet.<br>Add what you usually buy, with its position in each shop.
         </div>`}`;

  el.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    switch (btn.dataset.act) {
      case 'newshop': shopModal(); break;
      case 'editshop': shopModal(btn.dataset.id); break;
      case 'newitem': itemModal(); break;
      case 'edititem': itemModal(btn.dataset.id); break;
      case 'sort': itemSort = btn.dataset.id; refresh({ keepScroll: true }); break;
    }
  });
}

function itemRow(i) {
  return `
    <button data-act="edititem" data-id="${esc(i.id)}" class="w-full text-left bg-panel border border-line rounded-2xl px-4 py-3 active:border-mut/60 transition">
      <div class="flex items-center justify-between gap-3">
        <span class="font-600 truncate">${esc(i.name)}</span>
        <span class="text-mut text-lg leading-none shrink-0">›</span>
      </div>
      <div class="flex flex-wrap gap-1.5 mt-1.5">
        ${state.shops.map(s => hasPos(i, s.id)
          ? `<span class="text-[10px] num bg-steeld text-steel rounded-full px-2 py-0.5">${esc(s.name)} ${fmtPos(i.pos[s.id])}</span>`
          : `<span class="text-[10px] num border border-line text-mut rounded-full px-2 py-0.5">${esc(s.name)} —</span>`).join('')}
      </div>
    </button>`;
}

/* ---------- item popup ---------- */
function itemModal(id) {
  const item = id ? state.items.find(i => i.id === id) : null;
  const label = 'block text-xs uppercase tracking-widest text-mut mb-1';
  openModal(`
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-disp text-lg font-700">${item ? 'Edit item' : 'New item'}</h3>
      <button data-mact="close" class="text-mut text-xl leading-none">×</button>
    </div>
    <label class="${label}">Name</label>
    <input id="iname" autocomplete="off" value="${item ? esc(item.name) : ''}" placeholder="e.g. Milk" class="${inputCls} mb-5" />

    <label class="${label}">Position in each shop</label>
    <p class="text-[11px] text-mut mb-2">1 = at the entrance, higher = further along your route. Leave empty if you don't buy it there.</p>
    <div class="space-y-2 mb-6">
      ${state.shops.map(s => `
        <div class="flex items-center gap-3">
          <span class="flex-1 min-w-0 truncate text-sm">${esc(s.name)}</span>
          <input data-pos="${esc(s.id)}" inputmode="decimal" autocomplete="off" placeholder="—"
                 value="${item && hasPos(item, s.id) ? esc(fmtPos(item.pos[s.id])) : ''}"
                 class="num w-24 bg-panel2 border border-line rounded-xl px-3 py-2.5 text-fg text-center outline-none focus:border-amber/60" />
        </div>`).join('') || '<div class="text-xs text-mut">No shop yet — add one first.</div>'}
    </div>

    <div class="flex gap-2">
      ${item
        ? `<button data-mact="delitem" class="px-4 py-3 rounded-xl border border-line text-mut active:text-fg">Delete</button>
           <button data-mact="saveitem" class="flex-1 bg-amber text-ink font-700 rounded-xl py-3">Save</button>`
        : `<button data-mact="saveitemmore" class="flex-1 px-3 py-3 rounded-xl border border-line text-fg">Save + another</button>
           <button data-mact="saveitem" class="flex-1 bg-amber text-ink font-700 rounded-xl py-3">Save</button>`}
    </div>`, e => {
    const btn = e.target.closest('[data-mact]');
    if (!btn) return;
    const act = btn.dataset.mact;
    if (act === 'close') closeModal();
    else if (act === 'delitem') {
      if (!confirm('Delete this item?')) return;
      state.items = state.items.filter(i => i.id !== id);
      state.checked = state.checked.filter(x => x !== id);
      save(); closeModal(); refresh({ keepScroll: true });
    } else if (act === 'saveitem' || act === 'saveitemmore') {
      if (!saveItem(id)) return;
      if (act === 'saveitemmore') { refresh({ keepScroll: true }); itemModal(); toast('Saved'); }
      else { closeModal(); refresh({ keepScroll: true }); }
    }
  });
  if (!item) setTimeout(() => $('#iname')?.focus(), 50);
}

// Read the item popup and store it. Returns false (after telling the user) when invalid.
function saveItem(id) {
  const name = $('#iname').value.trim();
  if (!name) { toast('Name required'); return false; }
  if (state.items.some(i => i.id !== id && i.name.trim().toLowerCase() === name.toLowerCase())) {
    toast('This item already exists'); return false;
  }
  const pos = {};
  for (const inp of document.querySelectorAll('#modalCard input[data-pos]')) {
    const n = readNumber(inp.value);
    if (Number.isNaN(n)) { toast('A position must be a number'); return false; }
    if (n !== null) pos[inp.dataset.pos] = n;
  }
  if (id) {
    const item = state.items.find(i => i.id === id);
    item.name = name; item.pos = pos;
  } else {
    state.items.push({ id: uid(), name, pos });
  }
  save();
  return true;
}

/* ---------- shop popup ---------- */
function shopModal(id) {
  const shop = id ? state.shops.find(s => s.id === id) : null;
  openModal(`
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-disp text-lg font-700">${shop ? 'Edit shop' : 'New shop'}</h3>
      <button data-mact="close" class="text-mut text-xl leading-none">×</button>
    </div>
    <label class="block text-xs uppercase tracking-widest text-mut mb-1">Name</label>
    <input id="sname" autocomplete="off" value="${shop ? esc(shop.name) : ''}" placeholder="e.g. Colruyt" class="${inputCls} mb-6" />
    <div class="flex gap-2">
      ${shop ? '<button data-mact="delshop" class="px-4 py-3 rounded-xl border border-line text-mut active:text-fg">Delete</button>' : ''}
      <button data-mact="saveshop" class="flex-1 bg-amber text-ink font-700 rounded-xl py-3">Save</button>
    </div>`, e => {
    const btn = e.target.closest('[data-mact]');
    if (!btn) return;
    const act = btn.dataset.mact;
    if (act === 'close') closeModal();
    else if (act === 'saveshop') {
      const name = $('#sname').value.trim();
      if (!name) { toast('Name required'); return; }
      if (state.shops.some(s => s.id !== id && s.name.trim().toLowerCase() === name.toLowerCase())) { toast('This shop already exists'); return; }
      if (shop) shop.name = name;
      else state.shops.push({ id: uid(), name });
      save(); closeModal(); refresh({ keepScroll: true });
    } else if (act === 'delshop') {
      if (state.shops.length === 1) { toast('Keep at least one shop'); return; }
      if (!confirm(`Delete ${shop.name}? The positions of your items in this shop will be lost.`)) return;
      state.shops = state.shops.filter(s => s.id !== id);
      state.items.forEach(i => { delete i.pos[id]; });
      if (state.shop === id) state.shop = null;
      save(); closeModal(); refresh({ keepScroll: true });
    }
  });
  if (!shop) setTimeout(() => $('#sname')?.focus(), 50);
}

/* =========================================================================
   MODULE
   ========================================================================= */
export default {
  id: 'grocery',
  name: 'Grocery list',
  icon: icons.grocery,
  tabs: [
    { id: 'list',  label: 'List',  icon: icons.check },
    { id: 'items', label: 'Items', icon: icons.items },
  ],

  render(el, { tab }) {
    if (tab === 'items') renderItems(el);
    else renderList(el);
  },

  backup: {
    describe(storage) {
      try {
        const n = (JSON.parse(storage[KEY]).items || []).length;
        return `${n} grocery ${n === 1 ? 'item' : 'items'}`;
      } catch (e) { return null; }
    },
  },
};
