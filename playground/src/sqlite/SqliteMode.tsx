import { useState, useRef, useEffect, useCallback } from 'react';
import { faker } from '@faker-js/faker';
import { SqlEditor } from './SqlEditor';
import { ResultsTable } from './ResultsTable';
import { BenchmarkBanner } from './BenchmarkBanner';
import { QUERIES } from './queries';
import { useLayoutContext } from '../RootLayout';
import type { WorkerOutMessage, QueryResult } from './types';

function fmtMs(ms: number): string {
  if (ms < 1) return (ms * 1000).toFixed(0) + ' \u00b5s';
  if (ms < 1000) return ms.toFixed(1) + ' ms';
  return (ms / 1000).toFixed(2) + ' s';
}

export function SqliteMode() {
  const { theme, onStatusChange, onProgressChange } = useLayoutContext();
  const [activeQueryIdx, setActiveQueryIdx] = useState(0);
  const [selectedCount, setSelectedCount] = useState(10000);
  const [rowCount, setRowCount] = useState(0);
  const [workerReady, setWorkerReady] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timingStr, setTimingStr] = useState('');
  const [activeTab, setActiveTab] = useState<'results' | 'schema'>('results');
  const [schemaInfo, setSchemaInfo] = useState<{ count: number; custCount: number } | null>(null);
  const [showGenHint, setShowGenHint] = useState(true);
  const [panelSplit, setPanelSplit] = useState('3fr 2fr');

  const workerRef = useRef<Worker | null>(null);
  const getSqlRef = useRef<() => string>(() => '');
  const setSqlRef = useRef<(sql: string) => void>(() => {});
  const dividerRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<HTMLDivElement>(null);
  const rowCountRef = useRef(0);
  const pendingRunAfterGenerate = useRef(false);

  rowCountRef.current = rowCount;

  // Initialize worker
  useEffect(() => {
    const worker = new Worker(
      new URL('./worker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = worker;

    onStatusChange('', 'Loading WASM...');
    onProgressChange(2, true);

    // Load WASM files and send to worker
    (async () => {
      try {
        const [wasmExecText, wasmBytes] = await Promise.all([
          fetch(`${import.meta.env.BASE_URL}wasm_exec.js`).then((r) => r.text()),
          (async () => {
            const resp = await fetch(`${import.meta.env.BASE_URL}gnata.wasm`);
            const total = parseInt(resp.headers.get('content-length') || '0', 10);
            let loaded = 0;
            const chunks: Uint8Array[] = [];
            const reader = resp.body!.getReader();
            // eslint-disable-next-line no-constant-condition
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
              loaded += value.byteLength;
              if (total > 0)
                onProgressChange(30 + Math.min(25, (loaded / total) * 25), true);
            }
            const buf = new Uint8Array(loaded);
            let off = 0;
            for (const c of chunks) {
              buf.set(c, off);
              off += c.byteLength;
            }
            return buf.buffer;
          })(),
        ]);

        onProgressChange(55, true);
        onStatusChange('', 'Starting worker...');
        worker.postMessage({ type: 'init', wasmExecText, wasmBytes }, [wasmBytes]);
      } catch (err) {
        onStatusChange('', 'WASM load error');
        setError((err as Error).message);
      }
    })();

    worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
      const msg = e.data;

      if (msg.type === 'ready') {
        setWorkerReady(true);
        onStatusChange('ready', 'Ready');
        onProgressChange(100, false);
      } else if (msg.type === 'progress') {
        onProgressChange(msg.pct, true);
        onStatusChange('', msg.msg);
      } else if (msg.type === 'generated') {
        setRowCount(msg.count);
        setShowGenHint(false);
        onStatusChange(
          'ready',
          msg.count.toLocaleString() +
            ' orders, ' +
            msg.custCount +
            ' customers (' +
            msg.elapsed +
            's)',
        );
        onProgressChange(100, false);
        setSchemaInfo({ count: msg.count, custCount: msg.custCount });
        setGenerating(false);
        // Run the current query after generating
        pendingRunAfterGenerate.current = true;
      } else if (msg.type === 'queryResult') {
        const qr: QueryResult = {
          columns: msg.columns,
          values: msg.values,
          totalRows: msg.totalRows,
          time: msg.time,
          sampled: msg.sampled,
          noRows: msg.noRows,
        };
        setResult(qr);
        setError(null);
        setRunning(false);
        let timeStr = fmtMs(msg.time);
        if (msg.sampled) {
          timeStr +=
            '  \u2022  jsonata_query sampled ' +
            msg.sampled.sampled.toLocaleString() +
            ' of ' +
            msg.sampled.total.toLocaleString() +
            ' rows';
        }
        setTimingStr(timeStr);
        setActiveTab('results');
      } else if (msg.type === 'queryError') {
        setError(msg.msg);
        setResult(null);
        setRunning(false);
        setTimingStr('');
        setActiveTab('results');
      } else if (msg.type === 'error') {
        setError(msg.msg);
        setResult(null);
        setRunning(false);
        setActiveTab('results');
      }
    };

    return () => {
      worker.terminate();
    };
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle pending run after generate
  useEffect(() => {
    if (pendingRunAfterGenerate.current && rowCount > 0) {
      pendingRunAfterGenerate.current = false;
      doRunQuery();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowCount]);

  const doRunQuery = useCallback(() => {
    const sqlText = getSqlRef.current().trim();
    if (!sqlText || !workerRef.current) return;
    if (rowCountRef.current === 0) {
      // No data yet; generate first
      doGenerate();
      pendingRunAfterGenerate.current = true;
      return;
    }
    setRunning(true);
    setActiveTab('results');
    setResult(null);
    setError(null);
    setTimingStr('');
    workerRef.current.postMessage({ type: 'query', sql: sqlText });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doGenerate = useCallback(() => {
    if (!selectedCount || !workerRef.current) return;
    setGenerating(true);

    faker.seed(42);
    const pools = {
      products: Array.from({ length: 200 }, () => faker.commerce.productName()),
      addresses: Array.from({ length: 100 }, () => faker.location.streetAddress()),
      names: Array.from({ length: 200 }, () => faker.person.fullName()),
      emails: Array.from({ length: 200 }, () => faker.internet.email()),
      cities: Array.from({ length: 60 }, () => faker.location.city()),
      countries: Array.from({ length: 30 }, () => faker.location.country()),
    };

    onProgressChange(5, true);
    onStatusChange('', 'Generating pools...');
    workerRef.current.postMessage({ type: 'generate', count: selectedCount, pools });
  }, [selectedCount, onProgressChange, onStatusChange]);

  const handleClear = useCallback(() => {
    setResult(null);
    setError(null);
    setTimingStr('');
  }, []);

  const loadQuery = useCallback((idx: number) => {
    const q = QUERIES[idx];
    if (!q) return;
    setActiveQueryIdx(idx);
    setSqlRef.current(q.sql);
  }, []);

  // Resizable divider
  useEffect(() => {
    const divider = dividerRef.current;
    const panels = panelsRef.current;
    if (!divider || !panels) return;

    let dragging = false;

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      dragging = true;
      divider.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      const rect = panels.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.max(20, Math.min(80, (x / rect.width) * 100));
      setPanelSplit(pct + '% 1fr');
    };

    const onMouseUp = () => {
      if (!dragging) return;
      dragging = false;
      divider.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    divider.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    return () => {
      divider.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // Position divider
  const editorPanelRef = useRef<HTMLDivElement>(null);
  const [dividerLeft, setDividerLeft] = useState<number | undefined>(undefined);

  useEffect(() => {
    const panels = panelsRef.current;
    const editorPanel = editorPanelRef.current;
    if (!panels || !editorPanel) return;

    const observer = new ResizeObserver(() => {
      setDividerLeft(editorPanel.offsetWidth - 2);
    });
    observer.observe(panels);
    // Initial position
    setDividerLeft(editorPanel.offsetWidth - 2);

    return () => observer.disconnect();
  }, [panelSplit]);

  const ROW_COUNTS = [
    { label: '1K', count: 1000 },
    { label: '10K', count: 10000 },
    { label: '100K', count: 100000 },
    { label: '1M', count: 1000000 },
  ];

  return (
    <>
      {/* Toolbar */}
      <div className="toolbar">
        <button
          className="btn-primary"
          disabled={!workerReady || running || generating}
          onClick={doRunQuery}
        >
          Run<kbd>{'\u2318\u21A9'}</kbd>
        </button>
        <button className="btn-ghost" onClick={handleClear}>
          Clear
        </button>
        <div className="sep" />
        <span className="toolbar-label">Rows</span>
        <div className="gen-group">
          {ROW_COUNTS.map((rc) => (
            <button
              key={rc.count}
              className={'btn-ghost' + (selectedCount === rc.count ? ' active' : '')}
              onClick={() => setSelectedCount(rc.count)}
            >
              {rc.label}
            </button>
          ))}
        </div>
        <button
          className="btn-primary btn-generate"
          disabled={!workerReady || generating}
          onClick={doGenerate}
        >
          Generate
        </button>
        {showGenHint && (
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Generate fixture data</span>
        )}
        <div className="toolbar-right">
          <span className="timing">{timingStr}</span>
        </div>
      </div>

      {/* Query pills */}
      <div className="query-bar">
        <span className="query-bar-label">Examples</span>
        <div className="query-pills">
          {QUERIES.map((q, i) => (
            <button
              key={q.name}
              className={'query-pill' + (i === activeQueryIdx ? ' active' : '')}
              onClick={() => loadQuery(i)}
            >
              {q.name}
            </button>
          ))}
        </div>
      </div>

      {/* Panels */}
      <div
        className="panels"
        ref={panelsRef}
        style={{ gridTemplateColumns: panelSplit }}
      >
        <div className="editor-panel" ref={editorPanelRef}>
          <div className="panel-header">SQL Query</div>
          <SqlEditor
            initialDoc={QUERIES[0].sql}
            theme={theme}
            onGetSql={getSqlRef}
            onSetSql={setSqlRef}
            onRun={doRunQuery}
          />
        </div>
        <div
          className="panel-divider"
          ref={dividerRef}
          style={dividerLeft !== undefined ? { left: dividerLeft } : undefined}
        />
        <div className="right-panel">
          <div className="tab-bar">
            <button
              className={'tab' + (activeTab === 'results' ? ' active' : '')}
              onClick={() => setActiveTab('results')}
            >
              Results
            </button>
            <button
              className={'tab' + (activeTab === 'schema' ? ' active' : '')}
              onClick={() => setActiveTab('schema')}
            >
              Schema
            </button>
          </div>

          {/* Results tab */}
          <div className={'tab-content' + (activeTab === 'results' ? ' active' : '')}>
            {running ? (
              <div className="results-body">
                <div className="results-message">
                  <span className="spinner" /> Running...
                </div>
              </div>
            ) : (
              <>
                {result && !result.noRows && (
                  <BenchmarkBanner
                    queryName={QUERIES[activeQueryIdx]?.name ?? 'Query'}
                    rowCount={rowCount}
                    result={result}
                  />
                )}
                <ResultsTable result={result} error={error} />
              </>
            )}
          </div>

          {/* Schema tab */}
          <div className={'tab-content' + (activeTab === 'schema' ? ' active' : '')}>
            <div className="schema-content">
              {schemaInfo ? (
                <>
                  <h3>customers</h3>
                  <table className="schema-table">
                    <tbody>
                      <tr><td>id</td><td>INTEGER PK</td></tr>
                      <tr><td>name</td><td>TEXT</td></tr>
                      <tr><td>email</td><td>TEXT</td></tr>
                      <tr><td>city</td><td>TEXT</td></tr>
                      <tr><td>country</td><td>TEXT</td></tr>
                    </tbody>
                  </table>
                  <span className="row-count">{schemaInfo.custCount} rows</span>

                  <h3>orders</h3>
                  <table className="schema-table">
                    <tbody>
                      <tr><td>id</td><td>INTEGER PK</td></tr>
                      <tr><td>customer_id</td><td>INTEGER FK</td></tr>
                      <tr><td>order_date</td><td>TEXT</td></tr>
                      <tr><td>status</td><td>TEXT</td></tr>
                      <tr><td>data</td><td>JSON</td></tr>
                    </tbody>
                  </table>
                  <span className="row-count">
                    {schemaInfo.count.toLocaleString()} rows
                  </span>

                  <h3>data (JSON column)</h3>
                  <pre>{`{
  "items": [
    { "product", "price", "quantity", "category" }
  ],
  "shipping": { "method", "cost", "address" },
  "total": number
}`}</pre>
                </>
              ) : (
                <div className="getting-started">
                  <h3>Getting Started</h3>
                  <ol>
                    <li>Select a dataset size (1K {'\u2013'} 1M)</li>
                    <li>Click <strong>Generate</strong> to create test data</li>
                    <li>Choose an example query above</li>
                    <li>Press <strong>Run</strong> ({'\u2318\u21A9'}) to execute</li>
                  </ol>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
