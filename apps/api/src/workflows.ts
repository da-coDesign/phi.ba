import { permissions, type RequestContext } from "@phi-ba/contracts";
import { createId, nowIso } from "@phi-ba/shared";
import { blocked, notFound } from "./errors.js";
import { requirePermission } from "./request-context.js";
import { safetyGateService } from "./safety-gates.js";
import { store, type PlatformStore } from "./store.js";
import type { ActionRecord, ApprovalRequest, JsonRecord, Workflow } from "./platform-types.js";

export interface NotificationAdapter {
  channel: "teams" | "slack" | "jira" | "email";
  send(payload: JsonRecord): Promise<JsonRecord>;
}

class PlaceholderNotificationAdapter implements NotificationAdapter {
  constructor(public readonly channel: NotificationAdapter["channel"]) {}

  async send(payload: JsonRecord): Promise<JsonRecord> {
    return { channel: this.channel, localPlaceholder: true, payload };
  }
}

export class WorkflowService {
  private notificationAdapters: NotificationAdapter[] = [
    new PlaceholderNotificationAdapter("teams"),
    new PlaceholderNotificationAdapter("slack"),
    new PlaceholderNotificationAdapter("jira"),
    new PlaceholderNotificationAdapter("email")
  ];

  constructor(private readonly repository: PlatformStore) {}

  listWorkflows(context: RequestContext): Workflow[] {
    return this.repository.snapshot().workflows.filter((workflow) => workflow.tenantId === context.tenantId);
  }

  listApprovals(context: RequestContext): ApprovalRequest[] {
    return this.repository.snapshot().approvalRequests.filter((request) => request.tenantId === context.tenantId);
  }

  async executeAction(context: RequestContext, input: {
    workflowId?: string;
    type: ActionRecord["type"];
    payload: JsonRecord;
    riskLevel?: ActionRecord["riskLevel"];
    approvalId?: string;
    rollbackPlan?: JsonRecord;
    notificationChannel?: string;
  }): Promise<JsonRecord> {
    const riskLevel = input.riskLevel ?? (["jira_ticket", "slack_notification", "teams_task"].includes(input.type) ? "high" : "medium");
    const actionId = createId("action");
    const operation = {
      tenantId: context.tenantId,
      operationType: "workflow" as const,
      operationId: actionId,
      requiredPermission: permissions.workflowsExecute,
      riskLevel,
      approvalId: input.approvalId,
      notificationChannel: input.notificationChannel ?? channelForAction(input.type),
      rollbackPlan: input.rollbackPlan,
      payload: input.payload
    };
    const safetyRuns = safetyGateService.runForOperation(context, operation);
    const blockers = safetyRuns.filter((run) => run.status === "BLOCKED");
    if (blockers.length > 0) {
      const approvalBlock = blockers.find((run) => run.checkKey === "human_approval_policy");
      if (approvalBlock && blockers.every((run) => run.checkKey === "human_approval_policy" || run.checkKey === "rollback_readiness")) {
        const approval = this.createApproval(context, {
          actionType: input.type,
          subjectId: actionId,
          reason: blockers.map((run) => run.message).join("; ")
        });
        const pendingAction = this.appendAction(context, {
          id: actionId,
          workflowId: input.workflowId,
          type: input.type,
          payload: input.payload,
          riskLevel,
          status: "pending_approval",
          rollbackPlan: input.rollbackPlan
        });
        return { status: "pending_approval", actionId: pendingAction.id, approvalRequestId: approval.id };
      }
      throw blocked(blockers.map((run) => `${run.checkKey}: ${run.message}`).join("; "));
    }

    const action = this.appendAction(context, {
      id: actionId,
      workflowId: input.workflowId,
      type: input.type,
      payload: input.payload,
      riskLevel,
      status: "completed",
      rollbackPlan: input.rollbackPlan
    });
    const adapter = this.notificationAdapters.find((item) => item.channel === channelForAction(input.type));
    const adapterOutput = adapter ? await adapter.send(input.payload) : undefined;
    this.repository.appendAudit({
      tenantId: context.tenantId,
      actorUserId: context.userId,
      eventType: "WORKFLOW_ACTION",
      action: "workflow.action.execute",
      resourceType: "action",
      resourceId: action.id,
      correlationId: context.correlationId,
      metadata: { type: input.type, adapterOutput }
    });
    return { status: "completed", actionId: action.id, adapterOutput };
  }

  decideApproval(context: RequestContext, approvalId: string, input: { decision: "APPROVED" | "REJECTED"; note?: string }): ApprovalRequest {
    requirePermission(context, permissions.approvalsDecide);
    const approval = this.repository.snapshot().approvalRequests.find((request) => request.tenantId === context.tenantId && request.id === approvalId);
    if (!approval) throw notFound(`Approval request ${approvalId} was not found`);
    approval.status = input.decision;
    approval.decidedBy = context.userId;
    approval.decisionNote = input.note;
    approval.decidedAt = nowIso();
    this.repository.appendAudit({
      tenantId: context.tenantId,
      actorUserId: context.userId,
      eventType: "APPROVAL_DECISION",
      action: input.decision === "APPROVED" ? "approval.approve" : "approval.reject",
      resourceType: "approval",
      resourceId: approval.id,
      correlationId: context.correlationId,
      metadata: { note: input.note }
    });
    return approval;
  }

  private createApproval(context: RequestContext, input: { actionType: string; subjectId: string; reason: string }): ApprovalRequest {
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
      metadata: { actionType: input.actionType }
    });
    return approval;
  }

  private appendAction(context: RequestContext, input: Omit<ActionRecord, "tenantId" | "createdAt">): ActionRecord {
    const action: ActionRecord = {
      ...input,
      tenantId: context.tenantId,
      createdAt: nowIso()
    };
    this.repository.snapshot().actions.unshift(action);
    return action;
  }
}

function channelForAction(type: ActionRecord["type"]): NotificationAdapter["channel"] {
  if (type === "jira_ticket") return "jira";
  if (type === "slack_notification") return "slack";
  if (type === "teams_task") return "teams";
  return "email";
}

export const workflowService = new WorkflowService(store);
