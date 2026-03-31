import { describe, it, expect } from 'vitest';
import {
  buildSchema,
  collectKeys,
  allKeysFromJson,
  formatHoverMarkdown,
  formatTiming,
} from '../utils/schema';

describe('buildSchema', () => {
  it('returns empty for null', () => {
    expect(buildSchema(null)).toEqual({});
  });

  it('returns empty for primitives', () => {
    expect(buildSchema(42)).toEqual({});
    expect(buildSchema('str')).toEqual({});
  });

  it('builds schema from flat object', () => {
    const schema = buildSchema({ name: 'Alice', age: 30, active: true });
    expect(schema.fields).toEqual({
      name: { type: 'string' },
      age: { type: 'number' },
      active: { type: 'boolean' },
    });
  });

  it('builds nested schema', () => {
    const schema = buildSchema({
      user: { name: 'Alice', address: { city: 'NYC' } },
    });
    expect(schema.fields?.user.type).toBe('object');
    expect(schema.fields?.user.fields?.name.type).toBe('string');
    expect(schema.fields?.user.fields?.address.fields?.city.type).toBe('string');
  });

  it('handles arrays by inspecting first element', () => {
    const schema = buildSchema([{ id: 1 }, { id: 2 }]);
    expect(schema.fields?.id.type).toBe('number');
  });

  it('detects null fields', () => {
    const schema = buildSchema({ x: null });
    expect(schema.fields?.x.type).toBe('null');
  });

  it('detects array fields', () => {
    const schema = buildSchema({ tags: ['a', 'b'] });
    expect(schema.fields?.tags.type).toBe('array');
  });
});

describe('collectKeys', () => {
  it('collects top-level keys', () => {
    const keys = new Map<string, unknown>();
    collectKeys({ a: 1, b: 'two' }, keys, 3);
    expect(keys.has('a')).toBe(true);
    expect(keys.has('b')).toBe(true);
  });

  it('collects nested keys', () => {
    const keys = new Map<string, unknown>();
    collectKeys({ user: { name: 'Alice' } }, keys, 3);
    expect(keys.has('user')).toBe(true);
    expect(keys.has('name')).toBe(true);
  });

  it('respects depth limit', () => {
    const keys = new Map<string, unknown>();
    collectKeys({ a: { b: { c: { d: 1 } } } }, keys, 2);
    expect(keys.has('a')).toBe(true);
    expect(keys.has('b')).toBe(true);
    expect(keys.has('d')).toBe(false); // too deep
  });

  it('handles arrays by iterating first 5 elements', () => {
    const keys = new Map<string, unknown>();
    collectKeys([{ x: 1 }, { y: 2 }], keys, 3);
    expect(keys.has('x')).toBe(true);
    expect(keys.has('y')).toBe(true);
  });
});

describe('allKeysFromJson', () => {
  it('returns keys from valid JSON', () => {
    const items = allKeysFromJson('{"name":"Alice","age":30}', '');
    expect(items).not.toBeNull();
    expect(items!.map((i) => i.label)).toContain('name');
    expect(items!.map((i) => i.label)).toContain('age');
  });

  it('filters by partial prefix', () => {
    const items = allKeysFromJson('{"name":"Alice","age":30}', 'na');
    expect(items).not.toBeNull();
    expect(items!.length).toBe(1);
    expect(items![0].label).toBe('name');
  });

  it('returns null for invalid JSON', () => {
    expect(allKeysFromJson('not json', '')).toBeNull();
  });

  it('includes type info', () => {
    const items = allKeysFromJson('{"count":5,"label":"x"}', '');
    const countItem = items!.find((i) => i.label === 'count');
    expect(countItem?.type).toBe('number');
    const labelItem = items!.find((i) => i.label === 'label');
    expect(labelItem?.type).toBe('string');
  });
});

describe('formatHoverMarkdown', () => {
  it('escapes HTML', () => {
    expect(formatHoverMarkdown('<script>')).toContain('&lt;script&gt;');
  });

  it('converts inline code', () => {
    expect(formatHoverMarkdown('use `foo()`')).toContain('<code>foo()</code>');
  });

  it('converts bold', () => {
    expect(formatHoverMarkdown('**bold**')).toContain('<strong>bold</strong>');
  });

  it('converts code blocks', () => {
    const result = formatHoverMarkdown('```\ncode\n```');
    expect(result).toContain('<pre>');
  });
});

describe('formatTiming', () => {
  it('formats microseconds', () => {
    expect(formatTiming(0.5)).toContain('µs');
  });

  it('formats milliseconds', () => {
    expect(formatTiming(42.5)).toBe('42.50 ms');
  });

  it('formats seconds', () => {
    expect(formatTiming(1500)).toBe('1.50 s');
  });
});
