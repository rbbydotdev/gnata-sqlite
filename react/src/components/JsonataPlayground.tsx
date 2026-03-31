import React, { useState, useCallback, useRef, useId } from 'react';
import { useJsonataWasm, type UseJsonataWasmOptions } from '../hooks/use-jsonata-wasm';
import { useJsonataEval } from '../hooks/use-jsonata-eval';
import { useJsonataSchema } from '../hooks/use-jsonata-schema';
import { JsonataEditor } from './JsonataEditor';
import { JsonataInput } from './JsonataInput';
import { JsonataResult } from './JsonataResult';
import { darkColors, lightColors } from '../theme/colors';
import type { CMTokenColors } from '../theme/colors';

export interface JsonataPlaygroundProps {
  /** Initial JSONata expression */
  defaultExpression?: string;
  /** Initial JSON input data */
  defaultInput?: string;
  /** Color theme */
  theme?: 'dark' | 'light';
  /** Optional theme color overrides */
  themeOverrides?: Partial<CMTokenColors>;
  /** Total height of the widget in pixels */
  height?: number;
  /** URLs for WASM modules. If omitted, only syntax highlighting is available. */
  wasmOptions?: UseJsonataWasmOptions;
  /** CSS class name for the outer container */
  className?: string;
  /** Inline style overrides for the outer container */
  style?: React.CSSProperties;
}

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

const DEFAULT_EXPRESSION = '$sum(Account.Order.Product.(Price * Quantity))';

/**
 * Full JSONata playground widget.
 *
 * Composes JsonataEditor, JsonataInput, and JsonataResult into a
 * three-panel layout: expression editor (top), input JSON (bottom-left),
 * and result (bottom-right).
 *
 * Optionally loads WASM modules for evaluation, diagnostics, autocomplete,
 * and hover tooltips. Without WASM, the editor provides syntax highlighting only.
 */
export function JsonataPlayground(props: JsonataPlaygroundProps) {
  const id = useId();
  const isDark = (props.theme ?? 'dark') === 'dark';
  const colors = isDark ? darkColors : lightColors;
  const height = props.height ?? 500;

  const [expression, setExpression] = useState(props.defaultExpression ?? DEFAULT_EXPRESSION);
  const [inputJson, setInputJson] = useState(props.defaultInput ?? DEFAULT_INPUT);

  // Ref for getInputJson callback (stable reference for autocomplete)
  const inputJsonRef = useRef(inputJson);
  inputJsonRef.current = inputJson;
  const getInputJson = useCallback(() => inputJsonRef.current, []);

  // WASM loading (optional)
  const wasm = props.wasmOptions
    ? // eslint-disable-next-line react-hooks/rules-of-hooks
      useJsonataWasm(props.wasmOptions)
    : null;

  // Schema from input data
  const schema = useJsonataSchema(inputJson);

  // Evaluation
  const evalResult = useJsonataEval(
    expression,
    inputJson,
    wasm?.gnataEval ?? null,
  );

  const handleRun = useCallback(() => {
    evalResult.evaluate();
  }, [evalResult]);

  // Header styles
  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    background: colors.surface,
    borderBottom: `1px solid ${colors.border}`,
    flexShrink: 0,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    color: colors.muted,
    userSelect: 'none',
  };

  const panelHeaderStyle: React.CSSProperties = {
    ...labelStyle,
    padding: '8px 12px',
    background: colors.surface,
    borderBottom: `1px solid ${colors.border}`,
  };

  const timingStyle: React.CSSProperties = {
    marginLeft: 'auto',
    fontSize: 12,
    fontFamily: "'SF Mono', monospace",
    color: colors.accent,
  };

  const statusDotStyle: React.CSSProperties = {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: wasm?.isReady ? colors.green : colors.muted,
    transition: 'background 0.3s',
  };

  return (
    <div
      id={id}
      className={props.className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        overflow: 'hidden',
        fontFamily: "'Onest', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: colors.text,
        ...props.style,
      }}
    >
      {/* Toolbar */}
      <div style={headerStyle}>
        <button
          onClick={handleRun}
          disabled={!wasm?.isReady}
          style={{
            fontFamily: "'Onest', sans-serif",
            fontSize: 13,
            fontWeight: 600,
            padding: '6px 16px',
            border: 'none',
            borderRadius: 6,
            cursor: wasm?.isReady ? 'pointer' : 'not-allowed',
            background: colors.accent,
            color: colors.accentText,
            opacity: wasm?.isReady ? 1 : 0.4,
            transition: 'opacity 0.15s',
          }}
        >
          Run
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={statusDotStyle} />
          <span style={{ fontSize: 12, color: wasm?.isReady ? colors.green : colors.muted }}>
            {wasm?.isReady ? 'Ready' : wasm?.error ? 'Error' : 'Loading...'}
          </span>
        </div>
        {evalResult.timing && <span style={timingStyle}>{evalResult.timing}</span>}
      </div>

      {/* Expression bar */}
      <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: `1px solid ${colors.border}`, flexShrink: 0 }}>
        <div style={{ ...panelHeaderStyle, borderBottom: 'none', borderRight: `1px solid ${colors.border}`, minWidth: 100, display: 'flex', alignItems: 'center' }}>
          Expression
        </div>
        <JsonataEditor
          value={expression}
          onChange={setExpression}
          onRun={handleRun}
          theme={props.theme ?? 'dark'}
          themeOverrides={props.themeOverrides}
          schema={schema}
          gnataEval={wasm?.gnataEval}
          gnataDiagnostics={wasm?.gnataDiagnostics}
          gnataCompletions={wasm?.gnataCompletions}
          gnataHover={wasm?.gnataHover}
          getInputJson={getInputJson}
          style={{ flex: 1, minHeight: 36, maxHeight: 80 }}
        />
      </div>

      {/* Bottom panels: Input + Result */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          flex: 1,
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {/* Input panel */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: `1px solid ${colors.border}` }}>
          <div style={panelHeaderStyle}>Input JSON</div>
          <JsonataInput
            value={inputJson}
            onChange={setInputJson}
            theme={props.theme ?? 'dark'}
            themeOverrides={props.themeOverrides}
            style={{ flex: 1, overflow: 'hidden' }}
          />
        </div>

        {/* Result panel */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={panelHeaderStyle}>Result</div>
          <JsonataResult
            value={evalResult.result}
            error={evalResult.error}
            timing={evalResult.timing}
            theme={props.theme ?? 'dark'}
            themeOverrides={props.themeOverrides}
            showTiming={false}
            style={{ flex: 1, overflow: 'hidden' }}
          />
        </div>
      </div>
    </div>
  );
}
