/* =========================================================================
   Calories — a day's calories and protein against that day's goals.

   Stored under "pablo_calories_v1":
     entries  { "YYYY-MM-DD": [{ id, kcal, protein, comment, at }] }
              kcal / protein are numbers or null; nothing is mandatory.
     goals    [{ from, set, kcal: [7], protein: [7] }] — one record per change, oldest
              first. A record applies from its `from` day until the next record
              (the first has from "" and applies to every earlier day too), so past
              days keep the goals they had. Arrays are Monday → Sunday; null = no goal.
              `set` is the day the record was last edited.

   Calories are a ceiling (over = bad). Protein is a target (reached = good).
   ========================================================================= */
import { $, esc, uid, toast, openModal, closeModal } from '../core/ui.js';
import { go, refresh } from '../core/shell.js';
import { icons } from '../core/icons.js';
import { today, addDays, isDay, weekdayIndex, fmtDay, relDay, WEEKDAYS } from '../core/dates.js';

const KEY = 'pablo_calories_v1';
const HISTORY_PAGE = 60;      // days shown at once in History

let state = load();
let historyShown = HISTORY_PAGE;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) {}
  return { goals: [], entries: {} };
}
// Must stay idempotent and non-destructive.
function migrate(data) {
  if (!Array.isArray(data.goals)) data.goals = [];
  if (!data.entries || typeof data.entries !== 'object') data.entries = {};
  return data;
}
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

/* ---------- numbers ---------- */
// "" → null (not given). "1,5" and "1.5" → 1.5. Anything else → NaN (invalid).
function readNumber(text) {
  const t = String(text ?? '').trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}
const fmt = n => String(Math.round((n || 0) * 10) / 10);

/* ---------- goals ---------- */
const sevenNulls = () => [null, null, null, null, null, null, null];

function goalRecordFor(day) {
  let rec = null;
  for (const g of state.goals) if (g.from <= day) rec = g;
  return rec;
}
// The goals that apply (or applied) on a given day.
export function goalFor(day) {
  const g = goalRecordFor(day), i = weekdayIndex(day);
  return { kcal: g ? g.kcal[i] : null, protein: g ? g.protein[i] : null };
}
function currentGoals() {
  return state.goals[state.goals.length - 1] || { kcal: sevenNulls(), protein: sevenNulls() };
}
// A change applies from today; earlier days keep the record they had.
function setGoal(kind, weekday, value) {
  const t = today();
  let last = state.goals[state.goals.length - 1];
  if (!last) {
    last = { from: '', set: t, kcal: sevenNulls(), protein: sevenNulls() };
    state.goals.push(last);
  } else if (last.set !== t && t > last.from) {
    last = { from: t, set: t, kcal: [...last.kcal], protein: [...last.protein] };
    state.goals.push(last);
  }
  last.set = t;
  last[kind][weekday] = value;
  save();
}

/* ---------- entries ---------- */
const entriesOf = day => state.entries[day] || [];

export function dayTotals(day) {
  const list = entriesOf(day);
  return {
    kcal: list.reduce((s, e) => s + (e.kcal || 0), 0),
    protein: list.reduce((s, e) => s + (e.protein || 0), 0),
    count: list.length,
  };
}

// Everything Home needs about one day.
export function daySummary(day) {
  return { day, totals: dayTotals(day), goal: goalFor(day) };
}

// Read the three fields of a form. Returns null (after telling the user) when invalid.
function readEntry(kcalText, proteinText, commentText) {
  const kcal = readNumber(kcalText), protein = readNumber(proteinText);
  const comment = String(commentText ?? '').trim();
  if (Number.isNaN(kcal)) { toast('Calories must be a number'); return null; }
  if (Number.isNaN(protein)) { toast('Protein must be a number'); return null; }
  if (kcal === null && protein === null && !comment) { toast('Enter calories, protein or a comment'); return null; }
  return { kcal, protein, comment };
}

function addEntry(day, values) {
  if (!state.entries[day]) state.entries[day] = [];
  state.entries[day].push({ id: uid(), ...values, at: Date.now() });
  save();
}
function updateEntry(day, id, values) {
  const e = entriesOf(day).find(x => x.id === id);
  if (!e) return;
  Object.assign(e, values);
  save();
}
function deleteEntry(day, id) {
  state.entries[day] = entriesOf(day).filter(x => x.id !== id);
  if (!state.entries[day].length) delete state.entries[day];
  save();
}

/* =========================================================================
   RENDER
   ========================================================================= */

// How a total stands against its goal. kind: 'ceiling' (calories) or 'target' (protein).
function standing(kind, total, goal) {
  if (goal == null) return { tone: 'text-fg', bar: 'bg-mut', noteTone: 'text-mut', note: 'No goal set', pct: 0 };
  const pct = goal > 0 ? Math.min(100, (total / goal) * 100) : (total > 0 ? 100 : 0);
  if (kind === 'ceiling') {
    return total > goal
      ? { tone: 'text-bad', bar: 'bg-bad', noteTone: 'text-bad', note: `${fmt(total - goal)} over`, pct }
      : { tone: 'text-fg', bar: 'bg-amber', noteTone: 'text-mut', note: `${fmt(goal - total)} left`, pct };
  }
  return total >= goal
    ? { tone: 'text-good', bar: 'bg-good', noteTone: 'text-good', note: 'Goal reached', pct }
    : { tone: 'text-fg', bar: 'bg-steel', noteTone: 'text-mut', note: `${fmt(goal - total)} to go`, pct };
}

function statBlock(label, kind, total, goal, unit) {
  const s = standing(kind, total, goal);
  return `
    <div data-stat="${kind}">
      <div class="text-[11px] uppercase tracking-widest text-mut mb-1.5">${label}</div>
      <div class="num text-3xl font-700 leading-none ${s.tone}">${fmt(total)}</div>
      <div class="num text-xs text-mut mt-1.5">${goal != null ? 'of ' + fmt(goal) + ' ' : ''}${unit}</div>
      <div class="h-1.5 rounded-full bg-line mt-3 overflow-hidden"><div class="h-full rounded-full ${s.bar}" style="width:${s.pct}%"></div></div>
      <div class="text-xs mt-1.5 ${s.noteTone}">${s.note}</div>
    </div>`;
}

const inputCls = 'w-full bg-panel2 border border-line rounded-xl px-3 py-3 text-fg outline-none focus:border-amber/60';

/* ---------- one day (Today tab, or a day opened from History) ---------- */
function renderDay(el, day, base) {
  const t = today(), isToday = day === t;
  const totals = dayTotals(day), goal = goalFor(day);
  const list = [...entriesOf(day)].sort((a, b) => b.at - a.at);
  const arrow = 'w-11 h-11 rounded-xl bg-panel border border-line text-fg text-xl leading-none active:border-amber/60';

  el.innerHTML = `
    <div class="flex items-center justify-between gap-2 mb-4">
      <div class="min-w-0">
        <div class="font-disp text-2xl font-700 leading-none truncate">${isToday ? 'Today' : esc(fmtDay(day))}</div>
        <div class="text-xs text-mut num mt-1.5">${isToday ? esc(fmtDay(day)) : esc(relDay(day))}</div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        ${isToday ? '' : '<button data-act="totoday" class="text-xs text-amber border border-amber/50 rounded-full px-3 py-2">Today</button>'}
        <button data-act="prev" aria-label="Previous day" class="${arrow}">‹</button>
        <button data-act="next" aria-label="Next day" class="${arrow} ${isToday ? 'opacity-25 pointer-events-none' : ''}">›</button>
      </div>
    </div>

    <div class="bg-panel border border-line rounded-2xl p-4 mb-3 grid grid-cols-2 gap-4">
      ${statBlock('Calories', 'ceiling', totals.kcal, goal.kcal, 'kcal')}
      ${statBlock('Protein', 'target', totals.protein, goal.protein, 'g')}
    </div>

    <div class="bg-panel border border-line rounded-2xl p-4 mb-6">
      <div class="grid grid-cols-2 gap-2 mb-2">
        <label class="block">
          <span class="block text-[11px] uppercase tracking-widest text-mut mb-1">Calories</span>
          <input id="ckcal" inputmode="decimal" enterkeyhint="done" autocomplete="off" placeholder="kcal" class="num ${inputCls}" />
        </label>
        <label class="block">
          <span class="block text-[11px] uppercase tracking-widest text-mut mb-1">Protein</span>
          <input id="cprotein" inputmode="decimal" enterkeyhint="done" autocomplete="off" placeholder="g" class="num ${inputCls}" />
        </label>
      </div>
      <div class="flex gap-2">
        <input id="ccomment" enterkeyhint="done" autocomplete="off" placeholder="What was it?" class="flex-1 min-w-0 ${inputCls}" />
        <button data-act="add" class="shrink-0 bg-amber text-ink font-700 rounded-xl px-5 active:scale-[.98] transition">Add</button>
      </div>
    </div>

    <div class="flex items-baseline justify-between mb-3">
      <h2 class="font-disp text-sm uppercase tracking-widest text-mut">Entries</h2>
      <span class="text-xs text-mut num">${list.length}</span>
    </div>
    ${list.length ? `<div class="space-y-2">${list.map(e => entryRow(e, day)).join('')}</div>`
      : `<div class="text-center text-mut text-sm py-8 border border-dashed border-line rounded-2xl">Nothing logged ${isToday ? 'today' : 'on this day'}.</div>`}`;

  const submit = () => {
    const values = readEntry($('#ckcal', el).value, $('#cprotein', el).value, $('#ccomment', el).value);
    if (!values) return;
    addEntry(day, values);
    refresh({ keepScroll: true });
  };
  const move = d => go(`${base}/${d}`, { replace: true });   // stepping days does not pile up history

  el.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    switch (btn.dataset.act) {
      case 'add': submit(); break;
      case 'prev': move(addDays(day, -1)); break;
      case 'next': if (!isToday) move(addDays(day, 1)); break;
      case 'totoday': move(t); break;
      case 'edit': entryModal(day, btn.dataset.id); break;
    }
  });
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('#ckcal, #cprotein, #ccomment')) { e.preventDefault(); submit(); }
  });
}

function entryRow(e, day) {
  const parts = [];
  if (e.kcal != null) parts.push(`${fmt(e.kcal)} kcal`);
  if (e.protein != null) parts.push(`${fmt(e.protein)} g`);
  // The time is only meaningful when the entry was typed on the day it belongs to.
  const d = new Date(e.at);
  const sameDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === day;
  const time = sameDay ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
  return `
    <button data-act="edit" data-id="${esc(e.id)}" class="w-full text-left bg-panel border border-line rounded-2xl px-4 py-3 flex items-center justify-between gap-3 active:border-mut/60 transition">
      <div class="min-w-0">
        <div class="truncate ${e.comment ? 'font-600' : 'text-mut'}">${e.comment ? esc(e.comment) : 'No comment'}</div>
        ${time ? `<div class="text-[11px] text-mut num mt-0.5">${esc(time)}</div>` : ''}
      </div>
      <div class="num text-sm text-steel shrink-0 text-right">${parts.join(' · ') || '—'}</div>
    </button>`;
}

function entryModal(day, id) {
  const e = entriesOf(day).find(x => x.id === id);
  if (!e) return;
  const label = 'block text-xs uppercase tracking-widest text-mut mb-1';
  openModal(`
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-disp text-lg font-700">Edit entry</h3>
      <button data-mact="close" class="text-mut text-xl leading-none">×</button>
    </div>
    <div class="grid grid-cols-2 gap-2 mb-4">
      <div>
        <label class="${label}">Calories</label>
        <input id="mkcal" inputmode="decimal" autocomplete="off" placeholder="kcal" value="${e.kcal != null ? esc(fmt(e.kcal)) : ''}" class="num ${inputCls}" />
      </div>
      <div>
        <label class="${label}">Protein</label>
        <input id="mprotein" inputmode="decimal" autocomplete="off" placeholder="g" value="${e.protein != null ? esc(fmt(e.protein)) : ''}" class="num ${inputCls}" />
      </div>
    </div>
    <label class="${label}">Comment</label>
    <input id="mcomment" autocomplete="off" placeholder="What was it?" value="${esc(e.comment)}" class="${inputCls} mb-6" />
    <div class="flex gap-2">
      <button data-mact="delete" class="px-4 py-3 rounded-xl border border-line text-mut active:text-fg">Delete</button>
      <button data-mact="save" class="flex-1 bg-amber text-ink font-700 rounded-xl py-3">Save</button>
    </div>`, ev => {
    const btn = ev.target.closest('[data-mact]');
    if (!btn) return;
    if (btn.dataset.mact === 'close') closeModal();
    else if (btn.dataset.mact === 'save') {
      const values = readEntry($('#mkcal').value, $('#mprotein').value, $('#mcomment').value);
      if (!values) return;
      updateEntry(day, id, values);
      closeModal(); refresh({ keepScroll: true });
    } else if (btn.dataset.mact === 'delete') {
      if (!confirm('Delete this entry?')) return;
      deleteEntry(day, id);
      closeModal(); refresh({ keepScroll: true });
    }
  });
}

/* ---------- history ---------- */
function historyLine(kind, total, goal, unit) {
  const s = standing(kind, total, goal);
  return `
    <div>
      <div class="num text-[13px]"><span class="font-700 ${s.tone}">${fmt(total)}</span><span class="text-mut">${goal != null ? ' / ' + fmt(goal) : ''} ${unit}</span></div>
      <div class="h-1 rounded-full bg-line mt-1.5 overflow-hidden"><div class="h-full rounded-full ${s.bar}" style="width:${s.pct}%"></div></div>
    </div>`;
}

function renderHistory(el) {
  const days = Object.keys(state.entries).filter(d => entriesOf(d).length).sort().reverse();
  const shown = days.slice(0, historyShown);

  let html = `<div class="flex items-baseline justify-between mb-3">
                <h2 class="font-disp text-sm uppercase tracking-widest text-mut">History</h2>
                <span class="text-xs text-mut num">${days.length} ${days.length === 1 ? 'day' : 'days'}</span>
              </div>`;
  if (!days.length) {
    html += `<div class="text-center text-mut text-sm py-10 border border-dashed border-line rounded-2xl">
               No days yet.<br>Add an entry in Today and the day lands here.
             </div>`;
  } else {
    html += '<div class="space-y-2">' + shown.map(day => {
      const t = dayTotals(day), g = goalFor(day);
      return `
        <button data-act="openday" data-day="${day}" class="w-full text-left bg-panel border border-line rounded-2xl px-4 py-3.5 active:border-mut/60 transition">
          <div class="flex items-baseline justify-between gap-3 mb-2.5">
            <span class="font-disp font-600 text-lg truncate">${esc(fmtDay(day))}</span>
            <span class="text-xs num text-mut shrink-0">${esc(relDay(day))}</span>
          </div>
          <div class="grid grid-cols-2 gap-4">
            ${historyLine('ceiling', t.kcal, g.kcal, 'kcal')}
            ${historyLine('target', t.protein, g.protein, 'g')}
          </div>
        </button>`;
    }).join('') + '</div>';
    if (days.length > shown.length) {
      html += `<button data-act="more" class="w-full mt-3 py-3 rounded-xl border border-line text-mut text-sm active:text-fg">Show older days</button>`;
    }
  }
  el.innerHTML = html;

  el.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'openday') go('calories/history/' + btn.dataset.day);
    else if (btn.dataset.act === 'more') { historyShown += HISTORY_PAGE; refresh({ keepScroll: true }); }
  });
}

/* ---------- goals ---------- */
function renderGoals(el) {
  const g = currentGoals(), todayIdx = weekdayIndex(today());
  const cell = (kind, i, unit) => `
    <div class="relative">
      <input data-goal="${kind}" data-i="${i}" inputmode="decimal" autocomplete="off" placeholder="—"
             value="${g[kind][i] != null ? esc(fmt(g[kind][i])) : ''}"
             class="num w-full bg-panel2 border border-line rounded-xl pl-3 pr-9 py-2.5 text-fg outline-none focus:border-amber/60" />
      <span class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-widest text-mut num pointer-events-none">${unit}</span>
    </div>`;

  el.innerHTML = `
    <h2 class="font-disp text-sm uppercase tracking-widest text-mut mb-3">Goals per day</h2>
    <div class="bg-panel border border-line rounded-2xl p-4 mb-4">
      <div class="grid grid-cols-[4.5rem_1fr_1fr] gap-2 items-center">
        <span></span>
        <span class="text-[11px] uppercase tracking-widest text-mut">Calories max</span>
        <span class="text-[11px] uppercase tracking-widest text-mut">Protein min</span>
        ${WEEKDAYS.map((name, i) => `
          <span class="text-sm ${i === todayIdx ? 'text-amber font-600' : 'text-fg'}">${name.slice(0, 3)}</span>
          ${cell('kcal', i, 'kcal')}
          ${cell('protein', i, 'g')}`).join('')}
      </div>
    </div>
    <p class="text-xs text-mut leading-relaxed">
      Calories are a ceiling: going over shows in red. Protein is a target: reaching it shows in green.
      Leave a field empty for no goal. Changes are saved as you type and apply from today; earlier days keep the goals they had.
    </p>`;

  el.addEventListener('input', e => {
    const inp = e.target.closest('input[data-goal]');
    if (!inp) return;
    const value = readNumber(inp.value);
    const bad = Number.isNaN(value);
    inp.classList.toggle('border-bad', bad);
    if (!bad) setGoal(inp.dataset.goal, +inp.dataset.i, value);
  });
}

/* =========================================================================
   MODULE
   ========================================================================= */
// A day in the address is only accepted if it is a real date, today or earlier.
const pastOrToday = d => (isDay(d) && d <= today() ? d : null);

export default {
  id: 'calories',
  name: 'Calories',
  icon: icons.calories,
  tabs: [
    { id: 'today',   label: 'Today',   icon: icons.today },
    { id: 'history', label: 'History', icon: icons.history },
    { id: 'goals',   label: 'Goals',   icon: icons.goals },
  ],

  render(el, { tab, params }) {
    if (tab === 'today') renderDay(el, pastOrToday(params[0]) || today(), 'calories/today');
    else if (tab === 'history') {
      const day = pastOrToday(params[0]);
      if (day) renderDay(el, day, 'calories/history');
      else renderHistory(el);
    } else renderGoals(el);
  },

  backup: {
    describe(storage) {
      try {
        const d = JSON.parse(storage[KEY]);
        const n = Object.values(d.entries || {}).filter(list => list && list.length).length;
        return `${n} ${n === 1 ? 'day' : 'days'} of calories`;
      } catch (e) { return null; }
    },
  },
};
