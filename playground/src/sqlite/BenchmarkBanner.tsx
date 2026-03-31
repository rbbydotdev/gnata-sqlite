import type { QueryResult } from './types';

function fmtMs(ms: number): string {
  if (ms < 1) return (ms * 1000).toFixed(0) + ' \u00b5s';
  if (ms < 1000) return ms.toFixed(1) + ' ms';
  return (ms / 1000).toFixed(2) + ' s';
}

interface BenchmarkBannerProps {
  queryName: string;
  rowCount: number;
  result: QueryResult;
}

export function BenchmarkBanner({ queryName, rowCount, result }: BenchmarkBannerProps) {
  const barPct = Math.min(
    100,
    Math.max(
      12,
      result.time < 10 ? 15 : result.time < 100 ? 40 : result.time < 500 ? 65 : 90,
    ),
  );
  const rowLabel = rowCount > 0 ? Number(rowCount).toLocaleString() + ' rows' : '';

  return (
    <div className="bench-banner">
      <div className="bench-title">
        {queryName}
        {rowLabel && <span> {rowLabel}</span>}
      </div>
      <div className="bench-bar-track">
        <div className="bench-bar" style={{ width: barPct + '%' }}>
          {fmtMs(result.time)}
        </div>
      </div>
      <div className="bench-tag">gnata</div>
      <div style={{ width: '100%', fontSize: 11, color: 'var(--muted)' }}>
        Native gnata extension is 50{'\u2013'}100x faster than this in-browser WASM benchmark
      </div>
    </div>
  );
}
