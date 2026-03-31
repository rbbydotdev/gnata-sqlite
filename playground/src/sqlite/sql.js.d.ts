declare module 'sql.js' {
  interface SqlJsStatic {
    Database: new () => Database;
  }
  interface Database {
    run(sql: string, params?: unknown[]): void;
    exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
    prepare(sql: string): Statement;
    create_function(name: string, fn: (...args: unknown[]) => unknown): void;
    create_aggregate(name: string, agg: {
      init: () => unknown;
      step: (state: unknown, ...args: unknown[]) => unknown;
      finalize: (state: unknown) => unknown;
    }): void;
  }
  interface Statement {
    run(params?: unknown[]): void;
    free(): void;
  }
  interface SqlJsOptions {
    locateFile?: (filename: string) => string;
  }
  export default function initSqlJs(options?: SqlJsOptions): Promise<SqlJsStatic>;
}
