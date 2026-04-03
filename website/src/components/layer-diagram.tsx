'use client';

import { useSyncExternalStore } from 'react';
import {
  LayoutDashboard,
  Component,
  Code2,
  Database,
  Zap,
  Cpu,
  ArrowDown,
  ArrowUp,
} from 'lucide-react';

function subscribeToTheme(cb: () => void) {
  const observer = new MutationObserver(cb);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}
function getThemeSnapshot(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}
function useTheme() {
  return useSyncExternalStore(subscribeToTheme, getThemeSnapshot, () => 'dark');
}

const dark = {
  bg: '#1a1b26',
  surface: 'rgba(255,255,255,0.02)',
  border: '#292e42',
  text: '#c0caf5',
  muted: '#565f89',
  green: '#9ece6a',
  purple: '#bb9af7',
  orange: '#ff9e64',
  blue: '#7aa2f7',
  teal: '#73daca',
  arrow: '#3b4261',
};

const light = {
  bg: '#e8e9ed',
  surface: 'rgba(0,0,0,0.03)',
  border: '#c4c8da',
  text: '#343b58',
  muted: '#848cb5',
  green: '#587539',
  purple: '#7847bd',
  orange: '#b15c00',
  blue: '#2e7de9',
  teal: '#118c74',
  arrow: '#b6bfe2',
};

type Palette = typeof dark;

function Layer({
  color,
  icon: Icon,
  title,
  subtitle,
  c,
  span = false,
}: {
  color: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  subtitle: string;
  c: Palette;
  span?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderLeft: `3px solid ${color}`,
        background: c.surface,
        borderRadius: 4,
        gridColumn: span ? '1 / -1' : undefined,
      }}
    >
      <div style={{ flexShrink: 0 }}>
        <Icon size={18} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{title}</div>
        <div style={{ fontSize: 11, color: c.muted, marginTop: 1 }}>{subtitle}</div>
      </div>
    </div>
  );
}

function Arrow({ c, label }: { c: Palette; label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '2px 0' }}>
      <ArrowDown size={14} style={{ color: c.arrow }} />
      {label && <span style={{ fontSize: 10, color: c.muted }}>{label}</span>}
      <ArrowDown size={14} style={{ color: c.arrow }} />
    </div>
  );
}

export function LayerDiagram() {
  const theme = useTheme();
  const c = theme === 'dark' ? dark : light;

  return (
    <div
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 8,
        padding: 16,
        marginTop: 16,
        marginBottom: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        fontFamily: "'Onest', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {/* Playground */}
      <Layer c={c} color={c.green} icon={LayoutDashboard} title="@gnata-sqlite/playground" subtitle="Vite + React — SQLite mode and gnata expression evaluator" span />

      <Arrow c={c} label="uses" />

      {/* React + sql.js row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
        <Layer c={c} color={c.purple} icon={Component} title="@gnata-sqlite/react" subtitle="Composable hooks and components" />
        <Layer c={c} color={c.orange} icon={Database} title="sql.js + gnata extension" subtitle="WASM SQLite with loadable extension" />
      </div>

      <Arrow c={c} label="wraps" />

      {/* CodeMirror + SQLite extension */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
        <Layer c={c} color={c.blue} icon={Code2} title="@gnata-sqlite/codemirror" subtitle="Syntax highlighting + async WASM LSP" />
        <Layer c={c} color={c.teal} icon={Database} title="sqlite/ extension" subtitle="CGo, c-shared, query planner" />
      </div>

      <Arrow c={c} label="compiles to" />

      {/* WASM row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
        <Layer c={c} color={c.blue} icon={Zap} title="gnata-lsp.wasm" subtitle="TinyGo — 380 KB (145 KB gzipped)" />
        <Layer c={c} color={c.teal} icon={Zap} title="gnata.wasm" subtitle="Standard Go WASM — eval engine" />
      </div>

      <Arrow c={c} label="powered by" />

      {/* Core engine */}
      <Layer c={c} color={c.green} icon={Cpu} title="gnata core engine" subtitle="Pure Go JSONata 2.x — GJSON fast path + full AST evaluator" span />

      {/* Schema flow */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 8 }}>
        <ArrowUp size={14} style={{ color: c.arrow }} />
        <span style={{ fontSize: 11, color: c.muted }}>schema JSON flows from backend into editor autocomplete</span>
        <ArrowUp size={14} style={{ color: c.arrow }} />
      </div>
    </div>
  );
}
