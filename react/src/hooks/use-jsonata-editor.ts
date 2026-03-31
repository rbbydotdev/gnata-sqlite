import { useRef, useEffect, useCallback } from 'react';
import { EditorView, keymap, placeholder as placeholderExt, hoverTooltip } from '@codemirror/view';
import { EditorState, Compartment, type Extension } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { autocompletion, type CompletionContext } from '@codemirror/autocomplete';
import { linter } from '@codemirror/lint';
import { jsonataStreamLanguage } from '../utils/tokenizer';
import { allKeysFromJson, formatHoverMarkdown, type Schema } from '../utils/schema';
import { tokyoNightTheme } from '../theme/tokyo-night';
import type { CMTokenColors } from '../theme/colors';

export interface UseJsonataEditorOptions {
  /** Ref to the container DOM element */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Initial document content */
  initialDoc?: string;
  /** Placeholder text for empty editor */
  placeholder?: string;
  /** Called when document content changes */
  onChange?: (value: string) => void;
  /** Called on Cmd/Ctrl+Enter */
  onRun?: () => void;
  /** Built-in theme. Ignored if themeExtensions is set. */
  theme?: 'dark' | 'light';
  /** Override individual token colors */
  themeOverrides?: Partial<CMTokenColors>;
  /** Replace the built-in theme entirely */
  themeExtensions?: Extension[];
  /** WASM eval function for introspective autocomplete */
  gnataEval?: ((expr: string, data: string) => string) | null;
  /** WASM LSP diagnostics function */
  gnataDiagnostics?: ((doc: string) => string) | null;
  /** WASM LSP completions function */
  gnataCompletions?: ((doc: string, pos: number, schema: string) => string) | null;
  /** WASM LSP hover function */
  gnataHover?: ((doc: string, pos: number, schema: string) => string | null) | null;
  /** Getter for current input JSON (used in autocomplete evaluation) */
  getInputJson?: () => string;
  /** Schema derived from input data (used for LSP completions/hover) */
  schema?: Schema;
  /** Whether to show line numbers (default: false for expression editor) */
  lineNumbers?: boolean;
}

export interface UseJsonataEditorReturn {
  /** The CodeMirror EditorView instance, or null before mount */
  view: EditorView | null;
  /** Get the current document content */
  getValue: () => string;
  /** Set the document content */
  setValue: (text: string) => void;
  /** Update the theme dynamically */
  setTheme: (mode: 'dark' | 'light', overrides?: Partial<CMTokenColors>) => void;
}

/**
 * Hook to create a CodeMirror 6 editor with JSONata language support.
 *
 * Configures syntax highlighting, autocomplete, diagnostics (linting),
 * and hover tooltips based on the provided WASM functions.
 *
 * Works without WASM -- provides syntax highlighting only. When WASM
 * functions are supplied, full language support activates.
 */
export function useJsonataEditor(options: UseJsonataEditorOptions): UseJsonataEditorReturn {
  const viewRef = useRef<EditorView | null>(null);
  const themeCompRef = useRef(new Compartment());

  // Stable refs for callbacks that change frequently
  const onChangeRef = useRef(options.onChange);
  onChangeRef.current = options.onChange;
  const onRunRef = useRef(options.onRun);
  onRunRef.current = options.onRun;
  const gnataEvalRef = useRef(options.gnataEval);
  gnataEvalRef.current = options.gnataEval;
  const gnataDiagnosticsRef = useRef(options.gnataDiagnostics);
  gnataDiagnosticsRef.current = options.gnataDiagnostics;
  const gnataCompletionsRef = useRef(options.gnataCompletions);
  gnataCompletionsRef.current = options.gnataCompletions;
  const gnataHoverRef = useRef(options.gnataHover);
  gnataHoverRef.current = options.gnataHover;
  const getInputJsonRef = useRef(options.getInputJson);
  getInputJsonRef.current = options.getInputJson;
  const schemaRef = useRef(options.schema);
  schemaRef.current = options.schema;

  const getValue = useCallback(() => {
    return viewRef.current?.state.doc.toString() ?? '';
  }, []);

  const setValue = useCallback((text: string) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
    });
  }, []);

  const setTheme = useCallback((mode: 'dark' | 'light', overrides?: Partial<CMTokenColors>) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompRef.current.reconfigure(tokyoNightTheme(mode, overrides)),
    });
  }, []);

  // Create editor on mount
  useEffect(() => {
    const container = options.containerRef.current;
    if (!container || viewRef.current) return;

    // Autocomplete: introspective + LSP-based
    function jsonataComplete(context: CompletionContext) {
      const doc = context.state.doc.toString();
      const pos = context.pos;
      const getInputJson = getInputJsonRef.current;
      const inputJson = getInputJson ? getInputJson().trim() : 'null';
      const gnataEval = gnataEvalRef.current;
      const gnataCompletions = gnataCompletionsRef.current;
      const schema = schemaRef.current;

      let from = pos;
      while (from > 0) {
        const ch = doc.charCodeAt(from - 1);
        if (
          (ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122) ||
          (ch >= 48 && ch <= 57) || ch === 95 || ch === 36
        ) from--;
        else break;
      }
      const partial = doc.substring(from, pos);
      const beforeFrom = doc.substring(0, from);
      const isDot = beforeFrom.length > 0 && beforeFrom[beforeFrom.length - 1] === '.';

      // If typing after a dot, try to evaluate the prefix expression
      if (isDot && gnataEval) {
        const prefixExpr = beforeFrom.substring(0, beforeFrom.length - 1).trim();
        let items = null;
        if (prefixExpr) items = tryEvalKeys(prefixExpr, inputJson, partial, gnataEval);
        if (!items || items.length === 0) items = allKeysFromJson(inputJson, partial);
        if (items && items.length > 0) return { from, options: items.slice(0, 10) };
      }

      // Try LSP completions
      if (gnataCompletions) {
        let schemaStr = '';
        try { schemaStr = JSON.stringify(schema || {}); } catch { /* empty */ }
        try {
          const result = gnataCompletions(doc, pos, schemaStr);
          const items = JSON.parse(result);
          if (items.length > 0) return { from, options: items.slice(0, 10) };
        } catch { /* empty */ }
      }

      // Fallback: all keys from input JSON
      if (isDot) {
        const items = allKeysFromJson(inputJson, partial);
        if (items && items.length > 0) return { from, options: items.slice(0, 10) };
      }

      return null;
    }

    // Linter: WASM-powered diagnostics
    const jsonataLinter = linter(
      (view) => {
        const diagnosticsFn = gnataDiagnosticsRef.current;
        if (!diagnosticsFn) return [];
        const doc = view.state.doc.toString();
        if (!doc.trim()) return [];
        try {
          const result = diagnosticsFn(doc);
          const diags: Array<{ from: number; to: number; message: string }> = JSON.parse(result);
          return diags.map(d => ({
            from: Math.max(0, d.from),
            to: Math.min(doc.length, Math.max(d.from + 1, d.to)),
            severity: 'error' as const,
            message: d.message,
          }));
        } catch {
          return [];
        }
      },
      { delay: 200 },
    );

    // Hover tooltip: WASM LSP-powered
    const hoverProvider = hoverTooltip((view, pos) => {
      const hoverFn = gnataHoverRef.current;
      if (!hoverFn) return null;
      const doc = view.state.doc.toString();
      const schema = schemaRef.current;
      let schemaStr = '';
      try { schemaStr = JSON.stringify(schema || {}); } catch { /* empty */ }
      const result = hoverFn(doc, pos, schemaStr);
      if (!result) return null;
      try {
        const info: { from: number; to: number; text: string } = JSON.parse(result);
        return {
          pos: info.from,
          end: info.to,
          above: true,
          create() {
            const dom = document.createElement('div');
            dom.className = 'cm-hover-tooltip';
            dom.innerHTML = formatHoverMarkdown(info.text);
            return { dom };
          },
        };
      } catch {
        return null;
      }
    });

    const extensions: Extension[] = [
      keymap.of([...defaultKeymap, ...historyKeymap]),
      history(),
      jsonataStreamLanguage,
      themeCompRef.current.of(
        options.themeExtensions ?? tokyoNightTheme(options.theme ?? 'dark', options.themeOverrides),
      ),
      autocompletion({
        override: [jsonataComplete],
        activateOnTyping: true,
        icons: false,
      }),
      jsonataLinter,
      hoverProvider,
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          onChangeRef.current?.(update.state.doc.toString());
        }
      }),
      EditorView.domEventHandlers({
        keydown(e: KeyboardEvent) {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            onRunRef.current?.();
            return true;
          }
          return false;
        },
      }),
    ];

    if (options.placeholder) {
      extensions.push(placeholderExt(options.placeholder));
    }

    const view = new EditorView({
      state: EditorState.create({
        doc: options.initialDoc ?? '',
        extensions,
      }),
      parent: container,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  // Update theme when theme prop changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const exts = options.themeExtensions ?? tokyoNightTheme(options.theme ?? 'dark', options.themeOverrides);
    view.dispatch({ effects: themeCompRef.current.reconfigure(exts) });
  }, [options.theme, options.themeOverrides, options.themeExtensions]);

  return {
    view: viewRef.current,
    getValue,
    setValue,
    setTheme,
  };
}

/**
 * Try to evaluate a prefix expression and return keys of the result object.
 */
function tryEvalKeys(
  expr: string,
  inputJson: string,
  partial: string,
  gnataEval: (expr: string, data: string) => string,
): Array<{ label: string; type: string; detail: string; boost: number }> | null {
  try {
    const raw = gnataEval(expr, inputJson);
    let val: unknown = JSON.parse(raw);
    if (Array.isArray(val)) val = val.find((v: unknown) => v && typeof v === 'object') || null;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.keys(val as Record<string, unknown>)
        .filter(k => !partial || k.toLowerCase().startsWith(partial.toLowerCase()))
        .map(k => {
          const v = (val as Record<string, unknown>)[k];
          return {
            label: k,
            type:
              typeof v === 'number' ? 'number' :
              typeof v === 'string' ? 'string' :
              Array.isArray(v) ? 'enum' :
              'property',
            detail: typeof v === 'object' ? (Array.isArray(v) ? 'array' : 'object') : typeof v,
            boost: 3,
          };
        });
    }
  } catch { /* empty */ }
  return null;
}
