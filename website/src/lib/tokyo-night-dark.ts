import type { ThemeRegistrationRaw } from 'shiki';

/**
 * Custom Tokyo Night dark theme for Shiki — matches the playground's CodeMirror colors.
 * The built-in shiki tokyo-night uses slightly different colors for some tokens.
 */
export const tokyoNightDark: ThemeRegistrationRaw = {
  name: 'tokyo-night-custom',
  type: 'dark',
  settings: [
    // Global defaults
    { settings: { foreground: '#c0caf5', background: '#1a1b26' } },

    // Comments
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#565f89' } },

    // Strings
    { scope: ['string', 'string.quoted', 'string.template'], settings: { foreground: '#9ece6a' } },

    // Numbers
    { scope: ['constant.numeric', 'constant.numeric.decimal', 'constant.numeric.integer', 'constant.numeric.float', 'constant.numeric.hex'], settings: { foreground: '#ff9e64' } },

    // Booleans
    { scope: ['constant.language.boolean', 'constant.language'], settings: { foreground: '#ff9e64' } },
    { scope: ['constant.language.null', 'constant.language.undefined'], settings: { foreground: '#565f89' } },

    // Keywords
    { scope: ['keyword', 'storage.type', 'storage.modifier', 'keyword.control', 'keyword.control.import', 'keyword.control.from', 'keyword.control.export', 'keyword.control.default', 'keyword.control.return', 'keyword.control.conditional', 'keyword.control.loop'], settings: { foreground: '#bb9af7', fontStyle: 'bold' } },

    // Operators
    { scope: ['keyword.operator', 'keyword.operator.assignment', 'keyword.operator.comparison', 'keyword.operator.arithmetic', 'keyword.operator.logical', 'keyword.operator.ternary', 'keyword.operator.spread', 'keyword.operator.type.annotation'], settings: { foreground: '#89ddff' } },

    // Functions
    { scope: ['entity.name.function', 'support.function', 'meta.function-call entity.name.function', 'variable.function'], settings: { foreground: '#7aa2f7' } },

    // Types / classes
    { scope: ['entity.name.type', 'support.type', 'support.class', 'entity.name.class', 'support.type.builtin', 'keyword.type'], settings: { foreground: '#7aa2f7' } },

    // Variables — bright green like the playground
    { scope: ['variable', 'variable.other.readwrite', 'entity.name.variable', 'variable.parameter'], settings: { foreground: '#c0caf5' } },

    // Properties — teal
    { scope: ['variable.other.property', 'support.variable.property', 'meta.object-literal.key', 'variable.other.object.property', 'entity.name.tag.yaml'], settings: { foreground: '#73daca' } },

    // Punctuation — brackets, braces, parens
    { scope: ['punctuation.definition.block', 'punctuation.definition.parameters', 'punctuation.section', 'meta.brace.round', 'meta.brace.curly', 'meta.brace.square', 'punctuation.definition.binding-pattern'], settings: { foreground: '#698098' } },

    // Punctuation — separators, commas, semicolons, dots
    { scope: ['punctuation.separator', 'punctuation.terminator', 'punctuation.accessor', 'punctuation.separator.comma', 'punctuation.definition.string'], settings: { foreground: '#89ddff' } },

    // JSX/HTML tags — red/coral
    { scope: ['entity.name.tag', 'support.class.component'], settings: { foreground: '#f7768e' } },

    // JSX/HTML attributes — orange
    { scope: ['entity.other.attribute-name'], settings: { foreground: '#ff9e64' } },

    // Regex
    { scope: ['string.regexp'], settings: { foreground: '#b4f9f8' } },

    // Special — decorators
    { scope: ['meta.decorator', 'punctuation.decorator'], settings: { foreground: '#ff9e64' } },

    // SQL keywords — cyan blue like the playground
    { scope: ['keyword.other.DML', 'keyword.other.DDL', 'keyword.other.sql', 'keyword.other.create', 'keyword.other.data-integrity'], settings: { foreground: '#bb9af7', fontStyle: 'bold' } },

    // SQL functions
    { scope: ['support.function.aggregate', 'support.function.scalar', 'support.function.string'], settings: { foreground: '#7aa2f7' } },

    // Bash/shell
    { scope: ['keyword.control.shell', 'support.function.builtin.shell', 'entity.name.command.shell'], settings: { foreground: '#7aa2f7' } },
    { scope: ['string.unquoted.argument.shell', 'variable.other.normal.shell'], settings: { foreground: '#c0caf5' } },

    // Go
    { scope: ['entity.name.package.go', 'entity.name.import.go'], settings: { foreground: '#c0caf5' } },
    { scope: ['keyword.function.go', 'keyword.var.go', 'keyword.const.go', 'keyword.type.go', 'keyword.import.go', 'keyword.package.go'], settings: { foreground: '#bb9af7', fontStyle: 'bold' } },

    // Markdown
    { scope: ['markup.heading'], settings: { foreground: '#7aa2f7', fontStyle: 'bold' } },
    { scope: ['markup.bold'], settings: { fontStyle: 'bold' } },
    { scope: ['markup.italic'], settings: { fontStyle: 'italic' } },
    { scope: ['markup.inline.raw'], settings: { foreground: '#73daca' } },
  ],
};
