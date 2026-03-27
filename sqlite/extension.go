package main

/*
#include "bridge.h"

// Defined in bridge.c — initializes the sqlite3_api pointer exactly once.
extern void gnata_init_api(const sqlite3_api_routines *pApi);

// Trampoline: C function pointer that SQLite calls, which delegates to Go.
extern void goJsonataFunc(sqlite3_context*, int, sqlite3_value**);

static void jsonata_trampoline(sqlite3_context *ctx, int argc, sqlite3_value **argv) {
	goJsonataFunc(ctx, argc, argv);
}

// nArg=-1 accepts variable arguments (2 or 3 for the $try default pattern).
static int go_create_function(sqlite3 *db) {
	return sqlite3_create_function_v2(
		db, "jsonata", -1,
		SQLITE_UTF8 | SQLITE_DETERMINISTIC,
		0,
		jsonata_trampoline,
		0, 0, 0
	);
}
*/
import "C"

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"unsafe"

	"github.com/rbbydotdev/gnata-sqlite"
)

//export goJsonataFunc
func goJsonataFunc(ctx *C.sqlite3_context, argc C.int, argv **C.sqlite3_value) {
	defer func() {
		if r := recover(); r != nil {
			msg := fmt.Sprintf("gnata: %v", r)
			cmsg := C.CString(msg)
			defer C.free(unsafe.Pointer(cmsg))
			C.go_result_error(ctx, cmsg, C.int(len(msg)))
		}
	}()

	if argc < 2 {
		setError(ctx, "jsonata() requires at least 2 arguments")
		return
	}

	args := unsafe.Slice(argv, int(argc))

	// NULL expression → NULL result.
	if C.go_value_type(args[0]) == C.SQLITE_NULL {
		C.go_result_null(ctx)
		return
	}

	exprStr := C.GoString(C.go_value_text(args[0]))

	var jsonData string
	var hasDefault bool
	var defaultIdx int

	switch {
	case argc <= 3:
		// Legacy mode: jsonata(expr, json [, default])
		if C.go_value_type(args[1]) == C.SQLITE_NULL {
			C.go_result_null(ctx)
			return
		}
		jsonData = C.GoStringN(C.go_value_text(args[1]), C.go_value_bytes(args[1]))
		hasDefault = argc == 3
		defaultIdx = 2
	default:
		// Multi-column mode: jsonata(expr, key1, val1, key2, val2, ...)
		kvCount := int(argc) - 1
		if kvCount%2 != 0 {
			setError(ctx, "jsonata() key-value mode requires pairs: expression, key1, val1, key2, val2, ...")
			return
		}
		jsonData = buildJSONObject(args[1:], kvCount)
	}

	// Compile (cached) the expression.
	expr, err := getCachedExpr(exprStr)
	if err != nil {
		if hasDefault {
			copyDefaultResult(ctx, args[defaultIdx])
			return
		}
		setError(ctx, fmt.Sprintf("jsonata compile: %v", err))
		return
	}

	// Evaluate with custom format functions.
	result, err := evalWithFormats(expr, jsonData)
	if err != nil {
		if hasDefault {
			copyDefaultResult(ctx, args[defaultIdx])
			return
		}
		setError(ctx, fmt.Sprintf("jsonata eval: %v", err))
		return
	}

	// Normalize internal types and map to SQLite result.
	result = gnata.NormalizeValue(result)
	setResult(ctx, result)
}

// buildJSONObject constructs a JSON object string from alternating key-value
// SQLite arguments. TEXT values that look like JSON objects or arrays are
// embedded raw so nested JSON columns work naturally.
func buildJSONObject(args []*C.sqlite3_value, count int) string {
	var buf strings.Builder
	buf.Grow(count * 32)
	buf.WriteByte('{')
	for i := 0; i < count; i += 2 {
		if i > 0 {
			buf.WriteByte(',')
		}
		// Key — always a string.
		key := C.GoString(C.go_value_text(args[i]))
		keyJSON, _ := json.Marshal(key)
		buf.Write(keyJSON)
		buf.WriteByte(':')
		// Value — type-aware.
		writeSQLiteValueAsJSON(&buf, args[i+1])
	}
	buf.WriteByte('}')
	return buf.String()
}

// writeSQLiteValueAsJSON writes a sqlite3_value as a JSON token into buf.
func writeSQLiteValueAsJSON(buf *strings.Builder, val *C.sqlite3_value) {
	switch C.go_value_type(val) {
	case C.SQLITE_NULL:
		buf.WriteString("null")
	case C.SQLITE_INTEGER:
		buf.WriteString(strconv.FormatInt(int64(C.go_value_int64(val)), 10))
	case C.SQLITE_FLOAT:
		buf.WriteString(strconv.FormatFloat(float64(C.go_value_double(val)), 'g', -1, 64))
	case C.SQLITE_TEXT:
		s := C.GoStringN(C.go_value_text(val), C.go_value_bytes(val))
		// Embed raw if it has JSON subtype or looks like a JSON object/array.
		if C.go_value_subtype(val) == 74 || looksLikeJSON(s) {
			buf.WriteString(s)
		} else {
			quoted, _ := json.Marshal(s)
			buf.Write(quoted)
		}
	default:
		buf.WriteString("null")
	}
}

// looksLikeJSON returns true if s appears to be a JSON object or array.
func looksLikeJSON(s string) bool {
	if len(s) < 2 {
		return false
	}
	return (s[0] == '{' && s[len(s)-1] == '}') || (s[0] == '[' && s[len(s)-1] == ']')
}

// copyDefaultResult copies a sqlite3_value directly to the result,
// preserving its original type (INTEGER, REAL, TEXT, NULL).
func copyDefaultResult(ctx *C.sqlite3_context, val *C.sqlite3_value) {
	switch C.go_value_type(val) {
	case C.SQLITE_NULL:
		C.go_result_null(ctx)
	case C.SQLITE_INTEGER:
		C.go_result_int64(ctx, C.go_value_int64(val))
	case C.SQLITE_FLOAT:
		C.go_result_double(ctx, C.go_value_double(val))
	case C.SQLITE_TEXT:
		s := C.GoStringN(C.go_value_text(val), C.go_value_bytes(val))
		setResultText(ctx, s)
	default:
		C.go_result_null(ctx)
	}
}

func setError(ctx *C.sqlite3_context, msg string) {
	cmsg := C.CString(msg)
	defer C.free(unsafe.Pointer(cmsg))
	C.go_result_error(ctx, cmsg, C.int(len(msg)))
}

//export sqlite3_jsonata_init
func sqlite3_jsonata_init(db *C.sqlite3, pzErrMsg **C.char, pApi *C.sqlite3_api_routines) C.int {
	C.gnata_init_api(pApi)

	// Initialize custom format functions once.
	initFormatEnv()

	rc := C.go_create_function(db)
	if rc != C.SQLITE_OK {
		msg := C.CString("failed to register jsonata function")
		*pzErrMsg = msg
		return rc
	}
	rc = C.go_create_query_function(db)
	if rc != C.SQLITE_OK {
		msg := C.CString("failed to register jsonata_query function")
		*pzErrMsg = msg
		return rc
	}
	rc = C.go_create_set_function(db)
	if rc != C.SQLITE_OK {
		msg := C.CString("failed to register jsonata_set function")
		*pzErrMsg = msg
		return rc
	}
	rc = C.go_create_delete_function(db)
	if rc != C.SQLITE_OK {
		msg := C.CString("failed to register jsonata_delete function")
		*pzErrMsg = msg
		return rc
	}
	rc = C.go_create_each_module(db)
	if rc != C.SQLITE_OK {
		msg := C.CString("failed to register jsonata_each module")
		*pzErrMsg = msg
		return rc
	}
	return rc
}

func main() {}
