import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function loadLocalEnv(): void {
  for (const filePath of findEnvFiles()) {
    const contents = readFileSync(filePath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      const [key, value] = parsed;
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

function findEnvFiles(): string[] {
  const root = findRepoRoot(process.cwd());
  return [".env", ".env.local"]
    .map((name) => resolve(root, name))
    .filter((filePath) => existsSync(filePath));
}

function findRepoRoot(start: string): string {
  let current = start;
  for (let depth = 0; depth < 5; depth += 1) {
    if (existsSync(resolve(current, "package.json")) && existsSync(resolve(current, "apps"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) return start;
    current = parent;
  }
  return start;
}

function parseEnvLine(line: string): [string, string] | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return undefined;
  const normalized = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
  const separator = normalized.indexOf("=");
  if (separator <= 0) return undefined;
  const key = normalized.slice(0, separator).trim();
  const value = unquote(normalized.slice(separator + 1).trim());
  return /^[A-Z0-9_]+$/i.test(key) ? [key, value] : undefined;
}

function unquote(value: string): string {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
