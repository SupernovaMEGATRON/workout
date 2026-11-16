/* Settings — backup (export / import) and app version. */
import { $, esc, toast, openModal, closeModal } from '../core/ui.js';
import { allModules } from '../core/shell.js';
import { buildBackup, backupText, backupFileName, parseBackup, applyBackup } from '../core/backup.js';

let pendingImport = null;   // a checked backup waiting for confirmation
let persisted = null;       // whether the browser promised not to clear our data

// One line per module describing what a set of stored values contains.
function describe(storage) {
  return allModules()
    .map(m => (m.backup && m.backup.describe ? m.backup.describe(storage) : null))
    .filter(Boolean);
}

function fmtWhen(iso) {
  const d = new Date(iso);
  if (!iso || isNaN(d)) return 'unknown date';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/* ---------- screen ---------- */
function render(el) {
  el.innerHTML = `
    <h2 class="font-disp text-sm uppercase tracking-widest text-mut mb-3">Backup</h2>
    <div class="bg-panel border border-line rounded-2xl p-4 mb-7">
      <p class="text-xs text-mut leading-relaxed mb-4">Your data exists only on this phone. Export a backup from time to time and keep the file somewhere safe.</p>
      <div class="space-y-2">
        <button data-act="export" class="w-full bg-amber text-ink font-700 rounded-xl py-3">Export my data</button>
        <button data-act="import" class="w-full bg-panel2 border border-line rounded-xl py-3 text-fg">Import a backup</button>
      </div>
    </div>

    <h2 class="font-disp text-sm uppercase tracking-widest text-mut mb-3">App</h2>
    <div class="bg-panel border border-line rounded-2xl p-4">
      <div class="flex items-center justify-between text-sm">
        <span class="text-mut">Version</span>
        <span class="num">${esc(self.PABLO_VERSION || '—')}</span>
      </div>
      <div class="flex items-center justify-between gap-3 text-sm mt-3">
        <span class="text-mut">Data protected from clean-up</span>
        <span id="persistState" class="num shrink-0">${persisted === null ? '…' : persisted ? 'yes' : 'no'}</span>
      </div>
      <button data-act="update" class="w-full bg-panel2 border border-line rounded-xl py-3 text-sm text-fg mt-4">Check for updates</button>
    </div>`;

  el.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'export') exportModal();
    else if (btn.dataset.act === 'import') importModal();
    else if (btn.dataset.act === 'update') checkForUpdate();
  });

  if (persisted === null && navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then(p => {
      persisted = p;
      const s = $('#persistState');
      if (s) s.textContent = p ? 'yes' : 'no';
    }).catch(() => {});
  }
}

async function checkForUpdate() {
  if (!('serviceWorker' in navigator)) { toast('Updates are not available here'); return; }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) { toast('Updates are not available here'); return; }
    await reg.update();
    // If a new version was found, the update bar appears by itself.
    if (!reg.installing && !reg.waiting) toast('You have the latest version');
  } catch (e) {
    toast('Could not check — are you online?');
  }
}

/* ---------- export ---------- */
// Phones only share a few file types; fall back from .json to .txt (same content).
function shareFile() {
  if (!navigator.canShare || typeof File === 'undefined') return null;
  const text = backupText();
  const candidates = [
    new File([text], backupFileName('json'), { type: 'application/json' }),
    new File([text], backupFileName('txt'), { type: 'text/plain' }),
  ];
  return candidates.find(f => { try { return navigator.canShare({ files: [f] }); } catch (e) { return false; } }) || null;
}

function exportModal() {
  const lines = describe(buildBackup().storage);
  openModal(`
    <div class="flex items-center justify-between mb-2">
      <h3 class="font-disp text-lg font-700">Export my data</h3>
      <button data-mact="close" class="text-mut text-xl leading-none">×</button>
    </div>
    <div class="text-xs num text-mut mb-5 space-y-0.5">${lines.map(l => `<div>${esc(l)}</div>`).join('') || '<div>No data yet</div>'}</div>
    <div class="space-y-2">
      <button data-mact="exportfile" class="w-full bg-amber text-ink font-700 rounded-xl py-3">Save as file</button>
      ${shareFile() ? '<button data-mact="exportshare" class="w-full bg-panel2 border border-line rounded-xl py-3 text-fg">Share file…</button>' : ''}
      <button data-mact="exportcopy" class="w-full bg-panel2 border border-line rounded-xl py-3 text-fg">Copy as text</button>
    </div>
    <p class="text-[11px] text-mut mt-4">“Save as file” puts the backup in your Downloads folder. Your data in the app is not touched.</p>`, onModalClick);
}

function exportDownload() {
  const blob = new Blob([backupText()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName('json');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast('Backup file saved');
}

async function exportShare() {
  const file = shareFile();
  if (!file) { toast('Sharing not available — use Save as file'); return; }
  try {
    await navigator.share({ files: [file], title: 'PABLO backup' });
  } catch (e) {
    if (e && e.name !== 'AbortError') toast('Share failed — use Save as file');
  }
}

async function exportCopy() {
  const text = backupText();
  try {
    await navigator.clipboard.writeText(text);
    toast('Backup copied');
  } catch (e) {
    // Older browsers / non-secure pages: copy through a temporary text box.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) {}
    ta.remove();
    toast(ok ? 'Backup copied' : 'Copy failed — use Save as file');
  }
}

/* ---------- import ---------- */
function importModal() {
  pendingImport = null;
  openModal(`
    <div class="flex items-center justify-between mb-2">
      <h3 class="font-disp text-lg font-700">Import a backup</h3>
      <button data-mact="close" class="text-mut text-xl leading-none">×</button>
    </div>
    <p class="text-xs text-mut leading-relaxed mb-4">Choose a backup file made with “Export my data”. You will see what it contains before anything is replaced.</p>
    <input id="importFile" type="file" accept=".json,.txt,application/json,text/plain" class="hidden" />
    <div class="space-y-2">
      <button data-mact="pickfile" class="w-full bg-amber text-ink font-700 rounded-xl py-3">Choose backup file</button>
      <button data-mact="showpaste" class="w-full bg-panel2 border border-line rounded-xl py-3 text-fg">Paste backup text</button>
    </div>
    <div id="pasteBox" class="hidden mt-3">
      <textarea id="importText" rows="4" placeholder="Paste the backup text here"
        class="num w-full bg-panel2 border border-line rounded-xl px-3 py-3 text-fg text-xs outline-none focus:border-amber/60 resize-none"></textarea>
      <button data-mact="usepaste" class="w-full bg-panel2 border border-line rounded-xl py-3 text-fg mt-2">Use this text</button>
    </div>`, onModalClick);

  $('#importFile').addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    file.text().then(reviewImport).catch(() => toast('Could not read this file'));
  });
}

// Show what the backup contains and ask before replacing anything.
function reviewImport(text) {
  let backup;
  try { backup = parseBackup(text); } catch (e) { toast(e.message); return; }
  pendingImport = backup;

  const incoming = describe(backup.storage);
  const current = describe(buildBackup().storage);
  const list = lines => lines.map(l => `<div>${esc(l)}</div>`).join('') || '<div>Nothing</div>';
  openModal(`
    <div class="flex items-center justify-between mb-3">
      <h3 class="font-disp text-lg font-700">Replace your data?</h3>
      <button data-mact="close" class="text-mut text-xl leading-none">×</button>
    </div>
    <div class="bg-panel2 border border-line rounded-xl p-3 mb-2">
      <div class="text-[11px] uppercase tracking-widest text-mut mb-1">In the backup · ${esc(fmtWhen(backup.exportedAt))}</div>
      <div class="text-sm num">${list(incoming)}</div>
    </div>
    <div class="bg-panel2 border border-line rounded-xl p-3 mb-4">
      <div class="text-[11px] uppercase tracking-widest text-mut mb-1">In the app now</div>
      <div class="text-sm num">${list(current)}</div>
    </div>
    <p class="text-xs text-amber leading-relaxed mb-4">Importing replaces what is in the app now with what is in the backup. This cannot be undone. Anything added since the backup was made will be lost.</p>
    <div class="flex gap-2">
      <button data-mact="close" class="px-4 py-3 rounded-xl border border-line text-mut active:text-fg">Cancel</button>
      <button data-mact="confirmimport" class="flex-1 bg-amber text-ink font-700 rounded-xl py-3">Replace my data</button>
    </div>`, onModalClick);
}

function confirmImport() {
  if (!pendingImport) return;
  try { applyBackup(pendingImport); } catch (e) { toast(e.message); return; }
  pendingImport = null;
  // Start again from a clean page so every module reads the restored data.
  closeModal(() => location.reload());
}

function onModalClick(e) {
  const btn = e.target.closest('[data-mact]');
  if (!btn) return;
  switch (btn.dataset.mact) {
    case 'close': closeModal(); break;
    case 'exportfile': exportDownload(); break;
    case 'exportshare': exportShare(); break;
    case 'exportcopy': exportCopy(); break;
    case 'pickfile': $('#importFile').click(); break;
    case 'showpaste': $('#pasteBox').classList.remove('hidden'); $('#importText').focus(); break;
    case 'usepaste': {
      const text = $('#importText').value.trim();
      if (!text) { toast('Paste the backup text first'); return; }
      reviewImport(text);
      break;
    }
    case 'confirmimport': confirmImport(); break;
  }
}

export default {
  id: 'settings',
  name: 'Settings',
  icon: '⚙',
  tabs: [],
  footer: true,
  remember: false,
  render,
};
