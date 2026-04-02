# Contributing

## Development Setup

```bash
git clone git@github.com:rbbydotdev/gnata-sqlite.git
cd gnata-sqlite
go build ./...
go test -race ./...
```

### Optional: SQLite Extension

Requires CGo:

```bash
go build -buildmode=c-shared -o gnata_jsonata.dylib ./sqlite
```

### Optional: WASM LSP

Requires [TinyGo](https://tinygo.org):

```bash
tinygo build -o gnata-lsp.wasm -no-debug -gc=conservative -scheduler=none -panic=trap -target wasm ./editor/
wasm-opt -Oz --enable-bulk-memory gnata-lsp.wasm -o gnata-lsp.wasm
```

### Optional: CodeMirror Package

```bash
cd editor/codemirror && npm install && npm run build
```

## Project Structure

| Directory | Purpose |
|-----------|---------|
| Root `.go` files | Core JSONata 2.x engine (parser, evaluator, streaming) |
| `functions/` | 50+ stdlib function implementations |
| `internal/` | Lexer, parser, evaluator, query planner internals |
| `sqlite/` | Loadable SQLite extension (CGo) |
| `editor/` | CodeMirror 6 language support + WASM LSP |
| `wasm/` | WASM build entry point |
| `testdata/` | JSONata conformance test suite (1,778 cases) |

## Making Changes

1. Fork the repo
2. Create a branch (`git checkout -b feat/my-feature`)
3. Make changes and add tests
4. Run `go test -race ./...`
5. Run `golangci-lint run` if you have it installed
6. Commit with a descriptive message
7. Open a PR

## Code Style

- Follow standard Go conventions (`gofmt`, `go vet`)
- Linting config is in `.golangci.yaml`
- Tests live alongside the code they test (`*_test.go`)
- Conformance tests use JSON datasets in `testdata/`
