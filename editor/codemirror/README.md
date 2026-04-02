# @gnata-sqlite/codemirror

CodeMirror 6 language support for [JSONata](https://jsonata.org) expressions — syntax highlighting, error diagnostics, autocomplete, and hover documentation, powered by a 85KB WASM module.

## Features

- **Syntax highlighting** — Lezer grammar with full JSONata 2.x coverage (works without WASM)
- **Error diagnostics** — real-time squiggly underlines from the gnata parser
- **Autocomplete** — context-aware: `$` triggers function completions with signatures, `.` triggers field completions from your data schema
- **Hover documentation** — hover any `$function`, operator, keyword, or data field to see docs, signatures, and examples

## Install

```bash
npm install @gnata-sqlite/codemirror
```

You also need the WASM files served from your app:
- `gnata-lsp.wasm` (61KB gzipped)
- `lsp-wasm_exec.js` (TinyGo runtime)

## Quick Start

```ts
import { EditorView, basicSetup } from "codemirror"
import { initWasm, jsonataFull } from "@gnata-sqlite/codemirror"

// 1. Load WASM (once, at startup)
await initWasm("/gnata-lsp.wasm", "/lsp-wasm_exec.js")

// 2. Create editor with full JSONata support
new EditorView({
  doc: '$sum(items.(price * quantity))',
  extensions: [
    basicSetup,
    jsonataFull(),
  ],
  parent: document.getElementById("editor")!,
})
```

That's it. You get syntax highlighting, diagnostics, autocomplete, and hover docs.

## API

### `initWasm(wasmUrl, execUrl)`

Load the WASM module. Call once before creating editors. Returns a promise.

```ts
await initWasm("/assets/gnata-lsp.wasm", "/assets/lsp-wasm_exec.js")
```

### `jsonataFull(config?)`

All-in-one extension: syntax highlighting + linting + autocomplete + hover.

```ts
jsonataFull()                          // basic — no schema
jsonataFull({ schema: schemaString })  // with static schema
jsonataFull({ schema: () => getSchema() })  // with dynamic schema
```

The `schema` option enables field-aware autocomplete and hover. Pass a JSON string describing your data shape (see [Schema Format](#schema-format) below), or a getter function for dynamic schemas.

### Individual Extensions

Use these for fine-grained control:

```ts
import {
  jsonata,           // syntax highlighting only (no WASM needed)
  jsonataLint,       // error diagnostics
  jsonataCompletion, // autocomplete
  jsonataHover,      // hover tooltips
} from "@gnata-sqlite/codemirror"

extensions: [
  jsonata(),
  jsonataLint(),
  jsonataHover({ schema: () => mySchema }),
  jsonataLanguage.data.of({
    autocomplete: jsonataCompletion({ schema: () => mySchema }),
  }),
]
```

### `jsonata()`

Syntax highlighting only. Works without WASM — no `initWasm()` needed.

## Schema Format

The schema is a JSON string describing the shape of the input data. It enables field completions after `.` and type info on hover.

```json
{
  "fields": {
    "event": {
      "type": "object",
      "fields": {
        "action": { "type": "string" },
        "severity": { "type": "number" },
        "user": { "type": "string" },
        "metadata": {
          "type": "object",
          "fields": {
            "ip": { "type": "string" },
            "geo": { "type": "string" }
          }
        }
      }
    }
  }
}
```

You can build this from your data at runtime:

```ts
function buildSchema(data) {
  if (!data || typeof data !== "object") return {}
  if (Array.isArray(data)) {
    return data.length > 0 ? buildSchema(data[0]) : {}
  }
  const fields = {}
  for (const [key, val] of Object.entries(data)) {
    const type = val === null ? "null"
      : Array.isArray(val) ? "array"
      : typeof val
    const child = { type }
    if (typeof val === "object" && val !== null) {
      const nested = buildSchema(val)
      if (nested.fields) child.fields = nested.fields
    }
    fields[key] = child
  }
  return { fields }
}

// Use it:
const schema = JSON.stringify(buildSchema(myInputData))
jsonataFull({ schema })
```

## Hover Tooltip Styling

Add CSS for the hover tooltips:

```css
.cm-tooltip-hover {
  background: #1f2335;
  border: 1px solid #3b4261;
  border-radius: 6px;
  max-width: 480px;
}
.cm-hover-doc {
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.5;
}
.cm-hover-doc strong { color: #7aa2f7; }
.cm-hover-doc code {
  font-family: monospace;
  font-size: 12px;
  background: #1a1b26;
  padding: 1px 5px;
  border-radius: 3px;
}
.cm-hover-doc pre {
  font-family: monospace;
  font-size: 12px;
  background: #1a1b26;
  padding: 8px 10px;
  border-radius: 4px;
  margin: 6px 0;
  overflow-x: auto;
}
```

## Minimal HTML Example

A complete working example using ESM imports (no build step):

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    #editor { border: 1px solid #3b4261; border-radius: 6px; }
    /* hover tooltip styles */
    .cm-tooltip-hover { background: #1f2335 !important; border: 1px solid #3b4261 !important; border-radius: 6px; max-width: 480px; }
    .cm-hover-doc { padding: 10px 14px; font-size: 13px; color: #a9b1d6; line-height: 1.5; }
    .cm-hover-doc strong { color: #7aa2f7; }
    .cm-hover-doc code { font-size: 12px; background: #1a1b26; padding: 1px 5px; border-radius: 3px; color: #9ece6a; }
    .cm-hover-doc pre { font-size: 12px; background: #1a1b26; padding: 8px 10px; border-radius: 4px; margin: 6px 0; }
    /* autocomplete styles */
    .cm-tooltip-autocomplete { background: #1f2335 !important; border: 1px solid #3b4261 !important; border-radius: 6px; }
    .cm-tooltip-autocomplete ul li[aria-selected] { background: rgba(122,162,247,0.12) !important; color: #7aa2f7 !important; }
    /* lint squiggly underlines */
    .cm-lintRange-error {
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='m0 3 l2 -2 l1 0 l2 2 l1 0' fill='none' stroke='%23f7768e' stroke-width='.7'/%3E%3C/svg%3E");
      background-repeat: repeat-x; background-position: bottom; background-size: 6px 3px; padding-bottom: 1px;
    }
  </style>
</head>
<body>
  <div id="editor"></div>
  <script type="module">
    import { EditorView, keymap } from 'https://esm.sh/@codemirror/view@6'
    import { EditorState } from 'https://esm.sh/@codemirror/state@6'
    import { defaultKeymap, history, historyKeymap } from 'https://esm.sh/@codemirror/commands@6'
    import { syntaxHighlighting, HighlightStyle, StreamLanguage } from 'https://esm.sh/@codemirror/language@6'
    import { autocompletion } from 'https://esm.sh/@codemirror/autocomplete@6'
    import { linter } from 'https://esm.sh/@codemirror/lint@6'
    import { hoverTooltip } from 'https://esm.sh/@codemirror/view@6'
    import { tags as t } from 'https://esm.sh/@lezer/highlight@1'

    // ── 1. Load WASM ──
    await new Promise((res, rej) => {
      const s = document.createElement('script')
      s.src = 'lsp-wasm_exec.js'
      s.onload = res; s.onerror = rej
      document.head.appendChild(s)
    })
    const go = new Go()
    const result = await WebAssembly.instantiateStreaming(
      fetch('gnata-lsp.wasm'), go.importObject
    )
    go.run(result.instance)

    // ── 2. JSONata stream tokenizer ──
    const KW = new Set(['and','or','in','true','false','null','function'])
    const OP = new Set(['+','-','*','/','%','&','|','=','<','>','!','~','^','?',':','.',',',';','@','#'])
    const BR = new Set(['(',')','{','}','[',']'])
    const jsonataLang = StreamLanguage.define({
      token(stream) {
        if (stream.eatSpace()) return null
        if (stream.match('/*')) { while (!stream.match('*/') && !stream.eol()) stream.next(); return 'blockComment' }
        const ch = stream.peek()
        if (ch === '"' || ch === "'") { const q = stream.next(); while (!stream.eol()) { const c = stream.next(); if (c === q) return 'string'; if (c === '\\') stream.next() } return 'string' }
        if (/[0-9]/.test(ch)) { stream.match(/^[0-9]*\.?[0-9]*([eE][+-]?[0-9]+)?/); return 'number' }
        if (ch === '$') { stream.next(); stream.match(/^[a-zA-Z_$][a-zA-Z0-9_]*/); return stream.peek() === '(' ? 'function(variableName)' : 'special(variableName)' }
        if (BR.has(ch)) { stream.next(); return 'paren' }
        if (stream.match('~>')||stream.match(':=')||stream.match('!=')||stream.match('>=')||stream.match('<=')||stream.match('**')||stream.match('..')||stream.match('?:')||stream.match('??')) return 'operator'
        if (OP.has(ch)) { stream.next(); return 'operator' }
        if (/[a-zA-Z_`]/.test(ch)) {
          if (ch === '`') { stream.next(); while (!stream.eol() && stream.peek() !== '`') stream.next(); if (stream.peek()==='`') stream.next(); return 'variableName' }
          stream.match(/^[a-zA-Z_][a-zA-Z0-9_]*/); const w = stream.current()
          if (KW.has(w)) { if (w==='true'||w==='false') return 'bool'; if (w==='null') return 'null'; return 'keyword' }
          return 'variableName'
        }
        stream.next(); return null
      },
    })

    // ── 3. Theme ──
    const hl = HighlightStyle.define([
      { tag: t.keyword, color: '#bb9af7' },
      { tag: t.operator, color: '#89ddff' },
      { tag: t.special(t.variableName), color: '#B5E600' },
      { tag: t.variableName, color: '#73daca' },
      { tag: t.function(t.variableName), color: '#7aa2f7' },
      { tag: t.string, color: '#9ece6a' },
      { tag: t.number, color: '#ff9e64' },
      { tag: t.bool, color: '#ff9e64' },
      { tag: t.null, color: '#565f89' },
      { tag: t.blockComment, color: '#565f89' },
      { tag: t.paren, color: '#698098' },
      { tag: t.squareBracket, color: '#698098' },
      { tag: t.brace, color: '#698098' },
    ])

    // ── 4. Wire up WASM features ──
    const gnataLinter = linter(view => {
      if (typeof _gnataDiagnostics !== 'function') return []
      const doc = view.state.doc.toString()
      if (!doc.trim()) return []
      try {
        const r = _gnataDiagnostics(doc)
        if (r instanceof Error) return []
        return JSON.parse(r)
      } catch { return [] }
    }, { delay: 200 })

    function gnataComplete(ctx) {
      if (typeof _gnataCompletions !== 'function') return null
      const doc = ctx.state.doc.toString()
      let from = ctx.pos
      while (from > 0) {
        const ch = doc.charCodeAt(from - 1)
        if ((ch>=65&&ch<=90)||(ch>=97&&ch<=122)||(ch>=48&&ch<=57)||ch===95||ch===36) from--
        else break
      }
      try {
        const r = _gnataCompletions(doc, ctx.pos, '')
        if (r instanceof Error) return null
        const items = JSON.parse(r)
        return items.length ? { from, options: items } : null
      } catch { return null }
    }

    function renderMd(md) {
      return md.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/```\n([\s\S]*?)```/g,'<pre>$1</pre>')
        .replace(/`([^`]+)`/g,'<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
        .replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>')
    }

    const gnataHover = hoverTooltip(function(view, pos) {
      if (typeof _gnataHover !== 'function') return null
      const doc = view.state.doc.toString()
      try {
        const r = _gnataHover(doc, pos)
        if (!r) return null
        const info = JSON.parse(r)
        return { pos: info.from, end: info.to, above: true, create() {
          const dom = document.createElement('div')
          dom.className = 'cm-hover-doc'
          dom.innerHTML = renderMd(info.text)
          return { dom }
        }}
      } catch { return null }
    })

    // ── 5. Create editor ──
    new EditorView({
      doc: '$sum(Account.Order.Product.(Price * Quantity))',
      extensions: [
        keymap.of([...defaultKeymap, ...historyKeymap]),
        history(),
        jsonataLang,
        syntaxHighlighting(hl),
        autocompletion({ override: [gnataComplete], activateOnTyping: true, icons: false }),
        gnataLinter,
        gnataHover,
        EditorView.theme({
          '&': { backgroundColor: '#1a1b26', color: '#c0caf5' },
          '.cm-content': { caretColor: '#c0caf5' },
          '.cm-cursor': { borderLeftColor: '#c0caf5' },
          '.cm-gutters': { display: 'none' },
          '.cm-activeLine': { background: 'transparent' },
        }, { dark: true }),
      ],
      parent: document.getElementById('editor'),
    })
  </script>
</body>
</html>
```

## Architecture

```
┌─────────────────────────┐     ┌──────────────────────────┐
│   Your App (browser)    │     │    gnata-lsp.wasm (85KB)  │
│                         │     │    TinyGo WASM module     │
│  CodeMirror Editor      │────▶│                          │
│  + @gnata-sqlite/codemirror    │     │  _gnataDiagnostics(expr) │
│                         │◀────│  _gnataCompletions(...)   │
│                         │     │  _gnataHover(expr, pos)   │
└─────────────────────────┘     └──────────────────────────┘
```

The WASM module contains the gnata parser and a catalog of 89 built-in JSONata functions with full documentation. It runs entirely in the browser — no server calls needed.

## Native LSP

The same Go code also builds as a native LSP server for VS Code / Neovim:

```bash
go build -o gnata-lsp ./editor/
```

Supports `textDocument/didOpen`, `textDocument/didChange`, `textDocument/completion`, `textDocument/hover`, and diagnostics.
