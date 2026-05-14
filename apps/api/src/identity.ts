import { permissions, type RequestContext } from "@phi-ba/contracts";
import { createId } from "@phi-ba/shared";
import { blocked } from "./errors.js";
import { requirePermission } from "./request-context.js";
import { safetyGateService } from "./safety-gates.js";
import { store, type PlatformStore } from "./store.js";
import type { JsonRecord, Role, User } from "./platform-types.js";

export interface EnterpriseSsoAdapter {
  kind: "oidc" | "saml";
  buildLoginUrl(tenantId: string): string;
  validateAssertion(payload: JsonRecord): Promise<{ email: string; displayName: string }>;
}

export interface ScimProvisioningAdapter {
  provisionUser(tenantId: string, payload: JsonRecord): Promise<User>;
  deactivateUser(tenantId: string, userId: string): Promise<void>;
}

export class PlaceholderSsoAdapter implements EnterpriseSsoAdapter {
  constructor(public readonly kind: "oidc" | "saml") {}

  buildLoginUrl(tenantId: string): string {
    return `/local-dev/sso/${this.kind}?tenantId=${tenantId}`;
  }

  async validateAssertion(): Promise<{ email: string; displayName: string }> {
    throw blocked(`${this.kind} adapter is a production placeholder.`);
  }
}

export class IdentityService {
  readonly oidcAdapter = new PlaceholderSsoAdapter("oidc");
  readonly samlAdapter = new PlaceholderSsoAdapter("saml");

  constructor(private readonly repository: PlatformStore) {}

  me(context: RequestContext): JsonRecord {
    return {
      user: this.repository.getUser(context.userId, context.tenantId),
      roles: context.roles,
      permissions: context.permissions,
      sso: {
        oidcLoginUrl: this.oidcAdapter.buildLoginUrl(context.tenantId),
        samlLoginUrl: this.samlAdapter.buildLoginUrl(context.tenantId)
      }
    };
  }

  listUsers(context: RequestContext): User[] {
    requirePermission(context, permissions.usersRead);
    return this.repository.listUsers(context.tenantId);
  }

  createUser(context: RequestContext, input: Omit<User, "id" | "tenantId" | "status" | "authType"> & { authType?: User["authType"] }): User {
    safetyGateService.assertAllowed(context, {
      tenantId: context.tenantId,
      operationType: "service",
      operationId: createId("user_create"),
      requiredPermission: permissions.usersWrite,
      payload: input
    });
    const user: User = {
      ...input,
      id: createId("user"),
      tenantId: context.tenantId,
      status: "active",
      authType: input.authType ?? "local"
    };
    this.repository.snapshot().users.push(user);
    this.repository.appendAudit({
      tenantId: context.tenantId,
      actorUserId: context.userId,
      eventType: "ADMIN_CONFIG",
      action: "user.create",
      resourceType: "user",
      resourceId: user.id,
      correlationId: context.correlationId,
      metadata: { email: user.email, authType: user.authType }
    });
    return user;
  }

  listRoles(context: RequestContext): Role[] {
    requirePermission(context, permissions.rolesRead);
    return this.repository.listRoles(context.tenantId);
  }
}

export const identityService = new IdentityService(store);
