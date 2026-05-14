import { blocked } from "./errors.js";
import type { Connector } from "./platform-types.js";

const forbiddenSqlPatterns = [
  /\binsert\b/i,
  /\bupdate\b/i,
  /\bdelete\b/i,
  /\bmerge\b/i,
  /\bdrop\b/i,
  /\balter\b/i,
  /\bcreate\b/i,
  /\btruncate\b/i,
  /\bgrant\b/i,
  /\brevoke\b/i,
  /\bcopy\b/i,
  /\bcall\b/i,
  /\bexecute\b/i,
  /\bbegin\b/i,
  /\bcommit\b/i,
  /\brollback\b/i,
  /\bset\s+role\b/i,
  /;/,
  /--/,
  /\/\*/
];

const piiColumnPatterns = [/email/i, /phone/i, /telefon/i, /tckn/i, /kimlik/i, /pan/i, /card/i, /adres/i];

export interface SqlSafetyResult {
  ok: boolean;
  reason?: string;
  tables: string[];
  columns: string[];
  hasPiiColumns: boolean;
}

export function isReadOnlySql(sql: string): boolean {
  const compact = sql.trim();
  return /^select\b/i.test(compact) && !forbiddenSqlPatterns.some((pattern) => pattern.test(compact));
}

export function extractSqlTables(sql: string): string[] {
  const tables = new Set<string>();
  const tablePattern = /\b(?:from|join)\s+([a-zA-Z_][a-zA-Z0-9_\.]*)/gi;
  let match: RegExpExecArray | null;
  while ((match = tablePattern.exec(sql)) !== null) {
    const table = match[1]?.split(".").pop();
    if (table) tables.add(table);
  }
  return Array.from(tables);
}

export function extractSqlColumns(sql: string): string[] {
  const selectMatch = sql.match(/\bselect\s+([\s\S]+?)\s+\bfrom\b/i);
  if (!selectMatch?.[1]) return [];
  return selectMatch[1]
    .split(",")
    .map((part) => part.trim())
    .map((part) => part.replace(/\bas\b\s+[a-zA-Z_][a-zA-Z0-9_]*$/i, "").trim())
    .map((part) => part.split(".").pop()?.replace(/[^a-zA-Z0-9_]/g, "") ?? "")
    .filter(Boolean)
    .filter((column) => !/^(count|sum|avg|min|max)$/i.test(column));
}

export function validateSqlAgainstConnector(sql: string, connector: Connector): SqlSafetyResult {
  const tables = extractSqlTables(sql);
  const columns = extractSqlColumns(sql);
  if (!isReadOnlySql(sql)) {
    return { ok: false, reason: "SQL must be a single read-only SELECT without comments, DDL, DML, transactions, or semicolons.", tables, columns, hasPiiColumns: false };
  }
  const allowedTables = connector.allowedTables ?? [];
  const unknownTable = tables.find((table) => !allowedTables.includes(table));
  if (unknownTable) {
    return { ok: false, reason: `Table ${unknownTable} is not allowlisted for connector ${connector.name}.`, tables, columns, hasPiiColumns: false };
  }
  const allAllowedColumns = new Set(Object.values(connector.allowedColumns ?? {}).flat());
  const unknownColumn = columns.find((column) => allAllowedColumns.size > 0 && !allAllowedColumns.has(column));
  if (unknownColumn && unknownColumn !== "*") {
    return { ok: false, reason: `Column ${unknownColumn} is not allowlisted for connector ${connector.name}.`, tables, columns, hasPiiColumns: false };
  }
  const hasPiiColumns = columns.some((column) => piiColumnPatterns.some((pattern) => pattern.test(column)));
  return { ok: true, tables, columns, hasPiiColumns };
}

export function assertReadOnlySql(sql: string): void {
  if (!isReadOnlySql(sql)) {
    throw blocked("Generated SQL failed the read-only safety guard");
  }
}
