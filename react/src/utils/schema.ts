/** Describes the type of a field in the schema */
export interface SchemaField {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null';
  fields?: Record<string, SchemaField>;
}

/** Top-level schema shape */
export interface Schema {
  fields?: Record<string, SchemaField>;
}

/**
 * Build a schema description from a JSON value.
 * Used by the LSP for context-aware completions.
 */
export function buildSchema(obj: unknown): Schema {
  if (obj === null || typeof obj !== 'object') return {};

  if (Array.isArray(obj)) {
    if (obj.length > 0 && typeof obj[0] === 'object') return buildSchema(obj[0]);
    return {};
  }

  const fields: Record<string, SchemaField> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const child: SchemaField = {
      type:
        typeof val === 'number' ? 'number' :
        typeof val === 'string' ? 'string' :
        typeof val === 'boolean' ? 'boolean' :
        Array.isArray(val) ? 'array' :
        val === null ? 'null' :
        'object',
    };
    if (typeof val === 'object' && val !== null) {
      const nested = buildSchema(val);
      if (nested.fields) child.fields = nested.fields;
    }
    fields[key] = child;
  }
  return { fields };
}

/**
 * Recursively collect all keys from a JSON value (up to a depth limit).
 * Returns a Map of key name to a sample value (for type inference).
 */
export function collectKeys(
  obj: unknown,
  keys: Map<string, unknown>,
  depth: number,
): void {
  if (depth <= 0 || !obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    for (const item of obj.slice(0, 5)) collectKeys(item, keys, depth);
    return;
  }

  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (!keys.has(k)) keys.set(k, v);
    if (v && typeof v === 'object') collectKeys(v, keys, depth - 1);
  }
}

/**
 * Get all field keys from a JSON string for autocomplete.
 * Returns completion items filtered by an optional partial prefix.
 */
export function allKeysFromJson(
  inputJson: string,
  partial: string,
): Array<{ label: string; type: string; detail: string; boost: number }> | null {
  try {
    const data = JSON.parse(inputJson);
    const keys = new Map<string, unknown>();
    collectKeys(data, keys, 3);
    const items: Array<{ label: string; type: string; detail: string; boost: number }> = [];
    for (const [k, v] of keys) {
      if (partial && !k.toLowerCase().startsWith(partial.toLowerCase())) continue;
      items.push({
        label: k,
        type:
          typeof v === 'number' ? 'number' :
          typeof v === 'string' ? 'string' :
          Array.isArray(v) ? 'enum' :
          'property',
        detail: typeof v,
        boost: 2,
      });
    }
    return items;
  } catch {
    return null;
  }
}

/**
 * Format a markdown-like hover string to safe HTML.
 */
export function formatHoverMarkdown(md: string): string {
  return md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/```\n([\s\S]*?)```/g, '<pre>$1</pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

/**
 * Format timing in human-readable form.
 */
export function formatTiming(ms: number): string {
  if (ms < 1) return (ms * 1000).toFixed(0) + ' \u00b5s';
  if (ms < 1000) return ms.toFixed(2) + ' ms';
  return (ms / 1000).toFixed(2) + ' s';
}
