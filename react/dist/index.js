// src/hooks/use-jsonata-wasm.ts
import { useState, useEffect } from "react";
function wrapWasmCall(fn, ...args) {
  const result = fn(...args);
  if (result instanceof Error) throw result;
  return result;
}
function loadScript(url) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = url;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
    document.head.appendChild(script);
  });
}
function useJsonataWasm(options) {
  const [state, setState] = useState({
    isReady: false,
    isLspReady: false,
    error: null,
    gnataEval: null,
    gnataCompile: null,
    gnataDiagnostics: null,
    gnataCompletions: null,
    gnataHover: null
  });
  useEffect(() => {
    let cancelled = false;
    async function waitForGlobal(name, timeoutMs = 1e4) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (typeof window[name] === "function") return true;
        await new Promise((r) => setTimeout(r, 50));
        if (cancelled) return false;
      }
      return false;
    }
    function makeEvalFns() {
      const gnataEval = (expr, data) => wrapWasmCall(window._gnataEval, expr, data);
      const gnataCompile = (expr) => wrapWasmCall(window._gnataCompile, expr);
      return { gnataEval, gnataCompile };
    }
    async function loadEval() {
      if (!options.evalWasmUrl || !options.evalExecUrl) return;
      try {
        if (typeof window._gnataEval === "function") {
          if (cancelled) return;
          setState((prev) => ({ ...prev, isReady: true, ...makeEvalFns() }));
          return;
        }
        if (document.querySelector(`script[src="${options.evalExecUrl}"]`)) {
          const ready = await waitForGlobal("_gnataEval");
          if (cancelled) return;
          if (ready) {
            setState((prev) => ({ ...prev, isReady: true, ...makeEvalFns() }));
            return;
          }
        }
        await loadScript(options.evalExecUrl);
        const GoConstructor = window.Go;
        if (!GoConstructor) {
          throw new Error("Go WASM runtime not available after loading wasm_exec.js");
        }
        const go = new GoConstructor();
        const resp = await fetch(options.evalWasmUrl);
        const result = await WebAssembly.instantiateStreaming(resp, go.importObject);
        go.run(result.instance).catch((err) => {
          console.error("gnata WASM runtime exited:", err);
        });
        if (cancelled) return;
        setState((prev) => ({ ...prev, isReady: true, ...makeEvalFns() }));
      } catch (err) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err : new Error(String(err))
        }));
      }
    }
    async function loadLsp() {
      if (!options.lspWasmUrl || !options.lspExecUrl) return;
      try {
        if (typeof window._gnataDiagnostics === "function") {
          if (cancelled) return;
          const gnataDiagnostics2 = (doc) => {
            const r = window._gnataDiagnostics(doc);
            if (r instanceof Error) throw r;
            return r;
          };
          const gnataCompletions2 = (doc, pos, schema) => {
            const r = window._gnataCompletions(doc, pos, schema);
            if (r instanceof Error) throw r;
            return r;
          };
          const gnataHover2 = (doc, pos, schema) => window._gnataHover(doc, pos, schema);
          setState((prev) => ({ ...prev, isLspReady: true, gnataDiagnostics: gnataDiagnostics2, gnataCompletions: gnataCompletions2, gnataHover: gnataHover2 }));
          return;
        }
        if (document.querySelector(`script[src="${options.lspExecUrl}"]`)) {
          const ready = await waitForGlobal("_gnataDiagnostics");
          if (cancelled) return;
          if (ready) {
            const gnataDiagnostics2 = (doc) => {
              const r = window._gnataDiagnostics(doc);
              if (r instanceof Error) throw r;
              return r;
            };
            const gnataCompletions2 = (doc, pos, schema) => {
              const r = window._gnataCompletions(doc, pos, schema);
              if (r instanceof Error) throw r;
              return r;
            };
            const gnataHover2 = (doc, pos, schema) => window._gnataHover(doc, pos, schema);
            setState((prev) => ({ ...prev, isLspReady: true, gnataDiagnostics: gnataDiagnostics2, gnataCompletions: gnataCompletions2, gnataHover: gnataHover2 }));
            return;
          }
        }
        const StdGo = window.Go;
        await loadScript(options.lspExecUrl);
        const TinyGo = window.Go;
        window.Go = StdGo;
        const lspGo = new TinyGo();
        const lspResp = await fetch(options.lspWasmUrl);
        const lspResult = await WebAssembly.instantiateStreaming(lspResp, lspGo.importObject);
        lspGo.run(lspResult.instance);
        if (cancelled) return;
        const gnataDiagnostics = (doc) => {
          const r = window._gnataDiagnostics(doc);
          if (r instanceof Error) throw r;
          return r;
        };
        const gnataCompletions = (doc, pos, schema) => {
          const r = window._gnataCompletions(doc, pos, schema);
          if (r instanceof Error) throw r;
          return r;
        };
        const gnataHover = (doc, pos, schema) => window._gnataHover(doc, pos, schema);
        setState((prev) => ({
          ...prev,
          isLspReady: true,
          gnataDiagnostics,
          gnataCompletions,
          gnataHover
        }));
      } catch (err) {
        console.warn("LSP WASM not available:", err instanceof Error ? err.message : err);
      }
    }
    loadEval().then(() => loadLsp());
    return () => {
      cancelled = true;
    };
  }, [options.evalWasmUrl, options.evalExecUrl, options.lspWasmUrl, options.lspExecUrl]);
  return state;
}

// src/hooks/use-jsonata-lsp.ts
function useJsonataLsp(options) {
  return useJsonataWasm({
    lspWasmUrl: options.lspWasmUrl,
    lspExecUrl: options.lspExecUrl
  });
}

// src/hooks/use-jsonata-eval.ts
import { useState as useState2, useRef, useCallback, useEffect as useEffect2 } from "react";

// src/utils/schema.ts
function buildSchema(obj) {
  if (obj === null || typeof obj !== "object") return {};
  if (Array.isArray(obj)) {
    if (obj.length > 0 && typeof obj[0] === "object") return buildSchema(obj[0]);
    return {};
  }
  const fields = {};
  for (const [key, val] of Object.entries(obj)) {
    const child = {
      type: typeof val === "number" ? "number" : typeof val === "string" ? "string" : typeof val === "boolean" ? "boolean" : Array.isArray(val) ? "array" : val === null ? "null" : "object"
    };
    if (typeof val === "object" && val !== null) {
      const nested = buildSchema(val);
      if (nested.fields) child.fields = nested.fields;
    }
    fields[key] = child;
  }
  return { fields };
}
function collectKeys(obj, keys, depth) {
  if (depth <= 0 || !obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const item of obj.slice(0, 5)) collectKeys(item, keys, depth);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (!keys.has(k)) keys.set(k, v);
    if (v && typeof v === "object") collectKeys(v, keys, depth - 1);
  }
}
function allKeysFromJson(inputJson, partial) {
  try {
    const data = JSON.parse(inputJson);
    const keys = /* @__PURE__ */ new Map();
    collectKeys(data, keys, 3);
    const items = [];
    for (const [k, v] of keys) {
      if (partial && !k.toLowerCase().startsWith(partial.toLowerCase())) continue;
      items.push({
        label: k,
        type: typeof v === "number" ? "number" : typeof v === "string" ? "string" : Array.isArray(v) ? "enum" : "property",
        detail: typeof v,
        boost: 2
      });
    }
    return items;
  } catch {
    return null;
  }
}
function formatHoverMarkdown(md) {
  return md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/```\n([\s\S]*?)```/g, "<pre>$1</pre>").replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\n\n/g, "<br><br>").replace(/\n/g, "<br>");
}
function formatTiming(ms) {
  if (ms < 1) return (ms * 1e3).toFixed(0) + " \xB5s";
  if (ms < 1e3) return ms.toFixed(2) + " ms";
  return (ms / 1e3).toFixed(2) + " s";
}

// src/hooks/use-jsonata-eval.ts
function useJsonataEval(expression, inputJson, gnataEval, debounceMs = 300) {
  const [result, setResult] = useState2("");
  const [error, setError] = useState2(null);
  const [isSuccess, setIsSuccess] = useState2(false);
  const [timing, setTiming] = useState2("");
  const [timingMs, setTimingMs] = useState2(0);
  const debounceRef = useRef(null);
  const doEvaluate = useCallback(() => {
    if (!gnataEval) return;
    const expr = expression.trim();
    if (!expr) {
      setResult("");
      setError(null);
      setIsSuccess(false);
      setTiming("");
      setTimingMs(0);
      return;
    }
    try {
      const t0 = performance.now();
      const raw = gnataEval(expr, inputJson || "null");
      const elapsed = performance.now() - t0;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = raw;
      }
      const text = typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);
      setResult(text);
      setError(null);
      setIsSuccess(true);
      setTimingMs(elapsed);
      setTiming(formatTiming(elapsed));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult("");
      setError(msg);
      setIsSuccess(false);
      setTiming("");
      setTimingMs(0);
    }
  }, [expression, inputJson, gnataEval]);
  useEffect2(() => {
    if (!gnataEval) return;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(doEvaluate, debounceMs);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [doEvaluate, debounceMs, gnataEval]);
  const evaluate = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    doEvaluate();
  }, [doEvaluate]);
  return { result, error, isSuccess, timing, timingMs, evaluate };
}

// src/hooks/use-jsonata-schema.ts
import { useMemo } from "react";
function useJsonataSchema(inputJson) {
  return useMemo(() => {
    try {
      const data = JSON.parse(inputJson);
      return buildSchema(data);
    } catch {
      return {};
    }
  }, [inputJson]);
}

// src/hooks/use-jsonata-editor.ts
import { useRef as useRef2, useEffect as useEffect3, useCallback as useCallback2 } from "react";
import { EditorView as EditorView3, keymap, placeholder as placeholderExt, hoverTooltip } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { autocompletion } from "@codemirror/autocomplete";
import { linter } from "@codemirror/lint";

// src/utils/tokenizer.ts
import { StreamLanguage } from "@codemirror/language";
var KEYWORDS = /* @__PURE__ */ new Set(["and", "or", "in", "true", "false", "null", "function"]);
var OPERATORS = /* @__PURE__ */ new Set(["+", "-", "*", "/", "%", "&", "|", "=", "<", ">", "!", "~", "^", "?", ":", ".", ",", ";", "@", "#"]);
var BRACKETS = /* @__PURE__ */ new Set(["(", ")", "{", "}", "[", "]"]);
var jsonataStreamLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match("/*")) {
      while (!stream.match("*/") && !stream.eol()) stream.next();
      return "blockComment";
    }
    const ch = stream.peek();
    if (!ch) return null;
    if (ch === '"' || ch === "'") {
      const quote = stream.next();
      while (!stream.eol()) {
        const c = stream.next();
        if (c === quote) return "string";
        if (c === "\\") stream.next();
      }
      return "string";
    }
    if (/[0-9]/.test(ch)) {
      stream.match(/^[0-9]*\.?[0-9]*([eE][+-]?[0-9]+)?/);
      return "number";
    }
    if (ch === "$") {
      stream.next();
      stream.match(/^[a-zA-Z_$][a-zA-Z0-9_]*/);
      if (stream.peek() === "(") return "typeName";
      return "atom";
    }
    if (BRACKETS.has(ch)) {
      stream.next();
      return "paren";
    }
    if (stream.match("~>") || stream.match(":=") || stream.match("!=") || stream.match(">=") || stream.match("<=") || stream.match("**") || stream.match("..") || stream.match("?:") || stream.match("??")) {
      return "operator";
    }
    if (OPERATORS.has(ch)) {
      stream.next();
      return "operator";
    }
    if (/[a-zA-Z_`]/.test(ch)) {
      if (ch === "`") {
        stream.next();
        while (!stream.eol() && stream.peek() !== "`") stream.next();
        if (stream.peek() === "`") stream.next();
        return "variableName";
      }
      stream.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
      const word = stream.current();
      if (KEYWORDS.has(word)) {
        if (word === "true" || word === "false") return "bool";
        if (word === "null") return "null";
        return "keyword";
      }
      return "variableName";
    }
    stream.next();
    return null;
  }
});

// src/theme/tokyo-night.ts
import { EditorView as EditorView2 } from "@codemirror/view";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// src/theme/colors.ts
var darkColors = {
  bg: "#1a1b26",
  surface: "#1f2335",
  surfaceHover: "rgba(255,255,255,0.04)",
  text: "#a9b1d6",
  textStrong: "#c0caf5",
  accent: "#7aa2f7",
  accentDim: "rgba(122,162,247,0.12)",
  accentHover: "#89b4fa",
  accentText: "#1a1b26",
  green: "#9ece6a",
  greenDim: "rgba(158,206,106,0.12)",
  vista: "#bb9af7",
  orange: "#ff9e64",
  teal: "#73daca",
  error: "#f7768e",
  muted: "#565f89",
  border: "#292e42",
  borderLight: "#3b4261",
  select: "#283457"
};
var lightColors = {
  bg: "#d5d6db",
  surface: "#e1e2e7",
  surfaceHover: "rgba(0,0,0,0.04)",
  text: "#3760bf",
  textStrong: "#343b58",
  accent: "#2e7de9",
  accentDim: "rgba(46,125,233,0.10)",
  accentHover: "#1d4ed0",
  accentText: "#ffffff",
  green: "#587539",
  greenDim: "rgba(88,117,57,0.12)",
  vista: "#7847bd",
  orange: "#b15c00",
  teal: "#118c74",
  error: "#c64343",
  muted: "#848cb5",
  border: "#c4c8da",
  borderLight: "#b6bfe2",
  select: "#b6bfe2"
};
var darkTokenColors = {
  bg: "#1a1b26",
  fg: "#c0caf5",
  comment: "#565f89",
  string: "#9ece6a",
  number: "#ff9e64",
  keyword: "#bb9af7",
  func: "#7aa2f7",
  variable: "#B5E600",
  operator: "#89ddff",
  error: "#f7768e",
  select: "#283457",
  cursor: "#c0caf5",
  property: "#73daca",
  bracket: "#698098"
};
var lightTokenColors = {
  bg: "#e1e2e7",
  fg: "#3760bf",
  comment: "#848cb5",
  string: "#587539",
  number: "#b15c00",
  keyword: "#7847bd",
  func: "#2e7de9",
  variable: "#2563eb",
  operator: "#d20065",
  error: "#f52a65",
  select: "#b6bfe2",
  cursor: "#3760bf",
  property: "#118c74",
  bracket: "#848cb5"
};

// src/theme/tooltips.ts
import { EditorView } from "@codemirror/view";
function tooltipTheme(mode = "dark") {
  const c = mode === "dark" ? darkColors : lightColors;
  const mono = "'SF Mono', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', monospace";
  return EditorView.theme({
    // Hover tooltip container
    ".cm-tooltip-hover": {
      background: `${c.surface} !important`,
      border: `1px solid ${c.borderLight} !important`,
      borderRadius: "6px",
      maxWidth: "480px"
    },
    // Hover tooltip content (class set by formatHoverMarkdown in the hover handler)
    ".cm-hover-tooltip": {
      padding: "10px 14px",
      fontSize: "13px",
      color: c.text,
      lineHeight: "1.5"
    },
    ".cm-hover-tooltip strong": {
      color: c.accent,
      fontWeight: "700"
    },
    ".cm-hover-tooltip code": {
      fontFamily: mono,
      fontSize: "12px",
      background: c.bg,
      padding: "1px 5px",
      borderRadius: "3px",
      color: c.green
    },
    ".cm-hover-tooltip pre": {
      fontFamily: mono,
      fontSize: "12px",
      background: c.bg,
      padding: "8px 10px",
      borderRadius: "4px",
      margin: "6px 0",
      color: c.text,
      overflowX: "auto"
    },
    ".cm-hover-tooltip pre code": {
      background: "none",
      padding: "0"
    },
    // Autocomplete dropdown
    ".cm-tooltip-autocomplete": {
      background: `${c.surface} !important`,
      border: `1px solid ${c.borderLight} !important`,
      borderRadius: "6px"
    },
    ".cm-tooltip-autocomplete ul li": {
      color: c.text,
      fontFamily: mono,
      fontSize: "13px",
      padding: "4px 10px"
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      background: `${c.accentDim} !important`,
      color: `${c.accent} !important`
    },
    ".cm-tooltip-autocomplete .cm-completionLabel": {
      color: "inherit"
    },
    ".cm-tooltip-autocomplete .cm-completionDetail": {
      color: c.muted,
      fontStyle: "normal",
      marginLeft: "8px"
    },
    ".cm-completionIcon": {
      display: "none"
    },
    // Lint diagnostics tooltip
    ".cm-tooltip-lint": {
      background: c.surface,
      border: `1px solid ${c.borderLight}`,
      borderRadius: "6px",
      color: c.text,
      fontFamily: mono,
      fontSize: "12px"
    },
    // Squiggly error underlines
    ".cm-lintRange-error": {
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='m0 3 l2 -2 l1 0 l2 2 l1 0' fill='none' stroke='${encodeURIComponent(c.error)}' stroke-width='.7'/%3E%3C/svg%3E")`,
      backgroundRepeat: "repeat-x",
      backgroundPosition: "bottom",
      backgroundSize: "6px 3px",
      paddingBottom: "1px"
    },
    ".cm-diagnostic-error": {
      borderBottom: "none"
    },
    ".cm-lint-marker": {
      display: "none"
    }
  }, { dark: mode === "dark" });
}

// src/theme/tokyo-night.ts
function createEditorTheme(colors, dark) {
  return EditorView2.theme(
    {
      "&": { backgroundColor: colors.bg, color: colors.fg },
      ".cm-content": { caretColor: colors.cursor },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: colors.cursor },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
        background: colors.select + " !important"
      },
      ".cm-activeLine": {
        backgroundColor: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)"
      },
      ".cm-gutters": {
        backgroundColor: colors.bg,
        color: colors.comment,
        border: "none"
      },
      ".cm-activeLineGutter": { backgroundColor: "transparent" }
    },
    { dark }
  );
}
function createHighlightStyle(colors) {
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
    { tag: t.separator, color: colors.comment }
  ]);
}
function tokyoNightTheme(mode, overrides) {
  const base = mode === "dark" ? darkTokenColors : lightTokenColors;
  const colors = overrides ? { ...base, ...overrides } : base;
  return [
    createEditorTheme(colors, mode === "dark"),
    syntaxHighlighting(createHighlightStyle(colors)),
    tooltipTheme(mode)
  ];
}

// src/hooks/use-jsonata-editor.ts
function useJsonataEditor(options) {
  const viewRef = useRef2(null);
  const themeCompRef = useRef2(new Compartment());
  const lspCompRef = useRef2(new Compartment());
  const onChangeRef = useRef2(options.onChange);
  onChangeRef.current = options.onChange;
  const onRunRef = useRef2(options.onRun);
  onRunRef.current = options.onRun;
  const gnataEvalRef = useRef2(options.gnataEval);
  gnataEvalRef.current = options.gnataEval;
  const gnataDiagnosticsRef = useRef2(options.gnataDiagnostics);
  gnataDiagnosticsRef.current = options.gnataDiagnostics;
  const gnataCompletionsRef = useRef2(options.gnataCompletions);
  gnataCompletionsRef.current = options.gnataCompletions;
  const gnataHoverRef = useRef2(options.gnataHover);
  gnataHoverRef.current = options.gnataHover;
  const getInputJsonRef = useRef2(options.getInputJson);
  getInputJsonRef.current = options.getInputJson;
  const schemaRef = useRef2(options.schema);
  schemaRef.current = options.schema;
  const getValue = useCallback2(() => {
    return viewRef.current?.state.doc.toString() ?? "";
  }, []);
  const setValue = useCallback2((text) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text }
    });
  }, []);
  const setTheme = useCallback2((mode, overrides) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompRef.current.reconfigure(tokyoNightTheme(mode, overrides))
    });
  }, []);
  useEffect3(() => {
    const container = options.containerRef.current;
    if (!container || viewRef.current) return;
    function jsonataComplete(context) {
      const doc = context.state.doc.toString();
      const pos = context.pos;
      const getInputJson = getInputJsonRef.current;
      const inputJson = getInputJson ? getInputJson().trim() : "null";
      const gnataEval = gnataEvalRef.current;
      const gnataCompletions = gnataCompletionsRef.current;
      const schema = schemaRef.current;
      let from = pos;
      while (from > 0) {
        const ch = doc.charCodeAt(from - 1);
        if (ch >= 65 && ch <= 90 || ch >= 97 && ch <= 122 || ch >= 48 && ch <= 57 || ch === 95 || ch === 36) from--;
        else break;
      }
      const partial = doc.substring(from, pos);
      const beforeFrom = doc.substring(0, from);
      const isDot = beforeFrom.length > 0 && beforeFrom[beforeFrom.length - 1] === ".";
      if (isDot && gnataEval) {
        const prefixExpr = beforeFrom.substring(0, beforeFrom.length - 1).trim();
        let items = null;
        if (prefixExpr) items = tryEvalKeys(prefixExpr, inputJson, partial, gnataEval);
        if (!items || items.length === 0) items = allKeysFromJson(inputJson, partial);
        if (items && items.length > 0) return { from, options: items.slice(0, 10) };
      }
      if (gnataCompletions) {
        let schemaStr = "";
        try {
          schemaStr = JSON.stringify(schema || {});
        } catch {
        }
        try {
          const result = gnataCompletions(doc, pos, schemaStr);
          const items = JSON.parse(result);
          if (items.length > 0) return { from, options: items.slice(0, 10) };
        } catch {
        }
      }
      if (isDot) {
        const items = allKeysFromJson(inputJson, partial);
        if (items && items.length > 0) return { from, options: items.slice(0, 10) };
      }
      return null;
    }
    const jsonataLinter = linter(
      (view2) => {
        const diagnosticsFn = gnataDiagnosticsRef.current;
        if (!diagnosticsFn) return [];
        const doc = view2.state.doc.toString();
        if (!doc.trim()) return [];
        try {
          const result = diagnosticsFn(doc);
          const diags = JSON.parse(result);
          return diags.map((d) => ({
            from: Math.max(0, d.from),
            to: Math.min(doc.length, Math.max(d.from + 1, d.to)),
            severity: "error",
            message: d.message
          }));
        } catch {
          return [];
        }
      },
      { delay: 200 }
    );
    const hoverProvider = hoverTooltip((view2, pos) => {
      const hoverFn = gnataHoverRef.current;
      if (!hoverFn) return null;
      const doc = view2.state.doc.toString();
      const schema = schemaRef.current;
      let schemaStr = "";
      try {
        schemaStr = JSON.stringify(schema || {});
      } catch {
      }
      const result = hoverFn(doc, pos, schemaStr);
      if (!result) return null;
      try {
        const info = JSON.parse(result);
        return {
          pos: info.from,
          end: info.to,
          above: true,
          create() {
            const dom = document.createElement("div");
            dom.className = "cm-hover-tooltip";
            dom.innerHTML = formatHoverMarkdown(info.text);
            return { dom };
          }
        };
      } catch {
        return null;
      }
    });
    const extensions = [
      keymap.of([...defaultKeymap, ...historyKeymap]),
      history(),
      jsonataStreamLanguage,
      themeCompRef.current.of(
        options.themeExtensions ?? tokyoNightTheme(options.theme ?? "dark", options.themeOverrides)
      ),
      autocompletion({
        override: [jsonataComplete],
        activateOnTyping: true,
        icons: false
      }),
      jsonataLinter,
      hoverProvider,
      EditorView3.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current?.(update.state.doc.toString());
        }
      }),
      EditorView3.domEventHandlers({
        keydown(e) {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onRunRef.current?.();
            return true;
          }
          return false;
        }
      })
    ];
    if (options.placeholder) {
      extensions.push(placeholderExt(options.placeholder));
    }
    const view = new EditorView3({
      state: EditorState.create({
        doc: options.initialDoc ?? "",
        extensions
      }),
      parent: container
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);
  useEffect3(() => {
    const view = viewRef.current;
    if (!view) return;
    const exts = options.themeExtensions ?? tokyoNightTheme(options.theme ?? "dark", options.themeOverrides);
    view.dispatch({ effects: themeCompRef.current.reconfigure(exts) });
  }, [options.theme, options.themeOverrides, options.themeExtensions]);
  return {
    view: viewRef.current,
    getValue,
    setValue,
    setTheme
  };
}
function tryEvalKeys(expr, inputJson, partial, gnataEval) {
  try {
    const raw = gnataEval(expr, inputJson);
    let val = JSON.parse(raw);
    if (Array.isArray(val)) val = val.find((v) => v && typeof v === "object") || null;
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.keys(val).filter((k) => !partial || k.toLowerCase().startsWith(partial.toLowerCase())).map((k) => {
        const v = val[k];
        return {
          label: k,
          type: typeof v === "number" ? "number" : typeof v === "string" ? "string" : Array.isArray(v) ? "enum" : "property",
          detail: typeof v === "object" ? Array.isArray(v) ? "array" : "object" : typeof v,
          boost: 3
        };
      });
    }
  } catch {
  }
  return null;
}

// src/components/JsonataEditor.tsx
import React, { useRef as useRef3, useCallback as useCallback3, useEffect as useEffect4 } from "react";
import { jsx } from "react/jsx-runtime";
var defaultStyle = {
  overflow: "hidden",
  fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', monospace",
  fontSize: "14px"
};
var JsonataEditor = React.memo(function JsonataEditor2(props) {
  const containerRef = useRef3(null);
  const getInputJsonRef = useRef3(props.getInputJson);
  getInputJsonRef.current = props.getInputJson;
  const stableGetInputJson = useCallback3(() => {
    return getInputJsonRef.current ? getInputJsonRef.current() : "null";
  }, []);
  const editorOptions = {
    containerRef,
    initialDoc: props.value ?? "",
    placeholder: props.placeholder ?? "e.g. Account.Order.Product.(Price * Quantity)",
    onChange: props.onChange,
    onRun: props.onRun,
    theme: props.theme ?? "dark",
    themeOverrides: props.themeOverrides,
    themeExtensions: props.themeExtensions,
    gnataEval: props.gnataEval,
    gnataDiagnostics: props.gnataDiagnostics,
    gnataCompletions: props.gnataCompletions,
    gnataHover: props.gnataHover,
    getInputJson: stableGetInputJson,
    schema: props.schema
  };
  const internalChangeRef = useRef3(false);
  const handleChange = useCallback3((value) => {
    internalChangeRef.current = true;
    props.onChange?.(value);
  }, [props.onChange]);
  const editorOptionsWithTrackedChange = {
    ...editorOptions,
    onChange: handleChange
  };
  const { setValue } = useJsonataEditor(editorOptionsWithTrackedChange);
  const prevValueRef = useRef3(props.value);
  useEffect4(() => {
    if (props.value !== void 0 && props.value !== prevValueRef.current) {
      prevValueRef.current = props.value;
      if (internalChangeRef.current) {
        internalChangeRef.current = false;
      } else {
        setValue(props.value);
      }
    }
  }, [props.value, setValue]);
  return /* @__PURE__ */ jsx(
    "div",
    {
      ref: containerRef,
      className: props.className,
      style: { ...defaultStyle, ...props.style }
    }
  );
});

// src/components/JsonataInput.tsx
import React2, { useRef as useRef4, useEffect as useEffect5 } from "react";
import { EditorView as EditorView4, keymap as keymap2 } from "@codemirror/view";
import { EditorState as EditorState2, Compartment as Compartment2 } from "@codemirror/state";
import { defaultKeymap as defaultKeymap2, history as history2, historyKeymap as historyKeymap2 } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { jsx as jsx2 } from "react/jsx-runtime";
var defaultStyle2 = {
  overflow: "hidden",
  fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', monospace",
  fontSize: "13px"
};
var JsonataInput = React2.memo(function JsonataInput2(props) {
  const containerRef = useRef4(null);
  const viewRef = useRef4(null);
  const themeCompRef = useRef4(new Compartment2());
  const onChangeRef = useRef4(props.onChange);
  onChangeRef.current = props.onChange;
  useEffect5(() => {
    const container = containerRef.current;
    if (!container || viewRef.current) return;
    const extensions = [
      keymap2.of([...defaultKeymap2, ...historyKeymap2]),
      history2(),
      json(),
      themeCompRef.current.of(tokyoNightTheme(props.theme ?? "dark", props.themeOverrides)),
      EditorView4.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current?.(update.state.doc.toString());
        }
      })
    ];
    const view = new EditorView4({
      state: EditorState2.create({
        doc: props.value ?? "",
        extensions
      }),
      parent: container
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);
  useEffect5(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompRef.current.reconfigure(
        tokyoNightTheme(props.theme ?? "dark", props.themeOverrides)
      )
    });
  }, [props.theme, props.themeOverrides]);
  const internalChangeRef = useRef4(false);
  const originalOnChange = onChangeRef.current;
  onChangeRef.current = (value) => {
    internalChangeRef.current = true;
    originalOnChange?.(value);
  };
  const prevValueRef = useRef4(props.value);
  useEffect5(() => {
    const view = viewRef.current;
    if (!view) return;
    if (props.value !== void 0 && props.value !== prevValueRef.current) {
      prevValueRef.current = props.value;
      if (internalChangeRef.current) {
        internalChangeRef.current = false;
      } else {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: props.value }
        });
      }
    }
  }, [props.value]);
  return /* @__PURE__ */ jsx2(
    "div",
    {
      ref: containerRef,
      className: props.className,
      style: { ...defaultStyle2, ...props.style }
    }
  );
});

// src/components/JsonataResult.tsx
import React3, { useRef as useRef5, useEffect as useEffect6 } from "react";
import { EditorView as EditorView5, keymap as keymap3 } from "@codemirror/view";
import { EditorState as EditorState3, Compartment as Compartment3 } from "@codemirror/state";
import { defaultKeymap as defaultKeymap3 } from "@codemirror/commands";
import { json as json2 } from "@codemirror/lang-json";
import { jsx as jsx3, jsxs } from "react/jsx-runtime";
var containerStyle = {
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', monospace",
  fontSize: "13px",
  position: "relative"
};
var JsonataResult = React3.memo(function JsonataResult2(props) {
  const containerRef = useRef5(null);
  const editorWrapRef = useRef5(null);
  const viewRef = useRef5(null);
  const themeCompRef = useRef5(new Compartment3());
  const isDark = (props.theme ?? "dark") === "dark";
  const colors = isDark ? darkColors : lightColors;
  const hasError = Boolean(props.error);
  const displayText = hasError ? props.error ?? "" : props.value ?? "";
  const contentColor = hasError ? colors.error : colors.green;
  useEffect6(() => {
    const container = editorWrapRef.current;
    if (!container || viewRef.current) return;
    const extensions = [
      keymap3.of(defaultKeymap3),
      json2(),
      themeCompRef.current.of(tokyoNightTheme(props.theme ?? "dark", props.themeOverrides)),
      EditorState3.readOnly.of(true),
      EditorView5.editable.of(false)
    ];
    const view = new EditorView5({
      state: EditorState3.create({
        doc: displayText,
        extensions
      }),
      parent: container
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);
  useEffect6(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompRef.current.reconfigure(
        tokyoNightTheme(props.theme ?? "dark", props.themeOverrides)
      )
    });
  }, [props.theme, props.themeOverrides]);
  useEffect6(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== displayText) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: displayText }
      });
    }
  }, [displayText]);
  const showTiming = props.showTiming !== false;
  return /* @__PURE__ */ jsxs("div", { ref: containerRef, className: props.className, style: { ...containerStyle, ...props.style }, children: [
    showTiming && props.timing && /* @__PURE__ */ jsx3(
      "div",
      {
        style: {
          position: "absolute",
          top: 6,
          right: 12,
          zIndex: 10,
          fontSize: "12px",
          fontFamily: "'SF Mono', monospace",
          color: colors.accent,
          background: colors.surface,
          padding: "2px 8px",
          borderRadius: 4,
          border: `1px solid ${colors.border}`
        },
        children: props.timing
      }
    ),
    /* @__PURE__ */ jsx3(
      "div",
      {
        ref: editorWrapRef,
        style: {
          flex: 1,
          overflow: "hidden"
          // Apply content color via CSS custom property on the wrapper
          // The CM content inherits color from .cm-editor .cm-content
        }
      }
    ),
    /* @__PURE__ */ jsx3("style", { children: `
        .gnata-result-${hasError ? "error" : "success"} .cm-editor .cm-content {
          color: ${contentColor} !important;
        }
      ` }),
    /* @__PURE__ */ jsx3("style", { children: `
        [data-gnata-result-id="${containerRef.current?.dataset?.gnataResultId ?? "x"}"] .cm-editor .cm-content {
          color: ${contentColor} !important;
        }
      ` })
  ] });
});

// src/components/JsonataPlayground.tsx
import { useState as useState3, useCallback as useCallback4, useRef as useRef6, useId } from "react";
import { jsx as jsx4, jsxs as jsxs2 } from "react/jsx-runtime";
var DEFAULT_INPUT = `{
  "Account": {
    "Name": "Firefly",
    "Order": [
      {
        "OrderID": "order103",
        "Product": [
          { "Name": "Bowler Hat", "Price": 34.45, "Quantity": 2 },
          { "Name": "Trilby hat", "Price": 21.67, "Quantity": 1 }
        ]
      },
      {
        "OrderID": "order104",
        "Product": [
          { "Name": "Cloak", "Price": 107.99, "Quantity": 1 }
        ]
      }
    ]
  }
}`;
var DEFAULT_EXPRESSION = "$sum(Account.Order.Product.(Price * Quantity))";
function JsonataPlayground(props) {
  const id = useId();
  const isDark = (props.theme ?? "dark") === "dark";
  const colors = isDark ? darkColors : lightColors;
  const height = props.height ?? 500;
  const [expression, setExpression] = useState3(props.defaultExpression ?? DEFAULT_EXPRESSION);
  const [inputJson, setInputJson] = useState3(props.defaultInput ?? DEFAULT_INPUT);
  const inputJsonRef = useRef6(inputJson);
  inputJsonRef.current = inputJson;
  const getInputJson = useCallback4(() => inputJsonRef.current, []);
  const wasm = props.wasmOptions ? (
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useJsonataWasm(props.wasmOptions)
  ) : null;
  const schema = useJsonataSchema(inputJson);
  const evalResult = useJsonataEval(
    expression,
    inputJson,
    wasm?.gnataEval ?? null
  );
  const handleRun = useCallback4(() => {
    evalResult.evaluate();
  }, [evalResult]);
  const headerStyle = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    background: colors.surface,
    borderBottom: `1px solid ${colors.border}`,
    flexShrink: 0
  };
  const labelStyle = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    color: colors.muted,
    userSelect: "none"
  };
  const panelHeaderStyle = {
    ...labelStyle,
    padding: "8px 12px",
    background: colors.surface,
    borderBottom: `1px solid ${colors.border}`
  };
  const timingStyle = {
    marginLeft: "auto",
    fontSize: 12,
    fontFamily: "'SF Mono', monospace",
    color: colors.accent
  };
  const statusDotStyle = {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: wasm?.isReady ? colors.green : colors.muted,
    transition: "background 0.3s"
  };
  return /* @__PURE__ */ jsxs2(
    "div",
    {
      id,
      className: props.className,
      style: {
        display: "flex",
        flexDirection: "column",
        height,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        overflow: "hidden",
        fontFamily: "'Onest', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: colors.text,
        ...props.style
      },
      children: [
        /* @__PURE__ */ jsxs2("div", { style: headerStyle, children: [
          /* @__PURE__ */ jsx4(
            "button",
            {
              onClick: handleRun,
              disabled: !wasm?.isReady,
              style: {
                fontFamily: "'Onest', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                padding: "6px 16px",
                border: "none",
                borderRadius: 6,
                cursor: wasm?.isReady ? "pointer" : "not-allowed",
                background: colors.accent,
                color: colors.accentText,
                opacity: wasm?.isReady ? 1 : 0.4,
                transition: "opacity 0.15s"
              },
              children: "Run"
            }
          ),
          /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
            /* @__PURE__ */ jsx4("div", { style: statusDotStyle }),
            /* @__PURE__ */ jsx4("span", { style: { fontSize: 12, color: wasm?.isReady ? colors.green : colors.muted }, children: wasm?.isReady ? "Ready" : wasm?.error ? "Error" : "Loading..." })
          ] }),
          evalResult.timing && /* @__PURE__ */ jsx4("span", { style: timingStyle, children: evalResult.timing })
        ] }),
        /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "stretch", borderBottom: `1px solid ${colors.border}`, flexShrink: 0 }, children: [
          /* @__PURE__ */ jsx4("div", { style: { ...panelHeaderStyle, borderBottom: "none", borderRight: `1px solid ${colors.border}`, minWidth: 100, display: "flex", alignItems: "center" }, children: "Expression" }),
          /* @__PURE__ */ jsx4(
            JsonataEditor,
            {
              value: expression,
              onChange: setExpression,
              onRun: handleRun,
              theme: props.theme ?? "dark",
              themeOverrides: props.themeOverrides,
              schema,
              gnataEval: wasm?.gnataEval,
              gnataDiagnostics: wasm?.gnataDiagnostics,
              gnataCompletions: wasm?.gnataCompletions,
              gnataHover: wasm?.gnataHover,
              getInputJson,
              style: { flex: 1, minHeight: 36, maxHeight: 80 }
            }
          )
        ] }),
        /* @__PURE__ */ jsxs2(
          "div",
          {
            style: {
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              flex: 1,
              overflow: "hidden",
              minHeight: 0
            },
            children: [
              /* @__PURE__ */ jsxs2("div", { style: { display: "flex", flexDirection: "column", overflow: "hidden", borderRight: `1px solid ${colors.border}` }, children: [
                /* @__PURE__ */ jsx4("div", { style: panelHeaderStyle, children: "Input JSON" }),
                /* @__PURE__ */ jsx4(
                  JsonataInput,
                  {
                    value: inputJson,
                    onChange: setInputJson,
                    theme: props.theme ?? "dark",
                    themeOverrides: props.themeOverrides,
                    style: { flex: 1, overflow: "hidden" }
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs2("div", { style: { display: "flex", flexDirection: "column", overflow: "hidden" }, children: [
                /* @__PURE__ */ jsx4("div", { style: panelHeaderStyle, children: "Result" }),
                /* @__PURE__ */ jsx4(
                  JsonataResult,
                  {
                    value: evalResult.result,
                    error: evalResult.error,
                    timing: evalResult.timing,
                    theme: props.theme ?? "dark",
                    themeOverrides: props.themeOverrides,
                    showTiming: false,
                    style: { flex: 1, overflow: "hidden" }
                  }
                )
              ] })
            ]
          }
        )
      ]
    }
  );
}
export {
  JsonataEditor,
  JsonataInput,
  JsonataPlayground,
  JsonataResult,
  allKeysFromJson,
  buildSchema,
  collectKeys,
  createEditorTheme,
  createHighlightStyle,
  darkColors,
  darkTokenColors,
  formatHoverMarkdown,
  formatTiming,
  jsonataStreamLanguage,
  lightColors,
  lightTokenColors,
  tokyoNightTheme,
  tooltipTheme,
  useJsonataEditor,
  useJsonataEval,
  useJsonataLsp,
  useJsonataSchema,
  useJsonataWasm
};
