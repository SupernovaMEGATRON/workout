/* =========================================================================
   Backup — export every module's data to one file, and restore from it.

   The file holds the stored values exactly as they are in LocalStorage (as text),
   so a restore is byte for byte.
     format 1: written by the old single-file app (workout only)
     format 2: written by this app (all modules)
   ========================================================================= */

const PREFIXES = ['ledger_', 'pablo_'];          // every key this app owns
const NOT_DATA = ['pablo_shell_v1'];             // last screen, kept by older versions only
// Keys that may legitimately be absent. Exported as null so that a restore removes them.
const OPTIONAL = ['ledger_active_v1'];

const owned = key => PREFIXES.some(p => key.startsWith(p)) && !NOT_DATA.includes(key);

export function buildBackup() {
  const storage = {};
  OPTIONAL.forEach(k => { storage[k] = null; });
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (owned(key)) storage[key] = localStorage.getItem(key);
  }
  return {
    app: 'PABLO',
    format: 2,
    version: self.PABLO_VERSION || null,
    exportedAt: new Date().toISOString(),
    storage,
  };
}

export const backupText = () => JSON.stringify(buildBackup(), null, 2);

export function backupFileName(ext) {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `pablo-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.${ext}`;
}

// Read and check a backup. Throws an Error with a message meant for the user.
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('This is not a PABLO backup (the text is not readable).'); }
  if (!data || data.app !== 'PABLO' || typeof data.storage !== 'object' || data.storage === null || Array.isArray(data.storage)) {
    throw new Error('This is not a PABLO backup.');
  }
  if (data.format !== 1 && data.format !== 2) {
    throw new Error('This backup was made by a newer version of PABLO. Update the app first.');
  }
  const storage = {};
  for (const [key, value] of Object.entries(data.storage)) {
    if (!owned(key)) continue;                              // ignore anything that is not ours
    if (value === null) { storage[key] = null; continue; }
    if (typeof value !== 'string') throw new Error('This backup is damaged.');
    try { JSON.parse(value); } catch (e) { throw new Error('This backup is damaged.'); }
    storage[key] = value;
  }
  if (!Object.values(storage).some(v => v !== null)) throw new Error('This backup is empty.');
  return { format: data.format, exportedAt: data.exportedAt || null, storage };
}

// Replace the stored values with those of the backup. Only keys present in the backup
// are touched. If anything fails midway, everything is put back as it was.
export function applyBackup(backup) {
  const before = {};
  Object.keys(backup.storage).forEach(k => { before[k] = localStorage.getItem(k); });
  const write = (k, v) => { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); };
  try {
    Object.entries(backup.storage).forEach(([k, v]) => write(k, v));
  } catch (e) {
    Object.entries(before).forEach(([k, v]) => { try { write(k, v); } catch (err) {} });
    throw new Error('Could not restore: the phone refused to store the data. Nothing was changed.');
  }
}
