export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    data: {
      runtime: "next-serverless",
      hasServerOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
      provider: process.env.LLM_PROVIDER ?? "openai",
      model: process.env.LLM_MODEL ?? "gpt-5.4-mini",
      textToSqlModel: process.env.TEXT_TO_SQL_MODEL ?? process.env.LLM_MODEL ?? "gpt-5.4-mini",
      openAiBaseUrl: process.env.OPENAI_BASE_URL ? "configured" : "default"
    }
  }, {
    headers: {
      "cache-control": "no-store"
    }
  });
}
