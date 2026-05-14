import { permissions, type RequestContext } from "@phi-ba/contracts";
import { createId, nowIso } from "@phi-ba/shared";
import { describeBankingDemoDataset } from "./banking-demo-data.js";
import { connectorService } from "./connectors.js";
import { blocked } from "./errors.js";
import { llmGatewayService } from "./llm.js";
import { validateSqlAgainstConnector } from "./sql-safety.js";
import { safetyGateService } from "./safety-gates.js";
import { store, type PlatformStore } from "./store.js";
import type { Connector, JsonRecord, QueryTrace } from "./platform-types.js";

export interface NaturalLanguageQueryInput {
  question: string;
  connectorId?: string;
  language?: "tr" | "en";
  execute?: boolean;
  maskingEnabled?: boolean;
}

export interface SqlGenerationResult {
  question: string;
  language: "tr" | "en";
  sql: string;
  confidenceScore: number;
  connectorId: string;
  traceId: string;
  result?: JsonRecord;
  summary?: string;
}

export type TextToSqlStreamEvent =
  | { event: "sql_delta"; data: JsonRecord }
  | { event: "sql_done"; data: JsonRecord }
  | { event: "done"; data: SqlGenerationResult };

export class TextToSqlService {
  constructor(private readonly repository: PlatformStore) {}

  generateSql(question: string): { sql: string; confidenceScore: number; language: "tr" | "en" } {
    const normalized = question.toLocaleLowerCase("tr-TR");
    const language = /[ıİşŞğĞüÜöÖçÇ]/.test(question) ? "tr" : "en";
    if (/şikayet|sikayet|complaint|servis|hizmet|çözüm|cozum|nps/.test(normalized)) {
      return {
        language,
        confidenceScore: 0.82,
        sql: `SELECT topic, priority, complaint_count, open_cases, avg_resolution_hours, digital_share_pct
FROM v_complaint_quality
ORDER BY complaint_count DESC
LIMIT 8`
      };
    }
    if (/fraud|dolandır|dolandir|sahte|alarm|uyarı|uyari|alert/.test(normalized)) {
      return {
        language,
        confidenceScore: 0.82,
        sql: `SELECT fraud_type, severity, alert_count, confirmed_count, amount_at_risk_try, confirmed_amount_try
FROM v_fraud_alerts
ORDER BY amount_at_risk_try DESC
LIMIT 8`
      };
    }
    if (/tahsilat|collections|gecikmiş|gecikmis|dpd|recovery|geri ödeme|geri odeme/.test(normalized)) {
      return {
        language,
        confidenceScore: 0.81,
        sql: `SELECT segment, bucket, case_count, exposure_try, recovered_try, recovery_rate_pct, promise_to_pay_count
FROM v_collections_snapshot
ORDER BY exposure_try DESC
LIMIT 8`
      };
    }
    if (/kampanya|campaign|conversion|dönüşüm|donusum|opt[- ]?out/.test(normalized)) {
      return {
        language,
        confidenceScore: 0.8,
        sql: `SELECT campaign_name, segment, channel, impressions, clicks, conversions, conversion_rate_pct, revenue_try, opt_out_count
FROM v_campaign_conversion
ORDER BY revenue_try DESC
LIMIT 8`
      };
    }
    if (/şube|sube|branch|nps|satış|satis|mevduat/.test(normalized)) {
      return {
        language,
        confidenceScore: 0.8,
        sql: `SELECT branch_region, branch_name, active_customers, deposit_balance_try, loan_balance_try, new_products_sold, complaint_count, nps_score
FROM v_branch_kpi
ORDER BY deposit_balance_try DESC
LIMIT 8`
      };
    }
    if (/rakip|competitor|pazar|market|faiz oran|interest rate|karşılaştır|karsilastir/.test(normalized)) {
      return {
        language,
        confidenceScore: 0.79,
        sql: `SELECT rate_date, competitor, product_name, interest_rate_pct, internal_rate_pct, spread_bps, confidence_score
FROM v_market_rate_comparison
ORDER BY rate_date DESC, spread_bps DESC
LIMIT 8`
      };
    }
    if (/npl|takip|risk|temerrüt|temerrut|gecikme|kredi|loan/.test(normalized)) {
      return {
        language,
        confidenceScore: 0.82,
        sql: `SELECT product_name, segment, risk_band, active_customer_count, exposure_try, overdue_balance_try, npl_ratio_pct, early_warning_count
FROM v_credit_risk_snapshot
ORDER BY overdue_balance_try DESC
LIMIT 8`
      };
    }
    if (/onay|approval|kart|card|reddedilen|red|düştü|dustu|decline/.test(normalized)) {
      return {
        language,
        confidenceScore: 0.78,
        sql: `SELECT report_date, channel, segment, decline_reason, txn_count, txn_volume_try, approval_rate_pct, rejected_txn_count, lost_volume_try
FROM v_card_approval_daily
WHERE report_date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY lost_volume_try DESC
LIMIT 8`
      };
    }
    if (/retention|tutunma|mobil|kohort|cohort/.test(normalized)) {
      return {
        language,
        confidenceScore: 0.8,
        sql: `SELECT cohort_month, segment, acquisition_channel, active_customers, retained_30d_pct, retained_90d_pct, expected_revenue_try, churn_risk_score
FROM v_mobile_retention
ORDER BY expected_revenue_try DESC
LIMIT 8`
      };
    }
    if (/müşteri|musteri|customer|segment|şehir|sehir|city|bakiye|balance/.test(normalized)) {
      return {
        language,
        confidenceScore: 0.76,
        sql: `SELECT segment, city, customer_count, active_customer_count, avg_total_balance_try, avg_risk_score, avg_products
FROM v_customer_360
ORDER BY customer_count DESC
LIMIT 10`
      };
    }
    return {
      language,
      confidenceScore: 0.74,
      sql: `SELECT product_name, segment, channel, txn_count, txn_volume_try, marketplace_volume_try, successful_txn_count
FROM v_transaction_volume
ORDER BY txn_volume_try DESC
LIMIT 10`
    };
  }

  async ask(context: RequestContext, input: NaturalLanguageQueryInput): Promise<SqlGenerationResult> {
    let final: SqlGenerationResult | undefined;
    for await (const chunk of this.askStream(context, input)) {
      if (chunk.event === "done") final = chunk.data;
    }
    if (!final) throw blocked("Text-to-SQL did not produce a final result.");
    return final;
  }

  async *askStream(context: RequestContext, input: NaturalLanguageQueryInput): AsyncIterable<TextToSqlStreamEvent> {
    const connector = this.resolveConnector(context, input.connectorId);
    let generated: { sql: string; confidenceScore: number; language: "tr" | "en"; generator: "openai" | "template" };
    if (process.env.TEXT_TO_SQL_MODE === "template") {
      generated = { ...this.generateSql(input.question), generator: "template" };
      for (const token of splitSqlForStreaming(generated.sql)) {
        yield { event: "sql_delta", data: { token } };
      }
    } else {
      const language = /[ıİşŞğĞüÜöÖçÇ]/.test(input.question) ? "tr" : "en";
      let text = "";
      for await (const chunk of llmGatewayService.streamPrompt(context, {
        promptKey: "text_to_sql",
        model: process.env.TEXT_TO_SQL_MODEL ?? process.env.LLM_MODEL,
        variables: {
          question: input.question,
          schema_context: buildSchemaContext(connector),
          business_context: buildBusinessContext()
        },
        piiMasked: true
      })) {
        if (chunk.event === "token") {
          const token = String(chunk.data.token ?? "");
          text += token;
          yield { event: "sql_delta", data: { token } };
        }
      }
      generated = { sql: normalizeGeneratedSql(text), confidenceScore: 0.86, language, generator: "openai" };
      if (!generated.sql) throw blocked("OpenAI did not return SQL for the text-to-SQL request.");
    }
    const sql = normalizeGeneratedSql(generated.sql);
    const sqlSafety = validateSqlAgainstConnector(sql, connector);
    if (!sqlSafety.ok) throw blocked(sqlSafety.reason);
    yield { event: "sql_done", data: { sql, confidenceScore: generated.confidenceScore, language: generated.language, tables: sqlSafety.tables } };

    safetyGateService.assertAllowed(context, {
      tenantId: context.tenantId,
      operationType: "sql_query",
      operationId: createId("sql_op"),
      connectorId: connector.id,
      requiredPermission: permissions.queryExecute,
      sql,
      maskingEnabled: input.maskingEnabled ?? false
    });

    this.repository.appendAudit({
      tenantId: context.tenantId,
      actorUserId: context.userId,
      eventType: "SQL_GENERATION",
      action: "sql.generate",
      resourceType: "query",
      correlationId: context.correlationId,
      metadata: { question: input.question, sql, confidenceScore: generated.confidenceScore, generator: generated.generator }
    });

    let result: JsonRecord | undefined;
    if (input.execute !== false) {
      result = await connectorService.execute(context, connector.id, { sql, timeoutMs: 8000, maskingEnabled: input.maskingEnabled ?? true });
      this.repository.appendAudit({
        tenantId: context.tenantId,
        actorUserId: context.userId,
        eventType: "SQL_EXECUTION",
        action: "sql.execute",
        resourceType: "connector",
        resourceId: connector.id,
        correlationId: context.correlationId,
        metadata: { sql, rowCount: Array.isArray(result.rows) ? result.rows.length : 0, source: result.source }
      });
    }

    const trace: QueryTrace = {
      id: createId("query_trace"),
      tenantId: context.tenantId,
      userId: context.userId,
      question: input.question,
      language: input.language ?? generated.language,
      generatedSql: sql,
      safetyStatus: "PASS",
      confidenceScore: generated.confidenceScore,
      resultSummary: buildResultSummary(result),
      metadata: { connectorId: connector.id, tables: sqlSafety.tables, columns: sqlSafety.columns, dataset: describeBankingDemoDataset() },
      createdAt: nowIso()
    };
    this.repository.snapshot().queryTraces.unshift(trace);
    yield { event: "done", data: {
      ...generated,
      sql,
      question: input.question,
      connectorId: connector.id,
      traceId: trace.id,
      result,
      summary: trace.resultSummary
    } };
  }

  explain(context: RequestContext, sql: string, connectorId?: string): JsonRecord {
    const connector = this.resolveConnector(context, connectorId);
    const validation = validateSqlAgainstConnector(sql, connector);
    safetyGateService.assertAllowed(context, {
      tenantId: context.tenantId,
      operationType: "sql_query",
      operationId: createId("sql_explain"),
      connectorId: connector.id,
      requiredPermission: permissions.queryExecute,
      sql
    });
    return {
      safe: validation.ok,
      reason: validation.reason,
      tables: validation.tables,
      columns: validation.columns,
      plan: validation.ok
        ? ["Parse SELECT", "Validate table and column allowlists", "Use read-only connection", "Apply timeout 8000ms"]
        : []
    };
  }

  listTraces(context: RequestContext): QueryTrace[] {
    return this.repository.snapshot().queryTraces.filter((trace) => trace.tenantId === context.tenantId);
  }

  private resolveConnector(context: RequestContext, connectorId?: string): Connector {
    if (connectorId) return this.repository.getConnector(context.tenantId, connectorId);
    const connector = this.repository.listConnectors(context.tenantId).find((item) => item.type === "postgresql");
    if (!connector) throw blocked("No PostgreSQL connector is available for text-to-SQL");
    return connector;
  }

}

export const textToSqlService = new TextToSqlService(store);

function buildResultSummary(result?: JsonRecord): string {
  if (!result) return "SQL generated and validated; execution was not requested.";
  const rowCount = Number(result.rowCount ?? (Array.isArray(result.rows) ? result.rows.length : 0));
  const source = String(result.source ?? result.mode ?? "connector");
  return `Guarded read-only query returned ${rowCount} rows from ${source}.`;
}

function buildSchemaContext(connector: Connector): string {
  const allowedColumns = connector.allowedColumns ?? {};
  return (connector.allowedTables ?? [])
    .map((table) => `${table}(${(allowedColumns[table] ?? []).join(", ")})`)
    .join("\n");
}

function buildBusinessContext(): string {
  return [
    "Kart onay/red sorulari icin v_card_approval_daily kullan.",
    "NPL, takip, kredi riski icin v_credit_risk_snapshot kullan.",
    "Mobil retention ve kohort icin v_mobile_retention kullan.",
    "Kampanya donusumu icin v_campaign_conversion kullan.",
    "Sube performansi icin v_branch_kpi kullan.",
    "Sikayet ve servis kalitesi icin v_complaint_quality kullan.",
    "Fraud alert icin v_fraud_alerts kullan.",
    "Tahsilat icin v_collections_snapshot kullan.",
    "Rakip faiz ve market karsilastirmasi icin v_market_rate_comparison kullan.",
    "Genel islem hacmi icin v_transaction_volume kullan.",
    "Musteri segment ve bakiye ozetleri icin v_customer_360 kullan."
  ].join("\n");
}

function normalizeGeneratedSql(text: string): string {
  return text
    .replace(/```sql/gi, "")
    .replace(/```/g, "")
    .trim()
    .replace(/;+\s*$/g, "")
    .trim();
}

function splitSqlForStreaming(sql: string): string[] {
  return sql.split(/(\s+|,\s*)/).filter(Boolean);
}
