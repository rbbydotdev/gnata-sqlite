package main

import (
	"strings"

	"github.com/rbbydotdev/gnata-sqlite/internal/lexer"
)

// completions returns a JSON array of CodeMirror completion items for the given
// expression, cursor byte offset, and schema JSON string.
func completions(expr string, cursorPos int, schemaJSON string) string {
	if cursorPos > len(expr) {
		cursorPos = len(expr)
	}

	// Parse schema (nil is fine — just means no field completions).
	schema := parseSchema(schemaJSON)

	// Lex from 0 to cursorPos to determine context.
	prefix := expr[:cursorPos]
	tokens := lexTokens(prefix)

	ctx := classifyContext(tokens, prefix)

	var b strings.Builder
	switch ctx.kind {
	case ctxFunction:
		marshalFuncCompletions(&b, ctx.prefix)
	case ctxField:
		marshalFieldCompletions(&b, schema, ctx.path, ctx.prefix)
	case ctxTopLevel:
		marshalTopLevelCompletions(&b, schema, ctx.prefix)
	default:
		b.WriteString("[]")
	}
	return b.String()
}

type contextKind int

const (
	ctxEmpty    contextKind = iota
	ctxFunction             // after $ — suggest function names
	ctxField                // after . — suggest schema fields at resolved path
	ctxTopLevel             // start of expression or after operator — suggest fields + functions
)

type completionContext struct {
	kind   contextKind
	prefix string   // partial text typed so far (for filtering)
	path   []string // resolved field path (for dot-completions)
}

// lexTokens lexes the expression prefix, collecting all tokens.
// Stops on error or EOF — partial expressions are expected.
func lexTokens(src string) []lexer.Token {
	l := lexer.NewLexer(src)
	var tokens []lexer.Token
	infix := false
	for {
		tok, err := l.Next(infix)
		if err != nil || tok.Type == lexer.TokenEOF {
			break
		}
		tokens = append(tokens, tok)

		// Track infix state like the parser does.
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

func classifyContext(tokens []lexer.Token, prefix string) completionContext {
	if len(tokens) == 0 {
		// Empty or just whitespace — suggest everything.
		return completionContext{kind: ctxTopLevel}
	}

	last := tokens[len(tokens)-1]

	// Check if the cursor is in the middle of typing a variable name.
	// e.g., "$sub" — the last token is a Variable with value "sub".
	if last.Type == lexer.TokenVariable {
		return completionContext{kind: ctxFunction, prefix: last.Value}
	}

	// If the very last character is '$' but not yet a full variable token,
	// check the raw prefix string.
	if len(prefix) > 0 && prefix[len(prefix)-1] == '$' {
		return completionContext{kind: ctxFunction}
	}

	// After a dot — field completion with path resolution.
	if last.Type == lexer.TokenDot {
		path := collectPathBeforeDot(tokens)
		return completionContext{kind: ctxField, path: path}
	}

	// After a name that follows a dot — partial field name.
	if last.Type == lexer.TokenName && len(tokens) >= 2 {
		prev := tokens[len(tokens)-2]
		if prev.Type == lexer.TokenDot {
			path := collectPathBeforeDot(tokens[:len(tokens)-1])
			return completionContext{kind: ctxField, path: path, prefix: last.Value}
		}
	}

	// After a name at the start — could be a partial top-level field.
	if last.Type == lexer.TokenName && len(tokens) == 1 {
		return completionContext{kind: ctxTopLevel, prefix: last.Value}
	}

	// After operators, commas, open brackets — suggest everything.
	switch last.Type {
	case lexer.TokenPlus, lexer.TokenMinus, lexer.TokenStar, lexer.TokenSlash,
		lexer.TokenPercent, lexer.TokenEquals, lexer.TokenNE, lexer.TokenLT,
		lexer.TokenGT, lexer.TokenLE, lexer.TokenGE, lexer.TokenAnd,
		lexer.TokenOr, lexer.TokenIn, lexer.TokenAmp, lexer.TokenComma,
		lexer.TokenLParen, lexer.TokenLBracket, lexer.TokenColon,
		lexer.TokenSemicolon, lexer.TokenAssign, lexer.TokenQuestion,
		lexer.TokenChain:
		return completionContext{kind: ctxTopLevel}
	}

	return completionContext{kind: ctxEmpty}
}

// collectPathBeforeDot walks backward through tokens to build the field path
// leading up to a trailing dot. e.g., for "Account.Order." → ["Account", "Order"]
func collectPathBeforeDot(tokens []lexer.Token) []string {
	var path []string
	// Walk backward: expect alternating Name, Dot, Name, Dot, ...
	i := len(tokens) - 1
	if i >= 0 && tokens[i].Type == lexer.TokenDot {
		i-- // skip the trailing dot
	}
	for i >= 0 {
		if tokens[i].Type == lexer.TokenName {
			path = append(path, tokens[i].Value)
			i--
			if i >= 0 && tokens[i].Type == lexer.TokenDot {
				i--
			} else {
				break
			}
		} else {
			break
		}
	}
	// Reverse to get correct order.
	for l, r := 0, len(path)-1; l < r; l, r = l+1, r-1 {
		path[l], path[r] = path[r], path[l]
	}
	return path
}

func marshalFieldCompletions(b *strings.Builder, schema *schemaNode, path []string, prefix string) {
	fields := resolveFields(schema, path)
	b.WriteByte('[')
	first := true
	for name, node := range fields {
		if prefix != "" && !strings.HasPrefix(name, prefix) {
			continue
		}
		if !first {
			b.WriteByte(',')
		}
		first = false
		b.WriteString(`{"label":`)
		marshalString(b, name)
		if node != nil && node.Type != "" {
			b.WriteString(`,"type":"`)
			b.WriteString(node.Type)
			b.WriteByte('"')
		} else {
			b.WriteString(`,"type":"property"`)
		}
		b.WriteString(`,"boost":2}`)
	}
	b.WriteByte(']')
}

func marshalTopLevelCompletions(b *strings.Builder, schema *schemaNode, prefix string) {
	b.WriteByte('[')
	first := true

	// Schema fields at root level.
	if schema != nil && schema.Fields != nil {
		for name, node := range schema.Fields {
			if prefix != "" && !strings.HasPrefix(name, prefix) {
				continue
			}
			if !first {
				b.WriteByte(',')
			}
			first = false
			b.WriteString(`{"label":`)
			marshalString(b, name)
			if node != nil && node.Type != "" {
				b.WriteString(`,"type":"`)
				b.WriteString(node.Type)
				b.WriteByte('"')
			} else {
				b.WriteString(`,"type":"property"`)
			}
			b.WriteString(`,"boost":2}`)
		}
	}

	// Functions (lower boost so fields rank first).
	for _, f := range builtinFuncs {
		if prefix != "" && !strings.HasPrefix("$"+f.Name, prefix) && !strings.HasPrefix(f.Name, prefix) {
			continue
		}
		if !first {
			b.WriteByte(',')
		}
		first = false
		b.WriteString(`{"label":"$`)
		b.WriteString(f.Name)
		b.WriteString(`","type":"function","detail":`)
		marshalString(b, f.Sig+" — "+f.Detail)
		b.WriteString(`,"boost":1}`)
	}

	// Keywords.
	keywords := []string{"true", "false", "null", "function", "and", "or", "in"}
	for _, kw := range keywords {
		if prefix != "" && !strings.HasPrefix(kw, prefix) {
			continue
		}
		if !first {
			b.WriteByte(',')
		}
		first = false
		b.WriteString(`{"label":`)
		marshalString(b, kw)
		b.WriteString(`,"type":"keyword","boost":0}`)
	}

	b.WriteByte(']')
}
