# gnata Editor Integration

CodeMirror 6 language support and LSP server for JSONata, powered by gnata's parser.

Two delivery modes from the same codebase:

- **Browser** — TinyGo WASM module (380 KB, 145 KB gzipped) for CodeMirror diagnostics and autocomplete
- **Server** — Native Go LSP server (stdio JSON-RPC) for VS Code, Neovim, etc.

## Quick Start

### CodeMirror (Browser)

```typescript
import { EditorView, basicSetup } from "codemirror"
import { jsonataFull, initWasm } from "@gnata-sqlite/codemirror"

// Load the WASM module (380 KB, 145 KB gzipped).
await initWasm("/gnata-lsp.wasm", "/lsp-wasm_exec.js")

new EditorView({
  extensions: [basicSetup, jsonataFull({ schema: '{"fields":{"id":{},"name":{}}}' })],
  parent: document.getElementById("editor")!,
})
```

### LSP Server (VS Code / Neovim)

```bash
# Build the server binary.
go build -o gnata-lsp ./editor/
```

**VS Code** (`settings.json`):
```json
{
  "jsonata.lsp.serverPath": "/path/to/gnata-lsp"
}
```

**Neovim** (lspconfig):
```lua
require("lspconfig.configs").jsonata = {
  default_config = {
    cmd = { "/path/to/gnata-lsp" },
    filetypes = { "jsonata" },
    root_dir = function() return vim.loop.cwd() end,
  },
}
require("lspconfig").jsonata.setup({})
```

## Architecture

```
                    +---------------------------+
                    |     CodeMirror Editor      |
                    +---------------------------+
                    |  Lezer Grammar  |  WASM   |
                    |  (sync, every   | (async, |
                    |   keystroke)    | 380 KB) |
                    |                 |         |
                    |  Highlighting   | Diags   |
                    |  Brackets       | Compl.  |
                    |  Folding        | AST     |
                    +---------------------------+

  Same Go code  ──>  TinyGo WASM (browser)
  (editor/*.go)       go build    (native LSP server)
```

The Go files in `editor/` are shared between both targets via build tags:

| File | Purpose | Build constraint |
|------|---------|-----------------|
| `main_wasm.go` | syscall/js entry point | `//go:build js && wasm` |
| `main_lsp.go` | stdio JSON-RPC server | `//go:build !js` |
| `diagnostics.go` | Parse errors → diagnostics | _(none — shared)_ |
| `completions.go` | Context-aware autocomplete | _(none — shared)_ |
| `funcinfo.go` | Built-in function catalog | _(none — shared)_ |
| `schema.go` | Schema parser for field completions | _(none — shared)_ |
| `marshal.go` | Reflect-free AST JSON serializer | _(none — shared)_ |

## Features

### Syntax Highlighting (Lezer Grammar)

Works instantly, no WASM required. Highlights:

- Field names, variables (`$name`), strings, numbers, regex
- Keywords: `function`, `and`, `or`, `in`, `true`, `false`, `null`
- All operators: arithmetic, comparison, chain (`~>`), range (`..`), etc.
- Block comments (`/* ... */`)
- Bracket matching, auto-close, code folding

### Diagnostics (WASM / LSP)

Real-time parse error detection using gnata's actual Pratt parser. Returns structured errors with:

- Error code (S0201, S0202, etc.) matching the JSONata specification
- Exact byte position in source
- Human-readable message

### Autocomplete (WASM / LSP)

Context-aware completions:

| Context | What's suggested |
|---------|-----------------|
| After `$` | Built-in function names (70+ functions with signatures) |
| After `.` | Schema fields at the resolved path depth |
| Start of expression | Top-level schema fields + functions + keywords |
| After operators | Fields + functions + keywords |

## Schema Format

The schema describes your document structure for field autocompletion. Pass it as JSON:

```json
{
  "fields": {
    "Account": {
      "type": "object",
      "fields": {
        "Name": { "type": "string" },
        "Email": { "type": "string" },
        "Order": {
          "type": "array",
          "fields": {
            "OrderID": { "type": "string" },
            "Product": { "type": "object" },
            "Price": { "type": "number" }
          }
        }
      }
    }
  }
}
```

For flat SQLite rows, this simplifies to:

```json
{
  "fields": {
    "id": { "type": "number" },
    "name": { "type": "string" },
    "data": { "type": "string" }
  }
}
```

### LSP: Schema via initializationOptions

Pass the schema when the LSP client initializes:

```json
{
  "initializationOptions": {
    "schema": "{\"fields\":{\"id\":{\"type\":\"number\"}}}"
  }
}
```

## CodeMirror API Reference

### `jsonata(): LanguageSupport`

Syntax highlighting only. No WASM required.

```typescript
import { jsonata } from "@gnata-sqlite/codemirror"
// extensions: [basicSetup, jsonata()]
```

### `jsonataFull(config?): LanguageSupport`

Full support: syntax highlighting + WASM linter + autocomplete.

```typescript
import { jsonataFull } from "@gnata-sqlite/codemirror"
// extensions: [basicSetup, jsonataFull({ schema: '...' })]
```

### `initWasm(wasmUrl, execUrl): Promise<void>`

Load the TinyGo WASM module. Call once before creating editors.

### `jsonataLint(): Extension`

Standalone linter extension. Use with `jsonata()` for manual composition.

### `jsonataCompletion(config?): CompletionSource`

Standalone autocompletion source.

## WASM Exports (Low-Level)

The WASM module sets three functions on the global object:

| Function | Signature | Returns |
|----------|-----------|---------|
| `_gnataParse` | `(expr: string)` | JSON AST string \| Error |
| `_gnataDiagnostics` | `(expr: string)` | JSON diagnostics array |
| `_gnataCompletions` | `(expr, pos, schema)` | JSON completions array |
| `_gnataHover` | `(expr, pos, schema?)` | JSON hover info \| empty string |

## LSP Server Capabilities

The native LSP server supports:

| Method | Description |
|--------|-------------|
| `initialize` | Returns server capabilities |
| `textDocument/didOpen` | Publishes diagnostics for opened documents |
| `textDocument/didChange` | Publishes diagnostics on every change |
| `textDocument/completion` | Returns context-aware completions |
| `shutdown` / `exit` | Clean shutdown |

Diagnostics are pushed as `textDocument/publishDiagnostics` notifications.

## Building

### WASM Module

```bash
tinygo build \
  -o gnata-lsp.wasm -no-debug \
  -gc=conservative \
  -target wasm ./editor/

# Copy TinyGo's WASM support file.
cp "$(tinygo env TINYGOROOT)/targets/wasm_exec.js" lsp-wasm_exec.js
```

Output: `gnata-lsp.wasm` (380 KB raw, 145 KB gzipped)

### Native LSP Server

```bash
go build -o gnata-lsp ./editor/
```

### CodeMirror npm Package

```bash
cd editor/codemirror
npm install
npm run build
```

## Example: React

```tsx
import { useEffect, useRef } from "react"
import { EditorView, basicSetup } from "codemirror"
import { jsonataFull, initWasm } from "@gnata-sqlite/codemirror"

export function JsonataEditor({ schema }: { schema: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    initWasm("/gnata-lsp.wasm", "/lsp-wasm_exec.js")
    const view = new EditorView({
      extensions: [basicSetup, jsonataFull({ schema })],
      parent: ref.current!,
    })
    return () => view.destroy()
  }, [])

  return <div ref={ref} />
}
```

## Example: Vanilla JS

```html
<div id="editor"></div>
<script type="module">
  import { EditorView, basicSetup } from "codemirror"
  import { jsonata, initWasm, jsonataLint } from "@gnata-sqlite/codemirror"

  // Syntax highlighting works immediately.
  const view = new EditorView({
    extensions: [basicSetup, jsonata()],
    parent: document.getElementById("editor"),
  })

  // Add linting once WASM loads.
  initWasm("./gnata-lsp.wasm", "./lsp-wasm_exec.js")
</script>
```

## Directory Structure

```
editor/
  README.md              # This file
  main_wasm.go           # TinyGo WASM entry point (browser)
  main_lsp.go            # Native LSP server (VS Code, Neovim)
  diagnostics.go         # Parse errors → diagnostic format
  completions.go         # Context-aware completion engine
  funcinfo.go            # Built-in function catalog (70+ functions)
  schema.go              # Schema JSON parser (no encoding/json)
  marshal.go             # Reflect-free AST → JSON serializer
  codemirror/            # npm package (@gnata-sqlite/codemirror)
    src/
      jsonata.grammar    # Lezer grammar for syntax highlighting
      highlight.js       # CodeMirror style tag mappings
      index.ts           # Language support + WASM bridge
    package.json
    rollup.config.mjs
    tsconfig.json
```
