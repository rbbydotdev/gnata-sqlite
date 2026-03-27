# gnata-sqlite

A full [JSONata 2.x](https://jsonata.org) implementation in Go with SQLite integration, editor tooling, and query optimization.

## Fork Notice

Forked from [RecoLabs/gnata](https://github.com/RecoLabs/gnata), which provides a production-grade JSONata 2.x engine in pure Go. This project extends the core engine with a loadable SQLite extension, a CodeMirror 6 editor with TinyGo WASM LSP, and a query planner that decomposes JSONata into streaming SQL-friendly operations.

## Packages

| Package | Description | Docs |
|---------|-------------|------|
| `gnata` (root) | Core JSONata 2.x engine -- full spec, two-tier eval, streaming | [Core features below](#core-engine) |
| `sqlite/` | SQLite extension -- `jsonata()`, `jsonata_query()`, `jsonata_each()`, mutations | [sqlite/README.md](sqlite/README.md) |
| `editor/` | CodeMirror 6 language support + TinyGo WASM LSP | [editor/README.md](editor/README.md) |

## Core Engine

The root package implements the full JSONata 2.x specification in pure Go:

- **Full JSONata 2.x** -- paths, wildcards, lambdas, closures, higher-order functions, 50+ stdlib functions
- **Two-tier evaluation** -- GJSON fast path for simple expressions, full AST interpreter for complex ones
- **Lock-free `StreamEvaluator`** -- batch evaluation with schema-keyed plan caching for high-throughput workloads
- **1,778 test cases** from the official jsonata-js conformance suite (0 failures, 0 skips)

```go
import "github.com/rbbydotdev/gnata-sqlite"

expr, _ := gnata.Compile(`Account.Order.Product.Price`)
result, _ := expr.Eval(context.Background(), data)
fmt.Println(result) // [34.45 21.67]
```

## SQLite Extension

A loadable SQLite extension that brings JSONata expressions into SQL queries. Query, transform, and aggregate JSON data directly from SQLite.

```sql
.load ./gnata_jsonata sqlite3_jsonata_init

SELECT jsonata(data, 'Account.Name') FROM events;
-- "Firefly"

SELECT jsonata_query('$sum(amount)', data) FROM orders;
-- 4250
```

Key functions:

- `jsonata(json, expr)` -- evaluate a JSONata expression against a JSON value
- `jsonata_query(expr, json)` -- same operation, expression-first argument order
- `jsonata_each(expr, json)` -- expand results into rows (table-valued function)
- `jsonata_set(json, path, value)` -- set a value at a path
- `jsonata_delete(json, path)` -- delete a value at a path

The built-in query planner decomposes JSONata expressions into streaming SQL-friendly operations for better performance on large datasets. See [sqlite/OPTIMIZATION.md](sqlite/OPTIMIZATION.md) and [sqlite/BLOGPOST.md](sqlite/BLOGPOST.md) for details.

See [sqlite/README.md](sqlite/README.md) for full documentation.

## Editor / LSP

CodeMirror 6 language support and LSP server for JSONata, powered by gnata's parser.

- **TinyGo WASM LSP** -- 182 KB module (85 KB gzipped) for in-browser diagnostics and autocomplete
- **CodeMirror 6 npm package** -- `@gnata/codemirror` with syntax highlighting, error diagnostics, context-aware autocomplete, and hover documentation
- **Native LSP server** -- stdio JSON-RPC for VS Code, Neovim, and other editors

See [editor/README.md](editor/README.md) for full documentation.

## Building

```bash
# Core library (pure Go)
go build ./...

# SQLite extension (requires CGo)
go build -buildmode=c-shared -o gnata_jsonata.dylib ./sqlite

# WASM LSP (requires TinyGo)
tinygo build -o gnata-lsp.wasm -target wasm ./editor

# CodeMirror npm package
cd editor/codemirror && npm install && npm run build
```

## Playground

Open `playground.html` for interactive testing of JSONata expressions and the SQLite extension in the browser.

## License

MIT. Based on [RecoLabs/gnata](https://github.com/RecoLabs/gnata).
