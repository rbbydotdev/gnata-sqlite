package planner

import (
	"fmt"
	"strings"

	"github.com/rbbydotdev/gnata-sqlite"
	"github.com/rbbydotdev/gnata-sqlite/internal/parser"
	"github.com/tidwall/gjson"
)

// QueryPlan is the compiled execution plan for a jsonata_query expression.
// Accumulators are fed per row (xStep), then FinalExpr is evaluated once (xFinal).
type QueryPlan struct {
	Accumulators []Accumulator
	FinalExpr    *FinalNode

	// Batch extraction: all unique GJSON paths collected at plan time.
	// StepBatch calls gjson.GetManyBytes once per row to extract all fields.
	Paths []string

	// Predicate sharing: deduplicated predicates evaluated once per row.
	// Accumulators reference predicates by index (Accumulator.PredIdx).
	Predicates []*gnata.Expression

	// hasCollect is true if any accumulator is AccCollect (needs full row parsing).
	hasCollect bool
}

// StepBatch processes one JSON row, extracting all fields in a single GJSON scan
// and evaluating each predicate once. This is the hot path — called per row.
func (p *QueryPlan) StepBatch(jsonData []byte) {
	// 1. Batch extract all paths in one scan (DuckDB JSON shredding).
	var results []gjson.Result
	if len(p.Paths) > 0 {
		results = gjson.GetManyBytes(jsonData, p.Paths...)
	}

	// 2. Evaluate each predicate once (ClickHouse -If combinator / predicate sharing).
	var predResults []bool
	if len(p.Predicates) > 0 {
		predResults = make([]bool, len(p.Predicates))
		for i, pred := range p.Predicates {
			// Predicates use simple path comparisons — use GJSON fast path via EvalBytes.
			result, err := pred.EvalBytes(nil, jsonData)
			predResults[i] = err == nil && ToBool(result)
		}
	}

	// 3. Feed accumulators using pre-extracted values.
	var parsedRow any // lazy-parsed for Collect accumulators
	for i := range p.Accumulators {
		acc := &p.Accumulators[i]

		// Check predicate if present.
		if acc.PredIdx >= 0 && !predResults[acc.PredIdx] {
			continue
		}

		if acc.Kind == AccCollect {
			if parsedRow == nil {
				var err error
				parsedRow, err = gnata.DecodeJSON(jsonData)
				if err != nil {
					continue
				}
			}
			acc.StepCollect(parsedRow)
			continue
		}

		// Get the pre-extracted value.
		hasPath := acc.PathIdx >= 0
		var val gjson.Result
		if hasPath {
			val = results[acc.PathIdx]
		}
		acc.StepValue(val, hasPath)
	}
}

// Analyze decomposes a compiled JSONata expression into a QueryPlan.
// Returns nil if the expression cannot be decomposed at all (pure opaque).
func Analyze(expr *gnata.Expression) *QueryPlan {
	ast := expr.AST()
	if ast == nil {
		return nil
	}
	ctx := &planCtx{
		accKeys:  make(map[string]int),
		pathKeys: make(map[string]int),
		predKeys: make(map[string]int),
	}
	final := ctx.analyze(ast)
	if final == nil {
		return nil
	}
	if len(ctx.accs) == 0 {
		return nil
	}

	hasCollect := false
	for i := range ctx.accs {
		if ctx.accs[i].Kind == AccCollect {
			hasCollect = true
			break
		}
	}

	return &QueryPlan{
		Accumulators: ctx.accs,
		FinalExpr:    final,
		Paths:        ctx.paths,
		Predicates:   ctx.preds,
		hasCollect:   hasCollect,
	}
}

// planCtx holds mutable state during AST analysis.
type planCtx struct {
	accs     []Accumulator
	accKeys  map[string]int // dedup key → accumulator index (CSE)
	paths    []string
	pathKeys map[string]int // path → index into paths (dedup)
	preds    []*gnata.Expression
	predKeys map[string]int // predicate source → index into preds (dedup)
}

// addPath adds a GJSON path, deduplicating. Returns the index.
func (c *planCtx) addPath(path string) int {
	if idx, ok := c.pathKeys[path]; ok {
		return idx
	}
	idx := len(c.paths)
	c.paths = append(c.paths, path)
	c.pathKeys[path] = idx
	return idx
}

// addPredicate adds a predicate, deduplicating by source. Returns the index.
func (c *planCtx) addPredicate(pred *gnata.Expression) int {
	key := pred.Source()
	if idx, ok := c.predKeys[key]; ok {
		return idx
	}
	idx := len(c.preds)
	c.preds = append(c.preds, pred)
	c.predKeys[key] = idx
	return idx
}

// addAcc adds an accumulator, deduplicating by key. Returns the index.
func (c *planCtx) addAcc(key string, acc Accumulator) int {
	if idx, ok := c.accKeys[key]; ok {
		return idx
	}
	idx := len(c.accs)
	c.accs = append(c.accs, acc)
	c.accKeys[key] = idx
	return idx
}

// addCollector adds or reuses a Collect accumulator for opaque subtrees.
func (c *planCtx) addCollector() int {
	key := "__collect__"
	if idx, ok := c.accKeys[key]; ok {
		return idx
	}
	return c.addAcc(key, Accumulator{Kind: AccCollect, PathIdx: -1, PredIdx: -1})
}

// ── AST analysis ────────────────────────────────────────────────────────────

func (c *planCtx) analyze(node *parser.Node) *FinalNode {
	if node == nil {
		return &FinalNode{Kind: FinalConstant, Value: nil}
	}

	switch node.Type {
	case parser.NodeString:
		return &FinalNode{Kind: FinalConstant, Value: node.Value}
	case parser.NodeNumber:
		return &FinalNode{Kind: FinalConstant, Value: node.NumVal}
	case parser.NodeValue:
		return c.analyzeValue(node)
	case parser.NodeUnary:
		if node.Value == "{" {
			return c.analyzeObjectConstructor(node)
		}
		if node.Value == "[" {
			return c.analyzeArrayConstructor(node)
		}
		return nil
	case parser.NodeFunction:
		return c.analyzeFunction(node)
	case parser.NodeBinary:
		return c.analyzeBinary(node)
	case parser.NodeBlock:
		if len(node.Expressions) > 0 {
			return c.analyze(node.Expressions[len(node.Expressions)-1])
		}
		return nil
	default:
		return nil
	}
}

func (c *planCtx) analyzeValue(node *parser.Node) *FinalNode {
	switch node.Value {
	case "true":
		return &FinalNode{Kind: FinalConstant, Value: true}
	case "false":
		return &FinalNode{Kind: FinalConstant, Value: false}
	case "null":
		return &FinalNode{Kind: FinalConstant, Value: nil}
	}
	return nil
}

// analyzeObjectConstructor handles { "key": expr, ... }.
// Nested objects are handled recursively via analyze().
func (c *planCtx) analyzeObjectConstructor(node *parser.Node) *FinalNode {
	if len(node.LHS)%2 != 0 {
		return nil
	}
	n := len(node.LHS) / 2
	keys := make([]string, 0, n)
	values := make([]*FinalNode, 0, n)

	for i := 0; i < len(node.LHS); i += 2 {
		keyNode := node.LHS[i]
		valNode := node.LHS[i+1]

		if keyNode.Type != parser.NodeString {
			return nil // dynamic keys → opaque
		}

		val := c.analyze(valNode)
		if val == nil {
			// Opaque subtree — use Collect fallback.
			collectIdx := c.addCollector()
			compiled, err := gnata.Compile(nodeToSource(valNode))
			if err != nil {
				return nil
			}
			val = &FinalNode{
				Kind:       FinalOpaqueEval,
				Expr:       compiled,
				CollectIdx: collectIdx,
			}
		}

		keys = append(keys, keyNode.Value)
		values = append(values, val)
	}

	return &FinalNode{Kind: FinalObject, Keys: keys, Values: values}
}

// analyzeArrayConstructor handles [$sum(x), $max(x), ...].
func (c *planCtx) analyzeArrayConstructor(node *parser.Node) *FinalNode {
	if len(node.Expressions) == 0 {
		return &FinalNode{Kind: FinalConstant, Value: []any{}}
	}
	elements := make([]*FinalNode, 0, len(node.Expressions))
	for _, elem := range node.Expressions {
		val := c.analyze(elem)
		if val == nil {
			return nil // any opaque element → whole array opaque
		}
		elements = append(elements, val)
	}
	return &FinalNode{Kind: FinalArray, Elements: elements}
}

func (c *planCtx) analyzeFunction(node *parser.Node) *FinalNode {
	if node.Procedure == nil || node.Procedure.Type != parser.NodeVariable {
		return nil
	}
	name := node.Procedure.Value

	if wrapperFn, ok := finalizerFuncs[name]; ok {
		return c.analyzeWrapperFunc(node, wrapperFn)
	}

	kind, ok := aggFuncKinds[name]
	if !ok {
		return nil
	}

	return c.analyzeAggFunc(node, kind)
}

var aggFuncKinds = map[string]AccKind{
	"sum":     AccSum,
	"count":   AccCount,
	"max":     AccMax,
	"min":     AccMin,
	"average": AccAverage,
}

var finalizerFuncs = map[string]string{
	"round":  "round",
	"floor":  "floor",
	"ceil":   "ceil",
	"abs":    "abs",
	"sqrt":   "sqrt",
	"string": "string",
	"number": "number",
}

func (c *planCtx) analyzeAggFunc(node *parser.Node, kind AccKind) *FinalNode {
	if kind == AccCount {
		if len(node.Arguments) == 0 {
			return c.makeAccRef(AccCount, -1, -1, "count:")
		}
		if len(node.Arguments) == 1 && node.Arguments[0].Type == parser.NodeVariable &&
			(node.Arguments[0].Value == "$" || node.Arguments[0].Value == "") {
			return c.makeAccRef(AccCount, -1, -1, "count:")
		}
		// Try $count($distinct(path)) first, then fall through to general arg analysis.
		if len(node.Arguments) == 1 {
			if result := c.analyzeCountDistinct(node.Arguments[0]); result != nil {
				return result
			}
		}
	}

	if len(node.Arguments) != 1 {
		return nil
	}

	return c.analyzeAggArg(kind, node.Arguments[0])
}

func (c *planCtx) analyzeAggArg(kind AccKind, arg *parser.Node) *FinalNode {
	// Simple path: $sum(amount)
	if path := tryExtractPath(arg); path != "" {
		pathIdx := c.addPath(path)
		return c.makeAccRef(kind, pathIdx, -1, fmt.Sprintf("%d:%s:", kind, path))
	}

	// Constant folding: $sum(amount * 1.1) → $sum(amount) * 1.1
	if arg.Type == parser.NodeBinary && (arg.Value == "*" || arg.Value == "/") {
		if folded := c.tryConstantFold(kind, arg); folded != nil {
			return folded
		}
	}
	// $sum(1.1 + amount) or $sum(amount + 1.1)
	if arg.Type == parser.NodeBinary && (arg.Value == "+" || arg.Value == "-") {
		if folded := c.tryConstantFoldAdditive(kind, arg); folded != nil {
			return folded
		}
	}

	// Path with filter: $sum($filter($, fn).amount)
	if arg.Type == parser.NodePath && len(arg.Steps) >= 2 {
		filterStep := arg.Steps[0]
		pathSteps := arg.Steps[1:]

		if filterStep.Type == parser.NodeFunction {
			pred := tryExtractFilterPredicate(filterStep)
			if pred != nil {
				path := stepsToPath(pathSteps)
				if path != "" {
					pathIdx := c.addPath(path)
					predIdx := c.addPredicate(pred)
					return c.makeAccRef(kind, pathIdx, predIdx,
						fmt.Sprintf("%d:%s:%s", kind, path, pred.Source()))
				}
			}
		}
	}

	// $filter($, fn) without trailing path
	if arg.Type == parser.NodeFunction {
		pred := tryExtractFilterPredicate(arg)
		if pred != nil {
			predIdx := c.addPredicate(pred)
			return c.makeAccRef(kind, -1, predIdx,
				fmt.Sprintf("%d:*:%s", kind, pred.Source()))
		}
	}

	return nil
}

// tryConstantFold handles $sum(path * const) → $sum(path) * const
func (c *planCtx) tryConstantFold(kind AccKind, node *parser.Node) *FinalNode {
	var pathNode, constNode *parser.Node
	if tryExtractPath(node.Left) != "" && node.Right != nil && node.Right.Type == parser.NodeNumber {
		pathNode = node.Left
		constNode = node.Right
	} else if tryExtractPath(node.Right) != "" && node.Left != nil && node.Left.Type == parser.NodeNumber {
		pathNode = node.Right
		constNode = node.Left
	}
	if pathNode == nil {
		return nil
	}

	path := tryExtractPath(pathNode)
	pathIdx := c.addPath(path)
	accRef := c.makeAccRef(kind, pathIdx, -1, fmt.Sprintf("%d:%s:", kind, path))

	return &FinalNode{
		Kind:  FinalBinaryOp,
		Op:    node.Value,
		Left:  accRef,
		Right: &FinalNode{Kind: FinalConstant, Value: constNode.NumVal},
	}
}

// tryConstantFoldAdditive handles $sum(path + const) → $sum(path) + const * $count($)
func (c *planCtx) tryConstantFoldAdditive(kind AccKind, node *parser.Node) *FinalNode {
	// For addition: sum(x + c) = sum(x) + c * count
	// Only worth it for sum. For max/min/avg this identity doesn't hold the same way.
	if kind != AccSum {
		return nil
	}

	var pathNode, constNode *parser.Node
	if tryExtractPath(node.Left) != "" && node.Right != nil && node.Right.Type == parser.NodeNumber {
		pathNode = node.Left
		constNode = node.Right
	} else if tryExtractPath(node.Right) != "" && node.Left != nil && node.Left.Type == parser.NodeNumber {
		pathNode = node.Right
		constNode = node.Left
	}
	if pathNode == nil {
		return nil
	}

	path := tryExtractPath(pathNode)
	pathIdx := c.addPath(path)
	sumRef := c.makeAccRef(AccSum, pathIdx, -1, fmt.Sprintf("%d:%s:", AccSum, path))
	countRef := c.makeAccRef(AccCount, -1, -1, "count:")

	// sum(path + c) = sum(path) + c * count
	return &FinalNode{
		Kind: FinalBinaryOp,
		Op:   node.Value, // "+" or "-"
		Left: sumRef,
		Right: &FinalNode{
			Kind:  FinalBinaryOp,
			Op:    "*",
			Left:  &FinalNode{Kind: FinalConstant, Value: constNode.NumVal},
			Right: countRef,
		},
	}
}

func (c *planCtx) analyzeCountDistinct(arg *parser.Node) *FinalNode {
	if arg.Type != parser.NodeFunction || arg.Procedure == nil {
		return nil
	}
	if arg.Procedure.Type != parser.NodeVariable || arg.Procedure.Value != "distinct" {
		return nil
	}
	if len(arg.Arguments) != 1 {
		return nil
	}
	path := tryExtractPath(arg.Arguments[0])
	if path == "" {
		return nil
	}
	pathIdx := c.addPath(path)
	return c.makeAccRef(AccCountDistinct, pathIdx, -1, fmt.Sprintf("%d:%s:", AccCountDistinct, path))
}

func (c *planCtx) analyzeWrapperFunc(node *parser.Node, funcName string) *FinalNode {
	if len(node.Arguments) < 1 {
		return nil
	}
	inner := c.analyze(node.Arguments[0])
	if inner == nil {
		return nil
	}

	var arg2 any
	if len(node.Arguments) >= 2 && node.Arguments[1].Type == parser.NodeNumber {
		arg2 = node.Arguments[1].NumVal
	}

	return &FinalNode{
		Kind:     FinalUnaryFunc,
		FuncName: funcName,
		Arg:      inner,
		FuncArg2: arg2,
	}
}

func (c *planCtx) analyzeBinary(node *parser.Node) *FinalNode {
	switch node.Value {
	case "+", "-", "*", "/", "&":
		left := c.analyze(node.Left)
		right := c.analyze(node.Right)
		if left == nil || right == nil {
			return nil
		}
		return &FinalNode{
			Kind:  FinalBinaryOp,
			Op:    node.Value,
			Left:  left,
			Right: right,
		}
	}
	return nil
}

func (c *planCtx) makeAccRef(kind AccKind, pathIdx, predIdx int, key string) *FinalNode {
	idx := c.addAcc(key, Accumulator{
		Kind:    kind,
		PathIdx: pathIdx,
		PredIdx: predIdx,
	})
	return &FinalNode{Kind: FinalAccRef, AccIndex: idx}
}

// ── AST inspection helpers ──────────────────────────────────────────────────

func tryExtractPath(node *parser.Node) string {
	if node == nil {
		return ""
	}
	switch node.Type {
	case parser.NodeName:
		if len(node.Stages) > 0 || node.Group != nil {
			return ""
		}
		return node.Value
	case parser.NodePath:
		return stepsToPath(node.Steps)
	}
	return ""
}

func stepsToPath(steps []*parser.Node) string {
	if len(steps) == 0 {
		return ""
	}
	var b strings.Builder
	for i, step := range steps {
		if step.Type != parser.NodeName || len(step.Stages) > 0 || step.Group != nil {
			return ""
		}
		if i > 0 {
			b.WriteByte('.')
		}
		b.WriteString(step.Value)
	}
	return b.String()
}

func tryExtractFilterPredicate(node *parser.Node) *gnata.Expression {
	if node.Type != parser.NodeFunction || node.Procedure == nil {
		return nil
	}
	if node.Procedure.Type != parser.NodeVariable || node.Procedure.Value != "filter" {
		return nil
	}
	if len(node.Arguments) != 2 {
		return nil
	}
	arg0 := node.Arguments[0]
	if arg0.Type != parser.NodeVariable || (arg0.Value != "" && arg0.Value != "$") {
		return nil
	}
	lambda := node.Arguments[1]
	if lambda.Type != parser.NodeLambda || lambda.Body == nil {
		return nil
	}
	if len(lambda.Arguments) != 1 {
		return nil
	}
	src := nodeToSource(lambda.Body)
	if src == "" {
		return nil
	}
	paramName := lambda.Arguments[0].Value
	src = replaceParam(src, paramName)

	pred, err := gnata.Compile(src)
	if err != nil {
		return nil
	}
	return pred
}

func replaceParam(src, paramName string) string {
	prefix := "$" + paramName + "."
	var b strings.Builder
	b.Grow(len(src))
	i := 0
	for i < len(src) {
		if i+len(prefix) <= len(src) && src[i:i+len(prefix)] == prefix {
			i += len(prefix)
			continue
		}
		bare := "$" + paramName
		if i+len(bare) <= len(src) && src[i:i+len(bare)] == bare {
			end := i + len(bare)
			if end >= len(src) || !isIdentChar(src[end]) {
				b.WriteByte('$')
				i += len(bare)
				continue
			}
		}
		b.WriteByte(src[i])
		i++
	}
	return b.String()
}

func isIdentChar(c byte) bool {
	return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_'
}

func nodeToSource(node *parser.Node) string {
	if node == nil {
		return ""
	}
	switch node.Type {
	case parser.NodeString:
		return `"` + node.Value + `"`
	case parser.NodeNumber:
		return fmt.Sprintf("%v", node.NumVal)
	case parser.NodeValue:
		return node.Value
	case parser.NodeName:
		return node.Value
	case parser.NodeVariable:
		if node.Value == "" {
			return "$"
		}
		return "$" + node.Value
	case parser.NodePath:
		var b strings.Builder
		for i, step := range node.Steps {
			if i > 0 {
				b.WriteByte('.')
			}
			b.WriteString(nodeToSource(step))
		}
		return b.String()
	case parser.NodeBinary:
		return nodeToSource(node.Left) + " " + node.Value + " " + nodeToSource(node.Right)
	case parser.NodeFunction:
		var b strings.Builder
		b.WriteString("$" + node.Procedure.Value + "(")
		for i, arg := range node.Arguments {
			if i > 0 {
				b.WriteString(", ")
			}
			b.WriteString(nodeToSource(arg))
		}
		b.WriteByte(')')
		return b.String()
	}
	return ""
}
