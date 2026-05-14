import { permissions, type RequestContext } from "@phi-ba/contracts";
import { createId } from "@phi-ba/shared";
import { blocked } from "./errors.js";
import { safetyGateService } from "./safety-gates.js";
import { store, type PlatformStore } from "./store.js";
import type { Connector, JsonRecord } from "./platform-types.js";

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
    return { status: connector.status, message: `PostgreSQL connector ${connector.name} is ${connector.status}.` };
  }

  test(connector: Connector): { ok: boolean; message: string } {
    return { ok: connector.status !== "unknown", message: "Local MVP validates config without opening production database connections." };
  }

  async execute(connector: Connector, payload: JsonRecord): Promise<JsonRecord> {
    return {
      connectorId: connector.id,
      mode: "mock-readonly",
      rows: payload.sql ? mockRowsForSql(String(payload.sql)) : [],
      executedAt: new Date().toISOString()
    };
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

function mockRowsForSql(sql: string): JsonRecord[] {
  if (/risk_izleme/i.test(sql)) {
    return [
      { urun_adi: "Ticari Kredi", segment: "KOBI", npl_orani: 8.4, aktif_musteri: 6210, riskli_bakiye: 31800000 },
      { urun_adi: "Ihtiyac Kredisi", segment: "Bireysel", npl_orani: 6.9, aktif_musteri: 28940, riskli_bakiye: 26750000 }
    ];
  }
  if (/kart_islemleri/i.test(sql)) {
    return [
      { kanal: "Sanal POS", saat_dilimi: "18:00-20:00", onay_orani: 71.8, reddedilen_islem: 21840, kayip_hacim: 12100000 }
    ];
  }
  return [
    { urun: "Kredi Karti Premium", segment: "Ust Gelir", islem_adedi: 184210, islem_hacmi: 91428000 },
    { urun: "Konut Kredisi", segment: "Bireysel", islem_adedi: 9120, islem_hacmi: 76452000 }
  ];
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
    safetyGateService.assertAllowed(context, {
      tenantId: context.tenantId,
      operationType: "connector",
      operationId: connector.id,
      connectorId: connector.id,
      requiredPermission: permissions.connectorsExecute,
      payload
    });
    const output = await this.registry.get(connector.type).execute(connector, payload);
    this.repository.appendAudit({
      tenantId: context.tenantId,
      actorUserId: context.userId,
      eventType: "CONNECTOR_OPERATION",
      action: "connector.execute",
      resourceType: "connector",
      resourceId: connector.id,
      correlationId: context.correlationId,
      metadata: { payload, output }
    });
    return output;
  }
}

export const connectorService = new ConnectorService(store);
