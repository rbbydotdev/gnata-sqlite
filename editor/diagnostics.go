package main

import (
	"errors"
	"strconv"
	"strings"

	"github.com/rbbydotdev/gnata-sqlite/internal/lexer"
	"github.com/rbbydotdev/gnata-sqlite/internal/parser"
)

// diagnostics parses an expression and returns a JSON array of CodeMirror-compatible
// diagnostic objects: [{"from": int, "to": int, "severity": "error", "message": "..."}]
func diagnostics(expr string) string {
	p := parser.NewParser(expr)
	_, err := p.Parse()
	if err == nil {
		return "[]"
	}

	var b strings.Builder
	b.WriteByte('[')

	var pe *parser.ParseError
	var le *lexer.LexError
	if errors.As(err, &pe) {
		writeDiagnostic(&b, pe.Pos, pe.Pos+len(pe.Token), len(expr), pe.Code+": "+pe.Msg)
	} else if errors.As(err, &le) {
		writeDiagnostic(&b, le.Pos, le.Pos+1, len(expr), le.Code+": "+le.Msg)
	} else {
		// Fallback for unknown error types — mark the whole expression.
		writeDiagnostic(&b, 0, len(expr), len(expr), err.Error())
	}

	b.WriteByte(']')
	return b.String()
}

func writeDiagnostic(b *strings.Builder, from, to, exprLen int, message string) {
	if from < 0 {
		from = 0
	}
	if to <= from {
		to = from + 1
	}
	if to > exprLen {
		to = exprLen
	}
	if from >= exprLen && exprLen > 0 {
		from = exprLen - 1
	}

	b.WriteString(`{"from":`)
	b.WriteString(strconv.Itoa(from))
	b.WriteString(`,"to":`)
	b.WriteString(strconv.Itoa(to))
	b.WriteString(`,"severity":"error","message":`)
	marshalString(b, message)
	b.WriteByte('}')
}
