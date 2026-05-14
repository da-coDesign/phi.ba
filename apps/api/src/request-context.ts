import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PermissionKey, RequestContext } from "@phi-ba/contracts";
import { createId } from "@phi-ba/shared";
import { store } from "./store.js";
import { forbidden, unauthorized } from "./errors.js";

declare module "fastify" {
  interface FastifyRequest {
    platformContext: RequestContext;
  }
}

const tokenUserMap: Record<string, string> = {
  "dev-admin-token": "user_admin",
  "dev-analyst-token": "user_analyst",
  "dev-approver-token": "user_approver"
};

export function resolveLocalUserId(token: string | undefined): string | undefined {
  if (!token) return undefined;
  const envAdminToken = process.env.LOCAL_DEV_AUTH_TOKEN ?? "dev-admin-token";
  if (token === envAdminToken) return "user_admin";
  return tokenUserMap[token];
}

export function requirePermission(context: RequestContext, permission: PermissionKey): void {
  if (!context.permissions.includes(permission)) {
    throw forbidden(`Missing permission ${permission}`);
  }
}

export function requireAnyPermission(context: RequestContext, required: PermissionKey[]): void {
  if (!required.some((permission) => context.permissions.includes(permission))) {
    throw forbidden(`Missing one of permissions: ${required.join(", ")}`);
  }
}

export function hasPermission(context: RequestContext, permission: PermissionKey): boolean {
  return context.permissions.includes(permission);
}

export async function registerRequestContext(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationHeader = request.headers["x-correlation-id"];
    const tenantHeader = request.headers["x-tenant-id"];
    const auth = request.headers.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
    const tenantId = Array.isArray(tenantHeader) ? tenantHeader[0] : tenantHeader;
    const correlationId = (Array.isArray(correlationHeader) ? correlationHeader[0] : correlationHeader) ?? createId("corr");

    reply.header("x-correlation-id", correlationId);

    if (request.url.startsWith("/health") || request.url.startsWith("/live") || request.url.startsWith("/ready") || request.url.startsWith("/metrics")) {
      request.platformContext = {
        tenantId: tenantId ?? process.env.DEFAULT_TENANT_ID ?? "tenant_fibabanka",
        userId: "system",
        email: "system@local",
        roles: ["System"],
        permissions: [],
        correlationId
      };
      return;
    }

    if (!tenantId) throw unauthorized("Missing x-tenant-id header");
    const userId = resolveLocalUserId(token);
    if (!userId) throw unauthorized("Invalid or missing local dev bearer token");

    const tenant = store.getTenant(tenantId);
    const user = store.getUser(userId, tenant.id);
    const roles = store.rolesForUser(user.id, tenant.id);
    request.platformContext = {
      tenantId: tenant.id,
      userId: user.id,
      email: user.email,
      roles: roles.map((role) => role.name),
      permissions: store.permissionsForUser(user.id, tenant.id),
      correlationId
    };
  });
}
