/* =========================================================================
   Planning — everything that has a date, from Projects and Routine.

   Stores nothing of its own: every item belongs to Projects (dated tasks) or Routine
   (todos), and is read and changed through their exported functions.

   - Month view: dots on days with a project task (amber) or a one-off todo (blue).
     Recurring routines make no dots: they would mark every day.
   - The day in focus (today by default) sits on top: project tasks, one-off todos,
     and the recurring routines folded into one line.
   - From a day: tick anything, add a one-off todo, change the date of a project task
     or of a one-off todo (today or later).
   - Nothing is shown as late here, and no calories.
   ========================================================================= */
import { $, esc, toast, openModal, closeModal } from '../core/ui.js';
import { go, refresh } from '../core/shell.js';
import { icons } from '../core/icons.js';
import { today, addDays, isDay, weekdayIndex, fmtDay, relDay } from '../core/dates.js';
import { datedTasks, tasksOn, toggleTask, setTaskDate, taskRoute } from './projects.js';
import { itemsOn, oneOffsBetween, bump, addOneOff, setOneOffDate, rowHTML, handleRowClick } from './routine.js';

const MAX_TIMES = 20;

let monthShown = null;      // "YYYY-MM" of the month grid
let lastDay = null;         // the day in focus at the previous draw
let routineOpen = false;    // recurring routines unfolded in the day view

const inputCls = 'w-full bg-panel2 border border-line rounded-xl px-3 py-3 text-fg outline-none focus:border-amber/60';
const PROJECT_EDGE = 'box-shadow: inset 3px 0 0 0 #F5A524';
const ONEOFF_EDGE = 'box-shadow: inset 3px 0 0 0 #7FA6C9';

const tickBox = on => `<span class="shrink-0 w-7 h-7 rounded-lg border flex items-center justify-center font-700 ${on ? 'bg-amber border-amber text-ink' : 'border-mut/70 text-transparent'}">✓</span>`;
const counterBox = it => `<span class="num shrink-0 min-w-[2.75rem] h-7 px-1.5 rounded-lg border flex items-center justify-center text-sm font-700 ${it.done ? 'bg-amber border-amber text-ink' : it.count ? 'border-amber/60 text-amber' : 'border-mut/70 text-mut'}">${it.count}/${it.times}</span>`;
const sideBtn = (attrs, label, sym) => `<button ${attrs} aria-label="${label}" class="shrink-0 w-12 border-l border-line text-mut text-xl leading-none active:text-fg active:bg-panel2">${sym}</button>`;

/* =========================================================================
   DAY
   ========================================================================= */
function dayView(day) {
  const t = today(), isToday = day === t, editable = day >= t;
  const tasks = tasksOn(day);
  const items = itemsOn(day);
  const once = items.filter(i => i.kind === 'once');
  const routine = items.filter(i => i.kind !== 'once');
  const routineDone = routine.filter(i => i.done).length;

  const title = (dot, text, extra) => `
    <div class="flex items-baseline justify-between mb-2.5 mt-5">
      <h2 class="font-disp text-sm uppercase tracking-widest text-mut flex items-center gap-2">
        ${dot ? `<span class="w-2 h-2 rounded-full ${dot} self-center"></span>` : ''}${text}
      </h2>${extra || ''}
    </div>`;

  const taskRow = it => `
    <div class="bg-panel border border-line rounded-2xl flex items-stretch overflow-hidden" style="${PROJECT_EDGE}">
      <button data-act="ptick" data-p="${esc(it.projectId)}" data-t="${esc(it.taskId)}" class="flex-1 min-w-0 flex items-center gap-3 pl-4 pr-3 py-3 text-left active:bg-panel2">
        ${tickBox(it.done)}
        <span class="flex-1 min-w-0">
          <span class="block truncate ${it.done ? 'text-mut line-through' : ''}">${esc(it.title)}</span>
          <span class="block text-[11px] text-mut truncate">${esc([it.projectName, ...it.path].join(' › '))}</span>
        </span>
      </button>
      ${sideBtn(`data-act="pmore" data-p="${esc(it.projectId)}" data-t="${esc(it.taskId)}"`, 'Details', '›')}
    </div>`;

  const onceRow = it => `
    <div class="bg-panel border border-line rounded-2xl flex items-stretch overflow-hidden" style="${ONEOFF_EDGE}">
      <button data-act="obump" data-id="${esc(it.id)}" class="flex-1 min-w-0 flex items-center gap-3 pl-4 pr-3 py-3 text-left active:bg-panel2">
        ${it.times > 1 ? counterBox(it) : tickBox(it.done)}
        <span class="flex-1 min-w-0 truncate ${it.done ? 'text-mut line-through' : ''}">${esc(it.name)}</span>
        ${it.late ? `<span class="shrink-0 text-[10px] num text-mut">from ${esc(fmtDay(it.from))}</span>` : ''}
      </button>
      ${it.times > 1 && it.count > 0 ? sideBtn(`data-act="oundo" data-id="${esc(it.id)}"`, 'Undo one', '−') : ''}
      ${editable && !it.late ? sideBtn(`data-act="omore" data-id="${esc(it.id)}"`, 'Change date', '›') : ''}
    </div>`;

  return `
    <div class="flex items-center justify-between gap-2">
      <div class="min-w-0">
        <div class="font-disp text-2xl font-700 leading-none truncate">${isToday ? 'Today' : esc(fmtDay(day))}</div>
        <div class="text-xs text-mut num mt-1.5">${isToday ? esc(fmtDay(day)) : esc(relDay(day))}</div>
      </div>
      ${isToday ? '' : '<button data-act="totoday" class="shrink-0 text-xs text-amber border border-amber/50 rounded-full px-3 py-2">Today</button>'}
    </div>

    ${tasks.length ? title('bg-amber', `Projects <span class="num normal-case tracking-normal">· ${tasks.length}</span>`)
      + `<div class="space-y-2">${tasks.map(taskRow).join('')}</div>` : ''}

    ${title('bg-steel', `One-off <span class="num normal-case tracking-normal">· ${once.length}</span>`,
      editable ? '<button data-act="add" class="text-xs text-amber font-600">+ Add</button>' : '')}
    ${once.length ? `<div class="space-y-2">${once.map(onceRow).join('')}</div>` : '<div class="text-xs text-mut">No one-off todo on this day.</div>'}

    ${routine.length ? `
      <button data-act="routine" class="w-full mt-5 bg-panel border border-line rounded-2xl px-4 py-3 flex items-center justify-between gap-3 active:border-mut/60">
        <span class="font-disp text-sm uppercase tracking-widest text-mut">Routine</span>
        <span class="flex items-center gap-3"><span class="num text-sm ${routineDone === routine.length ? 'text-good' : 'text-fg'}">${routineDone}/${routine.length}</span><span class="text-mut">${routineOpen ? '▴' : '▾'}</span></span>
      </button>
      ${routineOpen ? `<div class="space-y-2 mt-2">${routine.map(i => rowHTML(i, day)).join('')}</div>` : ''}` : ''}

    ${!tasks.length && !once.length && !routine.length ? '<div class="text-center text-mut text-sm py-6 mt-4 border border-dashed border-line rounded-2xl">Nothing planned.</div>' : ''}`;
}

/* =========================================================================
   MONTH
   ========================================================================= */
function monthView(day) {
  const t = today();
  const [y, m] = monthShown.split('-').map(Number);
  const first = `${monthShown}-01`;
  const last = addDays(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`, -1);
  const gridStart = addDays(first, -weekdayIndex(first));
  const gridEnd = addDays(last, 6 - weekdayIndex(last));

  // Dots: { day: { p: {total, done}, o: {total, done} } }
  const marks = {};
  datedTasks().filter(x => x.day >= gridStart && x.day <= gridEnd).forEach(x => {
    const d = (marks[x.day] = marks[x.day] || {});
    d.p = d.p || { total: 0, done: 0 }; d.p.total++; if (x.done) d.p.done++;
  });
  Object.entries(oneOffsBetween(gridStart, gridEnd)).forEach(([d, v]) => { (marks[d] = marks[d] || {}).o = v; });
  const dot = (v, colour) => (v ? `<span class="w-1.5 h-1.5 rounded-full ${colour} ${v.done === v.total ? 'opacity-35' : ''}"></span>` : '');

  const cells = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) {
    const inMonth = d.slice(0, 7) === monthShown, mk = marks[d] || {};
    cells.push(`
      <button data-act="pick" data-day="${d}" class="h-12 rounded-xl flex flex-col items-center justify-center gap-1 border ${d === day ? 'bg-panel2 border-amber/70' : 'border-transparent'} ${inMonth ? '' : 'opacity-35'} active:bg-panel2">
        <span class="num text-sm leading-none ${d === t ? 'text-amber font-700' : ''}">${Number(d.slice(8))}</span>
        <span class="flex gap-1 h-1.5">${dot(mk.p, 'bg-amber')}${dot(mk.o, 'bg-steel')}</span>
      </button>`);
  }
  const name = new Date(y, m - 1, 15).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const arrow = 'w-10 h-10 rounded-xl bg-panel2 border border-line text-fg text-lg leading-none active:border-amber/60';

  return `
    <div class="bg-panel border border-line rounded-2xl p-3 mt-7">
      <div class="flex items-center justify-between mb-2 px-1">
        <button data-act="month" data-delta="-1" aria-label="Previous month" class="${arrow}">‹</button>
        <span class="font-disp font-600 text-base">${esc(name.charAt(0).toUpperCase() + name.slice(1))}</span>
        <button data-act="month" data-delta="1" aria-label="Next month" class="${arrow}">›</button>
      </div>
      <div class="grid grid-cols-7 gap-0.5 text-center">
        ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(l => `<span class="text-[10px] text-mut num py-1">${l}</span>`).join('')}
        ${cells.join('')}
      </div>
      <div class="flex items-center justify-center gap-4 mt-2 text-[11px] text-mut">
        <span class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-amber"></span>Project task</span>
        <span class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-steel"></span>One-off todo</span>
      </div>
    </div>`;
}

function shiftMonth(delta) {
  let [y, m] = monthShown.split('-').map(Number);
  m += delta;
  if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
  monthShown = `${y}-${String(m).padStart(2, '0')}`;
}

/* =========================================================================
   POPUPS
   ========================================================================= */
const label = 'block text-xs uppercase tracking-widest text-mut mb-1';

function taskModal(projectId, taskId) {
  const it = datedTasks().find(x => x.projectId === projectId && x.taskId === taskId);
  if (!it) return;
  openModal(`
    <div class="flex items-start justify-between gap-3 mb-4">
      <div class="min-w-0">
        <h3 class="font-disp text-lg font-700 break-words">${esc(it.title)}</h3>
        <div class="text-[11px] text-mut mt-0.5 truncate">${esc([it.projectName, ...it.path].join(' › '))}</div>
      </div>
      <button data-mact="close" class="text-mut text-xl leading-none">×</button>
    </div>
    <label class="${label}">Date</label>
    <div class="flex gap-2 mb-6">
      <input id="pldate" type="date" value="${esc(it.day)}" class="num flex-1 min-w-0 ${inputCls}" style="color-scheme: dark" />
      <button data-mact="nodate" class="shrink-0 px-4 rounded-xl border border-line text-mut text-sm active:text-fg">No date</button>
    </div>
    <div class="flex gap-2">
      <button data-mact="open" class="flex-1 px-3 py-3 rounded-xl border border-line text-fg">Open in Projects</button>
      <button data-mact="save" class="flex-1 bg-amber text-ink font-700 rounded-xl py-3">Save</button>
    </div>`, e => {
    const btn = e.target.closest('[data-mact]');
    if (!btn) return;
    const act = btn.dataset.mact;
    if (act === 'close') closeModal();
    else if (act === 'nodate') $('#pldate').value = '';
    else if (act === 'open') closeModal(() => go(taskRoute(projectId, taskId)));
    else if (act === 'save') {
      const d = $('#pldate').value;
      setTaskDate(projectId, taskId, isDay(d) ? d : null);
      if (d !== it.day) toast(isDay(d) ? `Moved to ${fmtDay(d)}` : 'Date removed');
      closeModal(); refresh({ keepScroll: true });
    }
  });
}

function oneOffModal(item, day) {
  openModal(`
    <div class="flex items-center justify-between gap-3 mb-4">
      <h3 class="font-disp text-lg font-700 break-words min-w-0">${esc(item.name)}</h3>
      <button data-mact="close" class="text-mut text-xl leading-none">×</button>
    </div>
    <label class="${label}">Date</label>
    <input id="pldate" type="date" min="${today()}" value="${esc(day)}" class="num ${inputCls} mb-6" style="color-scheme: dark" />
    <div class="flex gap-2">
      <button data-mact="open" class="flex-1 px-3 py-3 rounded-xl border border-line text-fg">Open in Routine</button>
      <button data-mact="save" class="flex-1 bg-amber text-ink font-700 rounded-xl py-3">Save</button>
    </div>`, e => {
    const btn = e.target.closest('[data-mact]');
    if (!btn) return;
    const act = btn.dataset.mact;
    if (act === 'close') closeModal();
    else if (act === 'open') closeModal(() => go('routine/todos'));
    else if (act === 'save') {
      const d = $('#pldate').value;
      if (!isDay(d) || d < today()) { toast('Choose today or a later day'); return; }
      if (d !== day) {
        if (!setOneOffDate(item.id, d)) { toast('This todo can no longer be moved'); return; }
        toast(`Moved to ${fmtDay(d)}`);
      }
      closeModal(); refresh({ keepScroll: true });
    }
  });
}

function addModal(day) {
  let times = 1;
  openModal(`
    <div class="flex items-center justify-between mb-1">
      <h3 class="font-disp text-lg font-700">New one-off todo</h3>
      <button data-mact="close" class="text-mut text-xl leading-none">×</button>
    </div>
    <div class="text-xs text-mut num mb-4">${esc(fmtDay(day))} · ${esc(relDay(day))}</div>
    <label class="${label}">Name</label>
    <input id="plname" autocomplete="off" enterkeyhint="done" placeholder="e.g. Call the bank" class="${inputCls} mb-4" />
    <label class="${label}">Times that day</label>
    <div class="flex items-center gap-4 mb-6">
      <button data-times="-1" class="w-11 h-11 rounded-xl bg-panel2 border border-line text-fg text-2xl leading-none active:border-amber/60">−</button>
      <span id="pltimes" class="num text-3xl font-700 w-10 text-center">1</span>
      <button data-times="1" class="w-11 h-11 rounded-xl bg-panel2 border border-line text-fg text-2xl leading-none active:border-amber/60">+</button>
    </div>
    <button data-mact="save" class="w-full bg-amber text-ink font-700 rounded-xl py-3">Add</button>`, e => {
    const tm = e.target.closest('[data-times]');
    if (tm) { times = Math.max(1, Math.min(MAX_TIMES, times + (+tm.dataset.times))); $('#pltimes').textContent = times; return; }
    const btn = e.target.closest('[data-mact]');
    if (!btn) return;
    if (btn.dataset.mact === 'close') closeModal();
    else if (btn.dataset.mact === 'save') save();
  });
  const save = () => {
    const name = $('#plname').value.trim();
    if (!name) { toast('Name required'); return; }
    addOneOff(name, day, times);
    closeModal(); refresh({ keepScroll: true });
  };
  $('#plname').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  setTimeout(() => $('#plname')?.focus(), 50);
}

/* =========================================================================
   MODULE
   ========================================================================= */
function render(el, { params }) {
  const day = isDay(params[0]) ? params[0] : today();
  if (day !== lastDay || !monthShown) { monthShown = day.slice(0, 7); lastDay = day; }

  el.innerHTML = dayView(day) + monthView(day);

  el.addEventListener('click', e => {
    if (handleRowClick(e)) { refresh({ keepScroll: true }); return; }   // recurring routines
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const d = btn.dataset;
    switch (d.act) {
      case 'pick': go(`planning/${d.day}`, { replace: true }); break;
      case 'totoday': go(`planning/${today()}`, { replace: true }); break;
      case 'month': shiftMonth(+d.delta); refresh({ keepScroll: true }); break;
      case 'routine': routineOpen = !routineOpen; refresh({ keepScroll: true }); break;
      case 'add': addModal(day); break;
      case 'ptick': if (toggleTask(d.p, d.t)) refresh({ keepScroll: true }); break;
      case 'pmore': taskModal(d.p, d.t); break;
      case 'obump': if (bump(day, d.id, 1)) refresh({ keepScroll: true }); break;
      case 'oundo': if (bump(day, d.id, -1)) refresh({ keepScroll: true }); break;
      case 'omore': {
        const it = itemsOn(day).find(x => x.id === d.id);
        if (it) oneOffModal(it, day);
        break;
      }
    }
  });
}

export default {
  id: 'planning',
  name: 'Planning',
  icon: icons.calendar,
  tabs: [],
  render,
};
