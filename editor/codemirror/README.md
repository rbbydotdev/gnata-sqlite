# @gnata-sqlite/codemirror

CodeMirror 6 language support for [JSONata](https://jsonata.org) expressions — syntax highlighting, error diagnostics, autocomplete, and hover documentation, powered by a 380 KB WASM module (145 KB gzipped).

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
- `gnata-lsp.wasm` (380 KB, 145 KB gzipped)
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

## Styles

Import the bundled stylesheet for Tokyo Night-themed tooltips, autocomplete, and lint styling:

```ts
import '@gnata-sqlite/codemirror/styles.css'
```

Includes dark mode (default) and light mode (when `<html>` lacks a `.dark` class). Override any class in your own CSS to customize.

## Minimal Example

```ts
import { EditorView, basicSetup } from "codemirror"
import { initWasm, jsonataFull } from "@gnata-sqlite/codemirror"

await initWasm("/gnata-lsp.wasm", "/lsp-wasm_exec.js")

new EditorView({
  doc: '$sum(Account.Order.Product.(Price * Quantity))',
  extensions: [basicSetup, jsonataFull()],
  parent: document.getElementById("editor")!,
})
```

With a schema for field-aware autocomplete and hover:

```ts
const schema = JSON.stringify({
  fields: {
    Account: {
      type: "object",
      fields: {
        Order: { type: "array", fields: {
          Product: { type: "array", fields: {
            Price: { type: "number" },
            Quantity: { type: "number" },
          }}
        }}
      }
    }
  }
})

new EditorView({
  doc: 'Account.Order.',
  extensions: [basicSetup, jsonataFull({ schema })],
  parent: document.getElementById("editor")!,
})
```

## Architecture

```
┌─────────────────────────────┐     ┌───────────────────────────────┐
│   Your App (browser)        │     │  gnata-lsp.wasm (145 KB)      │
│                             │     │  TinyGo WASM module           │
│  CodeMirror Editor          │────▶│                               │
│  + @gnata-sqlite/codemirror │     │  _gnataDiagnostics(expr)      │
│                             │◀────│  _gnataCompletions(...)       │
│                             │     │  _gnataHover(expr, pos)       │
└─────────────────────────────┘     └───────────────────────────────┘
```

The WASM module contains the gnata parser and a catalog of 89 built-in JSONata functions with full documentation. It runs entirely in the browser — no server calls needed.

## Native LSP

The same Go code also builds as a native LSP server for VS Code / Neovim:

```bash
go build -o gnata-lsp ./editor/
```

Supports `textDocument/didOpen`, `textDocument/didChange`, `textDocument/completion`, `textDocument/hover`, and diagnostics.
