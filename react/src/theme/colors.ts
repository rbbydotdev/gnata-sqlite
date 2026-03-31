/** Tokyo Night dark palette */
export const darkColors = {
  bg: '#1a1b26',
  surface: '#1f2335',
  surfaceHover: 'rgba(255,255,255,0.04)',
  text: '#a9b1d6',
  textStrong: '#c0caf5',
  accent: '#7aa2f7',
  accentDim: 'rgba(122,162,247,0.12)',
  accentHover: '#89b4fa',
  accentText: '#1a1b26',
  green: '#9ece6a',
  greenDim: 'rgba(158,206,106,0.12)',
  vista: '#bb9af7',
  orange: '#ff9e64',
  teal: '#73daca',
  error: '#f7768e',
  muted: '#565f89',
  border: '#292e42',
  borderLight: '#3b4261',
  select: '#283457',
} as const;

/** Tokyo Night light palette */
export const lightColors = {
  bg: '#d5d6db',
  surface: '#e1e2e7',
  surfaceHover: 'rgba(0,0,0,0.04)',
  text: '#3760bf',
  textStrong: '#343b58',
  accent: '#2e7de9',
  accentDim: 'rgba(46,125,233,0.10)',
  accentHover: '#1d4ed0',
  accentText: '#ffffff',
  green: '#587539',
  greenDim: 'rgba(88,117,57,0.12)',
  vista: '#7847bd',
  orange: '#b15c00',
  teal: '#118c74',
  error: '#c64343',
  muted: '#848cb5',
  border: '#c4c8da',
  borderLight: '#b6bfe2',
  select: '#b6bfe2',
} as const;

export type ColorPalette = typeof darkColors;

/** CodeMirror token colors for syntax highlighting */
export interface CMTokenColors {
  bg: string;
  fg: string;
  comment: string;
  string: string;
  number: string;
  keyword: string;
  func: string;
  variable: string;
  operator: string;
  error: string;
  select: string;
  cursor: string;
  property: string;
  bracket: string;
}

export const darkTokenColors: CMTokenColors = {
  bg: '#1a1b26',
  fg: '#c0caf5',
  comment: '#565f89',
  string: '#9ece6a',
  number: '#ff9e64',
  keyword: '#bb9af7',
  func: '#7aa2f7',
  variable: '#B5E600',
  operator: '#89ddff',
  error: '#f7768e',
  select: '#283457',
  cursor: '#c0caf5',
  property: '#73daca',
  bracket: '#698098',
};

export const lightTokenColors: CMTokenColors = {
  bg: '#e1e2e7',
  fg: '#3760bf',
  comment: '#848cb5',
  string: '#587539',
  number: '#b15c00',
  keyword: '#7847bd',
  func: '#2e7de9',
  variable: '#2563eb',
  operator: '#d20065',
  error: '#f52a65',
  select: '#b6bfe2',
  cursor: '#3760bf',
  property: '#118c74',
  bracket: '#848cb5',
};
