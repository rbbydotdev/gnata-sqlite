import { describe, it, expect } from 'vitest';
import * as exports from '../index';

describe('package exports', () => {
  it('exports all hooks', () => {
    expect(exports.useJsonataWasm).toBeDefined();
    expect(exports.useJsonataEval).toBeDefined();
    expect(exports.useJsonataSchema).toBeDefined();
    expect(exports.useJsonataEditor).toBeDefined();
  });

  it('exports all components', () => {
    expect(exports.JsonataEditor).toBeDefined();
    expect(exports.JsonataInput).toBeDefined();
    expect(exports.JsonataResult).toBeDefined();
    expect(exports.JsonataPlayground).toBeDefined();
  });

  it('exports theme utilities', () => {
    expect(exports.tokyoNightTheme).toBeDefined();
    expect(exports.darkColors).toBeDefined();
    expect(exports.lightColors).toBeDefined();
    expect(exports.darkTokenColors).toBeDefined();
    expect(exports.lightTokenColors).toBeDefined();
  });

  it('exports utility functions', () => {
    expect(exports.buildSchema).toBeDefined();
    expect(exports.collectKeys).toBeDefined();
    expect(exports.allKeysFromJson).toBeDefined();
    expect(exports.formatHoverMarkdown).toBeDefined();
    expect(exports.formatTiming).toBeDefined();
    expect(exports.jsonataStreamLanguage).toBeDefined();
  });

  it('exports types', () => {
    // Type exports can't be tested at runtime, but we can verify
    // the module doesn't throw on import (which it would if types
    // referenced missing values)
    expect(Object.keys(exports).length).toBeGreaterThan(15);
  });
});
