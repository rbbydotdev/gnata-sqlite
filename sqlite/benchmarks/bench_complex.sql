-- Complex benchmarks: jsonata_query vs equivalent SQL (where possible)
.load ./gnata_jsonata sqlite3_jsonata_init
.timer on
.headers on
.mode column

-- ══════════════════════════════════════════════════════════
-- Setup: 50k realistic event rows
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
  'amount', CASE x % 5
    WHEN 4 THEN -ROUND((x % 200) * 0.5, 2)
    WHEN 0 THEN 0 WHEN 2 THEN 0 WHEN 3 THEN 0
    ELSE ROUND((x % 500) * 1.37, 2) END,
  'region', CASE x % 4
    WHEN 0 THEN 'us-east' WHEN 1 THEN 'us-west'
    WHEN 2 THEN 'eu-west' WHEN 3 THEN 'ap-south' END,
  'ts', 1700000000 + x,
  'tags', json_array('tag' || (x % 8), 'tag' || ((x * 3) % 8))
) FROM cnt;

SELECT '=== 50k rows ready ===' as info;

-- ══════════════════════════════════════════════════════════
-- 1. COUNT DISTINCT — unique users
-- ══════════════════════════════════════════════════════════

SELECT '--- 1. Unique user count (50k rows) ---' as bench;

SELECT '  SQL: COUNT(DISTINCT json_extract)' as method;
SELECT COUNT(DISTINCT json_extract(data, '$.user')) as n FROM events;

SELECT '  jsonata_query: $count($distinct(user))' as method;
SELECT jsonata_query('$count($distinct(user))', data) as n FROM events;

-- ══════════════════════════════════════════════════════════
-- 2. GROUP BY + SUM — per-region revenue
-- ══════════════════════════════════════════════════════════

SELECT '--- 2. Per-region revenue (50k rows, streaming) ---' as bench;

SELECT '  SQL: GROUP BY + SUM + json_extract' as method;
SELECT json_extract(data, '$.region') as region,
       sum(json_extract(data, '$.amount')) as revenue
FROM events WHERE json_extract(data, '$.action') = 'purchase'
GROUP BY region;

SELECT '  jsonata_query: $sum(amount) GROUP BY' as method;
SELECT json_extract(data, '$.region') as region,
       jsonata_query('$sum(amount)', data) as revenue
FROM events WHERE json_extract(data, '$.action') = 'purchase'
GROUP BY region;

-- ══════════════════════════════════════════════════════════
-- 3. TOP N — top 5 users by total spend
-- ══════════════════════════════════════════════════════════

SELECT '--- 3. Top 5 users by spend (10k rows) ---' as bench;

SELECT '  SQL: GROUP BY + ORDER BY + LIMIT' as method;
SELECT json_extract(data, '$.user') as user,
       sum(json_extract(data, '$.amount')) as total
FROM events WHERE json_extract(data, '$.action') = 'purchase' AND id <= 10000
GROUP BY user ORDER BY total DESC LIMIT 5;

SELECT '  jsonata_query: $sort + slice (accumulate)' as method;
SELECT jsonata_query('
  $sort($, function($a,$b){ $a.amount > $b.amount })[-5:].{"user": user, "amount": amount}
', data) FROM events
WHERE json_extract(data, '$.action') = 'purchase' AND id <= 10000;

-- ══════════════════════════════════════════════════════════
-- 4. FLATTEN + DEDUPLICATE — unique tags across rows
-- ══════════════════════════════════════════════════════════

SELECT '--- 4. Flatten + deduplicate tags (10k rows) ---' as bench;

SELECT '  SQL: json_each + DISTINCT (requires join)' as method;
SELECT COUNT(*) as unique_tags FROM (
  SELECT DISTINCT j.value
  FROM events, json_each(json_extract(events.data, '$.tags')) as j
  WHERE events.id <= 10000
);

SELECT '  jsonata_query: $distinct(tags)' as method;
SELECT jsonata_query(
  '$count($distinct($reduce($, function($a,$v){ $append($a, $v.tags) }, [])))',
  data
) as unique_tags FROM events WHERE id <= 10000;

-- ══════════════════════════════════════════════════════════
-- 5. SESSIONIZE — per-user action timeline, sorted by time
-- ══════════════════════════════════════════════════════════

SELECT '--- 5. User journeys (5k rows, 100 users) ---' as bench;

SELECT '  SQL: subquery ORDER BY + group_concat' as method;
SELECT user, journey FROM (
  SELECT json_extract(data, '$.user') as user,
         group_concat(json_extract(data, '$.action'), ' > ') as journey
  FROM (SELECT data FROM events WHERE id <= 5000 ORDER BY json_extract(data, '$.ts'))
  GROUP BY user
) LIMIT 5;

SELECT '  jsonata_query: $sort + $join (accumulate)' as method;
SELECT json_extract(data, '$.user') as user,
       jsonata_query('$join($sort($, function($a,$b){$a.ts > $b.ts}).action, " > ")', data) as journey
FROM events WHERE id <= 5000
GROUP BY user LIMIT 5;

-- ══════════════════════════════════════════════════════════
-- 6. BUILD REPORT — single JSON object from many rows
-- ══════════════════════════════════════════════════════════

SELECT '--- 6. Build report object (10k rows) ---' as bench;

SELECT '  SQL: 4 subqueries' as method;
SELECT json_object(
  'total_events', (SELECT count(*) FROM events WHERE id <= 10000),
  'revenue', (SELECT sum(json_extract(data, '$.amount'))
              FROM events WHERE id <= 10000 AND json_extract(data, '$.action') = 'purchase'),
  'unique_users', (SELECT COUNT(DISTINCT json_extract(data, '$.user')) FROM events WHERE id <= 10000),
  'avg_purchase', (SELECT avg(json_extract(data, '$.amount'))
                   FROM events WHERE id <= 10000 AND json_extract(data, '$.action') = 'purchase')
) as report;

SELECT '  jsonata_query: single expression (accumulate)' as method;
SELECT jsonata_query('{
  "total_events": $count($),
  "revenue": $sum($filter($, function($v){ $v.action = "purchase" }).amount),
  "unique_users": $count($distinct(user)),
  "avg_purchase": $average($filter($, function($v){ $v.action = "purchase" }).amount)
}', data) as report FROM events WHERE id <= 10000;

-- ══════════════════════════════════════════════════════════
-- 7. HISTOGRAM — bucket amounts
-- ══════════════════════════════════════════════════════════

SELECT '--- 7. Amount histogram (10k purchase rows) ---' as bench;

SELECT '  SQL: CASE + GROUP BY + COUNT' as method;
SELECT
  CASE
    WHEN json_extract(data, '$.amount') <= 100 THEN '0-100'
    WHEN json_extract(data, '$.amount') <= 300 THEN '100-300'
    WHEN json_extract(data, '$.amount') <= 500 THEN '300-500'
    ELSE '500+'
  END as bucket,
  count(*) as n
FROM events
WHERE json_extract(data, '$.action') = 'purchase' AND id <= 10000
GROUP BY bucket ORDER BY bucket;

SELECT '  jsonata_query: inline bucketing (accumulate)' as method;
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
', data) FROM events
WHERE json_extract(data, '$.action') = 'purchase' AND id <= 10000;

-- ══════════════════════════════════════════════════════════
-- 8. STREAMING at scale — 50k rows, O(1) memory
-- ══════════════════════════════════════════════════════════

SELECT '--- 8. Streaming $sum at scale (50k rows) ---' as bench;

SELECT '  SQL: sum(json_extract)' as method;
SELECT sum(json_extract(data, '$.amount')) as total FROM events;

SELECT '  jsonata_query: $sum(amount) streaming' as method;
SELECT jsonata_query('$sum(amount)', data) as total FROM events;

SELECT '=== All benchmarks complete ===' as info;
