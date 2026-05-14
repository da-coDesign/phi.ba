import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import { sendError } from "./errors.js";
import { registerRequestContext } from "./request-context.js";
import { registerRoutes } from "./routes.js";

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      redact: ["req.headers.authorization", "body.password", "body.token", "body.secret", "body.apiKey"]
    },
    disableRequestLogging: false
  });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(multipart);
  await app.register(swagger, {
    openapi: {
      info: {
        title: "phi.ba Enterprise Platform API",
        version: "0.1.0"
      }
    }
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
  await registerRequestContext(app);
  await registerRoutes(app);

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error, correlationId: request.platformContext?.correlationId }, "request failed");
    return sendError(reply, error, request.platformContext);
  });

  return app;
}
