# phi.ba Enterprise Service Platform

This repository contains a local MVP of the white-label, tenant-aware phi.ba platform. The current codebase has been converted from a static prototype into a TypeScript monorepo with an API service, admin console, database schema, migrations, seed data, and focused safety tests.

## What Is Included

- `apps/api`: Fastify REST API with tenant-scoped request context, local dev auth, RBAC, audit logging, Safety Gates, connectors, text-to-SQL, RAG, LLM gateway, agents, workflows/actions, approvals, alerts, market intelligence, simulation, and observability endpoints.
- `apps/web`: Next.js tenant-aware admin console for setup, white-label settings, users/roles, connectors, glossary, metrics, prompts, agents, query playground, RAG, alerts, market sources, approvals, simulations, Safety Gates, audit, and observability.
- `prisma`: PostgreSQL/pgvector schema, baseline migration, banking demo dataset migration, and seed scripts.
- `tests`: Vitest coverage for tenant isolation, RBAC, secret references, SQL safety, Safety Gate blocking, connector validation, agent tool permissions, approval requirements, audit logging, alerts, market governance, and simulation sandboxing.

## Local Setup

```bash
cp .env.example .env
npm install
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:seed:banking-demo
npm run dev
```

Set a fresh server-side OpenAI key in `.env` before asking live agent questions:

```bash
LLM_PROVIDER=openai
LLM_MODEL=gpt-5.4-mini
TEXT_TO_SQL_MODEL=gpt-5.4-mini
OPENAI_API_KEY=<server-side-openai-api-key>
```

Do not commit `.env` or paste production keys into chat. If `OPENAI_API_KEY` is missing, the agent returns a connection error instead of fabricated analysis.

FBDWHPRD queries require PostgreSQL. Run migrations and `npm run db:seed:banking-demo` before using the agent against the banking dataset; the API returns a controlled connector error instead of fabricating rows when `DATABASE_URL` is missing.

For Vercel, do not leave `NEXT_PUBLIC_API_BASE_URL` pointed at `http://localhost:4000`. The deployed web app must point to a reachable API deployment URL, while local development can keep `http://localhost:4000`.

Local API headers:

```bash
Authorization: Bearer dev-admin-token
x-tenant-id: tenant_fibabanka
content-type: application/json
```

Other local tokens:

- `dev-analyst-token`
- `dev-approver-token`

## Useful Commands

```bash
npm run dev
npm run dev:api
npm run dev:web
npm test
npm run lint
npm run build
```

## Example API Calls

Natural-language query:

```bash
curl -s http://localhost:4000/api/v1/natural-language-query \
  -H "authorization: Bearer dev-admin-token" \
  -H "x-tenant-id: tenant_fibabanka" \
  -H "content-type: application/json" \
  -d '{"question":"Kart onay oranı neden düştü, hangi segment ve kanalda kayıp hacim yüksek?","execute":true}'
```

Manual Safety Gate run:

```bash
curl -s http://localhost:4000/api/v1/safety-gates/run \
  -H "authorization: Bearer dev-admin-token" \
  -H "x-tenant-id: tenant_fibabanka" \
  -H "content-type: application/json" \
  -d '{"operationType":"sql_query","connectorId":"connector_pg_reporting","requiredPermission":"query:execute","sql":"SELECT product_name, segment, risk_band, npl_ratio_pct FROM v_credit_risk_snapshot LIMIT 5"}'
```

Realtime central-input agent stream:

```bash
curl -N http://localhost:4000/api/v1/agents/agent_risk/stream \
  -H "authorization: Bearer dev-admin-token" \
  -H "x-tenant-id: tenant_fibabanka" \
  -H "content-type: application/json" \
  -d '{"message":"Mobil retention ve kampanya dönüşümünü segment bazında yorumla"}'
```

RAG ingest and retrieve:

```bash
curl -s http://localhost:4000/api/v1/rag/ingest \
  -H "authorization: Bearer dev-admin-token" \
  -H "x-tenant-id: tenant_fibabanka" \
  -H "content-type: application/json" \
  -d '{"title":"Policy note","content":"High-risk actions require approval before execution."}'
```

```bash
curl -s http://localhost:4000/api/v1/rag/retrieve \
  -H "authorization: Bearer dev-admin-token" \
  -H "x-tenant-id: tenant_fibabanka" \
  -H "content-type: application/json" \
  -d '{"query":"Which actions require approval?"}'
```

Run seeded anomaly scenario:

```bash
curl -s http://localhost:4000/api/v1/sentry/run \
  -H "authorization: Bearer dev-admin-token" \
  -H "x-tenant-id: tenant_fibabanka" \
  -H "content-type: application/json" \
  -d '{"metricKey":"marketplace_credit_volume","currentValue":72,"baselineValue":100}'
```

## Local Placeholders

- LLM calls default to real OpenAI Responses API calls.
- Text-to-SQL always goes through the configured model provider; tests register an explicit provider stub so CI does not require an external key.
- PostgreSQL connector executes read-only SQL against `DATABASE_URL`; no synthetic query fallback is used at runtime.
- Azure OpenAI, Anthropic, Gemini, Vault/KMS, OIDC, SAML, SCIM, SFTP, SharePoint, Slack, Teams, Jira, and email are adapter placeholders.
- Market intelligence uses governed example data and does not scrape.
- Simulation is deterministic foundation logic, not a production ML engine.

## Security Assumptions

- All sensitive APIs require local bearer auth and `x-tenant-id`.
- Tenant isolation, RBAC, audit writability, and Safety Gates are enforced before risky local operations.
- Raw production secrets are not stored in app records; only secret references are modeled.
- Generated SQL must pass read-only and allowlist validation before execution.
- High-risk actions and tools require human approval unless tenant policy is changed.
- Error responses use safe envelopes and do not return raw stack traces.

## Production Hardening Still Needed

- Replace in-memory runtime repositories with Prisma-backed repositories for all API paths.
- Complete real enterprise SSO, SCIM, Vault/KMS, notification, connector, and model-provider integrations.
- Add row-level security policies, migration review, backup/restore, HA Redis/Postgres, and managed SaaS isolation.
- Add OpenTelemetry traces/metrics export, structured log shipping, SIEM integration, and compliance evidence automation.
- Expand SQL parser support with a dedicated parser library and database-side read-only roles.
- Perform an external security audit before claiming third-party validation.
