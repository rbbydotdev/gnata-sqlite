import { describe, it, expect } from 'vitest';
import { darkColors, lightColors, darkTokenColors, lightTokenColors } from '../theme/colors';

describe('color tokens', () => {
  it('dark colors have all required keys', () => {
    const required = ['bg', 'surface', 'text', 'textStrong', 'accent', 'green', 'error', 'muted', 'border'];
    for (const key of required) {
      expect(darkColors).toHaveProperty(key);
    }
  });

  it('light colors have all required keys', () => {
    const required = ['bg', 'surface', 'text', 'textStrong', 'accent', 'green', 'error', 'muted', 'border'];
    for (const key of required) {
      expect(lightColors).toHaveProperty(key);
    }
  });

  it('dark and light palettes have the same keys', () => {
    const darkKeys = Object.keys(darkColors).sort();
    const lightKeys = Object.keys(lightColors).sort();
    expect(darkKeys).toEqual(lightKeys);
  });

  it('token color palettes have the same keys', () => {
    const darkKeys = Object.keys(darkTokenColors).sort();
    const lightKeys = Object.keys(lightTokenColors).sort();
    expect(darkKeys).toEqual(lightKeys);
  });

  it('signature green is #9ece6a in dark mode', () => {
    expect(darkColors.green).toBe('#9ece6a');
  });

  it('all dark hex colors are valid', () => {
    for (const [key, val] of Object.entries(darkColors)) {
      if (val.startsWith('#')) {
        expect(val).toMatch(/^#[0-9a-fA-F]{6}$/);
      } else if (val.startsWith('rgba')) {
        expect(val).toMatch(/^rgba\(/);
      }
    }
  });
});
