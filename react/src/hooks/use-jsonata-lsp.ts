import { useJsonataWasm, type UseJsonataLspOptions, type WasmState } from './use-jsonata-wasm';

/**
 * Lightweight hook for editor-only mode — loads just the LSP WASM (145 KB gzipped).
 *
 * The most common use case: embed a JSONata expression editor with autocomplete,
 * hover docs, and diagnostics. Evaluation runs on the backend, not in the browser.
 *
 * Works with zero configuration after setup:
 * ```bash
 * npx @gnata-sqlite/react setup ./public
 * ```
 *
 * ```tsx
 * const lsp = useJsonataLsp();
 *
 * <JsonataEditor
 *   value={expression}
 *   onChange={setExpression}
 *   gnataDiagnostics={lsp.gnataDiagnostics}
 *   gnataCompletions={lsp.gnataCompletions}
 *   gnataHover={lsp.gnataHover}
 * />
 * ```
 *
 * No gnata.wasm (5.3MB) download needed. No eval in the browser.
 */
export function useJsonataLsp(options: UseJsonataLspOptions = {}): WasmState {
  return useJsonataWasm({
    lspWasmUrl: options.lspWasmUrl,
    lspExecUrl: options.lspExecUrl,
  });
}
