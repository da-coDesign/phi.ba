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
const ignoredSqlIdentifiers = new Set([
  "all",
  "and",
  "as",
  "asc",
  "between",
  "by",
  "case",
  "desc",
  "distinct",
  "else",
  "end",
  "false",
  "filter",
  "from",
  "group",
  "in",
  "is",
  "join",
  "like",
  "limit",
  "not",
  "null",
  "offset",
  "on",
  "or",
  "order",
  "over",
  "partition",
  "select",
  "then",
  "true",
  "when",
  "where"
]);

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
  const selectClause = extractSelectClause(sql);
  if (!selectClause) return [];
  const columns = new Set<string>();
  for (const item of splitTopLevel(selectClause)) {
    const expression = stripSelectAlias(item.trim());
    if (/^(?:[a-zA-Z_][a-zA-Z0-9_]*\.)?\*$/.test(expression)) {
      columns.add("*");
      continue;
    }
    for (const column of extractIdentifiersFromExpression(expression)) {
      columns.add(column);
    }
  }
  return Array.from(columns);
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

function extractSelectClause(sql: string): string {
  const selectMatch = /\bselect\b/i.exec(sql);
  if (!selectMatch) return "";
  const start = selectMatch.index + selectMatch[0].length;
  const fromIndex = findTopLevelKeyword(sql, "from", start);
  return fromIndex === -1 ? "" : sql.slice(start, fromIndex).trim();
}

function findTopLevelKeyword(sql: string, keyword: string, start: number): number {
  let depth = 0;
  let quote: "'" | "\"" | undefined;
  for (let index = start; index < sql.length; index += 1) {
    const char = sql[index];
    if (quote) {
      if (char === quote) {
        if (quote === "'" && sql[index + 1] === "'") {
          index += 1;
        } else {
          quote = undefined;
        }
      }
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && isKeywordAt(sql, keyword, index)) return index;
  }
  return -1;
}

function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: "'" | "\"" | undefined;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === quote) {
        if (quote === "'" && value[index + 1] === "'") {
          index += 1;
        } else {
          quote = undefined;
        }
      }
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function stripSelectAlias(expression: string): string {
  const asAliasMatch = expression.match(/^([\s\S]+?)\s+\bas\b\s+"?[a-zA-Z_][a-zA-Z0-9_]*"?$/i);
  if (asAliasMatch?.[1]) return asAliasMatch[1].trim();
  const bareAliasMatch = expression.match(/^([\s\S]*[\)\.\+\-\*\/])\s+"?[a-zA-Z_][a-zA-Z0-9_]*"?$/);
  return bareAliasMatch?.[1]?.trim() ?? expression;
}

function extractIdentifiersFromExpression(expression: string): string[] {
  const withoutLiterals = expression.replace(/'([^']|'')*'/g, " ");
  const identifiers: string[] = [];
  const pattern = /[a-zA-Z_][a-zA-Z0-9_]*/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(withoutLiterals)) !== null) {
    const identifier = match[0];
    const lower = identifier.toLowerCase();
    const previousChar = withoutLiterals[match.index - 1] ?? "";
    const previousPreviousChar = withoutLiterals[match.index - 2] ?? "";
    const nextChar = nextNonWhitespace(withoutLiterals, pattern.lastIndex);
    if (ignoredSqlIdentifiers.has(lower)) continue;
    if (nextChar === "(" || nextChar === ".") continue;
    if (previousChar === ":" && previousPreviousChar === ":") continue;
    identifiers.push(identifier);
  }
  return identifiers;
}

function nextNonWhitespace(value: string, start: number): string {
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (char && !/\s/.test(char)) return char;
  }
  return "";
}

function isKeywordAt(sql: string, keyword: string, index: number): boolean {
  const candidate = sql.slice(index, index + keyword.length);
  if (candidate.toLowerCase() !== keyword.toLowerCase()) return false;
  return !isIdentifierChar(sql[index - 1]) && !isIdentifierChar(sql[index + keyword.length]);
}

function isIdentifierChar(char: string | undefined): boolean {
  return Boolean(char && /[a-zA-Z0-9_]/.test(char));
}
