-- Benchmark: jsonata_each table-valued function vs json_each
.load ./gnata_jsonata sqlite3_jsonata_init
.timer on
.headers on
.mode column

-- ══════════════════════════════════════════════════════════
-- Setup: 50k rows with JSON arrays and nested data
-- ══════════════════════════════════════════════════════════

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
) FROM cnt;

SELECT '=== 50k rows ready ===' as info;

-- ══════════════════════════════════════════════════════════
-- 1. Expand array — jsonata_each vs json_each
-- ══════════════════════════════════════════════════════════

SELECT '--- 1. Expand tags array (10k rows) ---' as bench;

SELECT '  json_each:' as method;
SELECT count(*) as n FROM events, json_each(json_extract(events.data, '$.tags'))
WHERE events.id <= 10000;

SELECT '  jsonata_each:' as method;
SELECT count(*) as n FROM events, jsonata_each('tags', events.data)
WHERE events.id <= 10000;

-- ══════════════════════════════════════════════════════════
-- 2. Expand + filter — JSONata expression power
-- ══════════════════════════════════════════════════════════

SELECT '--- 2. Expand items where price > 100 (10k rows) ---' as bench;

SELECT '  json_each + json_extract filter:' as method;
SELECT count(*) as n FROM events,
  json_each(json_extract(events.data, '$.items')) j
WHERE events.id <= 10000
  AND json_extract(j.value, '$.price') > 100;

SELECT '  jsonata_each with inline filter:' as method;
SELECT count(*) as n FROM events,
  jsonata_each('items[price > 100]', events.data)
WHERE events.id <= 10000;

-- ══════════════════════════════════════════════════════════
-- 3. Expand + transform — project fields
-- ══════════════════════════════════════════════════════════

SELECT '--- 3. Expand items, project sku+total (10k rows) ---' as bench;

SELECT '  json_each + json_extract projection:' as method;
SELECT sum(json_extract(j.value, '$.qty') * json_extract(j.value, '$.price')) as total
FROM events, json_each(json_extract(events.data, '$.items')) j
WHERE events.id <= 10000;

SELECT '  jsonata_each with inline arithmetic:' as method;
SELECT sum(value) as total
FROM events, jsonata_each('items.(qty * price)', events.data)
WHERE events.id <= 10000;

-- ══════════════════════════════════════════════════════════
-- 4. Flatten + deduplicate tags
-- ══════════════════════════════════════════════════════════

SELECT '--- 4. Unique tags across 10k rows ---' as bench;

SELECT '  json_each + DISTINCT:' as method;
SELECT count(DISTINCT j.value) as n
FROM events, json_each(json_extract(events.data, '$.tags')) j
WHERE events.id <= 10000;

SELECT '  jsonata_each + DISTINCT:' as method;
SELECT count(DISTINCT value) as n
FROM events, jsonata_each('tags', events.data)
WHERE events.id <= 10000;

-- ══════════════════════════════════════════════════════════
-- 5. GROUP BY on expanded elements
-- ══════════════════════════════════════════════════════════

SELECT '--- 5. Count per tag (10k rows, GROUP BY on expanded) ---' as bench;

SELECT '  json_each + GROUP BY:' as method;
SELECT j.value as tag, count(*) as n
FROM events, json_each(json_extract(events.data, '$.tags')) j
WHERE events.id <= 10000
GROUP BY tag ORDER BY n DESC LIMIT 5;

SELECT '  jsonata_each + GROUP BY:' as method;
SELECT je.value as tag, count(*) as n
FROM events, jsonata_each('tags', events.data) je
WHERE events.id <= 10000
GROUP BY tag ORDER BY n DESC LIMIT 5;

-- ══════════════════════════════════════════════════════════
-- 6. Scale test — 50k rows, simple expand
-- ══════════════════════════════════════════════════════════

SELECT '--- 6. Full scan expand (50k rows) ---' as bench;

SELECT '  json_each:' as method;
SELECT count(*) as n FROM events, json_each(json_extract(events.data, '$.tags'));

SELECT '  jsonata_each:' as method;
SELECT count(*) as n FROM events, jsonata_each('tags', events.data);

SELECT '=== jsonata_each benchmarks complete ===' as info;
