import Link from 'next/link';
import {
  Database,
  Component,
  FileCode2,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { codeToHtml } from 'shiki';
import { ScreenshotGallery } from '@/components/screenshot-gallery';

function GitHubIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
    </svg>
  );
}

const stats = [
  { label: 'JSONata 2.x conformance', value: '1,778 tests', color: '#c0caf5' },
  { label: 'WASM LSP (gzipped)', value: '85KB', color: '#9ece6a' },
  { label: 'Composable React package', value: '@gnata-sqlite/react', color: '#7aa2f7' },
];

const featureColors: Record<string, string> = {
  'SQLite Extension': '#73daca',       // teal
  'React Editor Widget': '#bb9af7',    // vista/purple
  '85KB WASM LSP': '#ff9e64',          // orange
  'Context-Aware Autocomplete': '#9ece6a', // green sparkle
};

const features = [
  {
    icon: Database,
    title: 'SQLite Extension',
    description:
      'Run JSONata expressions inside SQL queries with a streaming query planner. Five purpose-built functions handle evaluation, filtering, and transformation directly in the database.',
  },
  {
    icon: Component,
    title: 'React Editor Widget',
    description:
      'Composable hooks and components for embedding a JSONata editor in any app. Built on CodeMirror 6 with full TypeScript support and zero-config defaults.',
  },
  {
    icon: FileCode2,
    title: '85KB WASM LSP',
    description:
      'TinyGo-compiled language server provides diagnostics, autocomplete, and hover docs. Ships as a single .wasm file that runs in any browser or Node.js environment.',
  },
  {
    icon: Sparkles,
    title: 'Context-Aware Autocomplete',
    description:
      'The editor evaluates expressions against live data to suggest nested keys. Completions update as the input document changes -- no schema definitions needed.',
  },
];

const sqlCode = `SELECT status, count(*) as orders,
  jsonata_query('{
    "revenue": $round($sum(total), 2),
    "avg":     $round($average(total), 2),
    "top":     $max(total)
  }', data) as stats
FROM orders
GROUP BY status
ORDER BY orders DESC;`;

const reactCode = `import { JsonataPlayground } from '@gnata-sqlite/react'

function App() {
  return (
    <JsonataPlayground
      expression="$sum(items.price)"
      input={jsonData}
      theme="dark"
    />
  )
}`;

import { tokyoNightLight } from '@/lib/tokyo-night-light';

const sqlHtml = await codeToHtml(sqlCode, {
  lang: 'sql',
  themes: { dark: 'tokyo-night', light: tokyoNightLight },
  defaultColor: false,
});

const reactHtml = await codeToHtml(reactCode, {
  lang: 'tsx',
  themes: { dark: 'tokyo-night', light: tokyoNightLight },
  defaultColor: false,
});

export default async function HomePage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center px-6 pt-24 pb-16 text-center">
        {/* Gradient glow behind hero title */}
        <div
          className="pointer-events-none absolute top-8 left-1/2 -translate-x-1/2"
          style={{
            width: '600px',
            height: '300px',
            background:
              'radial-gradient(ellipse at center, rgba(122,162,247,0.15) 0%, rgba(187,154,247,0.08) 40%, transparent 70%)',
            filter: 'blur(40px)',
          }}
          aria-hidden="true"
        />

        <h1
          className="relative text-5xl font-bold tracking-tight sm:text-6xl"
          style={{ color: '#c0caf5' }}
        >
          <span style={{ color: '#9ece6a' }}>gnata-sqlite</span>
        </h1>

        <p
          className="relative mt-6 max-w-2xl text-lg leading-relaxed landing-text"
        >
          End-to-end JSONata&nbsp;2.x in Go&nbsp;&mdash; from SQLite extension
          to composable React editor
        </p>

        <div className="relative mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/docs"
            className="shimmer-btn inline-flex items-center gap-2 px-8 py-3 text-sm font-semibold landing-btn-text"
          >
            Learn More
          </Link>
        </div>

        {/* Stats row */}
        <div
          className="relative mt-14 flex flex-wrap items-center justify-center gap-8 rounded-lg border px-8 py-4 landing-surface"
        >
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-1">
              <span
                className="text-sm font-bold"
                style={{ color: stat.color }}
              >
                {stat.value}
              </span>
              <span className="text-xs landing-text-muted">
                {stat.label}
              </span>
            </div>
          ))}
        </div>

        <a
          href="https://github.com/rbbydotdev/gnata-sqlite"
          target="_blank"
          rel="noopener noreferrer"
          className="relative mt-6 inline-flex items-center gap-2 text-sm transition-colors hover:opacity-80 landing-text-muted"
        >
          <GitHubIcon className="size-4" />
          github.com/rbbydotdev/gnata-sqlite
        </a>
      </section>

      {/* Code examples */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="mb-8 text-center text-2xl font-bold landing-text-strong">
          From database to browser
        </h2>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* SQL example */}
          <div className="overflow-hidden rounded-md border landing-code-bg">
            <div
              className="flex items-center gap-2 border-b px-4 py-2 text-xs font-semibold landing-code-header"
              style={{ borderLeft: '3px solid #7aa2f7' }}
            >
              <Database className="size-3.5" style={{ color: '#7aa2f7' }} />
              SQLite Extension
            </div>
            <div
              className="overflow-x-auto text-[13px] leading-relaxed [&_pre]:!m-0 [&_pre]:!rounded-none [&_pre]:!p-4"
              style={{
                fontFamily:
                  'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace',
              }}
              dangerouslySetInnerHTML={{ __html: sqlHtml }}
            />
          </div>

          {/* React example */}
          <div className="overflow-hidden rounded-md border landing-code-bg">
            <div
              className="flex items-center gap-2 border-b px-4 py-2 text-xs font-semibold landing-code-header"
              style={{ borderLeft: '3px solid #bb9af7' }}
            >
              <Component className="size-3.5" style={{ color: '#bb9af7' }} />
              React Editor
            </div>
            <div
              className="overflow-x-auto text-[13px] leading-relaxed [&_pre]:!m-0 [&_pre]:!rounded-none [&_pre]:!p-4"
              style={{
                fontFamily:
                  'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace',
              }}
              dangerouslySetInnerHTML={{ __html: reactHtml }}
            />
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-6 sm:grid-cols-2">
          {features.map((feature) => {
            const Icon = feature.icon;
            const iconColor = featureColors[feature.title] ?? '#7aa2f7';
            return (
              <div
                key={feature.title}
                className="rounded-md border p-6 landing-card"
              >
                <div className="mb-4 flex items-center gap-3">
                  <Icon
                    className="size-5"
                    style={{ color: iconColor }}
                  />
                  <h3 className="text-base font-semibold landing-text-strong">
                    {feature.title}
                  </h3>
                </div>
                <p className="text-sm leading-relaxed landing-text">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Screenshots gallery */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <a
          href="https://rbby.dev/gnata-sqlite/playground"
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 flex items-center justify-center gap-2 text-2xl font-bold landing-text-strong transition-opacity hover:opacity-80"
        >
          Playground
          <ExternalLink className="size-5" />
        </a>
        <p className="mb-8 text-center text-sm landing-text-muted">
          The interactive playground running the SQLite extension, WASM LSP, and CodeMirror editor together
        </p>
        <ScreenshotGallery />
      </section>

      {/* Footer */}
      <footer
        className="mt-auto border-t px-6 py-10 landing-card"
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-6 text-sm">
          <a
            href="https://github.com/rbbydotdev/gnata-sqlite"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 transition-colors hover:opacity-80 landing-text-muted"
          >
            <GitHubIcon className="size-4" />
            GitHub
          </a>
          <a
            href="https://docs.jsonata.org"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 transition-colors hover:opacity-80 landing-text-muted"
          >
            <ExternalLink className="size-4" />
            JSONata Docs
          </a>
          <Link
            href="/docs"
            className="transition-colors hover:opacity-80 landing-text-muted"
          >
            Documentation
          </Link>
        </div>
      </footer>
    </main>
  );
}
