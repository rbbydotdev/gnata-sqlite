import { useState, useEffect } from 'react';

// Augment the global Window interface for WASM-exposed functions
declare global {
  interface Window {
    // Standard Go WASM runtime
    Go: new () => GoInstance;
    // Eval WASM functions (from gnata.wasm, standard Go)
    _gnataEval: (...args: string[]) => string | Error;
    _gnataCompile: (expr: string) => string | Error;
    _gnataEvalHandle: (...args: string[]) => string | Error;
    _gnataReleaseHandle: (handle: string) => string | Error;
    // LSP WASM functions (from gnata-lsp.wasm, TinyGo)
    _gnataDiagnostics: (doc: string) => string | Error;
    _gnataCompletions: (doc: string, pos: number, schema: string) => string | Error;
    _gnataHover: (doc: string, pos: number, schema: string) => string | null;
  }
}

interface GoInstance {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): Promise<void>;
}

export interface UseJsonataWasmOptions {
  /** URL to gnata.wasm (evaluation engine, standard Go). Optional — omit for editor-only mode. */
  evalWasmUrl?: string;
  /** URL to wasm_exec.js (standard Go WASM runtime). Required if evalWasmUrl is given. */
  evalExecUrl?: string;
  /** URL to gnata-lsp.wasm (LSP engine, TinyGo, 85KB gzipped). Provides autocomplete, hover, diagnostics. */
  lspWasmUrl?: string;
  /** URL to lsp-wasm_exec.js (TinyGo WASM runtime). Required if lspWasmUrl is given. */
  lspExecUrl?: string;
}

/**
 * Shorthand options for editor-only mode — just the LSP, no eval engine.
 * The most common use case: embed an expression editor, run evaluation on the backend.
 */
export interface UseJsonataLspOptions {
  /** URL to gnata-lsp.wasm */
  lspWasmUrl: string;
  /** URL to lsp-wasm_exec.js */
  lspExecUrl: string;
}

export interface WasmState {
  /** True when the eval WASM module is loaded and ready */
  isReady: boolean;
  /** True when the LSP WASM module is loaded and ready */
  isLspReady: boolean;
  /** Error that occurred during WASM loading, if any */
  error: Error | null;
  /** Evaluate a JSONata expression against JSON data. Returns raw JSON string. */
  gnataEval: ((expr: string, data: string) => string) | null;
  /** Compile (validate) a JSONata expression. Returns handle or error. */
  gnataCompile: ((expr: string) => string) | null;
  /** Get diagnostics for a JSONata expression from LSP. Returns JSON array of diagnostics. */
  gnataDiagnostics: ((doc: string) => string) | null;
  /** Get completions at cursor position from LSP. Returns JSON array. */
  gnataCompletions: ((doc: string, pos: number, schema: string) => string) | null;
  /** Get hover info at cursor position from LSP. Returns JSON or null. */
  gnataHover: ((doc: string, pos: number, schema: string) => string | null) | null;
}

/**
 * Safe wrapper: if the WASM function returns an Error, throw it.
 * Returns only the non-Error result.
 */
function wrapWasmCall(fn: (...args: string[]) => string | Error, ...args: string[]): string {
  const result = fn(...args);
  if (result instanceof Error) throw result;
  return result;
}

/**
 * Load a script tag and await its load event.
 */
function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
    document.head.appendChild(script);
  });
}

/**
 * Hook to load and manage gnata WASM modules (eval + LSP).
 *
 * The eval module (gnata.wasm) provides expression evaluation.
 * The LSP module (gnata-lsp.wasm) provides diagnostics, completions, and hover info.
 *
 * Both are optional and loaded independently. The eval module is loaded first;
 * the LSP module is loaded in the background.
 */
export function useJsonataWasm(options: UseJsonataWasmOptions): WasmState {
  const [state, setState] = useState<WasmState>({
    isReady: false,
    isLspReady: false,
    error: null,
    gnataEval: null,
    gnataCompile: null,
    gnataDiagnostics: null,
    gnataCompletions: null,
    gnataHover: null,
  });

  useEffect(() => {
    let cancelled = false;

    // Poll for a global function to appear (handles StrictMode remount race)
    async function waitForGlobal(name: string, timeoutMs = 10000): Promise<boolean> {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (typeof (window as unknown as Record<string, unknown>)[name] === 'function') return true;
        await new Promise(r => setTimeout(r, 50));
        if (cancelled) return false;
      }
      return false;
    }

    function makeEvalFns() {
      const gnataEval = (expr: string, data: string): string =>
        wrapWasmCall(window._gnataEval, expr, data);
      const gnataCompile = (expr: string): string =>
        wrapWasmCall(window._gnataCompile, expr);
      return { gnataEval, gnataCompile };
    }

    async function loadEval() {
      // Editor-only mode: no eval WASM needed
      if (!options.evalWasmUrl || !options.evalExecUrl) return;

      try {
        // Fast path: already loaded (HMR, StrictMode remount after init)
        if (typeof window._gnataEval === 'function') {
          if (cancelled) return;
          setState(prev => ({ ...prev, isReady: true, ...makeEvalFns() }));
          return;
        }

        // If a previous mount started loading, wait for it to finish
        if (document.querySelector(`script[src="${options.evalExecUrl}"]`)) {
          const ready = await waitForGlobal('_gnataEval');
          if (cancelled) return;
          if (ready) {
            setState(prev => ({ ...prev, isReady: true, ...makeEvalFns() }));
            return;
          }
        }

        // Fresh load
        await loadScript(options.evalExecUrl);

        const GoConstructor = window.Go;
        if (!GoConstructor) {
          throw new Error('Go WASM runtime not available after loading wasm_exec.js');
        }

        const go = new GoConstructor();
        const resp = await fetch(options.evalWasmUrl);
        const result = await WebAssembly.instantiateStreaming(resp, go.importObject);

        // Start the Go runtime (runs in background)
        go.run(result.instance).catch((err: unknown) => {
          console.error('gnata WASM runtime exited:', err);
        });

        if (cancelled) return;

        setState(prev => ({ ...prev, isReady: true, ...makeEvalFns() }));
      } catch (err) {
        if (cancelled) return;
        setState(prev => ({
          ...prev,
          error: err instanceof Error ? err : new Error(String(err)),
        }));
      }
    }

    function makeLspFns() {
      const gnataDiagnostics = (doc: string): string => {
        const r = window._gnataDiagnostics(doc);
        if (r instanceof Error) throw r;
        return r;
      };
      const gnataCompletions = (doc: string, pos: number, schema: string): string => {
        const r = window._gnataCompletions(doc, pos, schema);
        if (r instanceof Error) throw r;
        return r;
      };
      const gnataHover = (doc: string, pos: number, schema: string): string | null =>
        window._gnataHover(doc, pos, schema);
      return { gnataDiagnostics, gnataCompletions, gnataHover };
    }

    async function loadLsp() {
      if (!options.lspWasmUrl || !options.lspExecUrl) return;

      try {
        // Check if LSP WASM is already loaded (StrictMode remount or HMR)
        if (typeof window._gnataDiagnostics === 'function') {
          if (cancelled) return;
          setState(prev => ({ ...prev, isLspReady: true, ...makeLspFns() }));
          return;
        }

        // If a previous mount started loading LSP, wait for it
        if (document.querySelector(`script[src="${options.lspExecUrl}"]`)) {
          const ready = await waitForGlobal('_gnataDiagnostics');
          if (cancelled) return;
          if (ready) {
            setState(prev => ({ ...prev, isLspReady: true, ...makeLspFns() }));
            return;
          }
        }

        // Save the standard Go constructor before loading TinyGo's version
        const StdGo = window.Go;

        await loadScript(options.lspExecUrl);

        const TinyGo = window.Go;
        // Restore standard Go constructor
        window.Go = StdGo;

        const lspGo = new TinyGo();
        const lspResp = await fetch(options.lspWasmUrl);
        const lspResult = await WebAssembly.instantiateStreaming(lspResp, lspGo.importObject);
        lspGo.run(lspResult.instance);

        if (cancelled) return;

        setState(prev => ({ ...prev, isLspReady: true, ...makeLspFns() }));
      } catch (err) {
        console.warn('LSP WASM not available:', err instanceof Error ? err.message : err);
      }
    }

    // Load eval first, then LSP in parallel
    // Load eval first (if requested), then LSP. Both are independent when eval is skipped.
    loadEval().then(() => loadLsp());

    return () => {
      cancelled = true;
    };
  }, [options.evalWasmUrl, options.evalExecUrl, options.lspWasmUrl, options.lspExecUrl]);

  return state;
}
