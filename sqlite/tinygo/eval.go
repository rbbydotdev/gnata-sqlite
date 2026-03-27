// Package main is the TinyGo entry point for the gnata SQLite extension.
// It exports a single C-callable function that evaluates a JSONata expression.
// Build: tinygo build -buildmode=c-shared -no-debug -o libgnata.dylib ./sqlite/tinygo/
package main

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"unsafe"

	"github.com/rbbydotdev/gnata-sqlite"
)

// Expression cache — same pattern as the WASM module.
var (
	exprMu    sync.Mutex
	exprCache = make(map[string]*gnata.Expression)
)

func getCachedExpr(expr string) (*gnata.Expression, error) {
	exprMu.Lock()
	e, ok := exprCache[expr]
	exprMu.Unlock()
	if ok {
		return e, nil
	}
	compiled, err := gnata.Compile(expr)
	if err != nil {
		return nil, err
	}
	exprMu.Lock()
	exprCache[expr] = compiled
	exprMu.Unlock()
	return compiled, nil
}

// resultBuf holds the last result/error string.
// Valid until the next call to gnata_eval. This is safe because SQLite
// calls scalar functions synchronously and copies results immediately.
var resultBuf string

// gnata_eval evaluates a JSONata expression against JSON data.
//
// Returns:
//
//	0 = success, result in *outPtr/*outLen
//	1 = null/undefined result
//	2 = error, message in *outPtr/*outLen
//
//export gnata_eval
func gnata_eval(
	exprPtr *byte, exprLen int32,
	dataPtr *byte, dataLen int32,
	outPtr **byte, outLen *int32,
) int32 {
	expr := ptrToString(exprPtr, exprLen)
	data := ptrToString(dataPtr, dataLen)

	compiled, err := getCachedExpr(expr)
	if err != nil {
		return setOut(outPtr, outLen, err.Error(), 2)
	}

	result, err := compiled.EvalBytes(context.Background(), json.RawMessage(data))
	if err != nil {
		return setOut(outPtr, outLen, err.Error(), 2)
	}

	result = gnata.NormalizeValue(result)
	if result == nil {
		return 1 // null
	}

	resultBuf = marshalResult(result)
	*outPtr = unsafe.StringData(resultBuf)
	*outLen = int32(len(resultBuf))
	return 0
}

func setOut(outPtr **byte, outLen *int32, s string, code int32) int32 {
	resultBuf = s
	*outPtr = unsafe.StringData(resultBuf)
	*outLen = int32(len(resultBuf))
	return code
}

func ptrToString(ptr *byte, length int32) string {
	if ptr == nil || length == 0 {
		return ""
	}
	return unsafe.String(ptr, int(length))
}

// marshalResult converts a normalized gnata value to a JSON string.
// Uses the same reflect-free approach as the WASM module.
func marshalResult(v any) string {
	switch val := v.(type) {
	case bool:
		if val {
			return "true"
		}
		return "false"
	case float64:
		var buf strings.Builder
		marshalFloat(&buf, val)
		return buf.String()
	case json.Number:
		return string(val)
	case string:
		var buf strings.Builder
		marshalString(&buf, val)
		return buf.String()
	case []any, map[string]any:
		var buf strings.Builder
		marshalAny(&buf, val)
		return buf.String()
	}
	return "null"
}

func main() {}
