package planner

import (
	"encoding/json"
	"math"
	"strconv"

	"github.com/rbbydotdev/gnata-sqlite"
	"github.com/rbbydotdev/gnata-sqlite/internal/evaluator"
)

// FinalKind identifies the type of a finalization node.
type FinalKind int

const (
	FinalConstant   FinalKind = iota // literal value, no per-row work
	FinalAccRef                      // reference to an accumulator's Result()
	FinalBinaryOp                    // arithmetic over two sub-nodes
	FinalUnaryFunc                   // $round(accRef, literal) — function applied to acc result
	FinalObject                      // { key: node, key: node, ... }
	FinalArray                       // [node, node, ...]
	FinalOpaqueEval                  // fallback: run full JSONata on collected rows
)

// FinalNode is evaluated once in xFinal to produce the query result.
// Leaves are constants or accumulator references; interior nodes are
// arithmetic operators, object/array constructors, or finalizer functions.
type FinalNode struct {
	Kind FinalKind

	// FinalConstant
	Value any

	// FinalAccRef
	AccIndex int

	// FinalBinaryOp
	Op    string
	Left  *FinalNode
	Right *FinalNode

	// FinalUnaryFunc
	FuncName string
	Arg      *FinalNode
	FuncArg2 any

	// FinalObject
	Keys   []string
	Values []*FinalNode

	// FinalArray
	Elements []*FinalNode

	// FinalOpaqueEval
	Expr       *gnata.Expression
	CollectIdx int
}

// Eval evaluates the finalization tree using the completed accumulators.
func (n *FinalNode) Eval(accs []Accumulator) any {
	return n.eval(accs, nil)
}

// EvalWithEnv evaluates the finalization tree with a custom function environment.
// Opaque subtrees use EvalWithCustomFuncs so custom format functions work.
func (n *FinalNode) EvalWithEnv(accs []Accumulator, env *evaluator.Environment) any {
	return n.eval(accs, env)
}

func (n *FinalNode) eval(accs []Accumulator, env *evaluator.Environment) any {
	switch n.Kind {
	case FinalConstant:
		return n.Value

	case FinalAccRef:
		return accs[n.AccIndex].Result()

	case FinalBinaryOp:
		left := n.Left.eval(accs, env)
		right := n.Right.eval(accs, env)
		return applyBinaryOp(n.Op, left, right)

	case FinalUnaryFunc:
		val := n.Arg.eval(accs, env)
		return applyFinalFunc(n.FuncName, val, n.FuncArg2)

	case FinalObject:
		obj := make(map[string]any, len(n.Keys))
		for i, key := range n.Keys {
			obj[key] = n.Values[i].eval(accs, env)
		}
		return obj

	case FinalArray:
		arr := make([]any, len(n.Elements))
		for i, elem := range n.Elements {
			arr[i] = elem.eval(accs, env)
		}
		return arr

	case FinalOpaqueEval:
		data := accs[n.CollectIdx].Collected()
		if len(data) == 0 {
			return nil
		}
		var result any
		var err error
		if env != nil {
			result, err = n.Expr.EvalWithCustomFuncs(nil, data, env)
		} else {
			result, err = n.Expr.Eval(nil, data)
		}
		if err != nil {
			return nil
		}
		return gnata.NormalizeValue(result)
	}
	return nil
}

func applyBinaryOp(op string, left, right any) any {
	switch op {
	case "+", "-", "*", "/":
		lf, lok := ToFloat(left)
		rf, rok := ToFloat(right)
		if !lok || !rok {
			return nil
		}
		switch op {
		case "+":
			return lf + rf
		case "-":
			return lf - rf
		case "*":
			return lf * rf
		case "/":
			if rf == 0 {
				return nil
			}
			return lf / rf
		}
	case "&":
		return toString(left) + toString(right)
	}
	return nil
}

func applyFinalFunc(name string, val any, arg2 any) any {
	f, ok := ToFloat(val)
	if !ok {
		return val
	}
	switch name {
	case "round":
		precision := 0
		if p, ok := ToFloat(arg2); ok {
			precision = int(p)
		}
		pow := math.Pow(10, float64(precision))
		return math.Round(f*pow) / pow
	case "floor":
		return math.Floor(f)
	case "ceil":
		return math.Ceil(f)
	case "abs":
		return math.Abs(f)
	case "sqrt":
		if f < 0 {
			return nil
		}
		return math.Sqrt(f)
	case "string":
		return toString(val)
	case "number":
		return f
	}
	return val
}

func toString(v any) string {
	switch val := v.(type) {
	case string:
		return val
	case float64:
		return strconv.FormatFloat(val, 'f', -1, 64)
	case json.Number:
		return string(val)
	case bool:
		if val {
			return "true"
		}
		return "false"
	case nil:
		return ""
	}
	return ""
}
