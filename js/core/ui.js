/* Shared interface helpers: DOM shortcuts, toast, popup (modal). */
import * as nav from './nav.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- toast ---------- */
let toastTimer = null;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 1900);
}

/* ---------- popup ----------
   One popup at a time. `onClick` receives every click inside the card while it is open.
   Opening adds a history entry, so the back gesture closes the popup. */
let modalOpen = false;

export function openModal(html, onClick) {
  const card = $('#modalCard');
  card.innerHTML = html;
  card.onclick = onClick || null;
  card.scrollTop = 0;
  $('#modal').classList.remove('hidden');
  if (!modalOpen) {
    modalOpen = true;
    nav.pushOverlay(hideModal);
  }
}

// `after` runs once the popup is closed and it is safe to navigate.
export function closeModal(after) {
  if (!modalOpen) { if (after) after(); return; }
  nav.closeOverlay(after);
}

function hideModal() {
  modalOpen = false;
  const card = $('#modalCard');
  $('#modal').classList.add('hidden');
  card.innerHTML = '';
  card.onclick = null;
}

export function initUi() {
  $('#modalBackdrop').addEventListener('click', () => closeModal());
}
