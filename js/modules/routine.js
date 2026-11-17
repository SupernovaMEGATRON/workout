/* =========================================================================
   Routine — small things to do, most of them repeated.

   Stored under "pablo_routine_v1":
     todos   [{ id, name, times, kind, … }]
             kind "once"  → date                       one-off, due that day
             kind "every" → date (start), every {n, unit: day|week|month|year}
             kind "days"  → days [0…6]                 (Monday = 0), every week
             one-off extras: doneOn (the later day it was finally done),
                             cleared (dismissed from Late)
     log     { "YYYY-MM-DD": { <todoId>: count } }     how many times it was done that day
     days    { "YYYY-MM-DD": [{ id, name, times, kind: "once"|"routine", late?, from? }] }
             what was due on each PAST day, frozen (see freeze()).
     frozen  the last day that is frozen (always yesterday or earlier)

   Past days never change: before any todo is edited or deleted, and each time the
   app is used, every day up to yesterday is written down in `days` from the todos as
   they are at that moment. Today and future days are computed live from `todos`.

   Recurring todos never carry over. A one-off that was not done on its day shows in
   "Late" (on Today only) until it is ticked — it then counts on the day it was
   finally done — or cleared.
   ========================================================================= */
import { $, esc, uid, toast, openModal, closeModal } from '../core/ui.js';
import { go, refresh } from '../core/shell.js';
import { icons } from '../core/icons.js';
import { today, addDays, isDay, daysBetween, weekdayIndex, fmtDay, relDay, WEEKDAYS } from '../core/dates.js';
import { dayHeader, wireDayNav } from '../core/daynav.js';

const KEY = 'pablo_routine_v1';
const HISTORY_PAGE = 60;
const MAX_TIMES = 20;

let state = load();
let historyShown = HISTORY_PAGE;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) {}
  return { todos: [], log: {}, days: {}, frozen: null };
}
// Must stay idempotent and non-destructive.
function migrate(data) {
  if (!Array.isArray(data.todos)) data.todos = [];
  if (!data.log || typeof data.log !== 'object') data.log = {};
  if (!data.days || typeof data.days !== 'object') data.days = {};
  if (data.frozen === undefined) data.frozen = null;
  return data;
}
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

/* =========================================================================
   SCHEDULE
   ========================================================================= */
const parts = day => { const [y, m, d] = day.split('-').map(Number); return { y, m, d }; };
const daysInMonth = (y, m) => new Date(y, m, 0).getDate();

// Is a recurring todo (or a one-off, on its own date) due on this day?
function isDue(todo, day) {
  if (todo.kind === 'once') return todo.date === day;
  if (todo.kind === 'days') return (todo.days || []).includes(weekdayIndex(day));

  const start = todo.date, n = Math.max(1, todo.every.n), unit = todo.every.unit;
  if (day < start) return false;
  if (unit === 'day') return daysBetween(start, day) % n === 0;
  if (unit === 'week') return daysBetween(start, day) % (7 * n) === 0;
  // Months and years fall on the same day of the month; a start on the 31st (or on
  // 29 February) uses the last day of shorter months.
  const a = parts(start), b = parts(day);
  const sameDayOfMonth = b.d === Math.min(a.d, daysInMonth(b.y, b.m));
  if (unit === 'month') return ((b.y - a.y) * 12 + (b.m - a.m)) % n === 0 && sameDayOfMonth;
  return (b.y - a.y) % n === 0 && b.m === a.m && sameDayOfMonth;
}

// The next day (today or later) a recurring todo is due, or null.
function nextDue(todo) {
  let d = today();
  for (let i = 0; i < 4000; i++, d = addDays(d, 1)) if (isDue(todo, d)) return d;
  return null;
}

/* =========================================================================
   DAYS
   ========================================================================= */
const countOf = (day, id) => (state.log[day] && state.log[day][id]) || 0;
function setCount(day, id, n) {
  if (n > 0) { state.log[day] = state.log[day] || {}; state.log[day][id] = n; }
  else if (state.log[day]) { delete state.log[day][id]; if (!Object.keys(state.log[day]).length) delete state.log[day]; }
}

// What a day's list remembers about a todo.
const snap = t => ({ id: t.id, name: t.name, times: t.times, kind: t.kind === 'once' ? 'once' : 'routine' });

// What is due on a day, computed from the todos as they are now.
function liveItems(day) {
  const out = [];
  for (const t of state.todos) {
    if (t.kind === 'once' && t.doneOn === day && t.date !== day) out.push({ ...snap(t), times: 1, late: true, from: t.date });
    else if (isDue(t, day)) out.push(snap(t));
  }
  return out;
}

// Write down every day up to yesterday that is not written down yet.
// Call before changing any todo, and whenever a screen is drawn.
function freeze() {
  const yesterday = addDays(today(), -1);
  if (!state.frozen) {                       // first use: nothing existed before today
    if (!state.todos.length) return;
    state.frozen = yesterday; save(); return;
  }
  if (state.frozen >= yesterday) return;
  for (let d = addDays(state.frozen, 1); d <= yesterday; d = addDays(d, 1)) {
    const items = liveItems(d);
    if (items.length) state.days[d] = items;
  }
  state.frozen = yesterday;
  // One-offs that are over and dealt with are no longer needed; the frozen days keep them.
  state.todos = state.todos.filter(t => !(t.kind === 'once' && t.date <= yesterday &&
    (t.cleared || (t.doneOn && t.doneOn <= yesterday) || countOf(t.date, t.id) >= t.times)));
  save();
}
const isFrozen = day => !!state.frozen && day <= state.frozen;

/* ---------- for this module, Planning and Home ---------- */

// Everything due on a day, one-offs first: [{ id, name, times, kind, count, done, late?, from? }]
export function itemsOn(day) {
  freeze();
  const list = isFrozen(day) ? (state.days[day] || []) : liveItems(day);
  return list
    .map(it => { const count = Math.min(countOf(day, it.id), it.times); return { ...it, count, done: count >= it.times }; })
    .sort((a, b) => (a.kind === 'once' ? 0 : 1) - (b.kind === 'once' ? 0 : 1));
}

export function dayStats(day) {
  const items = itemsOn(day);
  return { total: items.length, done: items.filter(i => i.done).length };
}

// One-off todos whose day has passed and that are neither done nor cleared.
export function lateItems() {
  freeze();
  const t = today();
  return state.todos
    .filter(x => x.kind === 'once' && x.date < t && !x.cleared && !x.doneOn && countOf(x.date, x.id) < x.times)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// Tap on an item: +1 (delta 1) or −1 (delta −1). A once-a-day item toggles.
// Returns true when something changed.
export function bump(day, id, delta) {
  const it = itemsOn(day).find(x => x.id === id);
  if (!it) return false;
  let next;
  if (it.times === 1) next = delta > 0 && !it.count ? 1 : 0;
  else next = Math.max(0, Math.min(it.times, it.count + delta));
  if (next === it.count) return false;
  setCount(day, id, next);
  if (it.late) {                                   // a one-off finished late: unticking sends it back to Late
    const todo = state.todos.find(x => x.id === id);
    if (todo) { if (next) todo.doneOn = day; else delete todo.doneOn; }
  }
  save();
  return true;
}

export function completeLate(id) {
  const todo = state.todos.find(x => x.id === id);
  if (!todo) return;
  todo.doneOn = today();
  setCount(todo.doneOn, id, 1);
  save();
}
export function clearLate(id) {
  const todo = state.todos.find(x => x.id === id);
  if (!todo) return;
  todo.cleared = true;
  save();
}

// One-off todos per day between two days (inclusive), for the dots in Planning:
// { "YYYY-MM-DD": { total, done } }
export function oneOffsBetween(from, to) {
  freeze();
  const out = {};
  const add = (day, done) => { out[day] = out[day] || { total: 0, done: 0 }; out[day].total++; if (done) out[day].done++; };
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (isFrozen(d)) (state.days[d] || []).filter(i => i.kind === 'once' && !i.late).forEach(i => add(d, countOf(d, i.id) >= i.times));
  }
  state.todos.filter(t => t.kind === 'once' && t.date >= from && t.date <= to && !isFrozen(t.date))
    .forEach(t => add(t.date, countOf(t.date, t.id) >= t.times));
  return out;
}

export function addOneOff(name, day, times = 1) {
  freeze();
  const todo = { id: uid(), name, times, kind: 'once', date: day };
  state.todos.push(todo);
  if (!state.frozen) state.frozen = addDays(today(), -1);
  save();
  return todo.id;
}
// Move a one-off (today or later) to another day. Returns false if it cannot be moved.
export function setOneOffDate(id, day) {
  freeze();
  const todo = state.todos.find(x => x.id === id && x.kind === 'once');
  if (!todo || !isDay(day)) return false;
  setCount(todo.date, id, 0);
  todo.date = day;
  delete todo.cleared; delete todo.doneOn;
  save();
  return true;
}

/* ---------- rows, shared with Planning and Home ----------
   rowHTML() draws one item; handleRowClick() applies a tap on it and says whether
   something changed (the caller then redraws). */
const tickBox = on => `<span class="shrink-0 w-7 h-7 rounded-lg border flex items-center justify-center font-700 ${on ? 'bg-amber border-amber text-ink' : 'border-mut/70 text-transparent'}">✓</span>`;

export function rowHTML(it, day) {
  const counter = it.times > 1
    ? `<span class="num shrink-0 min-w-[2.75rem] h-7 px-1.5 rounded-lg border flex items-center justify-center text-sm font-700 ${it.done ? 'bg-amber border-amber text-ink' : it.count ? 'border-amber/60 text-amber' : 'border-mut/70 text-mut'}">${it.count}/${it.times}</span>`
    : tickBox(it.done);
  const once = it.kind === 'once';
  return `
    <div class="bg-panel border border-line rounded-2xl flex items-stretch overflow-hidden" ${once ? 'style="box-shadow: inset 3px 0 0 0 #7FA6C9"' : ''}>
      <button data-rt="bump" data-id="${esc(it.id)}" data-day="${day}" class="flex-1 min-w-0 flex items-center gap-3 pl-4 pr-3 py-3 text-left active:bg-panel2">
        ${counter}
        <span class="flex-1 min-w-0 truncate ${it.done ? 'text-mut line-through' : ''}">${esc(it.name)}</span>
        ${it.late ? `<span class="shrink-0 text-[10px] num text-mut">from ${esc(fmtDay(it.from))}</span>` : ''}
      </button>
      ${it.times > 1 && it.count > 0
        ? `<button data-rt="undo" data-id="${esc(it.id)}" data-day="${day}" aria-label="Undo one" class="shrink-0 w-12 border-l border-line text-mut text-xl leading-none active:text-fg active:bg-panel2">−</button>` : ''}
    </div>`;
}

export function handleRowClick(e) {
  const btn = e.target.closest('[data-rt]');
  if (!btn) return false;
  return bump(btn.dataset.day, btn.dataset.id, btn.dataset.rt === 'undo' ? -1 : 1);
}

/* =========================================================================
   RENDER
   ========================================================================= */
const inputCls = 'w-full bg-panel2 border border-line rounded-xl px-3 py-3 text-fg outline-none focus:border-amber/60';
const sectionTitle = (text, extra) => `
  <div class="flex items-baseline justify-between mb-2.5 mt-5">
    <h2 class="font-disp text-sm uppercase tracking-widest text-mut">${text}</h2>${extra || ''}
  </div>`;

function progressCard(stats) {
  const all = stats.total > 0 && stats.done === stats.total;
  const pct = stats.total ? (stats.done / stats.total) * 100 : 0;
  return `
    <div class="bg-panel border border-line rounded-2xl p-4">
      <div class="flex items-baseline justify-between gap-3">
        <div class="num"><span class="text-3xl font-700 ${all ? 'text-good' : 'text-fg'}">${stats.done}</span><span class="text-sm text-mut"> of ${stats.total} done</span></div>
        <span class="text-xs ${all ? 'text-good' : 'text-mut'}">${!stats.total ? '' : all ? 'All done' : `${stats.total - stats.done} left`}</span>
      </div>
      <div class="h-1.5 rounded-full bg-line mt-3 overflow-hidden"><div class="h-full rounded-full ${all ? 'bg-good' : 'bg-amber'}" style="width:${pct}%"></div></div>
    </div>`;
}

/* ---------- one day (Today tab, or a day opened from History) ---------- */
function renderDay(el, day, base) {
  const isToday = day === today();
  const items = itemsOn(day);
  const once = items.filter(i => i.kind === 'once'), routine = items.filter(i => i.kind !== 'once');
  const late = isToday ? lateItems() : [];

  el.innerHTML = `
    ${dayHeader(day)}
    ${progressCard({ total: items.length, done: items.filter(i => i.done).length })}

    ${late.length ? `
      ${sectionTitle(`<span class="text-bad">Late</span> <span class="num normal-case tracking-normal">· ${late.length}</span>`,
        '<button data-act="clearall" class="text-xs text-mut active:text-fg">Clear all</button>')}
      <div class="space-y-2">
        ${late.map(t => `
          <div class="bg-panel border border-bad/40 rounded-2xl flex items-stretch overflow-hidden">
            <button data-act="donelate" data-id="${esc(t.id)}" class="flex-1 min-w-0 flex items-center gap-3 pl-4 pr-3 py-3 text-left active:bg-panel2">
              ${tickBox(false)}
              <span class="flex-1 min-w-0">
                <span class="block truncate">${esc(t.name)}</span>
                <span class="block text-[11px] num text-mut">${esc(fmtDay(t.date))} · ${esc(relDay(t.date))}</span>
              </span>
            </button>
            <button data-act="clearlate" data-id="${esc(t.id)}" aria-label="Clear" class="shrink-0 w-12 border-l border-line text-mut text-lg leading-none active:text-fg active:bg-panel2">×</button>
          </div>`).join('')}
      </div>` : ''}

    ${once.length || isToday ? sectionTitle('One-off') : ''}
    ${once.length ? `<div class="space-y-2">${once.map(i => rowHTML(i, day)).join('')}</div>`
      : isToday ? '<div class="text-xs text-mut">Nothing one-off today.</div>' : ''}

    ${routine.length ? sectionTitle('Routine') + `<div class="space-y-2">${routine.map(i => rowHTML(i, day)).join('')}</div>` : ''}

    ${!items.length && !isToday ? `<div class="text-center text-mut text-sm py-8 mt-5 border border-dashed border-line rounded-2xl">Nothing was due on this day.</div>` : ''}
    ${!routine.length && isToday ? `<div class="text-center text-mut text-sm py-8 mt-5 border border-dashed border-line rounded-2xl">No routine today.<br>Add your todos in the Todos tab.</div>` : ''}`;

  wireDayNav(el, day, base);
  el.addEventListener('click', e => {
    if (handleRowClick(e)) { refresh({ keepScroll: true }); return; }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    switch (btn.dataset.act) {
      case 'donelate': completeLate(btn.dataset.id); refresh({ keepScroll: true }); break;
      case 'clearlate': clearLate(btn.dataset.id); refresh({ keepScroll: true }); break;
      case 'clearall':
        if (!confirm('Clear all late todos? They will stop appearing here.')) return;
        lateItems().forEach(t => { t.cleared = true; });
        save(); refresh({ keepScroll: true });
        break;
    }
  });
}

/* ---------- history ---------- */
function renderHistory(el) {
  freeze();
  const t = today();
  const days = Object.keys(state.days).filter(d => state.days[d].length);
  if (liveItems(t).length) days.push(t);
  days.sort().reverse();
  const shown = days.slice(0, historyShown);

  let html = `<div class="flex items-baseline justify-between mb-3">
                <h2 class="font-disp text-sm uppercase tracking-widest text-mut">History</h2>
                <span class="text-xs text-mut num">${days.length} ${days.length === 1 ? 'day' : 'days'}</span>
              </div>`;
  if (!days.length) {
    html += `<div class="text-center text-mut text-sm py-10 border border-dashed border-line rounded-2xl">No days yet.<br>Each day with something to do lands here.</div>`;
  } else {
    html += '<div class="space-y-2">' + shown.map(day => {
      const s = dayStats(day), all = s.done === s.total;
      return `
        <button data-act="openday" data-day="${day}" class="w-full text-left bg-panel border border-line rounded-2xl px-4 py-3.5 active:border-mut/60 transition">
          <div class="flex items-baseline justify-between gap-3">
            <span class="font-disp font-600 text-lg truncate">${esc(fmtDay(day))}</span>
            <span class="num text-sm shrink-0"><span class="font-700 ${all ? 'text-good' : 'text-fg'}">${s.done}</span><span class="text-mut"> of ${s.total} done</span></span>
          </div>
          <div class="h-1 rounded-full bg-line mt-2.5 overflow-hidden"><div class="h-full rounded-full ${all ? 'bg-good' : 'bg-amber'}" style="width:${(s.done / s.total) * 100}%"></div></div>
        </button>`;
    }).join('') + '</div>';
    if (days.length > shown.length) html += `<button data-act="more" class="w-full mt-3 py-3 rounded-xl border border-line text-mut text-sm active:text-fg">Show older days</button>`;
  }
  el.innerHTML = html;

  el.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'openday') go('routine/history/' + btn.dataset.day);
    else if (btn.dataset.act === 'more') { historyShown += HISTORY_PAGE; refresh({ keepScroll: true }); }
  });
}

/* ---------- todos ---------- */
const SHORT = WEEKDAYS.map(n => n.slice(0, 3));
const UNITS = { day: ['day', 'days'], week: ['week', 'weeks'], month: ['month', 'months'], year: ['year', 'years'] };

function describe(todo) {
  let text;
  if (todo.kind === 'once') text = fmtDay(todo.date);
  else if (todo.kind === 'days') {
    const d = [...todo.days].sort((a, b) => a - b), key = d.join('');
    text = key === '0123456' ? 'Every day' : key === '01234' ? 'Mon–Fri' : key === '56' ? 'Sat–Sun' : d.map(i => SHORT[i]).join(', ');
  } else {
    const { n, unit } = todo.every;
    text = n === 1 ? `Every ${UNITS[unit][0]}` : `Every ${n} ${UNITS[unit][1]}`;
    if (!(unit === 'day' && n === 1)) {
      const next = nextDue(todo);
      if (next) text += ` · next ${next === today() ? 'today' : fmtDay(next)}`;
    }
  }
  return todo.times > 1 ? `${text} · ${todo.times}× a day` : text;
}

function renderTodos(el) {
  freeze();
  const t = today();
  const recurring = state.todos.filter(x => x.kind !== 'once');
  const once = state.todos.filter(x => x.kind === 'once' && !x.cleared && !x.doneOn && !(x.date < t && countOf(x.date, x.id) >= x.times))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const row = (x, onceRow) => `
    <button data-act="edit" data-id="${esc(x.id)}" class="w-full text-left bg-panel border border-line rounded-2xl px-4 py-3 active:border-mut/60 transition" ${onceRow ? 'style="box-shadow: inset 3px 0 0 0 #7FA6C9"' : ''}>
      <div class="flex items-center justify-between gap-3">
        <span class="font-600 truncate">${esc(x.name)}</span>
        <span class="text-mut text-lg leading-none shrink-0">›</span>
      </div>
      <div class="text-xs num mt-1 ${onceRow && x.date < t ? 'text-bad' : 'text-mut'}">${esc(describe(x))}${onceRow && x.date < t ? ' · late' : ''}</div>
    </button>`;

  el.innerHTML = `
    <div class="flex items-baseline justify-between mb-3">
      <h2 class="font-disp text-sm uppercase tracking-widest text-mut">Routine <span class="num normal-case tracking-normal">· ${recurring.length}</span></h2>
    </div>
    ${recurring.length ? `<div class="space-y-2">${recurring.map(x => row(x, false)).join('')}</div>`
      : `<div class="text-center text-mut text-sm py-8 border border-dashed border-line rounded-2xl">No recurring todo yet.<br>Add the things you do every day or every week.</div>`}

    ${sectionTitle(`One-off <span class="num normal-case tracking-normal">· ${once.length}</span>`)}
    ${once.length ? `<div class="space-y-2">${once.map(x => row(x, true)).join('')}</div>`
      : '<div class="text-xs text-mut">No one-off todo to come.</div>'}

    <button data-act="new" class="w-full mt-7 bg-amber text-ink font-700 rounded-xl py-3.5 text-base active:scale-[.99] transition">Add a todo</button>
    <p class="text-[11px] text-mut text-center mt-2">Recurring or one-off: choose it with “Repeat”.</p>`;

  el.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'new') todoModal(null, { kind: 'days' });
    else if (btn.dataset.act === 'edit') todoModal(btn.dataset.id);
  });
}

/* ---------- todo popup (create / edit) ---------- */
function todoModal(id, preset = {}) {
  const todo = id ? state.todos.find(x => x.id === id) : null;
  let kind = todo ? todo.kind : (preset.kind || 'days');
  let times = todo ? todo.times : 1;
  const days = new Set(todo && todo.kind === 'days' ? todo.days : [0, 1, 2, 3, 4, 5, 6]);
  const date = todo && todo.date ? todo.date : (preset.date || today());
  const every = todo && todo.kind === 'every' ? todo.every : { n: 1, unit: 'day' };
  const label = 'block text-xs uppercase tracking-widest text-mut mb-1';
  const seg = (k, text) => `<button data-kind="${k}">${text}</button>`;      // styled by sync()

  openModal(`
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-disp text-lg font-700">${todo ? 'Edit todo' : 'New todo'}</h3>
      <button data-mact="close" class="text-mut text-xl leading-none">×</button>
    </div>
    <label class="${label}">Name</label>
    <input id="rname" autocomplete="off" value="${todo ? esc(todo.name) : ''}" placeholder="e.g. Take supplements" class="${inputCls} mb-4" />

    <label class="${label}">Repeat</label>
    <div class="flex gap-2 mb-4">${seg('days', 'Set days')}${seg('every', 'Every…')}${seg('once', 'One-off')}</div>

    <div data-sec="days" class="mb-4">
      <div class="grid grid-cols-7 gap-1.5">
        ${SHORT.map((n, i) => `<button data-wd="${i}">${n}</button>`).join('')}
      </div>
      <p class="text-[11px] text-mut mt-2">Repeats every week on the selected days.</p>
    </div>

    <div data-sec="every" class="mb-4">
      <div class="flex items-center gap-2">
        <span class="text-sm text-mut shrink-0">Every</span>
        <input id="rn" inputmode="numeric" autocomplete="off" value="${esc(every.n)}" class="num w-20 bg-panel2 border border-line rounded-xl px-3 py-3 text-fg text-center outline-none focus:border-amber/60" />
        <select id="runit" class="flex-1 min-w-0 bg-panel2 border border-line rounded-xl px-3 py-3 text-fg outline-none focus:border-amber/60" style="color-scheme: dark">
          ${Object.keys(UNITS).map(u => `<option value="${u}" ${u === every.unit ? 'selected' : ''}>${UNITS[u][1]}</option>`).join('')}
        </select>
      </div>
    </div>

    <div data-sec="date" class="mb-4">
      <label class="${label}" id="rdatelabel">Date</label>
      <input id="rdate" type="date" value="${esc(date)}" class="num ${inputCls}" style="color-scheme: dark" />
    </div>

    <label class="${label}">Times per day</label>
    <div class="flex items-center gap-4 mb-6">
      <button data-times="-1" class="w-11 h-11 rounded-xl bg-panel2 border border-line text-fg text-2xl leading-none active:border-amber/60">−</button>
      <span id="rtimes" class="num text-3xl font-700 w-10 text-center">${times}</span>
      <button data-times="1" class="w-11 h-11 rounded-xl bg-panel2 border border-line text-fg text-2xl leading-none active:border-amber/60">+</button>
    </div>

    <div class="flex gap-2">
      ${todo ? '<button data-mact="delete" class="px-4 py-3 rounded-xl border border-line text-mut active:text-fg">Delete</button>' : ''}
      <button data-mact="save" class="flex-1 bg-amber text-ink font-700 rounded-xl py-3">Save</button>
    </div>`, e => {
    const k = e.target.closest('[data-kind]');
    if (k) { kind = k.dataset.kind; sync(); return; }
    const wd = e.target.closest('[data-wd]');
    if (wd) { const i = +wd.dataset.wd; if (days.has(i)) days.delete(i); else days.add(i); sync(); return; }
    const tm = e.target.closest('[data-times]');
    if (tm) { times = Math.max(1, Math.min(MAX_TIMES, times + (+tm.dataset.times))); $('#rtimes').textContent = times; return; }

    const btn = e.target.closest('[data-mact]');
    if (!btn) return;
    if (btn.dataset.mact === 'close') closeModal();
    else if (btn.dataset.mact === 'delete') {
      if (!confirm(`Delete “${todo.name}”? Past days keep it as it was.`)) return;
      freeze();
      state.todos = state.todos.filter(x => x.id !== todo.id);
      setCount(today(), todo.id, 0);
      save(); closeModal(); refresh({ keepScroll: true });
    } else if (btn.dataset.mact === 'save') {
      const name = $('#rname').value.trim();
      if (!name) { toast('Name required'); return; }
      const fields = { name, times, kind };
      if (kind === 'days') {
        if (!days.size) { toast('Select at least one day'); return; }
        fields.days = [...days].sort((a, b) => a - b);
      } else {
        const d = $('#rdate').value;
        if (!isDay(d)) { toast('Choose a date'); return; }
        fields.date = d;
        if (kind === 'every') {
          const n = Number($('#rn').value.trim());
          if (!Number.isInteger(n) || n < 1) { toast('“Every” must be a whole number, 1 or more'); return; }
          fields.every = { n, unit: $('#runit').value };
        }
      }
      freeze();                                  // past days are written down before the change
      if (todo) {
        const moved = todo.kind === 'once' && (kind !== 'once' || fields.date !== todo.date);
        ['days', 'date', 'every'].forEach(key => { delete todo[key]; });
        if (moved) { delete todo.cleared; delete todo.doneOn; }
        Object.assign(todo, fields);
      } else {
        state.todos.push({ id: uid(), ...fields });
        if (!state.frozen) state.frozen = addDays(today(), -1);
      }
      save(); closeModal(); refresh({ keepScroll: true });
    }
  });

  // Show the fields of the chosen kind of repetition.
  function sync() {
    document.querySelectorAll('#modalCard [data-kind]').forEach(b => {
      const on = b.dataset.kind === kind;
      b.className = `flex-1 rounded-xl border px-2 py-2.5 text-sm ${on ? 'bg-amberd/60 border-amber/60 text-amber font-600' : 'bg-panel2 border-line text-mut'}`;
    });
    document.querySelectorAll('#modalCard [data-wd]').forEach(b => {
      const on = days.has(+b.dataset.wd);
      b.className = `rounded-lg border py-2.5 text-xs ${on ? 'bg-amber border-amber text-ink font-700' : 'bg-panel2 border-line text-mut'}`;
    });
    document.querySelector('#modalCard [data-sec="days"]').classList.toggle('hidden', kind !== 'days');
    document.querySelector('#modalCard [data-sec="every"]').classList.toggle('hidden', kind !== 'every');
    document.querySelector('#modalCard [data-sec="date"]').classList.toggle('hidden', kind === 'days');
    $('#rdatelabel').textContent = kind === 'every' ? 'Starting on' : 'Date';
  }
  sync();
  if (!todo) setTimeout(() => $('#rname')?.focus(), 50);
}

/* =========================================================================
   MODULE
   ========================================================================= */
const pastOrToday = d => (isDay(d) && d <= today() ? d : null);

export default {
  id: 'routine',
  name: 'Routine',
  icon: icons.routine,
  tabs: [
    { id: 'today',   label: 'Today',   icon: icons.today },
    { id: 'todos',   label: 'Todos',   icon: icons.items },
    { id: 'history', label: 'History', icon: icons.history },
  ],

  render(el, { tab, params }) {
    if (tab === 'today') renderDay(el, pastOrToday(params[0]) || today(), 'routine/today');
    else if (tab === 'history') {
      const day = pastOrToday(params[0]);
      if (day) renderDay(el, day, 'routine/history');
      else renderHistory(el);
    } else renderTodos(el);
  },

  backup: {
    describe(storage) {
      try {
        const d = JSON.parse(storage[KEY]);
        const n = (d.todos || []).length, days = Object.keys(d.days || {}).length;
        return `${n} ${n === 1 ? 'todo' : 'todos'} · ${days} routine ${days === 1 ? 'day' : 'days'}`;
      } catch (e) { return null; }
    },
  },
};
