export const DEFAULT_TENANT_ID = "tenant_fibabanka";

export const safetyGateStatuses = ["PASS", "WARNING", "BLOCKED"] as const;
export type SafetyGateStatus = (typeof safetyGateStatuses)[number];

export const deploymentModes = ["ON_PREMISE", "PRIVATE_CLOUD", "HYBRID", "MANAGED_SAAS"] as const;
export type DeploymentMode = (typeof deploymentModes)[number];

export const auditEventTypes = [
  "AUTH",
  "ADMIN_CONFIG",
  "CONNECTOR_OPERATION",
  "SQL_GENERATION",
  "SQL_EXECUTION",
  "RAG_INGESTION",
  "RAG_RETRIEVAL",
  "LLM_CALL",
  "AGENT_RUN",
  "TOOL_EXECUTION",
  "WORKFLOW_ACTION",
  "APPROVAL_DECISION",
  "SAFETY_GATE",
  "EXTERNAL_INGESTION",
  "SIMULATION_RUN"
] as const;
export type AuditEventType = (typeof auditEventTypes)[number];

export const permissions = {
  tenantsRead: "tenants:read",
  tenantsWrite: "tenants:write",
  configRead: "config:read",
  configWrite: "config:write",
  usersRead: "users:read",
  usersWrite: "users:write",
  rolesRead: "roles:read",
  rolesWrite: "roles:write",
  secretsRead: "secrets:read",
  secretsWrite: "secrets:write",
  connectorsRead: "connectors:read",
  connectorsWrite: "connectors:write",
  connectorsExecute: "connectors:execute",
  glossaryRead: "glossary:read",
  glossaryWrite: "glossary:write",
  metricsRead: "metrics:read",
  metricsWrite: "metrics:write",
  queryExecute: "query:execute",
  ragRead: "rag:read",
  ragWrite: "rag:write",
  promptsRead: "prompts:read",
  promptsWrite: "prompts:write",
  agentsRead: "agents:read",
  agentsExecute: "agents:execute",
  workflowsRead: "workflows:read",
  workflowsExecute: "workflows:execute",
  approvalsDecide: "approvals:decide",
  alertsRead: "alerts:read",
  alertsWrite: "alerts:write",
  marketRead: "market:read",
  marketWrite: "market:write",
  simulationsRead: "simulations:read",
  simulationsExecute: "simulations:execute",
  safetyRead: "safety:read",
  safetyRun: "safety:run",
  auditRead: "audit:read",
  observabilityRead: "observability:read"
} as const;

export type PermissionKey = (typeof permissions)[keyof typeof permissions];

export const roleNames = ["Admin", "Analyst", "Viewer", "Operator", "Approver"] as const;
export type RoleName = (typeof roleNames)[number];

export const operationTypes = [
  "service",
  "connector",
  "sql_query",
  "agent",
  "workflow",
  "external_ingestion",
  "model_call",
  "notification",
  "simulation",
  "rag_retrieval",
  "rag_ingestion"
] as const;
export type OperationType = (typeof operationTypes)[number];

export interface RequestContext {
  tenantId: string;
  userId: string;
  email: string;
  roles: string[];
  permissions: PermissionKey[];
  correlationId: string;
}

export interface ApiEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    correlationId: string;
  };
}

export interface SafetyGateDecision {
  checkKey: string;
  status: SafetyGateStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface SafetyGateRunRecord extends SafetyGateDecision {
  id: string;
  tenantId: string;
  operationType: OperationType;
  operationId?: string;
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  tenantId: string;
  actorUserId?: string;
  eventType: AuditEventType;
  action: string;
  resourceType: string;
  resourceId?: string;
  correlationId: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}
