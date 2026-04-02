export interface SQLVariant {
  label: string;
  sql: string;
}

export interface BenchmarkPair {
  name: string;
  rows: number;
  gnataSQL: string;
  nativeSQL: string | null;
  /** Additional SQL variants (e.g. optimized single-scan version) */
  nativeVariants?: SQLVariant[];
}

export interface BenchmarkSuite {
  name: string;
  category: string;
  setupSQL: string;
  tests: BenchmarkPair[];
}

// ── Setup SQL blocks ─────────────────────────────────────────────
// All use 100k rows for consistent comparison.

const SETUP_EVENTS = `
CREATE TABLE events(id INTEGER PRIMARY KEY, data TEXT);
WITH RECURSIVE cnt(x) AS (
  VALUES(1) UNION ALL SELECT x+1 FROM cnt WHERE x < 100000
)
INSERT INTO events(id, data)
SELECT x, json_object(
  'user_id', x % 1000,
  'action', CASE x % 5
    WHEN 0 THEN 'login' WHEN 1 THEN 'purchase'
    WHEN 2 THEN 'logout' WHEN 3 THEN 'view' WHEN 4 THEN 'click' END,
  'amount', ROUND((x % 500) * 1.37, 2),
  'metadata', json_object(
    'ip', '10.0.' || (x % 256) || '.' || ((x * 7) % 256),
    'region', CASE x % 4
      WHEN 0 THEN 'us-east' WHEN 1 THEN 'us-west'
      WHEN 2 THEN 'eu-west' WHEN 3 THEN 'ap-south' END,
    'tags', json_array('tag' || (x % 10), 'tag' || ((x+1) % 10))
  ),
  'timestamp', 1700000000 + x
) FROM cnt;`;

const SETUP_AGG = `
CREATE TABLE events(id INTEGER PRIMARY KEY, data TEXT);
WITH RECURSIVE cnt(x) AS (
  VALUES(1) UNION ALL SELECT x+1 FROM cnt WHERE x < 100000
)
INSERT INTO events(id, data)
SELECT x, json_object(
  'user_id', x % 1000,
  'action', CASE x % 5 WHEN 0 THEN 'login' WHEN 1 THEN 'purchase'
    WHEN 2 THEN 'logout' WHEN 3 THEN 'view' WHEN 4 THEN 'click' END,
  'amount', ROUND((x % 500) * 1.37, 2),
  'region', CASE x % 4 WHEN 0 THEN 'us-east' WHEN 1 THEN 'us-west'
    WHEN 2 THEN 'eu-west' WHEN 3 THEN 'ap-south' END
) FROM cnt;`;

const SETUP_COMPLEX = `
CREATE TABLE events(id INTEGER PRIMARY KEY, data TEXT);
WITH RECURSIVE cnt(x) AS (
  VALUES(1) UNION ALL SELECT x+1 FROM cnt WHERE x < 100000
)
INSERT INTO events(id, data)
SELECT x, json_object(
  'user', 'user' || (x % 1000),
  'action', CASE x % 5
    WHEN 0 THEN 'login' WHEN 1 THEN 'purchase'
    WHEN 2 THEN 'logout' WHEN 3 THEN 'view' WHEN 4 THEN 'refund' END,
  'amount', CASE x % 5
    WHEN 4 THEN -ROUND((x % 200) * 0.5, 2)
    WHEN 0 THEN 0 WHEN 2 THEN 0 WHEN 3 THEN 0
    ELSE ROUND((x % 500) * 1.37, 2) END,
  'region', CASE x % 4
    WHEN 0 THEN 'us-east' WHEN 1 THEN 'us-west'
    WHEN 2 THEN 'eu-west' WHEN 3 THEN 'ap-south' END,
  'ts', 1700000000 + x,
  'tags', json_array('tag' || (x % 8), 'tag' || ((x * 3) % 8))
) FROM cnt;`;

const SETUP_EACH = `
CREATE TABLE events(id INTEGER PRIMARY KEY, data TEXT);
WITH RECURSIVE cnt(x) AS (
  VALUES(1) UNION ALL SELECT x+1 FROM cnt WHERE x < 100000
)
INSERT INTO events(id, data)
SELECT x, json_object(
  'user', 'user' || (x % 100),
  'action', CASE x % 5
    WHEN 0 THEN 'login' WHEN 1 THEN 'purchase'
    WHEN 2 THEN 'logout' WHEN 3 THEN 'view' WHEN 4 THEN 'refund' END,
  'amount', ROUND((x % 500) * 1.37, 2),
  'tags', json_array('tag' || (x % 8), 'tag' || ((x * 3) % 8)),
  'items', json_array(
    json_object('sku', 'SKU' || (x % 20), 'qty', (x % 5) + 1, 'price', ROUND((x % 100) * 2.5, 2)),
    json_object('sku', 'SKU' || ((x + 7) % 20), 'qty', (x % 3) + 1, 'price', ROUND((x % 80) * 3.1, 2))
  )
) FROM cnt;`;

const SETUP_ORDERS = `
CREATE TABLE orders(data TEXT);
WITH RECURSIVE cnt(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM cnt WHERE x < 100000)
INSERT INTO orders SELECT json_object(
  'customer','user'||(x%100),
  'amount',ROUND((x%500)*1.37,2),
  'status', CASE x%5 WHEN 4 THEN 'refunded' ELSE 'completed' END
) FROM cnt;`;

const SETUP_FUNCTIONS = `
CREATE TABLE events(id INTEGER PRIMARY KEY, data TEXT);
WITH RECURSIVE cnt(x) AS (
  VALUES(1) UNION ALL SELECT x+1 FROM cnt WHERE x < 100000
)
INSERT INTO events(id, data)
SELECT x, json_object(
  'user', 'user' || (x % 100),
  'email', 'user' || (x % 100) || '@example.com',
  'action', CASE x % 5
    WHEN 0 THEN 'login' WHEN 1 THEN 'purchase'
    WHEN 2 THEN 'logout' WHEN 3 THEN 'view' WHEN 4 THEN 'refund' END,
  'amount', CASE WHEN x % 7 = 0 THEN 'invalid' ELSE CAST(ROUND((x % 500) * 1.37, 2) AS TEXT) END,
  'region', CASE x % 4
    WHEN 0 THEN 'us-east' WHEN 1 THEN 'us-west'
    WHEN 2 THEN 'eu-west' WHEN 3 THEN 'ap-south' END,
  'payload', 'data-' || x,
  'html_content', '<b>Item ' || x || '</b> &amp; "quoted"',
  'internal_id', 'secret-' || x
) FROM cnt;`;

// ── Suite definitions ────────────────────────────────────────────

export const suites: BenchmarkSuite[] = [
  // ── scalar: jsonata() vs json_extract() ──────────────────────
  {
    name: 'scalar',
    category: 'jsonata() vs json_extract()',
    setupSQL: SETUP_EVENTS,
    tests: [
      {
        name: 'Simple field extraction',
        rows: 100_000,
        gnataSQL: `-- Dot-path navigation: extract top-level field
-- Expression is compiled once, cached, then evaluated per row
SELECT count(*) as n
FROM events
WHERE jsonata('action', data) = 'login';`,
        nativeSQL: `-- SQLite built-in: json_extract with dollar-path syntax
-- Each call parses the JSON and walks to the key
SELECT count(*) as n
FROM events
WHERE json_extract(data, '$.action') = 'login';`,
      },
      {
        name: 'Nested field extraction',
        rows: 100_000,
        gnataSQL: `-- Nested dot-path: reaches into metadata.region
-- Uses GJSON fast-path for zero-copy extraction
SELECT count(*) as n
FROM events
WHERE jsonata('metadata.region', data) = 'us-east';`,
        nativeSQL: `-- Nested dollar-path: $.metadata.region
-- Two levels of JSON parsing per row
SELECT count(*) as n
FROM events
WHERE json_extract(data, '$.metadata.region') = 'us-east';`,
      },
      {
        name: 'Numeric aggregation',
        rows: 100_000,
        gnataSQL: `-- Extract numeric field, let SQL handle the SUM
-- gnata returns a number type, no casting needed
SELECT sum(jsonata('amount', data)) as total
FROM events;`,
        nativeSQL: `-- json_extract returns TEXT for numbers in some cases
-- SQLite coerces to numeric for sum()
SELECT sum(json_extract(data, '$.amount')) as total
FROM events;`,
      },
      {
        name: 'Multi-field access per row',
        rows: 100_000,
        gnataSQL: `-- Three separate jsonata() calls per row
-- Each compiles once, caches, evaluates independently
SELECT count(*) as n
FROM events
WHERE jsonata('action', data) = 'purchase'
  AND jsonata('amount', data) > 100
  AND jsonata('metadata.region', data) = 'us-east';`,
        nativeSQL: `-- Three json_extract calls per row
-- Each re-parses the full JSON document
SELECT count(*) as n
FROM events
WHERE json_extract(data, '$.action') = 'purchase'
  AND json_extract(data, '$.amount') > 100
  AND json_extract(data, '$.metadata.region') = 'us-east';`,
      },
      {
        name: 'Conditional transform',
        rows: 100_000,
        gnataSQL: `-- Ternary expression evaluated inside JSONata
-- Full expression: amount > 200 ? "high" : "low"
SELECT count(*) as n
FROM events
WHERE jsonata('amount > 200 ? "high" : "low"', data) = 'high';`,
        nativeSQL: `-- Equivalent requires SQL CASE expression
-- Mixes json_extract with SQL control flow
SELECT count(*) as n
FROM events
WHERE CASE WHEN json_extract(data, '$.amount') > 200
  THEN 'high' ELSE 'low' END = 'high';`,
      },
      {
        name: 'String transform ($uppercase)',
        rows: 100_000,
        gnataSQL: `-- Built-in $uppercase function applied to a field
-- Expression compiled once, string transform per row
SELECT count(*) as n
FROM events
WHERE jsonata('$uppercase(action)', data) = 'LOGIN';`,
        nativeSQL: `-- SQL upper() wrapping json_extract
-- Two function calls per row
SELECT count(*) as n
FROM events
WHERE upper(json_extract(data, '$.action')) = 'LOGIN';`,
      },
      {
        name: 'Full scan projection',
        rows: 100_000,
        gnataSQL: `-- Extract a nested field from every row, measure total chars
-- Tests throughput on a full table scan
SELECT sum(length(jsonata('metadata.ip', data))) as total_chars
FROM events;`,
        nativeSQL: `-- Equivalent full scan with json_extract
-- Baseline for per-row extraction overhead
SELECT sum(length(json_extract(data, '$.metadata.ip'))) as total_chars
FROM events;`,
      },
    ],
  },

  // ── aggregate: jsonata_query() streaming vs SQL aggregates ───
  {
    name: 'aggregate',
    category: 'jsonata_query() streaming vs SQL aggregates',
    setupSQL: SETUP_AGG,
    tests: [
      {
        name: 'SUM (streaming)',
        rows: 100_000,
        gnataSQL: `-- Streaming $sum: O(1) memory, one accumulator
-- Query planner decomposes to a single streaming add
SELECT jsonata_query('$sum(amount)', data) as total
FROM events;`,
        nativeSQL: `-- SQL sum() with json_extract per row
-- Native aggregate, single pass
SELECT sum(json_extract(data, '$.amount')) as total
FROM events;`,
      },
      {
        name: 'COUNT (streaming)',
        rows: 100_000,
        gnataSQL: `-- Streaming $count: O(1) memory, simple counter
-- Planner recognizes $count() as a streaming accumulator
SELECT jsonata_query('$count()', data) as n
FROM events;`,
        nativeSQL: `-- SQL count(*) does not need to read JSON at all
-- Fastest possible: just counts rowids
SELECT count(*) as n
FROM events;`,
      },
      {
        name: 'MAX (streaming)',
        rows: 100_000,
        gnataSQL: `-- Streaming $max: O(1) memory, tracks running maximum
-- Extracts amount per row via GJSON fast-path
SELECT jsonata_query('$max(amount)', data) as m
FROM events;`,
        nativeSQL: `-- SQL max() with json_extract per row
-- Native aggregate, single pass
SELECT max(json_extract(data, '$.amount')) as m
FROM events;`,
      },
      {
        name: 'AVERAGE (streaming)',
        rows: 100_000,
        gnataSQL: `-- Streaming $average: O(1) memory, tracks sum + count
-- Final division done once after all rows
SELECT jsonata_query('$average(amount)', data) as a
FROM events;`,
        nativeSQL: `-- SQL avg() with json_extract per row
-- Native aggregate, single pass
SELECT avg(json_extract(data, '$.amount')) as a
FROM events;`,
      },
      {
        name: 'GROUP BY + SUM (streaming)',
        rows: 100_000,
        gnataSQL: `-- jsonata_query inside GROUP BY
-- Streaming $sum resets per group, O(1) memory per group
SELECT json_extract(data, '$.region') as r,
       jsonata_query('$sum(amount)', data) as total
FROM events GROUP BY r;`,
        nativeSQL: `-- SQL sum + GROUP BY with json_extract
-- Two json_extract calls per row (region + amount)
SELECT json_extract(data, '$.region') as r,
       sum(json_extract(data, '$.amount')) as total
FROM events GROUP BY r;`,
      },
      {
        name: '$sort (accumulate)',
        rows: 100_000,
        gnataSQL: `-- Accumulate mode: $sort buffers all values in memory
-- O(n) memory, then sorts and returns last element
SELECT jsonata_query('$sort(amount)[0]', data) as top
FROM events;`,
        nativeSQL: `-- SQL max() is O(1) — no sort needed
-- Much faster for this specific operation
SELECT max(json_extract(data, '$.amount')) as top
FROM events;`,
      },
      {
        name: 'Complex expression (accumulate)',
        rows: 100_000,
        gnataSQL: `-- Accumulate mode: $distinct collects unique values
-- $count($distinct(action)) — count of unique action types
SELECT jsonata_query('$count($distinct(action))', data) as n
FROM events;`,
        nativeSQL: `-- SQL COUNT(DISTINCT ...) is natively optimized
SELECT COUNT(DISTINCT json_extract(data, '$.action')) as n
FROM events;`,
      },
    ],
  },

  // ── each: jsonata_each() vs json_each() ──────────────────────
  {
    name: 'each',
    category: 'jsonata_each() vs json_each()',
    setupSQL: SETUP_EACH,
    tests: [
      {
        name: 'Expand tags array',
        rows: 100_000,
        gnataSQL: `-- jsonata_each: expand the tags array into rows
-- Dot-path 'tags' evaluates per row, yields one row per element
SELECT count(*) as n
FROM events, jsonata_each('tags', events.data);`,
        nativeSQL: `-- json_each requires json_extract to get the array first
-- Two-step: extract array, then expand
SELECT count(*) as n
FROM events, json_each(json_extract(events.data, '$.tags'));`,
      },
      {
        name: 'Expand + filter (price > 100)',
        rows: 100_000,
        gnataSQL: `-- Inline predicate: items[price > 100]
-- Filter happens inside the JSONata expression, before expansion
SELECT count(*) as n
FROM events,
  jsonata_each('items[price > 100]', events.data);`,
        nativeSQL: `-- Must expand first, then filter with json_extract on each element
-- Filter is a separate WHERE clause after the join
SELECT count(*) as n
FROM events,
  json_each(json_extract(events.data, '$.items')) j
WHERE json_extract(j.value, '$.price') > 100;`,
      },
      {
        name: 'Expand + transform (inline arithmetic)',
        rows: 100_000,
        gnataSQL: `-- Auto-mapping: items.(qty * price) evaluates per array element
-- Each expanded row is already the computed product
SELECT sum(value) as total
FROM events, jsonata_each('items.(qty * price)', events.data);`,
        nativeSQL: `-- Must extract qty and price separately from each element
-- Two json_extract calls per expanded row
SELECT sum(json_extract(j.value, '$.qty') * json_extract(j.value, '$.price')) as total
FROM events, json_each(json_extract(events.data, '$.items')) j;`,
      },
      {
        name: 'Flatten + deduplicate (DISTINCT)',
        rows: 100_000,
        gnataSQL: `-- Expand tags across all rows, count unique values
-- jsonata_each + SQL DISTINCT
SELECT count(DISTINCT value) as n
FROM events, jsonata_each('tags', events.data);`,
        nativeSQL: `-- json_each + json_extract + SQL DISTINCT
-- Extra json_extract step to reach the array
SELECT count(DISTINCT j.value) as n
FROM events, json_each(json_extract(events.data, '$.tags')) j;`,
      },
      {
        name: 'GROUP BY on expanded elements',
        rows: 100_000,
        gnataSQL: `-- Expand tags, then GROUP BY the expanded values
-- Count occurrences of each tag
SELECT je.value as tag, count(*) as n
FROM events, jsonata_each('tags', events.data) je
GROUP BY tag ORDER BY n DESC LIMIT 5;`,
        nativeSQL: `-- json_each + json_extract, then GROUP BY
-- Same result, more verbose syntax
SELECT j.value as tag, count(*) as n
FROM events, json_each(json_extract(events.data, '$.tags')) j
GROUP BY tag ORDER BY n DESC LIMIT 5;`,
      },
    ],
  },

  // ── complex: advanced jsonata_query vs SQL ───────────────────
  {
    name: 'complex',
    category: 'jsonata_query() vs complex SQL',
    setupSQL: SETUP_COMPLEX,
    tests: [
      {
        name: 'COUNT DISTINCT users',
        rows: 100_000,
        gnataSQL: `-- Accumulate all user values, deduplicate, count
-- $distinct collects unique values, $count returns the total
SELECT jsonata_query('$count($distinct(user))', data) as n
FROM events;`,
        nativeSQL: `-- SQL COUNT(DISTINCT ...) handles this natively
-- Single pass with hash-based deduplication
SELECT COUNT(DISTINCT json_extract(data, '$.user')) as n
FROM events;`,
      },
      {
        name: 'GROUP BY + SUM per-region revenue',
        rows: 100_000,
        gnataSQL: `-- Streaming $sum inside a GROUP BY
-- jsonata_query resets its accumulator per group
SELECT json_extract(data, '$.region') as region,
       jsonata_query('$sum(amount)', data) as revenue
FROM events
WHERE json_extract(data, '$.action') = 'purchase'
GROUP BY region;`,
        nativeSQL: `-- SQL GROUP BY + SUM with json_extract
-- Two json_extract calls per row (region + amount), plus one for WHERE
SELECT json_extract(data, '$.region') as region,
       sum(json_extract(data, '$.amount')) as revenue
FROM events
WHERE json_extract(data, '$.action') = 'purchase'
GROUP BY region;`,
      },
      {
        name: 'TOP N users by spend (accumulate)',
        rows: 100_000,
        gnataSQL: `-- Accumulate all purchase rows, sort by amount descending
-- Project to {user, amount} objects
SELECT jsonata_query(
  '$sort($, function($a,$b){ $a.amount > $b.amount }).{"user": user, "amount": amount}',
  data
) FROM events
WHERE json_extract(data, '$.action') = 'purchase';`,
        nativeSQL: `-- SQL GROUP BY + ORDER BY + LIMIT
-- Aggregates per user, then sorts the grouped results
SELECT json_extract(data, '$.user') as user,
       sum(json_extract(data, '$.amount')) as total
FROM events
WHERE json_extract(data, '$.action') = 'purchase'
GROUP BY user ORDER BY total DESC LIMIT 5;`,
      },
      {
        name: 'Flatten + deduplicate tags (accumulate)',
        rows: 100_000,
        gnataSQL: `-- Accumulate: $reduce flattens all tag arrays into one list
-- Then $distinct deduplicates, $count tallies
SELECT jsonata_query(
  '$count($distinct($reduce($, function($a,$v){ $append($a, $v.tags) }, [])))',
  data
) as unique_tags
FROM events;`,
        nativeSQL: `-- SQL: expand arrays with json_each, then COUNT DISTINCT
-- Uses a join to flatten, subquery to deduplicate
SELECT COUNT(*) as unique_tags FROM (
  SELECT DISTINCT j.value
  FROM events, json_each(json_extract(events.data, '$.tags')) as j
);`,
      },
      {
        name: 'Sessionize user journeys (accumulate)',
        rows: 100_000,
        gnataSQL: `-- Per user: sort events by timestamp, join actions into a path
-- $sort + $join in a single expression
SELECT json_extract(data, '$.user') as user,
       jsonata_query(
         '$join($sort($, function($a,$b){$a.ts > $b.ts}).action, " > ")',
         data
       ) as journey
FROM events
GROUP BY user LIMIT 5;`,
        nativeSQL: `-- SQL: subquery sorts by timestamp, then group_concat joins
-- Requires ordering in a subquery before grouping
SELECT user, journey FROM (
  SELECT json_extract(data, '$.user') as user,
         group_concat(json_extract(data, '$.action'), ' > ') as journey
  FROM (
    SELECT data FROM events
    ORDER BY json_extract(data, '$.ts')
  )
  GROUP BY user
) LIMIT 5;`,
        nativeVariants: [
          {
            label: 'SQL (window function)',
            sql: `-- Optimized: use ROW_NUMBER() window function for ordering
-- Avoids the subquery sort, processes in a single pass
SELECT user, group_concat(action, ' > ') as journey FROM (
  SELECT json_extract(data, '$.user') as user,
         json_extract(data, '$.action') as action,
         ROW_NUMBER() OVER (
           PARTITION BY json_extract(data, '$.user')
           ORDER BY json_extract(data, '$.ts')
         ) as rn
  FROM events
)
GROUP BY user LIMIT 5;`,
          },
        ],
      },
      {
        name: 'Build report object (accumulate)',
        rows: 100_000,
        gnataSQL: `-- Single expression produces a full report object
-- Combines $count, $sum, $filter, $distinct, $average
SELECT jsonata_query('{
  "total_events": $count($),
  "revenue": $sum($filter($, function($v){ $v.action = "purchase" }).amount),
  "unique_users": $count($distinct(user)),
  "avg_purchase": $average($filter($, function($v){ $v.action = "purchase" }).amount)
}', data) as report
FROM events;`,
        nativeSQL: `-- SQL: 4 separate subqueries = 4 full table scans
-- Readable but scans the table once per metric
SELECT json_object(
  'total_events', (SELECT count(*) FROM events),
  'revenue', (SELECT sum(json_extract(data, '$.amount'))
              FROM events WHERE json_extract(data, '$.action') = 'purchase'),
  'unique_users', (SELECT COUNT(DISTINCT json_extract(data, '$.user'))
                   FROM events),
  'avg_purchase', (SELECT avg(json_extract(data, '$.amount'))
                   FROM events WHERE json_extract(data, '$.action') = 'purchase')
) as report;`,
        nativeVariants: [
          {
            label: 'SQL (single-scan CASE)',
            sql: `-- Optimized: CASE expressions compute all metrics in one pass
-- Same result but only scans the table once
SELECT json_object(
  'total_events', COUNT(*),
  'revenue',      SUM(CASE WHEN json_extract(data, '$.action') = 'purchase'
                       THEN json_extract(data, '$.amount') END),
  'unique_users', COUNT(DISTINCT json_extract(data, '$.user')),
  'avg_purchase', AVG(CASE WHEN json_extract(data, '$.action') = 'purchase'
                       THEN json_extract(data, '$.amount') END)
) as report
FROM events;`,
          },
        ],
      },
      {
        name: 'Histogram bucketing (accumulate)',
        rows: 100_000,
        gnataSQL: `-- Inline bucketing with lambda functions
-- $filter + $count per bucket, all in one expression
SELECT jsonata_query('
  (
    $data := $;
    $bucket := function($v){
      $v.amount <= 100 ? "0-100" :
      $v.amount <= 300 ? "100-300" :
      $v.amount <= 500 ? "300-500" : "500+"
    };
    {
      "0-100":   $count($filter($data, function($v){ $bucket($v) = "0-100" })),
      "100-300": $count($filter($data, function($v){ $bucket($v) = "100-300" })),
      "300-500": $count($filter($data, function($v){ $bucket($v) = "300-500" })),
      "500+":    $count($filter($data, function($v){ $bucket($v) = "500+" }))
    }
  )
', data)
FROM events
WHERE json_extract(data, '$.action') = 'purchase';`,
        nativeSQL: `-- SQL CASE + GROUP BY for bucketing
-- Single scan, built-in grouping
SELECT
  CASE
    WHEN json_extract(data, '$.amount') <= 100 THEN '0-100'
    WHEN json_extract(data, '$.amount') <= 300 THEN '100-300'
    WHEN json_extract(data, '$.amount') <= 500 THEN '300-500'
    ELSE '500+'
  END as bucket,
  count(*) as n
FROM events
WHERE json_extract(data, '$.action') = 'purchase'
GROUP BY bucket ORDER BY bucket;`,
      },
      {
        name: 'Streaming $sum at scale',
        rows: 100_000,
        gnataSQL: `-- Streaming accumulator on full table
-- O(1) memory regardless of table size
SELECT jsonata_query('$sum(amount)', data) as total
FROM events;`,
        nativeSQL: `-- SQL sum with json_extract
-- Baseline: native aggregate, single pass
SELECT sum(json_extract(data, '$.amount')) as total
FROM events;`,
      },
    ],
  },

  // ── report: jsonata_query complex report vs SQL variants ─────
  {
    name: 'report',
    category: 'jsonata_query() full report vs SQL',
    setupSQL: SETUP_ORDERS,
    tests: [
      {
        name: 'Report: vs 5 subqueries (5 scans)',
        rows: 100_000,
        gnataSQL: `-- Single expression: 5 metrics computed in one table scan
-- Streaming accumulators for $count, $sum, $average
-- $filter shares predicate evaluation across accumulators
SELECT jsonata_query('{
  "total": $count($),
  "revenue": $sum($filter($, function($v){$v.status = "completed"}).amount),
  "refunds": $sum($filter($, function($v){$v.status = "refunded"}).amount),
  "avg": $round($average(amount), 2),
  "customers": $count($distinct(customer))
}', data) as report
FROM orders;`,
        nativeSQL: `-- 5 separate subqueries = 5 full table scans
-- Readable but increasingly expensive with table size
SELECT json_object(
  'total',     (SELECT count(*) FROM orders),
  'revenue',   (SELECT sum(json_extract(data, '$.amount'))
                FROM orders WHERE json_extract(data, '$.status')='completed'),
  'refunds',   (SELECT sum(json_extract(data, '$.amount'))
                FROM orders WHERE json_extract(data, '$.status')='refunded'),
  'avg',       (SELECT round(avg(json_extract(data, '$.amount')),2) FROM orders),
  'customers', (SELECT count(distinct json_extract(data, '$.customer')) FROM orders)
) as report;`,
      },
      {
        name: 'Report: vs single-scan CASE',
        rows: 100_000,
        gnataSQL: `-- Same single-expression report as above
-- One scan, streaming accumulators, shared predicates
SELECT jsonata_query('{
  "total": $count($),
  "revenue": $sum($filter($, function($v){$v.status = "completed"}).amount),
  "refunds": $sum($filter($, function($v){$v.status = "refunded"}).amount),
  "avg": $round($average(amount), 2),
  "customers": $count($distinct(customer))
}', data) as report
FROM orders;`,
        nativeSQL: `-- Hand-optimized: CASE expressions in a single scan
-- Most efficient pure SQL approach for multi-metric reports
SELECT json_object(
  'total',     COUNT(*),
  'revenue',   SUM(CASE WHEN json_extract(data, '$.status') = 'completed'
                   THEN json_extract(data, '$.amount') END),
  'refunds',   SUM(CASE WHEN json_extract(data, '$.status') = 'refunded'
                   THEN json_extract(data, '$.amount') END),
  'avg',       ROUND(AVG(json_extract(data, '$.amount')), 2),
  'customers', COUNT(DISTINCT json_extract(data, '$.customer'))
) as report
FROM orders;`,
      },
    ],
  },

  // ── functions: new gnata functions ───────────────────────────
  {
    name: 'functions',
    category: 'New gnata functions',
    setupSQL: SETUP_FUNCTIONS,
    tests: [
      {
        name: '$base64 encode',
        rows: 100_000,
        gnataSQL: `-- Base64-encode the payload field per row
-- No SQLite equivalent without a custom extension
SELECT count(*) as n
FROM events
WHERE length(jsonata('$base64(payload)', data)) > 0;`,
        nativeSQL: null,
      },
      {
        name: '$urlencode',
        rows: 100_000,
        gnataSQL: `-- URL-encode the email field per row
-- Handles special characters like @ automatically
SELECT count(*) as n
FROM events
WHERE length(jsonata('$urlencode(email)', data)) > 0;`,
        nativeSQL: null,
      },
      {
        name: '$htmlescape',
        rows: 100_000,
        gnataSQL: `-- HTML-escape content to prevent XSS
-- Converts <, >, &, " to HTML entities
SELECT count(*) as n
FROM events
WHERE length(jsonata('$htmlescape(html_content)', data)) > 0;`,
        nativeSQL: null,
      },
      {
        name: '$csv format',
        rows: 100_000,
        gnataSQL: `-- Format array of fields as a CSV row
-- Handles quoting and escaping automatically
SELECT count(*) as n
FROM events
WHERE length(jsonata('$csv([user, email, action])', data)) > 0;`,
        nativeSQL: null,
      },
      {
        name: '$number with default (try pattern)',
        rows: 100_000,
        gnataSQL: `-- 3-arg jsonata: expression, data, default if error
-- ~14k rows have 'invalid' as amount, default to 0
SELECT sum(jsonata('$number(amount)', data, 0)) as total
FROM events;`,
        nativeSQL: `-- SQL fallback: typeof check + GLOB pattern + CASE
-- Verbose manual validation of numeric strings
SELECT sum(
  CASE WHEN typeof(json_extract(data, '$.amount')) = 'text'
       AND json_extract(data, '$.amount') GLOB '*[^0-9.]*'
  THEN 0
  ELSE CAST(json_extract(data, '$.amount') AS REAL)
  END
) as total
FROM events;`,
      },
      {
        name: 'jsonata_set vs json_set',
        rows: 100_000,
        gnataSQL: `-- Set a field using dot-path syntax
-- jsonata_set(json, path, value) — no dollar-prefix needed
SELECT count(*) as n FROM (
  SELECT jsonata_set(data, 'processed', 'true') as modified
  FROM events
) WHERE length(modified) > 0;`,
        nativeSQL: `-- SQLite built-in json_set with dollar-path
-- json_set(json, '$.path', value)
SELECT count(*) as n FROM (
  SELECT json_set(data, '$.processed', 1) as modified
  FROM events
) WHERE length(modified) > 0;`,
      },
      {
        name: 'jsonata_delete vs json_remove',
        rows: 100_000,
        gnataSQL: `-- Remove a field using dot-path syntax
-- jsonata_delete(json, path) — no dollar-prefix needed
SELECT count(*) as n FROM (
  SELECT jsonata_delete(data, 'internal_id') as cleaned
  FROM events
) WHERE length(cleaned) > 0;`,
        nativeSQL: `-- SQLite built-in json_remove with dollar-path
-- json_remove(json, '$.path')
SELECT count(*) as n FROM (
  SELECT json_remove(data, '$.internal_id') as cleaned
  FROM events
) WHERE length(cleaned) > 0;`,
      },
      {
        name: 'Format in aggregate context',
        rows: 100_000,
        gnataSQL: `-- $base64 called inside a $filter inside jsonata_query
-- Tests function overhead in accumulate mode
SELECT jsonata_query(
  '$count($filter($, function($v){ $base64($v.user) != "" }))',
  data
) as n
FROM events;`,
        nativeSQL: null,
      },
    ],
  },
];
