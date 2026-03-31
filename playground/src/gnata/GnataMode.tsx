import { useState, useCallback, useEffect, useRef } from 'react';
import {
  useJsonataWasm,
  useJsonataEval,
  useJsonataSchema,
  JsonataEditor,
  JsonataInput,
  JsonataResult,
} from '@gnata-sqlite/react';
import { GNATA_EXAMPLES } from './examples';
import { useLayoutContext } from '../RootLayout';

const EXAMPLE_KEYS = Object.keys(GNATA_EXAMPLES);

const base = import.meta.env.BASE_URL;

const WASM_OPTIONS = {
  evalWasmUrl: `${base}gnata.wasm`,
  evalExecUrl: `${base}wasm_exec.js`,
  lspWasmUrl: `${base}gnata-lsp.wasm`,
  lspExecUrl: `${base}lsp-wasm_exec.js`,
};

const DEFAULT_EXPR = '$sum(Account.Order.Product.(Price * Quantity))';
const DEFAULT_INPUT = `{
  "Account": {
    "Name": "Firefly",
    "Order": [
      {
        "OrderID": "order103",
        "Product": [
          { "Name": "Bowler Hat", "Price": 34.45, "Quantity": 2 },
          { "Name": "Trilby hat", "Price": 21.67, "Quantity": 1 }
        ]
      },
      {
        "OrderID": "order104",
        "Product": [
          { "Name": "Cloak", "Price": 107.99, "Quantity": 1 }
        ]
      }
    ]
  }
}`;

export function GnataMode() {
  const { theme, onStatusChange, onProgressChange } = useLayoutContext();
  const [expression, setExpression] = useState(DEFAULT_EXPR);
  const [inputJson, setInputJson] = useState(DEFAULT_INPUT);
  const [activeExample, setActiveExample] = useState<number | null>(null);

  const wasm = useJsonataWasm(WASM_OPTIONS);

  const inputJsonRef = useRef(inputJson);
  inputJsonRef.current = inputJson;
  const getInputJson = useCallback(() => inputJsonRef.current, []);

  const schema = useJsonataSchema(inputJson);

  const evalResult = useJsonataEval(expression, inputJson, wasm.gnataEval);

  // Update parent status based on WASM readiness
  const prevReady = useRef(false);
  useEffect(() => {
    if (wasm.isReady && !prevReady.current) {
      prevReady.current = true;
      onStatusChange('ready', 'Ready');
      onProgressChange(100, false);
    } else if (!wasm.isReady && !wasm.error) {
      onStatusChange('', 'Loading gnata WASM...');
      onProgressChange(30, true);
    } else if (wasm.error) {
      onStatusChange('', 'WASM load error');
    }
  }, [wasm.isReady, wasm.error, onStatusChange, onProgressChange]);

  const handleRun = useCallback(() => {
    evalResult.evaluate();
  }, [evalResult]);

  const handleClear = useCallback(() => {
    setExpression('');
    setInputJson('');
    setActiveExample(null);
  }, []);

  const loadExample = useCallback(
    (idx: number) => {
      const key = EXAMPLE_KEYS[idx];
      const ex = GNATA_EXAMPLES[key];
      if (!ex) return;
      setExpression(ex.expr);
      setInputJson(ex.data);
      setActiveExample(idx);
    },
    [],
  );

  const colors = theme === 'dark'
    ? { surface: '#1f2335', border: '#292e42', muted: '#565f89', green: '#9ece6a', accent: '#7aa2f7', accentText: '#1a1b26' }
    : { surface: '#e1e2e7', border: '#c4c8da', muted: '#848cb5', green: '#587539', accent: '#2e7de9', accentText: '#ffffff' };

  return (
    <div className="gnata-mode-wrapper">
      {/* Toolbar */}
      <div className="toolbar">
        <button
          className="btn-primary"
          disabled={!wasm.isReady}
          onClick={handleRun}
        >
          Run<kbd>{'\u2318\u21A9'}</kbd>
        </button>
        <button className="btn-ghost" onClick={handleClear}>
          Clear
        </button>
        <div className="toolbar-right">
          <span className="timing">{evalResult.timing}</span>
        </div>
      </div>

      {/* Example pills */}
      <div className="query-bar">
        <span className="query-bar-label">Examples</span>
        <div className="query-pills">
          {EXAMPLE_KEYS.map((key, i) => (
            <button
              key={key}
              className={'query-pill' + (i === activeExample ? ' active' : '')}
              onClick={() => loadExample(i)}
            >
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Expression bar */}
      <div style={{
        display: 'flex',
        alignItems: 'stretch',
        borderBottom: `1px solid ${colors.border}`,
        background: colors.surface,
        flexShrink: 0,
      }}>
        <div style={{
          padding: '10px 16px',
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.8px',
          color: colors.muted,
          borderRight: `1px solid ${colors.border}`,
          display: 'flex',
          alignItems: 'center',
          minWidth: 120,
        }}>
          Expression
        </div>
        <JsonataEditor
          value={expression}
          onChange={setExpression}
          onRun={handleRun}
          theme={theme}
          schema={schema}
          gnataEval={wasm.gnataEval}
          gnataDiagnostics={wasm.gnataDiagnostics}
          gnataCompletions={wasm.gnataCompletions}
          gnataHover={wasm.gnataHover}
          getInputJson={getInputJson}
          style={{ flex: 1, minHeight: 36, maxHeight: 80 }}
        />
      </div>

      {/* Input + Result panels */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        flex: 1,
        overflow: 'hidden',
        minHeight: 0,
      }}>
        {/* Input panel */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRight: `1px solid ${colors.border}`,
        }}>
          <div className="panel-header">Input JSON</div>
          <JsonataInput
            value={inputJson}
            onChange={setInputJson}
            theme={theme}
            style={{ flex: 1, overflow: 'hidden' }}
          />
        </div>

        {/* Result panel */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div className="panel-header">Result</div>
          <JsonataResult
            value={evalResult.result}
            error={evalResult.error}
            timing={evalResult.timing}
            theme={theme}
            showTiming={false}
            style={{ flex: 1, overflow: 'hidden' }}
          />
        </div>
      </div>
    </div>
  );
}
