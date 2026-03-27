package main

/*
#include "bridge.h"
*/
import "C"

import (
	"encoding/json"
	"fmt"
	"sync"
	"unsafe"

	"github.com/rbbydotdev/gnata-sqlite"
	"github.com/rbbydotdev/gnata-sqlite/internal/planner"
)

// queryState holds per-group state for jsonata_query.
type queryState struct {
	plan    *planner.QueryPlan
	expr    *gnata.Expression
	exprStr string
	rows    []any // fallback accumulation if plan is nil
	err     error
}

var (
	queryMu     sync.Mutex
	queryStates = make(map[int64]*queryState)
	queryNextID int64
)

func newQueryState() (*queryState, int64) {
	queryMu.Lock()
	queryNextID++
	id := queryNextID
	st := &queryState{}
	queryStates[id] = st
	queryMu.Unlock()
	return st, id
}

func getQueryState(id int64) *queryState {
	queryMu.Lock()
	st := queryStates[id]
	queryMu.Unlock()
	return st
}

func dropQueryState(id int64) {
	queryMu.Lock()
	delete(queryStates, id)
	queryMu.Unlock()
}

//export goJsonataQueryStep
func goJsonataQueryStep(ctx *C.sqlite3_context, argc C.int, argv **C.sqlite3_value) {
	defer func() {
		if r := recover(); r != nil {
			// Store panic for final.
		}
	}()

	if argc != 2 {
		return
	}

	args := unsafe.Slice(argv, int(argc))

	pAgg := (*int64)(C.go_aggregate_context(ctx, C.int(unsafe.Sizeof(int64(0)))))
	if pAgg == nil {
		return
	}

	var st *queryState
	if *pAgg == 0 {
		var id int64
		st, id = newQueryState()
		*pAgg = id

		if C.go_value_type(args[0]) == C.SQLITE_NULL {
			st.err = fmt.Errorf("jsonata_query: expression cannot be NULL")
			return
		}

		st.exprStr = C.GoString(C.go_value_text(args[0]))
		compiled, err := getCachedExpr(st.exprStr)
		if err != nil {
			st.err = fmt.Errorf("jsonata_query compile: %v", err)
			return
		}
		st.expr = compiled

		// Attempt to decompose into a streaming plan.
		st.plan = planner.Analyze(compiled)
	} else {
		st = getQueryState(*pAgg)
	}

	if st == nil || st.err != nil {
		return
	}

	if C.go_value_type(args[1]) == C.SQLITE_NULL {
		return
	}

	jsonData := C.GoStringN(C.go_value_text(args[1]), C.go_value_bytes(args[1]))

	if st.plan != nil {
		// Streaming: batch-extract all fields and feed accumulators.
		st.plan.StepBatch(json.RawMessage(jsonData))
	} else {
		// Fallback: accumulate rows for full JSONata eval.
		parsed, err := gnata.DecodeJSON(json.RawMessage(jsonData))
		if err != nil {
			if st.err == nil {
				st.err = fmt.Errorf("jsonata_query: invalid JSON: %v", err)
			}
			return
		}
		st.rows = append(st.rows, parsed)
	}
}

//export goJsonataQueryFinal
func goJsonataQueryFinal(ctx *C.sqlite3_context) {
	defer func() {
		if r := recover(); r != nil {
			msg := fmt.Sprintf("jsonata_query: %v", r)
			cmsg := C.CString(msg)
			defer C.free(unsafe.Pointer(cmsg))
			C.go_result_error(ctx, cmsg, C.int(len(msg)))
		}
	}()

	pAgg := (*int64)(C.go_aggregate_context(ctx, 0))
	if pAgg == nil || *pAgg == 0 {
		C.go_result_null(ctx)
		return
	}

	id := *pAgg
	st := getQueryState(id)
	dropQueryState(id)

	if st == nil {
		C.go_result_null(ctx)
		return
	}
	if st.err != nil {
		setError(ctx, st.err.Error())
		return
	}

	var result any
	if st.plan != nil {
		result = st.plan.FinalExpr.EvalWithEnv(st.plan.Accumulators, formatEnv)
	} else {
		if len(st.rows) == 0 {
			C.go_result_null(ctx)
			return
		}
		var err error
		result, err = st.expr.EvalWithCustomFuncs(nil, st.rows, formatEnv)
		if err != nil {
			setError(ctx, fmt.Sprintf("jsonata_query eval: %v", err))
			return
		}
		result = gnata.NormalizeValue(result)
	}

	setResult(ctx, result)
}
