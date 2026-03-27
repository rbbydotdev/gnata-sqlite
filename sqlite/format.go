package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html"
	"math"
	"net/url"
	"strings"

	"github.com/rbbydotdev/gnata-sqlite"
	"github.com/rbbydotdev/gnata-sqlite/internal/evaluator"
)

// formatEnv holds custom format functions available inside JSONata expressions.
// Initialized once at extension load time.
var formatEnv *evaluator.Environment

func initFormatEnv() {
	funcs := map[string]gnata.CustomFunc{
		"base64":       base64Encode,
		"base64decode": base64Decode,
		"urlencode":    urlEncode,
		"urldecode":    urlDecode,
		"csv":          csvFormat,
		"tsv":          tsvFormat,
		"htmlescape":   htmlEscape,
	}
	formatEnv = gnata.NewCustomEnv(funcs)
}

func base64Encode(args []any, focus any) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("$base64 requires 1 argument")
	}
	s, ok := fmtToString(args[0])
	if !ok {
		return nil, nil
	}
	return base64.StdEncoding.EncodeToString([]byte(s)), nil
}

func base64Decode(args []any, focus any) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("$base64decode requires 1 argument")
	}
	s, ok := fmtToString(args[0])
	if !ok {
		return nil, nil
	}
	decoded, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		return nil, err
	}
	return string(decoded), nil
}

func urlEncode(args []any, focus any) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("$urlencode requires 1 argument")
	}
	s, ok := fmtToString(args[0])
	if !ok {
		return nil, nil
	}
	return url.QueryEscape(s), nil
}

func urlDecode(args []any, focus any) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("$urldecode requires 1 argument")
	}
	s, ok := fmtToString(args[0])
	if !ok {
		return nil, nil
	}
	decoded, err := url.QueryUnescape(s)
	if err != nil {
		return nil, err
	}
	return decoded, nil
}

func csvFormat(args []any, focus any) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("$csv requires 1 argument")
	}
	arr, ok := args[0].([]any)
	if !ok {
		return nil, nil
	}
	fields := make([]string, 0, len(arr))
	for _, v := range arr {
		s, _ := fmtToString(v)
		if strings.ContainsAny(s, ",\"\n\r") {
			s = `"` + strings.ReplaceAll(s, `"`, `""`) + `"`
		}
		fields = append(fields, s)
	}
	return strings.Join(fields, ","), nil
}

func tsvFormat(args []any, focus any) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("$tsv requires 1 argument")
	}
	arr, ok := args[0].([]any)
	if !ok {
		return nil, nil
	}
	fields := make([]string, 0, len(arr))
	for _, v := range arr {
		s, _ := fmtToString(v)
		s = strings.ReplaceAll(s, "\t", " ")
		s = strings.ReplaceAll(s, "\n", " ")
		s = strings.ReplaceAll(s, "\r", " ")
		fields = append(fields, s)
	}
	return strings.Join(fields, "\t"), nil
}

func htmlEscape(args []any, focus any) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("$htmlescape requires 1 argument")
	}
	s, ok := fmtToString(args[0])
	if !ok {
		return nil, nil
	}
	return html.EscapeString(s), nil
}

// fmtToString coerces a JSONata value to a string for format functions.
func fmtToString(v any) (string, bool) {
	switch val := v.(type) {
	case string:
		return val, true
	case float64:
		if math.Floor(val) == val && !math.IsInf(val, 0) &&
			val >= math.MinInt64 && val <= math.MaxInt64 {
			return fmt.Sprintf("%d", int64(val)), true
		}
		return fmt.Sprintf("%g", val), true
	case json.Number:
		return val.String(), true
	case int64:
		return fmt.Sprintf("%d", val), true
	case bool:
		if val {
			return "true", true
		}
		return "false", true
	case nil:
		return "", false
	case []any, map[string]any:
		b, _ := json.Marshal(val)
		return string(b), true
	}
	return fmt.Sprintf("%v", v), true
}

// evalWithFormats evaluates a JSONata expression, using GJSON fast path when
// possible and falling back to full evaluation with custom format functions.
func evalWithFormats(expr *gnata.Expression, jsonData string) (any, error) {
	if expr.IsFastPath() || expr.IsFuncFastPath() || expr.IsComparisonFastPath() {
		return expr.EvalBytes(context.Background(), json.RawMessage(jsonData))
	}
	parsed, err := gnata.DecodeJSON(json.RawMessage(jsonData))
	if err != nil {
		return nil, err
	}
	return expr.EvalWithCustomFuncs(context.Background(), parsed, formatEnv)
}
