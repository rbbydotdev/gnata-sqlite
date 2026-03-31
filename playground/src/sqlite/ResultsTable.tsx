import { useState, useCallback } from 'react';
import type { CellValue, QueryResult } from './types';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtMs(ms: number): string {
  if (ms < 1) return (ms * 1000).toFixed(0) + ' \u00b5s';
  if (ms < 1000) return ms.toFixed(1) + ' ms';
  return (ms / 1000).toFixed(2) + ' s';
}

interface ResultsTableProps {
  result: QueryResult | null;
  error: string | null;
}

function CellContent({ value }: { value: CellValue }) {
  if (value === null) return <span className="null-val">NULL</span>;
  if (typeof value === 'number') return <span className="num-val">{value}</span>;
  const s = String(value);
  if (s[0] === '{' || s[0] === '[') {
    return <span className="json-val">{s}</span>;
  }
  return <>{s}</>;
}

export function ResultsTable({ result, error }: ResultsTableProps) {
  const [focusedRow, setFocusedRow] = useState<number | null>(null);

  const closeDetail = useCallback(() => setFocusedRow(null), []);

  if (error) {
    if (error.includes('no such table')) {
      return (
        <div className="results-body">
          <div className="results-message">
            Select a row count and click <strong>Generate</strong> to create test data first.
          </div>
        </div>
      );
    }
    return (
      <div className="results-body">
        <div
          className="results-message error"
          dangerouslySetInnerHTML={{ __html: escapeHtml(error) }}
        />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="results-body">
        <div className="results-message">Run a query to see results.</div>
      </div>
    );
  }

  if (result.noRows) {
    return (
      <>
        <div className="results-body">
          <div className="results-message">Query executed successfully (no rows returned).</div>
        </div>
      </>
    );
  }

  const { columns, values, totalRows, time } = result;

  // Build row detail data
  let rowDetailData: Record<string, unknown> | null = null;
  if (focusedRow !== null && values[focusedRow]) {
    rowDetailData = {};
    for (let ci = 0; ci < columns.length; ci++) {
      let val: unknown = values[focusedRow][ci];
      if (typeof val === 'string') {
        try { val = JSON.parse(val); } catch { /* keep as string */ }
      }
      rowDetailData[columns[ci]] = val;
    }
  }

  return (
    <>
      <div className="results-body">
        <div className="results-table-wrap">
          <table className="results-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {values.map((row, ri) => (
                <tr
                  key={ri}
                  data-row={ri}
                  className={focusedRow === ri ? 'focused' : undefined}
                  onClick={() => setFocusedRow(focusedRow === ri ? null : ri)}
                >
                  {row.map((cell, ci) => (
                    <td key={ci}>
                      <CellContent value={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {rowDetailData && (
        <div className="row-detail">
          <div className="row-detail-header">
            <span>Row {focusedRow! + 1}</span>
            <button className="row-detail-close" title="Close" onClick={closeDetail}>
              &times;
            </button>
          </div>
          <pre>{JSON.stringify(rowDetailData, null, 2)}</pre>
        </div>
      )}
      <div className="results-footer">
        <span>
          {values.length < totalRows
            ? `Showing ${values.length} of ${totalRows.toLocaleString()} rows`
            : `${totalRows.toLocaleString()} row${totalRows !== 1 ? 's' : ''}`}
        </span>
        <span>{fmtMs(time)}</span>
      </div>
    </>
  );
}
