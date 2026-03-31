# @gnata-sqlite/react

Composable React components and hooks for building JSONata editors with syntax highlighting, autocomplete, hover documentation, and live evaluation — powered by gnata's TinyGo WASM LSP.

## Quick Start

```tsx
import { JsonataPlayground } from '@gnata-sqlite/react'

function App() {
  return (
    <JsonataPlayground
      defaultExpression="$sum(Account.Order.Product.(Price * Quantity))"
      defaultInput={sampleJson}
      wasmOptions={{
        evalWasmUrl: '/gnata.wasm',
        evalExecUrl: '/wasm_exec.js',
        lspWasmUrl: '/gnata-lsp.wasm',
        lspExecUrl: '/lsp-wasm_exec.js',
      }}
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

Loads and manages the WASM modules. Call once at the top of the app.

```tsx
const wasm = useJsonataWasm({
  evalWasmUrl: '/gnata.wasm',       // Standard Go WASM — expression evaluation (optional)
  evalExecUrl: '/wasm_exec.js',     // Go WASM runtime (optional)
  lspWasmUrl: '/gnata-lsp.wasm',    // TinyGo WASM — LSP (diagnostics, autocomplete, hover)
  lspExecUrl: '/lsp-wasm_exec.js',  // TinyGo WASM runtime
})

// wasm.isReady      — eval module loaded
// wasm.isLspReady   — LSP module loaded (may load after eval)
// wasm.error        — loading error, if any
// wasm.gnataEval    — evaluate an expression: gnataEval(expr, json) → string
// wasm.gnataCompile — compile an expression: gnataCompile(expr) → string
```

The eval WASM URLs (`evalWasmUrl`, `evalExecUrl`) are optional — omit them for editor-only mode (diagnostics, autocomplete, and hover without live evaluation).

The LSP WASM is also optional — if `lspWasmUrl` is omitted, editors work with syntax highlighting only (no diagnostics, autocomplete, or hover).

### `useJsonataEval(expression, inputJson, gnataEval, debounceMs?)`

Evaluates a JSONata expression against JSON input with debouncing and timing.

```tsx
const wasm = useJsonataWasm({ evalWasmUrl: '/gnata.wasm', evalExecUrl: '/wasm_exec.js' })
const { result, error, isSuccess, timing, timingMs, evaluate } =
  useJsonataEval(expression, inputJson, wasm.gnataEval)

// result    — evaluation result as a string
// error     — error message (null if success)
// isSuccess — whether evaluation succeeded
// timing    — human-readable evaluation time (e.g. "12ms")
// timingMs  — evaluation time in milliseconds
// evaluate  — manually trigger evaluation
```

The third argument is `wasm.gnataEval` (the eval function), not the full `wasm` object. Pass `null` if WASM has not loaded yet.

### `useJsonataSchema(inputJson)`

Builds an autocomplete schema from sample JSON data. Pass the result to `<JsonataEditor>` for field suggestions.

```tsx
const schema = useJsonataSchema(inputJson)
// Returns a Schema object describing the document structure
```

### `useJsonataEditor(options)`

Low-level hook — creates a CodeMirror 6 `EditorView` with the full extension stack. Use this for custom editor layouts.

```tsx
const containerRef = useRef<HTMLDivElement>(null)
const { view, getValue, setValue, setTheme } = useJsonataEditor({
  containerRef,
  initialDoc: '$sum(items.price)',
  onChange: (value) => setExpression(value),
  schema,
  gnataEval: wasm.gnataEval,
  gnataDiagnostics: wasm.gnataDiagnostics,
  gnataCompletions: wasm.gnataCompletions,
  gnataHover: wasm.gnataHover,
  theme: 'dark',
  getInputJson: () => inputJson,
})

return <div ref={containerRef} />
```

| Option | Type | Description |
|--------|------|-------------|
| `containerRef` | `RefObject<HTMLElement>` | Ref to the container element |
| `initialDoc` | `string` | Initial editor content |
| `placeholder` | `string` | Placeholder text |
| `onChange` | `(value: string) => void` | Content change callback |
| `onRun` | `() => void` | Cmd+Enter callback |
| `theme` | `'dark' \| 'light'` | Color theme |
| `themeOverrides` | `object` | Override specific theme tokens |
| `themeExtensions` | `Extension[]` | Replace built-in theme with custom extensions |
| `gnataEval` | `(expr, json) => string` | Eval function from WASM |
| `gnataDiagnostics` | `(doc) => string` | Diagnostics function from WASM |
| `gnataCompletions` | `(doc, pos, schema) => string` | Completions function from WASM |
| `gnataHover` | `(doc, pos, schema) => string \| null` | Hover function from WASM |
| `getInputJson` | `() => string` | Current input JSON for autocomplete |
| `schema` | `Schema` | Schema object for autocomplete |
| `lineNumbers` | `boolean` | Show line numbers |

**Returns:** `{ view: EditorView | null, getValue: () => string, setValue: (value: string) => void, setTheme: (theme: 'dark' | 'light') => void }`

### `useJsonataLsp(options)`

Convenience hook for editor-only mode — sets up LSP features (diagnostics, autocomplete, hover) without requiring an eval WASM module.

## Components

### `<JsonataPlayground>`

Full three-panel widget: expression editor + JSON input + result display.

```tsx
<JsonataPlayground
  defaultExpression="Account.Order.Product.Price"
  defaultInput={jsonString}
  wasmOptions={{
    evalWasmUrl: '/gnata.wasm',
    evalExecUrl: '/wasm_exec.js',
    lspWasmUrl: '/gnata-lsp.wasm',
    lspExecUrl: '/lsp-wasm_exec.js',
  }}
  theme="dark"
  height={500}
/>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `defaultExpression` | `string` | `''` | Initial expression |
| `defaultInput` | `string` | `'{}'` | Initial JSON input |
| `wasmOptions` | `UseJsonataWasmOptions` | — | Options passed to `useJsonataWasm` internally |
| `theme` | `'dark' \| 'light'` | `'dark'` | Color theme |
| `height` | `number` | `400` | Panel height in px |
| `className` | `string` | — | CSS class for the container |
| `style` | `CSSProperties` | — | Inline styles for the container |

### `<JsonataEditor>`

Expression editor with syntax highlighting, autocomplete, hover docs, and diagnostics.

```tsx
<JsonataEditor
  value={expression}
  onChange={setExpression}
  schema={schema}
  gnataEval={wasm.gnataEval}
  gnataDiagnostics={wasm.gnataDiagnostics}
  gnataCompletions={wasm.gnataCompletions}
  gnataHover={wasm.gnataHover}
  theme="dark"
  placeholder="e.g. Account.Order.Product.Price"
  getInputJson={() => inputJson}
/>
```

Individual WASM function props are passed instead of a `wasm` object — omit them for syntax-highlighting-only mode.

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
import { tokyoNightTheme, tooltipTheme, darkColors, lightColors } from '@gnata-sqlite/react'

// Use the built-in theme
const extensions = [tokyoNightTheme('dark')]

// Standalone tooltip styling
const tooltipExt = [tooltipTheme('dark')]

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
  tooltipTheme,          // Standalone tooltip styling extension
  formatHoverMarkdown,   // Format LSP hover markdown to HTML
  formatTiming,          // Format ms to human-readable timing
} from '@gnata-sqlite/react'
```

## WASM Files

The package does not bundle WASM files — serve them from the host application. Build from source:

```bash
# Eval module (standard Go WASM)
GOOS=js GOARCH=wasm go build -ldflags="-s -w" -trimpath -o gnata.wasm ./wasm/
cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" wasm_exec.js

# LSP module (TinyGo WASM — 85KB gzipped)
tinygo build -o gnata-lsp.wasm -no-debug -gc=conservative -target wasm ./editor/
cp "$(tinygo env TINYGOROOT)/targets/wasm_exec.js" lsp-wasm_exec.js
```

Serve all four files from the public/static directory.

## License

MIT
