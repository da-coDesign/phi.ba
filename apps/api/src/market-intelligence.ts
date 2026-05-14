import { permissions, type RequestContext } from "@phi-ba/contracts";
import { createId, nowIso } from "@phi-ba/shared";
import { safetyGateService } from "./safety-gates.js";
import { notFound } from "./errors.js";
import { store, type PlatformStore } from "./store.js";
import type { ExternalIngestionJob, ExternalSource, JsonRecord } from "./platform-types.js";

export interface ExternalDataNormalizer {
  normalize(source: ExternalSource, raw: JsonRecord[]): JsonRecord[];
}

class InterestRateNormalizer implements ExternalDataNormalizer {
  normalize(source: ExternalSource, raw: JsonRecord[]): JsonRecord[] {
    return raw.map((item) => ({
      sourceId: source.id,
      competitor: String(item.competitor ?? "Example Bank"),
      product: String(item.product ?? "consumer_loan"),
      interestRate: Number(item.interestRate ?? 3.55),
      collectedAt: nowIso(),
      confidenceScore: source.confidenceScore
    }));
  }
}

export class MarketIntelligenceService {
  private readonly normalizer = new InterestRateNormalizer();

  constructor(private readonly repository: PlatformStore) {}

  listSources(context: RequestContext): ExternalSource[] {
    return this.repository.snapshot().externalSources.filter((source) => source.tenantId === context.tenantId);
  }

  createSource(context: RequestContext, input: Omit<ExternalSource, "id" | "tenantId">): ExternalSource {
    const source: ExternalSource = {
      ...input,
      id: createId("source"),
      tenantId: context.tenantId
    };
    this.repository.snapshot().externalSources.unshift(source);
    this.repository.appendAudit({
      tenantId: context.tenantId,
      actorUserId: context.userId,
      eventType: "ADMIN_CONFIG",
      action: "market.source.create",
      resourceType: "external_source",
      resourceId: source.id,
      correlationId: context.correlationId,
      metadata: { name: source.name, governanceApproved: source.governanceApproved }
    });
    return source;
  }

  ingest(context: RequestContext, sourceId: string): ExternalIngestionJob {
    safetyGateService.assertAllowed(context, {
      tenantId: context.tenantId,
      operationType: "external_ingestion",
      operationId: createId("market_ingestion"),
      requiredPermission: permissions.marketWrite,
      sourceId
    });
    const source = this.repository.snapshot().externalSources.find((item) => item.tenantId === context.tenantId && item.id === sourceId);
    if (!source) throw notFound(`External source ${sourceId} was not found`);
    const normalized = this.normalizer.normalize(source, [
      { competitor: "Example Bank A", product: "consumer_loan", interestRate: 3.52 },
      { competitor: "Example Bank B", product: "consumer_loan", interestRate: 3.61 }
    ]);
    const job: ExternalIngestionJob = {
      id: createId("external_job"),
      tenantId: context.tenantId,
      sourceId,
      status: "SUCCEEDED",
      normalizedCount: normalized.length,
      metadata: { normalized },
      createdAt: nowIso(),
      completedAt: nowIso()
    };
    this.repository.snapshot().externalIngestionJobs.unshift(job);
    this.repository.appendAudit({
      tenantId: context.tenantId,
      actorUserId: context.userId,
      eventType: "EXTERNAL_INGESTION",
      action: "market.ingest",
      resourceType: "external_source",
      resourceId: sourceId,
      correlationId: context.correlationId,
      metadata: { normalizedCount: normalized.length, rateLimitPerHour: source.rateLimitPerHour }
    });
    return job;
  }

  compare(context: RequestContext): JsonRecord {
    safetyGateService.assertAllowed(context, {
      tenantId: context.tenantId,
      operationType: "service",
      operationId: createId("market_compare"),
      requiredPermission: permissions.marketRead
    });
    const latestJob = this.repository.snapshot().externalIngestionJobs.find((job) => job.tenantId === context.tenantId && job.status === "SUCCEEDED");
    return {
      internal: {
        product: "consumer_loan",
        interestRate: 3.45,
        source: "tenant_metric"
      },
      external: latestJob?.metadata?.normalized ?? [
        { competitor: "Example Bank A", product: "consumer_loan", interestRate: 3.52, confidenceScore: 0.72 },
        { competitor: "Example Bank B", product: "consumer_loan", interestRate: 3.61, confidenceScore: 0.72 }
      ],
      explanation: "Governed comparison only; no aggressive scraping is performed."
    };
  }
}

export const marketIntelligenceService = new MarketIntelligenceService(store);
