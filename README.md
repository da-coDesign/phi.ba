# phi.ba Enterprise Service Platform

This repository contains a local MVP of the white-label, tenant-aware phi.ba platform. The current codebase has been converted from a static prototype into a TypeScript monorepo with an API service, admin console, database schema, migrations, seed data, and focused safety tests.

## What Is Included

- `apps/api`: Fastify REST API with tenant-scoped request context, local dev auth, RBAC, audit logging, Safety Gates, connectors, text-to-SQL, RAG, LLM gateway, agents, workflows/actions, approvals, alerts, market intelligence, simulation, and observability endpoints.
- `apps/web`: Next.js tenant-aware admin console for setup, white-label settings, users/roles, connectors, glossary, metrics, prompts, agents, query playground, RAG, alerts, market sources, approvals, simulations, Safety Gates, audit, and observability.
- `prisma`: PostgreSQL/pgvector schema, baseline migration, and seed script.
- `tests`: Vitest coverage for tenant isolation, RBAC, secret references, SQL safety, Safety Gate blocking, connector validation, agent tool permissions, approval requirements, audit logging, alerts, market governance, and simulation sandboxing.

## Local Setup

```bash
cp .env.example .env
npm install
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

API: `http://localhost:4000`  
API docs: `http://localhost:4000/docs`  
Admin console: `http://localhost:3000`

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
  -d '{"question":"Son 30 günde işlem hacmine göre en çok kullanılan 10 segment","execute":true}'
```

Manual Safety Gate run:

```bash
curl -s http://localhost:4000/api/v1/safety-gates/run \
  -H "authorization: Bearer dev-admin-token" \
  -H "x-tenant-id: tenant_fibabanka" \
  -H "content-type: application/json" \
  -d '{"operationType":"sql_query","connectorId":"connector_pg_reporting","requiredPermission":"query:execute","sql":"SELECT urun_adi, segment FROM risk_izleme LIMIT 5"}'
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

## Mocked Locally

- LLM responses and embeddings use local mock providers.
- PostgreSQL connector execution returns deterministic mock rows unless production adapter work is added.
- OpenAI-compatible, Azure OpenAI, Anthropic, Gemini, Vault/KMS, OIDC, SAML, SCIM, SFTP, SharePoint, Slack, Teams, Jira, and email are adapter placeholders.
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
