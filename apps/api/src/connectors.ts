import { permissions, type RequestContext } from "@phi-ba/contracts";
import { createId } from "@phi-ba/shared";
import pg from "pg";
import { blocked } from "./errors.js";
import { safetyGateService } from "./safety-gates.js";
import { store, type PlatformStore } from "./store.js";
import type { Connector, JsonRecord } from "./platform-types.js";

const { Pool } = pg;
const pools = new Map<string, pg.Pool>();
const DEFAULT_DATABASE_URL_ENV_NAMES = ["DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL_NON_POOLING"] as const;

export interface ConnectorAdapter {
  type: Connector["type"];
  validate(config: JsonRecord): string[];
  health(connector: Connector): { status: Connector["status"]; message: string };
  test(connector: Connector): { ok: boolean; message: string };
  execute(connector: Connector, payload: JsonRecord): Promise<JsonRecord>;
}

class PostgreSqlConnectorAdapter implements ConnectorAdapter {
  type: Connector["type"] = "postgresql";

  validate(config: JsonRecord): string[] {
    const errors: string[] = [];
    if (!config.host) errors.push("host is required");
    if (!config.database) errors.push("database is required");
    if (config.role !== "readonly") errors.push("role must be readonly");
    return errors;
  }

  health(connector: Connector): { status: Connector["status"]; message: string } {
    const credentialStatus = getPostgresCredentialStatus(connector);
    const databaseUrlEnv = credentialStatus.databaseUrlEnv ?? "DATABASE_URL";
    const hasDatabaseUrl = Boolean(credentialStatus.hasDatabaseUrl);
    const mode = hasDatabaseUrl ? "postgres" : "unavailable";
    return { status: connector.status, message: `PostgreSQL connector ${connector.name} is ${connector.status}; execution mode is ${mode}.` };
  }

  test(connector: Connector): { ok: boolean; message: string } {
    const credentialStatus = getPostgresCredentialStatus(connector);
    const databaseUrlEnv = credentialStatus.databaseUrlEnv ?? "DATABASE_URL";
    const hasDatabaseUrl = Boolean(credentialStatus.hasDatabaseUrl);
    return {
      ok: connector.status !== "unknown" && hasDatabaseUrl,
      message: hasDatabaseUrl
        ? `Read-only connection will use ${databaseUrlEnv}; run a governed query to verify permissions.`
        : `${databaseUrlEnv} is not set; PostgreSQL execution is required for this connector.`
    };
  }

  async execute(connector: Connector, payload: JsonRecord): Promise<JsonRecord> {
    const sql = typeof payload.sql === "string" ? payload.sql : "";
    if (!sql) {
      return { connectorId: connector.id, mode: "postgres-readonly", rows: [], rowCount: 0, executedAt: new Date().toISOString() };
    }
    const startedAt = Date.now();
    const timeoutMs = Math.min(Number(payload.timeoutMs ?? connector.config.timeoutMs ?? 8000), 15000);
    const databaseUrl = resolveDatabaseUrl(connector);
    if (!databaseUrl) throw blocked(getMissingDatabaseUrlMessage(connector));
    try {
      const result = await runPostgresQuery(databaseUrl, sql, timeoutMs);
      return {
        connectorId: connector.id,
        mode: "postgres-readonly",
        source: "postgres",
        rows: result.rows,
        rowCount: result.rowCount,
        columns: result.fields.map((field) => field.name),
        queryMs: Date.now() - startedAt,
        executedAt: new Date().toISOString()
      };
    } catch {
      throw blocked("PostgreSQL execution failed; verify DATABASE_URL, migrations, seed data, and read-only permissions.");
    }
  }
}

class RestApiConnectorAdapter implements ConnectorAdapter {
  type: Connector["type"] = "rest_api";

  validate(config: JsonRecord): string[] {
    const errors: string[] = [];
    if (!config.baseUrl) errors.push("baseUrl is required");
    if (!["GET", "POST", undefined].includes(config.method as string | undefined)) errors.push("method must be GET or POST");
    return errors;
  }

  health(connector: Connector): { status: Connector["status"]; message: string } {
    return { status: connector.status, message: `REST connector ${connector.name} is ${connector.status}.` };
  }

  test(): { ok: boolean; message: string } {
    return { ok: true, message: "REST connector placeholder validates governance configuration only." };
  }

  async execute(connector: Connector): Promise<JsonRecord> {
    return { connectorId: connector.id, mode: "mock-rest", items: [] };
  }
}

class UploadConnectorAdapter implements ConnectorAdapter {
  constructor(public readonly type: Connector["type"]) {}

  validate(config: JsonRecord): string[] {
    const errors: string[] = [];
    if (typeof config.maxFileMb === "number" && config.maxFileMb > 100) errors.push("maxFileMb must be <= 100");
    return errors;
  }

  health(connector: Connector): { status: Connector["status"]; message: string } {
    return { status: connector.status, message: `${connector.type} connector ${connector.name} is ${connector.status}.` };
  }

  test(): { ok: boolean; message: string } {
    return { ok: true, message: "Upload connector placeholder is ready for local ingestion." };
  }

  async execute(connector: Connector, payload: JsonRecord): Promise<JsonRecord> {
    return { connectorId: connector.id, accepted: true, fileName: payload.fileName ?? "inline-content" };
  }
}

class PlaceholderConnectorAdapter implements ConnectorAdapter {
  constructor(public readonly type: Connector["type"]) {}

  validate(): string[] {
    return [];
  }

  health(connector: Connector): { status: Connector["status"]; message: string } {
    return { status: connector.status, message: `${connector.type} adapter is configured as a production placeholder.` };
  }

  test(): { ok: boolean; message: string } {
    return { ok: true, message: "Placeholder adapter is registered; production credentials are not required locally." };
  }

  async execute(connector: Connector): Promise<JsonRecord> {
    return { connectorId: connector.id, skipped: true, reason: "Production adapter placeholder." };
  }
}

export class ConnectorRegistry {
  private adapters = new Map<Connector["type"], ConnectorAdapter>();

  register(adapter: ConnectorAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  get(type: Connector["type"]): ConnectorAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) throw blocked(`Connector adapter ${type} is not registered`);
    return adapter;
  }

  list(): string[] {
    return Array.from(this.adapters.keys());
  }
}

export class ConnectorService {
  public readonly registry = new ConnectorRegistry();

  constructor(private readonly repository: PlatformStore) {
    this.registry.register(new PostgreSqlConnectorAdapter());
    this.registry.register(new RestApiConnectorAdapter());
    this.registry.register(new UploadConnectorAdapter("csv_upload"));
    this.registry.register(new UploadConnectorAdapter("document_upload"));
    this.registry.register(new PlaceholderConnectorAdapter("sftp"));
    this.registry.register(new PlaceholderConnectorAdapter("sharepoint"));
    this.registry.register(new PlaceholderConnectorAdapter("web_source"));
  }

  list(context: RequestContext): Connector[] {
    return this.repository.listConnectors(context.tenantId);
  }

  create(context: RequestContext, input: Omit<Connector, "id" | "tenantId" | "status" | "permissions"> & { status?: Connector["status"] }): Connector {
    safetyGateService.assertAllowed(context, {
      tenantId: context.tenantId,
      operationType: "service",
      operationId: createId("connector_create"),
      requiredPermission: permissions.connectorsWrite,
      payload: input
    });
    const adapter = this.registry.get(input.type);
    const errors = adapter.validate(input.config);
    if (errors.length) throw blocked(`Connector validation failed: ${errors.join(", ")}`);
    const connector: Connector = {
      id: createId("connector"),
      tenantId: context.tenantId,
      status: input.status ?? "unknown",
      permissions: [permissions.connectorsExecute],
      ...input
    };
    const created = this.repository.appendConnector(connector);
    this.repository.appendAudit({
      tenantId: context.tenantId,
      actorUserId: context.userId,
      eventType: "CONNECTOR_OPERATION",
      action: "connector.create",
      resourceType: "connector",
      resourceId: created.id,
      correlationId: context.correlationId,
      metadata: { type: created.type, name: created.name }
    });
    return created;
  }

  health(context: RequestContext, connectorId: string): JsonRecord {
    const connector = this.repository.getConnector(context.tenantId, connectorId);
    safetyGateService.assertAllowed(context, {
      tenantId: context.tenantId,
      operationType: "connector",
      operationId: connector.id,
      connectorId: connector.id,
      requiredPermission: permissions.connectorsRead
    });
    return this.registry.get(connector.type).health(connector);
  }

  test(context: RequestContext, connectorId: string): JsonRecord {
    const connector = this.repository.getConnector(context.tenantId, connectorId);
    safetyGateService.assertAllowed(context, {
      tenantId: context.tenantId,
      operationType: "connector",
      operationId: connector.id,
      connectorId: connector.id,
      requiredPermission: permissions.connectorsExecute
    });
    const result = this.registry.get(connector.type).test(connector);
    this.repository.appendAudit({
      tenantId: context.tenantId,
      actorUserId: context.userId,
      eventType: "CONNECTOR_OPERATION",
      action: "connector.test",
      resourceType: "connector",
      resourceId: connector.id,
      correlationId: context.correlationId,
      metadata: result
    });
    return result;
  }

  async execute(context: RequestContext, connectorId: string, payload: JsonRecord): Promise<JsonRecord> {
    const connector = this.repository.getConnector(context.tenantId, connectorId);
    if (connector.type === "postgresql" && typeof payload.sql === "string") {
      safetyGateService.assertAllowed(context, {
        tenantId: context.tenantId,
        operationType: "sql_query",
        operationId: connector.id,
        connectorId: connector.id,
        requiredPermission: permissions.queryExecute,
        sql: payload.sql,
        maskingEnabled: Boolean(payload.maskingEnabled ?? true),
        payload
      });
    } else {
      safetyGateService.assertAllowed(context, {
        tenantId: context.tenantId,
        operationType: "connector",
        operationId: connector.id,
        connectorId: connector.id,
        requiredPermission: permissions.connectorsExecute,
        payload
      });
    }
    const output = await this.registry.get(connector.type).execute(connector, payload);
    this.repository.appendAudit({
      tenantId: context.tenantId,
      actorUserId: context.userId,
      eventType: "CONNECTOR_OPERATION",
      action: "connector.execute",
      resourceType: "connector",
      resourceId: connector.id,
      correlationId: context.correlationId,
      metadata: {
        payload: { ...payload, sql: typeof payload.sql === "string" ? payload.sql : undefined },
        output: {
          mode: output.mode,
          source: output.source,
          topic: output.topic,
          rowCount: output.rowCount ?? (Array.isArray(output.rows) ? output.rows.length : 0)
        }
      }
    });
    return output;
  }
}

export const connectorService = new ConnectorService(store);

export function getPostgresCredentialStatus(connector?: Connector): JsonRecord {
  const envNames = getDatabaseUrlEnvNames(connector);
  const source = envNames.find((envName) => Boolean(process.env[envName]?.trim()));
  return {
    hasDatabaseUrl: Boolean(source),
    databaseUrlEnv: source ?? envNames[0] ?? "DATABASE_URL",
    checkedDatabaseEnvVars: envNames,
    databaseUrlSource: source ?? null
  };
}

function resolveDatabaseUrl(connector: Connector): string | undefined {
  for (const envName of getDatabaseUrlEnvNames(connector)) {
    const value = process.env[envName]?.trim();
    if (value) return value;
  }
  return undefined;
}

function getDatabaseUrlEnvNames(connector?: Connector): string[] {
  const configured = typeof connector?.config.databaseUrlEnv === "string" ? connector.config.databaseUrlEnv : "DATABASE_URL";
  return Array.from(new Set([configured, ...DEFAULT_DATABASE_URL_ENV_NAMES]));
}

function getMissingDatabaseUrlMessage(connector: Connector): string {
  const envNames = getDatabaseUrlEnvNames(connector);
  return [
    `${envNames[0] ?? "DATABASE_URL"} is not visible to the server runtime.`,
    "Set a server-side PostgreSQL connection string for the active Vercel environment, then redeploy.",
    `Accepted env names: ${envNames.join(", ")}.`,
    "Run migrations and seed FBDWHPRD before querying."
  ].join(" ");
}

async function runPostgresQuery(databaseUrl: string, sql: string, timeoutMs: number): Promise<pg.QueryResult<JsonRecord>> {
  const poolKey = `${databaseUrl}:${timeoutMs}`;
  let pool = pools.get(poolKey);
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      max: 4,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: Math.min(timeoutMs, 5000),
      query_timeout: timeoutMs
    });
    pools.set(poolKey, pool);
  }
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      pool.query<JsonRecord>(sql),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("query_timeout")), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
