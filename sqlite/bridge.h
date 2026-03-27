#ifndef GNATA_BRIDGE_H
#define GNATA_BRIDGE_H

#include <stdlib.h>
#include "sqlite3ext.h"

// The sqlite3_api pointer is defined once in bridge.c.
// All other translation units see it via extern.
extern const sqlite3_api_routines *sqlite3_api;

// Thin C wrappers that dereference the sqlite3_api function-pointer table.
// Loadable extensions cannot call sqlite3_* directly.

static inline const char *go_value_text(sqlite3_value *v) {
	return (const char *)sqlite3_value_text(v);
}
static inline int go_value_bytes(sqlite3_value *v) {
	return sqlite3_value_bytes(v);
}
static inline int go_value_type(sqlite3_value *v) {
	return sqlite3_value_type(v);
}
static inline sqlite3_int64 go_value_int64(sqlite3_value *v) {
	return sqlite3_value_int64(v);
}
static inline double go_value_double(sqlite3_value *v) {
	return sqlite3_value_double(v);
}
static inline void go_result_text(sqlite3_context *ctx, const char *s, int n) {
	sqlite3_result_text(ctx, s, n, SQLITE_TRANSIENT);
}
static inline void go_result_int64(sqlite3_context *ctx, sqlite3_int64 v) {
	sqlite3_result_int64(ctx, v);
}
static inline void go_result_double(sqlite3_context *ctx, double v) {
	sqlite3_result_double(ctx, v);
}
static inline void go_result_null(sqlite3_context *ctx) {
	sqlite3_result_null(ctx);
}
static inline void go_result_error(sqlite3_context *ctx, const char *s, int n) {
	sqlite3_result_error(ctx, s, n);
}
static inline void go_result_subtype(sqlite3_context *ctx, unsigned int t) {
	sqlite3_result_subtype(ctx, t);
}
static inline unsigned int go_value_subtype(sqlite3_value *v) {
	return sqlite3_value_subtype(v);
}
static inline void *go_aggregate_context(sqlite3_context *ctx, int nBytes) {
	return sqlite3_aggregate_context(ctx, nBytes);
}

// Defined in bridge.c
extern int go_create_query_function(sqlite3 *db);
extern int go_create_set_function(sqlite3 *db);
extern int go_create_delete_function(sqlite3 *db);
extern int go_create_each_module(sqlite3 *db);

#endif
