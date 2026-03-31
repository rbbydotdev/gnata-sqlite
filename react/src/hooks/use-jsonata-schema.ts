import { useMemo } from 'react';
import { buildSchema, type Schema } from '../utils/schema';

/**
 * Hook to build a schema from sample JSON data.
 *
 * The schema is used by the LSP for context-aware autocomplete completions.
 * It's memoized based on the input JSON string.
 *
 * @param inputJson - Raw JSON string to derive schema from
 * @returns Schema object, or empty schema if parsing fails
 */
export function useJsonataSchema(inputJson: string): Schema {
  return useMemo(() => {
    try {
      const data = JSON.parse(inputJson);
      return buildSchema(data);
    } catch {
      return {};
    }
  }, [inputJson]);
}
