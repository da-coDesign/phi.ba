"use client";

import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Bell,
  BookOpen,
  Bot,
  Building2,
  CheckCircle2,
  Database,
  FileSearch,
  Flag,
  Gauge,
  GitBranch,
  KeyRound,
  Layers3,
  ListChecks,
  LockKeyhole,
  MessageSquareText,
  Play,
  Radar,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  UsersRound,
  Workflow
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_TENANT_ID } from "@phi-ba/contracts";

type ApiState = "idle" | "loading" | "ready" | "error";
type NavItem = {
  id: string;
  label: string;
  endpoint: string;
  icon: React.ComponentType<{ size?: number }>;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const headers = {
  "content-type": "application/json",
  authorization: "Bearer dev-admin-token",
  "x-tenant-id": DEFAULT_TENANT_ID
};

const navItems: NavItem[] = [
  { id: "tenant", label: "Tenant setup", endpoint: "/api/v1/tenants", icon: Building2 },
  { id: "white-label", label: "White-label settings", endpoint: "/api/v1/white-label-config", icon: SlidersHorizontal },
  { id: "users", label: "Users and roles", endpoint: "/api/v1/users", icon: UsersRound },
  { id: "connectors", label: "Connectors", endpoint: "/api/v1/connectors", icon: Database },
  { id: "glossary", label: "Business glossary", endpoint: "/api/v1/glossary", icon: BookOpen },
  { id: "metrics", label: "Metric definitions", endpoint: "/api/v1/metrics", icon: Gauge },
  { id: "prompts", label: "Prompt registry", endpoint: "/api/v1/llm/prompts", icon: MessageSquareText },
  { id: "agent-templates", label: "Agent templates", endpoint: "/api/v1/agent-templates", icon: Bot },
  { id: "query", label: "NL query playground", endpoint: "/api/v1/query-traces", icon: Search },
  { id: "rag", label: "RAG upload/search", endpoint: "/api/v1/rag/retrieve", icon: FileSearch },
  { id: "rules", label: "Sentry alert rules", endpoint: "/api/v1/sentry/rules", icon: Radar },
  { id: "alerts", label: "Alerts inbox", endpoint: "/api/v1/alerts", icon: Bell },
  { id: "market", label: "Market sources", endpoint: "/api/v1/market-intelligence/sources", icon: Flag },
  { id: "approvals", label: "Workflow approvals", endpoint: "/api/v1/approvals", icon: BadgeCheck },
  { id: "simulation", label: "Simulation playground", endpoint: "/api/v1/simulation/scenarios", icon: GitBranch },
  { id: "safety", label: "Safety Gates", endpoint: "/api/v1/safety-gates/checks", icon: ShieldCheck },
  { id: "audit", label: "Audit logs", endpoint: "/api/v1/audit-logs", icon: LockKeyhole },
  { id: "observability", label: "Observability", endpoint: "/api/v1/observability/health", icon: Activity }
];

export default function AdminConsole() {
  const [activeId, setActiveId] = useState("query");
  const [status, setStatus] = useState<ApiState>("idle");
  const [data, setData] = useState<unknown>(null);
  const [query, setQuery] = useState("Son 30 günde işlem hacmine göre en çok kullanılan 10 segment");
  const [ragText, setRagText] = useState("High-risk workflow actions require approver review before execution.");
  const [simulationRate, setSimulationRate] = useState("3.45");
  const [notice, setNotice] = useState("");

  const active = useMemo(() => navItems.find((item) => item.id === activeId) ?? navItems[0], [activeId]);

  useEffect(() => {
    if (!active || active.id === "rag") return;
    void load(active.endpoint);
  }, [active]);

  async function request(path: string, init?: RequestInit) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers ?? {}) }
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message ?? "Request failed");
    return body.data;
  }

  async function load(path: string) {
    setStatus("loading");
    setNotice("");
    try {
      const result = await request(path);
      setData(result);
      setStatus("ready");
    } catch (error) {
      setData({ message: error instanceof Error ? error.message : "Unable to load API data" });
      setStatus("error");
    }
  }

  async function runAction(path: string, body?: unknown, method = "POST") {
    setStatus("loading");
    try {
      const result = await request(path, {
        method,
        body: body ? JSON.stringify(body) : undefined
      });
      setData(result);
      setStatus("ready");
      setNotice("Completed");
    } catch (error) {
      setData({ message: error instanceof Error ? error.message : "Action failed" });
      setStatus("error");
    }
  }

  return (
    <main className="console">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Sparkles size={16} /></div>
          <div>
            <strong>phi.ba</strong>
            <span>Enterprise console</span>
          </div>
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={activeId === item.id ? "nav active" : "nav"} onClick={() => setActiveId(item.id)}>
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p>{DEFAULT_TENANT_ID}</p>
            <h1>{active?.label}</h1>
          </div>
          <div className="top-actions">
            <StatusPill status={status} />
            {active && <button className="icon-button" onClick={() => load(active.endpoint)} title="Refresh"><RefreshCw size={16} /></button>}
          </div>
        </header>

        <section className="content-grid">
          <ControlPanel
            activeId={activeId}
            query={query}
            setQuery={setQuery}
            ragText={ragText}
            setRagText={setRagText}
            simulationRate={simulationRate}
            setSimulationRate={setSimulationRate}
            runAction={runAction}
          />
          <section className="panel output">
            <div className="panel-head">
              <h2>Tenant API result</h2>
              {notice && <span className="success"><CheckCircle2 size={14} />{notice}</span>}
            </div>
            <pre>{JSON.stringify(data, null, 2)}</pre>
          </section>
        </section>
      </section>
    </main>
  );
}

function ControlPanel(props: {
  activeId: string;
  query: string;
  setQuery: (value: string) => void;
  ragText: string;
  setRagText: (value: string) => void;
  simulationRate: string;
  setSimulationRate: (value: string) => void;
  runAction: (path: string, body?: unknown, method?: string) => Promise<void>;
}) {
  if (props.activeId === "query") {
    return (
      <section className="panel">
        <div className="panel-head"><h2>Ask governed data</h2><ListChecks size={18} /></div>
        <textarea value={props.query} onChange={(event) => props.setQuery(event.target.value)} />
        <div className="button-row">
          <button onClick={() => props.runAction("/api/v1/natural-language-query", { question: props.query, execute: true })}><Play size={15} />Run</button>
          <button className="secondary" onClick={() => props.runAction("/api/v1/text-to-sql", { question: props.query })}><Database size={15} />Generate SQL</button>
        </div>
      </section>
    );
  }
  if (props.activeId === "rag") {
    return (
      <section className="panel">
        <div className="panel-head"><h2>Ingest or retrieve</h2><Upload size={18} /></div>
        <textarea value={props.ragText} onChange={(event) => props.setRagText(event.target.value)} />
        <div className="button-row">
          <button onClick={() => props.runAction("/api/v1/rag/ingest", { title: "Console note", content: props.ragText })}><Upload size={15} />Ingest</button>
          <button className="secondary" onClick={() => props.runAction("/api/v1/rag/retrieve", { query: props.ragText })}><Search size={15} />Retrieve</button>
        </div>
      </section>
    );
  }
  if (props.activeId === "safety") {
    return (
      <section className="panel">
        <div className="panel-head"><h2>Manual pre-flight</h2><ShieldCheck size={18} /></div>
        <button onClick={() => props.runAction("/api/v1/safety-gates/run", { operationType: "sql_query", connectorId: "connector_pg_reporting", requiredPermission: "query:execute", sql: "SELECT urun_adi, segment FROM risk_izleme LIMIT 5" })}>
          <ListChecks size={15} />Run Safety Gates
        </button>
      </section>
    );
  }
  if (props.activeId === "approvals") {
    return (
      <section className="panel">
        <div className="panel-head"><h2>Risky action draft</h2><Workflow size={18} /></div>
        <button onClick={() => props.runAction("/api/v1/actions", { type: "jira_ticket", riskLevel: "high", payload: { title: "Investigate marketplace credit drop" } })}>
          <AlertTriangle size={15} />Request approval
        </button>
      </section>
    );
  }
  if (props.activeId === "alerts") {
    return (
      <section className="panel">
        <div className="panel-head"><h2>Metric check</h2><Radar size={18} /></div>
        <button onClick={() => props.runAction("/api/v1/sentry/run", { metricKey: "marketplace_credit_volume", currentValue: 72, baselineValue: 100 })}>
          <Bell size={15} />Run anomaly check
        </button>
      </section>
    );
  }
  if (props.activeId === "market") {
    return (
      <section className="panel">
        <div className="panel-head"><h2>Governed source</h2><Flag size={18} /></div>
        <div className="button-row">
          <button onClick={() => props.runAction("/api/v1/market-intelligence/sources/source_competitor_rates/ingest")}><Play size={15} />Ingest</button>
          <button className="secondary" onClick={() => props.runAction("/api/v1/market-intelligence/comparison", undefined, "GET")}><Layers3 size={15} />Compare</button>
        </div>
      </section>
    );
  }
  if (props.activeId === "simulation") {
    return (
      <section className="panel">
        <div className="panel-head"><h2>What-if scenario</h2><GitBranch size={18} /></div>
        <label>
          Proposed rate
          <input value={props.simulationRate} onChange={(event) => props.setSimulationRate(event.target.value)} />
        </label>
        <button onClick={() => props.runAction("/api/v1/simulation/what-if", { scenarioId: "simulation_interest_rate_impact", parameters: { proposedRate: Number(props.simulationRate) } })}>
          <Play size={15} />Run simulation
        </button>
      </section>
    );
  }
  if (props.activeId === "connectors") {
    return (
      <section className="panel">
        <div className="panel-head"><h2>Connector diagnostics</h2><Database size={18} /></div>
        <div className="button-row">
          <button onClick={() => props.runAction("/api/v1/connectors/connector_pg_reporting/test")}><CheckCircle2 size={15} />Test</button>
          <button className="secondary" onClick={() => props.runAction("/api/v1/connectors/connector_pg_reporting/health", undefined, "GET")}><Activity size={15} />Health</button>
        </div>
      </section>
    );
  }
  return (
    <section className="panel">
      <div className="panel-head"><h2>Operations</h2><Settings size={18} /></div>
      <p className="muted">Use the refresh control to load this tenant-scoped resource.</p>
    </section>
  );
}

function StatusPill({ status }: { status: ApiState }) {
  const label = status === "loading" ? "Loading" : status === "error" ? "Needs attention" : status === "ready" ? "Connected" : "Idle";
  return <span className={`status ${status}`}>{label}</span>;
}
