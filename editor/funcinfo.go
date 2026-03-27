package main

import "strings"

// funcInfo describes a built-in JSONata function for autocompletion and hover.
type funcInfo struct {
	Name   string // function name without $
	Sig    string // type signature e.g. "<s-nn?:s>"
	Detail string // one-line description
	Doc    string // extended markdown documentation for hover (optional)
}

// builtinFuncs is the static catalog of all JSONata 2.x built-in functions.
// Sourced from functions/register.go. This is compiled into the WASM binary.
var builtinFuncs = []funcInfo{
	// String
	{"string", "<x-b?:s>", "Cast to string",
		"Casts `arg` to a string. Booleans become `\"true\"`/`\"false\"`, `null` becomes `\"null\"`, numbers become their string representation. Objects/arrays are serialized as JSON.\n\n```\n$string(42)       → \"42\"\n$string(true)     → \"true\"\n$string({\"a\":1}) → '{\"a\":1}'\n```\n\nOptional `prettify` boolean enables indented JSON output."},
	{"length", "<s:n>", "String length",
		"Returns the number of characters in `str`.\n\n```\n$length(\"hello\") → 5\n$length(\"\")      → 0\n```"},
	{"substring", "<s-nn?:s>", "Extract substring",
		"Returns the substring starting at `start` (0-based) with optional `length`.\n\n```\n$substring(\"hello world\", 6)    → \"world\"\n$substring(\"hello world\", 0, 5) → \"hello\"\n```\n\nNegative `start` counts from the end."},
	{"substringBefore", "<s-s:s>", "Substring before match",
		"Returns the part of `str` before the first occurrence of `chars`.\n\n```\n$substringBefore(\"hello world\", \" \") → \"hello\"\n```"},
	{"substringAfter", "<s-s:s>", "Substring after match",
		"Returns the part of `str` after the first occurrence of `chars`.\n\n```\n$substringAfter(\"hello world\", \" \") → \"world\"\n```"},
	{"uppercase", "<s-:s>", "Convert to uppercase",
		"Returns `str` with all characters converted to uppercase.\n\n```\n$uppercase(\"hello\") → \"HELLO\"\n```"},
	{"lowercase", "<s-:s>", "Convert to lowercase",
		"Returns `str` with all characters converted to lowercase.\n\n```\n$lowercase(\"HELLO\") → \"hello\"\n```"},
	{"trim", "<s-:s>", "Trim whitespace",
		"Removes leading and trailing whitespace from `str`.\n\n```\n$trim(\"  hello  \") → \"hello\"\n```"},
	{"pad", "<s-ns?:s>", "Pad string",
		"Pads `str` to `width` characters. Positive width pads right, negative pads left. Optional `char` specifies the padding character (default space).\n\n```\n$pad(\"foo\", 6)        → \"foo   \"\n$pad(\"foo\", -6)       → \"   foo\"\n$pad(\"foo\", 6, \"#\")   → \"foo###\"\n```"},
	{"contains", "<s-(sf):b>", "Test if string contains pattern",
		"Returns `true` if `str` contains `pattern` (string or regex).\n\n```\n$contains(\"hello world\", \"world\") → true\n$contains(\"hello\", /^H/i)         → true\n```"},
	{"split", "<s-(sf)n?:a<s>>", "Split string",
		"Splits `str` by `separator` (string or regex). Optional `limit` caps the number of parts.\n\n```\n$split(\"a,b,c\", \",\")    → [\"a\", \"b\", \"c\"]\n$split(\"a,b,c\", \",\", 2) → [\"a\", \"b\"]\n```"},
	{"join", "<a<s>s?:s>", "Join array of strings",
		"Joins an array of strings with optional `separator` (default empty string).\n\n```\n$join([\"a\",\"b\",\"c\"], \", \") → \"a, b, c\"\n$join([\"a\",\"b\",\"c\"])       → \"abc\"\n```"},
	{"match", "<s-(sf)n?:a<o>>", "Match regex pattern",
		"Returns an array of match objects for `pattern` in `str`. Each object has `match`, `index`, and `groups`.\n\n```\n$match(\"abcabc\", /a(b)/) → [{\"match\":\"ab\",\"index\":0,\"groups\":[\"b\"]},...]\n```"},
	{"replace", "<s-(sf)(sf)n?:s>", "Replace pattern",
		"Replaces occurrences of `pattern` with `replacement` in `str`. Optional `limit` caps replacements.\n\n```\n$replace(\"hello\", \"l\", \"L\")  → \"heLLo\"\n$replace(\"abc\", /[ac]/, \"X\") → \"XbX\"\n```"},
	{"base64encode", "<s-:s>", "Encode to base64",
		"Encodes `str` as a base64 string.\n\n```\n$base64encode(\"hello\") → \"aGVsbG8=\"\n```"},
	{"base64decode", "<s-:s>", "Decode from base64",
		"Decodes a base64-encoded string.\n\n```\n$base64decode(\"aGVsbG8=\") → \"hello\"\n```"},
	{"encodeUrl", "<s-:s>", "Encode URL",
		"Encodes a full URL string, preserving the URL structure characters."},
	{"encodeUrlComponent", "<s-:s>", "Encode URL component",
		"Encodes a URL component, escaping all special characters.\n\n```\n$encodeUrlComponent(\"a b&c\") → \"a%20b%26c\"\n```"},
	{"decodeUrl", "<s-:s>", "Decode URL",
		"Decodes a percent-encoded URL string."},
	{"decodeUrlComponent", "<s-:s>", "Decode URL component",
		"Decodes a percent-encoded URL component string."},
	{"formatNumber", "<n-ss?:s>", "Format number with picture string",
		"Formats `number` using an XPath-style picture string.\n\n```\n$formatNumber(1234.5, \"#,##0.00\") → \"1,234.50\"\n```"},
	{"formatBase", "<n-n:s>", "Format number in given base",
		"Converts `number` to a string in the specified `radix` (2-36).\n\n```\n$formatBase(255, 16) → \"ff\"\n$formatBase(10, 2)   → \"1010\"\n```"},
	{"formatInteger", "<n-s:s>", "Format integer with picture string",
		"Formats an integer using an XPath-style picture string."},
	{"parseInteger", "<s-s:n>", "Parse integer from picture string",
		"Parses an integer string using a picture pattern."},
	// Numeric
	{"number", "<(nsb)-:n>", "Cast to number",
		"Casts `arg` to a number. Strings are parsed, booleans become 0/1, `null` becomes 0.\n\n```\n$number(\"42.5\") → 42.5\n$number(true)   → 1\n```"},
	{"abs", "<n-:n>", "Absolute value",
		"Returns the absolute value of `number`.\n\n```\n$abs(-5)  → 5\n$abs(5)   → 5\n```"},
	{"floor", "<n-:n>", "Round down",
		"Rounds `number` down to the nearest integer.\n\n```\n$floor(3.7)  → 3\n$floor(-3.2) → -4\n```"},
	{"ceil", "<n-:n>", "Round up",
		"Rounds `number` up to the nearest integer.\n\n```\n$ceil(3.2)   → 4\n$ceil(-3.7)  → -3\n```"},
	{"round", "<n-n?:n>", "Round to precision",
		"Rounds `number` to optional `precision` decimal places (default 0).\n\n```\n$round(3.456)    → 3\n$round(3.456, 2) → 3.46\n```"},
	{"power", "<n-n:n>", "Raise to power",
		"Returns `base` raised to `exponent`.\n\n```\n$power(2, 10) → 1024\n$power(9, 0.5) → 3\n```"},
	{"sqrt", "<n-:n>", "Square root",
		"Returns the square root of `number`.\n\n```\n$sqrt(144) → 12\n```"},
	{"random", "<:n>", "Random number [0,1)",
		"Returns a pseudo-random number between 0 (inclusive) and 1 (exclusive).\n\n```\n$random() → 0.7284...\n```"},
	{"sum", "<a<n>:n>", "Sum of array",
		"Returns the sum of all numbers in `array`.\n\n```\n$sum([1, 2, 3, 4]) → 10\n$sum(orders.total)  → 1234.56\n```\n\nAuto-maps over nested arrays: `items.(price * qty)` produces an array that `$sum` can consume."},
	{"max", "<a<n>:n>", "Maximum of array",
		"Returns the largest number in `array`.\n\n```\n$max([3, 1, 4, 1, 5]) → 5\n$max(orders.total)     → 999.99\n```"},
	{"min", "<a<n>:n>", "Minimum of array",
		"Returns the smallest number in `array`.\n\n```\n$min([3, 1, 4, 1, 5]) → 1\n```"},
	{"average", "<a<n>:n>", "Average of array",
		"Returns the arithmetic mean of all numbers in `array`.\n\n```\n$average([1, 2, 3, 4]) → 2.5\n```"},
	// Array
	{"count", "<a:n>", "Array length",
		"Returns the number of elements in `array`. If the argument is not an array, returns 1 (or 0 for undefined).\n\n```\n$count([1, 2, 3]) → 3\n$count(\"hello\")   → 1\n```"},
	{"append", "<xx:a>", "Append to array",
		"Appends `val` to `array`. If `array` is not an array, it's first wrapped in one.\n\n```\n$append([1, 2], 3)    → [1, 2, 3]\n$append([1, 2], [3])  → [1, 2, 3]\n```"},
	{"reverse", "<a:a>", "Reverse array",
		"Returns `array` with elements in reverse order.\n\n```\n$reverse([1, 2, 3]) → [3, 2, 1]\n```"},
	{"shuffle", "<a:a>", "Shuffle array",
		"Returns `array` with elements in random order."},
	{"distinct", "<a:a>", "Remove duplicates",
		"Returns `array` with duplicate values removed.\n\n```\n$distinct([1, 2, 2, 3, 1]) → [1, 2, 3]\n```"},
	{"flatten", "<a:a>", "Flatten nested arrays",
		"Flattens a nested array structure into a single flat array.\n\n```\n$flatten([[1, 2], [3, [4, 5]]]) → [1, 2, 3, 4, 5]\n```"},
	{"zip", "<a+:a>", "Zip arrays together",
		"Interleaves multiple arrays into an array of arrays.\n\n```\n$zip([1,2], [\"a\",\"b\"]) → [[1,\"a\"], [2,\"b\"]]\n```"},
	{"sort", "<af?:a>", "Sort array",
		"Sorts `array`. Optional comparator function `func` takes two args and returns a number (negative, zero, or positive).\n\n```\n$sort([3, 1, 2])   → [1, 2, 3]\n$sort(items, function($a, $b) { $a.price - $b.price })\n```"},
	// Object
	{"keys", "<x-:a<s>>", "Object keys",
		"Returns an array of the keys of `object`.\n\n```\n$keys({\"a\": 1, \"b\": 2}) → [\"a\", \"b\"]\n```"},
	{"values", "<x-:a>", "Object values",
		"Returns an array of the values of `object`.\n\n```\n$values({\"a\": 1, \"b\": 2}) → [1, 2]\n```"},
	{"spread", "<x-:a<o>>", "Spread to key-value pairs",
		"Converts `object` into an array of single-key objects.\n\n```\n$spread({\"a\": 1, \"b\": 2}) → [{\"a\": 1}, {\"b\": 2}]\n```"},
	{"merge", "<a<o>:o>", "Merge objects",
		"Merges an array of objects into a single object. Later keys overwrite earlier ones.\n\n```\n$merge([{\"a\":1}, {\"b\":2}, {\"a\":3}]) → {\"a\": 3, \"b\": 2}\n```"},
	{"lookup", "<x-s:x>", "Lookup field by name",
		"Returns the value of `key` from `object`. Useful for dynamic field access.\n\n```\n$lookup({\"a\": 1, \"b\": 2}, \"b\") → 2\n```"},
	{"each", "<o-f:a>", "Iterate object key-value pairs",
		"Applies `func(value, key)` to each key-value pair in `object`, returning an array of results.\n\n```\n$each({\"a\":1, \"b\":2}, function($v, $k) { $k & \"=\" & $v })\n→ [\"a=1\", \"b=2\"]\n```"},
	{"sift", "<o-f:o>", "Filter object entries",
		"Returns a new object containing only the entries where `func(value, key)` returns truthy.\n\n```\n$sift({\"a\":1, \"b\":2, \"c\":3}, function($v) { $v > 1 })\n→ {\"b\": 2, \"c\": 3}\n```"},
	// Boolean
	{"boolean", "<x-:b>", "Cast to boolean",
		"Casts `arg` to a boolean. Empty strings, 0, null, `[]`, and `{}` are falsy; everything else is truthy.\n\n```\n$boolean(0)    → false\n$boolean(\"hi\") → true\n```"},
	{"not", "<x-:b>", "Logical not",
		"Returns the boolean negation of `arg`.\n\n```\n$not(true)  → false\n$not(false) → true\n$not(0)     → true\n```"},
	{"exists", "<x:b>", "Test if value exists",
		"Returns `true` if `arg` is not `undefined`. Useful for checking if a field exists in the data.\n\n```\n$exists(data.field)  → true/false\n```"},
	// Control
	{"eval", "<s-:x>", "Evaluate JSONata expression",
		"Evaluates a JSONata expression string at runtime.\n\n```\n$eval(\"1 + 2\") → 3\n```\n\n**Warning:** Avoid with untrusted input."},
	{"error", "<s?:x>", "Throw error",
		"Throws an error with the given `message`. Halts evaluation.\n\n```\n$error(\"invalid input\")\n```"},
	{"assert", "<bs?:x>", "Assert condition",
		"If `condition` is falsy, throws an error with optional `message`.\n\n```\n$assert(age >= 0, \"age cannot be negative\")\n```"},
	{"type", "<x:s>", "Type of value",
		"Returns the type of `arg` as a string: `\"string\"`, `\"number\"`, `\"boolean\"`, `\"array\"`, `\"object\"`, `\"null\"`, or `\"undefined\"`.\n\n```\n$type(42)      → \"number\"\n$type([1,2])   → \"array\"\n$type(null)    → \"null\"\n```"},
	// Higher-order
	{"map", "<af:a>", "Map function over array",
		"Applies `func` to each element of `array`, returning a new array of results.\n\n```\n$map([1,2,3], function($v) { $v * 2 }) → [2, 4, 6]\n```\n\nThe callback receives `(value, index, array)`."},
	{"filter", "<af:a>", "Filter array by predicate",
		"Returns elements of `array` where `func` returns truthy.\n\n```\n$filter([1,2,3,4], function($v) { $v > 2 }) → [3, 4]\n```\n\nThe callback receives `(value, index, array)`."},
	{"single", "<af?:x>", "Find single match",
		"Returns the one element in `array` that matches `func`. Throws if zero or more than one match.\n\n```\n$single([1,2,3], function($v) { $v = 2 }) → 2\n```"},
	{"reduce", "<afj?:j>", "Reduce array",
		"Reduces `array` to a single value by applying `func(accumulator, value)` left-to-right. Optional `init` sets the initial accumulator.\n\n```\n$reduce([1,2,3], function($acc, $v) { $acc + $v }, 0) → 6\n```"},
	// Date/time
	{"now", "<s?s?:s>", "Current timestamp",
		"Returns the current date/time as an ISO 8601 string. Optional `picture` and `timezone` format the output.\n\n```\n$now() → \"2024-01-15T08:30:00.000Z\"\n```"},
	{"millis", "<:n>", "Current time in milliseconds",
		"Returns the current Unix timestamp in milliseconds.\n\n```\n$millis() → 1705304400000\n```"},
	{"fromMillis", "<n-s?s?:s>", "Milliseconds to timestamp",
		"Converts Unix milliseconds to an ISO 8601 timestamp. Optional `picture` and `timezone` format the output.\n\n```\n$fromMillis(1705304400000) → \"2024-01-15T09:00:00.000Z\"\n```"},
	{"toMillis", "<s-s?s?:n>", "Timestamp to milliseconds",
		"Parses an ISO 8601 timestamp string and returns Unix milliseconds.\n\n```\n$toMillis(\"2024-01-15T09:00:00Z\") → 1705309200000\n```"},
}

// marshalFuncCompletions writes matching function completions as a JSON array.
// prefix is the text after '$' that the user has typed so far.
func marshalFuncCompletions(b *strings.Builder, prefix string) {
	b.WriteByte('[')
	first := true
	for _, f := range builtinFuncs {
		if prefix != "" && !strings.HasPrefix(f.Name, prefix) {
			continue
		}
		if !first {
			b.WriteByte(',')
		}
		first = false
		b.WriteString(`{"label":"$`)
		b.WriteString(f.Name)
		b.WriteString(`","type":"function","detail":`)
		marshalString(b, f.Sig+" — "+f.Detail)
		b.WriteString(`,"boost":1}`)
	}
	b.WriteByte(']')
}
