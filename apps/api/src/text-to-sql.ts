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
    const language: "tr" | "en" = /[ıİşŞğĞüÜöÖçÇ]/.test(input.question) ? "tr" : "en";
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
    const generated: { sql: string; confidenceScore: number; language: "tr" | "en"; generator: "model" } = {
      sql: normalizeGeneratedSql(text),
      confidenceScore: 0.86,
      language,
      generator: "model"
    };
    if (!generated.sql) throw blocked("The model did not return SQL for the text-to-SQL request.");
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
    "Veri seti kayit sayilari ve 'kac musteri var' sorulari icin v_dataset_summary kullan.",
    "Persona, yasam dongusu, churn ve aktiflik sorulari icin v_customer_lifecycle kullan.",
    "Karlilik, segment degeri ve risk/deger karsilastirmasi icin v_segment_profitability kullan.",
    "Kanal davranisi, dijital olgunluk ve login/satis sinyalleri icin v_channel_behavior kullan.",
    "Cross-sell ve teklif uygunlugu sorulari icin v_offer_eligibility veya v_product_cross_sell kullan.",
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
