import { EditorView } from '@codemirror/view';
import * as _codemirror_state from '@codemirror/state';
import { Extension } from '@codemirror/state';
import React$1 from 'react';
import * as react_jsx_runtime from 'react/jsx-runtime';
import { HighlightStyle, StreamLanguage } from '@codemirror/language';

declare global {
    interface Window {
        Go: new () => GoInstance;
        _gnataEval: (...args: string[]) => string | Error;
        _gnataCompile: (expr: string) => string | Error;
        _gnataEvalHandle: (...args: string[]) => string | Error;
        _gnataReleaseHandle: (handle: string) => string | Error;
        _gnataDiagnostics: (doc: string) => string | Error;
        _gnataCompletions: (doc: string, pos: number, schema: string) => string | Error;
        _gnataHover: (doc: string, pos: number, schema: string) => string | null;
    }
}
interface GoInstance {
    importObject: WebAssembly.Imports;
    run(instance: WebAssembly.Instance): Promise<void>;
}
interface UseJsonataWasmOptions {
    /** URL to gnata.wasm (evaluation engine, standard Go). Optional — omit for editor-only mode. */
    evalWasmUrl?: string;
    /** URL to wasm_exec.js (standard Go WASM runtime). Required if evalWasmUrl is given. */
    evalExecUrl?: string;
    /** URL to gnata-lsp.wasm (LSP engine, TinyGo, 61KB gzipped). Provides autocomplete, hover, diagnostics. Defaults to '/gnata-lsp.wasm'. */
    lspWasmUrl?: string;
    /** URL to lsp-wasm_exec.js (TinyGo WASM runtime). Required if lspWasmUrl is given. Defaults to '/lsp-wasm_exec.js'. */
    lspExecUrl?: string;
}
/**
 * Shorthand options for editor-only mode — just the LSP, no eval engine.
 * The most common use case: embed an expression editor, run evaluation on the backend.
 */
interface UseJsonataLspOptions {
    /** URL to gnata-lsp.wasm. Defaults to '/gnata-lsp.wasm'. */
    lspWasmUrl?: string;
    /** URL to lsp-wasm_exec.js. Defaults to '/lsp-wasm_exec.js'. */
    lspExecUrl?: string;
}
interface WasmState {
    /** True when the eval WASM module is loaded and ready */
    isReady: boolean;
    /** True when the LSP WASM module is loaded and ready */
    isLspReady: boolean;
    /** Error that occurred during WASM loading, if any */
    error: Error | null;
    /** Evaluate a JSONata expression against JSON data. Returns raw JSON string. */
    gnataEval: ((expr: string, data: string) => string) | null;
    /** Compile (validate) a JSONata expression. Returns handle or error. */
    gnataCompile: ((expr: string) => string) | null;
    /** Get diagnostics for a JSONata expression from LSP. Returns JSON array of diagnostics. */
    gnataDiagnostics: ((doc: string) => string) | null;
    /** Get completions at cursor position from LSP. Returns JSON array. */
    gnataCompletions: ((doc: string, pos: number, schema: string) => string) | null;
    /** Get hover info at cursor position from LSP. Returns JSON or null. */
    gnataHover: ((doc: string, pos: number, schema: string) => string | null) | null;
}
/**
 * Hook to load and manage gnata WASM modules (eval + LSP).
 *
 * The eval module (gnata.wasm) provides expression evaluation.
 * The LSP module (gnata-lsp.wasm) provides diagnostics, completions, and hover info.
 *
 * Both are optional and loaded independently. The eval module is loaded first;
 * the LSP module is loaded in the background.
 */
declare const LSP_WASM_DEFAULT_URL = "/gnata-lsp.wasm";
declare const LSP_EXEC_DEFAULT_URL = "/lsp-wasm_exec.js";
declare function useJsonataWasm(options?: UseJsonataWasmOptions): WasmState;

/**
 * Lightweight hook for editor-only mode — loads just the LSP WASM (61KB gzipped).
 *
 * The most common use case: embed a JSONata expression editor with autocomplete,
 * hover docs, and diagnostics. Evaluation runs on the backend, not in the browser.
 *
 * Works with zero configuration after setup:
 * ```bash
 * npx @gnata-sqlite/react setup ./public
 * ```
 *
 * ```tsx
 * const lsp = useJsonataLsp();
 *
 * <JsonataEditor
 *   value={expression}
 *   onChange={setExpression}
 *   gnataDiagnostics={lsp.gnataDiagnostics}
 *   gnataCompletions={lsp.gnataCompletions}
 *   gnataHover={lsp.gnataHover}
 * />
 * ```
 *
 * No gnata.wasm (5.3MB) download needed. No eval in the browser.
 */
declare function useJsonataLsp(options?: UseJsonataLspOptions): WasmState;

interface JsonataEvalResult {
    /** The evaluated result as a formatted string */
    result: string;
    /** Error message if evaluation failed */
    error: string | null;
    /** Whether the last evaluation was successful */
    isSuccess: boolean;
    /** Formatted timing string (e.g. "150 us", "2.34 ms") */
    timing: string;
    /** Raw timing in milliseconds */
    timingMs: number;
    /** Trigger a manual evaluation */
    evaluate: () => void;
}
/**
 * Hook to evaluate JSONata expressions against JSON data.
 *
 * Uses the gnata.wasm eval module (NOT the LSP). Automatically debounces
 * evaluation when expression or data changes.
 *
 * @param expression - The JSONata expression to evaluate
 * @param inputJson - The JSON data string to evaluate against
 * @param gnataEval - The eval function from useJsonataWasm
 * @param debounceMs - Debounce delay in milliseconds (default: 300)
 */
declare function useJsonataEval(expression: string, inputJson: string, gnataEval: ((expr: string, data: string) => string) | null, debounceMs?: number): JsonataEvalResult;

/** Describes the type of a field in the schema */
interface SchemaField {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null';
    fields?: Record<string, SchemaField>;
}
/** Top-level schema shape */
interface Schema {
    fields?: Record<string, SchemaField>;
}
/**
 * Build a schema description from a JSON value.
 * Used by the LSP for context-aware completions.
 */
declare function buildSchema(obj: unknown): Schema;
/**
 * Recursively collect all keys from a JSON value (up to a depth limit).
 * Returns a Map of key name to a sample value (for type inference).
 */
declare function collectKeys(obj: unknown, keys: Map<string, unknown>, depth: number): void;
/**
 * Get all field keys from a JSON string for autocomplete.
 * Returns completion items filtered by an optional partial prefix.
 */
declare function allKeysFromJson(inputJson: string, partial: string): Array<{
    label: string;
    type: string;
    detail: string;
    boost: number;
}> | null;
/**
 * Format a markdown-like hover string to safe HTML.
 */
declare function formatHoverMarkdown(md: string): string;
/**
 * Format timing in human-readable form.
 */
declare function formatTiming(ms: number): string;

/**
 * Hook to build a schema from sample JSON data.
 *
 * The schema is used by the LSP for context-aware autocomplete completions.
 * It's memoized based on the input JSON string.
 *
 * @param inputJson - Raw JSON string to derive schema from
 * @returns Schema object, or empty schema if parsing fails
 */
declare function useJsonataSchema(inputJson: string): Schema;

/** Tokyo Night dark palette */
declare const darkColors: {
    readonly bg: "#1a1b26";
    readonly surface: "#1f2335";
    readonly surfaceHover: "rgba(255,255,255,0.04)";
    readonly text: "#a9b1d6";
    readonly textStrong: "#c0caf5";
    readonly accent: "#7aa2f7";
    readonly accentDim: "rgba(122,162,247,0.12)";
    readonly accentHover: "#89b4fa";
    readonly accentText: "#1a1b26";
    readonly green: "#9ece6a";
    readonly greenDim: "rgba(158,206,106,0.12)";
    readonly vista: "#bb9af7";
    readonly orange: "#ff9e64";
    readonly teal: "#73daca";
    readonly error: "#f7768e";
    readonly muted: "#565f89";
    readonly border: "#292e42";
    readonly borderLight: "#3b4261";
    readonly select: "#283457";
};
/** Tokyo Night light palette */
declare const lightColors: {
    readonly bg: "#d5d6db";
    readonly surface: "#e1e2e7";
    readonly surfaceHover: "rgba(0,0,0,0.04)";
    readonly text: "#3760bf";
    readonly textStrong: "#343b58";
    readonly accent: "#2e7de9";
    readonly accentDim: "rgba(46,125,233,0.10)";
    readonly accentHover: "#1d4ed0";
    readonly accentText: "#ffffff";
    readonly green: "#587539";
    readonly greenDim: "rgba(88,117,57,0.12)";
    readonly vista: "#7847bd";
    readonly orange: "#b15c00";
    readonly teal: "#118c74";
    readonly error: "#c64343";
    readonly muted: "#848cb5";
    readonly border: "#c4c8da";
    readonly borderLight: "#b6bfe2";
    readonly select: "#b6bfe2";
};
type ColorPalette = typeof darkColors;
/** CodeMirror token colors for syntax highlighting */
interface CMTokenColors {
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
declare const darkTokenColors: CMTokenColors;
declare const lightTokenColors: CMTokenColors;

interface UseJsonataEditorOptions {
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
interface UseJsonataEditorReturn {
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
declare function useJsonataEditor(options: UseJsonataEditorOptions): UseJsonataEditorReturn;

interface JsonataEditorProps {
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
    style?: React$1.CSSProperties;
}
/**
 * JSONata expression editor component.
 *
 * Wraps CodeMirror 6 with the JSONata StreamLanguage tokenizer.
 * Supports autocomplete, hover tooltips, and diagnostics when
 * WASM functions are provided.
 *
 * Works without WASM for syntax-only highlighting.
 */
declare const JsonataEditor: React$1.NamedExoticComponent<JsonataEditorProps>;

interface JsonataInputProps {
    /** Current JSON value */
    value?: string;
    /** Called when content changes */
    onChange?: (value: string) => void;
    /** Color theme */
    theme?: 'dark' | 'light';
    /** Optional theme color overrides */
    themeOverrides?: Partial<CMTokenColors>;
    /** CSS class name for the container */
    className?: string;
    /** Inline style for the container */
    style?: React$1.CSSProperties;
}
/**
 * JSON input editor component.
 *
 * A CodeMirror 6 editor configured with the JSON language mode
 * and the Tokyo Night theme. Use this for editing the input
 * data that JSONata expressions are evaluated against.
 */
declare const JsonataInput: React$1.NamedExoticComponent<JsonataInputProps>;

interface JsonataResultProps {
    /** Result text to display */
    value?: string;
    /** Error message (displayed in red) */
    error?: string | null;
    /** Formatted timing string */
    timing?: string;
    /** Color theme */
    theme?: 'dark' | 'light';
    /** Optional theme color overrides */
    themeOverrides?: Partial<CMTokenColors>;
    /** CSS class name for the container */
    className?: string;
    /** Inline style for the container */
    style?: React$1.CSSProperties;
    /** Whether to show the timing badge (default: true) */
    showTiming?: boolean;
}
/**
 * Read-only result display component.
 *
 * Shows the evaluation result in green (success) or red (error)
 * using a read-only CodeMirror instance with JSON syntax highlighting.
 */
declare const JsonataResult: React$1.NamedExoticComponent<JsonataResultProps>;

interface JsonataPlaygroundProps {
    /** Initial JSONata expression */
    defaultExpression?: string;
    /** Initial JSON input data */
    defaultInput?: string;
    /** Color theme */
    theme?: 'dark' | 'light';
    /** Optional theme color overrides */
    themeOverrides?: Partial<CMTokenColors>;
    /** Total height of the widget in pixels */
    height?: number;
    /** URLs for WASM modules. If omitted, only syntax highlighting is available. */
    wasmOptions?: UseJsonataWasmOptions;
    /** CSS class name for the outer container */
    className?: string;
    /** Inline style overrides for the outer container */
    style?: React$1.CSSProperties;
}
/**
 * Full JSONata playground widget.
 *
 * Composes JsonataEditor, JsonataInput, and JsonataResult into a
 * three-panel layout: expression editor (top), input JSON (bottom-left),
 * and result (bottom-right).
 *
 * Optionally loads WASM modules for evaluation, diagnostics, autocomplete,
 * and hover tooltips. Without WASM, the editor provides syntax highlighting only.
 */
declare function JsonataPlayground(props: JsonataPlaygroundProps): react_jsx_runtime.JSX.Element;

/**
 * Create a CodeMirror editor theme from token colors.
 */
declare function createEditorTheme(colors: CMTokenColors, dark: boolean): Extension;
/**
 * Create a CodeMirror highlight style from token colors.
 */
declare function createHighlightStyle(colors: CMTokenColors): HighlightStyle;
/**
 * Build full Tokyo Night theme extensions for CodeMirror.
 * Accepts optional color overrides.
 */
declare function tokyoNightTheme(mode: 'dark' | 'light', overrides?: Partial<CMTokenColors>): Extension[];

/**
 * CodeMirror theme extension for hover tooltips, autocomplete dropdowns,
 * and lint diagnostics — styled with the Tokyo Night palette.
 *
 * CodeMirror tooltips render as portals outside the editor DOM, so they
 * don't inherit the editor's theme. This extension targets those elements
 * via EditorView.theme.
 */
declare function tooltipTheme(mode?: 'dark' | 'light'): _codemirror_state.Extension;

/**
 * Stream-based JSONata tokenizer for CodeMirror 6.
 * Provides syntax highlighting for JSONata expressions.
 */
declare const jsonataStreamLanguage: StreamLanguage<unknown>;

export { type CMTokenColors, type ColorPalette, JsonataEditor, type JsonataEditorProps, type JsonataEvalResult, JsonataInput, type JsonataInputProps, JsonataPlayground, type JsonataPlaygroundProps, JsonataResult, type JsonataResultProps, LSP_EXEC_DEFAULT_URL, LSP_WASM_DEFAULT_URL, type Schema, type SchemaField, type UseJsonataEditorOptions, type UseJsonataEditorReturn, type UseJsonataLspOptions, type UseJsonataWasmOptions, type WasmState, allKeysFromJson, buildSchema, collectKeys, createEditorTheme, createHighlightStyle, darkColors, darkTokenColors, formatHoverMarkdown, formatTiming, jsonataStreamLanguage, lightColors, lightTokenColors, tokyoNightTheme, tooltipTheme, useJsonataEditor, useJsonataEval, useJsonataLsp, useJsonataSchema, useJsonataWasm };
