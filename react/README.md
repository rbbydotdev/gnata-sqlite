# @gnata-sqlite/react

React components and hooks for JSONata editors — syntax highlighting, autocomplete, hover docs, and live evaluation.

## Install

```bash
npm install @gnata-sqlite/react
```

Copy the bundled WASM files into your public directory:

```bash
npx @gnata-sqlite/react
```

Peer dependencies: `react >=18`, `react-dom >=18`.

## Quick Start

Drop in a full JSONata playground with one component:

```tsx
import { JsonataPlayground } from '@gnata-sqlite/react'
import '@gnata-sqlite/react/tooltips.css'

function App() {
  return (
    <JsonataPlayground
      defaultExpression="$sum(Account.Order.Product.(Price * Quantity))"
      defaultInput={sampleJson}
      theme="dark"
      height={500}
    />
  )
}
```

The playground handles WASM loading, expression editing, JSON input, and result display.

## Components

Use individual components for custom layouts:

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

Omit the WASM function props for syntax-highlighting-only mode. When typing after `.`, the editor evaluates the prefix expression against the input data to discover available keys — type `Account.Order.` and it suggests `Product`, `OrderID`, etc.

### `<JsonataInput>`

JSON input editor with syntax highlighting.

```tsx
<JsonataInput value={inputJson} onChange={setInputJson} theme="dark" />
```

### `<JsonataResult>`

Read-only result display. Green on success, red on error.

```tsx
<JsonataResult value={result} error={error} timing={timing} theme="dark" />
```

### `<JsonataPlayground>`

Composes all three components above into a three-panel widget. Manages WASM loading internally.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `defaultExpression` | `string` | `''` | Initial expression |
| `defaultInput` | `string` | `'{}'` | Initial JSON input |
| `wasmOptions` | `UseJsonataWasmOptions` | — | Override WASM URLs if needed |
| `theme` | `'dark' \| 'light'` | `'dark'` | Color theme |
| `height` | `number` | `400` | Panel height in px |
| `className` | `string` | — | CSS class for the container |
| `style` | `CSSProperties` | — | Inline styles |

## Hooks

For full control, use the hooks directly. Each component above is built from these.

### `useJsonataWasm(options)`

Loads and manages the WASM modules. Call once at the top of the app.

```tsx
const wasm = useJsonataWasm({
  lspWasmUrl: '/gnata-lsp.wasm',
  lspExecUrl: '/lsp-wasm_exec.js',
  evalWasmUrl: '/gnata.wasm',       // optional — for live evaluation
  evalExecUrl: '/wasm_exec.js',     // optional — for live evaluation
})
```

Returns `{ isReady, isLspReady, error, gnataEval, gnataCompile, gnataDiagnostics, gnataCompletions, gnataHover }`.

The eval WASM is optional — omit it for editor-only mode (diagnostics, autocomplete, hover without live evaluation). The LSP WASM is also optional — omit it for syntax highlighting only.

### `useJsonataEval(expression, inputJson, gnataEval, debounceMs?)`

Evaluates a JSONata expression against JSON input with debouncing and timing.

```tsx
const { result, error, isSuccess, timing, timingMs, evaluate } =
  useJsonataEval(expression, inputJson, wasm.gnataEval)
```

### `useJsonataSchema(inputJson)`

Builds an autocomplete schema from sample JSON data. Pass the result to `<JsonataEditor>` for field suggestions.

```tsx
const schema = useJsonataSchema(inputJson)
```

### `useJsonataLsp(options)`

Editor-only mode — sets up LSP features (diagnostics, autocomplete, hover) without the eval WASM module. Use this when evaluation runs on the backend.

### `useJsonataEditor(options)`

Low-level hook — creates a CodeMirror 6 `EditorView` with the full extension stack. Use this for custom editor layouts where the `<JsonataEditor>` component doesn't fit.

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

## Theming

All components use the Tokyo Night color scheme by default (dark and light).

```tsx
import { tokyoNightTheme, darkColors, lightColors } from '@gnata-sqlite/react'
```

| Token | Dark | Light |
|-------|------|-------|
| `bg` | `#1a1b26` | `#d5d6db` |
| `surface` | `#1f2335` | `#e1e2e7` |
| `text` | `#a9b1d6` | `#3760bf` |
| `accent` | `#7aa2f7` | `#2e7de9` |
| `green` | `#9ece6a` | `#587539` |
| `error` | `#f7768e` | `#c64343` |

## Utilities

```tsx
import {
  buildSchema,           // Build a schema from JSON data for autocomplete
  jsonataStreamLanguage,  // CodeMirror StreamLanguage for JSONata
  tooltipTheme,          // Standalone tooltip styling extension
  formatHoverMarkdown,   // Format LSP hover markdown to HTML
  formatTiming,          // Format ms to human-readable timing
} from '@gnata-sqlite/react'
```

## License

MIT
