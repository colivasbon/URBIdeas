// Declaraciones del módulo SQLite integrado en Node 22 o superior.
//
// El proyecto usa una versión de @types/node que todavía no incluye node:sqlite,
// y el GeoPackage se escribe con ese módulo para no añadir dependencias. Solo se
// declara la superficie que realmente se utiliza.

declare module "node:sqlite" {
  export interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export class StatementSync {
    run(...params: unknown[]): StatementResultingChanges;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    iterate(...params: unknown[]): IterableIterator<unknown>;
    setAllowBareNamedParameters(allow: boolean): void;
    setReadBigInts(enabled: boolean): void;
    sourceSQL(): string;
    expandedSQL(): string;
    columns(): unknown[];
  }

  export class DatabaseSync {
    constructor(location: string, options?: { open?: boolean; readOnly?: boolean });
    exec(sql: string): this;
    prepare(sql: string): StatementSync;
    close(): this;
    open(): this;
    function(name: string, options: { deterministic?: boolean; directOnly?: boolean }, fn: (...args: unknown[]) => unknown): void;
    aggregate(name: string, options: { deterministic?: boolean; directOnly?: boolean }, fn: (...args: unknown[]) => unknown): void;
    loadExtension(path: string): this;
    createFunction(name: string, fn: (...args: unknown[]) => unknown): this;
    backup(path: string): Promise<number>;
  }

  export const constants: Record<string, number | bigint>;
}
