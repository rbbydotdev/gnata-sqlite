# @gnata-sqlite/react

Composable React components and hooks for building JSONata editors with syntax highlighting, autocomplete, hover documentation, and live evaluation — powered by gnata's TinyGo WASM LSP.

## Quick Start

```tsx
import { JsonataPlayground, useJsonataWasm } from '@gnata-sqlite/react'

function App() {
  const wasm = useJsonataWasm({
    evalWasmUrl: '/gnata.wasm',
    evalExecUrl: '/wasm_exec.js',
    lspWasmUrl: '/gnata-lsp.wasm',
    lspExecUrl: '/lsp-wasm_exec.js',
  })

  if (!wasm.isReady) return <div>Loading...</div>

  return (
    <JsonataPlayground
      defaultExpression="$sum(Account.Order.Product.(Price * Quantity))"
      defaultInput={sampleJson}
      wasm={wasm}
      theme="dark"
      height={500}
    />
  )
}
```

## Install

```bash
npm install @gnata-sqlite/react
```

Peer dependencies: `react >=18`, `react-dom >=18`.

## Architecture

The package is **hooks-first** — every feature is a hook. Components compose hooks. Use the full `<JsonataPlayground>` widget, or pick individual pieces for custom layouts.

```
┌─────────────────────────────────────────────────┐
│                JsonataPlayground                │
│  ┌──────────────┬─────────────┬───────────────┐ │
│  │ JsonataEditor│ JsonataInput│ JsonataResult │ │
│  └──────┬───────┴──────┬──────┴───────┬───────┘ │
│         │              │              │         │
│  useJsonataEditor  useJsonataEval  useJsonataSchema │
│         │                                       │
│  useJsonataWasm (loads gnata.wasm + LSP WASM)   │
└─────────────────────────────────────────────────┘
```

## Hooks

### `useJsonataWasm(options)`

Loads and manages the WASM modules. Call once at the top of your app.

```tsx
const wasm = useJsonataWasm({
  evalWasmUrl: '/gnata.wasm',       // Standard Go WASM — expression evaluation
  evalExecUrl: '/wasm_exec.js',     // Go WASM runtime
  lspWasmUrl: '/gnata-lsp.wasm',    // TinyGo WASM — LSP (diagnostics, autocomplete, hover)
  lspExecUrl: '/lsp-wasm_exec.js',  // TinyGo WASM runtime
})

// wasm.isReady      — eval module loaded
// wasm.isLspReady   — LSP module loaded (may load after eval)
// wasm.error        — loading error, if any
// wasm.gnataEval    — evaluate an expression: gnataEval(expr, json) → string
// wasm.gnataCompile — compile an expression: gnataCompile(expr) → string
```

The LSP WASM is optional — if `lspWasmUrl` is omitted, editors work with syntax highlighting only (no diagnostics, autocomplete, or hover).

### `useJsonataEval(expression, inputJson, wasm)`

Evaluates a JSONata expression against JSON input with debouncing and timing.

```tsx
const { result, error, timing } = useJsonataEval(expression, inputJson, wasm)

// result  — evaluation result as a string (null if error)
// error   — error message (null if success)
// timing  — evaluation time in milliseconds
```

### `useJsonataSchema(inputJson)`

Builds an autocomplete schema from sample JSON data. Pass the result to `<JsonataEditor>` for field suggestions.

```tsx
const schema = useJsonataSchema(inputJson)
// Returns a JSON string describing the document structure
```

### `useJsonataEditor(options)`

Low-level hook — creates a CodeMirror 6 `EditorView` with the full extension stack. Use this for custom editor layouts.

```tsx
const { ref, view } = useJsonataEditor({
  initialValue: '$sum(items.price)',
  onChange: (value) => setExpression(value),
  schema,
  wasm,
  theme: 'dark',
  getInputJson: () => inputJson, // for introspective autocomplete
})

return <div ref={ref} />
```

## Components

### `<JsonataPlayground>`

Full three-panel widget: expression editor + JSON input + result display.

```tsx
<JsonataPlayground
  defaultExpression="Account.Order.Product.Price"
  defaultInput={jsonString}
  wasm={wasm}
  theme="dark"       // 'dark' | 'light'
  height={500}       // panel height in px
  onExpressionChange={(expr) => {}}
  onInputChange={(json) => {}}
/>
```

### `<JsonataEditor>`

Expression editor with syntax highlighting, autocomplete, hover docs, and diagnostics.

```tsx
<JsonataEditor
  value={expression}
  onChange={setExpression}
  schema={schema}
  wasm={wasm}
  theme="dark"
  placeholder="e.g. Account.Order.Product.Price"
  getInputJson={() => inputJson}  // for introspective autocomplete
/>
```

**Introspective autocomplete:** When typing after a `.`, the editor evaluates the prefix expression against the input data to discover available keys. Type `Account.Order.` and it suggests `Product`, `OrderID`, etc. — with types.

### `<JsonataInput>`

JSON input editor with syntax highlighting.

```tsx
<JsonataInput
  value={inputJson}
  onChange={setInputJson}
  theme="dark"
/>
```

### `<JsonataResult>`

Read-only result display. Green text on success, red on error.

```tsx
<JsonataResult
  value={result}
  error={error}
  timing={timing}
  theme="dark"
/>
```

## Theme

All components use the Tokyo Night color scheme by default. Export the theme factory for customization:

```tsx
import { tokyoNightTheme, darkColors, lightColors } from '@gnata-sqlite/react'

// Use the built-in theme
const extensions = [tokyoNightTheme('dark')]

// Access color tokens directly
console.log(darkColors.green)  // '#9ece6a'
console.log(darkColors.bg)     // '#1a1b26'
```

### Color Tokens

| Token | Dark | Light |
|-------|------|-------|
| `bg` | `#1a1b26` | `#d5d6db` |
| `surface` | `#1f2335` | `#e1e2e7` |
| `text` | `#a9b1d6` | `#3760bf` |
| `textStrong` | `#c0caf5` | `#343b58` |
| `accent` | `#7aa2f7` | `#2e7de9` |
| `green` | `#9ece6a` | `#587539` |
| `error` | `#f7768e` | `#c64343` |
| `muted` | `#565f89` | `#848cb5` |

## Utilities

```tsx
import {
  jsonataStreamLanguage, // CodeMirror StreamLanguage for JSONata
  buildSchema,           // Build schema from JSON data
  formatHoverMarkdown,   // Format LSP hover markdown to HTML
  formatTiming,          // Format ms to human-readable timing
} from '@gnata-sqlite/react'
```

## WASM Files

The package does not bundle WASM files — you serve them yourself. Build from source:

```bash
# Eval module (standard Go WASM)
GOOS=js GOARCH=wasm go build -ldflags="-s -w" -trimpath -o gnata.wasm ./wasm/
cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" wasm_exec.js

# LSP module (TinyGo WASM — 85KB gzipped)
tinygo build -o gnata-lsp.wasm -no-debug -gc=conservative -target wasm ./editor/
cp "$(tinygo env TINYGOROOT)/targets/wasm_exec.js" lsp-wasm_exec.js
```

Serve all four files from your public/static directory.

## License

MIT
