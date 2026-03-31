import { EditorView } from '@codemirror/view';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { Extension } from '@codemirror/state';
import {
  type CMTokenColors,
  darkTokenColors,
  lightTokenColors,
} from './colors';
import { tooltipTheme } from './tooltips';

/**
 * Create a CodeMirror editor theme from token colors.
 */
export function createEditorTheme(colors: CMTokenColors, dark: boolean): Extension {
  return EditorView.theme(
    {
      '&': { backgroundColor: colors.bg, color: colors.fg },
      '.cm-content': { caretColor: colors.cursor },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: colors.cursor },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
        background: colors.select + ' !important',
      },
      '.cm-activeLine': {
        backgroundColor: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)',
      },
      '.cm-gutters': {
        backgroundColor: colors.bg,
        color: colors.comment,
        border: 'none',
      },
      '.cm-activeLineGutter': { backgroundColor: 'transparent' },
    },
    { dark },
  );
}

/**
 * Create a CodeMirror highlight style from token colors.
 */
export function createHighlightStyle(colors: CMTokenColors): HighlightStyle {
  return HighlightStyle.define([
    { tag: t.keyword, color: colors.keyword },
    { tag: t.operator, color: colors.operator },
    { tag: t.atom, color: colors.variable },
    { tag: t.variableName, color: colors.property },
    { tag: t.function(t.variableName), color: colors.func },
    { tag: t.string, color: colors.string },
    { tag: t.number, color: colors.number },
    { tag: t.bool, color: colors.number },
    { tag: t.null, color: colors.comment },
    { tag: t.regexp, color: colors.error },
    { tag: t.blockComment, color: colors.comment },
    { tag: t.propertyName, color: colors.property },
    { tag: t.arithmeticOperator, color: colors.operator },
    { tag: t.compareOperator, color: colors.operator },
    { tag: t.paren, color: colors.bracket },
    { tag: t.squareBracket, color: colors.bracket },
    { tag: t.brace, color: colors.bracket },
    { tag: t.separator, color: colors.comment },
  ]);
}

/**
 * Build full Tokyo Night theme extensions for CodeMirror.
 * Accepts optional color overrides.
 */
export function tokyoNightTheme(
  mode: 'dark' | 'light',
  overrides?: Partial<CMTokenColors>,
): Extension[] {
  const base = mode === 'dark' ? darkTokenColors : lightTokenColors;
  const colors = overrides ? { ...base, ...overrides } : base;
  return [
    createEditorTheme(colors, mode === 'dark'),
    syntaxHighlighting(createHighlightStyle(colors)),
    tooltipTheme(mode),
  ];
}
