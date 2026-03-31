'use client';

import { useState, useCallback, useRef, useEffect, useSyncExternalStore } from 'react';
import {
  useJsonataWasm,
  useJsonataEval,
  useJsonataSchema,
  JsonataEditor,
  JsonataInput,
  JsonataResult,
} from '@gnata-sqlite/react';

interface RunExampleProps {
  expression?: string;
  input?: string;
  height?: number;
  showInput?: boolean;
}

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

const WASM_OPTIONS = {
  evalWasmUrl: `${base}/gnata.wasm`,
  evalExecUrl: `${base}/wasm_exec.js`,
  lspWasmUrl: `${base}/gnata-lsp.wasm`,
  lspExecUrl: `${base}/lsp-wasm_exec.js`,
};

interface Palette {
  border: string;
  surface: string;
  muted: string;
  bg: string;
  accent: string;
  accentDim: string;
}

const palettes: Record<'dark' | 'light', Palette> = {
  dark: {
    border: '#292e42',
    surface: '#1f2335',
    muted: '#565f89',
    bg: '#1a1b26',
    accent: '#7aa2f7',
    accentDim: 'rgba(122,162,247,0.12)',
  },
  light: {
    border: '#c4c8da',
    surface: '#e8e9ed',
    muted: '#848cb5',
    bg: '#e1e2e7',
    accent: '#2e7de9',
    accentDim: 'rgba(46,125,233,0.10)',
  },
};

function subscribeToTheme(cb: () => void) {
  const observer = new MutationObserver(cb);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

function getThemeSnapshot(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function useTheme(): 'dark' | 'light' {
  return useSyncExternalStore(subscribeToTheme, getThemeSnapshot, () => 'dark');
}

interface Example {
  name: string;
  expr: string;
  data: string;
}

const EXAMPLES: Example[] = [
  {
    name: 'Invoice',
    expr: '$sum(\n  Account.Order.Product.(\n    Price * Quantity\n  )\n)',
    data: '{"Account":{"Name":"Firefly","Order":[{"OrderID":"order103","Product":[{"Name":"Bowler Hat","Price":34.45,"Quantity":2},{"Name":"Trilby hat","Price":21.67,"Quantity":1}]},{"OrderID":"order104","Product":[{"Name":"Cloak","Price":107.99,"Quantity":1}]}]}}',
  },
  {
    name: 'Filter',
    expr: '$filter(users, function($u) {\n  $u.age >= 21\n}).name',
    data: '{"users":[{"name":"Alice","age":30,"role":"admin"},{"name":"Bob","age":17,"role":"viewer"},{"name":"Carol","age":25,"role":"editor"},{"name":"Dave","age":19,"role":"viewer"}]}',
  },
  {
    name: 'Transform',
    expr: 'orders.{\n  "id": id,\n  "customer": customer.name & " (" & customer.email & ")",\n  "total": $round($sum(items.(price * qty)), 2),\n  "items": $count(items)\n}',
    data: '{"orders":[{"id":"ORD-001","customer":{"name":"Acme Corp","email":"purchasing@acme.com"},"items":[{"sku":"WDG-10","price":29.99,"qty":5},{"sku":"SPR-03","price":149.00,"qty":1},{"sku":"BLT-07","price":8.50,"qty":12}]},{"id":"ORD-002","customer":{"name":"Globex","email":"ops@globex.net"},"items":[{"sku":"WDG-10","price":29.99,"qty":20},{"sku":"MTR-01","price":450.00,"qty":2}]}]}',
  },
  {
    name: 'Pipeline',
    expr: 'records\n  ~> $filter(function($r) { $r.status != "cancelled" })\n  ~> $sort(function($a, $b) { $b.price * $b.qty - $a.price * $a.qty })\n  ~> $map(function($r) { $r.product & ": $" & $string($r.price * $r.qty) })',
    data: '{"records":[{"product":"Laptop","price":999,"qty":3,"status":"shipped"},{"product":"Mouse","price":29,"qty":50,"status":"delivered"},{"product":"Monitor","price":450,"qty":5,"status":"cancelled"},{"product":"Keyboard","price":75,"qty":20,"status":"shipped"},{"product":"Webcam","price":89,"qty":15,"status":"shipped"}]}',
  },
  {
    name: 'Nested',
    expr: '{\n  "total_endpoints": $count(services.endpoints),\n  "slow_p99": services.endpoints[latency.p99 > 200].{\n    "path": method & " " & path,\n    "p99": latency.p99\n  },\n  "error_rate": $round($average(services.endpoints.error_rate), 2)\n}',
    data: '{"services":[{"name":"auth-service","endpoints":[{"method":"POST","path":"/login","latency":{"p50":45,"p99":320},"error_rate":0.02},{"method":"POST","path":"/refresh","latency":{"p50":12,"p99":85},"error_rate":0.001}]},{"name":"data-service","endpoints":[{"method":"GET","path":"/query","latency":{"p50":180,"p99":950},"error_rate":0.05},{"method":"POST","path":"/ingest","latency":{"p50":25,"p99":110},"error_rate":0.01},{"method":"GET","path":"/health","latency":{"p50":2,"p99":8},"error_rate":0.0}]}]}',
  },
];

function prettifyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function Label({ children, c }: { children: React.ReactNode; c: Palette }) {
  return (
    <div
      style={{
        padding: '5px 12px',
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.8px',
        color: c.muted,
        borderBottom: `1px solid ${c.border}`,
        background: c.surface,
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

/** Horizontal drag handle between two panes */
function HDivider({ onDrag }: { onDrag: (deltaX: number) => void }) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    lastX.current = e.clientX;

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const dx = ev.clientX - lastX.current;
      lastX.current = ev.clientX;
      onDrag(dx);
    };
    const onUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [onDrag]);

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        width: 5,
        cursor: 'col-resize',
        background: 'transparent',
        flexShrink: 0,
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#7aa2f7'; }}
      onMouseLeave={(e) => { if (!dragging.current) (e.target as HTMLElement).style.background = 'transparent'; }}
    />
  );
}

/** Vertical drag handle between expression and panels */
function VDivider({ onDrag }: { onDrag: (deltaY: number) => void }) {
  const dragging = useRef(false);
  const lastY = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    lastY.current = e.clientY;

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const dy = ev.clientY - lastY.current;
      lastY.current = ev.clientY;
      onDrag(dy);
    };
    const onUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, [onDrag]);

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        height: 5,
        cursor: 'row-resize',
        background: 'transparent',
        flexShrink: 0,
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#7aa2f7'; }}
      onMouseLeave={(e) => { if (!dragging.current) (e.target as HTMLElement).style.background = 'transparent'; }}
    />
  );
}

export function RunExample({
  expression: defaultExpr = '',
  input: defaultInput = '{}',
  height: initialHeight = 250,
  showInput = true,
}: RunExampleProps) {
  const theme = useTheme();
  const c = palettes[theme];

  const [expression, setExpression] = useState(defaultExpr);
  const [inputJson, setInputJson] = useState(() => prettifyJson(defaultInput));
  const [exprHeight, setExprHeight] = useState(60);
  const [splitPct, setSplitPct] = useState(50);
  const [activeExample, setActiveExample] = useState<number | null>(null);
  const panelsRef = useRef<HTMLDivElement>(null);

  const loadExample = useCallback((idx: number) => {
    const ex = EXAMPLES[idx];
    setExpression(ex.expr);
    setInputJson(prettifyJson(ex.data));
    setActiveExample(idx);
    setExprHeight(Math.max(60, ex.expr.split('\n').length * 20 + 16));
  }, []);

  const wasm = useJsonataWasm(WASM_OPTIONS);
  const schema = useJsonataSchema(inputJson);
  const evalResult = useJsonataEval(expression, inputJson, wasm.gnataEval);

  const inputJsonRef = useRef(inputJson);
  inputJsonRef.current = inputJson;
  const getInputJson = useCallback(() => inputJsonRef.current, []);

  const handleExprDrag = useCallback((dy: number) => {
    setExprHeight((h) => Math.max(32, Math.min(300, h + dy)));
  }, []);

  const handleSplitDrag = useCallback((dx: number) => {
    const container = panelsRef.current;
    if (!container) return;
    const w = container.offsetWidth;
    if (w === 0) return;
    setSplitPct((p) => Math.max(20, Math.min(80, p + (dx / w) * 100)));
  }, []);

  // Auto-grow expression height based on line count
  const lineCount = expression.split('\n').length;
  const autoHeight = Math.max(32, Math.min(300, lineCount * 20 + 16));
  useEffect(() => {
    if (autoHeight > exprHeight) setExprHeight(autoHeight);
  }, [autoHeight]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      style={{
        borderRadius: 8,
        border: `1px solid ${c.border}`,
        overflow: 'hidden',
        marginTop: 16,
        marginBottom: 16,
        background: c.bg,
        resize: 'both',
        minHeight: 150,
        minWidth: 300,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          borderBottom: `1px solid ${c.border}`,
          background: c.surface,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', gap: 4, overflow: 'auto', flex: 1 }}>
          {EXAMPLES.map((ex, i) => (
            <button
              key={ex.name}
              onClick={() => loadExample(i)}
              style={{
                padding: '3px 10px',
                fontSize: 11,
                fontWeight: 500,
                borderRadius: 12,
                border: `1px solid ${i === activeExample ? c.accent : c.border}`,
                background: i === activeExample ? c.accentDim : 'transparent',
                color: i === activeExample ? c.accent : c.muted,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
            >
              {ex.name}
            </button>
          ))}
        </div>
        {evalResult.timing && (
          <span style={{ fontSize: 12, fontFamily: 'monospace', color: c.accent, flexShrink: 0 }}>
            {evalResult.timing}
          </span>
        )}
      </div>

      {/* Expression bar — stretches to fit, scrollable */}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          borderBottom: `1px solid ${c.border}`,
          background: c.bg,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: '8px 12px',
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            color: c.muted,
            borderRight: `1px solid ${c.border}`,
            display: 'flex',
            alignItems: 'flex-start',
            paddingTop: 10,
            minWidth: 90,
            background: c.surface,
          }}
        >
          Expression
        </div>
        <JsonataEditor
          value={expression}
          onChange={setExpression}
          theme={theme}
          schema={schema}
          gnataEval={wasm.gnataEval}
          gnataDiagnostics={wasm.gnataDiagnostics}
          gnataCompletions={wasm.gnataCompletions}
          gnataHover={wasm.gnataHover}
          getInputJson={getInputJson}
          placeholder="Type a JSONata expression..."
          style={{
            flex: 1,
            height: exprHeight,
            overflow: 'auto',
          }}
        />
      </div>

      {/* Vertical resize handle between expression and panels */}
      <VDivider onDrag={handleExprDrag} />

      {/* Input + Result panels */}
      <div
        ref={panelsRef}
        style={{
          display: 'flex',
          flex: 1,
          minHeight: initialHeight,
          overflow: 'hidden',
        }}
      >
        {showInput && (
          <>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                width: `${splitPct}%`,
                overflow: 'hidden',
              }}
            >
              <Label c={c}>Input</Label>
              <JsonataInput
                value={inputJson}
                onChange={setInputJson}
                theme={theme}
                style={{ flex: 1, overflow: 'auto' }}
              />
            </div>
            <HDivider onDrag={handleSplitDrag} />
          </>
        )}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            overflow: 'hidden',
          }}
        >
          <Label c={c}>Result</Label>
          <JsonataResult
            value={evalResult.result}
            error={evalResult.error}
            timing={evalResult.timing}
            theme={theme}
            style={{ flex: 1, overflow: 'auto' }}
          />
        </div>
      </div>

      {/* Status bar */}
      {!wasm.isReady && (
        <div
          style={{
            padding: '6px 12px',
            fontSize: 11,
            color: c.muted,
            borderTop: `1px solid ${c.border}`,
            background: c.surface,
            flexShrink: 0,
          }}
        >
          Loading WASM...
        </div>
      )}
    </div>
  );
}
