import { permissions, type AuditEventType, type PermissionKey } from "@phi-ba/contracts";
import { createId, nowIso, normalizeSlug, redact } from "@phi-ba/shared";
import { conflict, notFound } from "./errors.js";
import { createSeedState } from "./seed-data.js";
import type {
  AuditLog,
  Connector,
  PlatformState,
  Role,
  SafetyGateRun,
  Tenant,
  TenantConfig,
  User
} from "./platform-types.js";

export class PlatformStore {
  private state: PlatformState;

  constructor(initialState = createSeedState()) {
    this.state = initialState;
  }

  snapshot(): PlatformState {
    return this.state;
  }

  reset(nextState = createSeedState()): void {
    this.state = nextState;
  }

  getTenant(tenantId: string): Tenant {
    const tenant = this.state.tenants.find((item) => item.id === tenantId);
    if (!tenant) throw notFound(`Tenant ${tenantId} was not found`);
    return tenant;
  }

  listTenants(): Tenant[] {
    return this.state.tenants;
  }

  createTenant(input: {
    name: string;
    slug?: string;
    deploymentMode?: Tenant["deploymentMode"];
    config?: Partial<TenantConfig>;
  }): Tenant {
    const slug = input.slug ? normalizeSlug(input.slug) : normalizeSlug(input.name);
    if (this.state.tenants.some((tenant) => tenant.slug === slug)) {
      throw conflict(`Tenant slug ${slug} already exists`);
    }
    const now = nowIso();
    const tenant: Tenant = {
      id: createId("tenant"),
      name: input.name,
      slug,
      deploymentMode: input.deploymentMode ?? "ON_PREMISE",
      createdAt: now,
      updatedAt: now
    };
    this.state.tenants.push(tenant);
    this.state.tenantConfigs.push({
      id: createId("tenant_config"),
      tenantId: tenant.id,
      productName: input.config?.productName ?? "phi.ba",
      logoUrl: input.config?.logoUrl,
      themeColors: input.config?.themeColors ?? {
        primary: "#9FD8C0",
        secondary: "#E8E5DD",
        accent: "#2266AA",
        text: "#14171A"
      },
      customDomain: input.config?.customDomain,
      locale: input.config?.locale ?? "en-US",
      enabledFeatures: input.config?.enabledFeatures ?? ["text_to_sql", "rag", "agents"],
      industryDomainPack: input.config?.industryDomainPack ?? "generic",
      modelPolicy: input.config?.modelPolicy ?? { provider: "openai", allowedModels: ["gpt-5.4-mini"] },
      dataResidencyPolicy: input.config?.dataResidencyPolicy ?? { region: "local" },
      securityPolicy: input.config?.securityPolicy ?? {
        requireHumanApprovalForHighRisk: true,
        auditRequired: true,
        maxQueryTimeoutMs: 8000
      }
    });
    this.state.roles.push({
      id: createId("role"),
      tenantId: tenant.id,
      name: "Admin",
      permissions: Object.values(permissions)
    });
    return tenant;
  }

  getTenantConfig(tenantId: string): TenantConfig {
    const config = this.state.tenantConfigs.find((item) => item.tenantId === tenantId);
    if (!config) throw notFound(`Tenant config for ${tenantId} was not found`);
    return config;
  }

  updateTenantConfig(tenantId: string, patch: Partial<TenantConfig>): TenantConfig {
    const current = this.getTenantConfig(tenantId);
    const next: TenantConfig = {
      ...current,
      ...patch,
      tenantId: current.tenantId,
      id: current.id,
      themeColors: { ...current.themeColors, ...(patch.themeColors ?? {}) }
    };
    this.state.tenantConfigs = this.state.tenantConfigs.map((item) => item.tenantId === tenantId ? next : item);
    return next;
  }

  getUser(userId: string, tenantId?: string): User {
    const user = this.state.users.find((item) => item.id === userId && (!tenantId || item.tenantId === tenantId));
    if (!user) throw notFound(`User ${userId} was not found`);
    return user;
  }

  listUsers(tenantId: string): User[] {
    return this.state.users.filter((item) => item.tenantId === tenantId);
  }

  listRoles(tenantId: string): Role[] {
    return this.state.roles.filter((item) => item.tenantId === tenantId);
  }

  rolesForUser(userId: string, tenantId: string): Role[] {
    const user = this.getUser(userId, tenantId);
    const roleNamesByUser: Record<string, string[]> = {
      user_admin: ["Admin"],
      user_analyst: ["Analyst"],
      user_approver: ["Approver"]
    };
    const names = roleNamesByUser[user.id] ?? ["Viewer"];
    return this.state.roles.filter((role) => role.tenantId === tenantId && names.includes(role.name));
  }

  permissionsForUser(userId: string, tenantId: string): PermissionKey[] {
    return Array.from(new Set(this.rolesForUser(userId, tenantId).flatMap((role) => role.permissions)));
  }

  appendAudit(input: Omit<AuditLog, "id" | "createdAt">): AuditLog {
    const audit: AuditLog = {
      ...input,
      id: createId("audit"),
      metadata: input.metadata ? redact(input.metadata) as Record<string, unknown> : undefined,
      createdAt: nowIso()
    };
    this.state.auditLogs.unshift(audit);
    return audit;
  }

  appendSafetyRun(input: Omit<SafetyGateRun, "id" | "createdAt">): SafetyGateRun {
    const run: SafetyGateRun = {
      ...input,
      id: createId("safety_run"),
      createdAt: nowIso()
    };
    this.state.safetyGateRuns.unshift(run);
    return run;
  }

  appendConnector(connector: Connector): Connector {
    if (this.state.connectors.some((item) => item.tenantId === connector.tenantId && item.name === connector.name)) {
      throw conflict(`Connector ${connector.name} already exists`);
    }
    this.state.connectors.push(connector);
    return connector;
  }

  getConnector(tenantId: string, connectorId: string): Connector {
    const connector = this.state.connectors.find((item) => item.tenantId === tenantId && item.id === connectorId);
    if (!connector) throw notFound(`Connector ${connectorId} was not found`);
    return connector;
  }

  listConnectors(tenantId: string): Connector[] {
    return this.state.connectors.filter((item) => item.tenantId === tenantId);
  }

  getRoleByName(tenantId: string, roleName: string): Role | undefined {
    return this.state.roles.find((role) => role.tenantId === tenantId && role.name === roleName);
  }

  listAudit(tenantId: string, eventType?: AuditEventType): AuditLog[] {
    return this.state.auditLogs.filter((item) => item.tenantId === tenantId && (!eventType || item.eventType === eventType));
  }
}

export const store = new PlatformStore();
