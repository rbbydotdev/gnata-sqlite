export interface BenchmarkPair {
  name: string;
  rows: number;
  gnataSQL: string;
  nativeSQL: string | null;
}

export interface BenchmarkSuite {
  name: string;
  category: string;
  setupSQL: string;
  tests: BenchmarkPair[];
}

// ── Setup SQL blocks (extracted from .sql files) ─────────────────

const SETUP_100K_EVENTS = `
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

const SETUP_100K_AGG = `
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

const SETUP_50K_COMPLEX = `
CREATE TABLE events(id INTEGER PRIMARY KEY, data TEXT);
WITH RECURSIVE cnt(x) AS (
  VALUES(1) UNION ALL SELECT x+1 FROM cnt WHERE x < 50000
)
INSERT INTO events(id, data)
SELECT x, json_object(
  'user', 'user' || (x % 100),
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

const SETUP_50K_EACH = `
CREATE TABLE events(id INTEGER PRIMARY KEY, data TEXT);
WITH RECURSIVE cnt(x) AS (
  VALUES(1) UNION ALL SELECT x+1 FROM cnt WHERE x < 50000
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

const SETUP_100K_ORDERS = `
CREATE TABLE orders(data TEXT);
WITH RECURSIVE cnt(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM cnt WHERE x < 100000)
INSERT INTO orders SELECT json_object(
  'customer','user'||(x%100),
  'amount',ROUND((x%500)*1.37,2),
  'status', CASE x%5 WHEN 4 THEN 'refunded' ELSE 'completed' END
) FROM cnt;`;

const SETUP_100K_NEW = `
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
    setupSQL: SETUP_100K_EVENTS,
    tests: [
      {
        name: 'Simple field extraction',
        rows: 100_000,
        gnataSQL: `SELECT count(*) as n FROM events WHERE jsonata('action', data) = 'login';`,
        nativeSQL: `SELECT count(*) as n FROM events WHERE json_extract(data, '$.action') = 'login';`,
      },
      {
        name: 'Nested field extraction',
        rows: 100_000,
        gnataSQL: `SELECT count(*) as n FROM events WHERE jsonata('metadata.region', data) = 'us-east';`,
        nativeSQL: `SELECT count(*) as n FROM events WHERE json_extract(data, '$.metadata.region') = 'us-east';`,
      },
      {
        name: 'Numeric aggregation',
        rows: 100_000,
        gnataSQL: `SELECT sum(jsonata('amount', data)) as total FROM events;`,
        nativeSQL: `SELECT sum(json_extract(data, '$.amount')) as total FROM events;`,
      },
      {
        name: 'Multi-field access per row',
        rows: 100_000,
        gnataSQL: `SELECT count(*) as n FROM events
WHERE jsonata('action', data) = 'purchase'
  AND jsonata('amount', data) > 100
  AND jsonata('metadata.region', data) = 'us-east';`,
        nativeSQL: `SELECT count(*) as n FROM events
WHERE json_extract(data, '$.action') = 'purchase'
  AND json_extract(data, '$.amount') > 100
  AND json_extract(data, '$.metadata.region') = 'us-east';`,
      },
      {
        name: 'Conditional transform',
        rows: 10_000,
        gnataSQL: `SELECT count(*) as n FROM events
WHERE id <= 10000
  AND jsonata('amount > 200 ? "high" : "low"', data) = 'high';`,
        nativeSQL: `SELECT count(*) as n FROM events
WHERE id <= 10000
  AND CASE WHEN json_extract(data, '$.amount') > 200 THEN 'high' ELSE 'low' END = 'high';`,
      },
      {
        name: 'String transform ($uppercase)',
        rows: 10_000,
        gnataSQL: `SELECT count(*) as n FROM events
WHERE id <= 10000
  AND jsonata('$uppercase(action)', data) = 'LOGIN';`,
        nativeSQL: `SELECT count(*) as n FROM events
WHERE id <= 10000
  AND upper(json_extract(data, '$.action')) = 'LOGIN';`,
      },
      {
        name: 'Full scan projection',
        rows: 100_000,
        gnataSQL: `SELECT sum(length(jsonata('metadata.ip', data))) as total_chars FROM events;`,
        nativeSQL: `SELECT sum(length(json_extract(data, '$.metadata.ip'))) as total_chars FROM events;`,
      },
    ],
  },

  // ── aggregate: jsonata_query() streaming vs SQL aggregates ───
  {
    name: 'aggregate',
    category: 'jsonata_query() streaming vs SQL aggregates',
    setupSQL: SETUP_100K_AGG,
    tests: [
      {
        name: 'SUM (streaming)',
        rows: 100_000,
        gnataSQL: `SELECT jsonata_query('$sum(amount)', data) as total FROM events;`,
        nativeSQL: `SELECT sum(json_extract(data, '$.amount')) as total FROM events;`,
      },
      {
        name: 'COUNT (streaming)',
        rows: 100_000,
        gnataSQL: `SELECT jsonata_query('$count()', data) as n FROM events;`,
        nativeSQL: `SELECT count(*) as n FROM events;`,
      },
      {
        name: 'MAX (streaming)',
        rows: 100_000,
        gnataSQL: `SELECT jsonata_query('$max(amount)', data) as m FROM events;`,
        nativeSQL: `SELECT max(json_extract(data, '$.amount')) as m FROM events;`,
      },
      {
        name: 'AVERAGE (streaming)',
        rows: 100_000,
        gnataSQL: `SELECT jsonata_query('$average(amount)', data) as a FROM events;`,
        nativeSQL: `SELECT avg(json_extract(data, '$.amount')) as a FROM events;`,
      },
      {
        name: 'GROUP BY + SUM (streaming)',
        rows: 100_000,
        gnataSQL: `SELECT json_extract(data, '$.region') as r,
       jsonata_query('$sum(amount)', data) as total
FROM events GROUP BY r;`,
        nativeSQL: `SELECT json_extract(data, '$.region') as r,
       sum(json_extract(data, '$.amount')) as total
FROM events GROUP BY r;`,
      },
      {
        name: '$sort (accumulate, 10k rows)',
        rows: 10_000,
        gnataSQL: `SELECT jsonata_query('$sort(amount)[-1]', data) as top FROM events WHERE id <= 10000;`,
        nativeSQL: `SELECT max(json_extract(data, '$.amount')) as top FROM events WHERE id <= 10000;`,
      },
      {
        name: 'Complex expression (accumulate, 1k rows)',
        rows: 1_000,
        gnataSQL: `SELECT jsonata_query('$count($distinct(action))', data) as n FROM events WHERE id <= 1000;`,
        nativeSQL: null,
      },
    ],
  },

  // ── each: jsonata_each() vs json_each() ──────────────────────
  {
    name: 'each',
    category: 'jsonata_each() vs json_each()',
    setupSQL: SETUP_50K_EACH,
    tests: [
      {
        name: 'Expand tags array',
        rows: 10_000,
        gnataSQL: `SELECT count(*) as n FROM events, jsonata_each('tags', events.data)
WHERE events.id <= 10000;`,
        nativeSQL: `SELECT count(*) as n FROM events, json_each(json_extract(events.data, '$.tags'))
WHERE events.id <= 10000;`,
      },
      {
        name: 'Expand + filter (price > 100)',
        rows: 10_000,
        gnataSQL: `SELECT count(*) as n FROM events,
  jsonata_each('items[price > 100]', events.data)
WHERE events.id <= 10000;`,
        nativeSQL: `SELECT count(*) as n FROM events,
  json_each(json_extract(events.data, '$.items')) j
WHERE events.id <= 10000
  AND json_extract(j.value, '$.price') > 100;`,
      },
      {
        name: 'Expand + transform (inline arithmetic)',
        rows: 10_000,
        gnataSQL: `SELECT sum(value) as total
FROM events, jsonata_each('items.(qty * price)', events.data)
WHERE events.id <= 10000;`,
        nativeSQL: `SELECT sum(json_extract(j.value, '$.qty') * json_extract(j.value, '$.price')) as total
FROM events, json_each(json_extract(events.data, '$.items')) j
WHERE events.id <= 10000;`,
      },
      {
        name: 'Flatten + deduplicate (DISTINCT)',
        rows: 10_000,
        gnataSQL: `SELECT count(DISTINCT value) as n
FROM events, jsonata_each('tags', events.data)
WHERE events.id <= 10000;`,
        nativeSQL: `SELECT count(DISTINCT j.value) as n
FROM events, json_each(json_extract(events.data, '$.tags')) j
WHERE events.id <= 10000;`,
      },
      {
        name: 'GROUP BY on expanded elements',
        rows: 10_000,
        gnataSQL: `SELECT je.value as tag, count(*) as n
FROM events, jsonata_each('tags', events.data) je
WHERE events.id <= 10000
GROUP BY tag ORDER BY n DESC LIMIT 5;`,
        nativeSQL: `SELECT j.value as tag, count(*) as n
FROM events, json_each(json_extract(events.data, '$.tags')) j
WHERE events.id <= 10000
GROUP BY tag ORDER BY n DESC LIMIT 5;`,
      },
      {
        name: 'Full scan expand (50k rows)',
        rows: 50_000,
        gnataSQL: `SELECT count(*) as n FROM events, jsonata_each('tags', events.data);`,
        nativeSQL: `SELECT count(*) as n FROM events, json_each(json_extract(events.data, '$.tags'));`,
      },
    ],
  },

  // ── complex: advanced jsonata_query vs SQL ───────────────────
  {
    name: 'complex',
    category: 'jsonata_query() vs complex SQL',
    setupSQL: SETUP_50K_COMPLEX,
    tests: [
      {
        name: 'COUNT DISTINCT users',
        rows: 50_000,
        gnataSQL: `SELECT jsonata_query('$count($distinct(user))', data) as n FROM events;`,
        nativeSQL: `SELECT COUNT(DISTINCT json_extract(data, '$.user')) as n FROM events;`,
      },
      {
        name: 'GROUP BY + SUM per-region revenue',
        rows: 50_000,
        gnataSQL: `SELECT json_extract(data, '$.region') as region,
       jsonata_query('$sum(amount)', data) as revenue
FROM events WHERE json_extract(data, '$.action') = 'purchase'
GROUP BY region;`,
        nativeSQL: `SELECT json_extract(data, '$.region') as region,
       sum(json_extract(data, '$.amount')) as revenue
FROM events WHERE json_extract(data, '$.action') = 'purchase'
GROUP BY region;`,
      },
      {
        name: 'TOP N users by spend (accumulate)',
        rows: 10_000,
        gnataSQL: `SELECT jsonata_query('$sort($, function($a,$b){ $a.amount > $b.amount }).{"user": user, "amount": amount}', data) FROM events
WHERE json_extract(data, '$.action') = 'purchase' AND id <= 10000;`,
        nativeSQL: `SELECT json_extract(data, '$.user') as user,
       sum(json_extract(data, '$.amount')) as total
FROM events WHERE json_extract(data, '$.action') = 'purchase' AND id <= 10000
GROUP BY user ORDER BY total DESC LIMIT 5;`,
      },
      {
        name: 'Flatten + deduplicate tags (accumulate)',
        rows: 10_000,
        gnataSQL: `SELECT jsonata_query(
  '$count($distinct($reduce($, function($a,$v){ $append($a, $v.tags) }, [])))',
  data
) as unique_tags FROM events WHERE id <= 10000;`,
        nativeSQL: `SELECT COUNT(*) as unique_tags FROM (
  SELECT DISTINCT j.value
  FROM events, json_each(json_extract(events.data, '$.tags')) as j
  WHERE events.id <= 10000
);`,
      },
      {
        name: 'Sessionize user journeys (accumulate)',
        rows: 5_000,
        gnataSQL: `SELECT json_extract(data, '$.user') as user,
       jsonata_query('$join($sort($, function($a,$b){$a.ts > $b.ts}).action, " > ")', data) as journey
FROM events WHERE id <= 5000
GROUP BY user LIMIT 5;`,
        nativeSQL: `SELECT user, journey FROM (
  SELECT json_extract(data, '$.user') as user,
         group_concat(json_extract(data, '$.action'), ' > ') as journey
  FROM (SELECT data FROM events WHERE id <= 5000 ORDER BY json_extract(data, '$.ts'))
  GROUP BY user
) LIMIT 5;`,
      },
      {
        name: 'Build report object (accumulate)',
        rows: 10_000,
        gnataSQL: `SELECT jsonata_query('{
  "total_events": $count($),
  "revenue": $sum($filter($, function($v){ $v.action = "purchase" }).amount),
  "unique_users": $count($distinct(user)),
  "avg_purchase": $average($filter($, function($v){ $v.action = "purchase" }).amount)
}', data) as report FROM events WHERE id <= 10000;`,
        nativeSQL: `SELECT json_object(
  'total_events', (SELECT count(*) FROM events WHERE id <= 10000),
  'revenue', (SELECT sum(json_extract(data, '$.amount'))
              FROM events WHERE id <= 10000 AND json_extract(data, '$.action') = 'purchase'),
  'unique_users', (SELECT COUNT(DISTINCT json_extract(data, '$.user')) FROM events WHERE id <= 10000),
  'avg_purchase', (SELECT avg(json_extract(data, '$.amount'))
                   FROM events WHERE id <= 10000 AND json_extract(data, '$.action') = 'purchase')
) as report;`,
      },
      {
        name: 'Histogram bucketing (accumulate)',
        rows: 10_000,
        gnataSQL: `SELECT jsonata_query('
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
', data) FROM events
WHERE json_extract(data, '$.action') = 'purchase' AND id <= 10000;`,
        nativeSQL: `SELECT
  CASE
    WHEN json_extract(data, '$.amount') <= 100 THEN '0-100'
    WHEN json_extract(data, '$.amount') <= 300 THEN '100-300'
    WHEN json_extract(data, '$.amount') <= 500 THEN '300-500'
    ELSE '500+'
  END as bucket,
  count(*) as n
FROM events
WHERE json_extract(data, '$.action') = 'purchase' AND id <= 10000
GROUP BY bucket ORDER BY bucket;`,
      },
      {
        name: 'Streaming $sum at scale',
        rows: 50_000,
        gnataSQL: `SELECT jsonata_query('$sum(amount)', data) as total FROM events;`,
        nativeSQL: `SELECT sum(json_extract(data, '$.amount')) as total FROM events;`,
      },
    ],
  },

  // ── report: jsonata_query complex report vs SQL variants ─────
  {
    name: 'report',
    category: 'jsonata_query() full report vs SQL',
    setupSQL: SETUP_100K_ORDERS,
    tests: [
      {
        name: 'Report: vs 5 subqueries (5 scans)',
        rows: 100_000,
        gnataSQL: `SELECT jsonata_query('{
  "total": $count($),
  "revenue": $sum($filter($, function($v){$v.status = "completed"}).amount),
  "refunds": $sum($filter($, function($v){$v.status = "refunded"}).amount),
  "avg": $round($average(amount), 2),
  "customers": $count($distinct(customer))
}', data) as report FROM orders;`,
        nativeSQL: `SELECT json_object(
  'total', (SELECT count(*) FROM orders),
  'revenue', (SELECT sum(json_extract(data, '$.amount')) FROM orders WHERE json_extract(data, '$.status')='completed'),
  'refunds', (SELECT sum(json_extract(data, '$.amount')) FROM orders WHERE json_extract(data, '$.status')='refunded'),
  'avg', (SELECT round(avg(json_extract(data, '$.amount')),2) FROM orders),
  'customers', (SELECT count(distinct json_extract(data, '$.customer')) FROM orders)
) as report;`,
      },
      {
        name: 'Report: vs single-scan CASE',
        rows: 100_000,
        gnataSQL: `SELECT jsonata_query('{
  "total": $count($),
  "revenue": $sum($filter($, function($v){$v.status = "completed"}).amount),
  "refunds": $sum($filter($, function($v){$v.status = "refunded"}).amount),
  "avg": $round($average(amount), 2),
  "customers": $count($distinct(customer))
}', data) as report FROM orders;`,
        nativeSQL: `SELECT json_object(
  'total',     COUNT(*),
  'revenue',   SUM(CASE WHEN json_extract(data, '$.status') = 'completed' THEN json_extract(data, '$.amount') END),
  'refunds',   SUM(CASE WHEN json_extract(data, '$.status') = 'refunded' THEN json_extract(data, '$.amount') END),
  'avg',       ROUND(AVG(json_extract(data, '$.amount')), 2),
  'customers', COUNT(DISTINCT json_extract(data, '$.customer'))
) as report FROM orders;`,
      },
    ],
  },

  // ── functions: new gnata functions ───────────────────────────
  {
    name: 'functions',
    category: 'New gnata functions',
    setupSQL: SETUP_100K_NEW,
    tests: [
      {
        name: '$base64 encode',
        rows: 10_000,
        gnataSQL: `SELECT count(*) as n FROM events
WHERE id <= 10000
  AND length(jsonata('$base64(payload)', data)) > 0;`,
        nativeSQL: null,
      },
      {
        name: '$urlencode',
        rows: 10_000,
        gnataSQL: `SELECT count(*) as n FROM events
WHERE id <= 10000
  AND length(jsonata('$urlencode(email)', data)) > 0;`,
        nativeSQL: null,
      },
      {
        name: '$htmlescape',
        rows: 10_000,
        gnataSQL: `SELECT count(*) as n FROM events
WHERE id <= 10000
  AND length(jsonata('$htmlescape(html_content)', data)) > 0;`,
        nativeSQL: null,
      },
      {
        name: '$csv format',
        rows: 10_000,
        gnataSQL: `SELECT count(*) as n FROM events
WHERE id <= 10000
  AND length(jsonata('$csv([user, email, action])', data)) > 0;`,
        nativeSQL: null,
      },
      {
        name: '$number with default (try pattern)',
        rows: 100_000,
        gnataSQL: `SELECT sum(jsonata('$number(amount)', data, 0)) as total FROM events;`,
        nativeSQL: `SELECT sum(
  CASE WHEN typeof(json_extract(data, '$.amount')) = 'text'
       AND json_extract(data, '$.amount') GLOB '*[^0-9.]*'
  THEN 0
  ELSE CAST(json_extract(data, '$.amount') AS REAL)
  END
) as total FROM events;`,
      },
      {
        name: 'jsonata_set vs json_set',
        rows: 10_000,
        gnataSQL: `SELECT count(*) as n FROM (
  SELECT jsonata_set(data, 'processed', 'true') as modified
  FROM events WHERE id <= 10000
) WHERE length(modified) > 0;`,
        nativeSQL: `SELECT count(*) as n FROM (
  SELECT json_set(data, '$.processed', 1) as modified
  FROM events WHERE id <= 10000
) WHERE length(modified) > 0;`,
      },
      {
        name: 'jsonata_delete vs json_remove',
        rows: 10_000,
        gnataSQL: `SELECT count(*) as n FROM (
  SELECT jsonata_delete(data, 'internal_id') as cleaned
  FROM events WHERE id <= 10000
) WHERE length(cleaned) > 0;`,
        nativeSQL: `SELECT count(*) as n FROM (
  SELECT json_remove(data, '$.internal_id') as cleaned
  FROM events WHERE id <= 10000
) WHERE length(cleaned) > 0;`,
      },
      {
        name: 'Format in aggregate context',
        rows: 1_000,
        gnataSQL: `SELECT jsonata_query('$count($filter($, function($v){ $base64($v.user) != "" }))', data) as n
FROM events WHERE id <= 1000;`,
        nativeSQL: null,
      },
    ],
  },
];
