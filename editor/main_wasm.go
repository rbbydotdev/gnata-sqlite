//go:build js && wasm

// TinyGo WASM entry point for gnata language intelligence.
// Exports functions for parsing, diagnostics, and autocompletion
// intended for use with CodeMirror in the browser.
//
// Build:
//
//	GOOS=js GOARCH=wasm tinygo build -o gnata-lsp.wasm -no-debug -gc=conservative ./editor/
package main

import (
	"strings"
	"syscall/js"

	"github.com/rbbydotdev/gnata-sqlite/internal/parser"
)

func main() {
	js.Global().Set("_gnataParse", js.FuncOf(jsParse))
	js.Global().Set("_gnataDiagnostics", js.FuncOf(jsDiagnostics))
	js.Global().Set("_gnataCompletions", js.FuncOf(jsCompletions))
	js.Global().Set("_gnataHover", js.FuncOf(jsHover))

	// Block forever — required for Go WASM modules.
	select {}
}

// jsParse parses a JSONata expression and returns the AST as JSON.
// JS: _gnataParse(expr: string) → string (JSON AST) | Error
func jsParse(this js.Value, args []js.Value) any {
	if len(args) < 1 {
		return js.Global().Get("Error").New("_gnataParse requires 1 argument: expr")
	}
	expr := args[0].String()

	p := parser.NewParser(expr)
	node, err := p.Parse()
	if err != nil {
		return js.Global().Get("Error").New(err.Error())
	}

	node, err = parser.ProcessAST(node)
	if err != nil {
		return js.Global().Get("Error").New(err.Error())
	}

	var b strings.Builder
	marshalNode(node, &b)
	return b.String()
}

// jsDiagnostics parses an expression and returns CodeMirror-compatible diagnostics as JSON.
// JS: _gnataDiagnostics(expr: string) → string (JSON array of diagnostics)
func jsDiagnostics(this js.Value, args []js.Value) any {
	if len(args) < 1 {
		return js.Global().Get("Error").New("_gnataDiagnostics requires 1 argument: expr")
	}
	return diagnostics(args[0].String())
}

// jsCompletions returns completion items for the given expression, cursor position, and schema.
// JS: _gnataCompletions(expr: string, cursorPos: number, schemaJSON: string) → string (JSON array)
func jsCompletions(this js.Value, args []js.Value) any {
	if len(args) < 3 {
		return js.Global().Get("Error").New("_gnataCompletions requires 3 arguments: expr, cursorPos, schemaJSON")
	}
	expr := args[0].String()
	cursorPos := args[1].Int()
	schemaJSON := args[2].String()

	return completions(expr, cursorPos, schemaJSON)
}

// jsHover returns hover information for the token at the given cursor position.
// JS: _gnataHover(expr: string, cursorPos: number, schemaJSON?: string) → string (JSON) | ""
func jsHover(this js.Value, args []js.Value) any {
	if len(args) < 2 {
		return js.Global().Get("Error").New("_gnataHover requires 2 arguments: expr, cursorPos")
	}
	var schemaJSON string
	if len(args) >= 3 {
		schemaJSON = args[2].String()
	}
	return hover(args[0].String(), args[1].Int(), schemaJSON)
}
