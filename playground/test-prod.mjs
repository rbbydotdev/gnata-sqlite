#!/usr/bin/env node
import { chromium } from '@playwright/test';

const LOCAL = 'http://localhost:5173';
const REMOTE = 'https://rbby.dev/gnata-sqlite/playground';
const ROUTES = ['/sqlite', '/gnata'];

async function test(base, label) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) errors.push(`[${r.status()}] ${r.url()}`); });

  for (const route of ROUTES) {
    const url = base + route;
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 20000 });
      await page.waitForTimeout(4000);
    } catch (e) {
      errors.push(`[navigate] ${url}: ${e.message}`);
    }
  }
  await browser.close();
  const pass = errors.length === 0;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label} (${errors.length} errors)`);
  if (!pass) errors.forEach(e => console.log(`  - ${e}`));
  return pass;
}

const target = process.argv[2] || 'remote';
let ok = true;
if (target === 'local' || target === 'both') ok = await test(LOCAL, 'LOCAL') && ok;
if (target === 'remote' || target === 'both') ok = await test(REMOTE, 'REMOTE') && ok;
process.exit(ok ? 0 : 1);
