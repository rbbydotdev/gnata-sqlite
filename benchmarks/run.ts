import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { arch, platform } from 'node:os';
import { suites } from './suites.js';

// ── Config ───────────────────────────────────────────────────────

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const ext = platform() === 'darwin' ? 'dylib' : 'so';
const EXTENSION = resolve(ROOT, `gnata_jsonata.${ext}`);
const EXTENSION_LOAD = resolve(ROOT, 'gnata_jsonata');
const RESULTS_DIR = resolve(dirname(new URL(import.meta.url).pathname), 'results');
const RESULTS_FILE = resolve(RESULTS_DIR, 'benchmark-results.json');

function findSqlite3(): string {
  // macOS system sqlite3 is compiled without extension loading.
  // Prefer homebrew sqlite3 which supports .load.
  const candidates = [
    '/opt/homebrew/opt/sqlite/bin/sqlite3',
    '/usr/local/opt/sqlite/bin/sqlite3',
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return 'sqlite3';
}

const SQLITE3 = findSqlite3();

const args = process.argv.slice(2);
const iterationsFlag = args.indexOf('--iterations');
const ITERATIONS =
  iterationsFlag !== -1 ? parseInt(args[iterationsFlag + 1], 10) : 5;
const suiteFilter = args.indexOf('--suite');
const SUITE_FILTER =
  suiteFilter !== -1 ? args[suiteFilter + 1] : null;

// ── Timer output parser ─────────────────────────────────────────

const TIMER_RE = /Run Time:\s+real\s+([\d.]+)\s+user\s+([\d.]+)\s+sys\s+([\d.]+)/g;

function parseRealTime(output: string): number {
  const matches = [...output.matchAll(TIMER_RE)];
  if (matches.length === 0) {
    throw new Error(`No timer output found in:\n${output.slice(0, 500)}`);
  }
  const last = matches[matches.length - 1];
  return parseFloat(last[1]);
}

// ── Query runner ────────────────────────────────────────────────

function buildScript(setupSQL: string, querySQL: string): string {
  return `.load ${EXTENSION_LOAD} sqlite3_jsonata_init
.timer off
${setupSQL}
.timer on
${querySQL}`;
}

function runSingle(setupSQL: string, querySQL: string): number {
  const script = buildScript(setupSQL, querySQL);
  const output = execSync(`${SQLITE3} :memory: 2>&1`, {
    input: script,
    encoding: 'utf-8',
    timeout: 120_000,
  });
  if (output.includes('Runtime error') || output.includes('Parse error')) {
    throw new Error(output.trim());
  }
  return parseRealTime(output);
}

function runN(setupSQL: string, querySQL: string, n: number): number[] {
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    times.push(runSingle(setupSQL, querySQL));
  }
  return times;
}

// ── Statistics ──────────────────────────────────────────────────

interface TimingStats {
  median: number;
  mean: number;
  min: number;
  max: number;
  runs: number[];
}

function computeStats(runs: number[]): TimingStats {
  const sorted = [...runs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
  return {
    median: round(median),
    mean: round(mean),
    min: round(Math.min(...runs)),
    max: round(Math.max(...runs)),
    runs: runs.map(round),
  };
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ── Format helpers ──────────────────────────────────────────────

function fmtMs(seconds: number): string {
  const ms = seconds * 1000;
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function pad(s: string, len: number): string {
  return s.length >= len ? s : s + ' '.repeat(len - s.length);
}

// ── Output types ────────────────────────────────────────────────

interface TestResult {
  name: string;
  rows: number;
  gnata: TimingStats;
  native: TimingStats | null;
  ratio: number | null;
}

interface SuiteResult {
  name: string;
  category: string;
  tests: TestResult[];
}

interface BenchmarkResults {
  metadata: {
    timestamp: string;
    platform: string;
    sqliteVersion: string;
    iterations: number;
  };
  suites: SuiteResult[];
}

// ── Main ────────────────────────────────────────────────────────

function main() {
  // Check extension
  if (!existsSync(EXTENSION)) {
    console.error(
      `Extension not found at ${EXTENSION}\nRun \`make extension\` first.`
    );
    process.exit(1);
  }

  // Check sqlite3
  let sqliteVersion: string;
  try {
    sqliteVersion = execSync(`${SQLITE3} --version`, { encoding: 'utf-8' }).trim().split(' ')[0];
  } catch {
    console.error('sqlite3 not found. Install SQLite CLI first.');
    process.exit(1);
  }

  const filteredSuites = SUITE_FILTER
    ? suites.filter((s) => s.name === SUITE_FILTER)
    : suites;

  if (filteredSuites.length === 0) {
    console.error(
      `No suite named "${SUITE_FILTER}". Available: ${suites.map((s) => s.name).join(', ')}`
    );
    process.exit(1);
  }

  console.log(`gnata-sqlite benchmarks`);
  console.log(`  platform:  ${platform()}-${arch()}`);
  console.log(`  sqlite3:   ${sqliteVersion}`);
  console.log(`  extension: ${EXTENSION}`);
  console.log(`  iterations: ${ITERATIONS}`);
  console.log(`  suites:    ${filteredSuites.map((s) => s.name).join(', ')}`);
  console.log();

  const results: SuiteResult[] = [];

  for (const suite of filteredSuites) {
    console.log(`━━ ${suite.name}: ${suite.category} ━━`);
    const testResults: TestResult[] = [];

    for (const test of suite.tests) {
      process.stdout.write(`  ${pad(test.name, 42)} `);

      try {
        // Run gnata
        const gnataRuns = runN(suite.setupSQL, test.gnataSQL, ITERATIONS);
        const gnataStats = computeStats(gnataRuns);

        // Run native (if exists)
        let nativeStats: TimingStats | null = null;
        if (test.nativeSQL) {
          nativeStats = computeStats(
            runN(suite.setupSQL, test.nativeSQL, ITERATIONS)
          );
        }

        const ratio =
          nativeStats && nativeStats.median > 0
            ? round(gnataStats.median / nativeStats.median)
            : null;

        testResults.push({
          name: test.name,
          rows: test.rows,
          gnata: gnataStats,
          native: nativeStats,
          ratio,
        });

        // Print inline result
        const gStr = fmtMs(gnataStats.median);
        const nStr = nativeStats ? fmtMs(nativeStats.median) : '—';
        const rStr = ratio !== null && isFinite(ratio) ? `${ratio.toFixed(2)}x` : '—';
        console.log(`gnata: ${pad(gStr, 10)} sql: ${pad(nStr, 10)} ratio: ${rStr}`);
      } catch (err) {
        console.log(`FAILED: ${err instanceof Error ? err.message.split('\n')[0] : err}`);
      }
    }

    results.push({
      name: suite.name,
      category: suite.category,
      tests: testResults,
    });
    console.log();
  }

  // Write JSON
  const output: BenchmarkResults = {
    metadata: {
      timestamp: new Date().toISOString(),
      platform: `${platform()}-${arch()}`,
      sqliteVersion,
      iterations: ITERATIONS,
    },
    suites: results,
  };

  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(RESULTS_FILE, JSON.stringify(output, null, 2) + '\n');
  console.log(`Results written to ${RESULTS_FILE}`);
}

main();
