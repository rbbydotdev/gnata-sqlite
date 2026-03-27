import { parser } from "./jsonata.grammar"
import {
  LRLanguage,
  LanguageSupport,
  indentNodeProp,
  foldNodeProp,
  foldInside,
} from "@codemirror/language"
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete"
import { linter, type Diagnostic } from "@codemirror/lint"
import { hoverTooltip, type Tooltip } from "@codemirror/view"
import { jsonataHighlighting } from "./highlight"

// ---- Language definition ----

export const jsonataLanguage = LRLanguage.define({
  name: "jsonata",
  parser: parser.configure({
    props: [
      indentNodeProp.add({
        Block: (cx) => cx.baseIndent + cx.unit,
        ArrayConstructor: (cx) => cx.baseIndent + cx.unit,
        ObjectConstructor: (cx) => cx.baseIndent + cx.unit,
        LambdaBody: (cx) => cx.baseIndent + cx.unit,
      }),
      foldNodeProp.add({
        Block: foldInside,
        ArrayConstructor: foldInside,
        ObjectConstructor: foldInside,
        LambdaBody: foldInside,
        BlockComment: foldInside,
      }),
      jsonataHighlighting,
    ],
  }),
  languageData: {
    commentTokens: { block: { open: "/*", close: "*/" } },
    closeBrackets: { brackets: ["(", "[", "{", '"', "'"] },
  },
})

// ---- WASM bridge ----

interface WasmExports {
  _gnataParse: (expr: string) => string | Error
  _gnataDiagnostics: (expr: string) => string | Error
  _gnataCompletions: (
    expr: string,
    pos: number,
    schema: string,
  ) => string | Error
  _gnataHover: (expr: string, pos: number, schema?: string) => string | Error
}

let wasmReady: Promise<WasmExports> | null = null

/**
 * Initialize the gnata WASM language intelligence module.
 * Call once at startup. Returns a promise that resolves when WASM is loaded.
 *
 * @param wasmUrl - URL to gnata-lsp.wasm
 * @param execUrl - URL to lsp-wasm_exec.js (TinyGo support)
 */
export async function initWasm(
  wasmUrl: string,
  execUrl: string,
): Promise<void> {
  if (wasmReady) {
    await wasmReady
    return
  }
  wasmReady = doInitWasm(wasmUrl, execUrl)
  await wasmReady
}

async function doInitWasm(
  wasmUrl: string,
  execUrl: string,
): Promise<WasmExports> {
  await loadScript(execUrl)

  // @ts-expect-error -- Go constructor injected by wasm_exec.js
  const go = new (globalThis as any).Go()
  const result = await WebAssembly.instantiateStreaming(
    fetch(wasmUrl),
    go.importObject,
  )
  go.run(result.instance)

  const g = globalThis as any
  return {
    _gnataParse: g._gnataParse,
    _gnataDiagnostics: g._gnataDiagnostics,
    _gnataCompletions: g._gnataCompletions,
    _gnataHover: g._gnataHover,
  }
}

function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script")
    s.src = url
    s.onload = () => resolve()
    s.onerror = reject
    document.head.appendChild(s)
  })
}

// ---- Linter extension ----

/**
 * CodeMirror linter powered by WASM diagnostics.
 * Returns empty diagnostics until WASM is loaded via initWasm().
 */
export function jsonataLint() {
  return linter(async (view): Promise<Diagnostic[]> => {
    if (!wasmReady) return []
    const wasm = await wasmReady
    const doc = view.state.doc.toString()
    if (!doc.trim()) return []

    try {
      const result = wasm._gnataDiagnostics(doc)
      if (result instanceof Error) return []
      return JSON.parse(result as string) as Diagnostic[]
    } catch {
      return []
    }
  })
}

// ---- Hover extension ----

/**
 * Renders a simple subset of markdown to HTML for hover tooltips.
 */
function renderMarkdown(md: string): string {
  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/```\n([\s\S]*?)```/g, "<pre>$1</pre>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n\n/g, "<br><br>")
    .replace(/\n/g, "<br>")
}

export interface JsonataHoverConfig {
  /** JSON schema string for field type info on hover. Same format as completion schema. */
  schema?: string | (() => string)
}

/**
 * CodeMirror hover tooltip powered by WASM.
 * Shows documentation for functions, operators, keywords, and data fields on hover.
 * Pass a schema (static string or getter function) to get type info for field paths.
 * Returns no tooltip if WASM is not loaded via initWasm().
 */
export function jsonataHover(config: JsonataHoverConfig = {}) {
  return hoverTooltip(async (_view, pos): Promise<Tooltip | null> => {
    if (!wasmReady) return null
    const wasm = await wasmReady
    const doc = _view.state.doc.toString()
    const schema =
      typeof config.schema === "function" ? config.schema() : config.schema ?? ""

    try {
      const result = wasm._gnataHover(doc, pos, schema)
      if (result instanceof Error || !result) return null
      const info = JSON.parse(result as string) as {
        from: number
        to: number
        text: string
      }
      return {
        pos: info.from,
        end: info.to,
        above: true,
        create() {
          const dom = document.createElement("div")
          dom.className = "cm-hover-doc"
          dom.innerHTML = renderMarkdown(info.text)
          return { dom }
        },
      }
    } catch {
      return null
    }
  })
}

// ---- Autocomplete extension ----

export interface JsonataCompletionConfig {
  /** JSON schema string for field completions. See editor/README.md for format. */
  schema?: string | (() => string)
}

/**
 * CodeMirror autocompletion source powered by WASM.
 * Falls back to null if WASM is not loaded.
 */
export function jsonataCompletion(config: JsonataCompletionConfig = {}) {
  return async function (
    context: CompletionContext,
  ): Promise<CompletionResult | null> {
    if (!wasmReady) return null
    const wasm = await wasmReady

    const doc = context.state.doc.toString()
    const pos = context.pos
    const schema =
      typeof config.schema === "function" ? config.schema() : config.schema ?? ""

    try {
      const result = wasm._gnataCompletions(doc, pos, schema)
      if (result instanceof Error) return null
      const items = JSON.parse(result as string)
      if (!items.length) return null

      // Walk backward to find start of current token.
      let from = pos
      while (from > 0) {
        const ch = doc.charCodeAt(from - 1)
        if (isIdentChar(ch) || ch === 36 /* $ */) from--
        else break
      }

      return { from, options: items }
    } catch {
      return null
    }
  }
}

function isIdentChar(ch: number): boolean {
  return (
    (ch >= 65 && ch <= 90) || // A-Z
    (ch >= 97 && ch <= 122) || // a-z
    (ch >= 48 && ch <= 57) || // 0-9
    ch === 95 // _
  )
}

// ---- Public API ----

/**
 * CodeMirror language support for JSONata (syntax highlighting only).
 * Works without WASM. Add jsonataLint(), jsonataHover(), and
 * jsonataCompletion() separately for WASM-powered features.
 */
export function jsonata(): LanguageSupport {
  return new LanguageSupport(jsonataLanguage, [])
}

/**
 * Full-featured JSONata support: syntax highlighting + linting + autocomplete + hover.
 * Call initWasm() before creating the editor for full functionality.
 */
export function jsonataFull(config: JsonataCompletionConfig = {}): LanguageSupport {
  return new LanguageSupport(jsonataLanguage, [
    jsonataLint(),
    jsonataHover({ schema: config.schema }),
    jsonataLanguage.data.of({
      autocomplete: jsonataCompletion(config),
    }),
  ])
}

export { jsonataHighlighting }
