'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
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

const WASM_OPTIONS = {
  evalWasmUrl: '/gnata.wasm',
  evalExecUrl: '/wasm_exec.js',
  lspWasmUrl: '/gnata-lsp.wasm',
  lspExecUrl: '/lsp-wasm_exec.js',
};

const border = '#292e42';
const surface = '#1f2335';
const muted = '#565f89';
const bg = '#1a1b26';
const accent = '#7aa2f7';

function prettifyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '5px 12px',
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.8px',
        color: muted,
        borderBottom: `1px solid ${border}`,
        background: surface,
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
      onMouseEnter={(e) => { (e.target as HTMLElement).style.background = accent; }}
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
      onMouseEnter={(e) => { (e.target as HTMLElement).style.background = accent; }}
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
  const [expression, setExpression] = useState(defaultExpr);
  const [inputJson, setInputJson] = useState(() => prettifyJson(defaultInput));
  const [exprHeight, setExprHeight] = useState(60);
  const [splitPct, setSplitPct] = useState(50);
  const panelsRef = useRef<HTMLDivElement>(null);

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
        border: `1px solid ${border}`,
        overflow: 'hidden',
        marginTop: 16,
        marginBottom: 16,
        background: bg,
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
          borderBottom: `1px solid ${border}`,
          background: surface,
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => evalResult.evaluate()}
          disabled={!wasm.isReady}
          style={{
            background: accent,
            color: bg,
            border: 'none',
            borderRadius: 5,
            padding: '4px 14px',
            fontSize: 12,
            fontWeight: 600,
            cursor: wasm.isReady ? 'pointer' : 'not-allowed',
            opacity: wasm.isReady ? 1 : 0.4,
            fontFamily: 'inherit',
          }}
        >
          Run
        </button>
        {evalResult.timing && (
          <span style={{ fontSize: 12, fontFamily: 'monospace', color: accent }}>
            {evalResult.timing}
          </span>
        )}
      </div>

      {/* Expression bar — stretches to fit, scrollable */}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          borderBottom: `1px solid ${border}`,
          background: bg,
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
            color: muted,
            borderRight: `1px solid ${border}`,
            display: 'flex',
            alignItems: 'flex-start',
            paddingTop: 10,
            minWidth: 90,
            background: surface,
          }}
        >
          Expression
        </div>
        <JsonataEditor
          value={expression}
          onChange={setExpression}
          theme="dark"
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
              <Label>Input</Label>
              <JsonataInput
                value={inputJson}
                onChange={setInputJson}
                theme="dark"
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
          <Label>Result</Label>
          <JsonataResult
            value={evalResult.result}
            error={evalResult.error}
            timing={evalResult.timing}
            theme="dark"
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
            color: muted,
            borderTop: `1px solid ${border}`,
            background: surface,
            flexShrink: 0,
          }}
        >
          Loading WASM...
        </div>
      )}
    </div>
  );
}
