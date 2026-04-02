// Hooks
export {
  useJsonataWasm,
  LSP_WASM_DEFAULT_URL,
  LSP_EXEC_DEFAULT_URL,
  type UseJsonataWasmOptions,
  type UseJsonataLspOptions,
  type WasmState,
} from './hooks/use-jsonata-wasm';
export { useJsonataLsp } from './hooks/use-jsonata-lsp';
export {
  useJsonataEval,
  type JsonataEvalResult,
} from './hooks/use-jsonata-eval';
export { useJsonataSchema } from './hooks/use-jsonata-schema';
export {
  useJsonataEditor,
  type UseJsonataEditorOptions,
  type UseJsonataEditorReturn,
} from './hooks/use-jsonata-editor';

// Components
export { JsonataEditor, type JsonataEditorProps } from './components/JsonataEditor';
export { JsonataInput, type JsonataInputProps } from './components/JsonataInput';
export { JsonataResult, type JsonataResultProps } from './components/JsonataResult';
export { JsonataPlayground, type JsonataPlaygroundProps } from './components/JsonataPlayground';

// Theme
export {
  tokyoNightTheme,
  tooltipTheme,
  createEditorTheme,
  createHighlightStyle,
  darkColors,
  lightColors,
  darkTokenColors,
  lightTokenColors,
  type ColorPalette,
  type CMTokenColors,
} from './theme';

// Utilities
export {
  jsonataStreamLanguage,
  buildSchema,
  collectKeys,
  allKeysFromJson,
  formatHoverMarkdown,
  formatTiming,
  type Schema,
  type SchemaField,
} from './utils';
