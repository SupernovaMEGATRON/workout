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
  // a shopping cart
  grocery: svg('<path d="M3 4h2.2l2.3 10.5h9.6L19.5 7.5H6.3"/><circle cx="9" cy="18.6" r="1.3"/><circle cx="16.5" cy="18.6" r="1.3"/>'),
  // a ticked box
  check: svg('<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M8.5 12.4l2.4 2.4 4.6-5"/>'),
  // a bulleted list
  items: svg('<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.6" cy="6.5" r="1" fill="currentColor" stroke="none"/><circle cx="4.6" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4.6" cy="17.5" r="1" fill="currentColor" stroke="none"/>'),
};
