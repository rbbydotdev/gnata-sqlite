import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for WASM + LSP to be fully ready. */
async function waitForReady(page: Page) {
  await page.goto('/gnata');
  await expect(page.locator('.status.ready')).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(2000);
}

/** Focus the expression editor and clear it. */
async function clearExpression(page: Page) {
  const editor = page.locator('.gnata-mode-wrapper .cm-content').first();
  await editor.click();
  await page.keyboard.press('Meta+a');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);
  return editor;
}

/** Type into the expression editor and wait for autocomplete to settle. */
async function typeAndWait(page: Page, text: string, delay = 80) {
  await page.keyboard.type(text, { delay });
  await page.waitForTimeout(1500);
}

/** Get the autocomplete popup locator. */
function autocomplete(page: Page) {
  return page.locator('.cm-tooltip-autocomplete');
}

/** Get visible autocomplete item labels. */
async function getCompletionLabels(page: Page): Promise<string[]> {
  const popup = autocomplete(page);
  if (!(await popup.isVisible())) return [];
  const items = popup.locator('.cm-completionLabel');
  const count = await items.count();
  const labels: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = await items.nth(i).textContent();
    if (text) labels.push(text.trim());
  }
  return labels;
}

/** Dismiss any open autocomplete by pressing Escape. */
async function dismissAutocomplete(page: Page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

// ---------------------------------------------------------------------------
// Tests — Default data (invoice example)
// ---------------------------------------------------------------------------

test.describe('Autocomplete — default invoice data', () => {
  test.beforeEach(async ({ page }) => {
    await waitForReady(page);
  });

  test('top-level field completion', async ({ page }) => {
    await clearExpression(page);
    await typeAndWait(page, 'Acc');

    const popup = autocomplete(page);
    await expect(popup).toBeVisible({ timeout: 5000 });
    const labels = await getCompletionLabels(page);
    expect(labels).toContain('Account');
  });

  test('first-level dot completion shows child fields', async ({ page }) => {
    await clearExpression(page);
    await typeAndWait(page, 'Account.');

    const popup = autocomplete(page);
    await expect(popup).toBeVisible({ timeout: 5000 });
    const labels = await getCompletionLabels(page);
    expect(labels).toContain('Name');
    expect(labels).toContain('Order');
  });

  test('second-level dot completion shows nested fields', async ({ page }) => {
    await clearExpression(page);
    await typeAndWait(page, 'Account.Order.');

    const popup = autocomplete(page);
    await expect(popup).toBeVisible({ timeout: 5000 });
    const labels = await getCompletionLabels(page);
    expect(labels).toContain('OrderID');
    expect(labels).toContain('Product');
  });

  test('third-level dot completion shows deeply nested fields', async ({ page }) => {
    await clearExpression(page);
    await typeAndWait(page, 'Account.Order.Product.');

    const popup = autocomplete(page);
    await expect(popup).toBeVisible({ timeout: 5000 });
    const labels = await getCompletionLabels(page);
    expect(labels).toContain('Name');
    expect(labels).toContain('Price');
    expect(labels).toContain('Quantity');
  });

  test('invalid recursive path shows no completions', async ({ page }) => {
    await clearExpression(page);
    await typeAndWait(page, 'Account.Account.');

    const popup = autocomplete(page);
    await expect(popup).not.toBeVisible({ timeout: 3000 });
  });

  test('double-recursive path shows no completions', async ({ page }) => {
    await clearExpression(page);
    await typeAndWait(page, 'Account.Account.Account.');

    const popup = autocomplete(page);
    await expect(popup).not.toBeVisible({ timeout: 3000 });
  });

  test('valid path then invalid child shows no completions', async ({ page }) => {
    await clearExpression(page);
    await typeAndWait(page, 'Account.Order.Account.');

    const popup = autocomplete(page);
    await expect(popup).not.toBeVisible({ timeout: 3000 });
  });

  test('partial name filters completions', async ({ page }) => {
    await clearExpression(page);
    await typeAndWait(page, 'Account.N');

    const popup = autocomplete(page);
    await expect(popup).toBeVisible({ timeout: 5000 });
    const labels = await getCompletionLabels(page);
    expect(labels).toContain('Name');
    expect(labels).not.toContain('Order');
  });

  test('leaf field shows no completions after dot', async ({ page }) => {
    await clearExpression(page);
    await typeAndWait(page, 'Account.Name.');

    const popup = autocomplete(page);
    await expect(popup).not.toBeVisible({ timeout: 3000 });
  });

  test('function completions after $', async ({ page }) => {
    await clearExpression(page);
    await typeAndWait(page, '$su');

    const popup = autocomplete(page);
    await expect(popup).toBeVisible({ timeout: 5000 });
    const labels = await getCompletionLabels(page);
    expect(labels.some(l => l.includes('$sum'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests — Predicate example (event data with nested metadata)
// ---------------------------------------------------------------------------

test.describe('Autocomplete — predicate event data', () => {
  test.beforeEach(async ({ page }) => {
    await waitForReady(page);
    // Load predicate example
    await page.getByRole('button', { name: 'Predicate', exact: true }).click();
    await page.waitForTimeout(500);
  });

  test('event. shows event child fields', async ({ page }) => {
    await clearExpression(page);
    await typeAndWait(page, 'event.');

    const popup = autocomplete(page);
    await expect(popup).toBeVisible({ timeout: 5000 });
    const labels = await getCompletionLabels(page);
    expect(labels).toContain('action');
    expect(labels).toContain('severity');
    expect(labels).toContain('user');
    expect(labels).toContain('metadata');
  });

  test('event.metadata. shows metadata child fields', async ({ page }) => {
    await clearExpression(page);
    await typeAndWait(page, 'event.metadata.');

    const popup = autocomplete(page);
    await expect(popup).toBeVisible({ timeout: 5000 });
    const labels = await getCompletionLabels(page);
    expect(labels).toContain('ip');
    expect(labels).toContain('geo');
  });

  test('event.event. is invalid — no completions', async ({ page }) => {
    await clearExpression(page);
    await typeAndWait(page, 'event.event.');

    const popup = autocomplete(page);
    await expect(popup).not.toBeVisible({ timeout: 3000 });
  });

  test('event.event.event. is invalid — no completions', async ({ page }) => {
    await clearExpression(page);
    await typeAndWait(page, 'event.event.event.');

    const popup = autocomplete(page);
    await expect(popup).not.toBeVisible({ timeout: 3000 });
  });

  test('event.event.event.event.event. is invalid — no completions', async ({ page }) => {
    await clearExpression(page);
    await typeAndWait(page, 'event.event.event.event.event.');

    const popup = autocomplete(page);
    await expect(popup).not.toBeVisible({ timeout: 3000 });
  });

  test('event.metadata.metadata. is invalid — no completions', async ({ page }) => {
    await clearExpression(page);
    await typeAndWait(page, 'event.metadata.metadata.');

    const popup = autocomplete(page);
    await expect(popup).not.toBeVisible({ timeout: 3000 });
  });

  test('event.metadata.ip. is invalid (leaf field) — no completions', async ({ page }) => {
    await clearExpression(page);
    await typeAndWait(page, 'event.metadata.ip.');

    const popup = autocomplete(page);
    await expect(popup).not.toBeVisible({ timeout: 3000 });
  });

  test('partial filtering: event.a shows action only', async ({ page }) => {
    await clearExpression(page);
    await typeAndWait(page, 'event.a');

    const popup = autocomplete(page);
    await expect(popup).toBeVisible({ timeout: 5000 });
    const labels = await getCompletionLabels(page);
    expect(labels).toContain('action');
    expect(labels).not.toContain('severity');
    expect(labels).not.toContain('metadata');
  });

  test('partial filtering: event.m shows metadata only', async ({ page }) => {
    await clearExpression(page);
    await typeAndWait(page, 'event.m');

    const popup = autocomplete(page);
    await expect(popup).toBeVisible({ timeout: 5000 });
    const labels = await getCompletionLabels(page);
    expect(labels).toContain('metadata');
    expect(labels).not.toContain('action');
    expect(labels).not.toContain('severity');
  });

  test('nonexistent field path — no completions', async ({ page }) => {
    await clearExpression(page);
    await typeAndWait(page, 'event.doesnotexist.');

    const popup = autocomplete(page);
    await expect(popup).not.toBeVisible({ timeout: 3000 });
  });
});

// ---------------------------------------------------------------------------
// Tests — Completions after accepting a suggestion (sequential navigation)
// ---------------------------------------------------------------------------

test.describe('Autocomplete — sequential dot navigation', () => {
  test.beforeEach(async ({ page }) => {
    await waitForReady(page);
  });

  test('accept completion then continue dot-navigating', async ({ page }) => {
    await clearExpression(page);

    // Type "Account." → should show completions
    await typeAndWait(page, 'Account.');
    const popup = autocomplete(page);
    await expect(popup).toBeVisible({ timeout: 5000 });

    // Accept "Order" by typing it and adding a dot
    await dismissAutocomplete(page);
    await page.keyboard.type('Order.', { delay: 80 });
    await page.waitForTimeout(1500);

    // Should now show Order's fields
    await expect(popup).toBeVisible({ timeout: 5000 });
    const labels = await getCompletionLabels(page);
    expect(labels).toContain('OrderID');
    expect(labels).toContain('Product');
  });

  test('navigate three levels deep via typing', async ({ page }) => {
    await clearExpression(page);
    await typeAndWait(page, 'Account.Order.Product.');

    const popup = autocomplete(page);
    await expect(popup).toBeVisible({ timeout: 5000 });
    const labels = await getCompletionLabels(page);
    expect(labels).toContain('Name');
    expect(labels).toContain('Price');
    expect(labels).toContain('Quantity');
  });
});

// ---------------------------------------------------------------------------
// Tests — Switching examples updates completions
// ---------------------------------------------------------------------------

test.describe('Autocomplete — example switching', () => {
  test.beforeEach(async ({ page }) => {
    await waitForReady(page);
  });

  test('completions update after switching to predicate example', async ({ page }) => {
    // Default data has Account — verify it works
    await clearExpression(page);
    await typeAndWait(page, 'Account.');
    let popup = autocomplete(page);
    await expect(popup).toBeVisible({ timeout: 5000 });
    let labels = await getCompletionLabels(page);
    expect(labels).toContain('Name');

    // Switch to predicate example
    await dismissAutocomplete(page);
    await page.getByRole('button', { name: 'Predicate', exact: true }).click();
    await page.waitForTimeout(500);

    // Now "Account." should not complete (not in predicate data)
    await clearExpression(page);
    await typeAndWait(page, 'Account.');
    popup = autocomplete(page);
    await expect(popup).not.toBeVisible({ timeout: 3000 });

    // But "event." should complete
    await clearExpression(page);
    await typeAndWait(page, 'event.');
    popup = autocomplete(page);
    await expect(popup).toBeVisible({ timeout: 5000 });
    labels = await getCompletionLabels(page);
    expect(labels).toContain('action');
    expect(labels).toContain('metadata');
  });

  test('completions update after switching to transform example', async ({ page }) => {
    // Switch to transform example
    await page.getByRole('button', { name: 'Transform', exact: true }).click();
    await page.waitForTimeout(500);

    await clearExpression(page);
    await typeAndWait(page, 'orders.');

    const popup = autocomplete(page);
    await expect(popup).toBeVisible({ timeout: 5000 });
    const labels = await getCompletionLabels(page);
    expect(labels).toContain('id');
    expect(labels).toContain('customer');
    expect(labels).toContain('items');
  });
});

// ---------------------------------------------------------------------------
// Tests — Completions in expression context (after operators)
// ---------------------------------------------------------------------------

test.describe('Autocomplete — operator context', () => {
  test.beforeEach(async ({ page }) => {
    await waitForReady(page);
    await page.getByRole('button', { name: 'Predicate', exact: true }).click();
    await page.waitForTimeout(500);
  });

  test('completions after = operator', async ({ page }) => {
    await clearExpression(page);
    await typeAndWait(page, 'event.action = event.');

    const popup = autocomplete(page);
    await expect(popup).toBeVisible({ timeout: 5000 });
    const labels = await getCompletionLabels(page);
    expect(labels).toContain('action');
    expect(labels).toContain('severity');
  });

  test('completions after "and" keyword', async ({ page }) => {
    await clearExpression(page);
    await typeAndWait(page, 'event.action and event.');

    const popup = autocomplete(page);
    await expect(popup).toBeVisible({ timeout: 5000 });
    const labels = await getCompletionLabels(page);
    expect(labels).toContain('severity');
    expect(labels).toContain('metadata');
  });

  test('invalid path after operator — no completions', async ({ page }) => {
    await clearExpression(page);
    await typeAndWait(page, 'event.action = event.event.');

    const popup = autocomplete(page);
    await expect(popup).not.toBeVisible({ timeout: 3000 });
  });
});
