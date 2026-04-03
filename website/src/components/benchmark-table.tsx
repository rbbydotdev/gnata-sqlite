'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { createHighlighter, type Highlighter } from 'shiki';
import { Sparkline } from './sparkline';
import { tokyoNightDark } from '@/lib/tokyo-night-dark';
import { tokyoNightLight } from '@/lib/tokyo-night-light';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

// ── Theme ───────────────────────────────────────────────────────

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

// ── Shiki highlighter (singleton) ───────────────────────────────

let _highlighter: Highlighter | null = null;
let _highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (_highlighter) return Promise.resolve(_highlighter);
  if (_highlighterPromise) return _highlighterPromise;
  _highlighterPromise = createHighlighter({
    themes: [tokyoNightDark, tokyoNightLight],
    langs: ['sql'],
  }).then((h) => {
    _highlighter = h;
    return h;
  });
  return _highlighterPromise;
}

function useHighlighter() {
  const [hl, setHl] = useState<Highlighter | null>(_highlighter);
  useEffect(() => {
    if (!hl) getHighlighter().then(setHl);
  }, [hl]);
  return hl;
}

// ── Types ───────────────────────────────────────────────────────

interface TimingStats {
  median: number;
  mean: number;
  min: number;
  max: number;
  runs: number[];
}

interface VariantResult {
  label: string;
  timing: TimingStats;
  ratio: number | null;
  sql: string;
}

interface TestResult {
  name: string;
  rows: number;
  gnataSQL: string;
  nativeSQL: string | null;
  gnata: TimingStats;
  native: TimingStats | null;
  ratio: number | null;
  variants?: VariantResult[];
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

function ratioColor(ratio: number | null, isDark: boolean): string {
  if (ratio === null || !isFinite(ratio)) return isDark ? '#565f89' : '#848cb5';
  if (ratio < 1.5) return isDark ? '#9ece6a' : '#587539';
  if (ratio < 3) return isDark ? '#e0af68' : '#8a5d00';
  return isDark ? '#f7768e' : '#c53b53';
}

function ratioLabel(ratio: number | null): string {
  if (ratio === null || !isFinite(ratio)) return '—';
  return `${ratio.toFixed(2)}x`;
}

// ── Highlighted SQL Pane ────────────────────────────────────────

function SqlPane({
  title,
  sql,
  timing,
  hl,
  isDark,
}: {
  title: string;
  sql: string;
  timing: string;
  hl: Highlighter | null;
  isDark: boolean;
}) {
  // Use dual-theme mode so shiki sets --shiki-dark / --shiki-light CSS vars.
  // Fumadocs CSS then picks the right one based on html.dark class.
  const html = hl
    ? hl.codeToHtml(sql.trim(), {
        lang: 'sql',
        themes: { dark: 'tokyo-night-custom', light: 'tokyo-night-light' },
        defaultColor: false,
      })
    : null;

  const borderColor = isDark ? '#292e42' : '#c4c8da';
  const surfaceBg = isDark ? '#1f2335' : '#f5f5f7';
  const codeBg = isDark ? '#1a1b26' : '#e1e2e7';
  const mutedColor = isDark ? '#565f89' : '#848cb5';
  const accentColor = isDark ? '#7aa2f7' : '#2e7de9';
  const textColor = isDark ? '#a9b1d6' : '#3b4261';

  return (
    <div className="min-w-0 flex-1">
      <div
        className="flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide"
        style={{ background: surfaceBg, border: `1px solid ${borderColor}`, borderBottom: 'none', borderRadius: '6px 6px 0 0' }}
      >
        <span style={{ color: mutedColor }}>{title}</span>
        <span className="font-mono text-xs font-semibold" style={{ color: accentColor }}>{timing}</span>
      </div>
      <div
        style={{ border: `1px solid ${borderColor}`, borderRadius: '0 0 6px 6px', overflow: 'auto' }}
      >
        {html ? (
          <div
            className="bench-shiki"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre
            className="m-0 p-3 font-mono text-xs leading-relaxed"
            style={{ background: codeBg, color: textColor }}
          >
            <code>{sql.trim()}</code>
          </pre>
        )}
      </div>
    </div>
  );
}

// ── Test Detail (accordion body) ────────────────────────────────

function TestDetail({
  test,
  hl,
  isDark,
}: {
  test: TestResult;
  hl: Highlighter | null;
  isDark: boolean;
}) {
  const bgColor = isDark ? '#16161e' : '#e1e2e7';
  const borderColor = isDark ? '#292e42' : '#c4c8da';
  const mutedColor = isDark ? '#565f89' : '#848cb5';

  return (
    <div
      className="flex flex-wrap gap-3 p-3"
      style={{ background: bgColor, borderTop: `1px solid ${borderColor}` }}
    >
      <div className="flex min-w-[280px] flex-1 flex-col gap-3">
        <SqlPane
          title="gnata-sqlite"
          sql={test.gnataSQL}
          timing={fmtMs(test.gnata.median)}
          hl={hl}
          isDark={isDark}
        />
      </div>
      <div className="flex min-w-[280px] flex-1 flex-col gap-3">
        {test.nativeSQL ? (
          <SqlPane
            title="SQLite"
            sql={test.nativeSQL}
            timing={test.native ? fmtMs(test.native.median) : '—'}
            hl={hl}
            isDark={isDark}
          />
        ) : (
          <div
            className="flex flex-1 items-center justify-center rounded-md p-6 text-sm italic"
            style={{ color: mutedColor, border: `1px dashed ${borderColor}` }}
          >
            No native SQL equivalent
          </div>
        )}
        {test.variants?.map((v) => (
          <SqlPane
            key={v.label}
            title={v.label}
            sql={v.sql}
            timing={fmtMs(v.timing.median)}
            hl={hl}
            isDark={isDark}
          />
        ))}
      </div>
    </div>
  );
}

// ── Suite Section ───────────────────────────────────────────────

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
  const hl = useHighlighter();
  const isDark = theme === 'dark';
  const borderColor = isDark ? '#292e42' : '#c4c8da';
  const headerBg = isDark ? '#1a1b26' : '#e8e9ed';
  const surfaceBg = isDark ? '#1f2335' : '#f5f5f7';
  const mutedColor = isDark ? '#565f89' : '#848cb5';
  const textColor = isDark ? '#a9b1d6' : '#3b4261';
  const headColor = isDark ? '#c0caf5' : '#1a1b26';
  const hoverBg = isDark ? 'rgba(122,162,247,0.06)' : 'rgba(46,125,233,0.06)';

  const paired = suite.tests.filter((t) => t.ratio !== null && isFinite(t.ratio!));
  const avgRatio =
    paired.length > 0
      ? Math.exp(paired.reduce((sum, t) => sum + Math.log(t.ratio!), 0) / paired.length)
      : null;

  return (
    <div
      className="mb-4 overflow-hidden rounded-lg"
      style={{ border: `1px solid ${borderColor}` }}
    >
      {/* Suite header */}
      <button
        onClick={() => setOpen(!open)}
        type="button"
        className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left text-[15px] font-semibold"
        style={{ background: headerBg, color: headColor, border: 'none', fontFamily: 'inherit' }}
      >
        <span>
          <span className="mr-2">{open ? '▾' : '▸'}</span>
          {suite.category}
        </span>
        {avgRatio !== null && (
          <span
            className="flex items-center gap-2 font-mono text-[13px] font-medium"
            style={{ color: ratioColor(avgRatio, isDark) }}
          >
            <Sparkline
              values={paired.map((t) => t.ratio!)}
              width={paired.length * 3 + (paired.length - 1)}
              height={12}
              color={(v) => ratioColor(v, isDark)}
            />
            {avgRatio.toFixed(2)}x
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Column headers */}
          <div
            className="grid font-mono text-[11px] font-medium uppercase tracking-wide"
            style={{
              gridTemplateColumns: '1fr 50px 70px 70px 60px',
              padding: '8px 16px',
              background: surfaceBg,
              color: mutedColor,
            }}
          >
            <span>Test</span>
            <span className="text-right">Rows</span>
            <span className="text-right">gnata</span>
            <span className="text-right">SQL</span>
            <span className="text-right">Ratio</span>
          </div>

          <Accordion type="single" collapsible>
            {suite.tests.map((test) => (
              <AccordionItem
                key={test.name}
                value={test.name}
                className="border-0"
                style={{ borderTop: `1px solid ${borderColor}` }}
              >
                <AccordionTrigger
                  className="grid w-full cursor-pointer px-4 py-2 font-mono text-[13px] hover:no-underline"
                  style={{
                    gridTemplateColumns: '1fr 50px 70px 70px 60px',
                    color: textColor,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = hoverBg;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '';
                  }}
                >
                  <span className="text-left">{test.name}</span>
                  <span className="text-right" style={{ color: mutedColor }}>
                    {fmtRows(test.rows)}
                  </span>
                  <span className="text-right">{fmtMs(test.gnata.median)}</span>
                  <span className="text-right">
                    {test.native ? fmtMs(test.native.median) : '—'}
                  </span>
                  <span
                    className="text-right font-semibold"
                    style={{ color: ratioColor(test.ratio, isDark) }}
                  >
                    {ratioLabel(test.ratio)}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-0">
                  {/* Variant sub-rows */}
                  {test.variants?.map((v) => (
                    <div
                      key={v.label}
                      className="grid font-mono text-xs italic"
                      style={{
                        gridTemplateColumns: '1fr 50px 70px 70px 60px',
                        padding: '6px 16px 6px 32px',
                        borderTop: `1px solid ${borderColor}`,
                        color: mutedColor,
                      }}
                    >
                      <span>↳ vs {v.label}</span>
                      <span />
                      <span />
                      <span className="text-right">{fmtMs(v.timing.median)}</span>
                      <span
                        className="text-right font-semibold not-italic"
                        style={{ color: ratioColor(v.ratio, isDark) }}
                      >
                        {ratioLabel(v.ratio)}
                      </span>
                    </div>
                  ))}
                  <TestDetail test={test} hl={hl} isDark={isDark} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </>
      )}
    </div>
  );
}

// ── Root Component ──────────────────────────────────────────────

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
    <div className="not-prose">
      <p className="mb-4 text-[13px]" style={{ color: mutedColor }}>
        {data.metadata.platform} &middot; SQLite {data.metadata.sqliteVersion} &middot;{' '}
        {data.metadata.iterations} iteration{data.metadata.iterations !== 1 ? 's' : ''} &middot;{' '}
        {new Date(data.metadata.timestamp).toLocaleDateString()}
      </p>

      {data.suites.map((suite, i) => (
        <SuiteSection key={suite.name} suite={suite} theme={theme} defaultOpen={i === 0} />
      ))}

      <p className="mt-2 text-xs" style={{ color: mutedColor }}>
        Ratio = gnata time / SQL time. Values below 1.0 mean gnata is faster. Click a row to view
        queries.
      </p>

      <style>{`
        .bench-shiki pre {
          margin: 0 !important;
          padding: 12px !important;
          font-size: 12px !important;
          line-height: 1.6 !important;
          font-family: var(--font-mono, ui-monospace, monospace) !important;
        }
        .bench-shiki code,
        .bench-shiki span {
          font-family: var(--font-mono, ui-monospace, monospace) !important;
        }
        /* Dual-theme mode: shiki sets --shiki-dark / --shiki-light CSS vars
           on each span. Fumadocs CSS picks the right one via html.dark selectors. */
      `}</style>
    </div>
  );
}
