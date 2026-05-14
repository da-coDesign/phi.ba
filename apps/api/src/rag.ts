import { permissions, type RequestContext } from "@phi-ba/contracts";
import { createId, nowIso } from "@phi-ba/shared";
import { safetyGateService } from "./safety-gates.js";
import { store, type PlatformStore } from "./store.js";
import type { DocumentChunk, DocumentRecord, JsonRecord } from "./platform-types.js";

export interface EmbeddingProvider {
  name: string;
  embed(text: string): number[];
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  name = "mock-local-embedding";

  embed(text: string): number[] {
    const vector = Array.from({ length: 16 }, (_, index) => {
      const code = text.charCodeAt(index % Math.max(text.length, 1)) || 0;
      return Number(((code % 31) / 31).toFixed(4));
    });
    return vector;
  }
}

export class PgVectorAdapter {
  constructor(private readonly repository: PlatformStore) {}

  search(tenantId: string, embedding: number[], limit = 5): DocumentChunk[] {
    const chunks = this.repository.snapshot().documentChunks.filter((chunk) => chunk.tenantId === tenantId);
    return chunks
      .map((chunk) => ({ chunk, score: cosineSimilarity(embedding, chunk.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.chunk);
  }
}

export class RagService {
  private readonly embeddingProvider = new MockEmbeddingProvider();
  private readonly vectorStore: PgVectorAdapter;

  constructor(private readonly repository: PlatformStore) {
    this.vectorStore = new PgVectorAdapter(repository);
    this.ensureSeedChunks();
  }

  ingest(context: RequestContext, input: { title: string; content: string; sourceType?: DocumentRecord["sourceType"]; metadata?: JsonRecord }): DocumentRecord {
    safetyGateService.assertAllowed(context, {
      tenantId: context.tenantId,
      operationType: "rag_ingestion",
      operationId: createId("rag_ingest"),
      requiredPermission: permissions.ragWrite,
      payload: { title: input.title, sourceType: input.sourceType }
    });
    const document: DocumentRecord = {
      id: createId("doc"),
      tenantId: context.tenantId,
      title: input.title,
      sourceType: input.sourceType ?? "document_upload",
      content: input.content,
      metadata: input.metadata,
      createdAt: nowIso()
    };
    const chunks = chunkText(input.content).map((content, index): DocumentChunk => ({
      id: createId("chunk"),
      tenantId: context.tenantId,
      documentId: document.id,
      content,
      chunkIndex: index,
      embedding: this.embeddingProvider.embed(content),
      metadata: { title: input.title }
    }));
    const state = this.repository.snapshot();
    state.documents.unshift(document);
    state.documentChunks.unshift(...chunks);
    const vectorIndex = state.vectorIndexes.find((item) => item.tenantId === context.tenantId && item.name === "default");
    if (vectorIndex) {
      vectorIndex.freshnessAt = nowIso();
      vectorIndex.documentCount += 1;
      vectorIndex.chunkCount += chunks.length;
    }
    this.repository.appendAudit({
      tenantId: context.tenantId,
      actorUserId: context.userId,
      eventType: "RAG_INGESTION",
      action: "rag.ingest",
      resourceType: "document",
      resourceId: document.id,
      correlationId: context.correlationId,
      metadata: { title: document.title, chunks: chunks.length }
    });
    return document;
  }

  retrieve(context: RequestContext, input: { query: string; limit?: number }): JsonRecord {
    safetyGateService.assertAllowed(context, {
      tenantId: context.tenantId,
      operationType: "rag_retrieval",
      operationId: createId("rag_retrieve"),
      requiredPermission: permissions.ragRead,
      vectorIndexName: "default"
    });
    const embedding = this.embeddingProvider.embed(input.query);
    const chunks = this.vectorStore.search(context.tenantId, embedding, input.limit ?? 5);
    const citations = chunks.map((chunk, index) => ({
      id: chunk.id,
      rank: index + 1,
      documentId: chunk.documentId,
      chunkIndex: chunk.chunkIndex,
      excerpt: chunk.content
    }));
    const answer = citations.length
      ? `Found ${citations.length} governed citation(s). Local MVP returns citation-ready evidence, not a real model answer.`
      : "No indexed evidence was found for this tenant.";
    this.repository.appendAudit({
      tenantId: context.tenantId,
      actorUserId: context.userId,
      eventType: "RAG_RETRIEVAL",
      action: "rag.retrieve",
      resourceType: "vector_index",
      resourceId: "default",
      correlationId: context.correlationId,
      metadata: { query: input.query, citations: citations.length }
    });
    return { answer, citations };
  }

  private ensureSeedChunks(): void {
    const state = this.repository.snapshot();
    if (state.documentChunks.length > 0) return;
    state.documents.forEach((document) => {
      state.documentChunks.push({
        id: createId("chunk"),
        tenantId: document.tenantId,
        documentId: document.id,
        content: document.content,
        chunkIndex: 0,
        embedding: this.embeddingProvider.embed(document.content),
        metadata: { title: document.title }
      });
    });
  }
}

function chunkText(content: string): string[] {
  const clean = content.trim();
  if (!clean) return [];
  const chunks: string[] = [];
  for (let start = 0; start < clean.length; start += 800) {
    chunks.push(clean.slice(start, start + 900));
  }
  return chunks;
}

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < length; index += 1) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export const ragService = new RagService(store);
