import { EditorView } from '@codemirror/view';
import { darkColors, lightColors } from './colors';

/**
 * CodeMirror theme extension for hover tooltips, autocomplete dropdowns,
 * and lint diagnostics — styled with the Tokyo Night palette.
 *
 * CodeMirror tooltips render as portals outside the editor DOM, so they
 * don't inherit the editor's theme. This extension targets those elements
 * via EditorView.theme.
 */
export function tooltipTheme(mode: 'dark' | 'light' = 'dark') {
  const c = mode === 'dark' ? darkColors : lightColors;
  const mono = "'SF Mono', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', monospace";

  return EditorView.theme({
    // Hover tooltip container
    '.cm-tooltip-hover': {
      background: `${c.surface} !important`,
      border: `1px solid ${c.borderLight} !important`,
      borderRadius: '6px',
      maxWidth: '480px',
    },
    // Hover tooltip content (class set by formatHoverMarkdown in the hover handler)
    '.cm-hover-tooltip': {
      padding: '10px 14px',
      fontSize: '13px',
      color: c.text,
      lineHeight: '1.5',
    },
    '.cm-hover-tooltip strong': {
      color: c.accent,
      fontWeight: '700',
    },
    '.cm-hover-tooltip code': {
      fontFamily: mono,
      fontSize: '12px',
      background: c.bg,
      padding: '1px 5px',
      borderRadius: '3px',
      color: c.green,
    },
    '.cm-hover-tooltip pre': {
      fontFamily: mono,
      fontSize: '12px',
      background: c.bg,
      padding: '8px 10px',
      borderRadius: '4px',
      margin: '6px 0',
      color: c.text,
      overflowX: 'auto',
    },
    '.cm-hover-tooltip pre code': {
      background: 'none',
      padding: '0',
    },

    // Autocomplete dropdown
    '.cm-tooltip-autocomplete': {
      background: `${c.surface} !important`,
      border: `1px solid ${c.borderLight} !important`,
      borderRadius: '6px',
    },
    '.cm-tooltip-autocomplete ul li': {
      color: c.text,
      fontFamily: mono,
      fontSize: '13px',
      padding: '4px 10px',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      background: `${c.accentDim} !important`,
      color: `${c.accent} !important`,
    },
    '.cm-tooltip-autocomplete .cm-completionLabel': {
      color: 'inherit',
    },
    '.cm-tooltip-autocomplete .cm-completionDetail': {
      color: c.muted,
      fontStyle: 'normal',
      marginLeft: '8px',
    },
    '.cm-completionIcon': {
      display: 'none',
    },

    // Lint diagnostics tooltip
    '.cm-tooltip-lint': {
      background: c.surface,
      border: `1px solid ${c.borderLight}`,
      borderRadius: '6px',
      color: c.text,
      fontFamily: mono,
      fontSize: '12px',
    },

    // Squiggly error underlines
    '.cm-lintRange-error': {
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='m0 3 l2 -2 l1 0 l2 2 l1 0' fill='none' stroke='${encodeURIComponent(c.error)}' stroke-width='.7'/%3E%3C/svg%3E")`,
      backgroundRepeat: 'repeat-x',
      backgroundPosition: 'bottom',
      backgroundSize: '6px 3px',
      paddingBottom: '1px',
    },
    '.cm-diagnostic-error': {
      borderBottom: 'none',
    },
    '.cm-lint-marker': {
      display: 'none',
    },
  }, { dark: mode === 'dark' });
}
