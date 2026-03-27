package main

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
)

// marshalAny serializes a gnata result value to JSON without using reflect.
// Reused from the WASM module (wasm/main.go).
func marshalAny(buf *strings.Builder, v any) {
	switch val := v.(type) {
	case nil:
		buf.WriteString("null")
	case bool:
		if val {
			buf.WriteString("true")
		} else {
			buf.WriteString("false")
		}
	case float64:
		marshalFloat(buf, val)
	case json.Number:
		buf.WriteString(string(val))
	case string:
		marshalString(buf, val)
	case []any:
		buf.WriteByte('[')
		for i, elem := range val {
			if i > 0 {
				buf.WriteByte(',')
			}
			marshalAny(buf, elem)
		}
		buf.WriteByte(']')
	case map[string]any:
		buf.WriteByte('{')
		first := true
		for k, mv := range val {
			if !first {
				buf.WriteByte(',')
			}
			first = false
			marshalString(buf, k)
			buf.WriteByte(':')
			marshalAny(buf, mv)
		}
		buf.WriteByte('}')
	}
}

func marshalFloat(buf *strings.Builder, val float64) {
	if math.IsInf(val, 0) || math.IsNaN(val) {
		buf.WriteString("null")
		return
	}
	buf.WriteString(strconv.FormatFloat(val, 'f', -1, 64))
}

func marshalString(buf *strings.Builder, s string) {
	buf.WriteByte('"')
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch c {
		case '"':
			buf.WriteString(`\"`)
		case '\\':
			buf.WriteString(`\\`)
		case '\n':
			buf.WriteString(`\n`)
		case '\r':
			buf.WriteString(`\r`)
		case '\t':
			buf.WriteString(`\t`)
		default:
			if c < 0x20 {
				buf.WriteString(fmt.Sprintf(`\u%04x`, c))
			} else {
				buf.WriteByte(c)
			}
		}
	}
	buf.WriteByte('"')
}
