// Theme for the locally stored Tailwind runtime (vendor/tailwind.js).
tailwind.config = {
  theme: {
    extend: {
      colors: {
        ink:    '#0C0E12',
        panel:  '#151920',
        panel2: '#1C222B',
        line:   '#2A313B',
        fg:     '#EDF0F4',
        mut:    '#7C8794',
        amber:  '#F5A524',
        amberd: '#40320F',
        steel:  '#7FA6C9',
        steeld: '#233240',
      },
      fontFamily: {
        disp: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
};
