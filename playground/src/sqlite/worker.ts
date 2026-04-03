/// <reference lib="webworker" />

import type { WorkerInMessage, WorkerOutMessage, DataPools } from './types';
// Static import prevents WebKit from re-evaluating the worker module
// when a dynamic import chunk loads (which resets module-level state).
import initSqlJs from 'sql.js';

declare const self: DedicatedWorkerGlobalScope;

// sql.js types (minimal)
interface SqlJsDatabase {
  run(sql: string, params?: unknown[]): void;
  exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
  prepare(sql: string): SqlJsStatement;
  create_function(name: string, fn: (...args: unknown[]) => unknown): void;
  create_aggregate(name: string, agg: {
    init: () => unknown;
    step: (state: unknown, ...args: unknown[]) => unknown;
    finalize: (state: unknown) => unknown;
  }): void;
}
interface SqlJsStatement {
  run(params?: unknown[]): void;
  free(): void;
}
interface SqlJsStatic {
  Database: new () => SqlJsDatabase;
}

// Augment self for Go runtime
declare const Go: new () => {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): Promise<void>;
};

let db: SqlJsDatabase | null = null;
let gnataEval: ((expr: string, jsonData: string) => string) | null = null;
let _jqSampled: { sampled: number; total: number } | null = null;
let ready = false;
const pending: WorkerInMessage[] = [];

function post(msg: WorkerOutMessage) {
  self.postMessage(msg);
}

self.onmessage = function (e: MessageEvent<WorkerInMessage>) {
  if (!ready && e.data.type !== 'init') {
    pending.push(e.data);
    return;
  }
  handle(e.data);
};

async function handle(msg: WorkerInMessage) {
  try {
    switch (msg.type) {
      case 'init':
        await doInit(msg);
        break;
      case 'generate':
        await doGenerate(msg);
        break;
      case 'query':
        doQuery(msg);
        break;
    }
  } catch (err) {
    post({ type: 'error', msg: (err as Error).message });
  }
}

async function doInit(msg: { type: 'init'; wasmExecText: string; wasmBytes: ArrayBuffer }) {
  // Load Go WASM runtime via eval (worker doesn't have document)
  // eslint-disable-next-line no-new-func
  new Function(msg.wasmExecText)();
  const go = new Go();
  const result = await WebAssembly.instantiate(msg.wasmBytes, go.importObject);
  go.run(result.instance);

  gnataEval = function (...args: string[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (self as any)._gnataEval.apply(null, args);
    if (r instanceof Error) throw r;
    return r as string;
  };

  const SQL: SqlJsStatic = await initSqlJs({
    locateFile: (f: string) => 'https://cdn.jsdelivr.net/npm/sql.js@1/dist/' + f,
  });
  db = new SQL.Database();

  // Register scalar jsonata() function
  db.create_function('jsonata', function (expr: unknown, jsonData: unknown) {
    if (expr == null || jsonData == null) return null;
    try {
      const raw = gnataEval!(String(expr), String(jsonData));
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'number') return parsed;
        if (typeof parsed === 'boolean') return parsed ? 1 : 0;
        if (parsed === null) return null;
        if (typeof parsed === 'string') return parsed;
        return raw;
      } catch {
        return raw;
      }
    } catch {
      return null;
    }
  });

  // Register aggregate jsonata_query() function
  const JQ_CAP = 5000;
  db.create_aggregate('jsonata_query', {
    init: () => ({ expr: null as string | null, rows: [] as string[], total: 0 }),
    step: (state: unknown, expr: unknown, data: unknown) => {
      const s = state as { expr: string | null; rows: string[]; total: number };
      if (expr == null || data == null) return s;
      if (!s.expr) s.expr = String(expr);
      s.total++;
      if (s.rows.length < JQ_CAP) s.rows.push(String(data));
      return s;
    },
    finalize: (state: unknown) => {
      const s = state as { expr: string | null; rows: string[]; total: number };
      if (!s.expr || !s.rows.length) return null;
      if (s.total > s.rows.length) {
        _jqSampled = { sampled: s.rows.length, total: s.total };
      }
      try {
        const arr = '[' + s.rows.join(',') + ']';
        s.rows = [];
        const raw = gnataEval!(s.expr, arr);
        try {
          const p = JSON.parse(raw);
          return typeof p === 'number' ? p : typeof p === 'string' ? p : raw;
        } catch {
          return raw;
        }
      } catch (e) {
        return 'Error: ' + (e as Error).message;
      }
    },
  });

  ready = true;
  post({ type: 'ready' });
  while (pending.length) await handle(pending.shift()!);
}

async function doGenerate(msg: { type: 'generate'; count: number; pools: DataPools }) {
  const count = msg.count;
  const pools = msg.pools;
  const statuses = ['pending', 'shipped', 'delivered', 'cancelled', 'returned'];
  const cats = ['Electronics', 'Books', 'Clothing', 'Home', 'Sports', 'Food'];
  const methods = ['standard', 'express', 'overnight', 'economy'];

  let _seed = 12345;
  const rng = () => {
    _seed = (_seed * 1664525 + 1013904223) & 0x7fffffff;
    return _seed / 0x7fffffff;
  };
  const pick = <T>(a: T[]) => a[Math.floor(rng() * a.length)];

  const dateStart = new Date('2023-01-01').getTime();
  const datePool: string[] = [];
  for (let d = 0; d < 730; d++)
    datePool.push(new Date(dateStart + d * 86400000).toISOString().split('T')[0]);

  post({ type: 'progress', pct: 8, msg: 'Building data templates...' });

  const POOL_SIZE = Math.min(count, 5000);
  const dataPool = new Array(POOL_SIZE);
  for (let p = 0; p < POOL_SIZE; p++) {
    const ni = 1 + Math.floor(rng() * 4);
    const items = [];
    let sub = 0;
    for (let j = 0; j < ni; j++) {
      const price = Math.round((5 + rng() * 495) * 100) / 100;
      const qty = 1 + Math.floor(rng() * 4);
      items.push({
        product: pick(pools.products),
        price,
        quantity: qty,
        category: pick(cats),
      });
      sub += price * qty;
    }
    const sc = Math.round((3 + rng() * 22) * 100) / 100;
    dataPool[p] = JSON.stringify({
      items,
      shipping: { method: pick(methods), cost: sc, address: pick(pools.addresses) },
      total: Math.round((sub + sc) * 100) / 100,
    });
  }

  db!.run('DROP TABLE IF EXISTS orders');
  db!.run('DROP TABLE IF EXISTS customers');
  db!.run(
    'CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, email TEXT, city TEXT, country TEXT)',
  );
  db!.run(
    'CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER, order_date TEXT, status TEXT, data JSON)',
  );

  const custCount = Math.min(count, 200);
  db!.run('BEGIN');
  for (let i = 1; i <= custCount; i++) {
    db!.run('INSERT INTO customers VALUES (?,?,?,?,?)', [
      i,
      pools.names[i % pools.names.length],
      pools.emails[i % pools.emails.length],
      pools.cities[i % pools.cities.length],
      pools.countries[i % pools.countries.length],
    ]);
  }
  db!.run('COMMIT');

  const BATCH = 25000;
  const t0 = performance.now();
  post({ type: 'progress', pct: 10, msg: 'Inserting rows...' });

  for (let batch = 0; batch < count; batch += BATCH) {
    db!.run('BEGIN');
    const stmt = db!.prepare('INSERT INTO orders VALUES (?,?,?,?,?)');
    const end = Math.min(batch + BATCH, count);
    for (let i = batch + 1; i <= end; i++) {
      stmt.run([
        i,
        1 + Math.floor(rng() * custCount),
        datePool[Math.floor(rng() * 730)],
        statuses[Math.floor(rng() * 5)],
        dataPool[i % POOL_SIZE],
      ]);
    }
    stmt.free();
    db!.run('COMMIT');
    post({
      type: 'progress',
      pct: Math.round((end / count) * 90) + 10,
      msg: 'Generated ' + end.toLocaleString() + ' of ' + count.toLocaleString() + ' rows...',
    });
  }

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
  post({ type: 'generated', count, custCount, elapsed });
}

function doQuery(msg: { type: 'query'; sql: string }) {
  _jqSampled = null;
  try {
    const t0 = performance.now();
    const res = db!.exec(msg.sql);
    const elapsed = performance.now() - t0;
    const sampled = _jqSampled;
    _jqSampled = null;
    if (res.length) {
      const last = res[res.length - 1];
      post({
        type: 'queryResult',
        columns: last.columns,
        values: (last.values as unknown[][]).slice(0, 200) as (string | number | null)[][],
        totalRows: last.values.length,
        time: elapsed,
        sampled,
      });
    } else {
      post({
        type: 'queryResult',
        columns: [],
        values: [],
        totalRows: 0,
        time: elapsed,
        sampled,
        noRows: true,
      });
    }
  } catch (e) {
    const m = (e as Error).message || String(e);
    post({ type: 'queryError', msg: m });
  }
}
