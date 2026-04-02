/**
 * Shiki test harness — run after every change to verify SQL highlighting.
 *
 *   pnpm tsx test-shiki.ts
 *   open test-shiki-output.html
 *
 * Generates an HTML page showing highlighted SQL in both themes
 * so you can visually verify colors without starting the dev server.
 */

import { createHighlighter } from 'shiki';
import { tokyoNightDark } from './src/lib/tokyo-night-dark';
import { tokyoNightLight } from './src/lib/tokyo-night-light';
import { writeFileSync } from 'node:fs';

const SQL_SAMPLES = [
  {
    label: 'gnata-sqlite (scalar)',
    sql: `-- Dot-path navigation: extract top-level field
-- Expression is compiled once, cached, then evaluated per row
SELECT count(*) as n
FROM events
WHERE jsonata('action', data) = 'login';`,
  },
  {
    label: 'SQLite native',
    sql: `-- SQLite built-in: json_extract with dollar-path syntax
-- Each call parses the JSON and walks to the key
SELECT count(*) as n
FROM events
WHERE json_extract(data, '$.action') = 'login';`,
  },
  {
    label: 'jsonata_query (report)',
    sql: `-- Single expression: 5 metrics computed in one table scan
-- Streaming accumulators for $count, $sum, $average
SELECT jsonata_query('{
  "total": $count($),
  "revenue": $sum($filter($, function($v){$v.status = "completed"}).amount),
  "avg": $round($average(amount), 2),
  "customers": $count($distinct(customer))
}', data) as report
FROM orders;`,
  },
  {
    label: 'SQL (single-scan CASE)',
    sql: `-- Hand-optimized: CASE expressions in a single scan
SELECT json_object(
  'total',     COUNT(*),
  'revenue',   SUM(CASE WHEN json_extract(data, '$.status') = 'completed'
                   THEN json_extract(data, '$.amount') END),
  'customers', COUNT(DISTINCT json_extract(data, '$.customer'))
) as report
FROM orders;`,
  },
];

async function main() {
  console.log('Creating highlighter...');
  const hl = await createHighlighter({
    themes: [tokyoNightDark, tokyoNightLight],
    langs: ['sql'],
  });

  const sections: string[] = [];

  for (const sample of SQL_SAMPLES) {
    // Dual-theme mode (same as the component uses)
    const dualHtml = hl.codeToHtml(sample.sql, {
      lang: 'sql',
      themes: { dark: 'tokyo-night-custom', light: 'tokyo-night-light' },
      defaultColor: false,
    });
    // Single-theme for comparison
    const darkHtml = hl.codeToHtml(sample.sql, {
      lang: 'sql',
      theme: 'tokyo-night-custom',
    });
    const lightHtml = hl.codeToHtml(sample.sql, {
      lang: 'sql',
      theme: 'tokyo-night-light',
    });

    sections.push(`
      <div style="margin-bottom: 32px;">
        <h3 style="margin: 0 0 8px; font-size: 14px; color: #888;">${sample.label}</h3>

        <div style="font-size: 11px; color: #999; margin-bottom: 4px;">DUAL-THEME (what the component uses) — uses --shiki-dark / --shiki-light CSS vars</div>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px;">
          <div class="dark-ctx" style="flex: 1; min-width: 300px; border-radius: 6px; overflow: hidden; border: 1px solid #292e42;">
            ${dualHtml}
          </div>
          <div class="light-ctx" style="flex: 1; min-width: 300px; border-radius: 6px; overflow: hidden; border: 1px solid #c4c8da;">
            ${dualHtml}
          </div>
        </div>

        <div style="font-size: 11px; color: #999; margin-bottom: 4px;">SINGLE-THEME (reference — inline colors)</div>
        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 300px; border-radius: 6px; overflow: hidden; border: 1px solid #292e42;">
            ${darkHtml}
          </div>
          <div style="flex: 1; min-width: 300px; border-radius: 6px; overflow: hidden; border: 1px solid #c4c8da;">
            ${lightHtml}
          </div>
        </div>
      </div>
    `);
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Shiki SQL Highlighting Test</title>
  <style>
    body {
      font-family: -apple-system, system-ui, sans-serif;
      max-width: 1200px;
      margin: 40px auto;
      padding: 0 20px;
      background: #111;
      color: #ccc;
    }
    h2 { color: #7aa2f7; margin-bottom: 24px; }
    pre { margin: 0 !important; padding: 12px !important; font-size: 13px !important; line-height: 1.6 !important; }
    code { font-family: 'SF Mono', 'Fira Code', monospace !important; }

    /* Simulate fumadocs dual-theme CSS var switching */
    .dark-ctx .shiki,
    .dark-ctx .shiki span {
      color: var(--shiki-dark) !important;
      background-color: var(--shiki-dark-bg) !important;
      font-style: var(--shiki-dark-font-style) !important;
      font-weight: var(--shiki-dark-font-weight) !important;
    }
    .light-ctx .shiki,
    .light-ctx .shiki span {
      color: var(--shiki-light) !important;
      background-color: var(--shiki-light-bg) !important;
      font-style: var(--shiki-light-font-style) !important;
      font-weight: var(--shiki-light-font-weight) !important;
    }

    /* Token verification checklist */
    .checklist { font-size: 13px; color: #a9b1d6; margin-bottom: 24px; }
    .checklist li { margin: 4px 0; }
  </style>
</head>
<body>
  <h2>Shiki SQL Highlighting — Test Output</h2>
  <ul class="checklist">
    <li>Keywords (SELECT, FROM, WHERE, etc.) should be <strong style="color:#bb9af7">purple/bold</strong></li>
    <li>Comments (-- ...) should be <strong style="color:#565f89">muted gray</strong></li>
    <li>Strings ('action', '$.amount') should be <strong style="color:#9ece6a">green</strong></li>
    <li>Functions (count, json_extract, SUM, etc.) should be <strong style="color:#7aa2f7">blue</strong></li>
    <li>Numbers should be <strong style="color:#ff9e64">orange</strong></li>
    <li>Operators (=, >, AND, etc.) should be <strong style="color:#89ddff">cyan</strong></li>
  </ul>
  ${sections.join('\n')}
  <p style="color: #565f89; margin-top: 32px; font-size: 12px;">
    Generated: ${new Date().toISOString()}
  </p>
</body>
</html>`;

  const outPath = 'test-shiki-output.html';
  writeFileSync(outPath, html);
  console.log(`Written to ${outPath}`);
  console.log('Open in browser to verify colors.');
}

main();
