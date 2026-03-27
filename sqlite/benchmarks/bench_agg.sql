-- Benchmark: jsonata_query streaming vs native SQL aggregates
.load ./gnata_jsonata sqlite3_jsonata_init
.timer on
.headers on
.mode column

-- Setup: 100k rows
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
) FROM cnt;

SELECT '=== 100k rows ready ===' as info;

-- ════════════════════════════════════════════════════════
-- Bench 1: SUM — native vs jsonata_query streaming
-- ════════════════════════════════════════════════════════

SELECT '--- Bench 1: SUM (100k rows) ---' as bench;

SELECT '  SQL sum(json_extract):' as method;
SELECT sum(json_extract(data, '$.amount')) as total FROM events;

SELECT '  jsonata_query $sum (streaming):' as method;
SELECT jsonata_query('$sum(amount)', data) as total FROM events;

-- ════════════════════════════════════════════════════════
-- Bench 2: COUNT — native vs streaming
-- ════════════════════════════════════════════════════════

SELECT '--- Bench 2: COUNT (100k rows) ---' as bench;

SELECT '  SQL count(*):' as method;
SELECT count(*) as n FROM events;

SELECT '  jsonata_query $count (streaming):' as method;
SELECT jsonata_query('$count()', data) as n FROM events;

-- ════════════════════════════════════════════════════════
-- Bench 3: MAX — native vs streaming
-- ════════════════════════════════════════════════════════

SELECT '--- Bench 3: MAX (100k rows) ---' as bench;

SELECT '  SQL max(json_extract):' as method;
SELECT max(json_extract(data, '$.amount')) as m FROM events;

SELECT '  jsonata_query $max (streaming):' as method;
SELECT jsonata_query('$max(amount)', data) as m FROM events;

-- ════════════════════════════════════════════════════════
-- Bench 4: AVERAGE — native vs streaming
-- ════════════════════════════════════════════════════════

SELECT '--- Bench 4: AVERAGE (100k rows) ---' as bench;

SELECT '  SQL avg(json_extract):' as method;
SELECT avg(json_extract(data, '$.amount')) as a FROM events;

SELECT '  jsonata_query $average (streaming):' as method;
SELECT jsonata_query('$average(amount)', data) as a FROM events;

-- ════════════════════════════════════════════════════════
-- Bench 5: GROUP BY SUM — native vs streaming
-- ════════════════════════════════════════════════════════

SELECT '--- Bench 5: GROUP BY SUM (100k rows, 4 groups) ---' as bench;

SELECT '  SQL sum + json_extract + GROUP BY:' as method;
SELECT json_extract(data, '$.region') as r,
       sum(json_extract(data, '$.amount')) as total
FROM events GROUP BY r;

SELECT '  jsonata_query $sum + GROUP BY:' as method;
SELECT json_extract(data, '$.region') as r,
       jsonata_query('$sum(amount)', data) as total
FROM events GROUP BY r;

-- ════════════════════════════════════════════════════════
-- Bench 6: General agg (accumulate mode) — $sort on 10k rows
-- ════════════════════════════════════════════════════════

SELECT '--- Bench 6: General agg $sort (10k rows, accumulate) ---' as bench;

SELECT '  jsonata_query $sort (accumulate 10k rows):' as method;
SELECT jsonata_query('$sort(amount)[-1]', data) as top FROM events WHERE id <= 10000;

SELECT '  SQL max(json_extract) equivalent:' as method;
SELECT max(json_extract(data, '$.amount')) as top FROM events WHERE id <= 10000;

-- ════════════════════════════════════════════════════════
-- Bench 7: General agg — complex expression (1k rows)
-- ════════════════════════════════════════════════════════

SELECT '--- Bench 7: Complex expression (1k rows, accumulate) ---' as bench;

SELECT '  jsonata_query (distinct actions):' as method;
SELECT jsonata_query('$count($distinct(action))', data) as n FROM events WHERE id <= 1000;

SELECT '=== Aggregate benchmarks complete ===' as info;
