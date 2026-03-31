import { test, expect } from '@playwright/test';

test.describe('CodeMirror Editor Features — gnata mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/gnata');
    // Wait for both eval and LSP WASM to load
    await expect(page.locator('.status.ready')).toBeVisible({ timeout: 30000 });
    // Extra wait for LSP to fully initialize
    await page.waitForTimeout(2000);
  });

  test('typing in expression editor does not reset cursor', async ({ page }) => {
    // Click on expression editor
    const exprEditor = page.locator('.gnata-mode-wrapper .cm-content').first();
    await exprEditor.click();

    // Select all and clear
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);

    // Type a multi-character expression
    await page.keyboard.type('Account.Name', { delay: 50 });
    await page.waitForTimeout(300);

    // The text should be "Account.Name" (not garbled by cursor resets)
    const text = await exprEditor.textContent();
    expect(text).toContain('Account.Name');
  });

  test('autocomplete appears when typing after a dot', async ({ page }) => {
    // Click on expression editor
    const exprEditor = page.locator('.gnata-mode-wrapper .cm-content').first();
    await exprEditor.click();

    // Select all and clear
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);

    // Type "Account." to trigger dot-completion
    await page.keyboard.type('Account.', { delay: 80 });

    // Wait for autocomplete popup
    await page.waitForTimeout(1500);

    // Autocomplete tooltip should be visible
    const autocomplete = page.locator('.cm-tooltip-autocomplete');
    await expect(autocomplete).toBeVisible({ timeout: 5000 });

    // Should suggest "Name" and "Order" (from the default input JSON)
    const items = await autocomplete.textContent();
    expect(items).toContain('Name');
    expect(items).toContain('Order');
  });

  test('hover shows function documentation', async ({ page }) => {
    // Load invoice example which uses $sum
    await page.getByRole('button', { name: 'Invoice', exact: true }).click();
    await page.waitForTimeout(500);

    // Hover over $sum in the expression
    const exprEditor = page.locator('.gnata-mode-wrapper .cm-content').first();
    const box = await exprEditor.boundingBox();
    expect(box).not.toBeNull();

    // Move mouse to the beginning of the expression where $sum is
    await page.mouse.move(box!.x + 20, box!.y + box!.height / 2);
    await page.waitForTimeout(2000);

    // Hover tooltip should appear with function documentation
    const hover = page.locator('.cm-tooltip-hover');
    await expect(hover).toBeVisible({ timeout: 5000 });
  });

  test('diagnostics show red underline on invalid expression', async ({ page }) => {
    const exprEditor = page.locator('.gnata-mode-wrapper .cm-content').first();
    await exprEditor.click();

    // Select all and type an invalid expression
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('$sum(', { delay: 50 });

    // Wait for linter to run (200ms delay + some buffer)
    await page.waitForTimeout(1000);

    // Should show a lint error marker or squiggly underline
    const lintError = page.locator('.cm-lintRange-error, .cm-diagnostic-error, .cm-lint-marker-error');
    await expect(lintError.first()).toBeVisible({ timeout: 5000 });
  });

  test('example pills change expression and input', async ({ page }) => {
    // Click Pipeline example
    await page.getByRole('button', { name: 'Pipeline', exact: true }).click();
    await page.waitForTimeout(500);

    // Expression should contain ~> (pipeline operator)
    const expr = page.locator('.gnata-mode-wrapper .cm-content').first();
    const exprText = await expr.textContent();
    expect(exprText).toContain('~>');

    // Input should contain records data
    const panels = page.locator('.gnata-mode-wrapper .cm-content');
    const inputText = await panels.nth(1).textContent();
    expect(inputText).toContain('records');
  });

  test('result shows green text on successful evaluation', async ({ page }) => {
    // Load invoice example
    await page.getByRole('button', { name: 'Invoice', exact: true }).click();
    // Wait longer for debounced eval (300ms) + StrictMode remount
    await page.waitForTimeout(3000);

    // Result panel (last cm-content) should have content
    const result = page.locator('.gnata-mode-wrapper .cm-content').last();
    await expect(result).not.toBeEmpty({ timeout: 5000 });
    const resultText = await result.textContent();
    expect(resultText).toMatch(/\d/);
  });
});
