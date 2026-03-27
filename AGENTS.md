# AGENTS.md

This file provides guidance to AI agents (Claude Code, GitHub Copilot, Cursor, etc.) when working with code in this repository.

## Project Overview

gnata-sqlite is a fork of [RecoLabs/gnata](https://github.com/RecoLabs/gnata) — a full JSONata 2.x implementation in Go. This fork extends it with:

- **SQLite C extension** (`sqlite/`) — registers `jsonata()`, `jsonata_query()`, and `jsonata_each` as SQL functions/virtual tables via CGo
- **Query planner** (`internal/planner/`) — decomposes JSONata expressions for streaming SQL aggregation
- **Editor/LSP** (`editor/`) — language server and WASM entry point for browser-based editing
- **CodeMirror plugin** (`editor/codemirror/`) — TypeScript CodeMirror 6 language support

Module path: `github.com/rbbydotdev/gnata-sqlite`

## Package Map

| Package | Purpose |
|---------|---------|
| Root (`gnata`) | Core JSONata 2.x engine — lexer, parser, evaluator, streaming. Entry points: `gnata.go`, `stream.go` |
| `functions/` | 55+ built-in JSONata functions (string, array, numeric, datetime, etc.). Registered via `functions.RegisterAll` |
| `internal/evaluator/` | AST evaluation dispatch — binary ops, functions, chains, transforms. One file per eval category (`eval_binary.go`, `eval_function.go`, `eval_chain.go`, etc.) |
| `internal/parser/` | Pratt parser, AST nodes, fast-path analysis (`parser.AnalyzeFastPath`) |
| `internal/lexer/` | Tokenizer for JSONata expression strings |
| `internal/planner/` | Query planner — decomposes JSONata for streaming SQL aggregation. Extracts paths, predicates, accumulators |
| `sqlite/` | SQLite C extension via CGo — registers `jsonata()`, `jsonata_query()`, `jsonata_each` virtual table. Routes aggregates through planner |
| `sqlite/tinygo/` | TinyGo-compatible eval subset for WASM builds |
| `sqlite/benchmarks/` | SQL benchmark files for SQLite extension performance testing |
| `editor/` | LSP server (native) + TinyGo WASM entry point — completions, hover, diagnostics via JSON-RPC 2.0 over stdin/stdout |
| `editor/codemirror/` | npm package — CodeMirror 6 language support (TypeScript) |
| `wasm/` | WASM entry point for browser playground. Exports `gnataEval`, `gnataCompile`, `gnataEvalHandle` |

## Development Commands

```sh
# Run all tests (includes CGo sqlite tests)
go test ./...

# Run tests excluding sqlite (no CGo needed)
go test $(go list ./... | grep -v sqlite)

# Lint
golangci-lint run

# Build sqlite extension (macOS)
go build -buildmode=c-shared -o gnata_jsonata.dylib ./sqlite

# Build sqlite extension (Linux)
go build -buildmode=c-shared -o gnata_jsonata.so ./sqlite

# Build WASM LSP
tinygo build -o gnata-lsp.wasm -target wasm ./editor

# Build WASM playground
GOOS=js GOARCH=wasm go build -ldflags="-s -w" -trimpath -o gnata.wasm ./wasm

# Build CodeMirror package
cd editor/codemirror && npm install && npm run build

# Build native LSP server
go build -o gnata-lsp ./editor/

# Run benchmarks
go test -bench=. -benchmem
```

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on push/PR to `main`:
- `go test -race -count=1 ./...`
- `golangci-lint` via `golangci/golangci-lint-action@v9`

## Architecture

### Compilation Pipeline

Lexer -> Parser -> AST Processing -> Fast-Path Analysis -> Expression

1. **Lexer** (`internal/lexer/`) — Tokenizes JSONata expression strings
2. **Parser** (`internal/parser/`) — Pratt (top-down operator precedence) parser producing AST nodes
3. **AST Processing** (`parser.ProcessAST`) — Normalizes and optimizes the AST
4. **Fast-Path Analysis** (`parser.AnalyzeFastPath`) — Classifies expressions into:
   - Pure-path fast path (e.g., `Account.Name`) — uses GJSON zero-copy
   - Comparison fast path (e.g., `a.b = "x"`) — zero allocations
   - Function fast path (e.g., `$exists(a.b)`) — direct GJSON evaluation
   - Full AST evaluation required

### Two-Tier Evaluation

- `Eval(ctx, any)` — Evaluate against pre-parsed Go values via full AST walk
- `EvalBytes(ctx, json.RawMessage)` — Fast-path expressions use GJSON directly on raw JSON bytes; full-path falls back to unmarshal + Eval

### StreamEvaluator (`stream.go`)

Batch-evaluates multiple expressions against events. Schema-keyed `GroupPlan` caching deduplicates field extraction across expressions. Lock-free reads via `atomic.Pointer` snapshot; writes serialized by `sync.Mutex`. Single JSON scan per event via `gjson.GetManyBytes`.

### Query Planner (`internal/planner/`)

Decomposes JSONata expressions into `QueryPlan` for SQL streaming aggregation. Each plan contains:
- `Accumulators` — fed per row via `StepBatch` (single GJSON scan per row)
- `FinalExpr` — evaluated once at finalization
- `Predicates` — deduplicated, evaluated once per row; accumulators reference by index
- Used by `jsonata_query()` SQL aggregate function in the SQLite extension

### SQLite Bridge (`sqlite/`)

CGo extension that registers SQL functions with SQLite:
- `jsonata(expr, json [, bindings])` — scalar function, evaluates JSONata expression against JSON
- `jsonata_query(expr, json)` — aggregate function, routes through query planner for streaming aggregation
- `jsonata_each` — virtual table for iterating JSONata results as rows
- Entry point: `extension.go` with C bridge in `bridge.c` / `bridge.h`

### Editor/LSP (`editor/`)

Shared Go code compiled to either:
- Native LSP server (`main_lsp.go`, build tag `!js`) — JSON-RPC 2.0 over stdin/stdout
- TinyGo WASM (`main_wasm.go`, build tag `js`) — for browser integration

Supports: `textDocument/didOpen`, `textDocument/didChange` (diagnostics), `textDocument/completion` (schema-aware)

### Evaluator Dispatch (`internal/evaluator/`)

`evaluator.Eval(node, input, env)` dispatches by `node.Type`. Each eval category is in its own file:
- `eval_binary.go` — Binary operators, subscripts, filtering
- `eval_function.go` — Function calls, lambdas, partial application
- `eval_chain.go` — Path chaining, pipes, blocks, conditions
- `eval_sort.go` — Sorting with generic `SortItemsErr[T any]` helper
- `eval_transform.go` — JSONata transform operator (`|obj|updates|deletes|` syntax)
- `eval_group.go` — Group-by reduction (`{key: val}` syntax)
- `eval_range.go` — Range operator (`[start..end]`)
- `eval_regex.go` — Regex compilation and matching
- `eval_unary.go` — Unary operators (negation, array constructor)

### Fast-Path Byte Evaluation (`func_fast.go`)

Dispatch-map of `funcFastHandlers` maps each `FuncFastKind` to a standalone handler function (e.g., `evalFuncContains`, `evalFuncString`). Each handler operates directly on `gjson.Result` for zero-copy evaluation.

## Key Types

| Type | File | Description |
|------|------|-------------|
| `gnata.Expression` | `gnata.go` | Compiled, goroutine-safe JSONata expression with fast-path metadata |
| `gnata.StreamEvaluator` | `stream.go` | Batch evaluator with copy-on-write expression slice + `BoundedCache` for schema plans |
| `evaluator.Environment` | `internal/evaluator/env.go` | Lexical scope chain for variable bindings and function registry |
| `parser.Node` | `internal/parser/node.go` | AST node types |
| `planner.QueryPlan` | `internal/planner/planner.go` | Compiled execution plan for `jsonata_query` aggregate |
| `BoundedCache` | `bounded_cache.go` | Lock-free FIFO ring-buffer cache (atomic pointer reads) |
| `OrderedMap` | `internal/evaluator/ordered_map.go` | Insertion-ordered map preserving JSON field order |

## Testing

- Tests use separate `_test` packages (`gnata_test`, `lexer_test`, `parser_test`)
- `testdata/groups/` contains 100+ test case groups ported from the jsonata-js official suite
- `testdata/datasets/` contains JSON test fixtures
- `suite_test.go` loads 1,200+ JSON test cases — each `.json` file has `expr`, `dataset`, `bindings`, and `result` fields
- Key test files: `gnata_test.go`, `stream_test.go`, `func_fast_test.go`, `evaluator_test.go`, `suite_test.go`, `lexer_test.go`, `parser_test.go`, `analysis_test.go`
- SQLite benchmarks: `sqlite/benchmarks/*.sql`
- CI runs tests with `-race` flag

## Dependencies

Only one direct dependency (pure Go, no CGo for core):
- `tidwall/gjson` — Zero-copy JSON field extraction for fast-path byte-level evaluation

The `sqlite/` package requires CGo (links against SQLite via `sqlite3ext.h`). Regex uses Go's standard `regexp` package.

## Custom Functions

Register custom functions via `StreamEvaluator` options or standalone `CustomEnv`:
```go
customFuncs := map[string]gnata.CustomFunc{
    "md5": func(args []any, focus any) (any, error) { ... },
}
se := gnata.NewStreamEvaluator(nil, gnata.WithCustomFunctions(customFuncs))
```
