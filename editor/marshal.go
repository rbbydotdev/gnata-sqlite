package main

import (
	"strconv"
	"strings"

	"github.com/rbbydotdev/gnata-sqlite/internal/parser"
)

// marshalNode serializes a parser.Node to JSON without using encoding/json
// or reflect. Only non-zero fields are emitted to keep output compact.
func marshalNode(n *parser.Node, b *strings.Builder) {
	if n == nil {
		b.WriteString("null")
		return
	}
	b.WriteByte('{')
	first := true

	field := func(key string) {
		if !first {
			b.WriteByte(',')
		}
		first = false
		marshalString(b, key)
		b.WriteByte(':')
	}

	// Always emit type, value, pos.
	field("type")
	marshalString(b, n.Type)

	if n.Value != "" {
		field("value")
		marshalString(b, n.Value)
	}

	field("pos")
	b.WriteString(strconv.Itoa(n.Pos))

	if n.NumVal != 0 || n.Type == parser.NodeNumber {
		field("numVal")
		marshalFloat(b, n.NumVal)
	}

	if len(n.Steps) > 0 {
		field("steps")
		marshalNodeSlice(n.Steps, b)
	}

	if len(n.Expressions) > 0 {
		field("expressions")
		marshalNodeSlice(n.Expressions, b)
	}

	if len(n.LHS) > 0 {
		field("lhs")
		marshalNodeSlice(n.LHS, b)
	}

	if len(n.Arguments) > 0 {
		field("arguments")
		marshalNodeSlice(n.Arguments, b)
	}

	if n.Body != nil {
		field("body")
		marshalNode(n.Body, b)
	}

	if n.Procedure != nil {
		field("procedure")
		marshalNode(n.Procedure, b)
	}

	if n.Left != nil {
		field("left")
		marshalNode(n.Left, b)
	}

	if n.Right != nil {
		field("right")
		marshalNode(n.Right, b)
	}

	if n.Expression != nil {
		field("expression")
		marshalNode(n.Expression, b)
	}

	if n.Condition != nil {
		field("condition")
		marshalNode(n.Condition, b)
	}

	if n.Then != nil {
		field("then")
		marshalNode(n.Then, b)
	}

	if n.Else != nil {
		field("else")
		marshalNode(n.Else, b)
	}

	if len(n.Terms) > 0 {
		field("terms")
		b.WriteByte('[')
		for i, t := range n.Terms {
			if i > 0 {
				b.WriteByte(',')
			}
			b.WriteByte('{')
			marshalString(b, "descending")
			b.WriteByte(':')
			if t.Descending {
				b.WriteString("true")
			} else {
				b.WriteString("false")
			}
			b.WriteByte(',')
			marshalString(b, "expression")
			b.WriteByte(':')
			marshalNode(t.Expression, b)
			b.WriteByte('}')
		}
		b.WriteByte(']')
	}

	if n.Pattern != nil {
		field("pattern")
		marshalNode(n.Pattern, b)
	}

	if n.Update != nil {
		field("update")
		marshalNode(n.Update, b)
	}

	if n.Delete != nil {
		field("delete")
		marshalNode(n.Delete, b)
	}

	if n.Signature != nil {
		field("signature")
		marshalString(b, n.Signature.Raw)
	}

	if n.KeepArray {
		field("keepArray")
		b.WriteString("true")
	}

	if n.Focus != "" {
		field("focus")
		marshalString(b, n.Focus)
	}

	if n.Index != "" {
		field("index")
		marshalString(b, n.Index)
	}

	if n.Group != nil {
		field("group")
		b.WriteByte('{')
		marshalString(b, "pairs")
		b.WriteByte(':')
		b.WriteByte('[')
		for i, p := range n.Group.Pairs {
			if i > 0 {
				b.WriteByte(',')
			}
			b.WriteByte('[')
			marshalNode(p[0], b)
			b.WriteByte(',')
			marshalNode(p[1], b)
			b.WriteByte(']')
		}
		b.WriteByte(']')
		b.WriteByte('}')
	}

	b.WriteByte('}')
}

func marshalNodeSlice(nodes []*parser.Node, b *strings.Builder) {
	b.WriteByte('[')
	for i, n := range nodes {
		if i > 0 {
			b.WriteByte(',')
		}
		marshalNode(n, b)
	}
	b.WriteByte(']')
}

func marshalString(b *strings.Builder, s string) {
	b.WriteByte('"')
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch c {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			if c < 0x20 {
				b.WriteString(`\u00`)
				b.WriteByte("0123456789abcdef"[c>>4])
				b.WriteByte("0123456789abcdef"[c&0xf])
			} else {
				b.WriteByte(c)
			}
		}
	}
	b.WriteByte('"')
}

func marshalFloat(b *strings.Builder, val float64) {
	b.WriteString(strconv.FormatFloat(val, 'f', -1, 64))
}
