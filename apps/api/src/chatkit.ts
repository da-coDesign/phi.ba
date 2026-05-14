import { permissions, type RequestContext } from "@phi-ba/contracts";
import { blocked } from "./errors.js";
import { requirePermission } from "./request-context.js";
import { store, type PlatformStore } from "./store.js";

const DEFAULT_WORKFLOW_ID = "wf_6a05a5d289c481909f30fc151a30d52d068e34df71dd22c3";

export class ChatKitService {
  constructor(private readonly repository: PlatformStore) {}

  getWorkflowId(): string {
    return process.env.OPENAI_WORKFLOW_ID ?? DEFAULT_WORKFLOW_ID;
  }

  async createSession(context: RequestContext): Promise<{ client_secret: string; workflowId: string }> {
    requirePermission(context, permissions.agentsExecute);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw blocked("OPENAI_API_KEY is required to create an OpenAI ChatKit session.");

    const workflowId = this.getWorkflowId();
    const response = await fetch("https://api.openai.com/v1/chatkit/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "openai-beta": "chatkit_beta=v1"
      },
      body: JSON.stringify({
        workflow: { id: workflowId },
        user: context.userId,
        metadata: {
          tenantId: context.tenantId,
          email: context.email,
          correlationId: context.correlationId
        }
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof payload?.error?.message === "string"
        ? payload.error.message
        : `OpenAI ChatKit session failed with status ${response.status}`;
      throw blocked(message);
    }
    if (typeof payload.client_secret !== "string") {
      throw blocked("OpenAI ChatKit session did not return a client secret.");
    }

    this.repository.appendAudit({
      tenantId: context.tenantId,
      actorUserId: context.userId,
      eventType: "AGENT_RUN",
      action: "openai.chatkit.session.create",
      resourceType: "openai_workflow",
      resourceId: workflowId,
      correlationId: context.correlationId,
      metadata: { workflowId }
    });

    return { client_secret: payload.client_secret, workflowId };
  }
}

export const chatKitService = new ChatKitService(store);
