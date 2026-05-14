import { getPostgresCredentialStatus } from "@phi-ba/api/connectors";
import { getOpenAiCredentialStatus, providerRequiresOpenAiKey } from "@phi-ba/api/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const provider = process.env.LLM_PROVIDER ?? "openai";
  const credentialStatus = getOpenAiCredentialStatus();
  return Response.json({
    data: {
      runtime: "next-serverless",
      deploymentEnvironment: process.env.VERCEL_ENV ?? "local",
      provider,
      model: process.env.LLM_MODEL ?? "gpt-5.4-mini",
      textToSqlModel: process.env.TEXT_TO_SQL_MODEL ?? process.env.LLM_MODEL ?? "gpt-5.4-mini",
      openAiBaseUrl: process.env.OPENAI_BASE_URL ? "configured" : "default",
      providerRequiresOpenAiKey: providerRequiresOpenAiKey(provider),
      ...credentialStatus,
      ...getPostgresCredentialStatus()
    }
  }, {
    headers: {
      "cache-control": "no-store"
    }
  });
}
