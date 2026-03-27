package main

/*
#include "bridge.h"
*/
import "C"

import (
	"encoding/json"
	"fmt"
	"strings"
	"unsafe"
)

//export goJsonataSetFunc
func goJsonataSetFunc(ctx *C.sqlite3_context, argc C.int, argv **C.sqlite3_value) {
	defer func() {
		if r := recover(); r != nil {
			msg := fmt.Sprintf("jsonata_set: %v", r)
			cmsg := C.CString(msg)
			defer C.free(unsafe.Pointer(cmsg))
			C.go_result_error(ctx, cmsg, C.int(len(msg)))
		}
	}()

	if argc != 3 {
		setError(ctx, "jsonata_set() requires 3 arguments: json, path, value")
		return
	}

	args := unsafe.Slice(argv, int(argc))

	if C.go_value_type(args[0]) == C.SQLITE_NULL {
		C.go_result_null(ctx)
		return
	}

	jsonData := C.GoStringN(C.go_value_text(args[0]), C.go_value_bytes(args[0]))
	path := C.GoString(C.go_value_text(args[1]))

	// Parse the value argument. Try JSON first; fall back to plain string.
	var newValue any
	if C.go_value_type(args[2]) == C.SQLITE_NULL {
		newValue = nil
	} else {
		valStr := C.GoStringN(C.go_value_text(args[2]), C.go_value_bytes(args[2]))
		if err := json.Unmarshal([]byte(valStr), &newValue); err != nil {
			newValue = valStr
		}
	}

	// Parse the JSON document.
	var doc any
	if err := json.Unmarshal([]byte(jsonData), &doc); err != nil {
		setError(ctx, fmt.Sprintf("jsonata_set: invalid JSON: %v", err))
		return
	}

	// Set the value at the dotted path.
	parts := strings.Split(path, ".")
	if err := setAtPath(doc, parts, newValue); err != nil {
		setError(ctx, fmt.Sprintf("jsonata_set: %v", err))
		return
	}

	out, err := json.Marshal(doc)
	if err != nil {
		setError(ctx, fmt.Sprintf("jsonata_set: marshal: %v", err))
		return
	}

	cs := C.CString(string(out))
	defer C.free(unsafe.Pointer(cs))
	C.go_result_text(ctx, cs, C.int(len(out)))
	C.go_result_subtype(ctx, 74)
}

func setAtPath(doc any, parts []string, value any) error {
	if len(parts) == 0 {
		return fmt.Errorf("empty path")
	}

	obj, ok := doc.(map[string]any)
	if !ok {
		return fmt.Errorf("cannot set path on non-object")
	}

	if len(parts) == 1 {
		obj[parts[0]] = value
		return nil
	}

	next, exists := obj[parts[0]]
	if !exists {
		next = make(map[string]any)
		obj[parts[0]] = next
	}

	return setAtPath(next, parts[1:], value)
}

//export goJsonataDeleteFunc
func goJsonataDeleteFunc(ctx *C.sqlite3_context, argc C.int, argv **C.sqlite3_value) {
	defer func() {
		if r := recover(); r != nil {
			msg := fmt.Sprintf("jsonata_delete: %v", r)
			cmsg := C.CString(msg)
			defer C.free(unsafe.Pointer(cmsg))
			C.go_result_error(ctx, cmsg, C.int(len(msg)))
		}
	}()

	if argc != 2 {
		setError(ctx, "jsonata_delete() requires 2 arguments: json, path")
		return
	}

	args := unsafe.Slice(argv, int(argc))

	if C.go_value_type(args[0]) == C.SQLITE_NULL {
		C.go_result_null(ctx)
		return
	}

	jsonData := C.GoStringN(C.go_value_text(args[0]), C.go_value_bytes(args[0]))
	path := C.GoString(C.go_value_text(args[1]))

	var doc any
	if err := json.Unmarshal([]byte(jsonData), &doc); err != nil {
		setError(ctx, fmt.Sprintf("jsonata_delete: invalid JSON: %v", err))
		return
	}

	parts := strings.Split(path, ".")
	deleteAtPath(doc, parts)

	out, err := json.Marshal(doc)
	if err != nil {
		setError(ctx, fmt.Sprintf("jsonata_delete: marshal: %v", err))
		return
	}

	cs := C.CString(string(out))
	defer C.free(unsafe.Pointer(cs))
	C.go_result_text(ctx, cs, C.int(len(out)))
	C.go_result_subtype(ctx, 74)
}

func deleteAtPath(doc any, parts []string) {
	if len(parts) == 0 {
		return
	}

	obj, ok := doc.(map[string]any)
	if !ok {
		return
	}

	if len(parts) == 1 {
		delete(obj, parts[0])
		return
	}

	next, exists := obj[parts[0]]
	if !exists {
		return
	}

	deleteAtPath(next, parts[1:])
}
