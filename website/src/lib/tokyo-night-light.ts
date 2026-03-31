import type { ThemeRegistrationRaw } from 'shiki';

/**
 * Tokyo Night Day theme for Shiki — matches the playground.html light mode.
 * Colors from the original playground's CodeMirror light config.
 *
 * Uses `settings` array (TextMate format) — not `tokenColors`.
 * First entry (no scope) = global foreground/background.
 */
export const tokyoNightLight: ThemeRegistrationRaw = {
  name: 'tokyo-night-light',
  type: 'light',
  settings: [
    // Global defaults
    { settings: { foreground: '#3760bf', background: '#e1e2e7' } },

    // Comments
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#848cb5' } },

    // Strings
    { scope: ['string', 'string.quoted', 'string.template'], settings: { foreground: '#587539' } },

    // Numbers
    { scope: ['constant.numeric', 'constant.numeric.decimal', 'constant.numeric.integer', 'constant.numeric.float', 'constant.numeric.hex'], settings: { foreground: '#b15c00' } },

    // Booleans + null
    { scope: ['constant.language.boolean', 'constant.language'], settings: { foreground: '#b15c00' } },
    { scope: ['constant.language.null', 'constant.language.undefined'], settings: { foreground: '#848cb5' } },

    // Keywords (import, from, export, const, let, function, return, if, else, etc.)
    { scope: ['keyword', 'storage.type', 'storage.modifier', 'keyword.control', 'keyword.control.import', 'keyword.control.from', 'keyword.control.export', 'keyword.control.default'], settings: { foreground: '#7847bd' } },

    // Operators
    { scope: ['keyword.operator', 'keyword.operator.assignment', 'keyword.operator.comparison', 'keyword.operator.arithmetic', 'keyword.operator.logical', 'keyword.operator.ternary', 'keyword.operator.spread', 'keyword.operator.rest', 'keyword.operator.type.annotation', 'keyword.operator.expression.typeof', 'keyword.operator.expression.in', 'keyword.operator.expression.of'], settings: { foreground: '#d20065' } },

    // Functions
    { scope: ['entity.name.function', 'support.function', 'meta.function-call entity.name.function', 'variable.function'], settings: { foreground: '#2e7de9' } },

    // Types / classes
    { scope: ['entity.name.type', 'support.type', 'support.class', 'entity.name.class', 'support.type.builtin', 'keyword.type'], settings: { foreground: '#2e7de9' } },

    // Variables
    { scope: ['variable', 'variable.other.readwrite', 'entity.name.variable', 'variable.parameter'], settings: { foreground: '#3760bf' } },

    // Properties
    { scope: ['variable.other.property', 'support.variable.property', 'meta.object-literal.key', 'variable.other.object.property', 'entity.name.tag.yaml'], settings: { foreground: '#118c74' } },

    // Punctuation — brackets, braces, parens
    { scope: ['punctuation.definition.block', 'punctuation.definition.parameters', 'punctuation.section', 'meta.brace.round', 'meta.brace.curly', 'meta.brace.square', 'punctuation.definition.binding-pattern'], settings: { foreground: '#848cb5' } },

    // Punctuation — separators, commas, semicolons
    { scope: ['punctuation.separator', 'punctuation.terminator', 'punctuation.accessor', 'punctuation.separator.comma', 'punctuation.definition.string'], settings: { foreground: '#848cb5' } },

    // JSX/HTML tags
    { scope: ['entity.name.tag', 'support.class.component'], settings: { foreground: '#f52a65' } },

    // JSX/HTML attributes
    { scope: ['entity.other.attribute-name'], settings: { foreground: '#b15c00' } },

    // Regex
    { scope: ['string.regexp'], settings: { foreground: '#2e7de9' } },

    // Special — decorators, annotations
    { scope: ['meta.decorator', 'punctuation.decorator'], settings: { foreground: '#b15c00' } },

    // SQL keywords (for SQL code blocks)
    { scope: ['keyword.other.DML', 'keyword.other.DDL', 'keyword.other.sql', 'keyword.other.create', 'keyword.other.data-integrity'], settings: { foreground: '#7847bd' } },

    // SQL functions
    { scope: ['support.function.aggregate', 'support.function.scalar', 'support.function.string'], settings: { foreground: '#2e7de9' } },

    // Bash/shell
    { scope: ['keyword.control.shell', 'support.function.builtin.shell', 'entity.name.command.shell'], settings: { foreground: '#2e7de9' } },
    { scope: ['string.unquoted.argument.shell', 'variable.other.normal.shell'], settings: { foreground: '#3760bf' } },

    // Go
    { scope: ['entity.name.package.go', 'entity.name.import.go'], settings: { foreground: '#3760bf' } },
    { scope: ['keyword.function.go', 'keyword.var.go', 'keyword.const.go', 'keyword.type.go', 'keyword.import.go', 'keyword.package.go'], settings: { foreground: '#7847bd' } },
  ],
};
