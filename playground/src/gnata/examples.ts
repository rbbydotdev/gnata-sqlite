export interface GnataExample {
  expr: string;
  data: string;
}

export const GNATA_EXAMPLES: Record<string, GnataExample> = {
  invoice: {
    expr: '$sum(Account.Order.Product.(Price * Quantity))',
    data: '{\n  "Account": {\n    "Name": "Firefly",\n    "Order": [\n      {\n        "OrderID": "order103",\n        "Product": [\n          { "Name": "Bowler Hat", "Price": 34.45, "Quantity": 2 },\n          { "Name": "Trilby hat", "Price": 21.67, "Quantity": 1 }\n        ]\n      },\n      {\n        "OrderID": "order104",\n        "Product": [\n          { "Name": "Cloak", "Price": 107.99, "Quantity": 1 }\n        ]\n      }\n    ]\n  }\n}',
  },
  "filter & map": {
    expr: '$filter(users, function($u) { $u.age >= 21 }).name',
    data: '{\n  "users": [\n    { "name": "Alice", "age": 30, "role": "admin" },\n    { "name": "Bob", "age": 17, "role": "viewer" },\n    { "name": "Carol", "age": 25, "role": "editor" },\n    { "name": "Dave", "age": 19, "role": "viewer" }\n  ]\n}',
  },
  predicate: {
    expr: 'event.action = "login" and event.severity > 3',
    data: '{\n  "event": {\n    "action": "login",\n    "severity": 5,\n    "user": "admin@example.com",\n    "metadata": { "ip": "10.0.0.1", "geo": "US" }\n  }\n}',
  },
  transform: {
    expr: 'orders.{\n  "id": id,\n  "customer": customer.name & " (" & customer.email & ")",\n  "total": $round($sum(items.(price * qty)), 2),\n  "items": $count(items),\n  "biggest": $max(items.price)\n}',
    data: '{\n  "orders": [\n    {\n      "id": "ORD-001",\n      "customer": { "name": "Acme Corp", "email": "purchasing@acme.com" },\n      "items": [\n        { "sku": "WDG-10", "price": 29.99, "qty": 5 },\n        { "sku": "SPR-03", "price": 149.00, "qty": 1 },\n        { "sku": "BLT-07", "price": 8.50, "qty": 12 }\n      ]\n    },\n    {\n      "id": "ORD-002",\n      "customer": { "name": "Globex", "email": "ops@globex.net" },\n      "items": [\n        { "sku": "WDG-10", "price": 29.99, "qty": 20 },\n        { "sku": "MTR-01", "price": 450.00, "qty": 2 }\n      ]\n    }\n  ]\n}',
  },
  "group & agg": {
    expr: '$reduce(logs, function($acc, $v) {\n  $merge([$acc, {\n    $v.level: ($lookup($acc, $v.level) ? $lookup($acc, $v.level) : 0) + 1\n  }])\n}, {})',
    data: '{\n  "logs": [\n    { "ts": "2024-01-15T08:30:00Z", "level": "error", "msg": "Connection refused", "service": "api" },\n    { "ts": "2024-01-15T08:30:05Z", "level": "warn", "msg": "Retry attempt 1", "service": "api" },\n    { "ts": "2024-01-15T08:30:10Z", "level": "info", "msg": "Connected", "service": "api" },\n    { "ts": "2024-01-15T08:31:00Z", "level": "error", "msg": "Timeout", "service": "worker" },\n    { "ts": "2024-01-15T08:31:15Z", "level": "info", "msg": "Job completed", "service": "worker" },\n    { "ts": "2024-01-15T08:32:00Z", "level": "warn", "msg": "High memory", "service": "api" },\n    { "ts": "2024-01-15T08:32:30Z", "level": "error", "msg": "OOM killed", "service": "worker" }\n  ]\n}',
  },
  "nested nav": {
    expr: '{\n  "total_endpoints": $count(services.endpoints),\n  "slow_p99": services.endpoints[latency.p99 > 200].{ "path": method & " " & path, "p99": latency.p99 },\n  "error_rate": $round($average(services.endpoints.error_rate), 2)\n}',
    data: '{\n  "services": [\n    {\n      "name": "auth-service",\n      "endpoints": [\n        { "method": "POST", "path": "/login", "latency": { "p50": 45, "p99": 320 }, "error_rate": 0.02 },\n        { "method": "POST", "path": "/refresh", "latency": { "p50": 12, "p99": 85 }, "error_rate": 0.001 }\n      ]\n    },\n    {\n      "name": "data-service",\n      "endpoints": [\n        { "method": "GET", "path": "/query", "latency": { "p50": 180, "p99": 950 }, "error_rate": 0.05 },\n        { "method": "POST", "path": "/ingest", "latency": { "p50": 25, "p99": 110 }, "error_rate": 0.01 },\n        { "method": "GET", "path": "/health", "latency": { "p50": 2, "p99": 8 }, "error_rate": 0.0 }\n      ]\n    }\n  ]\n}',
  },
  "string ops": {
    expr: 'employees.(\n  $uppercase($substringBefore(name, " ")) & ", " &\n  department & " | " &\n  $join(skills, ", ") &\n  (active ? " [ACTIVE]" : " [INACTIVE]")\n)',
    data: '{\n  "employees": [\n    { "name": "Alice Johnson", "department": "Engineering", "skills": ["Go", "Rust", "K8s"], "active": true },\n    { "name": "Bob Martinez", "department": "Data", "skills": ["Python", "SQL", "Spark"], "active": true },\n    { "name": "Carol Chen", "department": "Security", "skills": ["Pentesting", "SIEM", "Forensics"], "active": false },\n    { "name": "Dave Kim", "department": "Engineering", "skills": ["TypeScript", "React", "Node"], "active": true }\n  ]\n}',
  },
  pipeline: {
    expr: 'records\n  ~> $filter(function($r) { $r.status != "cancelled" })\n  ~> $map(function($r) { $merge([$r, {"total": $r.price * $r.qty}]) })\n  ~> $sort(function($a, $b) { $b.total - $a.total })\n  ~> $map(function($r) { $r.product & ": $" & $string($r.total) })',
    data: '{\n  "records": [\n    { "product": "Laptop", "price": 999, "qty": 3, "status": "shipped" },\n    { "product": "Mouse", "price": 29, "qty": 50, "status": "delivered" },\n    { "product": "Monitor", "price": 450, "qty": 5, "status": "cancelled" },\n    { "product": "Keyboard", "price": 75, "qty": 20, "status": "shipped" },\n    { "product": "Headset", "price": 199, "qty": 8, "status": "delivered" },\n    { "product": "Webcam", "price": 89, "qty": 15, "status": "shipped" }\n  ]\n}',
  },
};
