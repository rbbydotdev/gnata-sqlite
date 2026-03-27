#include <string.h>
#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT1

// This file defines the sqlite3_api global exactly once.
// bridge.h declares it as extern so all CGo translation units can use it.

void gnata_init_api(const sqlite3_api_routines *pApi) {
	SQLITE_EXTENSION_INIT2(pApi);
}

// ── jsonata_query trampolines ────────────────────────────────────────────────

extern void goJsonataQueryStep(sqlite3_context*, int, sqlite3_value**);
extern void goJsonataQueryFinal(sqlite3_context*);

static void jsonata_query_step(sqlite3_context *ctx, int argc, sqlite3_value **argv) {
	goJsonataQueryStep(ctx, argc, argv);
}
static void jsonata_query_final(sqlite3_context *ctx) {
	goJsonataQueryFinal(ctx);
}

int go_create_query_function(sqlite3 *db) {
	return sqlite3_create_function_v2(
		db, "jsonata_query", 2,
		SQLITE_UTF8,
		0,
		0,
		jsonata_query_step,
		jsonata_query_final,
		0
	);
}

// ── jsonata_set trampoline ───────────────────────────────────────────────────

extern void goJsonataSetFunc(sqlite3_context*, int, sqlite3_value**);

static void jsonata_set_trampoline(sqlite3_context *ctx, int argc, sqlite3_value **argv) {
	goJsonataSetFunc(ctx, argc, argv);
}

int go_create_set_function(sqlite3 *db) {
	return sqlite3_create_function_v2(
		db, "jsonata_set", 3,
		SQLITE_UTF8 | SQLITE_DETERMINISTIC,
		0,
		jsonata_set_trampoline,
		0, 0, 0
	);
}

// ── jsonata_delete trampoline ────────────────────────────────────────────────

extern void goJsonataDeleteFunc(sqlite3_context*, int, sqlite3_value**);

static void jsonata_delete_trampoline(sqlite3_context *ctx, int argc, sqlite3_value **argv) {
	goJsonataDeleteFunc(ctx, argc, argv);
}

int go_create_delete_function(sqlite3 *db) {
	return sqlite3_create_function_v2(
		db, "jsonata_delete", 2,
		SQLITE_UTF8 | SQLITE_DETERMINISTIC,
		0,
		jsonata_delete_trampoline,
		0, 0, 0
	);
}

// ── jsonata_each virtual table (table-valued function) ───────────────────────

typedef struct {
	sqlite3_vtab base;
} EachVtab;

typedef struct {
	sqlite3_vtab_cursor base;
	sqlite3_int64 cursor_id;
} EachCursor;

// Go exports for cursor management
extern sqlite3_int64 goEachNewCursor(void);
extern void goEachFreeCursor(sqlite3_int64);
extern int goEachFilter(sqlite3_int64, const char*, int, const char*, int);
extern int goEachNext(sqlite3_int64);
extern int goEachEof(sqlite3_int64);
extern void goEachColumn(sqlite3_context*, sqlite3_int64, int);
extern sqlite3_int64 goEachRowid(sqlite3_int64);

static int each_connect(sqlite3 *db, void *aux, int argc, const char *const*argv,
                        sqlite3_vtab **ppVtab, char **pzErr) {
	(void)aux; (void)argc; (void)argv; (void)pzErr;
	int rc = sqlite3_declare_vtab(db,
		"CREATE TABLE x(value, key, type TEXT, expr TEXT HIDDEN, data TEXT HIDDEN)");
	if (rc != SQLITE_OK) return rc;
	EachVtab *vtab = (EachVtab*)sqlite3_malloc(sizeof(EachVtab));
	if (!vtab) return SQLITE_NOMEM;
	memset(vtab, 0, sizeof(EachVtab));
	*ppVtab = &vtab->base;
	return SQLITE_OK;
}

static int each_disconnect(sqlite3_vtab *vtab) {
	sqlite3_free(vtab);
	return SQLITE_OK;
}

static int each_best_index(sqlite3_vtab *vtab, sqlite3_index_info *info) {
	(void)vtab;
	int exprIdx = -1, dataIdx = -1;
	for (int i = 0; i < info->nConstraint; i++) {
		if (!info->aConstraint[i].usable) continue;
		if (info->aConstraint[i].op != SQLITE_INDEX_CONSTRAINT_EQ) continue;
		if (info->aConstraint[i].iColumn == 3) exprIdx = i;  /* expr */
		if (info->aConstraint[i].iColumn == 4) dataIdx = i;  /* data */
	}
	if (exprIdx < 0 || dataIdx < 0) {
		return SQLITE_CONSTRAINT;
	}
	info->aConstraintUsage[exprIdx].argvIndex = 1;
	info->aConstraintUsage[exprIdx].omit = 1;
	info->aConstraintUsage[dataIdx].argvIndex = 2;
	info->aConstraintUsage[dataIdx].omit = 1;
	info->estimatedCost = 100;
	info->estimatedRows = 10;
	return SQLITE_OK;
}

static int each_open(sqlite3_vtab *vtab, sqlite3_vtab_cursor **ppCursor) {
	(void)vtab;
	EachCursor *cur = (EachCursor*)sqlite3_malloc(sizeof(EachCursor));
	if (!cur) return SQLITE_NOMEM;
	memset(cur, 0, sizeof(EachCursor));
	cur->cursor_id = goEachNewCursor();
	*ppCursor = &cur->base;
	return SQLITE_OK;
}

static int each_close(sqlite3_vtab_cursor *cursor) {
	EachCursor *cur = (EachCursor*)cursor;
	goEachFreeCursor(cur->cursor_id);
	sqlite3_free(cur);
	return SQLITE_OK;
}

static int each_filter(sqlite3_vtab_cursor *cursor, int idxNum, const char *idxStr,
                       int argc, sqlite3_value **argv) {
	(void)idxNum; (void)idxStr;
	EachCursor *cur = (EachCursor*)cursor;
	if (argc < 2) return SQLITE_ERROR;
	const char *expr = (const char*)sqlite3_value_text(argv[0]);
	int exprLen = sqlite3_value_bytes(argv[0]);
	const char *data = (const char*)sqlite3_value_text(argv[1]);
	int dataLen = sqlite3_value_bytes(argv[1]);
	return goEachFilter(cur->cursor_id, expr, exprLen, data, dataLen);
}

static int each_next(sqlite3_vtab_cursor *cursor) {
	EachCursor *cur = (EachCursor*)cursor;
	return goEachNext(cur->cursor_id);
}

static int each_eof(sqlite3_vtab_cursor *cursor) {
	EachCursor *cur = (EachCursor*)cursor;
	return goEachEof(cur->cursor_id);
}

static int each_column(sqlite3_vtab_cursor *cursor, sqlite3_context *ctx, int col) {
	EachCursor *cur = (EachCursor*)cursor;
	goEachColumn(ctx, cur->cursor_id, col);
	return SQLITE_OK;
}

static int each_rowid(sqlite3_vtab_cursor *cursor, sqlite3_int64 *pRowid) {
	EachCursor *cur = (EachCursor*)cursor;
	*pRowid = goEachRowid(cur->cursor_id);
	return SQLITE_OK;
}

static sqlite3_module each_module = {
	0,                  /* iVersion */
	0,                  /* xCreate — NULL for eponymous-only */
	each_connect,       /* xConnect */
	each_best_index,    /* xBestIndex */
	each_disconnect,    /* xDisconnect */
	0,                  /* xDestroy */
	each_open,          /* xOpen */
	each_close,         /* xClose */
	each_filter,        /* xFilter */
	each_next,          /* xNext */
	each_eof,           /* xEof */
	each_column,        /* xColumn */
	each_rowid,         /* xRowid */
	0,                  /* xUpdate */
	0,                  /* xBegin */
	0,                  /* xSync */
	0,                  /* xCommit */
	0,                  /* xRollback */
	0,                  /* xFindFunction */
	0,                  /* xRename */
	0,                  /* xSavepoint */
	0,                  /* xRelease */
	0,                  /* xRollbackTo */
	0,                  /* xShadowName */
};

int go_create_each_module(sqlite3 *db) {
	return sqlite3_create_module_v2(db, "jsonata_each", &each_module, 0, 0);
}
