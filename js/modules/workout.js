/* =========================================================================
   Workout — routines, exercises, sessions.

   The data stays under the storage keys of the original single-file app
   ("ledger_…"). Do not rename or rewrite them destructively: that is where all
   past sessions live.
   ========================================================================= */
import { $, esc, uid, toast, openModal, closeModal } from '../core/ui.js';
import { go, refresh } from '../core/shell.js';

const DB_KEY = 'ledger_data_v1';
const ACTIVE_KEY = 'ledger_active_v1';
const DEFAULT_SETS = 3;

/* ---------- persistence ---------- */
let state = load();
let activeSession = loadActive();   // null when no workout in progress
let viewEl = null;                  // element the current screen is drawn into

function load() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) {}
  // Seed with a small starter routine so the app isn't a blank wall on first open.
  return seed();
}

// Backfill fields added in later versions so older saved data keeps working.
// Must stay idempotent and non-destructive.
function migrate(data) {
  (data.exercises || []).forEach(e => {
    if (typeof e.sets !== 'number' || e.sets < 1) e.sets = DEFAULT_SETS;
  });
  // v2: ordering moved onto the workout. Build each workout's ordered exerciseIds
  // from the old exercise.workoutIds links (preserving previous global order), once.
  (data.workouts || []).forEach(w => {
    if (!Array.isArray(w.exerciseIds)) {
      w.exerciseIds = (data.exercises || [])
        .filter(e => Array.isArray(e.workoutIds) && e.workoutIds.includes(w.id))
        .map(e => e.id);
    } else {
      // drop any dangling ids pointing at deleted exercises
      w.exerciseIds = w.exerciseIds.filter(id => (data.exercises || []).some(e => e.id === id));
    }
  });
  (data.exercises || []).forEach(e => { delete e.workoutIds; });
  return data;
}
function save() { localStorage.setItem(DB_KEY, JSON.stringify(state)); }

function loadActive() {
  try { const raw = localStorage.getItem(ACTIVE_KEY); return raw ? JSON.parse(raw) : null; }
  catch (e) { return null; }
}
function saveActive() {
  if (activeSession) localStorage.setItem(ACTIVE_KEY, JSON.stringify(activeSession));
  else localStorage.removeItem(ACTIVE_KEY);
}

function seed() {
  const wA = uid(), wB = uid();
  const squat = uid(), bench = uid(), row = uid(), dead = uid(), ohp = uid(), pull = uid();
  return {
    workouts: [
      { id: wA, name: 'Workout A', exerciseIds: [squat, bench, row] },
      { id: wB, name: 'Workout B', exerciseIds: [dead, ohp, pull] },
    ],
    exercises: [
      { id: squat, name: 'Squat',         description: 'Brace core, sit back, knees track over toes. Depth: hip crease below knee.', sets: 3 },
      { id: bench, name: 'Bench Press',    description: 'Shoulder blades retracted, slight arch, bar to lower chest. Controlled eccentric.', sets: 3 },
      { id: row,   name: 'Barbell Row',    description: 'Hinge ~45°, pull to lower ribs, squeeze scapulae. No jerking.', sets: 3 },
      { id: dead,  name: 'Deadlift',       description: 'Neutral spine, bar over midfoot, push floor away. One hard set.', sets: 1 },
      { id: ohp,   name: 'Overhead Press', description: 'Elbows slightly forward, glutes tight, press through the bar. No layback.', sets: 3 },
      { id: pull,  name: 'Pull-up',        description: 'Full hang to chin over bar. Add weight via belt when reps get easy.', sets: 3 },
    ],
    sessions: [],
  };
}

/* ---------- data helpers ---------- */
const workoutById  = id => state.workouts.find(w => w.id === id);
const exerciseById = id => state.exercises.find(e => e.id === id);
// Ordered: follows the workout's own exerciseIds list.
const exercisesForWorkout = id => {
  const w = workoutById(id);
  return w && w.exerciseIds ? w.exerciseIds.map(exId => exerciseById(exId)).filter(Boolean) : [];
};
// Which workouts contain this exercise (for Plan tags).
const workoutsForExercise = exId => state.workouts.filter(w => (w.exerciseIds || []).includes(exId));

function sessionsForWorkout(id) {
  return state.sessions
    .filter(s => s.workoutId === id)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}
function lastSessionForWorkout(id) { return sessionsForWorkout(id)[0] || null; }

// Was this exercise flagged "increase" in its most recently logged session (any routine)?
function lastFlagFor(exerciseId) {
  const s = state.sessions
    .filter(se => se.entries.some(e => e.exerciseId === exerciseId))
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  if (!s) return false;
  const e = s.entries.find(x => x.exerciseId === exerciseId);
  return !!(e && e.flagged);
}

function previousSetsFor(workoutId, exerciseId) {
  const last = lastSessionForWorkout(workoutId);
  if (!last) return null;
  const entry = last.entries.find(e => e.exerciseId === exerciseId);
  return entry && entry.sets.length ? entry.sets : null;
}

// Suggest the routine that hasn't been trained for the longest (never-done wins).
function suggestedNext() {
  if (!state.workouts.length) return null;
  return [...state.workouts].sort((a, b) => {
    const la = lastSessionForWorkout(a.id), lb = lastSessionForWorkout(b.id);
    const ta = la ? new Date(la.date).getTime() : 0;
    const tb = lb ? new Date(lb.date).getTime() : 0;
    return ta - tb;
  })[0];
}

/* ---------- formatting ---------- */
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
function relDate(iso) {
  const d = new Date(iso); const now = new Date();
  const days = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7)  return days + 'd ago';
  if (days < 30) return Math.floor(days / 7) + 'w ago';
  return Math.floor(days / 30) + 'mo ago';
}
function setsSummary(sets) {
  return sets.filter(s => s.weight || s.reps)
             .map(s => `${s.weight || '—'}×${s.reps || '—'}`)
             .join('  ');
}

/* =========================================================================
   RENDER
   ========================================================================= */

/* ---------- HISTORY ---------- */
function renderHistory(view) {
  const next = suggestedNext();
  const sessions = [...state.sessions].sort((a, b) => new Date(b.date) - new Date(a.date));

  let html = '';

  // Up-next card / start button
  if (activeSession) {
    html += `
      <button data-act="goactive" class="w-full text-left bg-amberd/60 border border-amber/40 rounded-2xl p-4 mb-5 flag-pulse">
        <div class="text-[11px] uppercase tracking-widest text-amber/90 mb-1">Workout in progress</div>
        <div class="flex items-center justify-between">
          <div class="font-disp text-xl font-700">${esc(activeSession.workoutName)}</div>
          <div class="text-amber text-sm font-600">Resume →</div>
        </div>
      </button>`;
  } else {
    const lastAny = sessions[0];
    html += `
      <div class="bg-panel border border-line rounded-2xl p-4 mb-5">
        <div class="text-[11px] uppercase tracking-widest text-mut mb-2">Up next</div>
        <div class="flex items-center justify-between gap-3 mb-4">
          <div>
            <div class="font-disp text-2xl font-700 leading-tight">${next ? esc(next.name) : 'No routines yet'}</div>
            <div class="text-xs text-mut mt-0.5">
              ${lastAny ? 'Last trained: ' + esc(lastAny.workoutName) + ' · ' + relDate(lastAny.date).toLowerCase() : 'Nothing logged yet'}
            </div>
          </div>
        </div>
        ${ next
          ? `<button data-act="start" data-id="${next.id}" class="w-full bg-amber text-ink font-700 rounded-xl py-3.5 text-base active:scale-[.99] transition">Start ${esc(next.name)}</button>
             <div class="mt-2 flex flex-wrap gap-2">${
               state.workouts.filter(w => w.id !== next.id).map(w =>
                 `<button data-act="start" data-id="${w.id}" class="text-xs bg-panel2 border border-line rounded-full px-3 py-1.5 text-mut active:text-fg">Start ${esc(w.name)}</button>`
               ).join('')
             }</div>`
          : `<button data-act="tomanage" class="w-full bg-panel2 border border-line rounded-xl py-3 text-sm text-mut">Create a routine in Plan →</button>`
        }
      </div>`;
  }

  // History list
  html += `<div class="flex items-baseline justify-between mb-3 mt-1">
             <h2 class="font-disp text-sm uppercase tracking-widest text-mut">History</h2>
             <span class="text-xs text-mut num">${sessions.length} logged</span>
           </div>`;

  if (!sessions.length) {
    html += `<div class="text-center text-mut text-sm py-10 border border-dashed border-line rounded-2xl">
               No sessions yet.<br>Finish a workout and it lands here.
             </div>`;
  } else {
    html += '<div class="space-y-2">';
    for (const s of sessions) {
      html += `
        <button data-act="viewsession" data-id="${s.id}" class="w-full text-left bg-panel border border-line rounded-2xl px-4 py-4 flex items-center justify-between gap-3 active:border-mut/60 transition">
          <span class="font-disp font-600 text-lg truncate">${esc(s.workoutName)}</span>
          <span class="text-xs num text-mut shrink-0">${relDate(s.date)}</span>
        </button>`;
    }
    html += '</div>';
  }

  view.innerHTML = html;
}

/* ---------- PLAN (workouts + exercises) ---------- */
function renderManage(view) {
  let html = '';

  // Workouts
  html += `<div class="flex items-baseline justify-between mb-3">
             <h2 class="font-disp text-sm uppercase tracking-widest text-mut">Routines</h2>
             <button data-act="newworkout" class="text-xs text-amber font-600">+ New</button>
           </div>`;
  if (!state.workouts.length) {
    html += `<div class="text-center text-mut text-sm py-6 border border-dashed border-line rounded-2xl mb-6">Add a routine to group your lifts.</div>`;
  } else {
    html += '<div class="space-y-2 mb-7">';
    for (const w of state.workouts) {
      const exs = exercisesForWorkout(w.id);
      html += `
        <div class="bg-panel border border-line rounded-2xl p-4">
          <div class="flex items-center justify-between">
            <div class="font-disp font-600 text-lg">${esc(w.name)}</div>
            <div class="flex gap-3 text-sm">
              <button data-act="editworkout" data-id="${w.id}" class="text-mut active:text-fg">Edit</button>
              <button data-act="startfromplan" data-id="${w.id}" class="text-amber font-600">Start</button>
            </div>
          </div>
          <div class="text-xs num text-mut mt-1">${exs.length ? exs.map(e => esc(e.name)).join(' · ') : 'No exercises assigned yet'}</div>
        </div>`;
    }
    html += '</div>';
  }

  // Exercises
  html += `<div class="flex items-baseline justify-between mb-3">
             <h2 class="font-disp text-sm uppercase tracking-widest text-mut">Exercises</h2>
             <button data-act="newexercise" class="text-xs text-amber font-600">+ New</button>
           </div>`;
  if (!state.exercises.length) {
    html += `<div class="text-center text-mut text-sm py-6 border border-dashed border-line rounded-2xl">Create exercises and link them to routines.</div>`;
  } else {
    html += '<div class="space-y-2">';
    for (const e of state.exercises) {
      const tags = workoutsForExercise(e.id);
      const flaggedLast = lastFlagFor(e.id);
      html += `
        <button data-act="editexercise" data-id="${e.id}" class="w-full text-left bg-panel border border-line rounded-2xl p-4 active:border-mut/60 transition">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="font-disp font-600 text-base">${esc(e.name)}</span>
              ${flaggedLast ? '<span class="text-[10px] text-amber border border-amber/50 rounded-full px-1.5 py-0.5 num">↑ INCREASE</span>' : ''}
            </div>
            <span class="text-mut text-lg leading-none">›</span>
          </div>
          ${e.description ? `<div class="text-xs text-mut mt-1 line-clamp-2">${esc(e.description)}</div>` : ''}
          <div class="flex flex-wrap items-center gap-1.5 mt-2">
            <span class="text-[10px] num bg-amberd/50 text-amber rounded-full px-2 py-0.5">${e.sets} ${e.sets === 1 ? 'set' : 'sets'}</span>
            ${tags.length
              ? tags.map(t => `<span class="text-[10px] num bg-steeld text-steel rounded-full px-2 py-0.5">${esc(t.name)}</span>`).join('')
              : '<span class="text-[10px] text-mut">unassigned</span>'}
          </div>
        </button>`;
    }
    html += '</div>';
  }

  view.innerHTML = html;
}

/* ---------- ACTIVE SESSION ---------- */
function renderActive(view) {
  if (!activeSession) {
    const next = suggestedNext();
    view.innerHTML = `
      <div class="text-center py-16">
        <div class="text-mut text-sm mb-5">No workout in progress.</div>
        ${next
          ? `<button data-act="start" data-id="${next.id}" class="bg-amber text-ink font-700 rounded-xl px-6 py-3">Start ${esc(next.name)}</button>`
          : `<button data-act="tomanage" class="bg-panel2 border border-line rounded-xl px-6 py-3 text-mut">Create a routine first</button>`}
      </div>`;
    return;
  }

  let html = `
    <div class="flex items-center justify-between mb-4">
      <div class="font-disp text-2xl font-700 leading-none">${esc(activeSession.workoutName)}</div>
      <button data-act="cancel" class="text-xs text-mut border border-line rounded-full px-3 py-1.5 active:text-fg">Cancel</button>
    </div>`;

  if (!activeSession.entries.length) {
    html += `<div class="text-center text-mut text-sm py-8 border border-dashed border-line rounded-2xl">This routine has no exercises. Add some in Plan.</div>`;
  }

  activeSession.entries.forEach((en, ei) => {
    const prev = en.previousSets;
    html += `
      <div class="bg-panel border ${en.increaseReminder ? 'border-amber/50' : 'border-line'} rounded-2xl p-4 mb-3" data-ei="${ei}">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <h3 class="font-disp font-600 text-lg truncate">${esc(en.name)}</h3>
            ${en.description ? `<button data-act="toggleinfo" data-ei="${ei}" class="shrink-0 w-6 h-6 rounded-full border border-line text-mut text-xs flex items-center justify-center active:text-fg" aria-label="Form notes">i</button>` : ''}
          </div>
          ${en.increaseReminder ? '<span class="shrink-0 text-[10px] text-amber border border-amber/60 bg-amberd/40 rounded-full px-2 py-0.5 num flag-pulse">↑ INCREASE</span>' : ''}
        </div>

        ${en.description ? `<div data-info="${ei}" class="hidden text-xs text-mut leading-relaxed mt-2 bg-panel2 rounded-lg p-3 border border-line">${esc(en.description)}</div>` : ''}

        <div class="mt-3 space-y-2" data-sets="${ei}">
          ${en.sets.map((set, si) => setRowHTML(ei, si, set, prev && prev[si])).join('')}
        </div>

        <div class="flex items-center justify-end mt-3">
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <span class="text-xs text-mut">Increase next time</span>
            <span data-act="toggleflag" data-ei="${ei}" class="switch relative w-10 h-6 rounded-full ${en.flagIncrease ? 'bg-amber' : 'bg-line'} block">
              <span class="knob absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white ${en.flagIncrease ? 'translate-x-4' : ''}"></span>
            </span>
          </label>
        </div>
      </div>`;
  });

  if (activeSession.entries.length) {
    html += `<button data-act="finish" class="w-full bg-amber text-ink font-700 rounded-xl py-4 mt-4 text-base active:scale-[.99] transition">Finish workout</button>`;
  }

  view.innerHTML = html;
}

const hasValue = s => !!s && ((s.weight != null && s.weight !== '') || (s.reps != null && s.reps !== ''));

function setRowHTML(ei, si, set, prev) {
  const beat = isBeat(set, prev);
  const pw = (prev && prev.weight != null && prev.weight !== '') ? prev.weight : 0;
  const pr = (prev && prev.reps   != null && prev.reps   !== '') ? prev.reps   : 0;
  // The first set of an exercise never done before has nothing to copy.
  const nothingToCopy = !hasValue(prev) && si === 0;
  const stepBtn = (field, delta, sym) =>
    `<button data-act="step" data-ei="${ei}" data-si="${si}" data-field="${field}" data-delta="${delta}"
             class="w-8 h-7 rounded-md bg-ink/50 border border-line text-mut active:text-amber active:border-amber/60 text-base leading-none flex items-center justify-center shrink-0">${sym}</button>`;
  return `
    <div class="relative flex items-stretch gap-2 bg-panel2 rounded-lg pl-3 pr-2 py-2 border border-line ${beat ? 'beat' : ''}" data-row="${ei}-${si}">
      <div class="flex-1 min-w-0 flex items-start gap-1.5">
        <div class="flex-1 min-w-0">
          <input inputmode="decimal" data-field="weight" data-ei="${ei}" data-si="${si}"
                 value="${esc(set.weight ?? '')}" placeholder="${esc(pw)}"
                 class="num w-full bg-transparent text-fg text-lg font-500 outline-none placeholder:text-mut/50" />
          <div class="flex items-center justify-between mt-1">
            ${stepBtn('weight', -0.5, '−')}
            <span class="text-[9px] uppercase tracking-widest text-mut num">kg</span>
            ${stepBtn('weight', 0.5, '+')}
          </div>
        </div>
        <div class="shrink-0 flex flex-col items-center pt-1.5">
          <span class="num text-mut text-lg leading-none">×</span>
          <span class="beat-dot opacity-0 text-amber text-xs num mt-3">✓</span>
        </div>
        <div class="flex-1 min-w-0">
          <input inputmode="numeric" data-field="reps" data-ei="${ei}" data-si="${si}"
                 value="${esc(set.reps ?? '')}" placeholder="${esc(pr)}"
                 class="num w-full bg-transparent text-fg text-lg font-500 outline-none placeholder:text-mut/50" />
          <div class="flex items-center justify-between mt-1">
            ${stepBtn('reps', -1, '−')}
            <span class="text-[9px] uppercase tracking-widest text-mut num">reps</span>
            ${stepBtn('reps', 1, '+')}
          </div>
        </div>
      </div>
      <button data-act="same" data-ei="${ei}" data-si="${si}" aria-label="Same as last time"
              class="shrink-0 w-14 rounded-lg border border-amber/50 bg-amberd/60 text-amber flex flex-col items-center justify-center gap-1 active:bg-amber active:text-ink transition ${nothingToCopy ? 'opacity-30' : ''}">
        <span class="num text-2xl leading-none font-700">=</span>
        <span class="text-[9px] uppercase tracking-widest num">same</span>
      </button>
    </div>`;
}

function isBeat(set, prev) {
  if (!prev) return false;
  const w = parseFloat(set.weight), r = parseFloat(set.reps);
  const pw = parseFloat(prev.weight), pr = parseFloat(prev.reps);
  if (isNaN(w) || isNaN(r)) return false;
  if (isNaN(pw) || isNaN(pr)) return true;
  // Beat = more weight, or same weight with equal-or-more reps.
  return w > pw || (w === pw && r >= pr);
}

/* =========================================================================
   ACTIONS
   ========================================================================= */
function startWorkout(workoutId) {
  const w = workoutById(workoutId);
  if (!w) return;
  const exs = exercisesForWorkout(workoutId);
  const lastSess = lastSessionForWorkout(w.id);
  activeSession = {
    workoutId: w.id,
    workoutName: w.name,
    startedAt: Date.now(),
    entries: exs.map(e => {
      const prev = previousSetsFor(w.id, e.id);
      const nSets = Math.max(1, e.sets || DEFAULT_SETS);
      const lastEntry = lastSess ? lastSess.entries.find(x => x.exerciseId === e.id) : null;
      return {
        exerciseId: e.id,
        name: e.name,
        description: e.description || '',
        increaseReminder: !!(lastEntry && lastEntry.flagged), // flagged last session → show label
        flagIncrease: false,                                  // this session's decision, starts off
        previousSets: prev,
        sets: Array.from({ length: nSets }, () => ({ weight: '', reps: '' })),
      };
    }),
  };
  saveActive();
  go('workout/session');
}

function finishWorkout() {
  if (!activeSession) return;
  const entries = activeSession.entries
    .map(en => ({
      exerciseId: en.exerciseId,
      name: en.name,
      sets: en.sets.filter(s => s.weight !== '' || s.reps !== '')
                   .map(s => ({ weight: s.weight, reps: s.reps })),
      flagged: en.flagIncrease,
    }))
    .filter(en => en.sets.length);

  if (!entries.length) {
    toast('Log at least one set first');
    return;
  }

  state.sessions.push({
    id: uid(),
    workoutId: activeSession.workoutId,
    workoutName: activeSession.workoutName,
    date: new Date().toISOString(),
    entries,
  });
  save();

  activeSession = null;
  saveActive();
  toast('Session saved');
  go('workout/history');
}

function cancelWorkout() {
  activeSession = null;
  saveActive();
  go('workout/history');
}

/* ---------- live input handling (no full re-render → keeps focus) ---------- */
const rowEl = (ei, si) => viewEl.querySelector(`[data-row="${ei}-${si}"]`);
const inputEl = (ei, si, field) => viewEl.querySelector(`input[data-field="${field}"][data-ei="${ei}"][data-si="${si}"]`);

function onFieldInput(input) {
  const ei = +input.dataset.ei, si = +input.dataset.si, field = input.dataset.field;
  const en = activeSession.entries[ei];
  en.sets[si][field] = input.value;
  saveActive();

  // recompute "beat" state for this row
  const row = rowEl(ei, si);
  const prev = en.previousSets && en.previousSets[si];
  if (row) row.classList.toggle('beat', isBeat(en.sets[si], prev));
}

// clean numeric string: "60" stays "60", "60.5" stays "60.5"
function formatWeight(v) { return String(Math.round(v * 2) / 2); }

// − / + steppers. Base = current value, else previous suggestion, else 0.
function stepField(ei, si, field, delta) {
  const en = activeSession.entries[ei];
  const set = en.sets[si];
  const prev = en.previousSets && en.previousSets[si];
  const cur = set[field];
  let base;
  if (cur !== '' && cur != null && !isNaN(parseFloat(cur))) {
    base = parseFloat(cur);
  } else {
    const pv = prev ? (field === 'weight' ? prev.weight : prev.reps) : null;
    base = (pv != null && pv !== '' && !isNaN(parseFloat(pv))) ? parseFloat(pv) : 0;
  }
  let val = base + delta;
  if (val < 0) val = 0;
  const out = field === 'weight' ? formatWeight(val) : String(Math.round(val));
  set[field] = out;
  saveActive();

  const input = inputEl(ei, si, field);
  if (input) input.value = out;
  const row = rowEl(ei, si);
  if (row) row.classList.toggle('beat', isBeat(set, prev));
}

// "Same" button: fill this set with last session's values for the same set.
// With no previous value for this set, copy the set just above.
function sameSet(ei, si) {
  const en = activeSession.entries[ei];
  const set = en.sets[si];
  const prev = en.previousSets && en.previousSets[si];
  const above = si > 0 ? en.sets[si - 1] : null;
  const src = hasValue(prev) ? prev : (hasValue(above) ? above : null);
  if (!src) {
    toast(si > 0 ? 'Fill the set above first' : 'Nothing to copy yet');
    return;
  }
  set.weight = src.weight != null ? String(src.weight) : '';
  set.reps   = src.reps   != null ? String(src.reps)   : '';
  saveActive();

  const wi = inputEl(ei, si, 'weight'), ri = inputEl(ei, si, 'reps');
  if (wi) wi.value = set.weight;
  if (ri) ri.value = set.reps;
  const row = rowEl(ei, si);
  if (row) row.classList.toggle('beat', isBeat(set, prev));
}

function toggleFlag(ei) {
  const en = activeSession.entries[ei];
  en.flagIncrease = !en.flagIncrease; // saved into this session's entry on finish
  saveActive();
  renderActive(viewEl);
}

/* =========================================================================
   POPUPS
   ========================================================================= */
let wmIds = []; // working ordered exercise-id list while the workout popup is open

function workoutModal(id) {
  const w = id ? workoutById(id) : null;
  wmIds = w ? [...(w.exerciseIds || [])] : [];
  openModal(`
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-disp text-lg font-700">${w ? 'Edit routine' : 'New routine'}</h3>
      <button data-mact="close" class="text-mut text-xl leading-none">×</button>
    </div>
    <label class="block text-xs uppercase tracking-widest text-mut mb-1">Name</label>
    <input id="wname" value="${w ? esc(w.name) : ''}" placeholder="e.g. Push Day"
           class="w-full bg-panel2 border border-line rounded-xl px-3 py-3 text-fg outline-none focus:border-amber/60 mb-5" />

    <label class="block text-xs uppercase tracking-widest text-mut mb-2">Exercises — in workout order</label>
    <div id="wmList" class="space-y-2 mb-4"></div>

    <label class="block text-xs uppercase tracking-widest text-mut mb-2">Add exercise</label>
    <div id="wmAdd" class="flex flex-wrap gap-2 mb-6"></div>

    <div class="flex gap-2">
      ${w ? `<button data-mact="delworkout" data-id="${w.id}" class="px-4 py-3 rounded-xl border border-line text-mut active:text-fg">Delete</button>` : ''}
      <button data-mact="saveworkout" data-id="${w ? w.id : ''}" class="flex-1 bg-amber text-ink font-700 rounded-xl py-3">Save</button>
    </div>`, onModalClick);
  renderWmList();
  setTimeout(() => $('#wname')?.focus(), 50);
}

function renderWmList() {
  const list = $('#wmList'), add = $('#wmAdd');
  if (!list || !add) return;
  list.innerHTML = wmIds.length
    ? wmIds.map((exId, i) => {
        const ex = exerciseById(exId);
        if (!ex) return '';
        return `
          <div class="flex items-center gap-1.5 bg-panel2 border border-line rounded-xl pl-3 pr-2 py-2">
            <span class="num text-mut text-xs w-4">${i + 1}</span>
            <span class="flex-1 text-sm truncate">${esc(ex.name)}</span>
            <button data-mact="wmup" data-i="${i}" class="w-9 h-9 rounded-lg border border-line text-mut active:text-fg text-base ${i === 0 ? 'opacity-25 pointer-events-none' : ''}">↑</button>
            <button data-mact="wmdown" data-i="${i}" class="w-9 h-9 rounded-lg border border-line text-mut active:text-fg text-base ${i === wmIds.length - 1 ? 'opacity-25 pointer-events-none' : ''}">↓</button>
            <button data-mact="wmremove" data-i="${i}" class="w-9 h-9 rounded-lg border border-line text-mut active:text-fg text-lg leading-none">×</button>
          </div>`;
      }).join('')
    : `<div class="text-xs text-mut border border-dashed border-line rounded-xl py-3 text-center">No exercises yet — add from below.</div>`;

  const available = state.exercises.filter(e => !wmIds.includes(e.id));
  add.innerHTML = available.length
    ? available.map(e => `<button data-mact="wmadd" data-id="${e.id}" class="text-sm rounded-full px-3.5 py-2 border bg-panel2 text-mut border-line active:text-fg">${esc(e.name)} +</button>`).join('')
    : (state.exercises.length
        ? '<span class="text-xs text-mut">All exercises added.</span>'
        : '<span class="text-xs text-mut">No exercises yet — create some below in the Exercises list first.</span>');
}

function exerciseModal(id) {
  const e = id ? exerciseById(id) : null;
  openModal(`
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-disp text-lg font-700">${e ? 'Edit exercise' : 'New exercise'}</h3>
      <button data-mact="close" class="text-mut text-xl leading-none">×</button>
    </div>

    <label class="block text-xs uppercase tracking-widest text-mut mb-1">Name</label>
    <input id="ename" value="${e ? esc(e.name) : ''}" placeholder="e.g. Incline Dumbbell Press"
           class="w-full bg-panel2 border border-line rounded-xl px-3 py-3 text-fg outline-none focus:border-amber/60 mb-4" />

    <label class="block text-xs uppercase tracking-widest text-mut mb-1">Form notes</label>
    <textarea id="edesc" rows="3" placeholder="Cues, setup, tempo…"
           class="w-full bg-panel2 border border-line rounded-xl px-3 py-3 text-fg outline-none focus:border-amber/60 mb-4 resize-none">${e ? esc(e.description) : ''}</textarea>

    <label class="block text-xs uppercase tracking-widest text-mut mb-2">Working sets</label>
    <div class="flex items-center gap-4 mb-2">
      <button data-setstep="-1" class="w-11 h-11 rounded-xl bg-panel2 border border-line text-fg text-2xl leading-none active:border-amber/60">−</button>
      <span id="esets" class="num text-3xl font-700 w-10 text-center">${e ? e.sets : DEFAULT_SETS}</span>
      <button data-setstep="1" class="w-11 h-11 rounded-xl bg-panel2 border border-line text-fg text-2xl leading-none active:border-amber/60">+</button>
      <span class="text-xs text-mut ml-1">sets loaded each session</span>
    </div>
    <p class="text-[11px] text-mut mb-5">To add this exercise to a routine, open the routine and use “Add exercise”.</p>

    <div class="flex gap-2">
      ${e ? `<button data-mact="delexercise" data-id="${e.id}" class="px-4 py-3 rounded-xl border border-line text-mut active:text-fg">Delete</button>` : ''}
      <button data-mact="saveexercise" data-id="${e ? e.id : ''}" class="flex-1 bg-amber text-ink font-700 rounded-xl py-3">Save</button>
    </div>`, onModalClick);
  setTimeout(() => $('#ename')?.focus(), 50);
}

function sessionModal(id) {
  const s = state.sessions.find(x => x.id === id);
  if (!s) return;
  openModal(`
    <div class="flex items-start justify-between mb-1">
      <div>
        <h3 class="font-disp text-xl font-700">${esc(s.workoutName)}</h3>
        <div class="text-xs num text-mut">${fmtDate(s.date)} · ${new Date(s.date).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</div>
      </div>
      <button data-mact="close" class="text-mut text-xl leading-none">×</button>
    </div>
    <div class="space-y-3 mt-4">
      ${s.entries.map(e => `
        <div class="bg-panel2 border border-line rounded-xl p-3">
          <div class="flex items-center gap-2 mb-1">
            <span class="font-600">${esc(e.name)}</span>
            ${e.flagged ? '<span class="text-[10px] text-amber num">↑ increase</span>' : ''}
          </div>
          <div class="num text-sm text-steel">${esc(setsSummary(e.sets)) || '—'}</div>
        </div>`).join('')}
    </div>
    <button data-mact="delsession" data-id="${s.id}" class="w-full mt-5 py-3 rounded-xl border border-line text-mut active:text-fg text-sm">Delete this session</button>`, onModalClick);
}

/* ---------- popup save handlers ---------- */
function saveWorkoutFromModal(id) {
  const name = $('#wname').value.trim();
  if (!name) { toast('Name required'); return; }
  if (id) { const w = workoutById(id); w.name = name; w.exerciseIds = [...wmIds]; }
  else state.workouts.push({ id: uid(), name, exerciseIds: [...wmIds] });
  save(); closeModal(); refresh();
}
function deleteWorkout(id) {
  state.workouts = state.workouts.filter(w => w.id !== id);
  save(); closeModal(); refresh();
}
function saveExerciseFromModal(id) {
  const name = $('#ename').value.trim();
  if (!name) { toast('Name required'); return; }
  const desc = $('#edesc').value.trim();
  const sets = Math.max(1, Math.min(10, parseInt($('#esets').textContent, 10) || DEFAULT_SETS));
  if (id) {
    const e = exerciseById(id);
    e.name = name; e.description = desc; e.sets = sets;
  } else {
    state.exercises.push({ id: uid(), name, description: desc, sets });
  }
  save(); closeModal(); refresh();
}
function deleteExercise(id) {
  state.exercises = state.exercises.filter(e => e.id !== id);
  // also drop it from any routine's ordered list
  state.workouts.forEach(w => { w.exerciseIds = (w.exerciseIds || []).filter(x => x !== id); });
  save(); closeModal(); refresh();
}
function deleteSession(id) {
  state.sessions = state.sessions.filter(s => s.id !== id);
  save(); closeModal(); refresh();
}

/* =========================================================================
   EVENTS (delegation)
   ========================================================================= */
function onViewClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act, id = btn.dataset.id, ei = +btn.dataset.ei;

  switch (act) {
    case 'start': case 'startfromplan': startWorkout(id); break;
    case 'goactive': go('workout/session'); break;
    case 'tomanage': go('workout/plan'); break;
    case 'viewsession': sessionModal(id); break;
    case 'newworkout': workoutModal(); break;
    case 'editworkout': workoutModal(id); break;
    case 'newexercise': exerciseModal(); break;
    case 'editexercise': exerciseModal(id); break;
    case 'finish': finishWorkout(); break;
    case 'cancel':
      if (confirm('Discard this session? Nothing will be saved.')) cancelWorkout();
      break;
    case 'toggleflag': toggleFlag(ei); break;
    case 'step': stepField(ei, +btn.dataset.si, btn.dataset.field, parseFloat(btn.dataset.delta)); break;
    case 'same': sameSet(ei, +btn.dataset.si); break;
    case 'toggleinfo': {
      const panel = viewEl.querySelector(`[data-info="${ei}"]`);
      if (panel) panel.classList.toggle('hidden');
      break;
    }
  }
}

// live typing in set inputs
function onViewInput(e) {
  const inp = e.target.closest('input[data-field]');
  if (inp) onFieldInput(inp);
}

function onModalClick(e) {
  // sets stepper in the exercise popup (clamp 1–10)
  const stepper = e.target.closest('[data-setstep]');
  if (stepper) {
    const el = $('#esets');
    let n = parseInt(el.textContent, 10) + parseInt(stepper.dataset.setstep, 10);
    n = Math.max(1, Math.min(10, n));
    el.textContent = n;
    return;
  }

  const btn = e.target.closest('[data-mact]');
  if (!btn) return;
  const act = btn.dataset.mact, id = btn.dataset.id;
  const i = btn.dataset.i != null ? +btn.dataset.i : -1;
  switch (act) {
    case 'close': closeModal(); break;
    case 'saveworkout': saveWorkoutFromModal(id); break;
    case 'delworkout': if (confirm('Delete this routine?')) deleteWorkout(id); break;
    case 'saveexercise': saveExerciseFromModal(id); break;
    case 'delexercise': if (confirm('Delete this exercise?')) deleteExercise(id); break;
    case 'delsession': if (confirm('Delete this session from history?')) deleteSession(id); break;
    case 'wmadd': wmIds.push(id); renderWmList(); break;
    case 'wmremove': wmIds.splice(i, 1); renderWmList(); break;
    case 'wmup': if (i > 0) { [wmIds[i - 1], wmIds[i]] = [wmIds[i], wmIds[i - 1]]; renderWmList(); } break;
    case 'wmdown': if (i < wmIds.length - 1) { [wmIds[i + 1], wmIds[i]] = [wmIds[i], wmIds[i + 1]]; renderWmList(); } break;
  }
}

/* =========================================================================
   MODULE
   ========================================================================= */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export default {
  id: 'workout',
  name: 'Workout',
  icon: '▶',
  tabs: [
    { id: 'history', label: 'History', icon: '◲' },
    { id: 'plan',    label: 'Plan',    icon: '▤' },
    { id: 'session', label: 'Session', icon: '▶', badge: () => !!activeSession },
  ],

  render(el, { tab }) {
    viewEl = el;
    el.addEventListener('click', onViewClick);
    el.addEventListener('input', onViewInput);
    if (tab === 'history') renderHistory(el);
    else if (tab === 'plan') renderManage(el);
    else renderActive(el);
  },

  // A session in progress is shown in the header from every module.
  status: () => (activeSession ? { label: 'IN SESSION', route: 'workout/session' } : null),

  backup: {
    describe(storage) {
      try {
        const d = JSON.parse(storage[DB_KEY]);
        return [
          plural((d.workouts || []).length, 'routine', 'routines'),
          plural((d.exercises || []).length, 'exercise', 'exercises'),
          plural((d.sessions || []).length, 'session', 'sessions'),
        ].join(' · ');
      } catch (e) { return null; }
    },
  },
};
