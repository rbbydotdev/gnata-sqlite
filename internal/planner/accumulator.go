// Package planner decomposes JSONata expressions into streaming aggregate
// execution plans, following Postgres's approach of breaking queries into
// fundamental building blocks (sfunc / finalfunc / Aggref).
package planner

import (
	"container/heap"
	"encoding/json"
	"math"
	"sort"

	"github.com/tidwall/gjson"
)

// AccKind identifies the type of streaming accumulator.
type AccKind int

const (
	AccSum          AccKind = iota // running sum
	AccCount                      // row counter
	AccMax                        // running maximum
	AccMin                        // running minimum
	AccAverage                    // running sum + count → finalize as sum/count
	AccCountDistinct              // hash set → finalize as len(set)
	AccCollect                    // fallback: accumulate all rows for opaque eval
	AccTopK                       // bounded min-heap for top-K streaming
)

// Accumulator is one streaming reducer in a query plan.
// Analogous to Postgres's sfunc + finalfunc.
type Accumulator struct {
	Kind    AccKind
	PathIdx int // index into QueryPlan.Paths for field extraction (-1 = none)
	PredIdx int // index into QueryPlan.Predicates (-1 = no filter)
	TopN    int // for AccTopK: heap capacity

	// State — updated by StepValue, read by Result.
	sum      float64
	count    int64
	extrema  float64
	hasVal   bool
	distinct map[any]bool
	collected []any
	topHeap  *topKHeap
}

// StepValue processes one extracted value. Called after batch extraction
// and predicate evaluation in QueryPlan.StepBatch.
func (a *Accumulator) StepValue(val gjson.Result, hasPath bool) {
	switch a.Kind {
	case AccCount:
		if !hasPath {
			a.count++ // bare count — no field needed
			return
		}
		if val.Exists() {
			a.count++
		}
	case AccSum:
		if val.Type == gjson.Number {
			a.sum += val.Float()
		}
	case AccMax:
		if val.Type == gjson.Number {
			v := val.Float()
			if !a.hasVal || v > a.extrema {
				a.extrema = v
				a.hasVal = true
			}
		}
	case AccMin:
		if val.Type == gjson.Number {
			v := val.Float()
			if !a.hasVal || v < a.extrema {
				a.extrema = v
				a.hasVal = true
			}
		}
	case AccAverage:
		if val.Type == gjson.Number {
			a.sum += val.Float()
			a.count++
		}
	case AccCountDistinct:
		if !val.Exists() {
			return
		}
		if a.distinct == nil {
			a.distinct = make(map[any]bool)
		}
		a.distinct[gjsonKey(val)] = true
	case AccTopK:
		if val.Type != gjson.Number {
			return
		}
		v := val.Float()
		if a.topHeap == nil {
			a.topHeap = &topKHeap{cap: a.TopN}
			heap.Init(a.topHeap)
		}
		if a.topHeap.Len() < a.TopN {
			heap.Push(a.topHeap, v)
		} else if v > a.topHeap.items[0] {
			a.topHeap.items[0] = v
			heap.Fix(a.topHeap, 0)
		}
	}
}

// StepCollect appends a raw JSON row for opaque evaluation in xFinal.
func (a *Accumulator) StepCollect(parsed any) {
	a.collected = append(a.collected, parsed)
}

// Result returns the finalized accumulator value. This is the finalfunc.
func (a *Accumulator) Result() any {
	switch a.Kind {
	case AccSum:
		return a.sum
	case AccCount:
		return float64(a.count)
	case AccMax, AccMin:
		if !a.hasVal {
			return nil
		}
		return a.extrema
	case AccAverage:
		if a.count == 0 {
			return nil
		}
		return a.sum / float64(a.count)
	case AccCountDistinct:
		return float64(len(a.distinct))
	case AccCollect:
		return a.collected
	case AccTopK:
		if a.topHeap == nil || a.topHeap.Len() == 0 {
			return nil
		}
		// Sort the heap items descending for the final result.
		result := make([]any, a.topHeap.Len())
		sorted := make([]float64, a.topHeap.Len())
		copy(sorted, a.topHeap.items)
		sort.Float64s(sorted)
		for i, v := range sorted {
			result[i] = v
		}
		return result
	}
	return nil
}

// Collected returns the accumulated rows (only meaningful for AccCollect).
func (a *Accumulator) Collected() []any {
	return a.collected
}

// ── helpers ─────────────────────────────────────────────────────────────────

func gjsonKey(r gjson.Result) any {
	switch r.Type {
	case gjson.String:
		return r.Str
	case gjson.Number:
		return r.Float()
	case gjson.True:
		return true
	case gjson.False:
		return false
	}
	return r.Raw
}

func ToFloat(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, !math.IsInf(n, 0) && !math.IsNaN(n)
	case json.Number:
		f, err := n.Float64()
		return f, err == nil
	}
	return 0, false
}

func ToBool(v any) bool {
	if v == nil {
		return false
	}
	switch val := v.(type) {
	case bool:
		return val
	case float64:
		return val != 0
	case string:
		return val != ""
	case json.Number:
		f, _ := val.Float64()
		return f != 0
	}
	return true
}

// ── top-K min-heap ──────────────────────────────────────────────────────────

type topKHeap struct {
	items []float64
	cap   int
}

func (h *topKHeap) Len() int            { return len(h.items) }
func (h *topKHeap) Less(i, j int) bool  { return h.items[i] < h.items[j] }
func (h *topKHeap) Swap(i, j int)       { h.items[i], h.items[j] = h.items[j], h.items[i] }
func (h *topKHeap) Push(x any)          { h.items = append(h.items, x.(float64)) }
func (h *topKHeap) Pop() any {
	old := h.items
	n := len(old)
	v := old[n-1]
	h.items = old[:n-1]
	return v
}
