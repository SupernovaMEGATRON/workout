/* =========================================================================
   Projects — a project holds tasks, tasks hold subtasks, with no depth limit.

   Stored under "pablo_projects_v1":
     projects  [{ id, name, description, done, tasks: [task] }]
     task      { id, title, note, date ("YYYY-MM-DD" or null), done, tasks: [task] }

   Rules
   - A task with subtasks is done exactly when all its subtasks are done (derived
     after every change, see settle()). A project likewise, if it has tasks.
   - Ticking / unticking a task does the same to all its subtasks, at every depth.
   - Progress: each direct subtask has the same weight, and a partly done subtask
     counts for its own progress. A done; B has 10 subtasks, 1 done → (1 + 0.1) / 2 = 55%.
   - A dated task that is past and not done gets no special treatment anywhere.

   Navigation is one level at a time. A card shows a task with a read-only preview
   of its direct subtasks; tapping it opens the task. Inside this module a task can
   be ticked only on its own screen or on its parent's screen — never on the project
   screen.
   ========================================================================= */
import { $, esc, uid, toast, openModal, closeModal } from '../core/ui.js';
import { go, up, refresh } from '../core/shell.js';
import { icons } from '../core/icons.js';
import { isDay, fmtDay, relDay } from '../core/dates.js';

const KEY = 'pablo_projects_v1';
const PREVIEW_MAX = 8;        // subtasks listed in a card's preview

let state = load();
let reorderOn = null;         // the screen (route) currently in reorder mode, if any

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) {}
  return { projects: [] };
}
// Must stay idempotent and non-destructive.
function migrate(data) {
  if (!Array.isArray(data.projects)) data.projects = [];
  const fix = node => {
    if (!Array.isArray(node.tasks)) node.tasks = [];
    node.tasks.forEach(fix);
  };
  data.projects.forEach(fix);
  return data;
}

/* ---------- the tree ---------- */
const kids = node => node.tasks || [];
const hasKids = node => kids(node).length > 0;
const countAll = node => kids(node).reduce((n, t) => n + 1 + countAll(t), 0);   // subtasks at every depth

// 0 … 1. A project or task without subtasks is 0 or 1.
function progress(node) {
  const list = kids(node);
  if (!list.length) return node.done ? 1 : 0;
  return list.reduce((sum, t) => sum + progress(t), 0) / list.length;
}
const pct = node => Math.round(progress(node) * 100) + '%';

// Derive the done state of everything that has subtasks.
function settle(node, isProject) {
  kids(node).forEach(t => settle(t, false));
  if (hasKids(node)) node.done = kids(node).every(t => t.done);
  else if (isProject) node.done = false;       // an empty project is not finished
}
function setDone(task, value) {
  task.done = value;
  kids(task).forEach(t => setDone(t, value));
}

// Find a task anywhere in a project: { task, parent (task or project), path: [ancestor tasks] }.
function find(project, id, parent = project, path = []) {
  for (const t of kids(parent)) {
    if (t.id === id) return { task: t, parent, path };
    const hit = find(project, id, t, [...path, t]);
    if (hit) return hit;
  }
  return null;
}
const projectById = id => state.projects.find(p => p.id === id);

// Save after any change. Tells the user when a project just got finished.
function commit() {
  const before = new Map(state.projects.map(p => [p.id, p.done]));
  state.projects.forEach(p => settle(p, true));
  localStorage.setItem(KEY, JSON.stringify(state));
  const finished = state.projects.find(p => p.done && before.get(p.id) === false);
  if (finished) toast('Project finished — moved to Done');
}

// Tick or untick a task (and all its subtasks). Asks first when subtasks are affected,
// because the previous state of the subtasks cannot be brought back.
function toggle(task) {
  const value = !task.done, n = countAll(task);
  if (n) {
    const what = `“${task.title}” and its ${n} ${n === 1 ? 'subtask' : 'subtasks'}`;
    if (!confirm(value ? `Mark ${what} as done?` : `Mark ${what} as not done?`)) return false;
  }
  setDone(task, value);
  commit();
  return true;
}

/* ---------- for Planning and Home ---------- */
const tabOf = project => (project.done ? 'done' : 'active');

// Every task that has a date: [{ day, projectId, projectName, taskId, title, done, path }]
export function datedTasks() {
  const out = [];
  const walk = (project, node, path) => kids(node).forEach(t => {
    if (t.date) out.push({ day: t.date, projectId: project.id, projectName: project.name, taskId: t.id, title: t.title, done: !!t.done, path });
    walk(project, t, [...path, t.title]);
  });
  state.projects.forEach(p => walk(p, p, []));
  return out;
}
export const tasksOn = day => datedTasks().filter(t => t.day === day);

// Returns true when the task changed.
export function toggleTask(projectId, taskId) {
  const project = projectById(projectId), hit = project && find(project, taskId);
  return hit ? toggle(hit.task) : false;
}
export function setTaskDate(projectId, taskId, day) {
  const project = projectById(projectId), hit = project && find(project, taskId);
  if (!hit) return;
  hit.task.date = isDay(day) ? day : null;
  commit();
}
export function taskRoute(projectId, taskId) {
  const project = projectById(projectId);
  return project ? `projects/${tabOf(project)}/${projectId}/${taskId}` : 'projects/active';
}

/* =========================================================================
   RENDER — shared pieces
   ========================================================================= */
const inputCls = 'w-full bg-panel2 border border-line rounded-xl px-3 py-3 text-fg outline-none focus:border-amber/60';

const bar = node => `
  <div class="h-1.5 rounded-full bg-line overflow-hidden"><div class="h-full rounded-full bg-amber" style="width:${progress(node) * 100}%"></div></div>`;

// Small read-only state mark (previews, project screen).
const mark = done => (done
  ? '<span class="shrink-0 w-4 h-4 rounded-full bg-amber text-ink text-[10px] font-700 flex items-center justify-center leading-none">✓</span>'
  : '<span class="shrink-0 w-4 h-4 rounded-full border border-mut/70"></span>');

// Tick box (task screen and subtask cards).
const tickBox = (done, size) => `
  <span class="${size} rounded-lg border flex items-center justify-center font-700 ${done ? 'bg-amber border-amber text-ink' : 'border-mut/70 text-transparent'}">✓</span>`;

const dateChip = day => `<span class="text-[11px] num bg-steeld text-steel rounded-full px-2 py-0.5">${esc(fmtDay(day))}</span>`;

const upLink = label => `
  <button data-act="up" class="flex items-center gap-1 text-sm text-mut active:text-fg mb-3 max-w-full">
    <span class="text-lg leading-none">‹</span><span class="truncate">${esc(label)}</span>
  </button>`;

function preview(task) {
  const list = kids(task);
  if (!list.length) return '';
  const more = list.length - PREVIEW_MAX;
  return `
    <div class="mt-3 space-y-1.5">
      ${list.slice(0, PREVIEW_MAX).map(t => {
        const n = kids(t).length;
        return `
          <div class="flex items-center gap-2 text-sm">
            ${mark(t.done)}
            <span class="truncate ${t.done ? 'text-mut line-through' : ''}">${esc(t.title)}</span>
            ${n ? `<span class="shrink-0 text-[11px] text-mut num">${n} ${n === 1 ? 'subtask' : 'subtasks'}</span>` : ''}
          </div>`;
      }).join('')}
      ${more > 0 ? `<div class="text-[11px] text-mut num pl-6">+ ${more} more</div>` : ''}
    </div>`;
}

// One task as a card. tickable: on its parent's screen. reorder: show ↑ ↓ instead.
function taskCard(task, i, total, { tickable, reorder }) {
  const body = `
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2 min-w-0">
        ${tickable || reorder ? '' : mark(task.done)}
        <span class="font-disp font-600 text-lg truncate ${task.done ? 'text-mut line-through' : ''}">${esc(task.title)}</span>
      </div>
      <div class="shrink-0 flex items-center gap-2">
        ${hasKids(task) ? `<span class="num text-xs text-mut">${pct(task)}</span>` : ''}
        ${reorder ? '' : '<span class="text-mut text-lg leading-none">›</span>'}
      </div>
    </div>
    ${task.date ? `<div class="mt-1.5">${dateChip(task.date)}</div>` : ''}
    ${hasKids(task) ? `<div class="mt-2.5">${bar(task)}</div>` : ''}
    ${reorder ? '' : preview(task)}`;

  if (reorder) {
    const arrow = (act, sym, off) => `<button data-act="${act}" data-id="${esc(task.id)}" class="w-10 h-10 rounded-lg border border-line text-mut active:text-fg text-base ${off ? 'opacity-25 pointer-events-none' : ''}">${sym}</button>`;
    return `
      <div class="bg-panel border border-line rounded-2xl pl-4 pr-2 py-2.5 flex items-center gap-2">
        <div class="flex-1 min-w-0">${body}</div>
        ${arrow('moveup', '↑', i === 0)}${arrow('movedown', '↓', i === total - 1)}
      </div>`;
  }
  return `
    <div class="bg-panel border border-line rounded-2xl flex items-stretch overflow-hidden">
      ${tickable ? `<button data-act="tick" data-id="${esc(task.id)}" aria-label="${task.done ? 'Mark as not done' : 'Mark as done'}" class="shrink-0 w-14 flex items-start justify-center pt-3.5 active:bg-panel2">${tickBox(task.done, 'w-7 h-7 text-base')}</button>` : ''}
      <button data-act="open" data-id="${esc(task.id)}" class="flex-1 min-w-0 text-left py-3.5 pr-4 ${tickable ? '' : 'pl-4'} active:bg-panel2">${body}</button>
    </div>`;
}

// The list of a node's tasks, with its title row and the "add" field.
function taskSection(node, title, { tickable, reorder, canReorder }) {
  const list = kids(node);
  const doneCount = list.filter(t => t.done).length;
  return `
    <div class="flex items-baseline justify-between mb-3">
      <h2 class="font-disp text-sm uppercase tracking-widest text-mut">${title}${list.length ? ` <span class="num normal-case tracking-normal">· ${doneCount}/${list.length}</span>` : ''}</h2>
      ${canReorder && list.length > 1 ? `<button data-act="reorder" class="text-xs text-amber font-600">${reorder ? 'Finish' : 'Reorder'}</button>` : ''}
    </div>
    ${list.length ? `<div class="space-y-2">${list.map((t, i) => taskCard(t, i, list.length, { tickable, reorder })).join('')}</div>` : ''}
    ${reorder ? '' : `
      <div class="flex gap-2 ${list.length ? 'mt-3' : ''}">
        <input id="newtask" enterkeyhint="done" autocomplete="off" placeholder="${title === 'Tasks' ? 'New task…' : 'New subtask…'}" class="flex-1 min-w-0 ${inputCls}" />
        <button data-act="add" class="shrink-0 bg-amber text-ink font-700 rounded-xl px-5 active:scale-[.98] transition">Add</button>
      </div>`}`;
}

// Events shared by the project screen and the task screen (both list the tasks of `node`).
function wireTasks(el, node, base, here) {
  const add = () => {
    const input = $('#newtask', el), title = input.value.trim();
    if (!title) { toast('Type a name first'); return; }
    node.tasks.push({ id: uid(), title, note: '', date: null, done: false, tasks: [] });
    commit();
    refresh({ keepScroll: true });
    $('#newtask')?.focus();                    // keep typing the next one
  };
  const move = (id, delta) => {
    const list = node.tasks, i = list.findIndex(t => t.id === id), j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    commit();
    refresh({ keepScroll: true });
  };

  el.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.dataset.id;
    switch (btn.dataset.act) {
      case 'add': add(); break;
      case 'open': go(`${base}/${id}`); break;
      case 'tick': { const t = kids(node).find(x => x.id === id); if (t && toggle(t)) refresh({ keepScroll: true }); break; }
      case 'reorder': reorderOn = reorderOn === here ? null : here; refresh({ keepScroll: true }); break;
      case 'moveup': move(id, -1); break;
      case 'movedown': move(id, 1); break;
    }
  });
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'newtask') { e.preventDefault(); add(); }
  });
}

/* =========================================================================
   SCREENS
   ========================================================================= */

/* ---------- list of projects (Projects tab / Done tab) ---------- */
function renderProjects(el, tab) {
  const list = state.projects.filter(p => tabOf(p) === tab);
  el.innerHTML = `
    <div class="flex items-baseline justify-between mb-3">
      <h2 class="font-disp text-sm uppercase tracking-widest text-mut">${tab === 'done' ? 'Finished projects' : 'Projects'} <span class="num normal-case tracking-normal">· ${list.length}</span></h2>
      ${tab === 'active' ? '<button data-act="newproject" class="text-xs text-amber font-600">+ New</button>' : ''}
    </div>
    ${list.length ? `<div class="space-y-2">${list.map(p => {
      const n = countAll(p);
      return `
        <button data-act="openproject" data-id="${esc(p.id)}" class="w-full text-left bg-panel border border-line rounded-2xl p-4 active:border-mut/60 transition">
          <div class="flex items-center justify-between gap-3">
            <span class="font-disp font-600 text-lg truncate">${esc(p.name)}</span>
            <span class="shrink-0 flex items-center gap-2"><span class="num text-xs text-mut">${pct(p)}</span><span class="text-mut text-lg leading-none">›</span></span>
          </div>
          ${p.description ? `<div class="text-xs text-mut mt-1 line-clamp-2 whitespace-pre-line">${esc(p.description)}</div>` : ''}
          <div class="mt-3">${bar(p)}</div>
          <div class="text-[11px] text-mut num mt-1.5">${n} ${n === 1 ? 'task' : 'tasks'}</div>
        </button>`;
    }).join('')}</div>`
    : `<div class="text-center text-mut text-sm py-10 border border-dashed border-line rounded-2xl">
         ${tab === 'done' ? 'No finished project yet.<br>A project lands here when all its tasks are done.'
                          : 'No project in progress.<br>Create one to break it down into tasks.'}
       </div>`}`;

  el.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'newproject') projectModal();
    else if (btn.dataset.act === 'openproject') go(`projects/${tab}/${btn.dataset.id}`);
  });
}

/* ---------- one project: its top-level tasks, read-only ---------- */
function renderProject(el, project, tab) {
  const base = `projects/${tab}/${project.id}`, here = base;
  const reorder = reorderOn === here;
  el.innerHTML = `
    ${upLink(tab === 'done' ? 'Finished projects' : 'Projects')}
    <div class="bg-panel border border-line rounded-2xl p-4 mb-6">
      <div class="flex items-start justify-between gap-3">
        <h2 class="font-disp text-2xl font-700 leading-tight min-w-0 break-words">${esc(project.name)}</h2>
        <button data-act="editproject" class="shrink-0 text-xs text-mut border border-line rounded-full px-3 py-1.5 active:text-fg">Edit</button>
      </div>
      ${project.description ? `<p class="text-sm text-mut whitespace-pre-wrap break-words mt-2">${esc(project.description)}</p>` : ''}
      <div class="flex items-center gap-3 mt-4">
        <div class="flex-1">${bar(project)}</div>
        <span class="num text-sm ${project.done ? 'text-amber font-700' : 'text-mut'}">${pct(project)}</span>
      </div>
    </div>
    ${taskSection(project, 'Tasks', { tickable: false, reorder, canReorder: true })}`;

  wireTasks(el, project, base, here);
  el.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'up') up(`projects/${tab}`);
    else if (btn.dataset.act === 'editproject') projectModal(project.id, tab);
  });
}

/* ---------- one task: its own information, then its subtasks ---------- */
function renderTask(el, project, hit, tab) {
  const { task, parent, path } = hit;
  const root = `projects/${tab}/${project.id}`;
  const base = root, here = `${root}/${task.id}`;
  const parentRoute = parent === project ? root : `${root}/${parent.id}`;
  const reorder = reorderOn === here;
  const crumbs = [project.name, ...path.map(t => t.title)];

  el.innerHTML = `
    ${upLink(parent === project ? project.name : parent.title)}
    <div class="bg-panel border border-line rounded-2xl p-4 mb-6">
      <div class="flex items-start gap-3">
        <button data-act="tickself" aria-label="${task.done ? 'Mark as not done' : 'Mark as done'}" class="shrink-0 -m-1 p-1">${tickBox(task.done, 'w-9 h-9 text-xl')}</button>
        <div class="flex-1 min-w-0">
          <h2 class="font-disp text-xl font-700 leading-tight break-words ${task.done ? 'text-mut line-through' : ''}">${esc(task.title)}</h2>
          <div class="text-[11px] text-mut mt-1 truncate">${esc(crumbs.join(' › '))}</div>
        </div>
        <button data-act="edittask" class="shrink-0 text-xs text-mut border border-line rounded-full px-3 py-1.5 active:text-fg">Edit</button>
      </div>
      ${hasKids(task) ? `
        <div class="flex items-center gap-3 mt-4">
          <div class="flex-1">${bar(task)}</div>
          <span class="num text-sm ${task.done ? 'text-amber font-700' : 'text-mut'}">${pct(task)}</span>
        </div>` : ''}
      <div class="mt-4">
        ${task.date
          ? `<button data-act="edittask" class="text-xs num bg-steeld text-steel rounded-full px-2.5 py-1">${esc(fmtDay(task.date))} · ${esc(relDay(task.date))}</button>`
          : '<button data-act="edittask" class="text-xs text-mut active:text-fg">+ Add a date</button>'}
      </div>
      ${task.note
        ? `<p class="text-sm leading-relaxed whitespace-pre-wrap break-words mt-3 pt-3 border-t border-line">${esc(task.note)}</p>`
        : '<div class="mt-2"><button data-act="edittask" class="text-xs text-mut active:text-fg">+ Add a note</button></div>'}
    </div>
    ${taskSection(task, 'Subtasks', { tickable: true, reorder, canReorder: true })}`;

  wireTasks(el, task, base, here);
  el.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'up') up(parentRoute);
    else if (btn.dataset.act === 'tickself') { if (toggle(task)) refresh({ keepScroll: true }); }
    else if (btn.dataset.act === 'edittask') taskModal(project, task, parent, parentRoute);
  });
}

/* =========================================================================
   POPUPS
   ========================================================================= */
const label = 'block text-xs uppercase tracking-widest text-mut mb-1';

function projectModal(id, tab) {
  const p = id ? projectById(id) : null;
  openModal(`
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-disp text-lg font-700">${p ? 'Edit project' : 'New project'}</h3>
      <button data-mact="close" class="text-mut text-xl leading-none">×</button>
    </div>
    <label class="${label}">Name</label>
    <input id="pname" autocomplete="off" value="${p ? esc(p.name) : ''}" placeholder="e.g. Renovate the bathroom" class="${inputCls} mb-4" />
    <label class="${label}">Description</label>
    <textarea id="pdesc" rows="4" placeholder="What is this project about?" class="${inputCls} mb-6 resize-none">${p ? esc(p.description) : ''}</textarea>
    <div class="flex gap-2">
      ${p ? '<button data-mact="delete" class="px-4 py-3 rounded-xl border border-line text-mut active:text-fg">Delete</button>' : ''}
      <button data-mact="save" class="flex-1 bg-amber text-ink font-700 rounded-xl py-3">Save</button>
    </div>`, e => {
    const btn = e.target.closest('[data-mact]');
    if (!btn) return;
    const act = btn.dataset.mact;
    if (act === 'close') closeModal();
    else if (act === 'save') {
      const name = $('#pname').value.trim();
      if (!name) { toast('Name required'); return; }
      const description = $('#pdesc').value.trim();
      if (p) {
        p.name = name; p.description = description;
        commit(); closeModal(); refresh({ keepScroll: true });
      } else {
        const created = { id: uid(), name, description, done: false, tasks: [] };
        state.projects.push(created);
        commit();
        closeModal(() => go(`projects/active/${created.id}`));     // straight in, to add tasks
      }
    } else if (act === 'delete') {
      const n = countAll(p);
      if (!confirm(`Delete “${p.name}”${n ? ` and its ${n} ${n === 1 ? 'task' : 'tasks'}` : ''}? This cannot be undone.`)) return;
      state.projects = state.projects.filter(x => x.id !== p.id);
      commit();
      closeModal(() => up(`projects/${tab}`));
    }
  });
  if (!p) setTimeout(() => $('#pname')?.focus(), 50);
}

function taskModal(project, task, parent, parentRoute) {
  openModal(`
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-disp text-lg font-700">Edit task</h3>
      <button data-mact="close" class="text-mut text-xl leading-none">×</button>
    </div>
    <label class="${label}">Name</label>
    <input id="tname" autocomplete="off" value="${esc(task.title)}" class="${inputCls} mb-4" />
    <label class="${label}">Date</label>
    <div class="flex gap-2 mb-4">
      <input id="tdate" type="date" value="${esc(task.date || '')}" class="num flex-1 min-w-0 ${inputCls}" style="color-scheme: dark" />
      <button data-mact="nodate" class="shrink-0 px-4 rounded-xl border border-line text-mut text-sm active:text-fg">No date</button>
    </div>
    <label class="${label}">Note</label>
    <textarea id="tnote" rows="4" placeholder="Describe the task…" class="${inputCls} mb-6 resize-none">${esc(task.note)}</textarea>
    <div class="flex gap-2">
      <button data-mact="delete" class="px-4 py-3 rounded-xl border border-line text-mut active:text-fg">Delete</button>
      <button data-mact="save" class="flex-1 bg-amber text-ink font-700 rounded-xl py-3">Save</button>
    </div>`, e => {
    const btn = e.target.closest('[data-mact]');
    if (!btn) return;
    const act = btn.dataset.mact;
    if (act === 'close') closeModal();
    else if (act === 'nodate') $('#tdate').value = '';
    else if (act === 'save') {
      const title = $('#tname').value.trim();
      if (!title) { toast('Name required'); return; }
      const date = $('#tdate').value;
      task.title = title;
      task.date = isDay(date) ? date : null;
      task.note = $('#tnote').value.trim();
      commit(); closeModal(); refresh({ keepScroll: true });
    } else if (act === 'delete') {
      const n = countAll(task);
      if (!confirm(`Delete “${task.title}”${n ? ` and its ${n} ${n === 1 ? 'subtask' : 'subtasks'}` : ''}? This cannot be undone.`)) return;
      parent.tasks = parent.tasks.filter(t => t.id !== task.id);
      commit();
      closeModal(() => up(parentRoute));
    }
  });
}

/* =========================================================================
   MODULE
   ========================================================================= */
export default {
  id: 'projects',
  name: 'Projects',
  icon: icons.projects,
  tabs: [
    { id: 'active', label: 'Projects', icon: icons.projects },
    { id: 'done',   label: 'Done',     icon: icons.done },
  ],

  render(el, { tab, params }) {
    const here = ['projects', tab, ...params].join('/');
    if (reorderOn && reorderOn !== here) reorderOn = null;       // leaving a screen ends reordering

    const project = params[0] ? projectById(params[0]) : null;
    if (!project) { renderProjects(el, tab); return; }
    const hit = params[1] ? find(project, params[1]) : null;
    if (hit) renderTask(el, project, hit, tab);
    else renderProject(el, project, tab);
  },

  backup: {
    describe(storage) {
      try {
        const n = (JSON.parse(storage[KEY]).projects || []).length;
        return `${n} ${n === 1 ? 'project' : 'projects'}`;
      } catch (e) { return null; }
    },
  },
};
