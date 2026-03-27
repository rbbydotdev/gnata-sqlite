-- SQLite benchmark: gnata jsonata() vs native json_extract()
-- Measures overhead of gnata extension on realistic workloads.

.load ./gnata_jsonata sqlite3_jsonata_init
.timer on
.headers on
.mode column

-- ═══════════════════════════════════════════════════════════════
-- Setup: create a table with 100k JSON rows
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE events(id INTEGER PRIMARY KEY, data TEXT);

-- Generate 100k rows of realistic JSON
WITH RECURSIVE cnt(x) AS (
  VALUES(1)
  UNION ALL
  SELECT x+1 FROM cnt WHERE x < 100000
)
INSERT INTO events(id, data)
SELECT x, json_object(
  'user_id', x % 1000,
  'action', CASE x % 5
    WHEN 0 THEN 'login'
    WHEN 1 THEN 'purchase'
    WHEN 2 THEN 'logout'
    WHEN 3 THEN 'view'
    WHEN 4 THEN 'click'
  END,
  'amount', ROUND((x % 500) * 1.37, 2),
  'metadata', json_object(
    'ip', '10.0.' || (x % 256) || '.' || ((x * 7) % 256),
    'region', CASE x % 4
      WHEN 0 THEN 'us-east'
      WHEN 1 THEN 'us-west'
      WHEN 2 THEN 'eu-west'
      WHEN 3 THEN 'ap-south'
    END,
    'tags', json_array('tag' || (x % 10), 'tag' || ((x+1) % 10))
  ),
  'timestamp', 1700000000 + x
) FROM cnt;

SELECT '=== Setup complete: ' || count(*) || ' rows ===' as info FROM events;

-- ═══════════════════════════════════════════════════════════════
-- Benchmark 1: Simple field extraction (100k rows)
-- ═══════════════════════════════════════════════════════════════

SELECT '--- Bench 1: Simple field extract (100k rows) ---' as bench;

SELECT '  json_extract:' as method;
SELECT count(*) as n FROM events WHERE json_extract(data, '$.action') = 'login';

SELECT '  jsonata:' as method;
SELECT count(*) as n FROM events WHERE jsonata('action', data) = 'login';

-- ═══════════════════════════════════════════════════════════════
-- Benchmark 2: Nested field extraction (100k rows)
-- ═══════════════════════════════════════════════════════════════

SELECT '--- Bench 2: Nested field extract (100k rows) ---' as bench;

SELECT '  json_extract:' as method;
SELECT count(*) as n FROM events WHERE json_extract(data, '$.metadata.region') = 'us-east';

SELECT '  jsonata:' as method;
SELECT count(*) as n FROM events WHERE jsonata('metadata.region', data) = 'us-east';

-- ═══════════════════════════════════════════════════════════════
-- Benchmark 3: Numeric field + aggregation (100k rows)
-- ═══════════════════════════════════════════════════════════════

SELECT '--- Bench 3: Numeric aggregation (100k rows) ---' as bench;

SELECT '  json_extract:' as method;
SELECT sum(json_extract(data, '$.amount')) as total FROM events;

SELECT '  jsonata:' as method;
SELECT sum(jsonata('amount', data)) as total FROM events;

-- ═══════════════════════════════════════════════════════════════
-- Benchmark 4: Multiple field access per row (100k rows)
-- ═══════════════════════════════════════════════════════════════

SELECT '--- Bench 4: Multi-field access per row (100k rows) ---' as bench;

SELECT '  json_extract (3 fields):' as method;
SELECT count(*) as n FROM events
WHERE json_extract(data, '$.action') = 'purchase'
  AND json_extract(data, '$.amount') > 100
  AND json_extract(data, '$.metadata.region') = 'us-east';

SELECT '  jsonata (3 expressions):' as method;
SELECT count(*) as n FROM events
WHERE jsonata('action', data) = 'purchase'
  AND jsonata('amount', data) > 100
  AND jsonata('metadata.region', data) = 'us-east';

-- ═══════════════════════════════════════════════════════════════
-- Benchmark 5: Expression power — things jsonata can do that
-- json_extract cannot (JSONata filter + transform in one call)
-- ═══════════════════════════════════════════════════════════════

SELECT '--- Bench 5: JSONata expression power (10k rows) ---' as bench;

SELECT '  jsonata (conditional transform):' as method;
SELECT count(*) as n FROM events
WHERE id <= 10000
  AND jsonata('amount > 200 ? "high" : "low"', data) = 'high';

SELECT '  json_extract + CASE (equivalent):' as method;
SELECT count(*) as n FROM events
WHERE id <= 10000
  AND CASE WHEN json_extract(data, '$.amount') > 200 THEN 'high' ELSE 'low' END = 'high';

-- ═══════════════════════════════════════════════════════════════
-- Benchmark 6: String function (10k rows)
-- ═══════════════════════════════════════════════════════════════

SELECT '--- Bench 6: String transform (10k rows) ---' as bench;

SELECT '  jsonata ($uppercase):' as method;
SELECT count(*) as n FROM events
WHERE id <= 10000
  AND jsonata('$uppercase(action)', data) = 'LOGIN';

SELECT '  upper() + json_extract:' as method;
SELECT count(*) as n FROM events
WHERE id <= 10000
  AND upper(json_extract(data, '$.action')) = 'LOGIN';

-- ═══════════════════════════════════════════════════════════════
-- Benchmark 7: Full scan projection (100k rows, return value)
-- ═══════════════════════════════════════════════════════════════

SELECT '--- Bench 7: Full scan projection (100k rows) ---' as bench;

SELECT '  json_extract:' as method;
SELECT sum(length(json_extract(data, '$.metadata.ip'))) as total_chars FROM events;

SELECT '  jsonata:' as method;
SELECT sum(length(jsonata('metadata.ip', data))) as total_chars FROM events;

SELECT '=== Benchmarks complete ===' as info;
