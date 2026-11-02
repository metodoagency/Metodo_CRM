// Neutral fallback palette. No owner CV or connected design file was supplied.
export const tokens = {
  colors: { canvas: '#0d1219', panel: '#141c27', border: '#26313f', text: '#dfe6ed', muted: '#8e9bae', accent: '#b9e781' },
  type: { small: 11, body: 13, section: 15, title: 30, metric: 36 },
  spacing: [4, 8, 12, 16, 24, 32, 40],
  radii: { control: 7, panel: 10, modal: 14 },
} as const;
