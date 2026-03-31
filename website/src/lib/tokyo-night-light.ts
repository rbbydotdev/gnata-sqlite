import type { ThemeRegistrationRaw } from 'shiki';

/**
 * Tokyo Night Day theme for Shiki — matches the playground.html light mode.
 * Colors extracted from the original playground's CodeMirror light config.
 */
export const tokyoNightLight: ThemeRegistrationRaw = {
  name: 'tokyo-night-light',
  type: 'light',
  settings: [],
  colors: {
    'editor.background': '#e1e2e7',
    'editor.foreground': '#3760bf',
    'editor.selectionBackground': '#b6bfe2',
    'editorCursor.foreground': '#3760bf',
    'editor.lineHighlightBackground': '#d5d6db',
    'editorLineNumber.foreground': '#848cb5',
    'editorGutter.background': '#e1e2e7',
  },
  tokenColors: [
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#848cb5' } },
    { scope: ['string', 'string.quoted'], settings: { foreground: '#587539' } },
    { scope: ['constant.numeric'], settings: { foreground: '#b15c00' } },
    { scope: ['constant.language.boolean'], settings: { foreground: '#b15c00' } },
    { scope: ['constant.language.null', 'constant.language.undefined'], settings: { foreground: '#848cb5' } },
    { scope: ['keyword', 'storage.type', 'storage.modifier'], settings: { foreground: '#7847bd' } },
    { scope: ['keyword.operator'], settings: { foreground: '#d20065' } },
    { scope: ['entity.name.function', 'support.function'], settings: { foreground: '#2e7de9' } },
    { scope: ['entity.name.type', 'support.type', 'support.class'], settings: { foreground: '#2e7de9' } },
    { scope: ['variable', 'entity.name.variable'], settings: { foreground: '#3760bf' } },
    { scope: ['variable.other.property', 'support.variable.property', 'meta.object-literal.key'], settings: { foreground: '#118c74' } },
    { scope: ['punctuation.bracket', 'meta.brace'], settings: { foreground: '#848cb5' } },
    { scope: ['punctuation.separator', 'punctuation.terminator'], settings: { foreground: '#848cb5' } },
    { scope: ['entity.name.tag'], settings: { foreground: '#f52a65' } },
    { scope: ['entity.other.attribute-name'], settings: { foreground: '#b15c00' } },
    { scope: ['keyword.operator.expression', 'keyword.control.import', 'keyword.control.from', 'keyword.control.export'], settings: { foreground: '#7847bd' } },
    { scope: ['support.type.builtin', 'keyword.type'], settings: { foreground: '#2e7de9' } },
    { scope: ['markup.inline.raw', 'string.other.link'], settings: { foreground: '#118c74' } },
  ],
};
