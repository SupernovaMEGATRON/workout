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
  // a folder
  projects: svg('<path d="M3.5 8a2 2 0 0 1 2-2h3.6l2 2.4h7.4a2 2 0 0 1 2 2V16.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/>'),
  // a ticked circle
  done: svg('<circle cx="12" cy="12" r="8.5"/><path d="M8.3 12.3l2.5 2.5 4.9-5.3"/>'),
  // two arrows going round
  routine: svg('<path d="M4.5 11a7.5 7.5 0 0 1 12.9-4.6L19.5 8.5"/><path d="M19.5 4v4.5H15"/><path d="M19.5 13a7.5 7.5 0 0 1-12.9 4.6L4.5 15.5"/><path d="M4.5 20v-4.5H9"/>'),
  // a calendar page
  calendar: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><circle cx="8.5" cy="14" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="14" r="1" fill="currentColor" stroke="none"/>'),
  // a house
  home: svg('<path d="M4 11 12 4.5 20 11"/><path d="M6 9.5V19.5h12V9.5"/><path d="M10 19.5v-5h4v5"/>'),
};
