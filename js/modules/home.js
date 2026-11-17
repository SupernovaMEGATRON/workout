/* =========================================================================
   Home — today at a glance, from the other modules.

   - Calories and protein against today's goals (Calories).
   - Today's todos, tickable, with counters (Routine).
   - Today's project tasks, tickable (Projects).
   Nothing can be added here, and nothing about Workout or the grocery list.
   Late one-offs stay in Routine only.

   Home stores nothing: it reads and ticks through the other modules' exports.
   ========================================================================= */
import { esc } from '../core/ui.js';
import { go, refresh } from '../core/shell.js';
import { icons } from '../core/icons.js';
import { today, fmtDay } from '../core/dates.js';
import { daySummary, statBlock } from './calories.js';
import { itemsOn, rowHTML, handleRowClick } from './routine.js';
import { tasksOn, toggleTask } from './projects.js';

const tickBox = on => `<span class="shrink-0 w-7 h-7 rounded-lg border flex items-center justify-center font-700 ${on ? 'bg-amber border-amber text-ink' : 'border-mut/70 text-transparent'}">✓</span>`;

// A section title that also opens the module it comes from.
const title = (text, route, count) => `
  <button data-go="${route}" class="w-full flex items-baseline justify-between mb-2.5 mt-6 active:opacity-70">
    <h2 class="font-disp text-sm uppercase tracking-widest text-mut">${text}${count ? ` <span class="num normal-case tracking-normal">· ${count}</span>` : ''}</h2>
    <span class="text-mut text-lg leading-none">›</span>
  </button>`;

function render(el) {
  const day = today();
  const cal = daySummary(day);
  const todos = itemsOn(day);
  const tasks = tasksOn(day);
  const todosDone = todos.filter(i => i.done).length, tasksDone = tasks.filter(t => t.done).length;
  const total = todos.length + tasks.length, done = todosDone + tasksDone;
  const all = total > 0 && done === total;

  const taskRow = it => `
    <div class="bg-panel border border-line rounded-2xl" style="box-shadow: inset 3px 0 0 0 #F5A524">
      <button data-act="ptick" data-p="${esc(it.projectId)}" data-t="${esc(it.taskId)}" class="w-full min-w-0 flex items-center gap-3 pl-4 pr-3 py-3 text-left active:bg-panel2 rounded-2xl">
        ${tickBox(it.done)}
        <span class="flex-1 min-w-0">
          <span class="block truncate ${it.done ? 'text-mut line-through' : ''}">${esc(it.title)}</span>
          <span class="block text-[11px] text-mut truncate">${esc([it.projectName, ...it.path].join(' › '))}</span>
        </span>
      </button>
    </div>`;

  el.innerHTML = `
    <div class="flex items-end justify-between gap-3 mb-4">
      <div class="min-w-0">
        <div class="font-disp text-2xl font-700 leading-none">Today</div>
        <div class="text-xs text-mut num mt-1.5">${esc(fmtDay(day))}</div>
      </div>
      ${total ? `<div class="num text-right shrink-0"><span class="text-2xl font-700 ${all ? 'text-good' : 'text-fg'}">${done}</span><span class="text-sm text-mut">/${total} done</span></div>` : ''}
    </div>

    <button data-go="calories/today" class="w-full text-left bg-panel border border-line rounded-2xl p-4 grid grid-cols-2 gap-4 active:border-mut/60">
      ${statBlock('Calories', 'ceiling', cal.totals.kcal, cal.goal.kcal, 'kcal')}
      ${statBlock('Protein', 'target', cal.totals.protein, cal.goal.protein, 'g')}
    </button>

    ${title('Todos', 'routine/today', todos.length ? `${todosDone}/${todos.length}` : '')}
    ${todos.length ? `<div class="space-y-2">${todos.map(i => rowHTML(i, day)).join('')}</div>`
      : '<div class="text-xs text-mut">Nothing to do in Routine today.</div>'}

    ${title('Projects', 'planning', tasks.length ? `${tasksDone}/${tasks.length}` : '')}
    ${tasks.length ? `<div class="space-y-2">${tasks.map(taskRow).join('')}</div>`
      : '<div class="text-xs text-mut">No project task planned today.</div>'}`;

  el.addEventListener('click', e => {
    if (handleRowClick(e)) { refresh({ keepScroll: true }); return; }
    const tick = e.target.closest('[data-act="ptick"]');
    if (tick) { if (toggleTask(tick.dataset.p, tick.dataset.t)) refresh({ keepScroll: true }); return; }
    const link = e.target.closest('[data-go]');
    if (link) go(link.dataset.go);
  });
}

export default {
  id: 'home',
  name: 'Home',
  icon: icons.home,
  tabs: [],
  render,
};
