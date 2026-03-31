import { test, expect } from '@playwright/test';

test.describe('WASM Files', () => {
  test('gnata.wasm serves with correct content type', async ({ request }) => {
    const response = await request.get('/gnata.wasm');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/wasm');
  });

  test('gnata-lsp.wasm serves', async ({ request }) => {
    const response = await request.get('/gnata-lsp.wasm');
    expect(response.status()).toBe(200);
  });

  test('wasm_exec.js contains Go runtime', async ({ request }) => {
    const response = await request.get('/wasm_exec.js');
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(text).toContain('Go');
  });
});

test.describe('SQLite Mode', () => {
  test('loads WASM and shows Ready status', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.status.ready')).toBeVisible({ timeout: 30000 });
  });

  test('generates data and runs a query', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.status.ready')).toBeVisible({ timeout: 30000 });

    // Click Generate button (by text)
    await page.getByRole('button', { name: 'Generate' }).click();

    // Wait for generation — status shows orders count
    await expect(page.locator('.status')).toContainText('orders', { timeout: 30000 });

    // Results should appear (generate auto-runs the query)
    await expect(page.locator('.results-table')).toBeVisible({ timeout: 10000 });
  });

  test('example pills exist and are clickable', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.status.ready')).toBeVisible({ timeout: 30000 });

    const pills = page.locator('.query-pill');
    const count = await pills.count();
    expect(count).toBeGreaterThanOrEqual(5);

    // Click second pill — SQL editor should update
    await pills.nth(1).click();
    await page.waitForTimeout(300);

    // CodeMirror editor should have SQL content
    const editor = page.locator('.cm-content').first();
    const text = await editor.textContent();
    expect(text?.length).toBeGreaterThan(10);
  });
});

test.describe('gnata Mode', () => {
  test('navigates to /gnata and loads WASM', async ({ page }) => {
    await page.goto('/gnata');
    await expect(page.locator('.status.ready')).toBeVisible({ timeout: 30000 });
  });

  test('evaluates the default expression and shows result', async ({ page }) => {
    await page.goto('/gnata');
    await expect(page.locator('.status.ready')).toBeVisible({ timeout: 30000 });

    // Wait for debounced evaluation
    await page.waitForTimeout(2000);

    // There should be multiple .cm-content elements: expression, input, result
    const cmEditors = page.locator('.gnata-mode-wrapper .cm-content');
    const editorCount = await cmEditors.count();
    expect(editorCount).toBeGreaterThanOrEqual(2);
  });

  test('example pills load different expressions', async ({ page }) => {
    await page.goto('/gnata');
    await expect(page.locator('.status.ready')).toBeVisible({ timeout: 30000 });

    // Click "Pipeline" pill (exact match avoids String Transforms confusion)
    await page.getByRole('button', { name: 'Pipeline', exact: true }).click();
    await page.waitForTimeout(500);

    // Expression should contain ~> (pipeline operator)
    const expr = page.locator('.gnata-mode-wrapper .cm-content').first();
    const text = await expr.textContent();
    expect(text).toContain('~>');
  });

  test('gnata panels have sufficient height', async ({ page }) => {
    await page.goto('/gnata');
    await expect(page.locator('.status.ready')).toBeVisible({ timeout: 30000 });

    const wrapper = page.locator('.gnata-mode-wrapper');
    const box = await wrapper.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThan(200);
  });
});

test.describe('Theme', () => {
  test('toggles between dark and light', async ({ page }) => {
    await page.goto('/');

    // Get initial theme
    const initial = await page.getAttribute('html', 'data-theme');

    // Toggle
    await page.click('.theme-toggle');
    const toggled = await page.getAttribute('html', 'data-theme');
    expect(toggled).not.toBe(initial);

    // Toggle back
    await page.click('.theme-toggle');
    const restored = await page.getAttribute('html', 'data-theme');
    expect(restored).toBe(initial);
  });
});
