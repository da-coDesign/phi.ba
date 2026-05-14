import { permissions, type RequestContext } from "@phi-ba/contracts";
import { createId, nowIso } from "@phi-ba/shared";
import { blocked } from "./errors.js";
import { llmGatewayService } from "./llm.js";
import { safetyGateService } from "./safety-gates.js";
import { store, type PlatformStore } from "./store.js";
import type { Agent, AgentExecutionTrace, AgentTemplate, ApprovalRequest, JsonRecord, ToolDefinition } from "./platform-types.js";

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

  async execute(context: RequestContext, input: { agentId: string; message: string; toolKey?: string; approvalId?: string }): Promise<JsonRecord> {
    const agent = this.repository.snapshot().agents.find((item) => item.tenantId === context.tenantId && item.id === input.agentId);
    if (!agent || !agent.enabled) throw blocked(`Agent ${input.agentId} is not available`);
    const toolKey = input.toolKey ?? "rag.retrieve";
    const tool = this.tools.get(toolKey);
    const operationId = createId("agent_run");
    const safetyRuns = safetyGateService.runForOperation(context, {
      tenantId: context.tenantId,
      operationType: "agent",
      operationId,
      requiredPermission: permissions.agentsExecute,
      model: "mock-enterprise-analyst",
      toolKey,
      riskLevel: tool.riskLevel,
      approvalId: input.approvalId,
      payload: { message: input.message }
    });
    const blockers = safetyRuns.filter((run) => run.status === "BLOCKED");
    if (blockers.length > 0) {
      const approvalBlock = blockers.find((run) => run.checkKey === "human_approval_policy");
      if (approvalBlock && blockers.length === 1) {
        const approval = this.createApprovalRequest(context, {
          actionType: `agent_tool.${toolKey}`,
          subjectId: operationId,
          reason: approvalBlock.message
        });
        const trace = this.appendTrace(context, {
          agentId: agent.id,
          input: { message: input.message, toolKey },
          output: { approvalRequestId: approval.id },
          toolCalls: [{ toolKey, status: "pending_approval" }],
          safetyStatus: "BLOCKED",
          status: "pending_approval"
        });
        return { status: "pending_approval", approvalRequestId: approval.id, traceId: trace.id };
      }
      throw blocked(blockers.map((run) => `${run.checkKey}: ${run.message}`).join("; "));
    }

    const modelOutput = await llmGatewayService.executePrompt(context, {
      promptKey: "text_to_sql",
      model: "mock-enterprise-analyst",
      variables: { user_message: input.message, agent: agent.name },
      piiMasked: true
    });
    const trace = this.appendTrace(context, {
      agentId: agent.id,
      input: { message: input.message, toolKey },
      output: { response: modelOutput.text, memory: "placeholder", evaluation: "placeholder" },
      toolCalls: [{ toolKey, status: "completed" }],
      safetyStatus: "PASS",
      status: "completed"
    });
    this.repository.appendAudit({
      tenantId: context.tenantId,
      actorUserId: context.userId,
      eventType: "AGENT_RUN",
      action: "agent.execute",
      resourceType: "agent",
      resourceId: agent.id,
      correlationId: context.correlationId,
      metadata: { toolKey, traceId: trace.id }
    });
    return { status: "completed", response: modelOutput.text, traceId: trace.id };
  }

  listTraces(context: RequestContext): AgentExecutionTrace[] {
    return this.repository.snapshot().agentExecutionTraces.filter((trace) => trace.tenantId === context.tenantId);
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

export const agentService = new AgentService(store);
