import { test, expect, type Page } from '@playwright/test';

// Tokyo Night dark palette
const dark = {
  bg: '#1a1b26',
  surface: '#1f2335',
  text: '#a9b1d6',
  textStrong: '#c0caf5',
  accent: '#7aa2f7',
  green: '#9ece6a',
  muted: '#565f89',
  border: '#292e42',
};

// Tokyo Night Day palette (from playground.html)
const light = {
  bg: '#e1e2e7',       // or close — page bg from fumadocs
  surface: '#f0f1f5',  // cards/surfaces
  text: '#3760bf',
  textStrong: '#343b58',
  accent: '#2e7de9',
  green: '#587539',
  muted: '#848cb5',
  border: '#c4c8da',
};

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

async function switchTheme(page: Page, to: 'dark' | 'light') {
  const current = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  const isDark = current;
  if ((to === 'dark' && !isDark) || (to === 'light' && isDark)) {
    await page.locator('button[aria-label="Toggle Theme"]').click();
    await page.waitForTimeout(300);
  }
}

test.describe('Dark mode colors', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/docs/tutorials/getting-started');
    await page.waitForLoadState('networkidle');
    await switchTheme(page, 'dark');
  });

  test('code block has dark background', async ({ page }) => {
    const figure = page.locator('figure.shiki').first();
    const bg = await figure.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bg).toBe(hexToRgb(dark.bg));
  });

  test('code block syntax spans use dark theme colors', async ({ page }) => {
    // Check that spans use --shiki-dark colors (not light)
    const span = page.locator('figure.shiki span[style*="--shiki-dark"]').first();
    const color = await span.evaluate(el => getComputedStyle(el).color);
    // Should NOT be a light theme color
    expect(color).not.toBe(hexToRgb(light.text));
  });
});

test.describe('Light mode colors', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/docs/tutorials/getting-started');
    await page.waitForLoadState('networkidle');
    await switchTheme(page, 'light');
  });

  test('code block has light background', async ({ page }) => {
    const figure = page.locator('figure.shiki').first();
    const bg = await figure.evaluate(el => getComputedStyle(el).backgroundColor);
    // Should be the Tokyo Night Day bg, NOT the dark bg
    expect(bg).not.toBe(hexToRgb(dark.bg));
    expect(bg).not.toBe(hexToRgb(dark.surface));
  });

  test('code block syntax spans use light theme colors', async ({ page }) => {
    const span = page.locator('figure.shiki span[style*="--shiki-light"]').first();
    const color = await span.evaluate(el => getComputedStyle(el).color);
    // Should NOT be a dark theme color
    expect(color).not.toBe(hexToRgb(dark.text));
    expect(color).not.toBe(hexToRgb(dark.textStrong));
  });

  test('page background is light', async ({ page }) => {
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).not.toBe(hexToRgb(dark.bg));
    expect(bg).not.toBe(hexToRgb(dark.surface));
  });

  test('prose text is not dark theme color', async ({ page }) => {
    const p = page.locator('.prose p').first();
    const color = await p.evaluate(el => getComputedStyle(el).color);
    expect(color).not.toBe(hexToRgb(dark.text));
  });

  test('sidebar links are not dark theme colors', async ({ page }) => {
    const link = page.locator('aside a').first();
    if (await link.count() > 0) {
      const color = await link.evaluate(el => getComputedStyle(el).color);
      expect(color).not.toBe(hexToRgb(dark.text));
      expect(color).not.toBe(hexToRgb(dark.muted));
    }
  });

  test('inline code has light background', async ({ page }) => {
    const code = page.locator('.prose :not(pre) > code').first();
    if (await code.count() > 0) {
      const bg = await code.evaluate(el => getComputedStyle(el).backgroundColor);
      expect(bg).not.toBe(hexToRgb(dark.bg));
      expect(bg).not.toBe(hexToRgb(dark.surface));
    }
  });
});

test.describe('Landing page — light mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await switchTheme(page, 'light');
  });

  test('feature cards have light background', async ({ page }) => {
    const card = page.locator('.landing-card').first();
    if (await card.count() > 0) {
      const bg = await card.evaluate(el => getComputedStyle(el).backgroundColor);
      expect(bg).not.toBe(hexToRgb(dark.surface));
    }
  });

  test('stats row has light background', async ({ page }) => {
    const stats = page.locator('.landing-surface').first();
    if (await stats.count() > 0) {
      const bg = await stats.evaluate(el => getComputedStyle(el).backgroundColor);
      expect(bg).not.toBe(hexToRgb(dark.surface));
    }
  });

  test('code example blocks have light background', async ({ page }) => {
    const codeBlock = page.locator('.landing-code-bg').first();
    if (await codeBlock.count() > 0) {
      const bg = await codeBlock.evaluate(el => getComputedStyle(el).backgroundColor);
      expect(bg).not.toBe(hexToRgb(dark.bg));
    }
  });
});
