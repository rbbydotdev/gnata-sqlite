//go:build !js

// Native LSP server for gnata JSONata language intelligence.
// Communicates via JSON-RPC 2.0 over stdin/stdout.
//
// Supports:
//   - textDocument/didOpen, textDocument/didChange → publish diagnostics
//   - textDocument/completion → schema-aware completions
//   - initialize, initialized, shutdown, exit
//
// Build:
//
//	go build -o gnata-lsp ./editor/
//
// Usage with VS Code (settings.json):
//
//	"jsonata.lsp.path": "/path/to/gnata-lsp"
//
// Usage with Neovim (lspconfig):
//
//	require("lspconfig.configs").jsonata = {
//	  default_config = {
//	    cmd = { "/path/to/gnata-lsp" },
//	    filetypes = { "jsonata" },
//	    root_dir = function() return vim.loop.cwd() end,
//	  },
//	}
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"sync"
)

// schema holds the JSON schema for completions, configurable via initialize params.
var schema string

// documents stores open document contents keyed by URI.
var (
	docsMu sync.Mutex
	docs   = make(map[string]string)
)

func main() {
	reader := bufio.NewReader(os.Stdin)
	for {
		msg, err := readMessage(reader)
		if err != nil {
			if err == io.EOF {
				os.Exit(0)
			}
			fmt.Fprintf(os.Stderr, "gnata-lsp: read error: %v\n", err)
			os.Exit(1)
		}
		handleMessage(msg)
	}
}

// --- JSON-RPC types ---

type jsonrpcMessage struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method,omitempty"`
	Params  json.RawMessage `json:"params,omitempty"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func isRequest(msg *jsonrpcMessage) bool {
	return msg.ID != nil && msg.Method != ""
}

func isNotification(msg *jsonrpcMessage) bool {
	return msg.ID == nil && msg.Method != ""
}

// --- Transport: LSP base protocol (Content-Length headers over stdio) ---

func readMessage(r *bufio.Reader) (*jsonrpcMessage, error) {
	contentLength := -1
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return nil, err
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			break // end of headers
		}
		if strings.HasPrefix(line, "Content-Length: ") {
			n, err := strconv.Atoi(strings.TrimPrefix(line, "Content-Length: "))
			if err != nil {
				return nil, fmt.Errorf("bad Content-Length: %w", err)
			}
			contentLength = n
		}
	}
	if contentLength < 0 {
		return nil, fmt.Errorf("missing Content-Length header")
	}

	body := make([]byte, contentLength)
	if _, err := io.ReadFull(r, body); err != nil {
		return nil, err
	}

	var msg jsonrpcMessage
	if err := json.Unmarshal(body, &msg); err != nil {
		return nil, err
	}
	return &msg, nil
}

func writeMessage(msg any) {
	body, err := json.Marshal(msg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gnata-lsp: marshal error: %v\n", err)
		return
	}
	header := fmt.Sprintf("Content-Length: %d\r\n\r\n", len(body))
	os.Stdout.WriteString(header)
	os.Stdout.Write(body)
}

func respond(id json.RawMessage, result any) {
	writeMessage(map[string]any{
		"jsonrpc": "2.0",
		"id":      id,
		"result":  result,
	})
}

func respondError(id json.RawMessage, code int, message string) {
	writeMessage(map[string]any{
		"jsonrpc": "2.0",
		"id":      id,
		"error":   map[string]any{"code": code, "message": message},
	})
}

func notify(method string, params any) {
	writeMessage(map[string]any{
		"jsonrpc": "2.0",
		"method":  method,
		"params":  params,
	})
}

// --- Method dispatch ---

func handleMessage(msg *jsonrpcMessage) {
	switch msg.Method {
	case "initialize":
		handleInitialize(msg)
	case "initialized":
		// no-op
	case "shutdown":
		respond(msg.ID, nil)
	case "exit":
		os.Exit(0)
	case "textDocument/didOpen":
		handleDidOpen(msg)
	case "textDocument/didChange":
		handleDidChange(msg)
	case "textDocument/completion":
		handleCompletion(msg)
	case "textDocument/hover":
		handleHover(msg)
	default:
		if isRequest(msg) {
			respondError(msg.ID, -32601, "method not found: "+msg.Method)
		}
	}
}

// --- initialize ---

func handleInitialize(msg *jsonrpcMessage) {
	// Extract schema from initializationOptions if provided.
	var params struct {
		InitializationOptions struct {
			Schema string `json:"schema"`
		} `json:"initializationOptions"`
	}
	if msg.Params != nil {
		json.Unmarshal(msg.Params, &params)
	}
	if params.InitializationOptions.Schema != "" {
		schema = params.InitializationOptions.Schema
	}

	respond(msg.ID, map[string]any{
		"capabilities": map[string]any{
			"textDocumentSync": map[string]any{
				"openClose": true,
				"change":    1, // Full document sync
			},
			"completionProvider": map[string]any{
				"triggerCharacters": []string{".", "$"},
			},
			"hoverProvider": true,
			"diagnosticProvider": map[string]any{
				"interFileDependencies": false,
				"workspaceDiagnostics":  false,
			},
		},
		"serverInfo": map[string]any{
			"name":    "gnata-lsp",
			"version": "0.1.0",
		},
	})
}

// --- textDocument/didOpen ---

type textDocumentItem struct {
	URI  string `json:"uri"`
	Text string `json:"text"`
}

func handleDidOpen(msg *jsonrpcMessage) {
	var params struct {
		TextDocument textDocumentItem `json:"textDocument"`
	}
	if err := json.Unmarshal(msg.Params, &params); err != nil {
		return
	}

	docsMu.Lock()
	docs[params.TextDocument.URI] = params.TextDocument.Text
	docsMu.Unlock()

	publishDiagnostics(params.TextDocument.URI, params.TextDocument.Text)
}

// --- textDocument/didChange ---

func handleDidChange(msg *jsonrpcMessage) {
	var params struct {
		TextDocument struct {
			URI string `json:"uri"`
		} `json:"textDocument"`
		ContentChanges []struct {
			Text string `json:"text"`
		} `json:"contentChanges"`
	}
	if err := json.Unmarshal(msg.Params, &params); err != nil {
		return
	}
	if len(params.ContentChanges) == 0 {
		return
	}

	text := params.ContentChanges[len(params.ContentChanges)-1].Text
	uri := params.TextDocument.URI

	docsMu.Lock()
	docs[uri] = text
	docsMu.Unlock()

	publishDiagnostics(uri, text)
}

// --- textDocument/completion ---

func handleCompletion(msg *jsonrpcMessage) {
	var params struct {
		TextDocument struct {
			URI string `json:"uri"`
		} `json:"textDocument"`
		Position struct {
			Line      int `json:"line"`
			Character int `json:"character"`
		} `json:"position"`
	}
	if err := json.Unmarshal(msg.Params, &params); err != nil {
		respondError(msg.ID, -32602, "invalid params")
		return
	}

	docsMu.Lock()
	text := docs[params.TextDocument.URI]
	docsMu.Unlock()

	// Convert line/character to byte offset.
	offset := positionToOffset(text, params.Position.Line, params.Position.Character)

	resultJSON := completions(text, offset, schema)

	// Parse the JSON array from our engine into LSP CompletionItem format.
	var items []map[string]any
	json.Unmarshal([]byte(resultJSON), &items)

	var lspItems []map[string]any
	for _, item := range items {
		lspItem := map[string]any{
			"label": item["label"],
		}
		if detail, ok := item["detail"]; ok {
			lspItem["detail"] = detail
		}
		// Map our type names to LSP CompletionItemKind.
		switch item["type"] {
		case "function":
			lspItem["kind"] = 3 // Function
		case "property", "number", "string", "object", "array", "boolean":
			lspItem["kind"] = 10 // Property
		case "keyword":
			lspItem["kind"] = 14 // Keyword
		default:
			lspItem["kind"] = 6 // Variable
		}
		lspItems = append(lspItems, lspItem)
	}

	respond(msg.ID, lspItems)
}

// --- Hover ---

func handleHover(msg *jsonrpcMessage) {
	var params struct {
		TextDocument struct {
			URI string `json:"uri"`
		} `json:"textDocument"`
		Position struct {
			Line      int `json:"line"`
			Character int `json:"character"`
		} `json:"position"`
	}
	if err := json.Unmarshal(msg.Params, &params); err != nil {
		respondError(msg.ID, -32602, "invalid params")
		return
	}

	docsMu.Lock()
	text := docs[params.TextDocument.URI]
	docsMu.Unlock()

	offset := positionToOffset(text, params.Position.Line, params.Position.Character)
	resultJSON := hover(text, offset, schema)

	if resultJSON == "" {
		respond(msg.ID, nil)
		return
	}

	// Parse our JSON format into LSP Hover response.
	var result struct {
		From int    `json:"from"`
		To   int    `json:"to"`
		Text string `json:"text"`
	}
	if err := json.Unmarshal([]byte(resultJSON), &result); err != nil {
		respond(msg.ID, nil)
		return
	}

	startLine, startChar := offsetToPosition(text, result.From)
	endLine, endChar := offsetToPosition(text, result.To)

	respond(msg.ID, map[string]any{
		"contents": map[string]any{
			"kind":  "markdown",
			"value": result.Text,
		},
		"range": map[string]any{
			"start": map[string]any{"line": startLine, "character": startChar},
			"end":   map[string]any{"line": endLine, "character": endChar},
		},
	})
}

// --- Diagnostics ---

func publishDiagnostics(uri, text string) {
	resultJSON := diagnostics(text)

	var items []struct {
		From     int    `json:"from"`
		To       int    `json:"to"`
		Severity string `json:"severity"`
		Message  string `json:"message"`
	}
	json.Unmarshal([]byte(resultJSON), &items)

	var lspDiags []map[string]any
	for _, item := range items {
		startLine, startChar := offsetToPosition(text, item.From)
		endLine, endChar := offsetToPosition(text, item.To)

		severity := 1 // Error
		if item.Severity == "warning" {
			severity = 2
		}

		lspDiags = append(lspDiags, map[string]any{
			"range": map[string]any{
				"start": map[string]any{"line": startLine, "character": startChar},
				"end":   map[string]any{"line": endLine, "character": endChar},
			},
			"severity": severity,
			"source":   "gnata",
			"message":  item.Message,
		})
	}

	if lspDiags == nil {
		lspDiags = []map[string]any{}
	}

	notify("textDocument/publishDiagnostics", map[string]any{
		"uri":         uri,
		"diagnostics": lspDiags,
	})
}

// --- Position helpers ---

// positionToOffset converts a line/character (0-based) to a byte offset.
func positionToOffset(text string, line, char int) int {
	offset := 0
	for l := 0; l < line && offset < len(text); l++ {
		idx := strings.IndexByte(text[offset:], '\n')
		if idx < 0 {
			return len(text)
		}
		offset += idx + 1
	}
	offset += char
	if offset > len(text) {
		offset = len(text)
	}
	return offset
}

// offsetToPosition converts a byte offset to a line/character pair (0-based).
func offsetToPosition(text string, offset int) (int, int) {
	if offset > len(text) {
		offset = len(text)
	}
	line, lastNewline := 0, -1
	for i := 0; i < offset; i++ {
		if text[i] == '\n' {
			line++
			lastNewline = i
		}
	}
	return line, offset - lastNewline - 1
}
