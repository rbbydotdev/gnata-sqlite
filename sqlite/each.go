package main

/*
#include "bridge.h"
*/
import "C"

import (
	"encoding/json"
	"math"
	"sync"
	"unsafe"

	"github.com/rbbydotdev/gnata-sqlite"
)

// ── cursor state ────────────────────────────────────────────────────────────

type eachElement struct {
	value any
	key   any    // int64 for array index, string for object key, nil for scalar
	typ   string // "null", "true", "false", "integer", "real", "text", "array", "object"
}

type eachCursorState struct {
	elements []eachElement
	index    int
}

var (
	eachMu      sync.Mutex
	eachCursors = make(map[int64]*eachCursorState)
	eachNextID  int64
)

// ── Go exports called from C vtab trampolines ──────────────────────────────

//export goEachNewCursor
func goEachNewCursor() C.sqlite3_int64 {
	eachMu.Lock()
	eachNextID++
	id := eachNextID
	eachCursors[id] = &eachCursorState{}
	eachMu.Unlock()
	return C.sqlite3_int64(id)
}

//export goEachFreeCursor
func goEachFreeCursor(cursorID C.sqlite3_int64) {
	eachMu.Lock()
	delete(eachCursors, int64(cursorID))
	eachMu.Unlock()
}

//export goEachFilter
func goEachFilter(cursorID C.sqlite3_int64, exprPtr *C.char, exprLen C.int, dataPtr *C.char, dataLen C.int) C.int {
	eachMu.Lock()
	st := eachCursors[int64(cursorID)]
	eachMu.Unlock()
	if st == nil {
		return 1 // SQLITE_ERROR
	}

	exprStr := C.GoStringN(exprPtr, exprLen)
	jsonData := C.GoStringN(dataPtr, dataLen)

	compiled, err := getCachedExpr(exprStr)
	if err != nil {
		// No results on compile error — return empty set.
		st.elements = nil
		st.index = 0
		return 0
	}

	result, err := evalWithFormats(compiled, jsonData)
	if err != nil {
		st.elements = nil
		st.index = 0
		return 0
	}

	result = gnata.NormalizeValue(result)
	st.elements = nil
	st.index = 0

	switch v := result.(type) {
	case []any:
		st.elements = make([]eachElement, len(v))
		for i, elem := range v {
			elem = gnata.NormalizeValue(elem)
			st.elements[i] = eachElement{
				value: elem,
				key:   float64(i),
				typ:   jsonTypeName(elem),
			}
		}
	case map[string]any:
		st.elements = make([]eachElement, 0, len(v))
		for k, elem := range v {
			elem = gnata.NormalizeValue(elem)
			st.elements = append(st.elements, eachElement{
				value: elem,
				key:   k,
				typ:   jsonTypeName(elem),
			})
		}
	case nil:
		// empty set
	default:
		// Single scalar value — one row.
		st.elements = []eachElement{{
			value: v,
			key:   nil,
			typ:   jsonTypeName(v),
		}}
	}

	return 0 // SQLITE_OK
}

//export goEachNext
func goEachNext(cursorID C.sqlite3_int64) C.int {
	eachMu.Lock()
	st := eachCursors[int64(cursorID)]
	eachMu.Unlock()
	if st != nil {
		st.index++
	}
	return 0
}

//export goEachEof
func goEachEof(cursorID C.sqlite3_int64) C.int {
	eachMu.Lock()
	st := eachCursors[int64(cursorID)]
	eachMu.Unlock()
	if st == nil || st.index >= len(st.elements) {
		return 1 // EOF
	}
	return 0
}

//export goEachColumn
func goEachColumn(ctx *C.sqlite3_context, cursorID C.sqlite3_int64, col C.int) {
	eachMu.Lock()
	st := eachCursors[int64(cursorID)]
	eachMu.Unlock()

	if st == nil || st.index >= len(st.elements) {
		C.go_result_null(ctx)
		return
	}

	elem := st.elements[st.index]

	switch int(col) {
	case 0: // value
		setResult(ctx, elem.value)
	case 1: // key
		if elem.key == nil {
			C.go_result_null(ctx)
		} else {
			setResult(ctx, elem.key)
		}
	case 2: // type
		cs := C.CString(elem.typ)
		defer C.free(unsafe.Pointer(cs))
		C.go_result_text(ctx, cs, C.int(len(elem.typ)))
	default:
		C.go_result_null(ctx)
	}
}

//export goEachRowid
func goEachRowid(cursorID C.sqlite3_int64) C.sqlite3_int64 {
	eachMu.Lock()
	st := eachCursors[int64(cursorID)]
	eachMu.Unlock()
	if st == nil {
		return 0
	}
	return C.sqlite3_int64(st.index)
}

// ── helpers ─────────────────────────────────────────────────────────────────

func jsonTypeName(v any) string {
	switch val := v.(type) {
	case nil:
		return "null"
	case bool:
		if val {
			return "true"
		}
		return "false"
	case float64:
		if math.Floor(val) == val && !math.IsInf(val, 0) &&
			val >= math.MinInt64 && val <= math.MaxInt64 {
			return "integer"
		}
		return "real"
	case json.Number:
		if _, err := val.Int64(); err == nil {
			return "integer"
		}
		return "real"
	case int64:
		return "integer"
	case string:
		return "text"
	case []any:
		return "array"
	case map[string]any:
		return "object"
	}
	return "null"
}
