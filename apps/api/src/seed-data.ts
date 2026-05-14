import { DEFAULT_TENANT_ID, permissions } from "@phi-ba/contracts";
import { nowIso } from "@phi-ba/shared";
import type { PermissionKey } from "@phi-ba/contracts";
import type { PlatformState } from "./platform-types.js";

const allPermissions = Object.values(permissions);
const analystPermissions: PermissionKey[] = [
  permissions.configRead,
  permissions.connectorsRead,
  permissions.connectorsExecute,
  permissions.glossaryRead,
  permissions.metricsRead,
  permissions.queryExecute,
  permissions.ragRead,
  permissions.promptsRead,
  permissions.agentsRead,
  permissions.agentsExecute,
  permissions.workflowsRead,
  permissions.alertsRead,
  permissions.marketRead,
  permissions.simulationsRead,
  permissions.simulationsExecute,
  permissions.safetyRead,
  permissions.auditRead,
  permissions.observabilityRead
];
const viewerPermissions: PermissionKey[] = [
  permissions.configRead,
  permissions.connectorsRead,
  permissions.glossaryRead,
  permissions.metricsRead,
  permissions.ragRead,
  permissions.promptsRead,
  permissions.agentsRead,
  permissions.workflowsRead,
  permissions.alertsRead,
  permissions.marketRead,
  permissions.simulationsRead,
  permissions.safetyRead,
  permissions.auditRead,
  permissions.observabilityRead
];
const operatorPermissions: PermissionKey[] = [
  ...viewerPermissions,
  permissions.connectorsExecute,
  permissions.workflowsExecute,
  permissions.alertsWrite,
  permissions.marketWrite,
  permissions.safetyRun
];
const approverPermissions: PermissionKey[] = [
  ...viewerPermissions,
  permissions.approvalsDecide,
  permissions.workflowsExecute,
  permissions.auditRead
];

export const safetyGateDefinitions = [
  ["tenant_isolation", "Tenant isolation check", "Ensures every operation is scoped to the active tenant.", "blocking"],
  ["secret_reference", "Secret reference check", "Validates that operations use references, not raw secrets.", "blocking"],
  ["connector_health", "Connector health check", "Confirms the connector is known and not degraded.", "warning"],
  ["database_permission", "Database permission check", "Confirms read role and table permissions.", "blocking"],
  ["sql_read_only", "SQL read-only check", "Blocks write, DDL, transaction, and unsafe SQL.", "blocking"],
  ["schema_compatibility", "Schema compatibility check", "Checks requested tables/columns against allowlists.", "blocking"],
  ["rbac_permission", "RBAC permission check", "Verifies the actor has the required permission.", "blocking"],
  ["pii_masking_required", "PII masking required check", "Warns or blocks when sensitive columns are requested without masking.", "warning"],
  ["model_availability", "Model availability check", "Confirms tenant model policy permits a provider/model.", "blocking"],
  ["vector_index_freshness", "Vector index freshness check", "Warns when vector indexes are stale.", "warning"],
  ["agent_tool_permission", "Agent tool permission check", "Verifies the actor can use the requested agent tool.", "blocking"],
  ["human_approval_policy", "Human approval policy check", "Requires approval for high-risk operations unless policy allows automation.", "blocking"],
  ["external_ingestion_governance", "External ingestion governance check", "Requires approved sources and rate limits.", "blocking"],
  ["audit_log_writability", "Audit log writability check", "Confirms audit logging is available before execution.", "blocking"],
  ["notification_channel_availability", "Notification channel availability check", "Warns when target notification channels are not configured.", "warning"],
  ["rollback_readiness", "Rollback readiness check", "Requires rollback plan for risky actions.", "blocking"],
  ["simulation_sandbox_boundary", "Simulation sandbox boundary check", "Ensures simulation cannot mutate live systems.", "blocking"]
] as const;

export function createSeedState(): PlatformState {
  const now = nowIso();
  return {
    tenants: [
      {
        id: DEFAULT_TENANT_ID,
        name: "Fibabanka",
        slug: "fibabanka",
        deploymentMode: "ON_PREMISE",
        createdAt: now,
        updatedAt: now
      }
    ],
    tenantConfigs: [
      {
        id: "tenant_config_fibabanka",
        tenantId: DEFAULT_TENANT_ID,
        productName: "phi.ba",
        logoUrl: "/logo.svg",
        themeColors: {
          primary: "#9FD8C0",
          secondary: "#E8E5DD",
          accent: "#2266AA",
          text: "#14171A"
        },
        customDomain: "analytics.fibabanka.local",
        locale: "tr-TR",
        enabledFeatures: [
          "text_to_sql",
          "rag",
          "agents",
          "workflows",
          "sentry",
          "market_intelligence",
          "simulation"
        ],
        industryDomainPack: "banking",
        modelPolicy: {
          provider: "mock",
          allowedModels: ["mock-enterprise-analyst"],
          piiMode: "mask_required"
        },
        dataResidencyPolicy: {
          region: "TR",
          allowCrossRegionProcessing: false
        },
        securityPolicy: {
          requireHumanApprovalForHighRisk: true,
          maxQueryTimeoutMs: 8000,
          auditRequired: true
        }
      }
    ],
    featureFlags: [
      { id: "ff_t2sql", tenantId: DEFAULT_TENANT_ID, key: "text_to_sql", enabled: true },
      { id: "ff_rag", tenantId: DEFAULT_TENANT_ID, key: "rag", enabled: true },
      { id: "ff_agents", tenantId: DEFAULT_TENANT_ID, key: "agents", enabled: true },
      { id: "ff_safety", tenantId: DEFAULT_TENANT_ID, key: "safety_gates", enabled: true }
    ],
    users: [
      {
        id: "user_admin",
        tenantId: DEFAULT_TENANT_ID,
        email: "admin@fibabanka.local",
        displayName: "Local Admin",
        status: "active",
        authType: "local"
      },
      {
        id: "user_analyst",
        tenantId: DEFAULT_TENANT_ID,
        email: "analyst@fibabanka.local",
        displayName: "Demo Analyst",
        status: "active",
        authType: "local"
      },
      {
        id: "user_approver",
        tenantId: DEFAULT_TENANT_ID,
        email: "approver@fibabanka.local",
        displayName: "Demo Approver",
        status: "active",
        authType: "local"
      }
    ],
    roles: [
      { id: "role_admin", tenantId: DEFAULT_TENANT_ID, name: "Admin", permissions: allPermissions },
      { id: "role_analyst", tenantId: DEFAULT_TENANT_ID, name: "Analyst", permissions: analystPermissions },
      { id: "role_viewer", tenantId: DEFAULT_TENANT_ID, name: "Viewer", permissions: viewerPermissions },
      { id: "role_operator", tenantId: DEFAULT_TENANT_ID, name: "Operator", permissions: operatorPermissions },
      { id: "role_approver", tenantId: DEFAULT_TENANT_ID, name: "Approver", permissions: approverPermissions }
    ],
    secretReferences: [
      {
        id: "secret_pg_reporting",
        tenantId: DEFAULT_TENANT_ID,
        name: "pg-reporting-readonly",
        provider: "local-dev",
        reference: "local://pg-reporting-readonly",
        purpose: "Read-only reporting database connection"
      }
    ],
    connectors: [
      {
        id: "connector_pg_reporting",
        tenantId: DEFAULT_TENANT_ID,
        type: "postgresql",
        name: "FBDWHPRD Reporting",
        config: {
          host: "localhost",
          database: "phi_ba",
          role: "readonly",
          ssl: false,
          timeoutMs: 8000
        },
        secretReferenceId: "secret_pg_reporting",
        status: "healthy",
        permissions: [permissions.connectorsExecute],
        allowedTables: ["islemler", "musteriler", "urunler", "risk_izleme", "kart_islemleri", "mobil_kullanim"],
        allowedColumns: {
          islemler: ["id", "musteri_id", "urun_id", "tutar", "durum", "gerceklesme_tarihi"],
          musteriler: ["id", "segment", "edinim_kanali"],
          urunler: ["id", "ad", "kategori"],
          risk_izleme: ["urun_adi", "segment", "npl_orani", "aktif_musteri", "riskli_bakiye", "rapor_donemi"],
          kart_islemleri: ["kanal", "saat_dilimi", "onay_orani", "reddedilen_islem", "kayip_hacim", "islem_tarihi"],
          mobil_kullanim: ["kohort", "segment", "retention_90d", "aktif_musteri", "beklenen_gelir", "edinim_kanali"]
        }
      },
      {
        id: "connector_rest_markets",
        tenantId: DEFAULT_TENANT_ID,
        type: "rest_api",
        name: "Governed Market Rates API",
        config: { baseUrl: "https://example.invalid/rates", method: "GET" },
        status: "healthy",
        permissions: [permissions.marketRead]
      },
      {
        id: "connector_document_upload",
        tenantId: DEFAULT_TENANT_ID,
        type: "document_upload",
        name: "Policy Document Upload",
        config: { maxFileMb: 25, allowedTypes: ["text/plain", "application/pdf"] },
        status: "healthy",
        permissions: [permissions.ragWrite]
      }
    ],
    glossaryTerms: [
      {
        id: "glossary_npl",
        tenantId: DEFAULT_TENANT_ID,
        term: "NPL",
        definition: "Takipteki kredi oranı; riskli bakiye takibi için kullanılan temel metrik.",
        synonyms: ["takip oranı", "temerrüt", "non-performing loan"],
        locale: "tr-TR",
        domain: "banking"
      },
      {
        id: "glossary_retention",
        tenantId: DEFAULT_TENANT_ID,
        term: "90 günlük tutunma",
        definition: "Mobil edinimden sonraki 90 gün içinde aktif kalan müşteri oranı.",
        synonyms: ["retention", "kohort tutunması"],
        locale: "tr-TR",
        domain: "growth"
      }
    ],
    metricDefinitions: [
      {
        id: "metric_credit_volume",
        tenantId: DEFAULT_TENANT_ID,
        key: "marketplace_credit_volume",
        name: "Marketplace Credit Volume",
        description: "Marketplace kanalından gelen kredi hacmi.",
        formula: "SUM(kredi_hacmi)",
        sqlMappingHints: ["marketplace", "kredi hacmi", "credit volume"],
        tableMapping: ["islemler"],
        columnMapping: { islemler: ["tutar", "gerceklesme_tarihi", "durum"] },
        synonyms: ["kredi hacmi", "credit volume", "marketplace hacim"]
      },
      {
        id: "metric_npl",
        tenantId: DEFAULT_TENANT_ID,
        key: "npl_ratio",
        name: "NPL Ratio",
        description: "Ürün ve segment kırılımında takip oranı.",
        formula: "riskli_bakiye / toplam_bakiye",
        sqlMappingHints: ["npl", "risk", "takip"],
        tableMapping: ["risk_izleme"],
        columnMapping: { risk_izleme: ["npl_orani", "riskli_bakiye", "segment"] },
        synonyms: ["takip oranı", "risk oranı", "non-performing loan ratio"]
      }
    ],
    queryTraces: [],
    documents: [
      {
        id: "doc_policy",
        tenantId: DEFAULT_TENANT_ID,
        title: "Credit policy excerpt",
        sourceType: "document_upload",
        content: "High-risk credit workflow actions require approver review before execution.",
        metadata: { language: "en" },
        createdAt: now
      }
    ],
    documentChunks: [],
    vectorIndexes: [
      {
        id: "vector_default",
        tenantId: DEFAULT_TENANT_ID,
        name: "default",
        provider: "pgvector",
        freshnessAt: now,
        documentCount: 1,
        chunkCount: 1
      }
    ],
    prompts: [
      {
        id: "prompt_sql",
        tenantId: DEFAULT_TENANT_ID,
        key: "text_to_sql",
        name: "Text to SQL generator",
        description: "Produces safe read-only SQL for allowed reporting schemas.",
        versions: [
          {
            id: "prompt_sql_v1",
            version: 1,
            body: "Generate read-only PostgreSQL SQL using only the allowed schema.",
            createdAt: now
          }
        ]
      }
    ],
    promptExecutionTraces: [],
    modelUsage: [],
    agentTemplates: [
      "Marketing Analyst",
      "Sales Analyst",
      "Revenue Analyst",
      "Finance Analyst",
      "Risk Analyst",
      "Operations Analyst",
      "Executive Briefing Agent",
      "Market Intelligence Agent",
      "Sentry Agent"
    ].map((name, index) => ({
      id: `agent_template_${index + 1}`,
      tenantId: DEFAULT_TENANT_ID,
      name,
      description: `${name} template with governed tools and audit-ready execution.`,
      defaultTools: index >= 7 ? ["market.compare", "alerts.route"] : ["query.run", "rag.retrieve"]
    })),
    agents: [
      {
        id: "agent_risk",
        tenantId: DEFAULT_TENANT_ID,
        name: "Risk Analyst",
        templateId: "agent_template_5",
        instructions: "Analyze risk metrics, cite evidence, and request approval before risky action execution.",
        enabled: true
      }
    ],
    tools: [
      { id: "tool_query", key: "query.run", name: "Run governed query", riskLevel: "medium" },
      { id: "tool_rag", key: "rag.retrieve", name: "Retrieve indexed evidence", riskLevel: "low" },
      { id: "tool_jira", key: "jira.create_ticket", name: "Create Jira ticket", riskLevel: "high" },
      { id: "tool_market", key: "market.compare", name: "Compare market intelligence", riskLevel: "medium" },
      { id: "tool_alerts", key: "alerts.route", name: "Route alert", riskLevel: "high" }
    ],
    toolPermissions: [
      { id: "tp_admin_query", tenantId: DEFAULT_TENANT_ID, roleName: "Admin", toolKey: "query.run", allowed: true, requiresApproval: false },
      { id: "tp_admin_jira", tenantId: DEFAULT_TENANT_ID, roleName: "Admin", toolKey: "jira.create_ticket", allowed: true, requiresApproval: true },
      { id: "tp_analyst_query", tenantId: DEFAULT_TENANT_ID, roleName: "Analyst", toolKey: "query.run", allowed: true, requiresApproval: false },
      { id: "tp_analyst_rag", tenantId: DEFAULT_TENANT_ID, roleName: "Analyst", toolKey: "rag.retrieve", allowed: true, requiresApproval: false },
      { id: "tp_operator_alerts", tenantId: DEFAULT_TENANT_ID, roleName: "Operator", toolKey: "alerts.route", allowed: true, requiresApproval: true }
    ],
    agentExecutionTraces: [],
    workflows: [
      {
        id: "workflow_credit_drop",
        tenantId: DEFAULT_TENANT_ID,
        name: "Marketplace credit-volume drop response",
        description: "Triage abnormal marketplace credit-volume drop with approval.",
        steps: [
          { type: "query", metricKey: "marketplace_credit_volume" },
          { type: "approval", role: "Approver" },
          { type: "jira_ticket" }
        ],
        enabled: true
      }
    ],
    actions: [],
    approvalRequests: [],
    metricSubscriptions: [
      {
        id: "metric_sub_marketplace_credit",
        tenantId: DEFAULT_TENANT_ID,
        metricKey: "marketplace_credit_volume",
        subscriberUserId: "user_analyst",
        schedule: "*/15 * * * *"
      }
    ],
    alertRules: [
      {
        id: "alert_marketplace_credit_drop",
        tenantId: DEFAULT_TENANT_ID,
        name: "Abnormal marketplace credit-volume drop",
        metricKey: "marketplace_credit_volume",
        ruleType: "threshold",
        threshold: -20,
        sensitivity: 2,
        priority: "HIGH",
        enabled: true
      }
    ],
    alertEvents: [],
    externalSources: [
      {
        id: "source_competitor_rates",
        tenantId: DEFAULT_TENANT_ID,
        name: "Competitor interest-rate feed",
        type: "api",
        url: "https://example.invalid/competitor-rates",
        governanceApproved: true,
        rateLimitPerHour: 12,
        confidenceScore: 0.72
      }
    ],
    externalIngestionJobs: [],
    simulationScenarios: [
      {
        id: "simulation_interest_rate_impact",
        tenantId: DEFAULT_TENANT_ID,
        name: "Interest-rate-change impact",
        description: "Estimate customer and revenue impact from a proposed loan interest-rate change.",
        parameters: { baseRate: 3.2, proposedRate: 3.45, horizonDays: 90 },
        requiresApprovalForAction: true
      }
    ],
    segments: [
      {
        id: "segment_affluent",
        tenantId: DEFAULT_TENANT_ID,
        name: "Üst Gelir",
        definition: { monthlyIncomeMinTry: 100000, activeProductsMin: 3 }
      }
    ],
    syntheticUserSegments: [
      {
        id: "synthetic_mobile_credit",
        tenantId: DEFAULT_TENANT_ID,
        name: "Mobile credit prospects",
        size: 25000,
        attributes: { channel: "mobile", riskBand: "medium", product: "consumer_loan" }
      }
    ],
    simulationResults: [],
    safetyGateChecks: safetyGateDefinitions.map(([key, name, description, severity]) => ({
      id: `safety_${key}`,
      key,
      name,
      description,
      severity,
      enabled: true
    })),
    safetyGateRuns: [],
    auditLogs: [],
    complianceEvidence: [],
    jobStatuses: []
  };
}
