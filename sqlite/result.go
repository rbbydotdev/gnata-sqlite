package main

/*
#include "bridge.h"
*/
import "C"

import (
	"encoding/json"
	"math"
	"unsafe"
)

// setResult maps a normalized gnata value to the appropriate sqlite3_result_* call.
// After NormalizeValue, the only types are: nil, bool, float64, json.Number, string,
// []any, map[string]any.
func setResult(ctx *C.sqlite3_context, v any) {
	switch val := v.(type) {
	case nil:
		C.go_result_null(ctx)
	case bool:
		if val {
			C.go_result_int64(ctx, 1)
		} else {
			C.go_result_int64(ctx, 0)
		}
	case float64:
		if !math.IsInf(val, 0) && !math.IsNaN(val) &&
			math.Floor(val) == val &&
			val >= math.MinInt64 && val <= math.MaxInt64 {
			C.go_result_int64(ctx, C.sqlite3_int64(val))
		} else {
			C.go_result_double(ctx, C.double(val))
		}
	case json.Number:
		if i, err := val.Int64(); err == nil {
			C.go_result_int64(ctx, C.sqlite3_int64(i))
		} else if f, err := val.Float64(); err == nil {
			C.go_result_double(ctx, C.double(f))
		} else {
			// Fallback: return as text.
			setResultText(ctx, string(val))
		}
	case string:
		setResultText(ctx, val)
	case []any, map[string]any:
		out, err := json.Marshal(val)
		if err != nil {
			setResultText(ctx, "null")
			return
		}
		setResultText(ctx, string(out))
		// Set subtype 'J' (74) for JSON compatibility with json_extract(), json_each(), etc.
		C.go_result_subtype(ctx, 74)
	}
}

func setResultText(ctx *C.sqlite3_context, s string) {
	cs := C.CString(s)
	defer C.free(unsafe.Pointer(cs))
	C.go_result_text(ctx, cs, C.int(len(s)))
}
