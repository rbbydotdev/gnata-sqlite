package parser

import "fmt"

// ParseError is a structured error returned by the parser and lexer.
// It satisfies the error interface and preserves the same string format
// as previous fmt.Errorf-based errors, but exposes structured fields
// for consumers that need position information (e.g., LSP diagnostics).
type ParseError struct {
	Code  string // error code: S0101, S0201, S0402, etc.
	Token string // token that triggered the error
	Msg   string // human-readable description
	Pos   int    // byte offset in source (-1 if unknown)
}

func (e *ParseError) Error() string {
	if e.Token != "" {
		return fmt.Sprintf("JSONata error %s at token %q: %s", e.Code, e.Token, e.Msg)
	}
	return fmt.Sprintf("JSONata error %s: %s", e.Code, e.Msg)
}
