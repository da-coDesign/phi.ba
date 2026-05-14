import { permissions, type RequestContext } from "@phi-ba/contracts";
import { createId } from "@phi-ba/shared";
import { blocked } from "./errors.js";
import { requirePermission } from "./request-context.js";
import { safetyGateService } from "./safety-gates.js";
import { store, type PlatformStore } from "./store.js";
import type { SecretReference } from "./platform-types.js";

export interface SecretProvider {
  key: SecretReference["provider"];
  validate(reference: string): boolean;
  resolve(reference: string): Promise<string>;
}

class LocalDevSecretProvider implements SecretProvider {
  key: SecretReference["provider"] = "local-dev";

  validate(reference: string): boolean {
    return reference.startsWith("local://");
  }

  async resolve(reference: string): Promise<string> {
    return `local-secret-value-for:${reference}`;
  }
}

class PlaceholderSecretProvider implements SecretProvider {
  constructor(public readonly key: SecretReference["provider"]) {}

  validate(reference: string): boolean {
    return reference.length > 0 && !reference.includes("password=");
  }

  async resolve(): Promise<string> {
    throw blocked(`${this.key} secret provider is a production adapter placeholder.`);
  }
}

export class SecretService {
  private providers: SecretProvider[] = [
    new LocalDevSecretProvider(),
    new PlaceholderSecretProvider("vault"),
    new PlaceholderSecretProvider("kms")
  ];

  constructor(private readonly repository: PlatformStore) {}

  list(context: RequestContext): SecretReference[] {
    return this.repository.snapshot().secretReferences.filter((secret) => secret.tenantId === context.tenantId);
  }

  create(context: RequestContext, input: Omit<SecretReference, "id" | "tenantId">): SecretReference {
    requirePermission(context, permissions.secretsWrite);
    const provider = this.providers.find((item) => item.key === input.provider);
    if (!provider || !provider.validate(input.reference)) throw blocked("Secret reference failed provider validation");
    safetyGateService.assertAllowed(context, {
      tenantId: context.tenantId,
      operationType: "service",
      operationId: createId("secret_ref"),
      requiredPermission: permissions.secretsWrite,
      payload: { provider: input.provider, reference: input.reference }
    });
    const secret: SecretReference = {
      ...input,
      id: createId("secret"),
      tenantId: context.tenantId
    };
    this.repository.snapshot().secretReferences.unshift(secret);
    this.repository.appendAudit({
      tenantId: context.tenantId,
      actorUserId: context.userId,
      eventType: "ADMIN_CONFIG",
      action: "secret_reference.create",
      resourceType: "secret_reference",
      resourceId: secret.id,
      correlationId: context.correlationId,
      metadata: { name: secret.name, provider: secret.provider, reference: secret.reference }
    });
    return secret;
  }
}

export const secretService = new SecretService(store);
