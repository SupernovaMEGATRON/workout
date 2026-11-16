/* Small drawn icons (SVG), so they look the same on every phone — text symbols depend
   on the fonts installed. Use: icons.today, icons.history… as a module or tab `icon`. */
const svg = body => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  // a quarter-filled disc
  calories: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 12V3.5A8.5 8.5 0 0 1 20.5 12Z" fill="currentColor" stroke="none"/>'),
  // a dot in a ring
  today: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>'),
  // a clock
  history: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  // a target
  goals: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>'),
};
