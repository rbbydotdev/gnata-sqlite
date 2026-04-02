#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wasmDir = join(__dirname, '..', 'wasm');

const files = ['gnata-lsp.wasm', 'lsp-wasm_exec.js'];

const dest = process.argv[2];
if (!dest) {
  console.error('Usage: npx @gnata-sqlite/react setup <target-dir>');
  console.error('Example: npx @gnata-sqlite/react setup ./public');
  process.exit(1);
}

const target = resolve(dest);
if (!existsSync(target)) {
  mkdirSync(target, { recursive: true });
}

for (const file of files) {
  const src = join(wasmDir, file);
  const out = join(target, file);
  copyFileSync(src, out);
  console.log(`  ${file} -> ${out}`);
}

console.log('\nLSP WASM files copied. The editor hooks will load them from defaults.');
console.log('If serving from a subpath, pass custom URLs to useJsonataLsp({ lspWasmUrl, lspExecUrl }).');
