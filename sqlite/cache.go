package main

import (
	"sync"

	"github.com/rbbydotdev/gnata-sqlite"
)

var exprCache sync.Map // string → *gnata.Expression

// getCachedExpr returns a compiled expression, using a cache to avoid
// recompilation when the same expression string appears across rows.
func getCachedExpr(expr string) (*gnata.Expression, error) {
	if v, ok := exprCache.Load(expr); ok {
		return v.(*gnata.Expression), nil
	}
	compiled, err := gnata.Compile(expr)
	if err != nil {
		return nil, err
	}
	actual, _ := exprCache.LoadOrStore(expr, compiled)
	return actual.(*gnata.Expression), nil
}
