import type { OperationType, PermissionKey, RequestContext, SafetyGateDecision, SafetyGateStatus } from "@phi-ba/contracts";
import { blocked } from "./errors.js";
import { hasPermission } from "./request-context.js";
import { store, type PlatformStore } from "./store.js";
import { validateSqlAgainstConnector } from "./sql-safety.js";
import type { JsonRecord, SafetyGateCheck, SafetyGateRun } from "./platform-types.js";

export interface SafetyGateOperation {
  operationType: OperationType;
  operationId?: string;
  tenantId: string;
  requiredPermission?: PermissionKey;
  connectorId?: string;
  sql?: string;
  model?: string;
  vectorIndexName?: string;
  toolKey?: string;
  riskLevel?: "low" | "medium" | "high";
  approvalId?: string;
  sourceId?: string;
  notificationChannel?: string;
  rollbackPlan?: JsonRecord;
  sandbox?: boolean;
  liveMutationTarget?: boolean;
  maskingEnabled?: boolean;
  config?: JsonRecord;
  payload?: JsonRecord;
}

type SafetyGateHandler = (context: RequestContext, operation: SafetyGateOperation) => SafetyGateDecision;

const operationCheckMap: Record<OperationType, string[]> = {
  service: ["tenant_isolation", "rbac_permission", "audit_log_writability"],
  connector: ["tenant_isolation", "rbac_permission", "secret_reference", "connector_health", "audit_log_writability"],
  sql_query: [
    "tenant_isolation",
    "rbac_permission",
    "secret_reference",
    "connector_health",
    "database_permission",
    "sql_read_only",
    "schema_compatibility",
    "pii_masking_required",
    "audit_log_writability"
  ],
  agent: [
    "tenant_isolation",
    "rbac_permission",
    "model_availability",
    "agent_tool_permission",
    "human_approval_policy",
    "audit_log_writability"
  ],
  workflow: [
    "tenant_isolation",
    "rbac_permission",
    "human_approval_policy",
    "notification_channel_availability",
    "rollback_readiness",
    "audit_log_writability"
  ],
  external_ingestion: ["tenant_isolation", "rbac_permission", "external_ingestion_governance", "audit_log_writability"],
  model_call: ["tenant_isolation", "rbac_permission", "model_availability", "pii_masking_required", "audit_log_writability"],
  notification: ["tenant_isolation", "rbac_permission", "notification_channel_availability", "audit_log_writability"],
  simulation: ["tenant_isolation", "rbac_permission", "simulation_sandbox_boundary", "human_approval_policy", "audit_log_writability"],
  rag_retrieval: ["tenant_isolation", "rbac_permission", "vector_index_freshness", "audit_log_writability"],
  rag_ingestion: ["tenant_isolation", "rbac_permission", "secret_reference", "audit_log_writability"]
};

export class SafetyGateService {
  private handlers = new Map<string, SafetyGateHandler>();

  constructor(private readonly repository: PlatformStore) {
    this.registerDefaults();
  }

  listChecks(): SafetyGateCheck[] {
    return this.repository.snapshot().safetyGateChecks;
  }

  registerCheck(check: SafetyGateCheck, handler: SafetyGateHandler): void {
    const state = this.repository.snapshot();
    if (!state.safetyGateChecks.some((existing) => existing.key === check.key)) {
      state.safetyGateChecks.push(check);
    }
    this.handlers.set(check.key, handler);
  }

  runManual(context: RequestContext, input: SafetyGateOperation & { checkKeys?: string[] }): SafetyGateRun[] {
    return this.run(context, input, input.checkKeys ?? operationCheckMap[input.operationType]);
  }

  runForOperation(context: RequestContext, operation: SafetyGateOperation): SafetyGateRun[] {
    return this.run(context, operation, operationCheckMap[operation.operationType]);
  }

  assertAllowed(context: RequestContext, operation: SafetyGateOperation): SafetyGateRun[] {
    const runs = this.runForOperation(context, operation);
    const blockers = runs.filter((run) => run.status === "BLOCKED");
    if (blockers.length > 0) {
      throw blocked(blockers.map((run) => `${run.checkKey}: ${run.message}`).join("; "));
    }
    return runs;
  }

  private run(context: RequestContext, operation: SafetyGateOperation, checkKeys: string[]): SafetyGateRun[] {
    return checkKeys
      .filter((checkKey) => this.listChecks().find((check) => check.key === checkKey)?.enabled !== false)
      .map((checkKey) => {
        const handler = this.handlers.get(checkKey);
        const decision = handler
          ? handler(context, operation)
          : { checkKey, status: "WARNING" as SafetyGateStatus, message: `No handler registered for ${checkKey}` };
        const run = this.repository.appendSafetyRun({
          tenantId: context.tenantId,
          checkKey,
          operationType: operation.operationType,
          operationId: operation.operationId,
          status: decision.status,
          message: decision.message,
          details: decision.details
        });
        this.repository.appendAudit({
          tenantId: context.tenantId,
          actorUserId: context.userId,
          eventType: "SAFETY_GATE",
          action: `safety_gate.${decision.status.toLowerCase()}`,
          resourceType: operation.operationType,
          resourceId: operation.operationId,
          correlationId: context.correlationId,
          metadata: { checkKey, message: decision.message, details: decision.details }
        });
        return run;
      });
  }

  private registerDefaults(): void {
    this.handlers.set("tenant_isolation", (context, operation) => {
      if (operation.tenantId !== context.tenantId) {
        return {
          checkKey: "tenant_isolation",
          status: "BLOCKED",
          message: `Operation tenant ${operation.tenantId} does not match context tenant ${context.tenantId}.`
        };
      }
      return { checkKey: "tenant_isolation", status: "PASS", message: "Tenant context is valid." };
    });

    this.handlers.set("secret_reference", (_context, operation) => {
      const serialized = JSON.stringify({ config: operation.config, payload: operation.payload });
      if (/(password|apiKey|secret|token)["']?\s*:/i.test(serialized)) {
        return {
          checkKey: "secret_reference",
          status: "BLOCKED",
          message: "Raw secret-like fields are not allowed in operation payloads."
        };
      }
      if (!operation.connectorId) return { checkKey: "secret_reference", status: "PASS", message: "No connector secret required." };
      const connector = this.repository.getConnector(operation.tenantId, operation.connectorId);
      if (!connector.secretReferenceId && connector.type === "postgresql") {
        return { checkKey: "secret_reference", status: "BLOCKED", message: "PostgreSQL connector requires a secret reference." };
      }
      const exists = this.repository.snapshot().secretReferences.some((secret) =>
        secret.tenantId === operation.tenantId && secret.id === connector.secretReferenceId
      );
      return exists
        ? { checkKey: "secret_reference", status: "PASS", message: "Secret reference exists and raw secret storage was avoided." }
        : { checkKey: "secret_reference", status: "BLOCKED", message: "Connector secret reference was not found." };
    });

    this.handlers.set("connector_health", (_context, operation) => {
      if (!operation.connectorId) return { checkKey: "connector_health", status: "PASS", message: "No connector required." };
      const connector = this.repository.getConnector(operation.tenantId, operation.connectorId);
      if (connector.status === "healthy") return { checkKey: "connector_health", status: "PASS", message: "Connector is healthy." };
      return {
        checkKey: "connector_health",
        status: connector.status === "degraded" ? "WARNING" : "BLOCKED",
        message: `Connector status is ${connector.status}.`
      };
    });

    this.handlers.set("database_permission", (context, operation) => {
      if (!operation.connectorId) return { checkKey: "database_permission", status: "PASS", message: "No database connector required." };
      const connector = this.repository.getConnector(operation.tenantId, operation.connectorId);
      if (connector.type !== "postgresql") return { checkKey: "database_permission", status: "PASS", message: "Connector is not a database." };
      if (!hasPermission(context, "query:execute")) {
        return { checkKey: "database_permission", status: "BLOCKED", message: "Actor lacks query execution permission." };
      }
      return connector.config.role === "readonly"
        ? { checkKey: "database_permission", status: "PASS", message: "Database connector is read-only." }
        : { checkKey: "database_permission", status: "BLOCKED", message: "Database connector must use a read-only role." };
    });

    this.handlers.set("sql_read_only", (_context, operation) => {
      if (!operation.sql || !operation.connectorId) return { checkKey: "sql_read_only", status: "PASS", message: "No SQL submitted." };
      const connector = this.repository.getConnector(operation.tenantId, operation.connectorId);
      const result = validateSqlAgainstConnector(operation.sql, connector);
      return result.ok
        ? { checkKey: "sql_read_only", status: "PASS", message: "SQL is read-only." }
        : { checkKey: "sql_read_only", status: "BLOCKED", message: result.reason ?? "SQL failed safety validation.", details: { ...result } };
    });

    this.handlers.set("schema_compatibility", (_context, operation) => {
      if (!operation.sql || !operation.connectorId) return { checkKey: "schema_compatibility", status: "PASS", message: "No SQL schema check required." };
      const connector = this.repository.getConnector(operation.tenantId, operation.connectorId);
      const result = validateSqlAgainstConnector(operation.sql, connector);
      return result.ok
        ? { checkKey: "schema_compatibility", status: "PASS", message: "SQL matches connector table and column allowlists.", details: { tables: result.tables, columns: result.columns } }
        : { checkKey: "schema_compatibility", status: "BLOCKED", message: result.reason ?? "SQL references disallowed schema.", details: { ...result } };
    });

    this.handlers.set("rbac_permission", (context, operation) => {
      if (!operation.requiredPermission) return { checkKey: "rbac_permission", status: "PASS", message: "No specific permission requested." };
      return hasPermission(context, operation.requiredPermission)
        ? { checkKey: "rbac_permission", status: "PASS", message: `Permission ${operation.requiredPermission} granted.` }
        : { checkKey: "rbac_permission", status: "BLOCKED", message: `Missing permission ${operation.requiredPermission}.` };
    });

    this.handlers.set("pii_masking_required", (_context, operation) => {
      if (!operation.sql || !operation.connectorId) return { checkKey: "pii_masking_required", status: "PASS", message: "No PII-bearing SQL detected." };
      const connector = this.repository.getConnector(operation.tenantId, operation.connectorId);
      const result = validateSqlAgainstConnector(operation.sql, connector);
      if (!result.hasPiiColumns) return { checkKey: "pii_masking_required", status: "PASS", message: "No sensitive columns detected." };
      return operation.maskingEnabled
        ? { checkKey: "pii_masking_required", status: "PASS", message: "Sensitive columns detected and masking is enabled." }
        : { checkKey: "pii_masking_required", status: "WARNING", message: "Sensitive columns detected; masking should be enabled.", details: { columns: result.columns } };
    });

    this.handlers.set("model_availability", (_context, operation) => {
      if (!operation.model) return { checkKey: "model_availability", status: "PASS", message: "No model requested." };
      const policy = this.repository.getTenantConfig(operation.tenantId).modelPolicy;
      const allowedModels = Array.isArray(policy.allowedModels) ? policy.allowedModels as string[] : [];
      return allowedModels.includes(operation.model)
        ? { checkKey: "model_availability", status: "PASS", message: `Model ${operation.model} is allowed by tenant policy.` }
        : { checkKey: "model_availability", status: "BLOCKED", message: `Model ${operation.model} is not allowed by tenant policy.` };
    });

    this.handlers.set("vector_index_freshness", (_context, operation) => {
      const indexName = operation.vectorIndexName ?? "default";
      const index = this.repository.snapshot().vectorIndexes.find((item) => item.tenantId === operation.tenantId && item.name === indexName);
      if (!index?.freshnessAt) return { checkKey: "vector_index_freshness", status: "WARNING", message: `Vector index ${indexName} has no freshness timestamp.` };
      const ageMs = Date.now() - new Date(index.freshnessAt).getTime();
      return ageMs <= 24 * 60 * 60 * 1000
        ? { checkKey: "vector_index_freshness", status: "PASS", message: "Vector index freshness is within 24 hours." }
        : { checkKey: "vector_index_freshness", status: "WARNING", message: "Vector index is older than 24 hours." };
    });

    this.handlers.set("agent_tool_permission", (context, operation) => {
      if (!operation.toolKey) return { checkKey: "agent_tool_permission", status: "PASS", message: "No tool requested." };
      const allowed = this.repository.snapshot().toolPermissions.some((permission) =>
        permission.tenantId === operation.tenantId &&
        permission.toolKey === operation.toolKey &&
        permission.allowed &&
        context.roles.includes(permission.roleName)
      );
      return allowed
        ? { checkKey: "agent_tool_permission", status: "PASS", message: `Tool ${operation.toolKey} is allowed for actor role.` }
        : { checkKey: "agent_tool_permission", status: "BLOCKED", message: `Tool ${operation.toolKey} is not allowed for actor role.` };
    });

    this.handlers.set("human_approval_policy", (_context, operation) => {
      const config = this.repository.getTenantConfig(operation.tenantId);
      const requiresApproval = config.securityPolicy.requireHumanApprovalForHighRisk === true && operation.riskLevel === "high";
      if (!requiresApproval) return { checkKey: "human_approval_policy", status: "PASS", message: "Human approval is not required by policy." };
      const approval = operation.approvalId
        ? this.repository.snapshot().approvalRequests.find((request) => request.tenantId === operation.tenantId && request.id === operation.approvalId)
        : undefined;
      return approval?.status === "APPROVED"
        ? { checkKey: "human_approval_policy", status: "PASS", message: "Approved human approval request found." }
        : { checkKey: "human_approval_policy", status: "BLOCKED", message: "High-risk operation requires an approved human approval request." };
    });

    this.handlers.set("external_ingestion_governance", (_context, operation) => {
      if (!operation.sourceId) return { checkKey: "external_ingestion_governance", status: "BLOCKED", message: "External ingestion requires a source id." };
      const source = this.repository.snapshot().externalSources.find((item) => item.tenantId === operation.tenantId && item.id === operation.sourceId);
      if (!source) return { checkKey: "external_ingestion_governance", status: "BLOCKED", message: "External source was not found." };
      if (!source.governanceApproved) return { checkKey: "external_ingestion_governance", status: "BLOCKED", message: "External source is not governance approved." };
      if (source.rateLimitPerHour <= 0 || source.rateLimitPerHour > 120) {
        return { checkKey: "external_ingestion_governance", status: "BLOCKED", message: "External source rate limit is missing or too high." };
      }
      return { checkKey: "external_ingestion_governance", status: "PASS", message: "External source is approved and rate-limited." };
    });

    this.handlers.set("audit_log_writability", () => {
      try {
        const state = this.repository.snapshot();
        if (!Array.isArray(state.auditLogs)) throw new Error("audit sink unavailable");
        return { checkKey: "audit_log_writability", status: "PASS", message: "Audit log sink is writable." };
      } catch {
        return { checkKey: "audit_log_writability", status: "BLOCKED", message: "Audit log sink is not writable." };
      }
    });

    this.handlers.set("notification_channel_availability", (_context, operation) => {
      if (!operation.notificationChannel) return { checkKey: "notification_channel_availability", status: "WARNING", message: "No notification channel selected." };
      const available = ["email", "slack", "teams", "jira"].includes(operation.notificationChannel);
      return available
        ? { checkKey: "notification_channel_availability", status: "PASS", message: `${operation.notificationChannel} notification adapter is configured as a local placeholder.` }
        : { checkKey: "notification_channel_availability", status: "WARNING", message: `Notification channel ${operation.notificationChannel} is not configured.` };
    });

    this.handlers.set("rollback_readiness", (_context, operation) => {
      if (operation.riskLevel !== "high") return { checkKey: "rollback_readiness", status: "PASS", message: "Rollback plan is not required for this risk level." };
      return operation.rollbackPlan
        ? { checkKey: "rollback_readiness", status: "PASS", message: "Rollback plan is present." }
        : { checkKey: "rollback_readiness", status: "BLOCKED", message: "High-risk action requires a rollback plan." };
    });

    this.handlers.set("simulation_sandbox_boundary", (_context, operation) => {
      if (operation.operationType !== "simulation") return { checkKey: "simulation_sandbox_boundary", status: "PASS", message: "No simulation boundary required." };
      return operation.sandbox === true && operation.liveMutationTarget !== true
        ? { checkKey: "simulation_sandbox_boundary", status: "PASS", message: "Simulation is confined to sandbox state." }
        : { checkKey: "simulation_sandbox_boundary", status: "BLOCKED", message: "Simulation attempted to reach live mutation boundary." };
    });
  }
}

export const safetyGateService = new SafetyGateService(store);
