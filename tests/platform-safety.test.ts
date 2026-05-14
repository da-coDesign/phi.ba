import { beforeEach, describe, expect, it } from "vitest";
import { permissions, type RequestContext } from "@phi-ba/contracts";
import { agentService, classifyAgentIntent } from "../apps/api/src/agents.js";
import { chatKitService } from "../apps/api/src/chatkit.js";
import { connectorService, getPostgresCredentialStatus } from "../apps/api/src/connectors.js";
import { ApiError } from "../apps/api/src/errors.js";
import { llmGatewayService } from "../apps/api/src/llm.js";
import { marketIntelligenceService } from "../apps/api/src/market-intelligence.js";
import { safetyGateService } from "../apps/api/src/safety-gates.js";
import { sentryService } from "../apps/api/src/sentry.js";
import { simulationService } from "../apps/api/src/simulation.js";
import { extractSqlColumns, isReadOnlySql, validateSqlAgainstConnector } from "../apps/api/src/sql-safety.js";
import { store } from "../apps/api/src/store.js";
import { textToSqlService } from "../apps/api/src/text-to-sql.js";
import { workflowService } from "../apps/api/src/workflows.js";
import { buildBankingDemoDataset } from "../scripts/seed-banking-demo-data.js";

const TEST_PROVIDER_KEY = "test-sql-provider";
const TEST_MODEL = "test-sql-model";

async function completeTestProvider(input: any): Promise<{ text: string; tokenUsage: { input: number; output: number } }> {
  const text = buildTestProviderText(input.variables ?? {});
  return {
    text,
    tokenUsage: {
      input: Math.ceil(String(input.prompt ?? "").length / 4),
      output: Math.ceil(text.length / 4)
    }
  };
}

const testModelProvider = {
  key: TEST_PROVIDER_KEY,
  complete: completeTestProvider,
  async *stream(input: any): AsyncIterable<string> {
    const result = await completeTestProvider(input);
    for (const token of result.text.split(/(\s+)/).filter(Boolean)) {
      yield token;
    }
  }
};

function buildTestProviderText(variables: Record<string, unknown>): string {
  const question = String(variables.question ?? "");
  if (question) return testSqlForQuestion(question);
  const toolSummary = String(variables.tool_summary ?? "");
  if (toolSummary) return toolSummary;
  const userMessage = String(variables.user_message ?? "");
  const conversationContext = String(variables.conversation_context ?? "");
  if (conversationContext && /(bu data|bu veri|ne demek|yorumla|açıkla|acikla)/i.test(userMessage)) {
    return "Bu veri önceki sorgudaki segment bazlı işlem hacmini açıklıyor.";
  }
  return userMessage ? `Test provider response for: ${userMessage}` : "Test provider response.";
}

function testSqlForQuestion(question: string): string {
  const normalized = question.toLocaleLowerCase("tr-TR");
  if (/previous analytics context/.test(normalized) && /v_card_approval_daily/.test(normalized) && /(geniş|genis|broader|evet|öyle|oyle)/.test(normalized)) {
    return "SELECT report_date, channel, segment, decline_reason, txn_count, txn_volume_try, approval_rate_pct, rejected_txn_count, lost_volume_try FROM v_card_approval_daily WHERE report_date BETWEEN DATE '2024-04-11' AND DATE '2024-04-25' ORDER BY rejected_txn_count DESC LIMIT 10";
  }
  if (/(?:kaç|kac|sayı|sayısı|sayisi|adet|count).*(?:müşteri|musteri|customer)|(?:müşteri|musteri|customer).*(?:kaç|kac|sayı|sayısı|sayisi|adet|count)/.test(normalized)) {
    return "SELECT metric_name, row_count, description FROM v_dataset_summary WHERE metric_name = 'customers' LIMIT 1";
  }
  if (/fraud|dolandır|dolandir|sahte|alarm|uyarı|uyari|alert/.test(normalized)) {
    return "SELECT fraud_type, severity, alert_count, confirmed_count, amount_at_risk_try, confirmed_amount_try FROM v_fraud_alerts ORDER BY amount_at_risk_try DESC LIMIT 8";
  }
  if (/tahsilat|collections|gecikmiş|gecikmis|dpd|recovery|geri ödeme|geri odeme/.test(normalized)) {
    return "SELECT segment, bucket, case_count, exposure_try, recovered_try, recovery_rate_pct, promise_to_pay_count FROM v_collections_snapshot ORDER BY exposure_try DESC LIMIT 8";
  }
  if (/kampanya|campaign|conversion|dönüşüm|donusum|opt[- ]?out/.test(normalized)) {
    return "SELECT campaign_name, segment, channel, impressions, clicks, conversions, conversion_rate_pct, revenue_try, opt_out_count FROM v_campaign_conversion ORDER BY revenue_try DESC LIMIT 8";
  }
  if (/teklif|offer|uygun|eligibility|cross[- ]?sell|çapraz|capraz/.test(normalized)) {
    return "SELECT offer_key, product_name, segment, persona_key, scored_customer_count, eligible_customer_count, avg_score, avg_relationship_value_try FROM v_offer_eligibility ORDER BY eligible_customer_count DESC LIMIT 8";
  }
  if (/persona|lifecycle|yaşam|yasam|churn|aktiflik/.test(normalized)) {
    return "SELECT persona_key, persona_name, segment, lifecycle_stage, customer_count, active_customer_count, marketing_consent_count, avg_digital_maturity_score, avg_churn_risk_score, relationship_value_try FROM v_customer_lifecycle ORDER BY customer_count DESC LIMIT 8";
  }
  if (/şube|sube|branch|nps|satış|satis|mevduat/.test(normalized)) {
    return "SELECT branch_region, branch_name, active_customers, deposit_balance_try, loan_balance_try, new_products_sold, complaint_count, nps_score FROM v_branch_kpi ORDER BY deposit_balance_try DESC LIMIT 8";
  }
  if (/onay|approval|kart|card|reddedilen|red|düştü|dustu|decline/.test(normalized)) {
    return "SELECT report_date, channel, segment, decline_reason, txn_count, txn_volume_try, approval_rate_pct, rejected_txn_count, lost_volume_try FROM v_card_approval_daily ORDER BY lost_volume_try DESC LIMIT 8";
  }
  return "SELECT product_name, segment, channel, txn_count, txn_volume_try, marketplace_volume_try, successful_txn_count FROM v_transaction_volume ORDER BY txn_volume_try DESC LIMIT 10";
}

llmGatewayService.router.register(testModelProvider);

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
    llmGatewayService.router.register(testModelProvider);
    process.env.LLM_PROVIDER = TEST_PROVIDER_KEY;
    process.env.LLM_MODEL = TEST_MODEL;
    store.reset();
    store.updateTenantConfig("tenant_fibabanka", {
      modelPolicy: {
        provider: TEST_PROVIDER_KEY,
        allowedModels: [TEST_MODEL],
        piiMode: "mask_required"
      }
    });
  });

  it("builds the 2,500 customer scenario-template dataset deterministically", () => {
    const dataset = buildBankingDemoDataset(42);

    expect(dataset.syntheticCustomerTemplates).toHaveLength(6);
    expect(dataset.customers).toHaveLength(2500);
    expect(dataset.customerProfiles).toHaveLength(2500);
    expect(dataset.customerEvents).toHaveLength(7500);
    expect(dataset.customerOfferEligibility).toHaveLength(7500);
    expect(new Set(dataset.customerProfiles.map((row) => row.customer_id))).toHaveLength(2500);
    expect(new Set(dataset.customerProfiles.map((row) => row.persona_key))).toEqual(new Set([
      "mass_digital_salary",
      "affluent_investor",
      "sme_merchant",
      "young_mobile_first",
      "private_wealth",
      "micro_merchant"
    ]));
  });

  it("allowlists scenario reporting views for governed text-to-SQL", async () => {
    await expect(textToSqlService.ask(context(), { question: "Hangi müşteriler teklif için uygun?", execute: false })).resolves.toMatchObject({ sql: expect.stringContaining("v_offer_eligibility") });
    await expect(textToSqlService.ask(context(), { question: "Persona lifecycle ve churn dağılımını göster", execute: false })).resolves.toMatchObject({ sql: expect.stringContaining("v_customer_lifecycle") });
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

  it("allows aggregate SQL expressions over allowlisted columns", () => {
    const connector = store.getConnector("tenant_fibabanka", "connector_pg_reporting");
    const sql = "SELECT city, COUNT(*) AS customer_count, ROUND(AVG(avg_total_balance_try), 2) AS avg_balance_try FROM v_customer_360 WHERE city = 'Antalya' GROUP BY city";
    const result = validateSqlAgainstConnector(sql, connector);

    expect(result.ok).toBe(true);
    expect(result.columns).toEqual(expect.arrayContaining(["city", "avg_total_balance_try"]));
    expect(result.columns).not.toContain("ROUNDAVGavg_total_balance_try");
    expect(extractSqlColumns("SELECT age_band, income_band, COUNT(*) AS customer_count, ROUND(AVG(risk_score), 2) AS avg_risk_score FROM bank_customers WHERE city = 'Antalya' GROUP BY age_band, income_band")).toEqual(expect.arrayContaining(["age_band", "income_band", "risk_score"]));
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
    expect(classifyAgentIntent("kaç tane müşteri var?")).toBe("data_query");
    expect(classifyAgentIntent("email kampanya dönüşümü nasıl?")).toBe("data_query");
    expect(classifyAgentIntent("şube performansını açabilir misin?")).toBe("data_query");
    expect(classifyAgentIntent("bu metrik için aksiyon al")).toBe("action_request");
  });

  it("answers ambiguous data explanation follow-ups from prior card context", async () => {
    let final: any;
    for await (const chunk of agentService.streamExecute(context(), {
      agentId: "agent_risk",
      message: "bu data ne demek oluyor?",
      conversationContext: [{
        question: "Son 30 günde işlem hacmine göre en çok kullanılan 10 segment",
        answer: "Son 30 günde işlem hacmine göre en çok kullanılan 10 segment için sorgu çalıştırıldı.",
        mode: "data_card",
        sql: "SELECT segment, txn_volume_try FROM v_transaction_volume ORDER BY txn_volume_try DESC LIMIT 10",
        columns: [
          { key: "segment", label: "segment", type: "text" },
          { key: "txn_volume_try", label: "txn volume try", type: "currency" }
        ],
        rows: [
          ["Mass", 4271318.72],
          ["SME", 2745124.39]
        ]
      }]
    })) {
      if (chunk.event === "done") final = chunk.data;
    }

    expect(final.status).toBe("completed");
    expect(final.result.mode).toBe("text");
    expect(final.result.toolCalls).toHaveLength(0);
    expect(final.response).toContain("segment bazlı işlem hacmini");
  });

  it("uses the prior zero-row card context for broader-filter follow-ups", async () => {
    const conversationContext = [{
      question: "18 Nisan'da kart onay oranı neden düştü?",
      answer: "18 Nisan için çalıştırılan güvenli read-only sorgu sonuç döndürmedi. İstersen aynı tarihi daha geniş filtrelerle yeniden inceleyelim.",
      mode: "data_card",
      sql: "SELECT report_date, channel, segment, decline_reason, txn_count, txn_volume_try, approval_rate_pct, rejected_txn_count, lost_volume_try FROM v_card_approval_daily WHERE report_date = DATE '2024-04-18' ORDER BY rejected_txn_count DESC LIMIT 10",
      columns: [
        { key: "report_date", label: "report date", type: "text" },
        { key: "approval_rate_pct", label: "approval rate pct", type: "percent" },
        { key: "rejected_txn_count", label: "rejected txn count", type: "count" }
      ],
      rows: []
    }];

    for (const message of ["aynı tarihi daha geniş filtrelerle incele", "evet öyle yap"]) {
      let sql = "";
      let final: any;
      let caught: unknown;
      try {
        for await (const chunk of agentService.streamExecute(context(), {
          agentId: "agent_risk",
          message,
          conversationContext
        })) {
          if (chunk.event === "sql_done") sql = String(chunk.data.sql ?? "");
          if (chunk.event === "done") final = chunk.data;
        }
      } catch (error) {
        caught = error;
      }

      expect(sql).toContain("v_card_approval_daily");
      expect(sql).toContain("BETWEEN DATE '2024-04-11' AND DATE '2024-04-25'");
      expect(sql).not.toContain("report_date = DATE '2024-04-18'");
      if (!caught) expect(final?.status).toBe("completed");
    }
  });

  it("returns card-ready data for metric questions through the central agent", async () => {
    if (!process.env.DATABASE_URL) {
      await expect(agentService.execute(context(), {
        agentId: "agent_risk",
        message: "Kart onay oranı neden düştü?"
      })).rejects.toThrow(/DATABASE_URL/);
      return;
    }

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

  it("does not turn customer count questions into approval workflows", async () => {
    if (!process.env.DATABASE_URL) {
      await expect(agentService.execute(context(), {
        agentId: "agent_risk",
        message: "kaç tane müşteri var?"
      })).rejects.toThrow(/DATABASE_URL/);
      expect(store.snapshot().approvalRequests).toHaveLength(0);
      return;
    }

    let final: any;
    for await (const chunk of agentService.streamExecute(context(), {
      agentId: "agent_risk",
      message: "kaç tane müşteri var?"
    })) {
      if (chunk.event === "done") final = chunk.data;
    }

    expect(final.status).toBe("completed");
    expect(final.result.mode).toBe("data_card");
    expect(final.result.sql).toContain("v_dataset_summary");
    expect(final.response).toContain("2.500");
    expect(final.result.toolCalls[0]?.toolKey).toBe("query.run");
  });

  it("does not synthesize FBDWHPRD answers when real OpenAI credentials are missing", async () => {
    const previousProvider = process.env.LLM_PROVIDER;
    const previousModel = process.env.LLM_MODEL;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    process.env.LLM_PROVIDER = "openai";
    process.env.LLM_MODEL = "gpt-5.4-mini";
    delete process.env.OPENAI_API_KEY;
    store.updateTenantConfig("tenant_fibabanka", {
      modelPolicy: {
        provider: "openai",
        allowedModels: ["gpt-5.4-mini"],
        piiMode: "mask_required"
      }
    });

    try {
      await expect(agentService.execute(context(), {
        agentId: "agent_risk",
        message: "kaç müşteri var bu veri setinde?",
        connectorId: "connector_pg_reporting"
      })).rejects.toThrow(/OPENAI_API_KEY/);
    } finally {
      process.env.LLM_PROVIDER = previousProvider;
      process.env.LLM_MODEL = previousModel;
      if (previousOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousOpenAiKey;
      }
    }

    expect(store.snapshot().queryTraces).toHaveLength(0);
  });

  it("routes broad banking topics to allowlisted reporting views through the model provider", async () => {
    await expect(textToSqlService.ask(context(), { question: "Fraud alert hacmini göster", execute: false })).resolves.toMatchObject({ sql: expect.stringContaining("v_fraud_alerts") });
    await expect(textToSqlService.ask(context(), { question: "Şube mevduat performansı", execute: false })).resolves.toMatchObject({ sql: expect.stringContaining("v_branch_kpi") });
    await expect(textToSqlService.ask(context(), { question: "Kampanya dönüşüm oranı", execute: false })).resolves.toMatchObject({ sql: expect.stringContaining("v_campaign_conversion") });
    await expect(textToSqlService.ask(context(), { question: "Tahsilat bucket bazında nasıl?", execute: false })).resolves.toMatchObject({ sql: expect.stringContaining("v_collections_snapshot") });
  });

  it("requires PostgreSQL instead of using synthetic fallback when Postgres is unavailable", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      await expect(connectorService.execute(context(), "connector_pg_reporting", {
        sql: "SELECT product_name, segment, channel, txn_count, txn_volume_try, marketplace_volume_try, successful_txn_count FROM v_transaction_volume LIMIT 10",
        timeoutMs: 100
      })).rejects.toThrow(/DATABASE_URL/);
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    }
  });

  it("recognizes common production Postgres environment variable names", () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousPostgresUrl = process.env.POSTGRES_URL;
    delete process.env.DATABASE_URL;
    process.env.POSTGRES_URL = "postgresql://readonly:test@example.invalid:5432/phi_ba";

    try {
      const connector = store.getConnector("tenant_fibabanka", "connector_pg_reporting");
      expect(getPostgresCredentialStatus(connector)).toMatchObject({
        hasDatabaseUrl: true,
        databaseUrlSource: "POSTGRES_URL"
      });
      expect(connectorService.test(context(), "connector_pg_reporting")).toMatchObject({ ok: true });
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
      if (previousPostgresUrl === undefined) {
        delete process.env.POSTGRES_URL;
      } else {
        process.env.POSTGRES_URL = previousPostgresUrl;
      }
    }
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
