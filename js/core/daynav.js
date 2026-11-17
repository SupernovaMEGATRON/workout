/* The header of a "one day" screen: the day's name and ‹ › arrows to step through days
   (today at the latest). Used by Calories and Routine.
   Stepping replaces the current screen instead of piling up history, so the back
   gesture leaves the day view in one go. */
import { today, addDays, fmtDay, relDay } from './dates.js';
import { esc } from './ui.js';
import { go } from './shell.js';

export function dayHeader(day) {
  const isToday = day === today();
  const arrow = 'w-11 h-11 rounded-xl bg-panel border border-line text-fg text-xl leading-none active:border-amber/60';
  return `
    <div class="flex items-center justify-between gap-2 mb-4">
      <div class="min-w-0">
        <div class="font-disp text-2xl font-700 leading-none truncate">${isToday ? 'Today' : esc(fmtDay(day))}</div>
        <div class="text-xs text-mut num mt-1.5">${isToday ? esc(fmtDay(day)) : esc(relDay(day))}</div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        ${isToday ? '' : '<button data-daynav="today" class="text-xs text-amber border border-amber/50 rounded-full px-3 py-2">Today</button>'}
        <button data-daynav="prev" aria-label="Previous day" class="${arrow}">‹</button>
        <button data-daynav="next" aria-label="Next day" class="${arrow} ${isToday ? 'opacity-25 pointer-events-none' : ''}">›</button>
      </div>
    </div>`;
}

// base: the route the day is appended to, e.g. "calories/today".
export function wireDayNav(el, day, base) {
  el.addEventListener('click', e => {
    const btn = e.target.closest('[data-daynav]');
    if (!btn) return;
    const t = today();
    const target = btn.dataset.daynav === 'prev' ? addDays(day, -1)
                 : btn.dataset.daynav === 'next' ? (day < t ? addDays(day, 1) : t)
                 : t;
    go(`${base}/${target}`, { replace: true });
  });
}
