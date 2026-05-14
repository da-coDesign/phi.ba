import { permissions, type RequestContext } from "@phi-ba/contracts";
import { createId, nowIso } from "@phi-ba/shared";
import { blocked } from "./errors.js";
import { safetyGateService } from "./safety-gates.js";
import { store, type PlatformStore } from "./store.js";
import type { JsonRecord, ModelUsage, PromptExecutionTrace } from "./platform-types.js";

export interface ModelProvider {
  key: string;
  complete(input: { model: string; prompt: string; variables?: JsonRecord }): Promise<{ text: string; tokenUsage: { input: number; output: number } }>;
}

class MockModelProvider implements ModelProvider {
  key = "mock";

  async complete(input: { model: string; prompt: string; variables?: JsonRecord }): Promise<{ text: string; tokenUsage: { input: number; output: number } }> {
    return {
      text: `Mock ${input.model} response: ${input.prompt.slice(0, 160)}`,
      tokenUsage: {
        input: Math.ceil(input.prompt.length / 4),
        output: 42
      }
    };
  }
}

class PlaceholderModelProvider implements ModelProvider {
  constructor(public readonly key: string) {}

  async complete(): Promise<{ text: string; tokenUsage: { input: number; output: number } }> {
    throw blocked(`${this.key} provider is a production placeholder and is disabled in local dev.`);
  }
}

export class ModelRouter {
  private providers = new Map<string, ModelProvider>();

  register(provider: ModelProvider): void {
    this.providers.set(provider.key, provider);
  }

  get(providerKey: string): ModelProvider {
    const provider = this.providers.get(providerKey);
    if (!provider) throw blocked(`Model provider ${providerKey} is not registered`);
    return provider;
  }

  list(): string[] {
    return Array.from(this.providers.keys());
  }
}

export class LlmGatewayService {
  public readonly router = new ModelRouter();

  constructor(private readonly repository: PlatformStore) {
    this.router.register(new MockModelProvider());
    this.router.register(new PlaceholderModelProvider("openai-compatible"));
    this.router.register(new PlaceholderModelProvider("azure-openai"));
    this.router.register(new PlaceholderModelProvider("anthropic"));
    this.router.register(new PlaceholderModelProvider("gemini"));
  }

  listPrompts(context: RequestContext) {
    return this.repository.snapshot().prompts.filter((prompt) => prompt.tenantId === context.tenantId);
  }

  executePrompt(context: RequestContext, input: { promptKey: string; model?: string; variables?: JsonRecord; piiMasked?: boolean }): Promise<JsonRecord> {
    const prompt = this.repository.snapshot().prompts.find((item) => item.tenantId === context.tenantId && item.key === input.promptKey);
    if (!prompt) throw blocked(`Prompt ${input.promptKey} was not found`);
    const version = prompt.versions.at(-1);
    if (!version) throw blocked(`Prompt ${input.promptKey} has no version`);
    const config = this.repository.getTenantConfig(context.tenantId);
    const providerKey = String(config.modelPolicy.provider ?? "mock");
    const model = input.model ?? String((config.modelPolicy.allowedModels as string[] | undefined)?.[0] ?? "mock-enterprise-analyst");

    safetyGateService.assertAllowed(context, {
      tenantId: context.tenantId,
      operationType: "model_call",
      operationId: createId("model_call"),
      requiredPermission: permissions.promptsRead,
      model,
      maskingEnabled: input.piiMasked ?? true,
      payload: input.variables
    });

    return this.router.get(providerKey).complete({
      model,
      prompt: renderPrompt(version.body, input.variables ?? {}),
      variables: input.variables
    }).then((result) => {
      const trace: PromptExecutionTrace = {
        id: createId("prompt_trace"),
        tenantId: context.tenantId,
        promptKey: prompt.key,
        promptVersion: version.version,
        model,
        input: input.variables ?? {},
        output: { text: result.text },
        status: "completed",
        tokenUsage: result.tokenUsage,
        createdAt: nowIso()
      };
      const usage: ModelUsage = {
        id: createId("model_usage"),
        tenantId: context.tenantId,
        provider: providerKey,
        model,
        inputTokens: result.tokenUsage.input,
        outputTokens: result.tokenUsage.output,
        operation: `prompt.${prompt.key}`,
        createdAt: nowIso()
      };
      const state = this.repository.snapshot();
      state.promptExecutionTraces.unshift(trace);
      state.modelUsage.unshift(usage);
      this.repository.appendAudit({
        tenantId: context.tenantId,
        actorUserId: context.userId,
        eventType: "LLM_CALL",
        action: "llm.prompt.execute",
        resourceType: "prompt",
        resourceId: prompt.id,
        correlationId: context.correlationId,
        metadata: { promptKey: prompt.key, model, tokenUsage: result.tokenUsage }
      });
      return { text: result.text, traceId: trace.id, tokenUsage: result.tokenUsage };
    });
  }

  listTraces(context: RequestContext): PromptExecutionTrace[] {
    return this.repository.snapshot().promptExecutionTraces.filter((trace) => trace.tenantId === context.tenantId);
  }
}

function renderPrompt(template: string, variables: JsonRecord): string {
  return Object.entries(variables).reduce(
    (current, [key, value]) => current.replaceAll(`{{${key}}}`, String(value)),
    template
  );
}

export const llmGatewayService = new LlmGatewayService(store);
