import type { FastifyInstance, FastifyRequest } from "fastify";
import { permissions } from "@phi-ba/contracts";
import { createId } from "@phi-ba/shared";
import { agentService } from "./agents.js";
import { chatKitService } from "./chatkit.js";
import { connectorService, getPostgresCredentialStatus } from "./connectors.js";
import { created, ok } from "./http.js";
import { identityService } from "./identity.js";
import { getOpenAiCredentialStatus, llmGatewayService, providerRequiresOpenAiKey } from "./llm.js";
import { marketIntelligenceService } from "./market-intelligence.js";
import { ragService } from "./rag.js";
import { requirePermission } from "./request-context.js";
import { safetyGateService } from "./safety-gates.js";
import { secretService } from "./secrets.js";
import { sentryService } from "./sentry.js";
import { simulationService } from "./simulation.js";
import { store } from "./store.js";
import { textToSqlService } from "./text-to-sql.js";
import { workflowService } from "./workflows.js";
import type { BusinessGlossaryTerm, MetricDefinition } from "./platform-types.js";

type AnyRequest = FastifyRequest;

function body<T = any>(request: FastifyRequest): T {
  return (request.body ?? {}) as T;
}

function params<T = any>(request: FastifyRequest): T {
  return (request.params ?? {}) as T;
}

function query<T = any>(request: FastifyRequest): T {
  return (request.query ?? {}) as T;
}

function writeSse(reply: any, event: string, data: unknown): void {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_request, reply) => ok(reply, { status: "ok", service: "phi-ba-api" }));
  app.get("/live", async (_request, reply) => ok(reply, { status: "live" }));
  app.get("/ready", async (_request, reply) => ok(reply, { status: "ready", dependencies: { database: "configured", redis: "configured" } }));
  app.get("/metrics", async (_request, reply) => reply.type("text/plain").send("# phi_ba_metrics_placeholder 1\n"));
  app.get("/api/v1/runtime/status", async (request, reply) => {
    const config = store.getTenantConfig(request.platformContext.tenantId);
    const provider = String(process.env.LLM_PROVIDER ?? config.modelPolicy.provider ?? "openai");
    return ok(reply, {
      runtime: "fastify-api",
      deploymentEnvironment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "local",
      provider,
      model: process.env.LLM_MODEL ?? "gpt-5.4-mini",
      textToSqlModel: process.env.TEXT_TO_SQL_MODEL ?? process.env.LLM_MODEL ?? "gpt-5.4-mini",
      openAiBaseUrl: process.env.OPENAI_BASE_URL ? "configured" : "default",
      providerRequiresOpenAiKey: providerRequiresOpenAiKey(provider),
      ...getOpenAiCredentialStatus(request.platformContext.openAiApiKey),
      ...getPostgresCredentialStatus(store.getConnector(request.platformContext.tenantId, "connector_pg_reporting"))
    });
  });

  app.get("/api/v1/tenants", async (request, reply) => {
    requirePermission(request.platformContext, permissions.tenantsRead);
    return ok(reply, store.listTenants());
  });

  app.post("/api/v1/tenants", async (request: AnyRequest, reply) => {
    requirePermission(request.platformContext, permissions.tenantsWrite);
    const tenant = store.createTenant(body(request));
    store.appendAudit({
      tenantId: request.platformContext.tenantId,
      actorUserId: request.platformContext.userId,
      eventType: "ADMIN_CONFIG",
      action: "tenant.create",
      resourceType: "tenant",
      resourceId: tenant.id,
      correlationId: request.platformContext.correlationId,
      metadata: { ...tenant }
    });
    return created(reply, tenant);
  });

  app.get("/api/v1/white-label-config", async (request, reply) => {
    requirePermission(request.platformContext, permissions.configRead);
    return ok(reply, store.getTenantConfig(request.platformContext.tenantId));
  });

  app.patch("/api/v1/white-label-config", async (request: AnyRequest, reply) => {
    requirePermission(request.platformContext, permissions.configWrite);
    const config = store.updateTenantConfig(request.platformContext.tenantId, body(request));
    store.appendAudit({
      tenantId: request.platformContext.tenantId,
      actorUserId: request.platformContext.userId,
      eventType: "ADMIN_CONFIG",
      action: "tenant_config.update",
      resourceType: "tenant_config",
      resourceId: config.id,
      correlationId: request.platformContext.correlationId,
      metadata: { patch: body(request) }
    });
    return ok(reply, config);
  });

  app.get("/api/v1/auth/me", async (request, reply) => ok(reply, identityService.me(request.platformContext)));
  app.get("/api/v1/users", async (request, reply) => ok(reply, identityService.listUsers(request.platformContext)));
  app.post("/api/v1/users", async (request: AnyRequest, reply) => created(reply, identityService.createUser(request.platformContext, body(request))));
  app.get("/api/v1/roles", async (request, reply) => ok(reply, identityService.listRoles(request.platformContext)));
  app.get("/api/v1/permissions", async (request, reply) => {
    requirePermission(request.platformContext, permissions.rolesRead);
    return ok(reply, Object.values(permissions));
  });

  app.get("/api/v1/secrets", async (request, reply) => {
    requirePermission(request.platformContext, permissions.secretsRead);
    return ok(reply, secretService.list(request.platformContext));
  });
  app.post("/api/v1/secrets", async (request: AnyRequest, reply) => created(reply, secretService.create(request.platformContext, body(request))));

  app.get("/api/v1/connectors", async (request, reply) => {
    requirePermission(request.platformContext, permissions.connectorsRead);
    return ok(reply, connectorService.list(request.platformContext), { adapters: connectorService.registry.list() });
  });
  app.post("/api/v1/connectors", async (request: AnyRequest, reply) => created(reply, connectorService.create(request.platformContext, body(request))));
  app.get("/api/v1/connectors/:id/health", async (request: AnyRequest, reply) => ok(reply, connectorService.health(request.platformContext, params(request).id)));
  app.post("/api/v1/connectors/:id/test", async (request: AnyRequest, reply) => ok(reply, connectorService.test(request.platformContext, params(request).id)));
  app.post("/api/v1/connectors/:id/execute", async (request: AnyRequest, reply) => ok(reply, await connectorService.execute(request.platformContext, params(request).id, body(request))));

  app.get("/api/v1/glossary", async (request, reply) => {
    requirePermission(request.platformContext, permissions.glossaryRead);
    return ok(reply, store.snapshot().glossaryTerms.filter((term) => term.tenantId === request.platformContext.tenantId));
  });
  app.post("/api/v1/glossary", async (request: AnyRequest, reply) => {
    requirePermission(request.platformContext, permissions.glossaryWrite);
    const input = body(request);
    const term: BusinessGlossaryTerm = {
      ...input,
      id: createId("glossary"),
      tenantId: request.platformContext.tenantId,
      locale: input.locale ?? "tr-TR",
      synonyms: input.synonyms ?? []
    };
    store.snapshot().glossaryTerms.unshift(term);
    store.appendAudit({
      tenantId: request.platformContext.tenantId,
      actorUserId: request.platformContext.userId,
      eventType: "ADMIN_CONFIG",
      action: "glossary.create",
      resourceType: "glossary_term",
      resourceId: term.id,
      correlationId: request.platformContext.correlationId,
      metadata: { ...term }
    });
    return created(reply, term);
  });

  app.get("/api/v1/metrics", async (request, reply) => {
    requirePermission(request.platformContext, permissions.metricsRead);
    return ok(reply, store.snapshot().metricDefinitions.filter((metric) => metric.tenantId === request.platformContext.tenantId));
  });
  app.post("/api/v1/metrics", async (request: AnyRequest, reply) => {
    requirePermission(request.platformContext, permissions.metricsWrite);
    const input = body(request);
    const metric: MetricDefinition = {
      ...input,
      id: createId("metric"),
      tenantId: request.platformContext.tenantId,
      sqlMappingHints: input.sqlMappingHints ?? [],
      tableMapping: input.tableMapping ?? [],
      columnMapping: input.columnMapping ?? {},
      synonyms: input.synonyms ?? []
    };
    store.snapshot().metricDefinitions.unshift(metric);
    store.appendAudit({
      tenantId: request.platformContext.tenantId,
      actorUserId: request.platformContext.userId,
      eventType: "ADMIN_CONFIG",
      action: "metric.create",
      resourceType: "metric_definition",
      resourceId: metric.id,
      correlationId: request.platformContext.correlationId,
      metadata: { ...metric }
    });
    return created(reply, metric);
  });

  app.post("/api/v1/natural-language-query", async (request: AnyRequest, reply) => ok(reply, await textToSqlService.ask(request.platformContext, body(request))));
  app.post("/api/v1/text-to-sql", async (request: AnyRequest, reply) => ok(reply, await textToSqlService.ask(request.platformContext, { ...body(request), execute: false })));
  app.post("/api/v1/sql/explain", async (request: AnyRequest, reply) => ok(reply, textToSqlService.explain(request.platformContext, body(request).sql, body(request).connectorId)));
  app.get("/api/v1/query-traces", async (request, reply) => {
    requirePermission(request.platformContext, permissions.observabilityRead);
    return ok(reply, textToSqlService.listTraces(request.platformContext));
  });

  app.post("/api/v1/rag/ingest", async (request: AnyRequest, reply) => created(reply, ragService.ingest(request.platformContext, body(request))));
  app.post("/api/v1/rag/retrieve", async (request: AnyRequest, reply) => ok(reply, ragService.retrieve(request.platformContext, body(request))));

  app.get("/api/v1/llm/prompts", async (request, reply) => {
    requirePermission(request.platformContext, permissions.promptsRead);
    return ok(reply, llmGatewayService.listPrompts(request.platformContext));
  });
  app.post("/api/v1/llm/prompts/execute", async (request: AnyRequest, reply) => ok(reply, await llmGatewayService.executePrompt(request.platformContext, body(request))));
  app.get("/api/v1/llm/prompt-traces", async (request, reply) => {
    requirePermission(request.platformContext, permissions.observabilityRead);
    return ok(reply, llmGatewayService.listTraces(request.platformContext));
  });

  app.get("/api/v1/agent-templates", async (request, reply) => {
    requirePermission(request.platformContext, permissions.agentsRead);
    return ok(reply, agentService.listTemplates(request.platformContext));
  });
  app.get("/api/v1/agents", async (request, reply) => {
    requirePermission(request.platformContext, permissions.agentsRead);
    return ok(reply, agentService.listAgents(request.platformContext));
  });
  app.get("/api/v1/tools", async (request, reply) => {
    requirePermission(request.platformContext, permissions.agentsRead);
    return ok(reply, agentService.tools.list());
  });
  app.get("/api/v1/openai/chatkit/workflow", async (request, reply) => {
    requirePermission(request.platformContext, permissions.agentsRead);
    return ok(reply, { workflowId: chatKitService.getWorkflowId() });
  });
  app.post("/api/v1/openai/chatkit/session", async (request, reply) => {
    return ok(reply, await chatKitService.createSession(request.platformContext));
  });
  app.post("/api/v1/agents/:id/execute", async (request: AnyRequest, reply) => {
    return ok(reply, await agentService.execute(request.platformContext, { ...body(request), agentId: params(request).id }));
  });
  app.post("/api/v1/agents/:id/stream", async (request: AnyRequest, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-correlation-id": request.platformContext.correlationId
    });
    try {
      for await (const chunk of agentService.streamExecute(request.platformContext, { ...body(request), agentId: params(request).id })) {
        writeSse(reply, chunk.event, chunk.data);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Streaming failed";
      writeSse(reply, "error", { message, correlationId: request.platformContext.correlationId });
    } finally {
      reply.raw.end();
    }
  });
  app.get("/api/v1/agent-traces", async (request, reply) => {
    requirePermission(request.platformContext, permissions.observabilityRead);
    return ok(reply, agentService.listTraces(request.platformContext));
  });

  app.get("/api/v1/workflows", async (request, reply) => {
    requirePermission(request.platformContext, permissions.workflowsRead);
    return ok(reply, workflowService.listWorkflows(request.platformContext));
  });
  app.post("/api/v1/actions", async (request: AnyRequest, reply) => ok(reply, await workflowService.executeAction(request.platformContext, body(request))));
  app.get("/api/v1/approvals", async (request, reply) => {
    requirePermission(request.platformContext, permissions.workflowsRead);
    return ok(reply, workflowService.listApprovals(request.platformContext));
  });
  app.post("/api/v1/approvals/:id/decision", async (request: AnyRequest, reply) => ok(reply, workflowService.decideApproval(request.platformContext, params(request).id, body(request))));

  app.get("/api/v1/sentry/rules", async (request, reply) => {
    requirePermission(request.platformContext, permissions.alertsRead);
    return ok(reply, sentryService.listRules(request.platformContext));
  });
  app.post("/api/v1/sentry/run", async (request: AnyRequest, reply) => ok(reply, sentryService.runMetricCheck(request.platformContext, body(request))));
  app.get("/api/v1/alerts", async (request, reply) => {
    requirePermission(request.platformContext, permissions.alertsRead);
    return ok(reply, sentryService.listAlerts(request.platformContext));
  });
  app.post("/api/v1/alerts/:id/acknowledge", async (request: AnyRequest, reply) => ok(reply, sentryService.acknowledge(request.platformContext, params(request).id)));

  app.get("/api/v1/market-intelligence/sources", async (request, reply) => {
    requirePermission(request.platformContext, permissions.marketRead);
    return ok(reply, marketIntelligenceService.listSources(request.platformContext));
  });
  app.post("/api/v1/market-intelligence/sources", async (request: AnyRequest, reply) => {
    requirePermission(request.platformContext, permissions.marketWrite);
    return created(reply, marketIntelligenceService.createSource(request.platformContext, body(request)));
  });
  app.post("/api/v1/market-intelligence/sources/:id/ingest", async (request: AnyRequest, reply) => ok(reply, marketIntelligenceService.ingest(request.platformContext, params(request).id)));
  app.get("/api/v1/market-intelligence/comparison", async (request, reply) => {
    requirePermission(request.platformContext, permissions.marketRead);
    return ok(reply, marketIntelligenceService.compare(request.platformContext));
  });

  app.get("/api/v1/simulation/scenarios", async (request, reply) => {
    requirePermission(request.platformContext, permissions.simulationsRead);
    return ok(reply, simulationService.listScenarios(request.platformContext));
  });
  app.get("/api/v1/simulation/segments", async (request, reply) => {
    requirePermission(request.platformContext, permissions.simulationsRead);
    return ok(reply, simulationService.listSegments(request.platformContext));
  });
  app.get("/api/v1/simulation/synthetic-user-segments", async (request, reply) => {
    requirePermission(request.platformContext, permissions.simulationsRead);
    return ok(reply, simulationService.listSyntheticSegments(request.platformContext));
  });
  app.post("/api/v1/simulation/what-if", async (request: AnyRequest, reply) => ok(reply, simulationService.runWhatIf(request.platformContext, body(request))));

  app.get("/api/v1/safety-gates/checks", async (request, reply) => {
    requirePermission(request.platformContext, permissions.safetyRead);
    return ok(reply, safetyGateService.listChecks());
  });
  app.post("/api/v1/safety-gates/run", async (request: AnyRequest, reply) => {
    requirePermission(request.platformContext, permissions.safetyRun);
    return ok(reply, safetyGateService.runManual(request.platformContext, { ...body(request), tenantId: request.platformContext.tenantId }));
  });
  app.get("/api/v1/safety-gates/runs", async (request, reply) => {
    requirePermission(request.platformContext, permissions.safetyRead);
    return ok(reply, store.snapshot().safetyGateRuns.filter((run) => run.tenantId === request.platformContext.tenantId));
  });
  app.get("/api/v1/safety-gates/runs/:id", async (request: AnyRequest, reply) => {
    requirePermission(request.platformContext, permissions.safetyRead);
    return ok(reply, store.snapshot().safetyGateRuns.find((run) => run.tenantId === request.platformContext.tenantId && run.id === params(request).id));
  });

  app.get("/api/v1/audit-logs", async (request: AnyRequest, reply) => {
    requirePermission(request.platformContext, permissions.auditRead);
    return ok(reply, store.listAudit(request.platformContext.tenantId, query(request).eventType));
  });
  app.get("/api/v1/compliance/evidence", async (request, reply) => {
    requirePermission(request.platformContext, permissions.auditRead);
    return ok(reply, store.snapshot().complianceEvidence.filter((item) => item.tenantId === request.platformContext.tenantId));
  });

  app.get("/api/v1/observability/jobs", async (request, reply) => {
    requirePermission(request.platformContext, permissions.observabilityRead);
    return ok(reply, store.snapshot().jobStatuses.filter((job) => job.tenantId === request.platformContext.tenantId));
  });
  app.get("/api/v1/observability/health", async (request, reply) => {
    requirePermission(request.platformContext, permissions.observabilityRead);
    return ok(reply, { status: "ok", tenantId: request.platformContext.tenantId, correlationId: request.platformContext.correlationId });
  });
}
