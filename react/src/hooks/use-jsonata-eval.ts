import { useState, useRef, useCallback, useEffect } from 'react';
import { formatTiming } from '../utils/schema';

export interface JsonataEvalResult {
  /** The evaluated result as a formatted string */
  result: string;
  /** Error message if evaluation failed */
  error: string | null;
  /** Whether the last evaluation was successful */
  isSuccess: boolean;
  /** Formatted timing string (e.g. "150 us", "2.34 ms") */
  timing: string;
  /** Raw timing in milliseconds */
  timingMs: number;
  /** Trigger a manual evaluation */
  evaluate: () => void;
}

/**
 * Hook to evaluate JSONata expressions against JSON data.
 *
 * Uses the gnata.wasm eval module (NOT the LSP). Automatically debounces
 * evaluation when expression or data changes.
 *
 * @param expression - The JSONata expression to evaluate
 * @param inputJson - The JSON data string to evaluate against
 * @param gnataEval - The eval function from useJsonataWasm
 * @param debounceMs - Debounce delay in milliseconds (default: 300)
 */
export function useJsonataEval(
  expression: string,
  inputJson: string,
  gnataEval: ((expr: string, data: string) => string) | null,
  debounceMs: number = 300,
): JsonataEvalResult {
  const [result, setResult] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [timing, setTiming] = useState('');
  const [timingMs, setTimingMs] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doEvaluate = useCallback(() => {
    if (!gnataEval) return;

    const expr = expression.trim();
    if (!expr) {
      setResult('');
      setError(null);
      setIsSuccess(false);
      setTiming('');
      setTimingMs(0);
      return;
    }

    try {
      const t0 = performance.now();
      const raw = gnataEval(expr, inputJson || 'null');
      const elapsed = performance.now() - t0;

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = raw;
      }

      const text = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);

      setResult(text);
      setError(null);
      setIsSuccess(true);
      setTimingMs(elapsed);
      setTiming(formatTiming(elapsed));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult('');
      setError(msg);
      setIsSuccess(false);
      setTiming('');
      setTimingMs(0);
    }
  }, [expression, inputJson, gnataEval]);

  // Debounced auto-evaluation on expression/data change
  useEffect(() => {
    if (!gnataEval) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(doEvaluate, debounceMs);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [doEvaluate, debounceMs, gnataEval]);

  const evaluate = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    doEvaluate();
  }, [doEvaluate]);

  return { result, error, isSuccess, timing, timingMs, evaluate };
}
