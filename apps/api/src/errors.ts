import type { FastifyReply } from "fastify";
import type { RequestContext } from "@phi-ba/contracts";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400
  ) {
    super(message);
  }
}

export function forbidden(message = "Forbidden"): ApiError {
  return new ApiError("FORBIDDEN", message, 403);
}

export function unauthorized(message = "Unauthorized"): ApiError {
  return new ApiError("UNAUTHORIZED", message, 401);
}

export function notFound(message = "Not found"): ApiError {
  return new ApiError("NOT_FOUND", message, 404);
}

export function conflict(message = "Conflict"): ApiError {
  return new ApiError("CONFLICT", message, 409);
}

export function blocked(message = "Execution blocked by safety policy"): ApiError {
  return new ApiError("SAFETY_BLOCKED", message, 422);
}

export function sendError(reply: FastifyReply, error: unknown, context?: Partial<RequestContext>): FastifyReply {
  const apiError = error instanceof ApiError
    ? error
    : new ApiError("INTERNAL_ERROR", "Unexpected server error", 500);
  return reply.status(apiError.statusCode).send({
    error: {
      code: apiError.code,
      message: apiError.message,
      correlationId: context?.correlationId ?? "unknown"
    }
  });
}
