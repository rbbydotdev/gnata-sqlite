# A JSONata Query Planner Inside SQLite (That Matches Raw SQL)

It started with a question: can you query JSON inside SQLite using JSONata instead of `json_extract`? The answer turned into a streaming aggregate query planner that decomposes JSONata expressions into parallel accumulators — and it matches or beats native SQL on complex queries, while being dramatically more readable.

Here's how it got there, step by step, with benchmarks at each stage.

## The starting point: gnata

[gnata](https://github.com/rbbydotdev/gnata-sqlite) is a pure-Go implementation of JSONata 2.x — the JSON query and transformation language. Think jq meets XPath with lambda functions. It passes all 1,778 test cases from the official JSONata test suite, has a zero-copy GJSON fast path for simple field lookups, and ships with a single external dependency.

The question was: can this be brought into SQLite as a loadable extension?

## Step 1: A scalar function (jsonata)

The first version was straightforward. A Go shared library built with `-buildmode=c-shared` that registers a `jsonata(expression, json_data)` scalar function:

```sql
.load ./gnata_jsonata sqlite3_jsonata_init

SELECT jsonata('Account.Name', data) FROM events;
SELECT jsonata('$uppercase(name)', data) FROM users;
SELECT jsonata('items[price > 100].name', data) FROM orders;
```

The implementation is ~200 lines of Go + a thin C bridge for SQLite's loadable extension API. Expressions are compiled once and cached for reuse across rows.

### Benchmark: jsonata vs json_extract (100k rows)

| Operation | json_extract | jsonata | Overhead |
|---|---|---|---|
| Simple field access | 38ms | 62ms | 1.6x |
| Nested path | 41ms | 69ms | 1.7x |
| Numeric aggregation | 43ms | 55ms | 1.3x |
| Multi-field (3 fields) | 42ms | 83ms | 2.0x |

About **0.25 μs per row** overhead — the CGo boundary crossing plus JSONata compilation. For a scalar function, this is fine. But there's more to JSONata than per-row evaluation.

## Step 2: An aggregate function (jsonata_query)

SQL's `json_extract` is per-row. But JSONata's real power is transformations across collections — `$sum`, `$filter`, `$sort`, `$reduce`. This called for an aggregate function that treats all rows in a group as an array.

```sql
SELECT jsonata_query('$sum(amount)', data) FROM orders;
SELECT jsonata_query('$count($distinct(region))', data) FROM events;
```

The naive implementation accumulates all rows in memory, then runs the JSONata expression on the full array in `xFinal`. This works but it's O(n) memory.

A streaming optimization detects simple patterns like `$sum(path)` at compile time and replaces them with a running accumulator — O(1) memory, never buffers rows.

| Pattern | Memory | Detection |
|---|---|---|
| `$sum(path)` | O(1) | String pattern match |
| `$count()` | O(1) | String pattern match |
| `$max(path)` | O(1) | String pattern match |
| Everything else | O(n) | Falls back to accumulate |

### Benchmark: jsonata_query streaming vs SQL (100k rows)

| Operation | SQL | jsonata_query (streaming) | Ratio |
|---|---|---|---|
| SUM | 32ms | 43ms | 1.3x |
| MAX | 32ms | 42ms | 1.3x |
| AVERAGE | 32ms | 43ms | 1.3x |
| GROUP BY SUM | 93ms | 105ms | 1.1x |

Streaming aggregates are within **1.1-1.3x** of native SQL. But complex expressions — the interesting ones — still fall back to O(n) accumulation.

## Step 3: The problem with complex expressions

The expression that should be possible to run:

```sql
SELECT jsonata_query('{
  "revenue":  $sum($filter($, function($v){$v.status = "completed"}).amount),
  "refunds":  $sum($filter($, function($v){$v.status = "refunded"}).amount),
  "net":      $sum(...) - $sum(...),
  "avg":      $round($average(amount), 2),
  "customers": $count($distinct(customer))
}', data) FROM orders;
```

This is a report — multiple aggregations with different filters, derived values, constants — all in one expression. The string pattern matcher can't handle it. Every row gets accumulated in memory. On 100k rows: **430ms** and O(100k) memory.

The naive SQL approach uses 5 subqueries (5 table scans, **150ms**). But a savvy SQL writer would use `FILTER`/`CASE` for a single scan:

```sql
SELECT json_object(
  'revenue',   SUM(CASE WHEN json_extract(data, '$.status') = 'completed'
                   THEN json_extract(data, '$.amount') END),
  'refunds',   SUM(CASE WHEN json_extract(data, '$.status') = 'refunded'
                   THEN json_extract(data, '$.amount') END),
  'avg',       ROUND(AVG(json_extract(data, '$.amount')), 2),
  'customers', COUNT(DISTINCT json_extract(data, '$.customer'))
) FROM orders;
```

This runs in **~84ms** with O(1) memory and a single scan. Fast, but verbose — and it only gets worse with more aggregates.

The goal: the ergonomics of the JSONata expression with performance that could match this.

## Step 4: A query planner (jsonata_query)

Three database engines informed the design:

**Postgres** breaks aggregation into fundamental building blocks: `sfunc` (state transition per row), `finalfunc` (compute result from accumulated state), and `Aggref` (references to aggregate results within larger expressions). Post-aggregate arithmetic lives in a separate `Project` node — it doesn't run per row.

**Spark Catalyst** lifts aggregate expressions out of the target list, deduplicates identical aggregates (common subexpression elimination), and separates per-row accumulation from finalization.

**ClickHouse** has the `-If` combinator — `sumIf(amount, status = 'completed')` — which evaluates a predicate per row and conditionally accumulates, all in a single table scan.

All three ideas were applied to build `jsonata_query`:

### The decomposition

The planner walks the JSONata AST and classifies every node:

- **CONSTANT** — `"Q1 Report"`, `42` → evaluated once, no per-row work
- **ACCUMULATOR** — `$sum(path)`, `$count()` → streaming reducer, O(1) memory
- **FILTERED ACCUMULATOR** — `$sum($filter($, fn).path)` → per-row predicate + conditional accumulation
- **DERIVED** — `$sum(x) - $count($)` → arithmetic over accumulator results, evaluated once in xFinal
- **OPAQUE** — `$sort(...)`, `$reduce(...)` → falls back to row accumulation for that subtree only

The report expression decomposes into:

```
Accumulators (streaming, O(1) each):
  acc[0] = Sum(path="amount", pred="status = 'completed'")
  acc[1] = Sum(path="amount", pred="status = 'refunded'")
  acc[2] = Count()
  acc[3] = Average(path="amount")
  acc[4] = CountDistinct(path="customer")

Constants:
  "Revenue Report"

Final tree (evaluated once after all rows):
  {
    "title":     constant("Revenue Report"),
    "revenue":   acc[0],
    "refunds":   acc[1],
    "net":       acc[0] - acc[1],
    "avg":       round(acc[3], 2),
    "customers": acc[4]
  }
```

CSE deduplication: `$sum($filter($, fn).amount)` appears in both `revenue` and `net`, but compiles to one accumulator referenced twice.

Predicate sharing: `status = "completed"` is evaluated once per row even though `revenue` and another potential accumulator both reference it.

### First benchmark: planner v1

| Method | Time | Memory |
|---|---|---|
| SQL (5 subqueries) | 128ms | O(1) |
| jsonata_query v1 | 349ms | O(unique) |
| jsonata_query (accumulate) | 430ms | O(100k) |

Better than accumulation, but still 2.7x slower than SQL. The bottleneck: each accumulator independently called `EvalBytes` to extract its field value — 5 accumulators meant 5 separate GJSON scans of the same JSON string per row.

## Step 5: Batch extraction and the tricks that made it fast

Three more optimizations from the research. DuckDB's JSON extension "shreds" JSON documents — extracting all needed fields in a single parse pass. ClickHouse's `-If` combinator evaluates predicates once and shares results across multiple conditional aggregates. Spark's `ConstantFolding` rule moves constant arithmetic out of per-row computation.

All three were implemented:

### Batch GJSON extraction (DuckDB JSON shredding)

At plan time, collect all unique field paths across all accumulators and predicates. In `xStep`, call `gjson.GetManyBytes(jsonData, paths...)` once — a single scan that returns all values.

Before: 5 accumulators × 1 GJSON scan each = 5 scans per row.
After: 1 GJSON scan per row, results distributed by index.

### Predicate sharing (ClickHouse -If combinator)

At plan time, deduplicate predicates by source string. Per row, evaluate each unique predicate once. Accumulators reference predicates by index.

Before: 2 accumulators with same filter = 2 predicate evaluations per row.
After: 1 evaluation, boolean result shared.

### Constant folding (Spark Catalyst)

`$sum(amount * 1.1)` can't stream if `amount * 1.1` is treated as the extraction path. But the planner recognizes this as `$sum(amount) * 1.1` — the constant factor is moved to `xFinal`:

```
Before: per-row: extract(amount * 1.1), sum +=    → opaque, falls to accumulate
After:  per-row: extract(amount), sum +=           → streaming
        xFinal:  result = sum * 1.1                → constant applied once
```

Similarly, `$sum(amount + 5)` becomes `$sum(amount) + 5 * $count($)` — additive constants are factored out using the algebraic identity.

### Nested objects and array constructors

`{ "summary": { "total": $sum(x), "avg": $average(x) } }` — the inner object is decomposed recursively. `[$sum(x), $max(x), $min(x)]` — each array element is analyzed independently.

### Final benchmark: planner v2

| Method | Time | Memory | Notes |
|---|---|---|---|
| **jsonata_query v2** | **83ms** | O(unique) | Single expression, batch extraction |
| **SQL (single-scan FILTER/CASE)** | **84ms** | O(1) | Single scan, verbose |
| SQL (5 subqueries) | 150ms | O(1) | 5 separate table scans |
| jsonata_query v1 | 349ms | O(unique) | Before batch extraction |
| jsonata_query (accumulate) | 439ms | O(100k) | Buffers all rows |

Read that first line. **A Go extension running JSONata — a JSON transformation language — inside SQLite is matching optimized native SQL performance.** On 100k rows, crossing the CGo boundary on every row, parsing JSON, evaluating predicates, updating accumulators — and it lands at the same time as hand-tuned FILTER/CASE SQL.

The progression tells the story: 439ms → 349ms → 83ms. Three rounds of optimization turned a 5x disadvantage into a dead heat.

## How it matches native SQL

It seems counterintuitive — a Go extension keeping pace with SQLite's native C implementation. The reason is structural:

The optimized SQL version does 1 scan but calls `json_extract` multiple times per row — once per aggregate that needs a field value, plus once per CASE condition. With 5 aggregates, that's 8+ `json_extract` calls per row.

`jsonata_query` also does 1 scan. Per row:
1. One `gjson.GetManyBytes` call extracts **all** needed fields in a single pass
2. Predicates are evaluated once each (shared across accumulators)
3. All accumulators update from pre-extracted values

Batch extraction offsets the CGo overhead. At 9+ aggregates, the amortization tips in `jsonata_query`'s favor — **95ms vs 102ms** — because SQL's per-aggregate `json_extract` calls grow linearly while GJSON's batch cost stays nearly flat.

## The full picture

Two functions — scalar and aggregate:

```sql
-- Per-row: filter, transform, project
SELECT jsonata('$uppercase(name)', data) FROM users WHERE jsonata('age > 18', data);

-- Aggregate: from simple sums to multi-accumulator reports
SELECT jsonata_query('$sum(amount)', data) FROM orders;

-- The planner decomposes complex expressions into streaming accumulators
SELECT jsonata_query('{
  "total":     $count($),
  "revenue":   $sum($filter($, function($v){$v.status = "completed"}).amount),
  "refunds":   $sum($filter($, function($v){$v.status = "refunded"}).amount),
  "net":       $sum($filter($, function($v){$v.status = "completed"}).amount)
               - $sum($filter($, function($v){$v.status = "refunded"}).amount),
  "avg_order": $round($average(amount), 2),
  "customers": $count($distinct(customer))
}', data) FROM orders;
```

The last query returns a complete JSON report object — the kind of thing that usually requires an application layer with loops, maps, and manual object construction. Here it's one SQL statement that runs in 83ms on 100k rows with constant memory. The SQL equivalent would need 5+ CASE/WHEN/THEN/END clauses, a FILTER clause, and still couldn't produce nested objects.

## What streams and what doesn't

| Pattern | Streams | Memory |
|---|---|---|
| `$sum(path)`, `$count()`, `$max`, `$min`, `$average` | yes | O(1) |
| `$sum($filter($, fn).path)` | yes | O(1) |
| `$count($distinct(path))` | yes | O(unique values) |
| `$sum(path * constant)` | yes (constant folded) | O(1) |
| `{ key: agg, key: agg, ... }` | yes (parallel accumulators) | O(1) |
| `$round($average(x), 2)` | yes (finalize once) | O(1) |
| `$sum(x) - $count($)` | yes (post-aggregate arithmetic) | O(1) |
| `"Q1 Report"` | yes (constant, no per-row work) | O(1) |
| `$sort(...)` | no (needs all data) | O(n) |
| `$reduce($, fn, init)` | no (cross-row state) | O(n) |

When streaming and opaque patterns appear in the same expression, only the opaque subtrees pay the O(n) cost. The streaming accumulators run in constant memory regardless.

## Lessons learned

**The Postgres decomposition model works everywhere.** Separate per-row accumulation (sfunc) from finalization (finalfunc), lift aggregate references out of surrounding expressions, and evaluate post-aggregate arithmetic once. This pattern applies to any streaming aggregation system, not just relational databases.

**Batch field extraction is the biggest single optimization.** Going from N GJSON scans per row to 1 scan via `GetManyBytes` was a 4.2x improvement. If you're processing JSON documents and need multiple fields, always extract them together. This is also what lets a Go extension match native C — batch extraction offsets CGo overhead.

**Predicate sharing matters.** Conditional aggregates (ClickHouse's `-If` pattern) are common in report queries. Deduplicating and caching predicate results eliminates redundant work that's invisible at the expression level.

**Constant folding enables streaming.** `$sum(amount * 1.1)` looks like it needs per-row multiplication. Recognizing that `sum(x * c) = sum(x) * c` converts an opaque expression into a streaming one — the algebraic identity changes the memory class from O(n) to O(1).

**The expression is the specification, not the execution.** Users write JSONata that describes what they want. The planner decides how to execute it. This separation — familiar from SQL query planners — is what makes the performance possible without sacrificing expressiveness.

## Try it

```bash
# Build
CGO_ENABLED=1 go build -buildmode=c-shared -ldflags="-s -w" -trimpath \
  -o gnata_jsonata.dylib ./sqlite/

# Use
sqlite3 mydb.db ".load ./gnata_jsonata sqlite3_jsonata_init" \
  "SELECT jsonata_query('\$sum(amount)', data) FROM orders;"
```

The extension is part of [gnata](https://github.com/rbbydotdev/gnata-sqlite), a pure-Go JSONata 2.x engine. The SQLite extension, query planner, and all benchmarks are in the `sqlite/` directory.
