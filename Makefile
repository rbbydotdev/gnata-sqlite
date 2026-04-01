.PHONY: all build test wasm extension editor playground website clean publish

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
	# -gc=leaking ?
	tinygo build -o gnata-lsp.wasm -no-debug -gc=conservative -target wasm ./editor/
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

# Build and publish npm packages
publish: editor react
	cd editor/codemirror && npm publish
	cd react && npm publish

# Clean build artifacts
clean:
	rm -f gnata_jsonata.dylib gnata_jsonata.so gnata_jsonata.h
	rm -f gnata.wasm gnata-lsp.wasm wasm_exec.js lsp-wasm_exec.js
	rm -rf react/dist editor/codemirror/dist website/out
