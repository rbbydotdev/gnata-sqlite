package main

// schemaNode represents one level of the document schema for autocompletion.
// Populated from a JSON schema string like:
//
//	{"fields":{"id":{"type":"number"},"data":{"type":"object","fields":{"name":{}}}}}
type schemaNode struct {
	Fields map[string]*schemaNode
	Type   string // optional: "number", "string", "object", "array", "boolean"
}

// parseSchema parses a minimal schema JSON string into a schemaNode tree.
// Hand-rolled parser — no encoding/json dependency.
// Returns nil on invalid input (non-fatal for completions).
func parseSchema(s string) *schemaNode {
	p := &schemaParser{src: s}
	return p.parseObject()
}

type schemaParser struct {
	src string
	pos int
}

func (p *schemaParser) skipWhitespace() {
	for p.pos < len(p.src) {
		c := p.src[p.pos]
		if c == ' ' || c == '\t' || c == '\n' || c == '\r' {
			p.pos++
		} else {
			break
		}
	}
}

func (p *schemaParser) peek() byte {
	p.skipWhitespace()
	if p.pos >= len(p.src) {
		return 0
	}
	return p.src[p.pos]
}

func (p *schemaParser) consume(expected byte) bool {
	p.skipWhitespace()
	if p.pos < len(p.src) && p.src[p.pos] == expected {
		p.pos++
		return true
	}
	return false
}

// readString reads a JSON string and returns its contents (unescaped is minimal — good enough for field names).
func (p *schemaParser) readString() (string, bool) {
	p.skipWhitespace()
	if p.pos >= len(p.src) || p.src[p.pos] != '"' {
		return "", false
	}
	p.pos++ // consume opening "
	start := p.pos
	for p.pos < len(p.src) {
		if p.src[p.pos] == '\\' {
			p.pos += 2 // skip escape
			continue
		}
		if p.src[p.pos] == '"' {
			s := p.src[start:p.pos]
			p.pos++ // consume closing "
			return s, true
		}
		p.pos++
	}
	return "", false
}

// skipValue skips any JSON value (string, number, object, array, true, false, null).
func (p *schemaParser) skipValue() {
	p.skipWhitespace()
	if p.pos >= len(p.src) {
		return
	}
	switch p.src[p.pos] {
	case '"':
		p.readString()
	case '{':
		p.skipBracketed('{', '}')
	case '[':
		p.skipBracketed('[', ']')
	default:
		// number, true, false, null
		for p.pos < len(p.src) {
			c := p.src[p.pos]
			if c == ',' || c == '}' || c == ']' {
				break
			}
			p.pos++
		}
	}
}

func (p *schemaParser) skipBracketed(open, close byte) {
	if p.pos >= len(p.src) || p.src[p.pos] != open {
		return
	}
	depth := 1
	p.pos++
	inString := false
	for p.pos < len(p.src) && depth > 0 {
		c := p.src[p.pos]
		if inString {
			if c == '\\' {
				p.pos++
			} else if c == '"' {
				inString = false
			}
		} else {
			switch c {
			case '"':
				inString = true
			case open:
				depth++
			case close:
				depth--
			}
		}
		p.pos++
	}
}

// parseObject parses a JSON object at the current position into a schemaNode.
func (p *schemaParser) parseObject() *schemaNode {
	if !p.consume('{') {
		return nil
	}
	node := &schemaNode{}
	for p.peek() != '}' && p.peek() != 0 {
		key, ok := p.readString()
		if !ok {
			return nil
		}
		if !p.consume(':') {
			return nil
		}

		switch key {
		case "fields":
			node.Fields = p.parseFieldsMap()
		case "type":
			t, ok := p.readString()
			if !ok {
				return nil
			}
			node.Type = t
		default:
			p.skipValue()
		}

		p.consume(',') // optional trailing comma
	}
	p.consume('}')
	return node
}

// parseFieldsMap parses {"fieldName": {schemaNode}, ...}.
func (p *schemaParser) parseFieldsMap() map[string]*schemaNode {
	if !p.consume('{') {
		return nil
	}
	fields := make(map[string]*schemaNode)
	for p.peek() != '}' && p.peek() != 0 {
		name, ok := p.readString()
		if !ok {
			return fields
		}
		if !p.consume(':') {
			return fields
		}
		child := p.parseObject()
		if child == nil {
			child = &schemaNode{}
		}
		fields[name] = child
		p.consume(',')
	}
	p.consume('}')
	return fields
}

// resolveFields walks the schema to find fields at a given path depth.
// path is the list of field names leading to the current position.
func resolveFields(root *schemaNode, path []string) map[string]*schemaNode {
	if root == nil {
		return nil
	}
	node := root
	for _, step := range path {
		if node.Fields == nil {
			return nil
		}
		child, ok := node.Fields[step]
		if !ok {
			return nil
		}
		node = child
	}
	return node.Fields
}
