import { permissions, type RequestContext } from "@phi-ba/contracts";
import { createId, nowIso } from "@phi-ba/shared";
import { connectorService } from "./connectors.js";
import { blocked } from "./errors.js";
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

export class TextToSqlService {
  constructor(private readonly repository: PlatformStore) {}

  generateSql(question: string): { sql: string; confidenceScore: number; language: "tr" | "en" } {
    const normalized = question.toLocaleLowerCase("tr-TR");
    const language = /[ıİşŞğĞüÜöÖçÇ]/.test(question) ? "tr" : "en";
    if (/npl|takip|risk|temerrüt|gecikme/.test(normalized)) {
      return {
        language,
        confidenceScore: 0.82,
        sql: `SELECT urun_adi, segment, npl_orani, aktif_musteri, riskli_bakiye
FROM risk_izleme
WHERE rapor_donemi = DATE_TRUNC('quarter', CURRENT_DATE)
ORDER BY riskli_bakiye DESC
LIMIT 8`
      };
    }
    if (/onay|approval|kart|reddedilen|düştü|dustu/.test(normalized)) {
      return {
        language,
        confidenceScore: 0.78,
        sql: `SELECT kanal, saat_dilimi, onay_orani, reddedilen_islem, kayip_hacim
FROM kart_islemleri
WHERE islem_tarihi >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY kayip_hacim DESC
LIMIT 8`
      };
    }
    if (/retention|tutunma|mobil|kohort|cohort/.test(normalized)) {
      return {
        language,
        confidenceScore: 0.8,
        sql: `SELECT kohort, segment, retention_90d, aktif_musteri, beklenen_gelir
FROM mobil_kullanim
WHERE edinim_kanali = 'mobil'
ORDER BY beklenen_gelir DESC
LIMIT 8`
      };
    }
    return {
      language,
      confidenceScore: 0.74,
      sql: `SELECT u.ad AS urun, m.segment AS segment, COUNT(*) AS islem_adedi, SUM(i.tutar) AS islem_hacmi
FROM islemler i
JOIN musteriler m ON m.id = i.musteri_id
JOIN urunler u ON u.id = i.urun_id
WHERE i.gerceklesme_tarihi >= NOW() - INTERVAL '30 days'
  AND i.durum = 'basarili'
GROUP BY u.ad, m.segment
ORDER BY islem_hacmi DESC
LIMIT 10`
    };
  }

  async ask(context: RequestContext, input: NaturalLanguageQueryInput): Promise<SqlGenerationResult> {
    const connector = this.resolveConnector(context, input.connectorId);
    const generated = this.generateSql(input.question);
    const sqlSafety = validateSqlAgainstConnector(generated.sql, connector);
    if (!sqlSafety.ok) throw blocked(sqlSafety.reason);

    safetyGateService.assertAllowed(context, {
      tenantId: context.tenantId,
      operationType: "sql_query",
      operationId: createId("sql_op"),
      connectorId: connector.id,
      requiredPermission: permissions.queryExecute,
      sql: generated.sql,
      maskingEnabled: input.maskingEnabled ?? false
    });

    this.repository.appendAudit({
      tenantId: context.tenantId,
      actorUserId: context.userId,
      eventType: "SQL_GENERATION",
      action: "sql.generate",
      resourceType: "query",
      correlationId: context.correlationId,
      metadata: { question: input.question, sql: generated.sql, confidenceScore: generated.confidenceScore }
    });

    let result: JsonRecord | undefined;
    if (input.execute !== false) {
      result = await connectorService.execute(context, connector.id, { sql: generated.sql, timeoutMs: 8000 });
      this.repository.appendAudit({
        tenantId: context.tenantId,
        actorUserId: context.userId,
        eventType: "SQL_EXECUTION",
        action: "sql.execute",
        resourceType: "connector",
        resourceId: connector.id,
        correlationId: context.correlationId,
        metadata: { sql: generated.sql, rowCount: Array.isArray(result.rows) ? result.rows.length : 0 }
      });
    }

    const trace: QueryTrace = {
      id: createId("query_trace"),
      tenantId: context.tenantId,
      userId: context.userId,
      question: input.question,
      language: input.language ?? generated.language,
      generatedSql: generated.sql,
      safetyStatus: "PASS",
      confidenceScore: generated.confidenceScore,
      resultSummary: "Local mock execution completed through guarded connector path.",
      metadata: { connectorId: connector.id, tables: sqlSafety.tables, columns: sqlSafety.columns },
      createdAt: nowIso()
    };
    this.repository.snapshot().queryTraces.unshift(trace);
    return {
      ...generated,
      question: input.question,
      connectorId: connector.id,
      traceId: trace.id,
      result,
      summary: trace.resultSummary
    };
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
