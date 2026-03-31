import React, { useRef, useCallback, useEffect } from 'react';
import type { Extension } from '@codemirror/state';
import { useJsonataEditor } from '../hooks/use-jsonata-editor';
import type { CMTokenColors } from '../theme/colors';
import type { Schema } from '../utils/schema';

export interface JsonataEditorProps {
  /** Current expression value */
  value?: string;
  /** Called when expression changes */
  onChange?: (value: string) => void;
  /** Called on Cmd/Ctrl+Enter */
  onRun?: () => void;
  /** Built-in theme: 'dark' | 'light'. Ignored if themeExtensions is set. */
  theme?: 'dark' | 'light';
  /** Override individual token colors within the built-in theme */
  themeOverrides?: Partial<CMTokenColors>;
  /** Replace the built-in theme entirely with your own CodeMirror extensions */
  themeExtensions?: Extension[];
  /** Placeholder text */
  placeholder?: string;
  /** Schema for autocomplete */
  schema?: Schema;
  /** WASM eval function (from useJsonataWasm) */
  gnataEval?: ((expr: string, data: string) => string) | null;
  /** WASM LSP diagnostics function (from useJsonataWasm) */
  gnataDiagnostics?: ((doc: string) => string) | null;
  /** WASM LSP completions function (from useJsonataWasm) */
  gnataCompletions?: ((doc: string, pos: number, schema: string) => string) | null;
  /** WASM LSP hover function (from useJsonataWasm) */
  gnataHover?: ((doc: string, pos: number, schema: string) => string | null) | null;
  /** Getter for current input JSON (for introspective autocomplete) */
  getInputJson?: () => string;
  /** CSS class name for the container */
  className?: string;
  /** Inline style for the container */
  style?: React.CSSProperties;
}

const defaultStyle: React.CSSProperties = {
  overflow: 'hidden',
  fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', monospace",
  fontSize: '14px',
};

/**
 * JSONata expression editor component.
 *
 * Wraps CodeMirror 6 with the JSONata StreamLanguage tokenizer.
 * Supports autocomplete, hover tooltips, and diagnostics when
 * WASM functions are provided.
 *
 * Works without WASM for syntax-only highlighting.
 */
export const JsonataEditor = React.memo(function JsonataEditor(props: JsonataEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const getInputJsonRef = useRef(props.getInputJson);
  getInputJsonRef.current = props.getInputJson;

  const stableGetInputJson = useCallback(() => {
    return getInputJsonRef.current ? getInputJsonRef.current() : 'null';
  }, []);

  // Track whether changes originated from user typing (internal) vs external prop changes
  const internalChangeRef = useRef(false);

  const handleChange = useCallback((value: string) => {
    internalChangeRef.current = true;
    props.onChange?.(value);
  }, [props.onChange]);

  const { setValue } = useJsonataEditor({
    containerRef,
    initialDoc: props.value ?? '',
    placeholder: props.placeholder ?? 'e.g. Account.Order.Product.(Price * Quantity)',
    onChange: handleChange,
    onRun: props.onRun,
    theme: props.theme ?? 'dark',
    themeOverrides: props.themeOverrides,
    themeExtensions: props.themeExtensions,
    gnataEval: props.gnataEval,
    gnataDiagnostics: props.gnataDiagnostics,
    gnataCompletions: props.gnataCompletions,
    gnataHover: props.gnataHover,
    getInputJson: stableGetInputJson,
    schema: props.schema,
  });

  // Sync external value prop into editor — only when the change came from outside
  // (not from the editor's own typing, which would reset the cursor)
  const prevValueRef = useRef(props.value);
  useEffect(() => {
    if (props.value !== undefined && props.value !== prevValueRef.current) {
      prevValueRef.current = props.value;
      if (internalChangeRef.current) {
        // Change originated from user typing — don't push back to editor
        internalChangeRef.current = false;
      } else {
        // External change (e.g. loading an example) — update editor content
        setValue(props.value);
      }
    }
  }, [props.value, setValue]);

  return (
    <div
      ref={containerRef}
      className={props.className}
      style={{ ...defaultStyle, ...props.style }}
    />
  );
});
