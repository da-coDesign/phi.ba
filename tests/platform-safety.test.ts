import { beforeEach, describe, expect, it } from "vitest";
import { permissions, type RequestContext } from "@phi-ba/contracts";
import { agentService, classifyAgentIntent } from "../apps/api/src/agents.js";
import { chatKitService } from "../apps/api/src/chatkit.js";
import { connectorService } from "../apps/api/src/connectors.js";
import { ApiError } from "../apps/api/src/errors.js";
import { marketIntelligenceService } from "../apps/api/src/market-intelligence.js";
import { safetyGateService } from "../apps/api/src/safety-gates.js";
import { sentryService } from "../apps/api/src/sentry.js";
import { simulationService } from "../apps/api/src/simulation.js";
import { isReadOnlySql } from "../apps/api/src/sql-safety.js";
import { store } from "../apps/api/src/store.js";
import { textToSqlService } from "../apps/api/src/text-to-sql.js";
import { workflowService } from "../apps/api/src/workflows.js";

function context(userId = "user_admin", roles = ["Admin"], granted = Object.values(permissions)): RequestContext {
  return {
    tenantId: "tenant_fibabanka",
    userId,
    email: `${userId}@local`,
    roles,
    permissions: granted,
    correlationId: "test-correlation"
  };
}

describe("enterprise safety controls", () => {
  beforeEach(() => {
    process.env.LLM_PROVIDER = "data-grounded-local";
    process.env.LLM_MODEL = "data-grounded-local";
    process.env.TEXT_TO_SQL_MODE = "template";
    store.reset();
    store.updateTenantConfig("tenant_fibabanka", {
      modelPolicy: {
        provider: "data-grounded-local",
        allowedModels: ["data-grounded-local"],
        piiMode: "mask_required"
      }
    });
  });

  it("blocks cross-tenant operations", () => {
    const runs = safetyGateService.runManual(context(), {
      tenantId: "tenant_other",
      operationType: "service",
      requiredPermission: permissions.tenantsRead,
      checkKeys: ["tenant_isolation"]
    });

    expect(runs[0]?.status).toBe("BLOCKED");
  });

  it("enforces RBAC permissions", () => {
    const viewer = context("user_viewer", ["Viewer"], [permissions.auditRead]);

    expect(() => safetyGateService.assertAllowed(viewer, {
      tenantId: "tenant_fibabanka",
      operationType: "service",
      requiredPermission: permissions.connectorsExecute
    })).toThrow(ApiError);
  });

  it("rejects raw secret-shaped payloads in safety checks", () => {
    const runs = safetyGateService.runManual(context(), {
      tenantId: "tenant_fibabanka",
      operationType: "connector",
      requiredPermission: permissions.connectorsExecute,
      payload: { password: "never-store-me" },
      checkKeys: ["secret_reference"]
    });

    expect(runs[0]?.status).toBe("BLOCKED");
  });

  it("keeps generated SQL read-only", () => {
    expect(isReadOnlySql("SELECT urun_adi FROM risk_izleme LIMIT 5")).toBe(true);
    expect(isReadOnlySql("DELETE FROM risk_izleme")).toBe(false);
    expect(isReadOnlySql("SELECT * FROM risk_izleme; DROP TABLE users")).toBe(false);
  });

  it("blocks unsafe SQL before connector execution", () => {
    expect(() => safetyGateService.assertAllowed(context(), {
      tenantId: "tenant_fibabanka",
      operationType: "sql_query",
      connectorId: "connector_pg_reporting",
      requiredPermission: permissions.queryExecute,
      sql: "UPDATE risk_izleme SET npl_orani = 0"
    })).toThrow(ApiError);
  });

  it("validates connector config", () => {
    expect(() => connectorService.create(context(), {
      type: "postgresql",
      name: "Unsafe writer",
      config: { host: "localhost", database: "phi_ba", role: "writer" }
    })).toThrow(ApiError);
  });

  it("blocks agent tool execution when role lacks tool permission", async () => {
    const analyst = context("user_analyst", ["Analyst"], [permissions.agentsExecute, permissions.promptsRead]);

    await expect(agentService.execute(analyst, {
      agentId: "agent_risk",
      message: "Create a ticket",
      toolKey: "jira.create_ticket"
    })).rejects.toThrow(ApiError);
  });

  it("streams agent answers only after safety checks pass", async () => {
    const chunks = [];
    for await (const chunk of agentService.streamExecute(context(), {
      agentId: "agent_risk",
      message: "Explain the latest risk movement",
      toolKey: "rag.retrieve"
    })) {
      chunks.push(chunk);
    }

    expect(chunks.some((chunk) => chunk.event === "token")).toBe(true);
    expect(chunks.at(-1)?.event).toBe("done");
    expect(store.snapshot().agentExecutionTraces[0]?.status).toBe("completed");
  });

  it("classifies banking prompts into governed agent intents", () => {
    expect(classifyAgentIntent("Kart onay oranı neden düştü?")).toBe("data_query");
    expect(classifyAgentIntent("Rakip faiz oranlarını karşılaştır")).toBe("market_compare");
    expect(classifyAgentIntent("Faiz 3.6 olursa ne olur?")).toBe("simulation");
    expect(classifyAgentIntent("Bunun için Jira ticket oluştur")).toBe("action_request");
  });

  it("returns card-ready data for metric questions through the central agent", async () => {
    let final: any;
    for await (const chunk of agentService.streamExecute(context(), {
      agentId: "agent_risk",
      message: "Kart onay oranı neden düştü?"
    })) {
      if (chunk.event === "done") final = chunk.data;
    }

    expect(final.result.mode).toBe("data_card");
    expect(final.result.sql).toContain("v_card_approval_daily");
    expect(final.result.rows.length).toBeGreaterThan(0);
  });

  it("routes broad banking topics to allowlisted reporting views", () => {
    expect(textToSqlService.generateSql("Fraud alert hacmini göster").sql).toContain("v_fraud_alerts");
    expect(textToSqlService.generateSql("Şube mevduat performansı").sql).toContain("v_branch_kpi");
    expect(textToSqlService.generateSql("Kampanya dönüşüm oranı").sql).toContain("v_campaign_conversion");
    expect(textToSqlService.generateSql("Tahsilat bucket bazında nasıl?").sql).toContain("v_collections_snapshot");
  });

  it("uses deterministic synthetic banking fallback when Postgres is unavailable", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    let result: any;
    try {
      result = await connectorService.execute(context(), "connector_pg_reporting", {
        sql: "SELECT product_name, segment, channel, txn_count, txn_volume_try, marketplace_volume_try, successful_txn_count FROM v_transaction_volume LIMIT 10",
        timeoutMs: 100
      });
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    }
    expect(result.mode).toBe("synthetic-readonly");
    expect(result.source).toBe("fallback-synthetic");
    expect(result.rowCount).toBeGreaterThan(0);
  });

  it("does not let direct connector execution bypass SQL safety", async () => {
    await expect(connectorService.execute(context(), "connector_pg_reporting", {
      sql: "DELETE FROM bank_transactions"
    })).rejects.toThrow(ApiError);
  });

  it("asks for clarification instead of forcing one-shot execution", async () => {
    let final: any;
    for await (const chunk of agentService.streamExecute(context(), {
      agentId: "agent_risk",
      message: "limit"
    })) {
      if (chunk.event === "done") final = chunk.data;
    }

    expect(final.result.mode).toBe("clarification");
    expect(final.result.toolCalls).toHaveLength(0);
  });

  it("opens approval for risky agent action requests", async () => {
    let final: any;
    for await (const chunk of agentService.streamExecute(context(), {
      agentId: "agent_risk",
      message: "Bu bulgu için Jira ticket oluştur"
    })) {
      if (chunk.event === "done") final = chunk.data;
    }

    expect(final.status).toBe("pending_approval");
    expect(final.result.approvalRequestId).toBeTruthy();
    expect(store.snapshot().approvalRequests).toHaveLength(1);
  });

  it("keeps the configured OpenAI Agent Builder workflow ID available server-side", () => {
    expect(chatKitService.getWorkflowId()).toBe("wf_6a05a5d289c481909f30fc151a30d52d068e34df71dd22c3");
  });

  it("requires human approval for high-risk workflow actions", async () => {
    const result = await workflowService.executeAction(context(), {
      type: "jira_ticket",
      payload: { title: "Investigate credit-volume drop" },
      riskLevel: "high"
    });

    expect(result.status).toBe("pending_approval");
    expect(store.snapshot().approvalRequests).toHaveLength(1);
  });

  it("writes audit logs for safety gate runs", () => {
    safetyGateService.runManual(context(), {
      tenantId: "tenant_fibabanka",
      operationType: "service",
      requiredPermission: permissions.tenantsRead
    });

    expect(store.snapshot().auditLogs.some((log) => log.eventType === "SAFETY_GATE")).toBe(true);
  });

  it("creates a deduplicated alert for the seeded marketplace credit-volume drop", () => {
    const result = sentryService.runMetricCheck(context(), {
      metricKey: "marketplace_credit_volume",
      currentValue: 70,
      baselineValue: 100
    });

    expect(Array.isArray(result.alertsCreated)).toBe(true);
    expect(store.snapshot().alertEvents[0]?.priority).toBe("HIGH");
  });

  it("blocks unapproved external market ingestion", () => {
    const source = marketIntelligenceService.createSource(context(), {
      name: "Unapproved source",
      type: "api",
      url: "https://example.invalid",
      governanceApproved: false,
      rateLimitPerHour: 12,
      confidenceScore: 0.5
    });

    expect(() => marketIntelligenceService.ingest(context(), source.id)).toThrow(ApiError);
  });

  it("keeps simulations inside sandbox boundaries", () => {
    const result = simulationService.runWhatIf(context(), {
      scenarioId: "simulation_interest_rate_impact",
      parameters: { proposedRate: 3.5 }
    });

    expect(result.safetyStatus).toBe("PASS");
    expect(() => safetyGateService.assertAllowed(context(), {
      tenantId: "tenant_fibabanka",
      operationType: "simulation",
      requiredPermission: permissions.simulationsExecute,
      sandbox: false,
      liveMutationTarget: true
    })).toThrow(ApiError);
  });
});
