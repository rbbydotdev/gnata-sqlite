# Writing Fast jsonata_query Expressions

`jsonata_query` decomposes your JSONata expression into streaming accumulators at compile time. When it can decompose, it processes rows in **constant memory** with a single table scan. When it can't, it falls back to accumulating all rows — which still works, just uses more memory.

This guide explains what the optimizer recognizes and how to write expressions that stay on the fast path.

## How it works

When you write:

```sql
SELECT jsonata_query('{
  "revenue": $sum($filter($, function($v){$v.status = "completed"}).amount),
  "count":   $count($),
  "label":   "Q1"
}', data) FROM orders;
```

The planner decomposes this into:

```
Paths (extracted once per row via GJSON batch scan):
  [0] "amount"
  [1] "customer"

Predicates (evaluated once per row, shared across accumulators):
  [0] status = "completed"

Accumulators (updated per row, O(1) memory each):
  acc[0] = Sum(path[0], pred[0])     → revenue
  acc[1] = Count()                   → count

Constants (no per-row work):
  "Q1"                               → label

Final assembly (evaluated once after all rows):
  {"revenue": acc[0], "count": acc[1], "label": "Q1"}
```

One scan. One GJSON parse. O(1) memory. The expression is the specification; the planner builds the execution.

## Patterns that stream (O(1) memory)

These patterns are detected at compile time and never accumulate rows:

### Simple aggregates

```sql
jsonata_query('$sum(amount)', data)
jsonata_query('$count($)', data)
jsonata_query('$max(price)', data)
jsonata_query('$min(price)', data)
jsonata_query('$average(score)', data)
```

### Filtered aggregates (ClickHouse sumIf pattern)

```sql
-- Revenue from completed orders only
jsonata_query('$sum($filter($, function($v){$v.status = "completed"}).amount)', data)

-- Count of purchases
jsonata_query('$count($filter($, function($v){$v.action = "purchase"}))', data)
```

The `$filter($, function($v){...})` pattern is recognized and converted to a per-row predicate. The predicate is evaluated once per row even if multiple accumulators share it.

### Count distinct

```sql
jsonata_query('$count($distinct(region))', data)
```

Uses a hash set — O(unique values) memory, not O(rows).

### Object constructors with multiple accumulators

```sql
jsonata_query('{
  "total":   $count($),
  "revenue": $sum(amount),
  "biggest": $max(amount),
  "avg":     $average(amount)
}', data)
```

All fields are extracted in a single GJSON batch scan. Each accumulator streams independently.

### Nested objects

```sql
jsonata_query('{
  "summary": {
    "total":   $count($),
    "revenue": $sum(amount)
  },
  "meta": {
    "label": "Q1 Report"
  }
}', data)
```

Inner objects are decomposed recursively.

### Array constructors

```sql
jsonata_query('[$sum(x), $max(x), $min(x), $average(x)]', data)
```

Each element is analyzed independently.

### Post-aggregate arithmetic

```sql
-- Net revenue = gross - refunds (both stream, subtract happens once at the end)
jsonata_query(
  '$sum($filter($, function($v){$v.status = "completed"}).amount)
   - $sum($filter($, function($v){$v.status = "refunded"}).amount)',
  data
)
```

Both `$sum` calls are streaming accumulators. The subtraction is evaluated once after all rows are processed.

### Finalizer functions

```sql
jsonata_query('$round($average(amount), 2)', data)
jsonata_query('$floor($sum(amount))', data)
jsonata_query('$string($count($))', data)
```

The inner aggregate streams; the outer function (`$round`, `$floor`, `$ceil`, `$abs`, `$sqrt`, `$string`, `$number`) is applied once to the final result.

### Constant folding

```sql
-- $sum(amount * 1.1) is rewritten to $sum(amount) * 1.1
jsonata_query('$sum(amount * 1.1)', data)

-- $sum(amount + 5) is rewritten to $sum(amount) + 5 * $count($)
jsonata_query('$sum(amount + 5)', data)
```

When an aggregate's argument is `path * constant` or `path + constant`, the constant is factored out. The aggregate streams over the raw field, and the constant arithmetic happens once at the end.

### Constants

```sql
jsonata_query('{
  "label": "Q1 Report",
  "version": 2,
  "total": $sum(amount)
}', data)
```

`"Q1 Report"` and `2` are constant-folded. No per-row work for those keys.

## Patterns that accumulate (O(n) memory)

These require all rows in memory. They still work — the planner falls back gracefully — but they're slower on large datasets.

### $sort across rows

```sql
-- Needs all rows to sort
jsonata_query('$sort($, function($a,$b){$a.amount > $b.amount})', data)
```

**Tip**: If you only need the top N, consider filtering in SQL first:
```sql
SELECT jsonata_query('$sort($, function($a,$b){$a.amount > $b.amount})[0..4]', data)
FROM orders
WHERE amount > (SELECT amount FROM orders ORDER BY amount DESC LIMIT 1 OFFSET 5)
```

### $reduce with cross-row state

```sql
-- Each step depends on all previous rows
jsonata_query('$reduce($, function($a,$v){ ... }, init)', data)
```

### $map returning arrays

```sql
-- Transforms every row — output is O(n)
jsonata_query('$map($, function($v){ $v.name & ": " & $string($v.amount) })', data)
```

### Complex nested expressions

```sql
-- Variable bindings, nested lambdas, grouped transforms
jsonata_query('($x := $sum(amount); $map($, function($v){$v.amount / $x}))', data)
```

## Mixed mode: streaming + opaque in one expression

When some keys stream and others can't, only the opaque keys pay the O(n) cost:

```sql
jsonata_query('{
  "total":     $sum(amount),           -- streams: O(1)
  "avg":       $average(amount),       -- streams: O(1)
  "top_5":     $sort($, fn)[0..4]      -- accumulates: O(n)
}', data)
```

The `total` and `avg` accumulators stream in constant memory. Only `top_5` accumulates rows. The streaming accumulators don't pay for the opaque key's memory.

## Predicate sharing

When multiple accumulators use the same filter, the predicate is evaluated **once per row**:

```sql
jsonata_query('{
  "revenue":   $sum($filter($, function($v){$v.status = "completed"}).amount),
  "avg_order": $average($filter($, function($v){$v.status = "completed"}).amount)
}', data)
```

Both `revenue` and `avg_order` filter on `status = "completed"`. The planner deduplicates the predicate — it's evaluated once per row, and both accumulators see the same boolean result.

**Write identical predicates** when filtering for the same condition. Don't rephrase:
```sql
-- Good: identical predicate text → shared
$filter($, function($v){$v.status = "completed"})
$filter($, function($v){$v.status = "completed"})

-- Bad: different text, same meaning → evaluated twice
$filter($, function($v){$v.status = "completed"})
$filter($, function($row){$row.status = "completed"})  -- different param name
```

## Common subexpression elimination

Identical accumulators are deduplicated. If `$sum(amount)` appears in both `revenue` and `net_revenue`, it compiles to one accumulator referenced twice:

```sql
jsonata_query('{
  "revenue": $sum(amount),
  "net":     $sum(amount) - $sum(refund_amount)
}', data)
-- $sum(amount) is computed once, used in both "revenue" and "net"
```

## Performance comparison (100k rows, 5-aggregate dashboard)

| Method | Time | Memory | Notes |
|---|---|---|---|
| `jsonata_query` (streaming) | **83ms** | O(unique users) | Batch GJSON + predicate sharing |
| SQL (single-scan FILTER/CASE) | **84ms** | O(1) | 1 scan, verbose CASE/WHEN/FILTER |
| SQL (5 subqueries) | 150ms | O(1) | 5 separate table scans |
| `jsonata_query` (accumulate) | 439ms | O(n) | Buffers all rows |

`jsonata_query` matches optimized single-scan SQL. Both do one scan — the performance is equivalent because batch GJSON extraction offsets the CGo overhead. The advantage is **readability**: a single declarative expression vs 5 CASE/WHEN/THEN/END clauses.

At higher aggregate counts (9+), batch field extraction gives `jsonata_query` an edge (~95ms vs ~102ms) because SQL must call `json_extract` separately for each aggregate while GJSON extracts all fields in one pass.

## Internal optimizations

These are applied automatically by the planner. Understanding them helps you write expressions that benefit from them.

### Batch field extraction (DuckDB JSON shredding)

The planner collects all unique GJSON paths at compile time. Per row, `gjson.GetManyBytes` extracts every needed field in a **single JSON scan**. Without this, 5 accumulators would mean 5 separate scans of the same JSON string.

**Impact**: 4.8x speedup on the 5-aggregate report benchmark (349ms → 83ms).

### Predicate sharing (ClickHouse -If combinator)

Identical predicates are deduplicated at plan time. Each unique predicate is evaluated once per row. Multiple accumulators referencing the same predicate share the boolean result.

**Impact**: Halves predicate evaluation cost when `revenue` and `avg_order` both filter on the same condition.

### Common subexpression elimination (Postgres Aggref dedup)

Identical accumulators — same kind, same path, same predicate — compile to one accumulator referenced multiple times. `$sum(amount)` appearing in 3 places runs one accumulator, not three.

### Constant folding (Spark Catalyst)

Algebraic identities move constant factors out of per-row computation:
- `sum(x * c) = sum(x) * c` — multiplication applied once at finalization
- `sum(x + c) = sum(x) + c * count` — addition factored via count

This converts opaque expressions into streamable ones.

### Mixed-mode partial fallback (Postgres per-aggregate strategy)

When streaming and opaque patterns coexist in one expression, only the opaque subtrees accumulate rows. Streaming accumulators run in O(1) regardless. The planner doesn't give up on an entire expression because one key is expensive.

### Top-K heap accumulator (MongoDB $sort + $limit coalescence)

When the planner detects a sort followed by a bounded slice, it can use a min-heap of size K instead of accumulating all rows. O(K) memory, O(n log K) time.

## When to use each function

| Function | Use for | Memory |
|---|---|---|
| `jsonata(expr, data)` | Per-row transforms, WHERE filters | O(1) per row |
| `jsonata(expr, data, default)` | Resilient extraction from messy data | O(1) per row |
| `jsonata_query(expr, data)` | Aggregates: simple streaming, multi-aggregate reports, filtered | O(1) when streamable |
| `jsonata_each(expr, data)` | Expand arrays/objects into rows (FROM clause) | O(result size) |
| `jsonata_set(json, path, val)` | Modify JSON documents | O(doc size) |
| `jsonata_delete(json, path)` | Remove fields from JSON documents | O(doc size) |

`jsonata_query` handles everything from simple `$sum(path)` to complex multi-aggregate reports with filtered conditions, streaming optimization, and nested JSON output.

## Format functions and the fast path

Format functions (`$base64`, `$urlencode`, `$csv`, `$tsv`, `$htmlescape`, `$base64decode`, `$urldecode`) are available inside all JSONata expressions. However, expressions using them cannot use the GJSON fast path — they require full JSONata evaluation.

```sql
-- Fast path: simple path, ~0.25 μs/row
jsonata('amount', data)

-- Full eval: format function, ~8-18 μs/row
jsonata('$base64(email)', data)
jsonata('$urlencode(name)', data)
```

For bulk operations, consider whether you can use SQL's built-in functions instead:

```sql
-- Prefer this for simple encoding (if your SQLite has base64 support):
SELECT hex(email) FROM users;

-- Use jsonata format functions when you need JSONata expressiveness:
SELECT jsonata('$base64(first_name & " " & last_name)', data) FROM users;
```

## jsonata_each vs json_each

`jsonata_each` evaluates a full JSONata expression per row, which is slower than `json_each` for simple array expansion:

| Pattern | Use `json_each` | Use `jsonata_each` |
|---|---|---|
| Simple expand: `$.items` | yes — 6x faster | no |
| Filter + expand: `items[price > 100]` | no — requires post-filter | yes — inline filter |
| Transform + expand: `items.(qty * price)` | no — requires post-transform | yes — inline arithmetic |
| Nested path: `departments.teams.members` | no — needs multiple json_extract | yes — one expression |

**Tip**: When expanding large arrays at scale, use `json_each(jsonata(...))` to get the best of both — JSONata for the expression, `json_each` for the expansion:

```sql
-- jsonata does the filter, json_each does the expansion (native C speed)
SELECT j.value FROM events,
  json_each(jsonata('items[price > 100]', events.data)) j;
```

## Mutation functions: jsonata_set vs json_set

`jsonata_set` and `jsonata_delete` parse and re-serialize the entire JSON document. For simple operations, native `json_set`/`json_remove` are 5-7x faster:

```sql
-- Prefer json_set for simple paths:
SELECT json_set(data, '$.status', 'done') FROM events;

-- Use jsonata_set when you need dotted-path creation:
SELECT jsonata_set(data, 'meta.source.type', '"import"') FROM events;
-- Creates intermediate objects automatically
```

## Quick reference: what streams

| Expression | Streams? | Why |
|---|---|---|
| `$sum(amount)` | yes | Simple path accumulator |
| `$sum(amount * 1.1)` | yes | Constant folded to `$sum(amount) * 1.1` |
| `$sum($filter($, fn).amount)` | yes | Predicate + conditional accumulator |
| `$count($distinct(region))` | yes | Hash set, O(unique) memory |
| `{ "a": $sum(x), "b": $max(y) }` | yes | Parallel accumulators, batch extraction |
| `{ "a": { "b": $sum(x) } }` | yes | Nested object decomposition |
| `[$sum(x), $max(x)]` | yes | Array element decomposition |
| `$round($average(x), 2)` | yes | Finalizer on streaming avg |
| `$sum(x) - $count($)` | yes | Post-aggregate arithmetic |
| `"Q1 Report"` | yes | Constant, zero per-row cost |
| `{ "enc": $base64("val") }` | mixed | Format function → opaque subtree, other keys stream |
| `$sort(...)` | no | Needs all data to sort |
| `$reduce($, fn, init)` | no | Cross-row state dependency |
| `$map($, fn)` | no | Output is O(n) |
