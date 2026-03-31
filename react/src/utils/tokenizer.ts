import { StreamLanguage, type StringStream } from '@codemirror/language';

const KEYWORDS = new Set(['and', 'or', 'in', 'true', 'false', 'null', 'function']);
const OPERATORS = new Set(['+', '-', '*', '/', '%', '&', '|', '=', '<', '>', '!', '~', '^', '?', ':', '.', ',', ';', '@', '#']);
const BRACKETS = new Set(['(', ')', '{', '}', '[', ']']);

/**
 * Stream-based JSONata tokenizer for CodeMirror 6.
 * Provides syntax highlighting for JSONata expressions.
 */
export const jsonataStreamLanguage = StreamLanguage.define({
  token(stream: StringStream): string | null {
    // Whitespace
    if (stream.eatSpace()) return null;

    // Block comments
    if (stream.match('/*')) {
      while (!stream.match('*/') && !stream.eol()) stream.next();
      return 'blockComment';
    }

    const ch = stream.peek();
    if (!ch) return null;

    // Strings
    if (ch === '"' || ch === "'") {
      const quote = stream.next();
      while (!stream.eol()) {
        const c = stream.next();
        if (c === quote) return 'string';
        if (c === '\\') stream.next();
      }
      return 'string';
    }

    // Numbers
    if (/[0-9]/.test(ch!)) {
      stream.match(/^[0-9]*\.?[0-9]*([eE][+-]?[0-9]+)?/);
      return 'number';
    }

    // Variables and functions ($name)
    if (ch === '$') {
      stream.next();
      stream.match(/^[a-zA-Z_$][a-zA-Z0-9_]*/);
      if (stream.peek() === '(') return 'typeName';
      return 'atom';
    }

    // Brackets
    if (BRACKETS.has(ch)) {
      stream.next();
      return 'paren';
    }

    // Multi-character operators
    if (
      stream.match('~>') || stream.match(':=') || stream.match('!=') ||
      stream.match('>=') || stream.match('<=') || stream.match('**') ||
      stream.match('..') || stream.match('?:') || stream.match('??')
    ) {
      return 'operator';
    }

    // Single-character operators
    if (OPERATORS.has(ch)) {
      stream.next();
      return 'operator';
    }

    // Identifiers and keywords
    if (/[a-zA-Z_`]/.test(ch)) {
      // Backtick-quoted identifiers
      if (ch === '`') {
        stream.next();
        while (!stream.eol() && stream.peek() !== '`') stream.next();
        if (stream.peek() === '`') stream.next();
        return 'variableName';
      }

      stream.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
      const word = stream.current();
      if (KEYWORDS.has(word)) {
        if (word === 'true' || word === 'false') return 'bool';
        if (word === 'null') return 'null';
        return 'keyword';
      }
      return 'variableName';
    }

    // Fallback: consume a character
    stream.next();
    return null;
  },
});
