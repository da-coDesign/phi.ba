import type { FastifyReply } from "fastify";

export function ok<T>(reply: FastifyReply, data: T, meta?: Record<string, unknown>): FastifyReply {
  return reply.send({ data, ...(meta ? { meta } : {}) });
}

export function created<T>(reply: FastifyReply, data: T, meta?: Record<string, unknown>): FastifyReply {
  return reply.status(201).send({ data, ...(meta ? { meta } : {}) });
}
