import type { AuditEventType, PermissionKey, SafetyGateStatus } from "@phi-ba/contracts";

export type JsonRecord = Record<string, unknown>;

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  deploymentMode: "ON_PREMISE" | "PRIVATE_CLOUD" | "HYBRID" | "MANAGED_SAAS";
  createdAt: string;
  updatedAt: string;
}

export interface TenantConfig {
  id: string;
  tenantId: string;
  productName: string;
  logoUrl?: string;
  themeColors: { primary: string; secondary: string; accent: string; text: string };
  customDomain?: string;
  locale: string;
  enabledFeatures: string[];
  industryDomainPack: string;
  modelPolicy: JsonRecord;
  dataResidencyPolicy: JsonRecord;
  securityPolicy: JsonRecord;
}

export interface FeatureFlag {
  id: string;
  tenantId: string;
  key: string;
  enabled: boolean;
  config?: JsonRecord;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  status: "active" | "disabled";
  authType: "local" | "oidc" | "saml";
}

export interface Role {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  permissions: PermissionKey[];
}

export interface SecretReference {
  id: string;
  tenantId: string;
  name: string;
  provider: "local-dev" | "vault" | "kms";
  reference: string;
  purpose: string;
  metadata?: JsonRecord;
}

export interface Connector {
  id: string;
  tenantId: string;
  type: "postgresql" | "rest_api" | "csv_upload" | "document_upload" | "sftp" | "sharepoint" | "web_source";
  name: string;
  config: JsonRecord;
  secretReferenceId?: string;
  status: "healthy" | "degraded" | "unknown";
  permissions: PermissionKey[];
  allowedTables?: string[];
  allowedColumns?: Record<string, string[]>;
}

export interface BusinessGlossaryTerm {
  id: string;
  tenantId: string;
  term: string;
  definition: string;
  synonyms: string[];
  locale: "tr-TR" | "en-US";
  domain?: string;
}

export interface MetricDefinition {
  id: string;
  tenantId: string;
  key: string;
  name: string;
  description: string;
  formula: string;
  sqlMappingHints: string[];
  tableMapping: string[];
  columnMapping: Record<string, string[]>;
  synonyms: string[];
}

export interface QueryTrace {
  id: string;
  tenantId: string;
  userId: string;
  question: string;
  language: "tr" | "en";
  generatedSql?: string;
  safetyStatus: SafetyGateStatus;
  confidenceScore?: number;
  resultSummary?: string;
  metadata?: JsonRecord;
  createdAt: string;
}

export interface DocumentRecord {
  id: string;
  tenantId: string;
  title: string;
  sourceType: "document_upload" | "csv_upload" | "web_source";
  content: string;
  metadata?: JsonRecord;
  createdAt: string;
}

export interface DocumentChunk {
  id: string;
  tenantId: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  embedding: number[];
  metadata?: JsonRecord;
}

export interface VectorIndexRecord {
  id: string;
  tenantId: string;
  name: string;
  provider: "pgvector";
  freshnessAt?: string;
  documentCount: number;
  chunkCount: number;
}

export interface PromptVersion {
  id: string;
  version: number;
  body: string;
  metadata?: JsonRecord;
  createdAt: string;
}

export interface Prompt {
  id: string;
  tenantId: string;
  key: string;
  name: string;
  description?: string;
  versions: PromptVersion[];
}

export interface ModelUsage {
  id: string;
  tenantId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  operation: string;
  createdAt: string;
}

export interface PromptExecutionTrace {
  id: string;
  tenantId: string;
  promptKey: string;
  promptVersion: number;
  model: string;
  input: JsonRecord;
  output?: JsonRecord;
  status: "completed" | "blocked" | "failed";
  tokenUsage?: JsonRecord;
  createdAt: string;
}

export interface AgentTemplate {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  defaultTools: string[];
}

export interface Agent {
  id: string;
  tenantId: string;
  name: string;
  templateId?: string;
  instructions: string;
  enabled: boolean;
  metadata?: JsonRecord;
}

export interface ToolDefinition {
  id: string;
  key: string;
  name: string;
  riskLevel: "low" | "medium" | "high";
  description?: string;
}

export interface ToolPermission {
  id: string;
  tenantId: string;
  roleName: string;
  toolKey: string;
  allowed: boolean;
  requiresApproval: boolean;
}

export interface AgentExecutionTrace {
  id: string;
  tenantId: string;
  userId: string;
  agentId: string;
  input: JsonRecord;
  output?: JsonRecord;
  toolCalls?: JsonRecord[];
  safetyStatus: SafetyGateStatus;
  status: "completed" | "blocked" | "pending_approval";
  createdAt: string;
}

export interface Workflow {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  steps: JsonRecord[];
  enabled: boolean;
}

export interface ActionRecord {
  id: string;
  tenantId: string;
  workflowId?: string;
  type: "jira_ticket" | "slack_notification" | "teams_task" | "email" | "rollback";
  payload: JsonRecord;
  riskLevel: "low" | "medium" | "high";
  status: "completed" | "pending_approval" | "blocked";
  rollbackPlan?: JsonRecord;
  createdAt: string;
}

export interface ApprovalRequest {
  id: string;
  tenantId: string;
  requestedBy: string;
  actionType: string;
  subjectId: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  decidedBy?: string;
  decisionNote?: string;
  decidedAt?: string;
  createdAt: string;
}

export interface AlertRule {
  id: string;
  tenantId: string;
  name: string;
  metricKey: string;
  ruleType: "threshold" | "statistical";
  threshold?: number;
  sensitivity?: number;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  enabled: boolean;
}

export interface MetricSubscription {
  id: string;
  tenantId: string;
  metricKey: string;
  subscriberUserId: string;
  schedule: string;
}

export interface AlertEvent {
  id: string;
  tenantId: string;
  ruleId: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  explanation: string;
  dedupeKey: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  createdAt: string;
}

export interface ExternalSource {
  id: string;
  tenantId: string;
  name: string;
  type: "api" | "file" | "web";
  url?: string;
  governanceApproved: boolean;
  rateLimitPerHour: number;
  confidenceScore: number;
}

export interface ExternalIngestionJob {
  id: string;
  tenantId: string;
  sourceId: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  normalizedCount: number;
  metadata?: JsonRecord;
  createdAt: string;
  completedAt?: string;
}

export interface SimulationScenario {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  parameters: JsonRecord;
  requiresApprovalForAction: boolean;
}

export interface Segment {
  id: string;
  tenantId: string;
  name: string;
  definition: JsonRecord;
}

export interface SyntheticUserSegment {
  id: string;
  tenantId: string;
  name: string;
  size: number;
  attributes: JsonRecord;
}

export interface SimulationResult {
  id: string;
  tenantId: string;
  scenarioId: string;
  input: JsonRecord;
  output: JsonRecord;
  safetyStatus: SafetyGateStatus;
  createdAt: string;
}

export interface SafetyGateCheck {
  id: string;
  key: string;
  name: string;
  description: string;
  severity: "blocking" | "warning";
  enabled: boolean;
}

export interface SafetyGateRun {
  id: string;
  tenantId: string;
  checkKey: string;
  operationType: string;
  operationId?: string;
  status: SafetyGateStatus;
  message: string;
  details?: JsonRecord;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  tenantId: string;
  actorUserId?: string;
  eventType: AuditEventType;
  action: string;
  resourceType: string;
  resourceId?: string;
  correlationId: string;
  metadata?: JsonRecord;
  createdAt: string;
}

export interface ComplianceEvidence {
  id: string;
  tenantId: string;
  controlKey: string;
  title: string;
  evidence: JsonRecord;
  createdAt: string;
}

export interface JobStatusRecord {
  id: string;
  tenantId: string;
  type: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  progress: number;
  message?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformState {
  tenants: Tenant[];
  tenantConfigs: TenantConfig[];
  featureFlags: FeatureFlag[];
  users: User[];
  roles: Role[];
  secretReferences: SecretReference[];
  connectors: Connector[];
  glossaryTerms: BusinessGlossaryTerm[];
  metricDefinitions: MetricDefinition[];
  queryTraces: QueryTrace[];
  documents: DocumentRecord[];
  documentChunks: DocumentChunk[];
  vectorIndexes: VectorIndexRecord[];
  prompts: Prompt[];
  promptExecutionTraces: PromptExecutionTrace[];
  modelUsage: ModelUsage[];
  agentTemplates: AgentTemplate[];
  agents: Agent[];
  tools: ToolDefinition[];
  toolPermissions: ToolPermission[];
  agentExecutionTraces: AgentExecutionTrace[];
  workflows: Workflow[];
  actions: ActionRecord[];
  approvalRequests: ApprovalRequest[];
  metricSubscriptions: MetricSubscription[];
  alertRules: AlertRule[];
  alertEvents: AlertEvent[];
  externalSources: ExternalSource[];
  externalIngestionJobs: ExternalIngestionJob[];
  simulationScenarios: SimulationScenario[];
  segments: Segment[];
  syntheticUserSegments: SyntheticUserSegment[];
  simulationResults: SimulationResult[];
  safetyGateChecks: SafetyGateCheck[];
  safetyGateRuns: SafetyGateRun[];
  auditLogs: AuditLog[];
  complianceEvidence: ComplianceEvidence[];
  jobStatuses: JobStatusRecord[];
}
