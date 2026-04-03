# @gnata-sqlite/codemirror

CodeMirror 6 language support for [JSONata](https://jsonata.org) — syntax highlighting, error diagnostics, autocomplete, and hover documentation.

## Install

```bash
npm install @gnata-sqlite/codemirror
```

Serve the WASM files from your app's public directory:
- `gnata-lsp.wasm`
- `lsp-wasm_exec.js`

If you're using `@gnata-sqlite/react`, the WASM files are already included — run `npx @gnata-sqlite/react` to copy them into place.

## Quick Start

```ts
import { EditorView, basicSetup } from "codemirror"
import { initWasm, jsonataFull } from "@gnata-sqlite/codemirror"
import "@gnata-sqlite/codemirror/styles.css"

await initWasm("/gnata-lsp.wasm", "/lsp-wasm_exec.js")

new EditorView({
  doc: '$sum(Account.Order.Product.(Price * Quantity))',
  extensions: [basicSetup, jsonataFull()],
  parent: document.getElementById("editor")!,
})
```

That gives you syntax highlighting, diagnostics, autocomplete, and hover docs.

## Data-Aware Completions

Pass a schema to get field suggestions when typing after `.`:

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

jsonataFull({ schema })
// or pass a getter for dynamic schemas:
jsonataFull({ schema: () => currentSchema })
```

Type `Account.Order.` and it suggests `Product` with type info. The `@gnata-sqlite/react` package exports a `buildSchema()` helper that generates this from sample JSON data.

## Individual Extensions

`jsonataFull()` bundles everything. For fine-grained control, use the individual extensions:

```ts
import {
  jsonata,           // syntax highlighting only (no WASM needed)
  jsonataLint,       // error diagnostics
  jsonataCompletion, // autocomplete
  jsonataHover,      // hover tooltips
  jsonataLanguage,   // underlying language definition
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

`jsonata()` works without WASM — use it for syntax highlighting only, no `initWasm()` needed.

## Styles

Import the bundled stylesheet for Tokyo Night-themed tooltips, autocomplete, and lint styling:

```ts
import "@gnata-sqlite/codemirror/styles.css"
```

Includes dark mode (default) and light mode (when `<html>` lacks a `.dark` class). Override any class in your own CSS to customize.

## API Reference

| Export | Description |
|--------|-------------|
| `initWasm(wasmUrl, execUrl)` | Load the WASM module. Call once at startup. Returns a promise. |
| `jsonataFull(config?)` | All-in-one extension: highlighting + linting + autocomplete + hover. |
| `jsonata()` | Syntax highlighting only. No WASM required. |
| `jsonataLint()` | Error diagnostics extension. |
| `jsonataCompletion(config?)` | Autocomplete source. Pass `{ schema }` for field completions. |
| `jsonataHover(config?)` | Hover tooltip extension. Pass `{ schema }` for field type info. |
| `jsonataLanguage` | Underlying Lezer language definition. |
| `jsonataHighlighting` | Syntax highlighting style tags. |

Schema config accepts `{ schema: string | (() => string) }`.

## License

MIT
