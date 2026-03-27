//go:build js && wasm

// Package main is the WebAssembly entry point for Gnata.
// Build with: GOOS=js GOARCH=wasm go build -ldflags="-s -w" -trimpath -o gnata.wasm ./wasm/
//
// The -s -w flags strip debug info; -trimpath removes local paths.
// When served with brotli or gzip the browser transfer size is ~1.2–1.4 MB.
//
// Raw WASM exports (registered on the JS global object with underscore prefix):
//
//	_gnataEval(expr, jsonData)            → string | Error
//	_gnataCompile(expr)                   → number | Error
//	_gnataEvalHandle(handle, jsonData)    → string | Error
//	_gnataReleaseHandle(handle)           → undefined | Error
//
// playground.html wraps these with a wrapWasm factory that converts returned
// Error values into thrown exceptions, exposing the public names without the
// underscore prefix. Consumers embedding this WASM outside the playground must
// implement their own wrapper or use the underscore names directly.
//
// Cache lifetime: exprCache (keyed by expression string) and compiledCache (keyed
// by handle) are intentionally unbounded for the playground use-case — sessions
// are short-lived and the expression universe is small. Call gnataReleaseHandle
// when a compiled handle is no longer needed to free the associated memory.
//
// Error handling: Go WASM's js.FuncOf does not reliably recover panics,
// so we return JS Error objects and let a thin JS wrapper throw them.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall/js"

	"github.com/rbbydotdev/gnata-sqlite"
)

var (
	compiledMu    sync.Mutex
	compiledCache = make(map[uint32]*gnata.Expression)
	nextHandle    uint32
	exprMu        sync.Mutex
	exprCache     = make(map[string]*gnata.Expression)
)

func main() {
	js.Global().Set("_gnataEval", js.FuncOf(jsEval))
	js.Global().Set("_gnataCompile", js.FuncOf(jsCompile))
	js.Global().Set("_gnataEvalHandle", js.FuncOf(jsEvalHandle))
	js.Global().Set("_gnataReleaseHandle", js.FuncOf(jsReleaseHandle))

	select {}
}

// jsEval: _gnataEval(expr, jsonData) → string | Error
func jsEval(_ js.Value, args []js.Value) any {
	if len(args) < 2 {
		return jsError("gnataEval requires 2 arguments: expr, jsonData")
	}
	result, err := doEval(args[0].String(), args[1].String())
	if err != nil {
		return jsError(err.Error())
	}
	return js.ValueOf(result)
}

// jsCompile: _gnataCompile(expr) → number | Error
func jsCompile(_ js.Value, args []js.Value) any {
	if len(args) < 1 {
		return jsError("gnataCompile requires 1 argument: expr")
	}
	handle, err := doCompile(args[0].String())
	if err != nil {
		return jsError(err.Error())
	}
	return js.ValueOf(handle)
}

// jsReleaseHandle: _gnataReleaseHandle(handle) → undefined | Error
func jsReleaseHandle(_ js.Value, args []js.Value) any {
	if len(args) < 1 {
		return jsError("gnataReleaseHandle requires 1 argument: handle")
	}
	if args[0].Type() != js.TypeNumber {
		return jsError("gnataReleaseHandle: handle must be a number")
	}
	h := uint32(args[0].Int())
	compiledMu.Lock()
	delete(compiledCache, h)
	compiledMu.Unlock()
	return js.Undefined()
}

// jsEvalHandle: _gnataEvalHandle(handle, jsonData) → string | Error
func jsEvalHandle(_ js.Value, args []js.Value) any {
	if len(args) < 2 {
		return jsError("gnataEvalHandle requires 2 arguments: handle, jsonData")
	}
	if args[0].Type() != js.TypeNumber {
		return jsError("gnataEvalHandle: handle must be a number")
	}
	result, err := doEvalHandle(uint32(args[0].Int()), args[1].String())
	if err != nil {
		return jsError(err.Error())
	}
	return js.ValueOf(result)
}

func doEval(expr, jsonData string) (result string, err error) {
	defer catchPanic(&err)

	exprMu.Lock()
	e, ok := exprCache[expr]
	exprMu.Unlock()
	if !ok {
		compiled, compileErr := gnata.Compile(expr)
		if compileErr != nil {
			return "", compileErr
		}
		exprMu.Lock()
		exprCache[expr] = compiled
		exprMu.Unlock()
		e = compiled
	}

	return evalAndMarshal(e, jsonData)
}

func doCompile(expr string) (handle int, err error) {
	defer catchPanic(&err)

	e, compileErr := gnata.Compile(expr)
	if compileErr != nil {
		return 0, compileErr
	}

	h := atomic.AddUint32(&nextHandle, 1)
	if h == 0 {
		// uint32 wrapped — 2^32 compile calls exhausted the handle space.
		return 0, fmt.Errorf("handle counter overflow: too many compiled expressions")
	}
	compiledMu.Lock()
	compiledCache[h] = e
	compiledMu.Unlock()
	return int(h), nil
}

func doEvalHandle(handle uint32, jsonData string) (result string, err error) {
	defer catchPanic(&err)

	compiledMu.Lock()
	e, ok := compiledCache[handle]
	compiledMu.Unlock()
	if !ok {
		return "", fmt.Errorf("unknown handle %d", handle)
	}

	return evalAndMarshal(e, jsonData)
}

// evalAndMarshal evaluates expr against jsonData and marshals the result to JSON.
// Uses gnata.DecodeJSON (streaming decoder) instead of json.Unmarshal, and
// marshalAny instead of json.Marshal, to avoid reflect — which TinyGo's
// encoding/json does not fully support.
func evalAndMarshal(e *gnata.Expression, jsonData string) (string, error) {
	var data any
	if jsonData != "" && jsonData != "null" {
		var err error
		data, err = gnata.DecodeJSON(json.RawMessage(jsonData))
		if err != nil {
			return "", fmt.Errorf("invalid JSON input: %w", err)
		}
	}

	res, err := e.Eval(context.Background(), data)
	if err != nil {
		return "", err
	}

	// Normalize internal types (OrderedMap → map, null sentinel → nil).
	res = gnata.NormalizeValue(res)

	var buf strings.Builder
	if err := marshalAny(&buf, res); err != nil {
		return "", fmt.Errorf("cannot marshal result: %w", err)
	}
	return buf.String(), nil
}

// marshalAny serializes a gnata result value to JSON without using reflect.
// After NormalizeValue, the only types are: nil, bool, float64, json.Number,
// string, []any, and map[string]any.
func marshalAny(buf *strings.Builder, v any) error {
	switch val := v.(type) {
	case nil:
		buf.WriteString("null")
	case bool:
		if val {
			buf.WriteString("true")
		} else {
			buf.WriteString("false")
		}
	case float64:
		if math.IsInf(val, 0) || math.IsNaN(val) {
			return fmt.Errorf("unsupported float value: %v", val)
		}
		buf.WriteString(strconv.FormatFloat(val, 'f', -1, 64))
	case json.Number:
		buf.WriteString(string(val))
	case string:
		marshalString(buf, val)
	case []any:
		buf.WriteByte('[')
		for i, elem := range val {
			if i > 0 {
				buf.WriteByte(',')
			}
			if err := marshalAny(buf, elem); err != nil {
				return err
			}
		}
		buf.WriteByte(']')
	case map[string]any:
		buf.WriteByte('{')
		first := true
		for k, mv := range val {
			if !first {
				buf.WriteByte(',')
			}
			first = false
			marshalString(buf, k)
			buf.WriteByte(':')
			if err := marshalAny(buf, mv); err != nil {
				return err
			}
		}
		buf.WriteByte('}')
	default:
		return fmt.Errorf("unsupported type: %T", v)
	}
	return nil
}

// marshalString writes a JSON-escaped string to buf.
func marshalString(buf *strings.Builder, s string) {
	buf.WriteByte('"')
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch c {
		case '"':
			buf.WriteString(`\"`)
		case '\\':
			buf.WriteString(`\\`)
		case '\n':
			buf.WriteString(`\n`)
		case '\r':
			buf.WriteString(`\r`)
		case '\t':
			buf.WriteString(`\t`)
		default:
			if c < 0x20 {
				buf.WriteString(fmt.Sprintf(`\u%04x`, c))
			} else {
				buf.WriteByte(c)
			}
		}
	}
	buf.WriteByte('"')
}

// catchPanic recovers from any panic and stores it as an error.
// Unlike gnata's unexported recoverEvalPanic (which maps *evaluator.JSONataError
// to a structured error for internal use), this function surfaces all panics
// uniformly as "internal error: …" strings. The full error detail is intentional
// for the developer playground context; strip the message before the JS boundary
// if this WASM module is ever embedded in an end-user-facing product.
func catchPanic(errp *error) {
	if r := recover(); r != nil {
		switch v := r.(type) {
		case error:
			*errp = fmt.Errorf("internal error: %w", v)
		default:
			*errp = fmt.Errorf("internal error: %v", r)
		}
	}
}

// jsError creates a JavaScript Error object without panicking.
func jsError(msg string) js.Value {
	return js.Global().Get("Error").New(msg)
}
