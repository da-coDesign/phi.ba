import { permissions, type RequestContext } from "@phi-ba/contracts";
import { createId, nowIso } from "@phi-ba/shared";
import { blocked } from "./errors.js";
import { safetyGateService } from "./safety-gates.js";
import { store, type PlatformStore } from "./store.js";
import type { JsonRecord, ModelUsage, PromptExecutionTrace } from "./platform-types.js";

export interface ModelProvider {
  key: string;
  complete(input: { model: string; prompt: string; variables?: JsonRecord }): Promise<{ text: string; tokenUsage: { input: number; output: number } }>;
  stream?(input: { model: string; prompt: string; variables?: JsonRecord }): AsyncIterable<string>;
}

class MockModelProvider implements ModelProvider {
  key = "mock";

  async complete(input: { model: string; prompt: string; variables?: JsonRecord }): Promise<{ text: string; tokenUsage: { input: number; output: number } }> {
    const userMessage = String(input.variables?.user_message ?? "");
    const agentName = String(input.variables?.agent ?? "phi.ba agent");
    const intent = String(input.variables?.intent ?? "direct_answer");
    const toolSummary = String(input.variables?.tool_summary ?? "");
    const toolKey = String(input.variables?.tool_key ?? "none");
    const text = userMessage
      ? `${agentName}: Sorunu aldım. Niyet: ${intent}. ${toolKey !== "none" ? `Çalıştırılan güvenli araç: ${toolKey}. ` : ""}${toolSummary || "Bu istek için kısa, kontrollü bir yanıt hazırlıyorum."}\n\nSonraki adım: veri veya aksiyon canlı sisteme etki edecekse tenant izolasyonu, RBAC, denetim kaydı ve gerekiyorsa insan onayı tamamlanmadan ilerlemem.`
      : `Mock ${input.model} response: ${input.prompt.slice(0, 160)}`;
    return {
      text,
      tokenUsage: {
        input: Math.ceil(input.prompt.length / 4),
        output: Math.ceil(text.length / 4)
      }
    };
  }

  async *stream(input: { model: string; prompt: string; variables?: JsonRecord }): AsyncIterable<string> {
    const response = await this.complete(input);
    for (const token of response.text.split(/(\s+)/).filter(Boolean)) {
      yield token;
      await new Promise((resolve) => setTimeout(resolve, 18));
    }
  }
}

class PlaceholderModelProvider implements ModelProvider {
  constructor(public readonly key: string) {}

  async complete(): Promise<{ text: string; tokenUsage: { input: number; output: number } }> {
    throw blocked(`${this.key} provider is a production placeholder and is disabled in local dev.`);
  }
}

class OpenAiCompatibleProvider implements ModelProvider {
  key = "openai-compatible";

  constructor(
    private readonly config = {
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"
    }
  ) {}

  async complete(input: { model: string; prompt: string; variables?: JsonRecord }): Promise<{ text: string; tokenUsage: { input: number; output: number } }> {
    const json = await this.request(input, false);
    const text = String(json.choices?.[0]?.message?.content ?? "");
    return {
      text,
      tokenUsage: {
        input: Number(json.usage?.prompt_tokens ?? Math.ceil(input.prompt.length / 4)),
        output: Number(json.usage?.completion_tokens ?? Math.ceil(text.length / 4))
      }
    };
  }

  async *stream(input: { model: string; prompt: string; variables?: JsonRecord }): AsyncIterable<string> {
    if (!this.config.apiKey) throw blocked("OPENAI_API_KEY is required for openai-compatible streaming.");
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: input.model,
        stream: true,
        messages: [
          { role: "system", content: "You are phi.ba, a governed enterprise data agent. Answer clearly, cite when tool evidence is present, and never claim you executed an action unless the platform did." },
          { role: "user", content: input.prompt }
        ]
      })
    });
    if (!response.ok || !response.body) throw blocked(`openai-compatible stream failed with status ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice("data:".length).trim();
          if (!data || data === "[DONE]") continue;
          const parsed = JSON.parse(data);
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) yield String(token);
        }
      }
    }
  }

  private async request(input: { model: string; prompt: string }, stream: boolean): Promise<any> {
    if (!this.config.apiKey) throw blocked("OPENAI_API_KEY is required for openai-compatible model calls.");
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: input.model,
        stream,
        messages: [
          { role: "system", content: "You are phi.ba, a governed enterprise data agent." },
          { role: "user", content: input.prompt }
        ]
      })
    });
    if (!response.ok) throw blocked(`openai-compatible call failed with status ${response.status}`);
    return response.json();
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
    this.router.register(new OpenAiCompatibleProvider());
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

  async *streamPrompt(context: RequestContext, input: { promptKey: string; model?: string; variables?: JsonRecord; piiMasked?: boolean }): AsyncIterable<{ event: "token" | "done"; data: JsonRecord }> {
    const prompt = this.repository.snapshot().prompts.find((item) => item.tenantId === context.tenantId && item.key === input.promptKey);
    if (!prompt) throw blocked(`Prompt ${input.promptKey} was not found`);
    const version = prompt.versions.at(-1);
    if (!version) throw blocked(`Prompt ${input.promptKey} has no version`);
    const config = this.repository.getTenantConfig(context.tenantId);
    const providerKey = String(process.env.LLM_PROVIDER ?? config.modelPolicy.provider ?? "mock");
    const model = input.model ?? String(process.env.LLM_MODEL ?? (config.modelPolicy.allowedModels as string[] | undefined)?.[0] ?? "mock-enterprise-analyst");

    safetyGateService.assertAllowed(context, {
      tenantId: context.tenantId,
      operationType: "model_call",
      operationId: createId("model_call"),
      requiredPermission: permissions.promptsRead,
      model,
      maskingEnabled: input.piiMasked ?? true,
      payload: input.variables
    });

    const rendered = renderPrompt(version.body, input.variables ?? {});
    const provider = this.router.get(providerKey);
    const stream = provider.stream?.({ model, prompt: rendered, variables: input.variables }) ?? this.streamFromComplete(provider, { model, prompt: rendered, variables: input.variables });
    let text = "";
    for await (const token of stream) {
      text += token;
      yield { event: "token", data: { token } };
    }
    const tokenUsage = {
      input: Math.ceil(rendered.length / 4),
      output: Math.ceil(text.length / 4)
    };
    const trace: PromptExecutionTrace = {
      id: createId("prompt_trace"),
      tenantId: context.tenantId,
      promptKey: prompt.key,
      promptVersion: version.version,
      model,
      input: input.variables ?? {},
      output: { text },
      status: "completed",
      tokenUsage,
      createdAt: nowIso()
    };
    const usage: ModelUsage = {
      id: createId("model_usage"),
      tenantId: context.tenantId,
      provider: providerKey,
      model,
      inputTokens: tokenUsage.input,
      outputTokens: tokenUsage.output,
      operation: `prompt.${prompt.key}.stream`,
      createdAt: nowIso()
    };
    const state = this.repository.snapshot();
    state.promptExecutionTraces.unshift(trace);
    state.modelUsage.unshift(usage);
    this.repository.appendAudit({
      tenantId: context.tenantId,
      actorUserId: context.userId,
      eventType: "LLM_CALL",
      action: "llm.prompt.stream",
      resourceType: "prompt",
      resourceId: prompt.id,
      correlationId: context.correlationId,
      metadata: { promptKey: prompt.key, model, tokenUsage }
    });
    yield { event: "done", data: { text, traceId: trace.id, tokenUsage } };
  }

  listTraces(context: RequestContext): PromptExecutionTrace[] {
    return this.repository.snapshot().promptExecutionTraces.filter((trace) => trace.tenantId === context.tenantId);
  }

  private async *streamFromComplete(provider: ModelProvider, input: { model: string; prompt: string; variables?: JsonRecord }): AsyncIterable<string> {
    const result = await provider.complete(input);
    yield result.text;
  }
}

function renderPrompt(template: string, variables: JsonRecord): string {
  return Object.entries(variables).reduce(
    (current, [key, value]) => current.replaceAll(`{{${key}}}`, String(value)),
    template
  );
}

export const llmGatewayService = new LlmGatewayService(store);
