'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

// ── Theme (matches run-example.tsx pattern) ─────────────────────

function subscribeToTheme(cb: () => void) {
  const observer = new MutationObserver(cb);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  return () => observer.disconnect();
}

function getThemeSnapshot(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function useTheme(): 'dark' | 'light' {
  return useSyncExternalStore(subscribeToTheme, getThemeSnapshot, () => 'dark');
}

// ── Types (matching JSON output from benchmarks/run.ts) ─────────

interface TimingStats {
  median: number;
  mean: number;
  min: number;
  max: number;
  runs: number[];
}

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

// ── Helpers ─────────────────────────────────────────────────────

function fmtMs(seconds: number): string {
  const ms = seconds * 1000;
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtRows(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}

function ratioColor(ratio: number | null, theme: 'dark' | 'light'): string {
  if (ratio === null || !isFinite(ratio)) return theme === 'dark' ? '#565f89' : '#848cb5';
  if (ratio < 1) return theme === 'dark' ? '#9ece6a' : '#587539';
  if (ratio < 1.5) return theme === 'dark' ? '#9ece6a' : '#587539';
  if (ratio < 3) return theme === 'dark' ? '#e0af68' : '#8a5d00';
  return theme === 'dark' ? '#f7768e' : '#c53b53';
}

function ratioLabel(ratio: number | null): string {
  if (ratio === null || !isFinite(ratio)) return '—';
  return `${ratio.toFixed(2)}x`;
}

// ── Components ──────────────────────────────────────────────────

function SuiteSection({
  suite,
  theme,
  defaultOpen,
}: {
  suite: SuiteResult;
  theme: 'dark' | 'light';
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isDark = theme === 'dark';

  const borderColor = isDark ? '#292e42' : '#c4c8da';
  const surfaceColor = isDark ? '#1f2335' : '#f5f5f7';
  const headerBg = isDark ? '#1a1b26' : '#e8e9ed';
  const mutedColor = isDark ? '#565f89' : '#848cb5';
  const textColor = isDark ? '#a9b1d6' : '#3b4261';
  const headText = isDark ? '#c0caf5' : '#1a1b26';

  // Compute suite average ratio (only paired tests)
  const paired = suite.tests.filter((t) => t.ratio !== null && isFinite(t.ratio!));
  const avgRatio =
    paired.length > 0
      ? paired.reduce((sum, t) => sum + t.ratio!, 0) / paired.length
      : null;

  return (
    <div
      style={{
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        overflow: 'hidden',
        marginBottom: 16,
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        type="button"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: headerBg,
          border: 'none',
          cursor: 'pointer',
          color: headText,
          fontSize: 15,
          fontWeight: 600,
          textAlign: 'left',
          fontFamily: 'inherit',
        }}
      >
        <span>
          <span style={{ marginRight: 8 }}>{open ? '▾' : '▸'}</span>
          {suite.category}
        </span>
        {avgRatio !== null && (
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: ratioColor(avgRatio, theme),
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            avg {avgRatio.toFixed(2)}x
          </span>
        )}
      </button>

      {open && (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            <thead>
              <tr
                style={{
                  background: surfaceColor,
                  color: mutedColor,
                  textAlign: 'left',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                <th style={{ padding: '8px 16px', fontWeight: 500 }}>Test</th>
                <th style={{ padding: '8px 12px', fontWeight: 500, textAlign: 'right' }}>Rows</th>
                <th style={{ padding: '8px 12px', fontWeight: 500, textAlign: 'right' }}>gnata</th>
                <th style={{ padding: '8px 12px', fontWeight: 500, textAlign: 'right' }}>SQL</th>
                <th style={{ padding: '8px 12px', fontWeight: 500, textAlign: 'right' }}>Ratio</th>
              </tr>
            </thead>
            <tbody>
              {suite.tests.map((test) => (
                <tr
                  key={test.name}
                  style={{
                    borderTop: `1px solid ${borderColor}`,
                    color: textColor,
                  }}
                >
                  <td style={{ padding: '8px 16px' }}>{test.name}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: mutedColor }}>
                    {fmtRows(test.rows)}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    {fmtMs(test.gnata.median)}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    {test.native ? fmtMs(test.native.median) : '—'}
                  </td>
                  <td
                    style={{
                      padding: '8px 12px',
                      textAlign: 'right',
                      fontWeight: 600,
                      color: ratioColor(test.ratio, theme),
                    }}
                  >
                    {ratioLabel(test.ratio)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function BenchmarkTable() {
  const theme = useTheme();
  const [data, setData] = useState<BenchmarkResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${base}/benchmark-results.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch(() => setError('not-found'));
  }, []);

  const isDark = theme === 'dark';
  const mutedColor = isDark ? '#565f89' : '#848cb5';

  if (error) {
    return (
      <p style={{ color: mutedColor, fontStyle: 'italic' }}>
        Benchmark results not yet generated. Run <code>make bench</code> to generate.
      </p>
    );
  }

  if (!data) {
    return <p style={{ color: mutedColor }}>Loading benchmark results...</p>;
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: mutedColor, marginBottom: 16 }}>
        {data.metadata.platform} &middot; SQLite {data.metadata.sqliteVersion} &middot;{' '}
        {data.metadata.iterations} iterations &middot;{' '}
        {new Date(data.metadata.timestamp).toLocaleDateString()}
      </p>

      {data.suites.map((suite, i) => (
        <SuiteSection
          key={suite.name}
          suite={suite}
          theme={theme}
          defaultOpen={i === 0}
        />
      ))}

      <p style={{ fontSize: 12, color: mutedColor, marginTop: 8 }}>
        Ratio = gnata time / SQL time. Values below 1.0 mean gnata is faster.
      </p>
    </div>
  );
}
