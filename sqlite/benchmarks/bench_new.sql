-- Benchmark: new functions — format, try/default, set/delete
.load ./gnata_jsonata sqlite3_jsonata_init
.timer on
.headers on
.mode column

-- ══════════════════════════════════════════════════════════
-- Setup: 100k rows
-- ══════════════════════════════════════════════════════════

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
) FROM cnt;

SELECT '=== 100k rows ready ===' as info;

-- ══════════════════════════════════════════════════════════
-- 1. $base64 encode — per-row
-- ══════════════════════════════════════════════════════════

SELECT '--- 1. $base64 encode (10k rows) ---' as bench;

SELECT '  jsonata $base64:' as method;
SELECT count(*) as n FROM events
WHERE id <= 10000
  AND length(jsonata('$base64(payload)', data)) > 0;

-- ══════════════════════════════════════════════════════════
-- 2. $urlencode — build query string
-- ══════════════════════════════════════════════════════════

SELECT '--- 2. $urlencode (10k rows) ---' as bench;

SELECT '  jsonata $urlencode:' as method;
SELECT count(*) as n FROM events
WHERE id <= 10000
  AND length(jsonata('$urlencode(email)', data)) > 0;

-- ══════════════════════════════════════════════════════════
-- 3. $htmlescape — sanitize HTML
-- ══════════════════════════════════════════════════════════

SELECT '--- 3. $htmlescape (10k rows) ---' as bench;

SELECT '  jsonata $htmlescape:' as method;
SELECT count(*) as n FROM events
WHERE id <= 10000
  AND length(jsonata('$htmlescape(html_content)', data)) > 0;

-- ══════════════════════════════════════════════════════════
-- 4. $csv format — build CSV row
-- ══════════════════════════════════════════════════════════

SELECT '--- 4. $csv format (10k rows) ---' as bench;

SELECT '  jsonata $csv:' as method;
SELECT count(*) as n FROM events
WHERE id <= 10000
  AND length(jsonata('$csv([user, email, action])', data)) > 0;

-- ══════════════════════════════════════════════════════════
-- 5. $try / default — resilient extraction
-- ══════════════════════════════════════════════════════════

SELECT '--- 5. $try pattern (100k rows, ~14k have invalid amounts) ---' as bench;

SELECT '  jsonata with default (3-arg):' as method;
SELECT sum(jsonata('$number(amount)', data, 0)) as total FROM events;

SELECT '  json_extract + CASE fallback:' as method;
SELECT sum(
  CASE WHEN typeof(json_extract(data, '$.amount')) = 'text'
       AND json_extract(data, '$.amount') GLOB '*[^0-9.]*'
  THEN 0
  ELSE CAST(json_extract(data, '$.amount') AS REAL)
  END
) as total FROM events;

-- ══════════════════════════════════════════════════════════
-- 6. jsonata_set — modify JSON documents
-- ══════════════════════════════════════════════════════════

SELECT '--- 6. jsonata_set (10k rows) ---' as bench;

SELECT '  jsonata_set:' as method;
SELECT count(*) as n FROM (
  SELECT jsonata_set(data, 'processed', 'true') as modified
  FROM events WHERE id <= 10000
) WHERE length(modified) > 0;

SELECT '  json_set equivalent:' as method;
SELECT count(*) as n FROM (
  SELECT json_set(data, '$.processed', 1) as modified
  FROM events WHERE id <= 10000
) WHERE length(modified) > 0;

-- ══════════════════════════════════════════════════════════
-- 7. jsonata_delete — strip fields
-- ══════════════════════════════════════════════════════════

SELECT '--- 7. jsonata_delete (10k rows) ---' as bench;

SELECT '  jsonata_delete:' as method;
SELECT count(*) as n FROM (
  SELECT jsonata_delete(data, 'internal_id') as cleaned
  FROM events WHERE id <= 10000
) WHERE length(cleaned) > 0;

SELECT '  json_remove equivalent:' as method;
SELECT count(*) as n FROM (
  SELECT json_remove(data, '$.internal_id') as cleaned
  FROM events WHERE id <= 10000
) WHERE length(cleaned) > 0;

-- ══════════════════════════════════════════════════════════
-- 8. Combined: format functions in jsonata_query
-- ══════════════════════════════════════════════════════════

SELECT '--- 8. Format functions in aggregate context (1k rows) ---' as bench;

SELECT '  jsonata_query with $base64 in expression:' as method;
SELECT jsonata_query('$count($filter($, function($v){ $base64($v.user) != "" }))', data) as n
FROM events WHERE id <= 1000;

SELECT '=== New feature benchmarks complete ===' as info;
