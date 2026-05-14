import { DEFAULT_TENANT_ID, type RequestContext } from "@phi-ba/contracts";
import { agentService } from "@phi-ba/api/agents";
import { store } from "@phi-ba/api/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const platformContext = resolveContext(request);
  const body = await request.json().catch(() => ({}));
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        for await (const chunk of agentService.streamExecute(platformContext, {
          ...body,
          agentId: params.id
        })) {
          write(chunk.event, chunk.data);
        }
      } catch (error) {
        write("error", {
          message: error instanceof Error ? error.message : "Agent stream failed",
          correlationId: platformContext.correlationId
        });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-correlation-id": platformContext.correlationId
    }
  });
}

function resolveContext(request: Request): RequestContext {
  const tenantId = request.headers.get("x-tenant-id") || process.env.DEFAULT_TENANT_ID || DEFAULT_TENANT_ID;
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  const userId = token === "dev-analyst-token"
    ? "user_analyst"
    : token === "dev-approver-token"
      ? "user_approver"
      : "user_admin";
  const tenant = store.getTenant(tenantId);
  const user = store.getUser(userId, tenant.id);
  const roles = store.rolesForUser(user.id, tenant.id);
  return {
    tenantId: tenant.id,
    userId: user.id,
    email: user.email,
    roles: roles.map((role) => role.name),
    permissions: store.permissionsForUser(user.id, tenant.id),
    correlationId: request.headers.get("x-correlation-id") || `corr_${Date.now().toString(36)}`,
    openAiApiKey: normalizeOpenAiApiKey(request.headers.get("x-openai-api-key") || undefined)
  };
}

function normalizeOpenAiApiKey(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return /^sk-[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : undefined;
}
