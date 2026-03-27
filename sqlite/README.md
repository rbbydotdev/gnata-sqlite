# gnata SQLite Extension

A loadable SQLite extension that brings [JSONata 2.x](https://jsonata.org) into SQL queries. Query, transform, and aggregate JSON data using JSONata expressions — directly from SQLite.

```sql
.load ./gnata_jsonata sqlite3_jsonata_init

SELECT jsonata('Account.Name', data) FROM events;
-- "Firefly"

SELECT jsonata_query('$sum(amount)', data) FROM orders;
-- 4250

-- Expand JSON arrays into rows
SELECT value FROM jsonata_each('items[price > 100]', data) FROM orders;

-- Encode, mutate, and handle errors
SELECT jsonata('$base64(email)', data) FROM users;
SELECT jsonata_set(data, 'status', '"processed"') FROM events;
SELECT jsonata('$number(amount)', data, 0) FROM messy_data;  -- default on error
```

## Installation

### Build from source

Requires Go 1.22+ with CGo enabled.

```bash
# macOS
CGO_ENABLED=1 go build -buildmode=c-shared \
  -ldflags="-s -w" -trimpath \
  -o gnata_jsonata.dylib ./sqlite/

# Linux
CGO_ENABLED=1 go build -buildmode=c-shared \
  -ldflags="-s -w" -trimpath \
  -o gnata_jsonata.so ./sqlite/
```

Output: `gnata_jsonata.dylib` (~3 MB) or `gnata_jsonata.so`.

### Load in SQLite

```sql
-- sqlite3 CLI
.load ./gnata_jsonata sqlite3_jsonata_init

-- Or with explicit path
.load /usr/local/lib/gnata_jsonata sqlite3_jsonata_init
```

### Load from application code

```python
# Python
import sqlite3
conn = sqlite3.connect(":memory:")
conn.enable_load_extension(True)
conn.load_extension("./gnata_jsonata", "sqlite3_jsonata_init")
```

```typescript
// Bun
const db = new Database(":memory:");
db.loadExtension("./gnata_jsonata", "sqlite3_jsonata_init");
```

```go
// Go (mattn/go-sqlite3)
sql.Register("sqlite3_with_jsonata", &sqlite3.SQLiteDriver{
    Extensions: []string{"./gnata_jsonata"},
})
```

## Functions

### `jsonata(expression, json_data)` — per-row

Evaluates a JSONata expression against a single JSON value. Use this like `json_extract()` but with the full JSONata language.

```sql
-- Field access
SELECT jsonata('name', '{"name": "Alice"}');
-- "Alice"

-- Nested paths
SELECT jsonata('address.city', data) FROM users;

-- String functions
SELECT jsonata('$uppercase(name)', data) FROM users;
-- "ALICE"

-- Arithmetic
SELECT jsonata('price * quantity * (1 - discount)', data) FROM line_items;

-- Conditionals
SELECT jsonata('age >= 18 ? "adult" : "minor"', data) FROM people;

-- Filtering nested arrays
SELECT jsonata('items[price > 100].name', data) FROM orders;

-- Lambdas
SELECT jsonata('$map(tags, function($t){ $uppercase($t) })', data) FROM posts;
```

**Arguments:**

| Arg | Type | Description |
|-----|------|-------------|
| `expression` | TEXT | JSONata expression string |
| `json_data` | TEXT | JSON string to evaluate against |

If either argument is NULL, returns NULL.

**Return type mapping:**

| JSONata result | SQLite type |
|---|---|
| string | TEXT |
| integer number | INTEGER |
| fractional number | REAL |
| boolean | INTEGER (0 or 1) |
| null / undefined | NULL |
| array or object | TEXT (JSON) with subtype 'J' |

Arrays and objects are returned as JSON text with SQLite's JSON subtype set, making them compatible with `json_extract()`, `json_each()`, and other JSON functions.

### `jsonata_query(expression, json_data)` — aggregate

Collects all rows in a group into an array, then evaluates the JSONata expression against that array. Use this like `sum()` or `group_concat()` but with JSONata's full transformation power.

```sql
-- Sum a field across all rows
SELECT jsonata_query('$sum(amount)', data) FROM orders;

-- Count distinct values
SELECT jsonata_query('$count($distinct(region))', data) FROM events;

-- Build a report object from many rows
SELECT jsonata_query('{
  "total":    $count($),
  "revenue":  $sum($filter($, function($v){ $v.action = "purchase" }).amount),
  "users":    $count($distinct(user))
}', data) FROM events;

-- With GROUP BY
SELECT
  json_extract(data, '$.region') as region,
  jsonata_query('$sum(amount)', data) as total
FROM events
GROUP BY region;
```

**Streaming optimization:**

Expressions are decomposed at compile time into streaming accumulators. All field paths are batch-extracted in a single GJSON scan per row. Identical predicates are shared across accumulators.

| Pattern | Memory | Notes |
|---|---|---|
| `$sum(path)`, `$count()`, `$max`, `$min`, `$average` | O(1) | Streaming accumulator |
| `$sum($filter($, fn).path)` | O(1) | Predicate + conditional accumulator |
| `$count($distinct(path))` | O(unique) | Hash set |
| `{ key: agg, key: agg, ... }` | O(1) | Parallel accumulators, batch extraction |
| `$round($average(x), 2)` | O(1) | Finalizer applied once |
| `$sum(x) - $count($)` | O(1) | Post-aggregate arithmetic |
| `$sort(...)`, `$reduce(...)` | O(n) | Falls back to row accumulation |

See [OPTIMIZATION.md](OPTIMIZATION.md) for the full guide on writing expressions that stream.

### `jsonata_each(expression, json_data)` — table-valued function

Evaluates a JSONata expression and expands the result into rows. Use this in FROM clauses to iterate over JSON arrays or objects — like `json_each()` but with full JSONata expression power.

```sql
-- Expand an array into rows
SELECT value, key FROM jsonata_each('items', '{"items":["a","b","c"]}');
-- a  0
-- b  1
-- c  2

-- Filter + expand in one expression
SELECT value FROM jsonata_each('items[price > 100]', data) FROM orders;

-- Iterate over object keys
SELECT key, value FROM jsonata_each('$', '{"name":"Alice","age":30}');
-- name  Alice
-- age   30

-- Join expanded arrays with SQL
SELECT e.id, j.value as tag
FROM events e, jsonata_each('tags', e.data) j;

-- GROUP BY on expanded elements
SELECT j.value as tag, count(*) as n
FROM events e, jsonata_each('tags', e.data) j
GROUP BY tag ORDER BY n DESC;
```

**Output columns:**

| Column | Type | Description |
|---|---|---|
| `value` | any | The element value (native type for scalars, JSON text for objects/arrays) |
| `key` | any | Array index (INTEGER) or object key (TEXT), NULL for scalar results |
| `type` | TEXT | JSON type: "null", "true", "false", "integer", "real", "text", "array", "object" |

When the expression result is an array, each element becomes a row with its index as the key. When the result is an object, each key-value pair becomes a row. When the result is a scalar, one row is returned with a NULL key.

### `jsonata_set(json, path, value)` — mutation

Returns a modified copy of the JSON document with the value set at the given dotted path. Creates intermediate objects if they don't exist.

```sql
-- Set a top-level field
SELECT jsonata_set('{"a":1,"b":2}', 'a', '42');
-- {"a":42,"b":2}

-- Set a nested field
SELECT jsonata_set('{"user":{"name":"Alice"}}', 'user.name', '"Bob"');
-- {"user":{"name":"Bob"}}

-- Create nested path
SELECT jsonata_set('{"a":1}', 'b.c.d', '"deep"');
-- {"a":1,"b":{"c":{"d":"deep"}}}

-- Set JSON values (arrays, objects, booleans)
SELECT jsonata_set(data, 'processed', 'true') FROM events;
SELECT jsonata_set(data, 'tags', '["new","tags"]') FROM events;
```

The value argument is parsed as JSON. If it's not valid JSON, it's treated as a plain string. Returns JSON text with subtype 'J'.

### `jsonata_delete(json, path)` — mutation

Returns a modified copy of the JSON document with the key at the given dotted path removed.

```sql
-- Remove a top-level field
SELECT jsonata_delete('{"a":1,"b":2,"secret":"xxx"}', 'secret');
-- {"a":1,"b":2}

-- Remove a nested field
SELECT jsonata_delete('{"user":{"name":"Alice","age":30}}', 'user.age');
-- {"user":{"name":"Alice"}}

-- Strip internal fields before export
SELECT jsonata_delete(jsonata_delete(data, 'internal_id'), 'debug_info')
FROM events;
```

### `jsonata(expression, key1, val1, key2, val2, ...)` — multi-column

When you need to evaluate a JSONata expression against data from multiple SQL columns, pass alternating key-value pairs directly. This builds a JSON object from the pairs and evaluates the expression against it — no `json_object()` wrapper needed.

```sql
-- Combine columns from a JOIN into a single JSONata expression
SELECT jsonata(
  'subject & " from " & from_address & " (" & parsed_data.company & ")"',
  'parsed_data', ec.parsed_data,
  'subject', em.subject,
  'from_address', em.from_address
) as display
FROM email_message em
JOIN email_classification ec ON ec.email_id = em.id;
```

**Arguments:**

| Arg | Type | Description |
|-----|------|-------------|
| `expression` | TEXT | JSONata expression string |
| `key1` | TEXT | Field name in the constructed object |
| `val1` | any | Value for that field |
| ... | ... | Additional key-value pairs |

**Value type handling:**

| SQLite type | JSON result |
|---|---|
| INTEGER | Number |
| REAL | Number |
| TEXT (JSON subtype or looks like `{...}` / `[...]`) | Embedded raw as nested JSON |
| TEXT (plain) | Quoted string |
| NULL | `null` |

JSON columns are embedded as nested objects automatically, so you can traverse into them with dot paths:

```sql
-- parsed_data is a JSON column — its fields are directly accessible
SELECT jsonata(
  'parsed_data.company & " — " & $uppercase(category)',
  'parsed_data', ec.parsed_data,
  'category', ec.category
) FROM email_classification ec;

-- Mix scalar columns with JSON columns
SELECT jsonata(
  '{"name": name, "city": city, "order_total": data.total}',
  'name', c.name,
  'city', c.city,
  'data', o.data
) FROM orders o JOIN customers c ON c.id = o.customer_id LIMIT 10;
```

### `jsonata(expression, json, default)` — error handling

The scalar `jsonata()` function accepts an optional third argument. When provided, evaluation errors return the default value instead of failing:

```sql
-- Normal: 2-arg form errors on bad data
SELECT jsonata('$number(amount)', '{"amount":"invalid"}');
-- Error: jsonata eval: ...

-- Safe: 3-arg form returns default on error
SELECT jsonata('$number(amount)', '{"amount":"invalid"}', 0);
-- 0

-- Works for compile errors too
SELECT jsonata('bad..expr', '{}', 'fallback');
-- fallback

-- Practical: sum amounts from messy data, defaulting bad values to 0
SELECT sum(jsonata('$number(amount)', data, 0)) FROM events;
```

### Format functions

Custom functions available inside any JSONata expression. Inspired by jq's `@format` strings.

| Function | Description | Example |
|---|---|---|
| `$base64(str)` | Base64 encode | `$base64("hello")` → `"aGVsbG8="` |
| `$base64decode(str)` | Base64 decode | `$base64decode("aGVsbG8=")` → `"hello"` |
| `$urlencode(str)` | URL percent-encode | `$urlencode("a b")` → `"a+b"` |
| `$urldecode(str)` | URL percent-decode | `$urldecode("a+b")` → `"a b"` |
| `$csv(array)` | Format array as CSV row | `$csv(["a","b,c"])` → `'a,"b,c"'` |
| `$tsv(array)` | Format array as TSV row | `$tsv(["a","b"])` → `"a\tb"` |
| `$htmlescape(str)` | HTML entity escape | `$htmlescape("<b>")` → `"&lt;b&gt;"` |

These work in all contexts — scalar, aggregate, and query:

```sql
-- Per-row encoding
SELECT jsonata('$base64(email)', data) FROM users;

-- Build URL query strings
SELECT jsonata('"https://api.example.com/search?q=" & $urlencode(query)', data) FROM searches;

-- Export as CSV
SELECT jsonata('$csv([$string(id), name, $string(amount)])', data) FROM orders;

-- Sanitize HTML
SELECT jsonata('$htmlescape(user_input)', data) FROM comments;
```

## How-to guides

### Filter rows using a JSONata expression stored in another table

When label/filter expressions are stored as data (not hardcoded SQL), `jsonata()` evaluates them dynamically:

```sql
-- email_label.expression contains JSONata like "$exists(parsed_data.company)"
SELECT em.subject, el.name as label
FROM email_message em
JOIN email_classification ec ON ec.email_id = em.id
CROSS JOIN email_label el
WHERE jsonata(el.expression, ec.parsed_data)
```

No `eval()` needed. The expression column is passed as the first argument to `jsonata()`, which evaluates it against each row's JSON data.

### Count distinct values from a JSON field across rows

```sql
-- How many unique companies across all classifications?
SELECT COUNT(DISTINCT jsonata('$lowercase($trim(parsed_data.company))', ec.parsed_data))
FROM email_classification ec
WHERE jsonata('$exists(parsed_data.company)', ec.parsed_data)
```

### Build a JSON report from grouped data

```sql
SELECT jsonata_query('{
  "total_orders":  $count($),
  "gross_revenue": $sum($filter($, function($v){ $v.status = "completed" }).amount),
  "refund_total":  $sum($filter($, function($v){ $v.status = "refunded" }).amount),
  "avg_order":     $round($average(amount), 2),
  "top_customers": $sort(
    $distinct(customer).(
      $name := $;
      $theirs := $filter($$.*, function($v){ $v.customer = $name });
      {"name": $name, "total": $sum($theirs.amount)}
    ),
    function($a, $b){ $a.total > $b.total }
  )[0..4]
}', json_object(
  'customer', json_extract(data, '$.customer'),
  'amount', json_extract(data, '$.amount'),
  'status', json_extract(data, '$.status')
)) as report
FROM orders;
```

### Use jsonata alongside json_extract

The two functions compose naturally. Use `json_extract` for indexed lookups and `jsonata` for transformations:

```sql
-- json_extract for the indexed WHERE clause, jsonata for the projection
SELECT jsonata('$uppercase(parsed_data.role)', ec.parsed_data) as role
FROM email_classification ec
WHERE json_extract(ec.parsed_data, '$.company') = 'Stripe'
```

### Pass multiple columns to a JSONata expression

Use the key-value form to pass data from multiple columns directly:

```sql
SELECT jsonata(
  'subject & " — " & $uppercase(company)',
  'subject', em.subject,
  'company', ec.company
) as display
FROM email_message em
JOIN email_classification ec ON ec.email_id = em.id
```

Alternatively, you can construct a JSON object with `json_object()` and pass it as the second argument:

```sql
SELECT jsonata(
  'subject & " — " & $uppercase(company)',
  json_object('subject', em.subject, 'company', ec.company)
) as display
FROM email_message em
JOIN email_classification ec ON ec.email_id = em.id
```

## Reference

### Supported JSONata features

The extension implements the full JSONata 2.x specification (1,778 test cases from the official test suite). This includes:

- Path expressions: `a.b.c`, `a.b[0]`, `a.b[-1]`
- Wildcards: `*`, `**`
- Filter predicates: `items[price > 100]`
- Sorting: `$sort(array, comparator)`
- String functions: `$uppercase`, `$lowercase`, `$trim`, `$contains`, `$match`, `$replace`, `$split`, `$join`, `$substring`, `$length`
- Numeric functions: `$sum`, `$max`, `$min`, `$average`, `$round`, `$abs`, `$floor`, `$ceil`, `$sqrt`, `$power`
- Array functions: `$count`, `$append`, `$sort`, `$reverse`, `$distinct`, `$flatten`, `$zip`
- Object functions: `$keys`, `$values`, `$merge`, `$sift`, `$each`, `$spread`, `$lookup`
- Higher-order functions: `$map`, `$filter`, `$reduce`, `$single`
- Boolean functions: `$boolean`, `$not`, `$exists`
- Type functions: `$type`, `$string`, `$number`
- Conditional: `condition ? then : else`
- Lambda expressions: `function($x){ $x * 2 }`
- Variable binding: `$x := expr; ...`
- Regular expressions: `$match(str, /pattern/flags)`
- Parent operator: `%`
- Chain operator: `expr ~> $func()`
- Format functions (extension-specific): `$base64`, `$base64decode`, `$urlencode`, `$urldecode`, `$csv`, `$tsv`, `$htmlescape`

### Expression caching

Compiled expressions are cached automatically. When the same expression string appears across multiple rows (the common case in `WHERE jsonata('field', data)`), it is compiled once and reused. There is no cache size limit.

### Error handling

Compilation errors and evaluation errors are reported as SQLite errors:

```sql
SELECT jsonata('$invalid(', '{}');
-- Error: jsonata compile: JSONata error S0203: expected ) before end of expression

SELECT jsonata('$sqrt(-1)', '{}');
-- NULL (undefined result, not an error)
```

### Performance

Benchmarked on Apple M4 Pro:

**Scalar and aggregate (100k rows):**

| Operation | `json_extract` | `jsonata` | Overhead |
|---|---|---|---|
| Simple field access | 38ms | 62ms | 1.6x |
| Nested path | 41ms | 69ms | 1.7x |
| Numeric aggregation | 43ms | 55ms | 1.3x |
| Multi-field per row | 42ms | 83ms | 2.0x |
| `jsonata_query $sum` (streaming) | 33ms | 42ms | 1.3x |
| `jsonata_query $max` (streaming) | 33ms | 42ms | 1.3x |

Simple field access adds ~0.25 μs per row (~4 million rows/second). Streaming aggregates are within 1.3x of native SQL.

**New functions (10k rows):**

| Operation | Native SQL | gnata | Notes |
|---|---|---|---|
| `jsonata_each` expand | 12ms (`json_each`) | 103ms | Full JSONata eval per row |
| `jsonata_each` filter+expand | 27ms | 452ms | Inline filter vs post-filter |
| `$base64` per row | — | 181ms | ~18 μs/row |
| `$urlencode` per row | — | 88ms | ~8.8 μs/row |
| `$csv` per row | — | 133ms | ~13 μs/row |
| `jsonata` 3-arg (try) | 92ms (CASE) | 241ms | 100k rows with dirty data |
| `jsonata_set` | 13ms (`json_set`) | 75ms | Full parse + serialize |
| `jsonata_delete` | 8ms (`json_remove`) | 54ms | Full parse + serialize |

Format functions add per-row overhead from full JSONata evaluation (no GJSON fast path). Mutation functions are slower than native `json_set`/`json_remove` because they parse and re-serialize the full document. Use native functions for simple path operations; use gnata functions when you need JSONata's expressiveness.

## Architecture

The extension is a Go shared library built with `CGO_ENABLED=1 -buildmode=c-shared`. It exports a single C entry point (`sqlite3_jsonata_init`) that registers all SQL functions and the table-valued function module.

```
sqlite/
├── sqlite3ext.h    # Vendored SQLite extension header (public domain)
├── bridge.h        # C wrappers for sqlite3_api function pointer table
├── bridge.c        # sqlite3_api global + trampolines + jsonata_each vtab module
├── extension.go    # Entry point, scalar function, CGo glue
├── query.go        # Aggregate function with streaming query planner
├── each.go         # Table-valued function (jsonata_each)
├── mutate.go       # JSON mutation functions (jsonata_set, jsonata_delete)
├── format.go       # Format functions ($base64, $urlencode, etc.) + eval helper
├── cache.go        # sync.Map expression cache
└── result.go       # gnata → SQLite type mapping
```

The `bridge.h` / `bridge.c` split exists because SQLite loadable extensions use a function pointer table (`sqlite3_api_routines`) initialized by `SQLITE_EXTENSION_INIT2`. This pointer must be defined exactly once (`bridge.c`) and shared across all CGo compilation units via `extern` (`bridge.h`). The `jsonata_each` table-valued function is implemented as an eponymous-only virtual table module registered via `sqlite3_create_module_v2`.
