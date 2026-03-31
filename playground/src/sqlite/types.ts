/** Messages sent TO the worker */
export type WorkerInMessage =
  | { type: 'init'; wasmExecText: string; wasmBytes: ArrayBuffer }
  | { type: 'generate'; count: number; pools: DataPools }
  | { type: 'query'; sql: string };

/** Messages sent FROM the worker */
export type WorkerOutMessage =
  | { type: 'ready' }
  | { type: 'progress'; pct: number; msg: string }
  | { type: 'generated'; count: number; custCount: number; elapsed: string }
  | { type: 'queryResult'; columns: string[]; values: CellValue[][]; totalRows: number; time: number; sampled: SampledInfo | null; noRows?: boolean }
  | { type: 'queryError'; msg: string }
  | { type: 'error'; msg: string };

export type CellValue = string | number | null;

export interface SampledInfo {
  sampled: number;
  total: number;
}

export interface DataPools {
  products: string[];
  addresses: string[];
  names: string[];
  emails: string[];
  cities: string[];
  countries: string[];
}

export interface QueryResult {
  columns: string[];
  values: CellValue[][];
  totalRows: number;
  time: number;
  sampled: SampledInfo | null;
  noRows?: boolean;
}
