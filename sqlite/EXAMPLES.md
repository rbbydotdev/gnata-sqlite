# Practical Examples

Real-world queries with benchmark comparisons against equivalent SQL. All benchmarks on 100k rows, Apple M4 Pro.

---

## Example 1: Filtered count

**Task**: Count how many events are purchases.

```sql
-- SQL
SELECT COUNT(*) FROM events
WHERE json_extract(data, '$.action') = 'purchase';

-- jsonata_query
SELECT jsonata_query(
  '$count($filter($, function($v){$v.action = "purchase"}))',
  data
) FROM events;
```

**Optimizer**: The `$filter($, fn)` pattern is decomposed into a per-row predicate. `$count` becomes a streaming counter that only increments when the predicate passes. O(1) memory.

| Method | Time | Scans |
|---|---|---|
| SQL | 32ms | 1 |
| jsonata_query | 42ms | 1 |

**Overhead**: 1.3x — the predicate evaluation via JSONata adds ~0.1 μs per row.

---

## Example 2: Dashboard report (the flagship query)

**Task**: Build a complete report object — purchase count, revenue, refunds, unique users, average purchase — in one query.

```sql
-- SQL: single scan with FILTER/CASE (the right way)
SELECT json_object(
  'purchases',    COUNT(*) FILTER (
                    WHERE json_extract(data, '$.action') = 'purchase'
                  ),
  'revenue',      SUM(
                    CASE WHEN json_extract(data, '$.action') = 'purchase'
                    THEN json_extract(data, '$.amount') END
                  ),
  'refunds',      SUM(
                    CASE WHEN json_extract(data, '$.action') = 'refund'
                    THEN json_extract(data, '$.amount') END
                  ),
  'users',        COUNT(DISTINCT json_extract(data, '$.user')),
  'avg_purchase', ROUND(AVG(
                    CASE WHEN json_extract(data, '$.action') = 'purchase'
                    THEN json_extract(data, '$.amount') END
                  ), 2)
) FROM events;

-- jsonata_query: same result, single expression
SELECT jsonata_query('{
  "purchases":    $count($filter($, function($v){$v.action = "purchase"})),
  "revenue":      $sum($filter($, function($v){$v.action = "purchase"}).amount),
  "refunds":      $sum($filter($, function($v){$v.action = "refund"}).amount),
  "users":        $count($distinct(user)),
  "avg_purchase":  $round($average($filter($, function($v){$v.action = "purchase"}).amount), 2)
}', data) FROM events;
```

**Optimizer**: 7 streaming accumulators run in parallel. The `action = "purchase"` predicate is shared across `purchases`, `revenue`, and `avg_purchase` — evaluated once per row, not three times. All field paths (`amount`, `user`, `action`) are extracted in a single `GetManyBytes` scan. Constants and `$round` are evaluated once at finalization.

| Method | Time | Scans | Memory |
|---|---|---|---|
| SQL (single-scan FILTER/CASE) | 84ms | 1 | O(1) |
| **jsonata_query** | **83ms** | **1** | **O(unique users)** |
| SQL (5 subqueries) | 150ms | 5 | O(1) |

Both single-scan approaches are neck and neck. The SQL version is perfectly valid — the FILTER clause has been available since SQLite 3.30.0 (2019). The difference is **readability**: the jsonata_query expression is a single declarative specification, while the SQL version scatters CASE/WHEN/THEN/END and FILTER clauses across every aggregate.

---

## Example 3: GROUP BY with filtered streaming

**Task**: Revenue per region, but only from purchase events.

```sql
-- SQL: filter in WHERE, group, aggregate
SELECT json_extract(data, '$.region') as region,
       sum(json_extract(data, '$.amount')) as total
FROM events
WHERE json_extract(data, '$.action') = 'purchase'
GROUP BY region;

-- jsonata_query: filter inside the aggregate expression
SELECT json_extract(data, '$.region') as region,
       jsonata_query(
         '$sum($filter($, function($v){$v.action = "purchase"}).amount)',
         data
       ) as total
FROM events
GROUP BY region;
```

**Optimizer**: Per group, a streaming `Sum` accumulator with a predicate filter. The predicate is evaluated per row; matching rows have their `amount` added to the running sum. O(1) memory per group.

| Method | Time | Notes |
|---|---|---|
| SQL | 51ms | Pre-filtered by WHERE, 1 scan |
| jsonata_query | 136ms | Filter inside aggregate, 1 scan |

SQL wins here because SQLite's WHERE clause eliminates rows before they reach the aggregate — 80k rows are skipped entirely. The jsonata_query version evaluates the predicate on all 100k rows. For GROUP BY with heavy filtering, **use SQL's WHERE for the coarse filter, jsonata_query for the aggregation**:

```sql
-- Best of both: SQL filters, jsonata aggregates
SELECT json_extract(data, '$.region') as region,
       jsonata_query('$sum(amount)', data) as total
FROM events
WHERE json_extract(data, '$.action') = 'purchase'
GROUP BY region;
```

---

## Example 4: Nested report object (9 aggregates)

**Task**: A structured report with summary, breakdown, and averages — all in nested objects.

```sql
SELECT jsonata_query('{
  "summary": {
    "total_events": $count($),
    "unique_users": $count($distinct(user)),
    "revenue":      $sum($filter($, function($v){$v.action = "purchase"}).amount)
  },
  "breakdown": {
    "purchases": $count($filter($, function($v){$v.action = "purchase"})),
    "refunds":   $count($filter($, function($v){$v.action = "refund"})),
    "logins":    $count($filter($, function($v){$v.action = "login"}))
  },
  "averages": {
    "purchase_avg": $round($average($filter($, function($v){$v.action = "purchase"}).amount), 2),
    "refund_avg":   $round($average($filter($, function($v){$v.action = "refund"}).amount), 2)
  }
}', data) FROM events;
```

Returns:
```json
{
  "summary":   {"total_events": 100000, "unique_users": 200, "revenue": 6808900},
  "breakdown": {"purchases": 20000, "refunds": 20000, "logins": 20000},
  "averages":  {"purchase_avg": 340.44, "refund_avg": -50.75}
}
```

**Optimizer**: 9 accumulators, 3 unique predicates (purchase/refund/login), nested object constructors decomposed recursively. The `action = "purchase"` predicate is shared across 4 accumulators (purchases count, revenue sum, purchase avg amount, and avg finalization). All streaming, O(unique users) memory.

| Method | Time | Notes |
|---|---|---|
| **jsonata_query** | **95ms** | 1 scan, 9 streaming accumulators, nested output |
| SQL single-scan (flat) | 102ms | 1 scan, 8 CASE/FILTER clauses, flat output only |

With 9 aggregates, batch field extraction starts to amortize — `jsonata_query` is slightly faster than the SQL equivalent. And the SQL version can only produce a flat `json_object(...)` — it can't nest `summary`, `breakdown`, and `averages` into separate objects without subqueries or a CTE wrapper.

---

## Example 5: Multi-metric array

**Task**: Get sum, max, min, average, and count as a JSON array.

```sql
-- jsonata_query
SELECT jsonata_query(
  '[$sum(amount), $max(amount), $min(amount), $average(amount), $count($)]',
  data
) FROM events;
-- Returns: [34181500, 683.63, 0, 341.815, 100000]

-- SQL equivalent
SELECT json_array(
  SUM(json_extract(data, '$.amount')),
  MAX(json_extract(data, '$.amount')),
  MIN(json_extract(data, '$.amount')),
  AVG(json_extract(data, '$.amount')),
  COUNT(*)
) FROM events;
```

**Optimizer**: Array constructor decomposed — each element is an independent streaming accumulator. All 5 share the same `amount` path extraction via a single batch scan. O(1) memory.

| Method | Time |
|---|---|
| **jsonata_query** | **51ms** |
| SQL (single scan, 4x json_extract) | 81ms |

Both do one scan, but `jsonata_query` extracts the `amount` field once per row via GJSON while SQL calls `json_extract` four times per row. The batch extraction advantage grows with the number of aggregates.

---

## Example 6: Per-row scalar filter

**Task**: Count rows matching a compound condition.

```sql
-- SQL
SELECT count(*) FROM events
WHERE json_extract(data, '$.amount') > 100
  AND json_extract(data, '$.region') = 'us-east';

-- jsonata (scalar function, not jsonata_query)
SELECT count(*) FROM events
WHERE jsonata('amount > 100 and region = "us-east"', data);
```

**Optimizer**: `jsonata()` (the scalar function) compiles and caches the expression, but evaluates the full JSONata AST per row. For simple comparisons, `json_extract` with SQL operators is faster.

| Method | Time |
|---|---|
| SQL | 36ms |
| jsonata (scalar) | 434ms |

**Recommendation**: For simple WHERE conditions, use `json_extract`. Use `jsonata()` in WHERE when you need JSONata's expressiveness — string functions, regex, nested array filtering — that SQL can't do:

```sql
-- jsonata shines for complex per-row logic
SELECT * FROM events
WHERE jsonata('$contains($lowercase(user), "admin") and amount > 0', data);
```

---

## Example 7: Simple streaming sum

**Task**: Sum a field across all rows.

```sql
-- SQL
SELECT sum(json_extract(data, '$.amount')) FROM events;

-- jsonata_query
SELECT jsonata_query('$sum(amount)', data) FROM events;
```

**Optimizer**: Single path, single accumulator, batch extraction (trivially — one path). The streaming sum adds each row's `amount` to a running float64. O(1) memory.

| Method | Time |
|---|---|
| SQL | 34ms |
| jsonata_query | 44ms |

**Overhead**: 1.3x — the irreducible cost of crossing the CGo boundary per row.

---

## Summary: when each function wins

| Scenario | Best function | Why |
|---|---|---|
| Simple field extraction | `json_extract` | Native C, zero overhead |
| Simple WHERE filter | `json_extract` + SQL operators | Native comparison |
| Complex WHERE filter | `jsonata()` scalar | String functions, regex, nested logic |
| Resilient extraction | `jsonata(expr, data, default)` | Handles dirty data without CASE |
| Simple array expand | `json_each` | Native C, 6x faster than jsonata_each |
| **Filter + expand** | **`jsonata_each`** | **Inline filter, one expression** |
| **Transform + expand** | **`jsonata_each`** | **Inline arithmetic, no post-processing** |
| Single aggregate | `jsonata_query` or SQL | Similar performance |
| **Multi-aggregate report** | **`jsonata_query`** | **Readable single expression, matches or beats SQL** |
| **Filtered aggregates** | **`jsonata_query`** | **Predicate sharing vs CASE/WHEN/FILTER verbosity** |
| **Nested JSON output** | **`jsonata_query`** | **SQL can't nest objects without subqueries** |
| Full-collection transform | `jsonata_query` | `$sort`, `$reduce`, `$map` across rows |
| Simple JSON mutation | `json_set` / `json_remove` | Native C, 5-7x faster |
| **Nested path creation** | **`jsonata_set`** | **Auto-creates intermediate objects** |
| Encoding / formatting | `$base64`, `$urlencode`, etc. | No SQL equivalent |

The sweet spot for `jsonata_query` is **multi-aggregate reports with filtered conditions**. At 5 aggregates it matches optimized single-scan SQL; at 9+ aggregates batch field extraction gives it an edge. The primary advantage is always readability — a single declarative expression vs scattered CASE/WHEN/FILTER/END clauses.

---

## Example 8: Expand arrays with jsonata_each

**Task**: Flatten tags from JSON rows into a tag frequency table.

```sql
-- SQL: json_each + GROUP BY
SELECT j.value as tag, count(*) as n
FROM events, json_each(json_extract(events.data, '$.tags')) j
GROUP BY tag ORDER BY n DESC LIMIT 5;

-- jsonata_each: same result, cleaner syntax
SELECT j.value as tag, count(*) as n
FROM events, jsonata_each('tags', events.data) j
GROUP BY tag ORDER BY n DESC LIMIT 5;
```

**jsonata_each shines** when you need inline filtering or transformation:

```sql
-- Expand only items with price > 100 — no post-filter needed
SELECT j.value, j.key
FROM orders, jsonata_each('items[price > 100]', orders.data) j;

-- Inline arithmetic: expand per-item revenue (qty * price)
SELECT sum(j.value) as total_revenue
FROM orders, jsonata_each('items.(qty * price)', orders.data) j;

-- With json_each, you'd need:
SELECT sum(json_extract(j.value, '$.qty') * json_extract(j.value, '$.price'))
FROM orders, json_each(json_extract(orders.data, '$.items')) j;
```

| Method | Time (10k rows) | Notes |
|---|---|---|
| `json_each` expand | 12ms | Native C, zero overhead |
| `jsonata_each` expand | 103ms | Full JSONata eval per row |
| `json_each` + filter | 27ms | Post-expansion filter |
| `jsonata_each` + inline filter | 452ms | Pre-expansion filter (more expressive) |

**Recommendation**: Use `json_each` for simple array expansion. Use `jsonata_each` when you need inline filtering, transformation, or nested path traversal that would require multiple `json_extract` calls.

---

## Example 9: Error-resilient extraction with default values

**Task**: Sum amounts from messy data where some rows have invalid values.

```sql
-- SQL: verbose CASE expression
SELECT sum(
  CASE WHEN typeof(json_extract(data, '$.amount')) = 'text'
       AND json_extract(data, '$.amount') GLOB '*[^0-9.]*'
  THEN 0
  ELSE CAST(json_extract(data, '$.amount') AS REAL)
  END
) as total FROM events;

-- jsonata with 3-arg default: clean and correct
SELECT sum(jsonata('$number(amount)', data, 0)) as total FROM events;
```

The 3-arg form catches both compile errors and evaluation errors:

```sql
-- Dynamic expressions from a config table — won't crash on bad expressions
SELECT e.id, jsonata(c.transform_expr, e.data, NULL) as result
FROM events e
CROSS JOIN config c;
```

| Method | Time (100k rows) |
|---|---|
| SQL CASE + GLOB | 92ms |
| jsonata 3-arg default | 241ms |

---

## Example 10: Format functions for data export

**Task**: Build CSV export rows, URL-encoded query strings, and base64 payloads.

```sql
-- CSV export: one row per event
SELECT jsonata('$csv([$string(id), user, action, $string(amount)])',
  json_object('id', e.id, 'user', json_extract(e.data, '$.user'),
              'action', json_extract(e.data, '$.action'),
              'amount', json_extract(e.data, '$.amount'))
) as csv_row
FROM events e LIMIT 5;
-- "1,user1,login,0"
-- "2,user2,purchase,1.37"
-- ...

-- URL-encoded query string
SELECT jsonata('"?user=" & $urlencode(user) & "&action=" & $urlencode(action)', data)
FROM events WHERE id = 1;
-- "?user=user1&action=login"

-- Base64 encode for API payloads
SELECT jsonata('$base64(email)', data) FROM users;

-- HTML-safe output
SELECT jsonata('$htmlescape(user_input)', data) FROM comments;
```

---

## Example 11: JSON mutation pipeline

**Task**: Sanitize JSON documents — add fields, strip internal data, modify nested values.

```sql
-- Add a 'processed' flag and strip internal IDs in one pipeline
SELECT jsonata_delete(
  jsonata_set(data, 'processed', 'true'),
  'internal_id'
) as clean_data
FROM events;

-- Modify nested fields
SELECT jsonata_set(data, 'user.preferences.theme', '"dark"') FROM users;

-- Create nested structure from flat data
SELECT jsonata_set(
  jsonata_set('{}', 'meta.source', '"import"'),
  'meta.timestamp',
  CAST(strftime('%s', 'now') AS TEXT)
) as envelope;
```

| Method | Time (10k rows) |
|---|---|
| `jsonata_set` | 75ms |
| `json_set` | 13ms |
| `jsonata_delete` | 54ms |
| `json_remove` | 8ms |

`jsonata_set`/`jsonata_delete` are slower than native `json_set`/`json_remove` due to full parse+serialize. Use native functions for simple operations; use gnata mutations when building complex pipelines or when the dotted-path syntax is cleaner.

---

## Combining SQL and jsonata_query

The best queries use SQL for what it's good at (indexing, coarse filtering, grouping) and jsonata_query for what it's good at (multi-aggregate streaming, JSON output shaping):

```sql
-- SQL does the indexed WHERE and GROUP BY
-- jsonata_query does the multi-aggregate report per group
SELECT
  json_extract(data, '$.region') as region,
  jsonata_query('{
    "orders":  $count($),
    "revenue": $sum(amount),
    "avg":     $round($average(amount), 2),
    "max":     $max(amount)
  }', data) as metrics
FROM events
WHERE json_extract(data, '$.action') = 'purchase'
  AND json_extract(data, '$.ts') > 1700050000
GROUP BY region;
```

SQL's WHERE eliminates rows before they reach jsonata_query. SQL's GROUP BY partitions rows. jsonata_query streams 4 accumulators per group in constant memory. Each part does what it's best at.
