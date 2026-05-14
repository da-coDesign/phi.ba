import { beforeEach, describe, expect, it } from "vitest";
import { permissions, type RequestContext } from "@phi-ba/contracts";
import { agentService } from "../apps/api/src/agents.js";
import { connectorService } from "../apps/api/src/connectors.js";
import { ApiError } from "../apps/api/src/errors.js";
import { marketIntelligenceService } from "../apps/api/src/market-intelligence.js";
import { safetyGateService } from "../apps/api/src/safety-gates.js";
import { sentryService } from "../apps/api/src/sentry.js";
import { simulationService } from "../apps/api/src/simulation.js";
import { isReadOnlySql } from "../apps/api/src/sql-safety.js";
import { store } from "../apps/api/src/store.js";
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
    store.reset();
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
