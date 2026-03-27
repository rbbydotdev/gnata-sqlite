package main

import (
	"strings"

	"github.com/rbbydotdev/gnata-sqlite/internal/lexer"
)

// hover returns a JSON string with hover information for the token at cursorPos.
// Returns "" if there's nothing to show.
// Format: {"from":N,"to":N,"text":"markdown content"}
//
// schemaJSON is optional — if provided, field names will show type info from the schema.
func hover(expr string, cursorPos int, schemaJSON ...string) string {
	if cursorPos > len(expr) {
		cursorPos = len(expr)
	}
	if expr == "" {
		return ""
	}

	// Lex the full expression to find the token at the cursor.
	tokens := lexAllTokens(expr)
	tok, idx, ok := tokenAtPos(tokens, expr, cursorPos)
	if !ok {
		return ""
	}

	var b strings.Builder

	switch tok.Type {
	case lexer.TokenVariable:
		// $funcName — look up in builtins
		name := tok.Value
		if name == "" || name == "$" {
			writeHoverResult(&b, tok.Pos, tok.Pos+1, "**$$** — context variable\n\nReferences the current input data at this point in the expression.")
			return b.String()
		}
		for _, f := range builtinFuncs {
			if f.Name == name {
				writeHoverResult(&b, tok.Pos, tok.Pos+1+len(name), formatFuncDoc(f))
				return b.String()
			}
		}
		// User-defined variable
		writeHoverResult(&b, tok.Pos, tok.Pos+1+len(name), "**$"+name+"** — variable")
		return b.String()

	case lexer.TokenValue:
		// true, false, null
		writeHoverResult(&b, tok.Pos, tok.Pos+len(tok.Value), "**"+tok.Value+"** — literal value")
		return b.String()

	case lexer.TokenAnd:
		writeHoverResult(&b, tok.Pos, tok.Pos+3, "**and** — logical AND\n\nReturns `true` if both operands are truthy.\n\n```\nexpr1 and expr2\n```")
		return b.String()

	case lexer.TokenOr:
		writeHoverResult(&b, tok.Pos, tok.Pos+2, "**or** — logical OR\n\nReturns `true` if either operand is truthy.\n\n```\nexpr1 or expr2\n```")
		return b.String()

	case lexer.TokenIn:
		writeHoverResult(&b, tok.Pos, tok.Pos+2, "**in** — membership test\n\nTests whether the left value is contained in the right array.\n\n```\nvalue in array\n```")
		return b.String()

	case lexer.TokenChain:
		writeHoverResult(&b, tok.Pos, tok.Pos+2, "**~>** — chain operator\n\nPipes the left expression as input to the right function.\n\n```\nexpr ~> $func\n```\n\nEquivalent to `$func(expr)`.")
		return b.String()

	case lexer.TokenDotDot:
		writeHoverResult(&b, tok.Pos, tok.Pos+2, "**..** — range / descendants\n\nNavigates all descendants recursively.\n\n```\n**..**field\n```")
		return b.String()

	case lexer.TokenQuestion:
		writeHoverResult(&b, tok.Pos, tok.Pos+1, "**?** — filter\n\nFilters an array based on a predicate expression.\n\n```\narray[predicate]\n```")
		return b.String()

	case lexer.TokenAssign:
		writeHoverResult(&b, tok.Pos, tok.Pos+2, "**:=** — variable binding\n\nBinds a value to a variable name.\n\n```\n$x := expression\n```")
		return b.String()

	case lexer.TokenName:
		// Check if this is a keyword-like name
		switch tok.Value {
		case "function":
			writeHoverResult(&b, tok.Pos, tok.Pos+8, "**function** — lambda declaration\n\nDeclares an anonymous function.\n\n```\nfunction($x, $y) { $x + $y }\n```")
			return b.String()
		}

		// Field name — try to resolve against schema
		var sJSON string
		if len(schemaJSON) > 0 {
			sJSON = schemaJSON[0]
		}
		if sJSON != "" {
			schema := parseSchema(sJSON)
			if schema != nil {
				path := collectFieldPath(tokens, idx)
				if doc := resolveFieldDoc(schema, path); doc != "" {
					writeHoverResult(&b, tok.Pos, tok.Pos+len(tok.Value), doc)
					return b.String()
				}
			}
		}
	}

	return ""
}

// collectFieldPath builds the dotted field path ending at tokens[idx].
// e.g. for "event.severity" with cursor on "severity", returns ["event", "severity"].
func collectFieldPath(tokens []lexer.Token, idx int) []string {
	var path []string
	path = append(path, tokens[idx].Value)
	i := idx - 1
	for i >= 0 {
		if tokens[i].Type == lexer.TokenDot && i > 0 && tokens[i-1].Type == lexer.TokenName {
			path = append(path, tokens[i-1].Value)
			i -= 2
		} else {
			break
		}
	}
	// Reverse
	for l, r := 0, len(path)-1; l < r; l, r = l+1, r-1 {
		path[l], path[r] = path[r], path[l]
	}
	return path
}

// resolveFieldDoc walks the schema tree for the given path and returns hover markdown.
func resolveFieldDoc(schema *schemaNode, path []string) string {
	if schema == nil || len(path) == 0 {
		return ""
	}

	node := schema
	var resolvedParts []string
	for _, part := range path {
		if node.Fields == nil {
			return ""
		}
		child, ok := node.Fields[part]
		if !ok {
			return ""
		}
		resolvedParts = append(resolvedParts, part)
		node = child
	}

	if node == nil {
		return ""
	}

	var b strings.Builder
	b.WriteString("**")
	for i, p := range resolvedParts {
		if i > 0 {
			b.WriteByte('.')
		}
		b.WriteString(p)
	}
	b.WriteString("**")

	if node.Type != "" {
		b.WriteString(" `")
		b.WriteString(node.Type)
		b.WriteString("`")
	}

	// Show child fields if it's an object
	if node.Fields != nil && len(node.Fields) > 0 {
		b.WriteString("\n\nFields: ")
		first := true
		for name := range node.Fields {
			if !first {
				b.WriteString(", ")
			}
			first = false
			b.WriteString("`")
			b.WriteString(name)
			b.WriteString("`")
		}
	}

	return b.String()
}

// lexAllTokens lexes the entire expression, collecting all tokens including their positions.
func lexAllTokens(expr string) []lexer.Token {
	l := lexer.NewLexer(expr)
	var tokens []lexer.Token
	infix := false
	for {
		tok, err := l.Next(infix)
		if err != nil || tok.Type == lexer.TokenEOF {
			break
		}
		tokens = append(tokens, tok)
		switch tok.Type {
		case lexer.TokenName, lexer.TokenVariable, lexer.TokenString,
			lexer.TokenNumber, lexer.TokenValue, lexer.TokenRegex,
			lexer.TokenRBracket, lexer.TokenRParen, lexer.TokenRBrace,
			lexer.TokenStar, lexer.TokenStarStar, lexer.TokenPercent:
			infix = true
		default:
			infix = false
		}
	}
	return tokens
}

// tokenAtPos finds the token whose span covers cursorPos, returning the token and its index.
func tokenAtPos(tokens []lexer.Token, expr string, cursorPos int) (lexer.Token, int, bool) {
	for i, tok := range tokens {
		start := tok.Pos
		end := tokenEnd(tok, tokens, i, expr)
		if cursorPos >= start && cursorPos <= end {
			return tok, i, true
		}
	}
	return lexer.Token{}, -1, false
}

// tokenEnd estimates the end byte offset for a token.
func tokenEnd(tok lexer.Token, _ []lexer.Token, _ int, _ string) int {
	switch tok.Type {
	case lexer.TokenVariable:
		return tok.Pos + 1 + len(tok.Value) // $ + name
	case lexer.TokenName:
		return tok.Pos + len(tok.Value)
	case lexer.TokenString:
		return tok.Pos + len(tok.Value) + 2 // quotes
	case lexer.TokenNumber:
		return tok.Pos + len(tok.Value)
	case lexer.TokenValue:
		return tok.Pos + len(tok.Value)
	case lexer.TokenAnd:
		return tok.Pos + 3
	case lexer.TokenOr:
		return tok.Pos + 2
	case lexer.TokenIn:
		return tok.Pos + 2
	case lexer.TokenChain, lexer.TokenDotDot, lexer.TokenAssign,
		lexer.TokenNE, lexer.TokenLE, lexer.TokenGE,
		lexer.TokenStarStar, lexer.TokenElvis, lexer.TokenCoalesce:
		return tok.Pos + 2
	default:
		return tok.Pos + 1
	}
}

func writeHoverResult(b *strings.Builder, from, to int, text string) {
	b.WriteString(`{"from":`)
	writeInt(b, from)
	b.WriteString(`,"to":`)
	writeInt(b, to)
	b.WriteString(`,"text":`)
	marshalString(b, text)
	b.WriteByte('}')
}

func writeInt(b *strings.Builder, n int) {
	if n < 0 {
		b.WriteByte('-')
		n = -n
	}
	if n >= 10 {
		writeInt(b, n/10)
	}
	b.WriteByte(byte('0' + n%10))
}

func formatFuncDoc(f funcInfo) string {
	var b strings.Builder
	b.WriteString("**$")
	b.WriteString(f.Name)
	b.WriteString("**")

	if f.Sig != "" {
		b.WriteString(" `")
		b.WriteString(f.Sig)
		b.WriteString("`")
	}

	b.WriteString("\n\n")
	b.WriteString(f.Detail)

	if f.Doc != "" {
		b.WriteString("\n\n")
		b.WriteString(f.Doc)
	}

	return b.String()
}
