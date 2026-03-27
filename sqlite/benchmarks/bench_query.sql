.load ./gnata_jsonata sqlite3_jsonata_init
.timer on
.headers on
.mode column

CREATE TABLE orders(data TEXT);
WITH RECURSIVE cnt(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM cnt WHERE x < 100000)
INSERT INTO orders SELECT json_object(
  'customer','user'||(x%100),
  'amount',ROUND((x%500)*1.37,2),
  'status', CASE x%5 WHEN 4 THEN 'refunded' ELSE 'completed' END
) FROM cnt;

SELECT '=== 100k rows ready ===' as info;

SELECT '--- jsonata_query: streaming accumulators ---' as method;
SELECT jsonata_query('{
  "total": $count($),
  "revenue": $sum($filter($, function($v){$v.status = "completed"}).amount),
  "refunds": $sum($filter($, function($v){$v.status = "refunded"}).amount),
  "avg": $round($average(amount), 2),
  "customers": $count($distinct(customer))
}', data) as report FROM orders;

SELECT '--- SQL: 5 subqueries (5 scans) ---' as method;
SELECT json_object(
  'total', (SELECT count(*) FROM orders),
  'revenue', (SELECT sum(json_extract(data, '$.amount')) FROM orders WHERE json_extract(data, '$.status')='completed'),
  'refunds', (SELECT sum(json_extract(data, '$.amount')) FROM orders WHERE json_extract(data, '$.status')='refunded'),
  'avg', (SELECT round(avg(json_extract(data, '$.amount')),2) FROM orders),
  'customers', (SELECT count(distinct json_extract(data, '$.customer')) FROM orders)
) as report;

SELECT '--- SQL: single-scan (FILTER + CASE) ---' as method;
SELECT json_object(
  'total',     COUNT(*),
  'revenue',   SUM(CASE WHEN json_extract(data, '$.status') = 'completed' THEN json_extract(data, '$.amount') END),
  'refunds',   SUM(CASE WHEN json_extract(data, '$.status') = 'refunded' THEN json_extract(data, '$.amount') END),
  'avg',       ROUND(AVG(json_extract(data, '$.amount')), 2),
  'customers', COUNT(DISTINCT json_extract(data, '$.customer'))
) as report FROM orders;

SELECT '=== Done ===' as info;
