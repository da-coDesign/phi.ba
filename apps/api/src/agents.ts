import { permissions, type RequestContext } from "@phi-ba/contracts";
import { createId, nowIso } from "@phi-ba/shared";
import { blocked } from "./errors.js";
import { llmGatewayService } from "./llm.js";
import { marketIntelligenceService } from "./market-intelligence.js";
import { ragService } from "./rag.js";
import { safetyGateService } from "./safety-gates.js";
import { simulationService } from "./simulation.js";
import { store, type PlatformStore } from "./store.js";
import { textToSqlService, type SqlGenerationResult } from "./text-to-sql.js";
import { workflowService } from "./workflows.js";
import type { Agent, AgentExecutionTrace, AgentTemplate, ApprovalRequest, JsonRecord, ToolDefinition } from "./platform-types.js";

export type AgentIntent =
  | "direct_answer"
  | "data_query"
  | "knowledge_rag"
  | "market_compare"
  | "simulation"
  | "action_request"
  | "clarification_needed";

type AgentStreamEvent = "meta" | "progress" | "sql_delta" | "sql_done" | "tool" | "token" | "done";

interface AgentDecision {
  intent: AgentIntent;
  toolKey?: string;
  riskLevel: ToolDefinition["riskLevel"];
  mode: "text" | "data_card" | "approval" | "clarification" | "simulation" | "market";
  reason: string;
}

interface AgentToolResult {
  mode: AgentDecision["mode"];
  answer: string;
  toolCalls: JsonRecord[];
  sql?: string;
  rows?: unknown[][];
  columns?: Array<{ key?: string; label: string; type: string; align?: "right" }>;
  stats?: Array<{ label: string; type: string; value: unknown }>;
  citations?: JsonRecord[];
  approvalRequestId?: string;
  traceId?: string;
  category?: string;
  recommendedAction?: "jira" | "email" | "deck";
  boardable?: boolean;
  raw?: JsonRecord;
}

export class ToolRegistry {
  constructor(private readonly repository: PlatformStore) {}

  list(): ToolDefinition[] {
    return this.repository.snapshot().tools;
  }

  get(toolKey: string): ToolDefinition {
    const tool = this.repository.snapshot().tools.find((item) => item.key === toolKey);
    if (!tool) throw blocked(`Tool ${toolKey} is not registered`);
    return tool;
  }
}

export class AgentService {
  public readonly tools: ToolRegistry;

  constructor(private readonly repository: PlatformStore) {
    this.tools = new ToolRegistry(repository);
  }

  listTemplates(context: RequestContext): AgentTemplate[] {
    return this.repository.snapshot().agentTemplates.filter((template) => template.tenantId === context.tenantId);
  }

  listAgents(context: RequestContext): Agent[] {
    return this.repository.snapshot().agents.filter((agent) => agent.tenantId === context.tenantId);
  }

  async execute(context: RequestContext, input: { agentId: string; message: string; toolKey?: string; approvalId?: string; connectorId?: string }): Promise<JsonRecord> {
    let final: JsonRecord | undefined;
    for await (const chunk of this.streamExecute(context, input)) {
      if (chunk.event === "done") final = chunk.data;
    }
    if (!final) throw blocked("Agent execution did not produce a final response.");
    return final;
  }

  async *streamExecute(context: RequestContext, input: { agentId: string; message: string; toolKey?: string; approvalId?: string; connectorId?: string }): AsyncIterable<{ event: AgentStreamEvent; data: JsonRecord }> {
    const agent = this.repository.snapshot().agents.find((item) => item.tenantId === context.tenantId && item.id === input.agentId);
    if (!agent || !agent.enabled) throw blocked(`Agent ${input.agentId} is not available`);

    const decision = decideAgentPath(input.message, input.toolKey);
    const operationId = createId("agent_run");
    const model = process.env.LLM_MODEL ?? "gpt-5.4-mini";
    const selectedTool = decision.toolKey ? this.tools.get(decision.toolKey) : undefined;
    const safetyRuns = safetyGateService.runForOperation(context, {
      tenantId: context.tenantId,
      operationType: "agent",
      operationId,
      requiredPermission: permissions.agentsExecute,
      model,
      toolKey: decision.toolKey,
      riskLevel: selectedTool?.riskLevel ?? decision.riskLevel,
      approvalId: input.approvalId,
      payload: { message: input.message, intent: decision.intent, connectorId: input.connectorId }
    });
    const blockers = safetyRuns.filter((run) => run.status === "BLOCKED");
    if (blockers.length > 0) {
      const approvalBlock = blockers.find((run) => run.checkKey === "human_approval_policy");
      if (approvalBlock && blockers.length === 1 && decision.toolKey) {
        const approval = this.createApprovalRequest(context, {
          actionType: `agent_tool.${decision.toolKey}`,
          subjectId: operationId,
          reason: approvalBlock.message
        });
        const result: AgentToolResult = {
          mode: "approval",
          answer: "Bu aksiyon canlı sisteme etki edebilir. Onay talebi açtım; onaylanmadan çalıştırmayacağım.",
          toolCalls: [{ toolKey: decision.toolKey, status: "pending_approval" }],
          approvalRequestId: approval.id,
          boardable: true,
          category: "ops",
          recommendedAction: "jira"
        };
        const trace = this.appendTrace(context, {
          agentId: agent.id,
          input: { message: input.message, decision },
          output: result as unknown as JsonRecord,
          toolCalls: result.toolCalls,
          safetyStatus: "BLOCKED",
          status: "pending_approval"
        });
        yield { event: "done", data: { status: "pending_approval", response: result.answer, traceId: trace.id, result } };
        return;
      }
      throw blocked(blockers.map((run) => `${run.checkKey}: ${run.message}`).join("; "));
    }

    yield { event: "meta", data: { agentId: agent.id, agentName: agent.name, operationId, decision, safetyStatus: "PASS" } };
    yield { event: "progress", data: { message: `Niyet sınıflandırıldı: ${decision.intent}`, intent: decision.intent } };

    let toolResult: AgentToolResult | undefined;
    if (decision.intent === "clarification_needed") {
      toolResult = {
        mode: "clarification",
        answer: "Bunu güvenli şekilde çalıştırabilmem için bir noktayı netleştirelim: hangi metrik, tarih aralığı veya segment üzerinden ilerlememi istiyorsun?",
        toolCalls: [],
        boardable: false
      };
    } else if (decision.intent === "data_query") {
      yield { event: "progress", data: { message: "SQL planı hazırlanıyor", toolKey: "query.run" } };
      let query: SqlGenerationResult | undefined;
      for await (const chunk of textToSqlService.askStream(context, { question: input.message, connectorId: input.connectorId, execute: true, maskingEnabled: true })) {
        if (chunk.event === "sql_delta") yield { event: "sql_delta", data: chunk.data };
        if (chunk.event === "sql_done") yield { event: "sql_done", data: chunk.data };
        if (chunk.event === "done") query = chunk.data as unknown as SqlGenerationResult;
      }
      if (!query) throw blocked("Text-to-SQL did not produce a query result.");
      toolResult = buildDataToolResult(input.message, query);
      yield { event: "tool", data: { toolKey: "query.run", status: "completed", mode: toolResult.mode, result: summarizeToolResult(toolResult) } };
    } else if (decision.toolKey) {
      yield { event: "progress", data: { message: `${decision.toolKey} hazırlanıyor`, toolKey: decision.toolKey } };
      toolResult = await this.executeTool(context, decision, input.message, input.approvalId, input.connectorId);
      yield { event: "tool", data: { toolKey: decision.toolKey, status: "completed", mode: toolResult.mode, result: summarizeToolResult(toolResult) } };
    } else {
      toolResult = {
        mode: "text",
        answer: "",
        toolCalls: [],
        boardable: false
      };
    }

    let response = "";
    for await (const token of this.streamFinalAnswer(context, agent, input.message, decision, toolResult, model)) {
      response += token;
      yield { event: "token", data: { token } };
    }
    const finalResult: AgentToolResult = {
      ...toolResult,
      answer: response || toolResult.answer
    };
    const trace = this.appendTrace(context, {
      agentId: agent.id,
      input: { message: input.message, decision },
      output: finalResult as unknown as JsonRecord,
      toolCalls: finalResult.toolCalls,
      safetyStatus: "PASS",
      status: "completed"
    });
    this.repository.appendAudit({
      tenantId: context.tenantId,
      actorUserId: context.userId,
      eventType: "AGENT_RUN",
      action: "agent.orchestrate.stream",
      resourceType: "agent",
      resourceId: agent.id,
      correlationId: context.correlationId,
      metadata: { intent: decision.intent, toolKey: decision.toolKey, traceId: trace.id }
    });
    yield { event: "done", data: { status: "completed", response: finalResult.answer, traceId: trace.id, result: finalResult } };
  }

  listTraces(context: RequestContext): AgentExecutionTrace[] {
    return this.repository.snapshot().agentExecutionTraces.filter((trace) => trace.tenantId === context.tenantId);
  }

  private async executeTool(context: RequestContext, decision: AgentDecision, message: string, approvalId?: string, connectorId?: string): Promise<AgentToolResult> {
    if (decision.intent === "data_query") {
      const query = await textToSqlService.ask(context, { question: message, connectorId, execute: true, maskingEnabled: true });
      return buildDataToolResult(message, query);
    }

    if (decision.intent === "knowledge_rag") {
      const retrieved = ragService.retrieve(context, { query: message, limit: 5 });
      const citations = Array.isArray(retrieved.citations) ? retrieved.citations as JsonRecord[] : [];
      return {
        mode: "text",
        answer: citations.length
          ? `${citations.length} adet yönetilen kaynak buldum. Cevabı bu kanıtlara göre özetliyorum.`
          : "Bu tenant için indekslenmiş kanıt bulamadım; önce doküman ingest edilmesi gerekiyor.",
        toolCalls: [{ toolKey: "rag.retrieve", status: "completed", citations: citations.length }],
        citations,
        boardable: false,
        raw: retrieved
      };
    }

    if (decision.intent === "market_compare") {
      const comparison = marketIntelligenceService.compare(context);
      const external = Array.isArray(comparison.external) ? comparison.external as JsonRecord[] : [];
      const rows = external.map((item) => [
        item.competitor ?? "Unknown",
        item.product ?? "consumer_loan",
        item.interestRate ?? null,
        item.confidenceScore ?? null
      ]);
      return {
        mode: "market",
        answer: "Rakip oranlarını iç metrikle karşılaştırdım; bu sonuç yönetilen kaynaklardan ve rate-limit kurallarından geçer.",
        toolCalls: [{ toolKey: "market.compare", status: "completed" }],
        columns: [
          { label: "rakip", type: "text" },
          { label: "ürün", type: "text" },
          { label: "faiz oranı", type: "percent", align: "right" },
          { label: "güven", type: "percent", align: "right" }
        ],
        rows,
        stats: [{ label: "İç oran", type: "percent", value: (comparison.internal as JsonRecord | undefined)?.interestRate ?? 0 }],
        category: "market",
        recommendedAction: "deck",
        boardable: true,
        raw: comparison
      };
    }

    if (decision.intent === "simulation") {
      const proposedRate = extractRate(message) ?? 3.45;
      const result = simulationService.runWhatIf(context, {
        scenarioId: "simulation_interest_rate_impact",
        parameters: { proposedRate }
      });
      const output = result.output;
      return {
        mode: "simulation",
        answer: "Simülasyonu sandbox içinde çalıştırdım. Bu çıktı gerçek aksiyona dönmeden önce ayrıca onay gerektirir.",
        toolCalls: [{ toolKey: "simulation.run", status: "completed", resultId: result.id }],
        columns: [
          { label: "senaryo", type: "text" },
          { label: "dönüşüm etkisi", type: "delta", align: "right" },
          { label: "gelir etkisi", type: "currency", align: "right" }
        ],
        rows: [[result.scenarioId, output.estimatedConversionDeltaPct, output.estimatedRevenueDeltaTry]],
        stats: [
          { label: "Dönüşüm etkisi", type: "delta", value: output.estimatedConversionDeltaPct },
          { label: "Gelir etkisi", type: "currency", value: output.estimatedRevenueDeltaTry }
        ],
        category: "simulation",
        recommendedAction: "deck",
        boardable: true,
        raw: result as unknown as JsonRecord
      };
    }

    if (decision.intent === "action_request") {
      const action = await workflowService.executeAction(context, {
        type: "jira_ticket",
        workflowId: "workflow_credit_drop",
        riskLevel: "high",
        approvalId,
        rollbackPlan: { type: "manual_cancel", owner: "Risk Operations" },
        payload: {
          title: message.slice(0, 120),
          source: "agent",
          requestedAction: message
        }
      });
      return {
        mode: action.status === "pending_approval" ? "approval" : "text",
        answer: action.status === "pending_approval"
          ? "Riskli aksiyon için onay talebi açıldı; onay gelmeden dış sisteme gönderim yapılmayacak."
          : "Aksiyon onaylı şekilde tamamlandı.",
        toolCalls: [{ toolKey: "jira.create_ticket", status: action.status, actionId: action.actionId }],
        approvalRequestId: String(action.approvalRequestId ?? ""),
        category: "ops",
        recommendedAction: "jira",
        boardable: true,
        raw: action
      };
    }

    return { mode: "text", answer: "", toolCalls: [], boardable: false };
  }

  private async *streamFinalAnswer(context: RequestContext, agent: Agent, message: string, decision: AgentDecision, toolResult: AgentToolResult, model: string): AsyncIterable<string> {
    if (toolResult.mode === "clarification") {
      for await (const token of tokenize(toolResult.answer)) {
        yield token;
      }
      return;
    }

    if (toolResult.sql?.includes("v_dataset_summary") && toolResult.answer) {
      for await (const token of tokenize(toolResult.answer)) {
        yield token;
      }
      return;
    }

    if (!hasModelCredential(context) && toolResult.answer) {
      for await (const token of tokenize(toolResult.answer)) {
        yield token;
      }
      return;
    }

    let response = "";
    let promptTraceId = "";
    for await (const chunk of llmGatewayService.streamPrompt(context, {
      promptKey: "agent_chat",
      model,
      variables: {
        user_message: message,
        agent: agent.name,
        agent_instructions: agent.instructions,
        intent: decision.intent,
        tool_key: decision.toolKey ?? "none",
        tool_summary: toolResult.answer,
        tool_result: JSON.stringify(trimToolResultForPrompt(toolResult))
      },
      piiMasked: true
    })) {
      if (chunk.event === "token") {
        const token = String(chunk.data.token ?? "");
        response += token;
        yield token;
      }
      if (chunk.event === "done") {
        promptTraceId = String(chunk.data.traceId ?? "");
      }
    }
    toolResult.traceId = toolResult.traceId ?? promptTraceId;
  }

  private createApprovalRequest(context: RequestContext, input: { actionType: string; subjectId: string; reason: string }): ApprovalRequest {
    const approval: ApprovalRequest = {
      id: createId("approval"),
      tenantId: context.tenantId,
      requestedBy: context.userId,
      actionType: input.actionType,
      subjectId: input.subjectId,
      reason: input.reason,
      status: "PENDING",
      createdAt: nowIso()
    };
    this.repository.snapshot().approvalRequests.unshift(approval);
    this.repository.appendAudit({
      tenantId: context.tenantId,
      actorUserId: context.userId,
      eventType: "APPROVAL_DECISION",
      action: "approval.requested",
      resourceType: "approval",
      resourceId: approval.id,
      correlationId: context.correlationId,
      metadata: { actionType: input.actionType, subjectId: input.subjectId }
    });
    return approval;
  }

  private appendTrace(context: RequestContext, input: Omit<AgentExecutionTrace, "id" | "tenantId" | "userId" | "createdAt">): AgentExecutionTrace {
    const trace: AgentExecutionTrace = {
      ...input,
      id: createId("agent_trace"),
      tenantId: context.tenantId,
      userId: context.userId,
      createdAt: nowIso()
    };
    this.repository.snapshot().agentExecutionTraces.unshift(trace);
    return trace;
  }
}

export function classifyAgentIntent(message: string): AgentIntent {
  const normalized = message.toLocaleLowerCase("tr-TR").trim();
  if (!normalized) return "clarification_needed";
  if (/^(merhaba|selam|hi|hello|teşekkür|tesekkur)\b/.test(normalized)) return "direct_answer";
  if (isActionRequest(normalized)) return "action_request";
  if (/(simülasyon|simulasyon|what[- ]?if|ne olur|senaryo|faiz.*(etki|değiş|degis)|oran.*(artarsa|düşerse|duserse))/.test(normalized)) return "simulation";
  if (/(rakip|competitor|pazar|market|faiz oran|interest rate|karşılaştır|karsilastir)/.test(normalized)) return "market_compare";
  if (/(doküman|dokuman|belge|politika|policy|prosedür|prosedur|sözlük|sozluk|tanım|definition|approval policy|onay politikası)/.test(normalized)) return "knowledge_rag";
  if (/(npl|risk|onay|approval|kart|card|hacim|volume|segment|müşteri|musteri|customer|ürün|urun|product|metrik|trend|düştü|dustu|arttı|artti|neden|hangi|kaç|kac|liste|top|son \d+|retention|tutunma|kohort|cohort|şikayet|sikayet|complaint|fraud|dolandır|dolandir|tahsilat|collections|şube|sube|branch|kampanya|campaign|dönüşüm|donusum|mevduat|deposit|bakiye|balance)/.test(normalized)) return "data_query";
  if (normalized.length < 12) return "clarification_needed";
  return "direct_answer";
}

function isActionRequest(normalized: string): boolean {
  const actionObject = "(jira|ticket|epic|email|e-mail|mail|slack|teams|görev|gorev|bildirim|aksiyon|sunum|deck)";
  const actionVerb = "(oluştur|olustur|aç|ac|gönder|gonder|yarat|assign|ata|ilet)";
  return new RegExp(`(^|\\s)${actionObject}(\\s|$).*?(^|\\s)${actionVerb}(\\s|$)`).test(normalized) ||
    new RegExp(`(^|\\s)${actionVerb}(\\s|$).*?(^|\\s)${actionObject}(\\s|$)`).test(normalized) ||
    /(^|\s)(aksiyon al|iş emri aç|is emri ac|onaya gönder|onaya gonder)(\s|$)/.test(normalized);
}

function decideAgentPath(message: string, explicitToolKey?: string): AgentDecision {
  if (explicitToolKey) {
    return decisionForTool(explicitToolKey);
  }
  const intent = classifyAgentIntent(message);
  const decisions: Record<AgentIntent, AgentDecision> = {
    direct_answer: { intent, riskLevel: "low", mode: "text", reason: "General banking or platform question." },
    data_query: { intent, toolKey: "query.run", riskLevel: "medium", mode: "data_card", reason: "Metric or database-backed question." },
    knowledge_rag: { intent, toolKey: "rag.retrieve", riskLevel: "low", mode: "text", reason: "Internal knowledge or policy evidence question." },
    market_compare: { intent, toolKey: "market.compare", riskLevel: "medium", mode: "market", reason: "Governed market intelligence comparison." },
    simulation: { intent, toolKey: "simulation.run", riskLevel: "medium", mode: "simulation", reason: "Sandboxed what-if question." },
    action_request: { intent, toolKey: "jira.create_ticket", riskLevel: "high", mode: "approval", reason: "External or workflow action request." },
    clarification_needed: { intent, riskLevel: "low", mode: "clarification", reason: "Insufficient execution context." }
  };
  return decisions[intent];
}

function decisionForTool(toolKey: string): AgentDecision {
  if (toolKey === "query.run") return { intent: "data_query", toolKey, riskLevel: "medium", mode: "data_card", reason: "Explicit query tool requested." };
  if (toolKey === "rag.retrieve") return { intent: "knowledge_rag", toolKey, riskLevel: "low", mode: "text", reason: "Explicit RAG tool requested." };
  if (toolKey === "market.compare") return { intent: "market_compare", toolKey, riskLevel: "medium", mode: "market", reason: "Explicit market tool requested." };
  if (toolKey === "simulation.run") return { intent: "simulation", toolKey, riskLevel: "medium", mode: "simulation", reason: "Explicit simulation tool requested." };
  if (toolKey === "jira.create_ticket") return { intent: "action_request", toolKey, riskLevel: "high", mode: "approval", reason: "Explicit action tool requested." };
  return { intent: "direct_answer", toolKey, riskLevel: "low", mode: "text", reason: "Explicit custom tool requested." };
}

function inferColumns(rows: JsonRecord[]): Array<{ key: string; label: string; type: string; align?: "right" }> {
  const sample = rows[0] ?? {};
  return Object.keys(sample).map((key) => {
    const value = sample[key];
    const lower = key.toLocaleLowerCase("tr-TR");
    const isNumber = typeof value === "number";
    const type = /oran|rate|pct|yüzde|npl|retention/.test(lower)
      ? "percent"
      : /hacim|bakiye|gelir|tutar|revenue|kayip|kayıp/.test(lower)
        ? "currency"
        : /adet|count|musteri|müşteri|islem|işlem/.test(lower)
          ? "count"
          : isNumber ? "count" : "text";
    return { key, label: prettifyColumn(key), type, align: isNumber ? "right" as const : undefined };
  });
}

function prettifyColumn(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\bi\b/g, "işlem")
    .replace(/\burun\b/g, "ürün");
}

function buildStats(rows: JsonRecord[], columns: Array<{ key?: string; label: string; type: string }>): Array<{ label: string; type: string; value: unknown }> {
  const numericColumns = columns.filter((column) => typeof rows[0]?.[column.key ?? column.label] === "number");
  return numericColumns.slice(0, 3).map((column) => ({
    label: column.label,
    type: column.type,
    value: rows.reduce((total, row) => total + Number(row[column.key ?? column.label] ?? 0), 0)
  }));
}

function buildDataToolResult(message: string, query: SqlGenerationResult): AgentToolResult {
  const rawRows = Array.isArray(query.result?.rows) ? query.result.rows as JsonRecord[] : [];
  const columns = inferColumns(rawRows);
  const rows = rawRows.map((row) => columns.map((column) => row[column.key ?? column.label]));
  return {
    mode: "data_card",
    answer: buildDataAnswer(rawRows, query.confidenceScore, query as unknown as JsonRecord),
    toolCalls: [{ toolKey: "query.run", status: "completed", traceId: query.traceId, source: query.result?.source }],
    sql: query.sql,
    rows,
    columns,
    stats: buildStats(rawRows, columns),
    traceId: query.traceId,
    category: /npl|risk|onay|approval|düştü|dustu|fraud|şikayet|sikayet|tahsilat/i.test(message) ? "ops" : "reporting",
    recommendedAction: /npl|risk|onay|approval|düştü|dustu|fraud|şikayet|sikayet|tahsilat/i.test(message) ? "jira" : "deck",
    boardable: true,
    raw: query as unknown as JsonRecord
  };
}

function buildDataAnswer(rows: JsonRecord[], confidenceScore: number, query: JsonRecord): string {
  const lead = rows[0];
  if (!lead) return "Güvenli read-only sorgu çalıştı ancak sonuç dönmedi.";
  if (lead.metric_name === "customers" && typeof lead.row_count === "number") {
    return `FBDWHPRD sentetik veri setinde ${lead.row_count.toLocaleString("tr-TR")} müşteri kaydı var.`;
  }
  const leadText = Object.values(lead).slice(0, 2).join(" / ");
  const result = typeof query.result === "object" && query.result ? query.result as JsonRecord : {};
  const source = String(result.source ?? result.mode ?? "connector");
  const summary = typeof query.summary === "string" ? query.summary : `${rows.length} satır döndü.`;
  return `Read-only sorguyu çalıştırdım (${source}). ${summary} Öne çıkan kayıt ${leadText}. Güven skoru ${(confidenceScore * 100).toFixed(0)}%.`;
}

function summarizeToolResult(result: AgentToolResult): JsonRecord {
  return {
    mode: result.mode,
    rows: result.rows?.length ?? 0,
    citations: result.citations?.length ?? 0,
    approvalRequestId: result.approvalRequestId,
    traceId: result.traceId
  };
}

function trimToolResultForPrompt(result: AgentToolResult): JsonRecord {
  return {
    mode: result.mode,
    answer: result.answer,
    sql: result.sql,
    rows: result.rows?.slice(0, 5),
    columns: result.columns,
    stats: result.stats,
    citations: result.citations?.slice(0, 3),
    approvalRequestId: result.approvalRequestId
  };
}

function hasModelCredential(context: RequestContext): boolean {
  return process.env.LLM_PROVIDER === "data-grounded-local" || Boolean(process.env.OPENAI_API_KEY || context.openAiApiKey);
}

function extractRate(message: string): number | undefined {
  const match = message.match(/(\d+(?:[.,]\d+)?)/);
  return match?.[1] ? Number(match[1].replace(",", ".")) : undefined;
}

async function* tokenize(text: string): AsyncIterable<string> {
  for (const token of text.split(/(\s+)/).filter(Boolean)) {
    yield token;
    await new Promise((resolve) => setTimeout(resolve, 12));
  }
}

export const agentService = new AgentService(store);
