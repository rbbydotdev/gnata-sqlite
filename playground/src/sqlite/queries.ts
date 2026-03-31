export interface QueryExample {
  name: string;
  sql: string;
}

export const QUERIES: QueryExample[] = [
  {
    name: "Extract Fields",
    sql: `-- jsonata() scalar: navigate nested JSON with dot paths
-- No json_extract() chains needed
SELECT id, status,
       jsonata('items.product', data) as products,
       jsonata('shipping.method', data) as ship_method,
       jsonata('shipping.cost', data) as ship_cost
FROM orders LIMIT 20;`,
  },
  {
    name: "Per-Row Math",
    sql: `-- Auto-mapping: items.(price * quantity) computes per-item then collects
-- $sum, $count work inline on nested arrays -- no subqueries needed
SELECT id, status,
       jsonata('$round($sum(items.(price * quantity)), 2)', data) as subtotal,
       jsonata('shipping.cost', data) as shipping,
       jsonata('total', data) as total,
       jsonata('$count(items)', data) as num_items,
       jsonata('items[price > 200].product', data) as premium_items
FROM orders LIMIT 20;`,
  },
  {
    name: "Revenue by Status",
    sql: `-- One jsonata_query per group computes all aggregates at once
-- Native gnata: single pass, O(1) memory, batch field extraction per group
SELECT status, count(*) as orders,
       jsonata_query('{
         "revenue":  $round($sum(total), 2),
         "avg":      $round($average(total), 2),
         "min":      $min(total),
         "max":      $max(total)
       }', data) as stats
FROM orders GROUP BY status ORDER BY orders DESC;`,
  },
  {
    name: "Dashboard",
    sql: `-- One expression computes a full dashboard report
-- Native gnata: single pass, O(1) memory, batch field extraction
SELECT jsonata_query('{
  "total_orders":    $count($),
  "total_revenue":   $round($sum(total), 2),
  "avg_order_value": $round($average(total), 2),
  "min_order":       $min(total),
  "max_order":       $max(total),
  "avg_items":       $round($average($map($, function($v){ $count($v.items) })), 2)
}', data) as dashboard
FROM orders;`,
  },
  {
    name: "Filtered Aggs",
    sql: `-- $filter with lambdas: ClickHouse-style conditional aggregation
-- All filters in one expression -- native gnata shares identical predicates
SELECT jsonata_query('{
  "total_orders":       $count($),
  "high_value_revenue": $round($sum($filter($, function($v){$v.total > 500}).total), 2),
  "high_value_count":   $count($filter($, function($v){$v.total > 500})),
  "small_orders":       $count($filter($, function($v){$v.total <= 100})),
  "avg_mid_plus":       $round($average($filter($, function($v){$v.total > 200}).total), 2)
}', data) as report
FROM orders;`,
  },
  {
    name: "Top Customers",
    sql: `-- SQL JOIN for relational work + gnata for JSON aggregation
SELECT c.name, c.city,
       count(*) as orders,
       jsonata_query('{
         "spent":   $round($sum(total), 2),
         "avg":     $round($average(total), 2),
         "biggest": $max(total)
       }', data) as stats
FROM orders o
JOIN customers c ON c.id = o.customer_id
GROUP BY c.id ORDER BY orders DESC LIMIT 15;`,
  },
  {
    name: "Category Stats",
    sql: `-- Aggregation across nested arrays
-- items.category reaches into every order's items array automatically
SELECT jsonata_query('{
  "unique_categories":   $count($distinct(items.category)),
  "total_quantity_sold": $sum(items.quantity),
  "avg_items_per_order": $round($average($map($, function($v){ $count($v.items) })), 2),
  "unique_products":     $count($distinct(items.product))
}', data) as stats
FROM orders;`,
  },
  {
    name: "Multi-Column",
    sql: `-- Multi-column: combine data from different tables in one expression
-- Native extension supports key-value pairs directly:
--   jsonata(expr, 'name', c.name, 'city', c.city, 'data', o.data)
-- Playground uses json_object() to achieve the same result:
SELECT jsonata(
  'name & " (" & city & ") \\u2014 $" & $string(data.total) & " via " & data.shipping.method',
  json_object('name', c.name, 'city', c.city, 'data', o.data)
) as summary,
  jsonata(
  '{"customer": name, "email": email, "items": $count(data.items), "total": data.total}',
  json_object('name', c.name, 'email', c.email, 'data', o.data)
) as detail
FROM orders o
JOIN customers c ON c.id = o.customer_id
LIMIT 15;`,
  },
  {
    name: "String Transforms",
    sql: `-- String functions: $uppercase, $lowercase, $join, $substring, &
-- Applied per-row as scalar transforms on nested JSON
SELECT id,
       jsonata('$uppercase(items[0].product)', data) as first_product_upper,
       jsonata('$join(items.category, ", ")', data) as categories,
       jsonata('$uppercase(shipping.method) & " (" & $string(shipping.cost) & ")"', data)
         as shipping_label,
       jsonata('$substring(shipping.address, 0, 25) & "..."', data) as short_addr
FROM orders LIMIT 15;`,
  },
  {
    name: "Monthly Revenue",
    sql: `-- SQL GROUP BY month + single gnata expression per group
SELECT substr(order_date, 1, 7) as month,
       count(*) as orders,
       jsonata_query('{
         "revenue":  $round($sum(total), 2),
         "avg":      $round($average(total), 2),
         "peak":     $max(total)
       }', data) as stats
FROM orders GROUP BY month ORDER BY month;`,
  },
];
