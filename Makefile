.PHONY: all build test wasm extension editor playground website clean publish bench bench-quick

# Build everything
all: extension wasm editor

# Go library
build:
	go build ./...

# Run all tests
test:
	go test -race -count=1 ./...
	cd react && pnpm test
	cd playground && pnpm test

# Run e2e tests (requires WASM built + playground dev server)
test-e2e: wasm
	cd playground && npx playwright test

# SQLite extension (.dylib on macOS, .so on Linux)
extension:
	CGO_ENABLED=1 go build -buildmode=c-shared -ldflags="-s -w" -trimpath \
		-o gnata_jsonata$(if $(findstring Darwin,$(shell uname)),.dylib,.so) ./sqlite/

# WASM modules (eval + LSP)
wasm:
	GOOS=js GOARCH=wasm go build -ldflags="-s -w" -trimpath -o gnata.wasm ./wasm/
	cp "$$(go env GOROOT)/lib/wasm/wasm_exec.js" wasm_exec.js
	tinygo build -o gnata-lsp.wasm -no-debug -gc=conservative -scheduler=none -panic=trap -target wasm ./editor/
	wasm-opt -Oz --enable-bulk-memory gnata-lsp.wasm -o gnata-lsp.wasm
	cp "$$(tinygo env TINYGOROOT)/targets/wasm_exec.js" lsp-wasm_exec.js

# CodeMirror npm package
editor:
	cd editor/codemirror && pnpm install && pnpm run build

# React widget
react:
	cd react && pnpm install && pnpm run build

# Playground (dev server)
playground: wasm
	cp gnata.wasm gnata-lsp.wasm wasm_exec.js lsp-wasm_exec.js playground/public/
	cd playground && pnpm install && pnpm dev

# Website (dev server)
website:
	cp gnata.wasm gnata-lsp.wasm wasm_exec.js lsp-wasm_exec.js website/public/
	cd website && pnpm install && pnpm dev

# Website static build
website-build:
	cd website && pnpm build

# Install all workspace dependencies
install:
	pnpm install

# Stage WASM assets into the react package for distribution
# Depends on wasm target; skip with `make stage-wasm-only` if files already exist.
stage-wasm: wasm
	cp gnata-lsp.wasm lsp-wasm_exec.js react/wasm/

stage-wasm-only:
	cp gnata-lsp.wasm lsp-wasm_exec.js react/wasm/

# Build and publish npm packages
publish: editor react stage-wasm
	cd editor/codemirror && npm publish
	cd react && npm publish

# Bump version across all packages (usage: make bump v=0.2.0)
bump:
	@if [ -z "$(v)" ]; then echo "Usage: make bump v=0.2.0"; exit 1; fi
	cd editor/codemirror && npm version $(v) --no-git-tag-version
	cd react && npm version $(v) --no-git-tag-version
	@echo "Bumped all packages to $(v)"

# Run benchmarks (requires extension to be built)
bench: extension
	cd benchmarks && pnpm install && pnpm run bench
	cp benchmarks/results/benchmark-results.json website/public/benchmark-results.json

# Quick benchmark (1 iteration, for development)
bench-quick: extension
	cd benchmarks && pnpm install && pnpm run bench:quick
	cp benchmarks/results/benchmark-results.json website/public/benchmark-results.json

# Clean build artifacts
clean:
	rm -f gnata_jsonata.dylib gnata_jsonata.so gnata_jsonata.h
	rm -f gnata.wasm gnata-lsp.wasm wasm_exec.js lsp-wasm_exec.js
	rm -rf react/dist editor/codemirror/dist website/out
