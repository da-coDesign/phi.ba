const { useState, useEffect, useRef, useMemo } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "brandName": "phi.ba",
  "tenantName": "Fibabanka",
  "primaryColor": "#9FD8C0",
  "primaryTextOn": "#0E1F1A",
  "density": "comfortable",
  "showSqlByDefault": true
} /*EDITMODE-END*/;

const STORAGE_KEYS = {
  boards: "phi.ba.board-items.v2",
  source: "phi.ba.selected-source.v1"
};

const DATA_SOURCES = [
  { label: "FBCAPRD", connectorId: "connector_pg_reporting", mode: "core synthetic" },
  { label: "FBDWHPRD", connectorId: "connector_pg_reporting", mode: "synthetic banking demo" },
  { label: "FBDWH", connectorId: "connector_pg_reporting", mode: "warehouse synthetic" },
  { label: "FBDWHPRD_CDO", connectorId: "connector_pg_reporting", mode: "cdo synthetic" }
];
const DEFAULT_DATA_SOURCE = "FBDWHPRD";
const OPENAI_KEY_STORAGE = "phi.ba.openai-api-key.v1";
const API_BASE = window.PHI_BA_API_BASE_URL || (window.location.hostname === "localhost" ? "http://localhost:4000" : window.location.origin);
function buildApiHeaders() {
  const headers = {
    "content-type": "application/json",
    authorization: "Bearer dev-admin-token",
    "x-tenant-id": "tenant_fibabanka"
  };
  const openAiApiKey = window.localStorage.getItem(OPENAI_KEY_STORAGE);
  if (openAiApiKey) headers["x-openai-api-key"] = openAiApiKey;
  return headers;
}
const DEFAULT_AGENT_ID = "agent_risk";

const SAMPLE_PROMPTS = [
  "Son 30 günde işlem hacmine göre en çok kullanılan 10 segment",
  "Bu çeyrekte en yüksek NPL oranına sahip ürünler hangileri?",
  "18 Nisan'da kart onay oranı neden düştü?",
  "Mobil bankacılıktan gelen müşterilerin 90 günlük tutunması"
];

const ACTION_DEFS = {
  jira: {
    id: "jira",
    label: "Jira ticket",
    shortLabel: "Jira",
    icon: "ticket",
    submitLabel: "Jira taslağı oluştur"
  },
  email: {
    id: "email",
    label: "Email campaign",
    shortLabel: "Email",
    icon: "mail",
    submitLabel: "Kampanya taslağı oluştur"
  },
  deck: {
    id: "deck",
    label: "Presentation / Deck",
    shortLabel: "Deck",
    icon: "deck",
    submitLabel: "Sunum iskeleti oluştur"
  }
};

const ACTION_FORM_FIELDS = {
  jira: [
    { key: "ticketTitle", label: "Ticket başlığı" },
    {
      key: "severity",
      label: "Öncelik",
      type: "select",
      options: ["Low", "Medium", "High", "Critical"]
    },
    { key: "owner", label: "Sahip ekip" },
    { key: "summary", label: "Özet", multiline: true, rows: 4 },
    { key: "evidence", label: "Kanıt", multiline: true, rows: 4 },
    { key: "nextStep", label: "Önerilen sonraki adım", multiline: true, rows: 3 }
  ],
  email: [
    { key: "campaignName", label: "Kampanya adı" },
    { key: "audience", label: "Hedef kitle" },
    { key: "goal", label: "Kampanya hedefi" },
    {
      key: "channel",
      label: "Kanal",
      type: "select",
      options: ["Email", "Email + Push", "Email + In-app"]
    },
    { key: "cta", label: "CTA" },
    { key: "message", label: "Mesaj açısı", multiline: true, rows: 5 }
  ],
  deck: [
    { key: "deckTitle", label: "Sunum başlığı" },
    { key: "audience", label: "Hedef dinleyici" },
    { key: "objective", label: "Sunum amacı", multiline: true, rows: 3 },
    { key: "slide1", label: "Slayt 1", multiline: true, rows: 3 },
    { key: "slide2", label: "Slayt 2", multiline: true, rows: 3 },
    { key: "slide3", label: "Slayt 3", multiline: true, rows: 3 }
  ]
};

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sumNumericColumn(rows, columnIndex) {
  return rows.reduce((total, row) => total + (Number(row[columnIndex]) || 0), 0);
}

function formatMetric(value, type) {
  if (value == null) return "—";
  if (type === "currency") {
    if (Math.abs(value) >= 1e6) {
      return "₺" + (value / 1e6).toFixed(1).replace(".", ",") + " Mn";
    }
    if (Math.abs(value) >= 1e3) {
      return "₺" + (value / 1e3).toFixed(1).replace(".", ",") + " B";
    }
    return "₺" + Math.round(value).toLocaleString("tr-TR");
  }
  if (type === "percent" || type === "delta") {
    const signed = type === "delta" && value > 0 ? "+" : "";
    return `${signed}${Number(value).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  }
  if (type === "count") {
    return Math.round(value).toLocaleString("tr-TR");
  }
  return String(value);
}

function formatDateTime(value) {
  try {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  } catch (error) {
    return value;
  }
}

function formatRelativeTime(value) {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMin = Math.max(1, Math.round(diffMs / 60000));
  if (diffMin < 60) return `${diffMin} dk önce`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `${diffHours} sa önce`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} gün önce`;
}

function removeMarkdown(value) {
  return String(value || "").replace(/\*\*/g, "");
}

function getMetricColumnIndex(columns) {
  for (let i = columns.length - 1; i >= 0; i -= 1) {
    const type = columns[i].type;
    if (type === "currency" || type === "count" || type === "percent") {
      return i;
    }
  }
  return columns.length - 1;
}

function buildAgentResult(question, answer, finalPayload) {
  const serverResult = finalPayload && finalPayload.result;
  if (serverResult) {
    const rows = Array.isArray(serverResult.rows) ? serverResult.rows : [];
    const columns = Array.isArray(serverResult.columns) ? serverResult.columns : [];
    const mode = serverResult.mode || (rows.length ? "data_card" : "text");
    const agentAnswer = String(finalPayload.response || serverResult.answer || answer || "");
    return {
      mode,
      question,
      intro: agentAnswer || "Agent yanıtı tamamlandı.",
      sql: serverResult.sql || "",
      tables: serverResult.tables || inferTablesFromSql(serverResult.sql || ""),
      columns,
      rows,
      stats: Array.isArray(serverResult.stats) && serverResult.stats.length ? serverResult.stats : buildStatsFromServerRows(rows, columns),
      insight: agentAnswer,
      agentAnswer,
      citations: serverResult.citations || [],
      toolCalls: serverResult.toolCalls || [],
      approvalRequestId: serverResult.approvalRequestId || "",
      category: serverResult.category || inferResultCategory(question, serverResult),
      recommendedAction: serverResult.recommendedAction || inferRecommendedAction(question, serverResult),
      boardable: serverResult.boardable !== false && rows.length > 0,
      latencyMs: Math.max(120, Math.min(1800, String(answer || "").length * 3)),
      traceId: finalPayload.traceId || serverResult.traceId || "",
      audience: serverResult.audience || "Veri ve karar ekipleri",
      generatedAt: new Date().toISOString()
    };
  }
  return {
    mode: "text",
    question,
    columns: [],
    rows: [],
    stats: [],
    sql: "",
    tables: [],
    intro: answer || "Agent yanıtı tamamlandı ancak server sonucu dönmedi.",
    insight: answer || "",
    agentAnswer: answer,
    citations: [],
    toolCalls: [],
    approvalRequestId: "",
    category: "reporting",
    recommendedAction: "deck",
    boardable: false,
    latencyMs: Math.max(120, Math.min(1800, answer.length * 3)),
    traceId: "",
    audience: "Veri ve karar ekipleri",
    generatedAt: new Date().toISOString()
  };
}

function compactText(value, limit = 1200) {
  const text = String(value || "").trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function buildConversationContext(messages) {
  return messages
    .filter((message) => message.status === "done" && message.result)
    .slice(-4)
    .map((message) => {
      const result = message.result;
      const columns = Array.isArray(result.columns) ? result.columns : [];
      const rows = Array.isArray(result.rows) ? result.rows : [];
      const stats = Array.isArray(result.stats) ? result.stats : [];
      return {
        question: compactText(message.text, 500),
        answer: compactText(result.agentAnswer || result.intro || result.insight, 1200),
        mode: result.mode || "text",
        sql: compactText(result.sql || "", 1200),
        tables: Array.isArray(result.tables) ? result.tables.slice(0, 5) : [],
        columns: columns.slice(0, 12).map((column) => ({
          key: column.key || column.label,
          label: column.label,
          type: column.type
        })),
        rows: rows.slice(0, 10).map((row) => Array.isArray(row) ? row.slice(0, 12) : row),
        stats: stats.slice(0, 6).map((stat) => ({
          label: stat.label,
          type: stat.type,
          value: stat.value
        }))
      };
    });
}

function inferResultCategory(question, result) {
  const text = `${question} ${result?.toolKey || ""}`.toLocaleLowerCase("tr-TR");
  if (/npl|risk|onay|approval|düştü|dustu|fraud|şikayet|sikayet|tahsilat|jira/.test(text)) return "ops";
  if (/kampanya|campaign|retention|tutunma|mobil/.test(text)) return "growth";
  return "reporting";
}

function inferRecommendedAction(question, result) {
  const category = inferResultCategory(question, result);
  if (category === "ops") return "jira";
  if (category === "growth") return "email";
  return "deck";
}

function inferTablesFromSql(sql) {
  const tables = [];
  String(sql || "").replace(/\b(?:FROM|JOIN)\s+([a-zA-Z0-9_]+)/g, (_match, table) => {
    if (!tables.includes(table)) tables.push(table);
    return _match;
  });
  return tables;
}

function buildStatsFromServerRows(rows, columns) {
  if (!rows.length || !columns.length) return [];
  return columns
    .map((column, index) => ({ column, index }))
    .filter(({ column, index }) => column.type !== "text" && rows.some((row) => typeof row[index] === "number"))
    .slice(0, 3)
    .map(({ column, index }) => ({
      label: column.label,
      type: column.type,
      value: rows.reduce((total, row) => total + (Number(row[index]) || 0), 0)
    }));
}

async function streamAgentAnswer(question, source, onEvent, conversationContext = []) {
  const selectedSource = DATA_SOURCES.find((item) => item.label === source) || DATA_SOURCES.find((item) => item.label === DEFAULT_DATA_SOURCE) || DATA_SOURCES[0];
  const response = await fetch(`${API_BASE}/api/v1/agents/${DEFAULT_AGENT_ID}/stream`, {
    method: "POST",
    headers: buildApiHeaders(),
    body: JSON.stringify({ message: question, connectorId: selectedSource.connectorId, dataSource: selectedSource.label, conversationContext })
  });
  if (!response.ok || !response.body) throw new Error(`Agent stream failed (${response.status})`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalPayload = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() || "";
    for (const frame of frames) {
      const parsed = parseSseFrame(frame);
      if (!parsed) continue;
      if (parsed.event === "token") onEvent({ type: "token", token: String(parsed.data.token || "") });
      if (parsed.event === "sql_delta") onEvent({ type: "sql_delta", token: String(parsed.data.token || "") });
      if (parsed.event === "sql_done") onEvent({ type: "sql_done", sql: String(parsed.data.sql || "") });
      if (parsed.event === "progress") onEvent({ type: "progress", message: String(parsed.data.message || "") });
      if (parsed.event === "tool") onEvent({ type: "tool", message: `${parsed.data.toolKey || "tool"} tamamlandı`, data: parsed.data });
      if (parsed.event === "done") finalPayload = parsed.data;
      if (parsed.event === "error") throw new Error(parsed.data.message || "Agent stream failed");
    }
  }

  return finalPayload;
}

async function fetchRuntimeStatus() {
  const response = await fetch(`${API_BASE}/api/v1/runtime/status`, {
    method: "GET",
    headers: buildApiHeaders()
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return payload.data || null;
}

function parseSseFrame(frame) {
  const lines = frame.split("\n");
  const eventLine = lines.find((line) => line.startsWith("event:"));
  const dataLine = lines.find((line) => line.startsWith("data:"));
  if (!dataLine) return null;
  return {
    event: eventLine ? eventLine.slice("event:".length).trim() : "message",
    data: JSON.parse(dataLine.slice("data:".length).trim())
  };
}

function buildActionDraft(item, actionType) {
  const result = item.result;
  const plainInsight = removeMarkdown(result.insight);
  const lead = result.rows[0];
  const statLine = result.stats.map((stat) => `${stat.label}: ${formatMetric(stat.value, stat.type)}`).join(" · ");

  if (actionType === "jira") {
    return {
      ticketTitle: `${lead[0]} için veri temelli inceleme`,
      severity: result.category === "ops" ? "High" : "Medium",
      owner: result.category === "ops" ? "Risk Operasyonları" : "Ürün Analitiği",
      summary: `${result.question} sorgusunda öne çıkan bulgu: ${plainInsight}`,
      evidence: `${statLine}\nSon yenileme: ${formatDateTime(item.lastRefreshedAt)}`,
      nextStep: "24 saat içinde root-cause analizi başlat, etkilenen segmenti doğrula ve aksiyon sahibini ata."
    };
  }

  if (actionType === "email") {
    return {
      campaignName: `${lead[0]} için hedefli aksiyon`,
      audience: result.audience,
      goal: result.category === "growth" ? "Tutunmayı artırmak" : "Potansiyel hacmi aktive etmek",
      channel: "Email + Push",
      cta: "Detayı incele",
      message: `${plainInsight}\n\nBu bulguya dayanarak ${lead[0]} etrafında kişiselleştirilmiş bir temas akışı önerilir. İlk mesaj veri bulgusunu sade bir dille anlatmalı, ikinci mesaj net CTA ile aksiyona çağırmalıdır.`
    };
  }

  return {
    deckTitle: `${item.title} - Yönetim özeti`,
    audience: "Birim yöneticileri ve icra komitesi",
    objective: `${plainInsight} bulgusunu karar aldıran kısa bir anlatıya dönüştürmek.`,
    slide1: `Sorun / fırsat: ${plainInsight}`,
    slide2: `Kanıt: ${statLine}`,
    slide3: `Önerilen aksiyon: ${ACTION_DEFS[result.recommendedAction].label} ve ilgili ekip koordinasyonu`
  };
}

function buildActionSummary(actionType, payload) {
  if (actionType === "jira") return `${payload.ticketTitle} taslağı oluşturuldu`;
  if (actionType === "email") return `${payload.campaignName} brief'i hazırlandı`;
  return `${payload.deckTitle} sunum iskeleti oluşturuldu`;
}

function getBoardRevision(item) {
  return (item.refreshCount || 0) + 1;
}

function getPrimaryBoardView(messages) {
  return messages.length ? "convo" : "home";
}

function readStoredBoardItems() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.boards);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && item.id && item.result && item.queryText).map((item) => ({
      ...item,
      actionHistory: Array.isArray(item.actionHistory) ? item.actionHistory : []
    }));
  } catch (error) {
    return [];
  }
}

async function refreshBoardItemData(item, source) {
  const finalPayload = await streamAgentAnswer(item.queryText, item.source || source || DEFAULT_DATA_SOURCE, () => {}, []);
  const answer = String(finalPayload?.response || "");
  const nextResult = buildAgentResult(item.queryText, answer, finalPayload);
  if (!nextResult.rows.length || !nextResult.columns.length) {
    throw new Error("Agent refresh did not return a data card");
  }
  return {
    ...item,
    result: nextResult,
    lastRefreshedAt: nextResult.generatedAt,
    refreshCount: (item.refreshCount || 0) + 1
  };
}

function getPreviewColumns(columns) {
  if (columns.length <= 3) {
    return columns.map((column, index) => ({ column, index }));
  }
  return [
    { column: columns[0], index: 0 },
    { column: columns[1], index: 1 },
    { column: columns[columns.length - 1], index: columns.length - 1 }
  ];
}

function renderCellValue(value, column, compact = false) {
  if (column.type === "currency" || column.type === "percent" || column.type === "count" || column.type === "delta") {
    return formatMetric(value, column.type);
  }
  if (column.type === "tag") {
    return <span className="cat-pill">{value}</span>;
  }
  if (compact && typeof value === "string" && value.length > 20) {
    return `${value.slice(0, 20)}…`;
  }
  return value;
}

// ---------- Icons ----------
const Icon = ({ name, size = 16, stroke = 1.6 }) => {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeLinejoin: "round"
  };

  switch (name) {
    case "menu":return <svg {...common}><path d="M3 6h18M3 12h18M3 18h18" /></svg>;
    case "sidebar":return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>;
    case "plus":return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case "search":return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>;
    case "send":return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
    case "spark":return <svg {...common}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" /></svg>;
    case "table":return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></svg>;
    case "code":return <svg {...common}><path d="M8 6l-5 6 5 6M16 6l5 6-5 6" /></svg>;
    case "chart":return <svg {...common}><path d="M3 20h18" /><path d="M6 16V9M11 16V5M16 16v-7M21 16v-4" /></svg>;
    case "thumbs-up":return <svg {...common}><path d="M7 22V11M14 6l-1 5h6a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.8 21H7V11l4-9c1.5 0 3 1 3 3v1z" /></svg>;
    case "thumbs-down":return <svg {...common}><path d="M17 2v11M10 18l1-5H5a2 2 0 0 1-2-2.3l1.2-6A2 2 0 0 1 6.2 3H17v10l-4 9c-1.5 0-3-1-3-3v-1z" /></svg>;
    case "copy":return <svg {...common}><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg>;
    case "share":return <svg {...common}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>;
    case "db":return <svg {...common}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></svg>;
    case "more":return <svg {...common}><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></svg>;
    case "ask":return <svg {...common}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /></svg>;
    case "chat":return <svg {...common}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    case "check":return <svg {...common}><path d="M5 12l5 5L20 7" /></svg>;
    case "chevron":return <svg {...common}><path d="M9 6l6 6-6 6" /></svg>;
    case "x":return <svg {...common}><path d="M6 6l12 12M18 6L6 18" /></svg>;
    case "settings":return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>;
    case "refresh":return <svg {...common}><path d="M20 4v6h-6" /><path d="M20 10a8 8 0 1 0 2 5.3" /></svg>;
    case "mail":return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>;
    case "ticket":return <svg {...common}><path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V8z" /><path d="M9 6v12" /></svg>;
    case "deck":return <svg {...common}><rect x="4" y="4" width="16" height="12" rx="2" /><path d="M8 20h8M12 16v4" /><path d="M8 9h8M8 12h5" /></svg>;
    case "bookmark":return <svg {...common}><path d="M7 4h10a1 1 0 0 1 1 1v15l-6-3-6 3V5a1 1 0 0 1 1-1z" /></svg>;
    case "clock":return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case "filter":return <svg {...common}><path d="M4 6h16M7 12h10M10 18h4" /></svg>;
    default:return null;
  }
};

// ---------- Logo ----------
const Logo = ({ name }) =>
  <div className="logo">
    <div className="logo-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="20" height="20">
        <circle cx="12" cy="12" r="10" fill="var(--brand)" />
        <circle cx="12" cy="12" r="3.2" fill="var(--ink)" />
      </svg>
    </div>
    <span className="logo-word">{name}</span>
  </div>;

// ---------- Sidebar ----------
function SidebarRail({ activeView, onExpand, onNew, onGoAsk, onGoBoards }) {
  return (
    <aside className="rail">
      <button className="rail-btn rail-logo" onClick={onExpand} title="Menüyü aç">
        <svg viewBox="0 0 24 24" width="22" height="22">
          <circle cx="12" cy="12" r="10" fill="var(--brand)" />
          <circle cx="12" cy="12" r="3.2" fill="var(--ink)" />
        </svg>
      </button>
      <button className={"rail-btn" + (activeView !== "boards" ? " is-active" : "")} onClick={onGoAsk} title="Sor">
        <Icon name="ask" size={18} />
      </button>
      <button className={"rail-btn" + (activeView === "boards" ? " is-active" : "")} onClick={onGoBoards} title="Panolar">
        <Icon name="chart" size={18} />
      </button>
      <button className="rail-btn" onClick={onNew} title="Yeni konu"><Icon name="plus" size={18} /></button>
      <button className="rail-btn" title="Ara"><Icon name="search" size={18} /></button>
      <div className="rail-spacer" />
      <button className="rail-btn" title="Veri kaynakları"><Icon name="db" size={18} /></button>
      <button className="rail-btn" title="Ayarlar"><Icon name="settings" size={16} /></button>
    </aside>
  );
}

function SidebarFull({
  activeView,
  onCollapse,
  onNew,
  onNavigate,
  onOpenBoardItem,
  brandName,
  tenantName,
  boardItems,
  activeBoardId
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <Logo name={brandName} />
        <button className="iconbtn" onClick={onCollapse} title="Daralt"><Icon name="sidebar" size={16} /></button>
      </div>

      <button className="new-thread" onClick={onNew}>
        <Icon name="plus" size={14} />
        <span>Yeni Sorgu</span>
        <kbd>⌘N</kbd>
      </button>

      <div className="search-box">
        <Icon name="search" size={14} />
        <input placeholder="Konularda ara" />
      </div>

      <div className="nav-group">
        <div className="nav-label">Çalışma alanı</div>
        <button className={"nav-item" + (activeView !== "boards" ? " active" : "")} onClick={() => onNavigate("ask")}>
          <Icon name="ask" size={14} />
          <span>Sor</span>
        </button>
        <button className={"nav-item" + (activeView === "boards" ? " active" : "")} onClick={() => onNavigate("boards")}>
          <Icon name="chart" size={14} />
          <span>Panolar</span>
          <span className="pill">{boardItems.length}</span>
        </button>
        <button className="nav-item">
          <Icon name="db" size={14} />
          <span>Veri kaynakları</span>
          <span className="pill">3</span>
        </button>
      </div>

      <div className="history">
        {boardItems.length ? (
          <>
            <div className="history-label">Panoya kaydedilenler</div>
            <div className="history-group">
              {boardItems.slice(0, 6).map((item) =>
                <button
                  key={item.id}
                  className={"history-item" + (activeBoardId === item.id ? " active" : "")}
                  onClick={() => onOpenBoardItem(item.id)}>
                  <span className="hi-dot dot-chart"><Icon name="chart" size={11} /></span>
                  <span className="hi-title">{item.title}</span>
                  <span className="hi-time">{formatRelativeTime(item.lastRefreshedAt)}</span>
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="history history-empty">
            <div className="empty-card">
              <div className="empty-icon"><Icon name="bookmark" size={14} /></div>
              <div className="empty-title">Henüz kart yok</div>
              <div className="empty-sub">Konuşmadaki bulguları panoya kaydettiğinde burada görünecek.</div>
            </div>
          </div>
        )}
      </div>

      <div className="sidebar-foot">
        <div className="tenant">
          <div className="avatar">{(tenantName || "Y")[0]}</div>
          <div className="tenant-meta">
            <div className="tenant-name">{tenantName}</div>
            <div className="tenant-sub">Database · 24 şema</div>
          </div>
          <Icon name="chevron" size={14} />
        </div>
      </div>
    </aside>
  );
}

// ---------- Ask Box ----------
function AskBox({ value, onChange, onSubmit, big, placeholder, chips, selectedSource, onSelectSource, onConfigureKey, hasOpenAiKey }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, big ? 180 : 140) + "px";
  }, [value, big]);

  return (
    <div className={"askbox" + (big ? " askbox-big" : "")}>
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder || "Verilerinle ilgili her şeyi sor…"} />

      <div className="askbox-row">
        <div className="askbox-chips">
          {(chips || DATA_SOURCES).map((source) => {
            const item = typeof source === "string" ? DATA_SOURCES.find((entry) => entry.label === source) || { label: source, mode: "" } : source;
            return (
              <button
                key={item.label}
                className={"chip" + (selectedSource === item.label ? " active" : "")}
                onClick={() => onSelectSource?.(item.label)}
                title={item.mode || item.label}>
                <Icon name="db" size={11} />
                <span>{item.label}</span>
              </button>
            );
          })}
          )}
          <button className="chip chip-add"><Icon name="plus" size={11} /></button>
        </div>
        {onConfigureKey &&
          <button
            className={"chip chip-key" + (hasOpenAiKey ? " is-set" : "")}
            onClick={onConfigureKey}
            title={hasOpenAiKey ? "OpenAI key hazır" : "OpenAI key ekle"}>
            <Icon name="settings" size={11} />
          </button>
        }
        <button className="ask-send" disabled={!value.trim()} onClick={onSubmit} title="Gönder (↵)">
          <Icon name="send" size={14} />
        </button>
      </div>
    </div>
  );
}

// ---------- Home Screen ----------
function HomeScreen({ tenantName, onAsk, selectedSource, onSelectSource, onConfigureKey, hasOpenAiKey }) {
  const [value, setValue] = useState("");

  return (
    <div className="home">
      <div className="home-glow" />
      <div className="home-inner">
        <div className="home-eyebrow">{tenantName}</div>
        <h1 className="home-title">Verine ne sormak istersin?</h1>
        <p className="home-sub">Düz Türkçe sor. SQL'i ben yazarım, üretim veri ambarında çalıştırırım, bulguyu panoya kaydeder ve aksiyona çeviririm.</p>

        <div className="home-ask">
          <AskBox
            big
            value={value}
            onChange={setValue}
            onSubmit={() => value.trim() && onAsk(value.trim())}
            selectedSource={selectedSource}
            onSelectSource={onSelectSource}
            onConfigureKey={onConfigureKey}
            hasOpenAiKey={hasOpenAiKey}
            placeholder="örn. Son 30 günde işlem hacmine göre en çok kullanılan 10 ürün" />
        </div>

        <div className="home-suggests">
          {SAMPLE_PROMPTS.map((prompt) =>
            <button key={prompt} className="suggest" onClick={() => onAsk(prompt)}>
              <Icon name="spark" size={12} />
              <span>{prompt}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Conversation pieces ----------
function ChartBars({ data }) {
  const metricIndex = getMetricColumnIndex(data.columns);
  const labelIndex = 0;
  const max = Math.max(...data.rows.map((row) => Number(row[metricIndex]) || 0), 1);
  const metricType = data.columns[metricIndex].type;

  return (
    <div className="bars">
      {data.rows.map((row, index) => {
        const pct = (Number(row[metricIndex]) || 0) / max * 100;
        return (
          <div key={index} className="bar-row">
            <div className="bar-label" title={row[labelIndex]}>{row[labelIndex]}</div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${pct}%` }} />
              <span className="bar-val">{formatMetric(row[metricIndex], metricType)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ResultBlock({ data, showSqlDefault }) {
  const [tab, setTab] = useState("chart");
  const [showSql, setShowSql] = useState(showSqlDefault);
  const hasSql = Boolean(data.sql);

  return (
    <div className="result">
      <div className="result-head">
        <div className="result-tabs">
          <button className={tab === "chart" ? "rt active" : "rt"} onClick={() => setTab("chart")}><Icon name="chart" size={12} />Grafik</button>
          <button className={tab === "table" ? "rt active" : "rt"} onClick={() => setTab("table")}><Icon name="table" size={12} />Tablo</button>
        </div>
        <div className="result-meta">
          <span className="meta-pill"><span className="dot ok" />{data.rows.length} satır · {data.latencyMs}ms</span>
          {hasSql && <button className="meta-btn" onClick={() => setShowSql((current) => !current)}>
            <Icon name="code" size={12} />
            <span>SQL'i {showSql ? "gizle" : "göster"}</span>
          </button>}
          <button className="meta-btn"><Icon name="share" size={12} /></button>
        </div>
      </div>

      {hasSql && showSql &&
        <div className="sql-block">
          <div className="sql-head">
            <span className="sql-label">Üretilen SQL · postgres</span>
            <div className="sql-actions">
              {data.tables.map((table) => <span key={table} className="table-pill"><Icon name="db" size={10} />{table}</span>)}
              <button className="meta-btn"><Icon name="copy" size={11} /></button>
            </div>
          </div>
          <pre className="sql"><code>{highlightSql(data.sql)}</code></pre>
        </div>
      }

      <div className="result-body">
        {tab === "chart" ? (
          <ChartBars data={data} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {data.columns.map((column, index) =>
                    <th key={column.label + index} className={column.align === "right" ? "num" : ""}>{column.label}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, rowIndex) =>
                  <tr key={rowIndex}>
                    {data.columns.map((column, cellIndex) =>
                      <td key={column.label + cellIndex} className={column.align === "right" ? "num mono" : ""}>
                        {renderCellValue(row[cellIndex], column)}
                      </td>
                    )}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="result-foot">
        <div className="insight">
          <Icon name="spark" size={12} />
          <span>{data.insight.split("**").map((segment, index) => index % 2 ? <b key={index}>{segment}</b> : segment)}</span>
        </div>
      </div>
    </div>
  );
}

function highlightSql(sql) {
  const kw = /\b(SELECT|FROM|JOIN|ON|WHERE|AND|OR|GROUP BY|ORDER BY|LIMIT|AS|SUM|NOW|INTERVAL|DESC|ASC)\b/g;
  const parts = [];
  let lastIdx = 0;
  let match;
  let key = 0;

  while ((match = kw.exec(sql)) !== null) {
    if (match.index > lastIdx) parts.push(sql.slice(lastIdx, match.index));
    parts.push(<span key={key += 1} className="sql-kw">{match[0]}</span>);
    lastIdx = match.index + match[0].length;
  }

  parts.push(sql.slice(lastIdx));
  return parts;
}

function UserBubble({ text }) {
  return (
    <div className="msg msg-user">
      <div className="bubble bubble-user">{text}</div>
    </div>
  );
}

function AgentMessage({ message, showSqlDefault, onSaveToBoard, onOpenBoards }) {
  const saved = message.savedToBoard;
  const saveLabel = saved ? "Panoda" : "Panoya ekle";
  const answer = message.result.agentAnswer;
  const hasDataCard = Array.isArray(message.result.rows) && message.result.rows.length > 0 && Array.isArray(message.result.columns) && message.result.columns.length > 0;
  const canSave = hasDataCard && message.result.boardable !== false;

  return (
    <div className="msg msg-agent">
      <div className="agent-avatar">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <circle cx="12" cy="12" r="10" fill="var(--brand)" />
          <circle cx="12" cy="12" r="3.2" fill="var(--ink)" />
        </svg>
      </div>
      <div className="agent-body">
        <div className={answer ? "agent-intro agent-live-answer" : "agent-intro"}>
          {message.result.intro.split("`").map((segment, index) => index % 2 ? <code key={index}>{segment}</code> : segment)}
        </div>
        {hasDataCard ? (
          <ResultBlock data={message.result} showSqlDefault={showSqlDefault} />
        ) : (
          <AgentModeCard result={message.result} />
        )}
        <div className="msg-actions">
          <button className="msg-act"><Icon name="thumbs-up" size={13} /></button>
          <button className="msg-act"><Icon name="thumbs-down" size={13} /></button>
          <button className="msg-act"><Icon name="copy" size={13} /></button>
          <button className="msg-act"><Icon name="share" size={13} /></button>
          {canSave && <>
            <span className="sep" />
            <button
              className={"msg-act msg-act-ghost" + (saved ? " is-saved" : "")}
              onClick={() => saved ? onOpenBoards() : onSaveToBoard(message.id)}>
              <Icon name={saved ? "check" : "plus"} size={13} />
              {saveLabel}
            </button>
          </>}
        </div>
      </div>
    </div>
  );
}

function AgentModeCard({ result }) {
  const toolCalls = Array.isArray(result.toolCalls) ? result.toolCalls : [];
  const citations = Array.isArray(result.citations) ? result.citations : [];
  const modeLabel = {
    text: "Yanıt",
    clarification: "Netleştirme",
    approval: "Onay bekliyor",
    market: "Pazar karşılaştırması",
    simulation: "Simülasyon"
  }[result.mode] || "Agent yanıtı";

  return (
    <div className={"agent-mode-card is-" + (result.mode || "text")}>
      <div className="agent-mode-head">
        <span className="agent-mode-pill">{modeLabel}</span>
        {result.approvalRequestId && <span className="agent-mode-id">{result.approvalRequestId}</span>}
      </div>
      {toolCalls.length > 0 &&
        <div className="tool-step-list">
          {toolCalls.map((call, index) =>
            <span key={index}><Icon name="check" size={11} />{call.toolKey || "tool"} · {call.status || "completed"}</span>
          )}
        </div>
      }
      {citations.length > 0 &&
        <div className="citation-list">
          {citations.slice(0, 3).map((citation, index) =>
            <div key={citation.id || index} className="citation-item">
              <strong>Kaynak {index + 1}</strong>
              <span>{citation.excerpt || citation.documentId || "Governed evidence"}</span>
            </div>
          )}
        </div>
      }
    </div>
  );
}

function ThinkingMessage({ content }) {
  return (
    <div className="msg msg-agent">
      <div className="agent-avatar">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <circle cx="12" cy="12" r="10" fill="var(--brand)" />
          <circle cx="12" cy="12" r="3.2" fill="var(--ink)" />
        </svg>
      </div>
      <div className="agent-body">
        <div className="thinking-card">
          <div className="thinking-pill">
            <span className="dot live" />
            <span>{content ? "Yanıtlıyor" : "Düşünüyor"}</span>
          </div>
          {content ? (
            <div className="streaming-answer">{content}</div>
          ) : (
            <>
              <div className="thinking-title">Canlı agent bağlantısı kuruluyor</div>
              <div className="thinking-sub">SSE akışı açılıyor; SQL, araç ve yanıt adımları backend'den geldikçe burada görünecek.</div>
              <div className="thinking-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Conversation Screen ----------
function ConversationScreen({ messages, onAsk, onSaveToBoard, onOpenBoards, boardCount, showSqlDefault, selectedSource, onSelectSource, onConfigureKey, hasOpenAiKey }) {
  const [value, setValue] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const first = messages[0];
  const title = first ? first.text : "Yeni konu";

  return (
    <div className="convo">
      <div className="convo-head">
        <div className="convo-title-wrap">
          <div className="convo-crumbs"><span>Sor</span><Icon name="chevron" size={11} /><span className="muted">Konu</span></div>
          <div className="convo-title">{title}</div>
        </div>
        <div className="convo-actions">
          <button className="ghost-btn" onClick={onOpenBoards}><Icon name="chart" size={13} />Panolar {boardCount ? `(${boardCount})` : ""}</button>
          <button className="ghost-btn"><Icon name="share" size={13} />Paylaş</button>
          <button className="iconbtn"><Icon name="more" size={14} /></button>
        </div>
      </div>

      <div className="convo-scroll" ref={scrollRef}>
        <div className="convo-inner">
          {messages.map((message) =>
            <React.Fragment key={message.id}>
              <UserBubble text={message.text} />
              {message.status === "done" && message.result ? (
                <AgentMessage
                  message={message}
                  showSqlDefault={showSqlDefault}
                  onSaveToBoard={onSaveToBoard}
                  onOpenBoards={onOpenBoards} />
              ) : (
                <ThinkingMessage content={message.streamText} />
              )}
            </React.Fragment>
          )}
        </div>
      </div>

      <div className="convo-composer">
        <div className="composer-inner">
          <AskBox
            value={value}
            onChange={setValue}
            onSubmit={() => {
              if (!value.trim()) return;
              onAsk(value.trim());
              setValue("");
            }}
            selectedSource={selectedSource}
            onSelectSource={onSelectSource}
            onConfigureKey={onConfigureKey}
            hasOpenAiKey={hasOpenAiKey}
            placeholder="Devam sorusu sor… (örn. bunu haftalık olarak ayır)" />

          <div className="composer-foot">
            <span>Göndermek için ↵ · Yeni satır için ⇧↵ · Panoya ekle ile canlı karta dönüştür</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Boards ----------
function BoardStats({ stats }) {
  return (
    <div className="board-stats">
      {stats.map((stat) =>
        <div key={stat.label} className="board-stat">
          <span className="board-stat-label">{stat.label}</span>
          <strong className={stat.type === "delta" ? "board-stat-value is-delta" : "board-stat-value"}>{formatMetric(stat.value, stat.type)}</strong>
        </div>
      )}
    </div>
  );
}

function BoardTablePreview({ result }) {
  const previewColumns = getPreviewColumns(result.columns);
  return (
    <div className="board-table-wrap">
      <table className="board-table">
        <thead>
          <tr>
            {previewColumns.map(({ column, index }) =>
              <th key={column.label + index} className={column.align === "right" ? "num" : ""}>{column.label}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {result.rows.slice(0, 4).map((row, rowIndex) =>
            <tr key={rowIndex}>
              {previewColumns.map(({ column, index }) =>
                <td key={column.label + index} className={column.align === "right" ? "num mono" : ""}>
                  {renderCellValue(row[index], column, true)}
                </td>
              )}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function BoardCard({ item, onOpen, onRefresh, onOpenAction }) {
  const recommendation = ACTION_DEFS[item.result.recommendedAction];
  const lastAction = item.actionHistory[0];

  return (
    <article className="board-card" onClick={() => onOpen(item.id)}>
      <div className="board-card-head">
        <div>
          <div className="board-card-kicker">
            <span className="board-live-pill"><span className="dot live" />Canlı kart</span>
            <span className={"board-action-pill is-" + recommendation.id}><Icon name={recommendation.icon} size={11} />{recommendation.shortLabel}</span>
          </div>
          <h3 className="board-card-title">{item.title}</h3>
        </div>
        <button
          className="iconbtn"
          title="Kartı yenile"
          onClick={(event) => {
            event.stopPropagation();
            onRefresh(item.id);
          }}>
          <Icon name="refresh" size={14} />
        </button>
      </div>

      <p className="board-card-copy">{removeMarkdown(item.result.insight)}</p>

      <BoardStats stats={item.result.stats} />
      <BoardTablePreview result={item.result} />

      <div className="board-card-foot">
        {Object.keys(ACTION_DEFS).map((actionType) => {
          const action = ACTION_DEFS[actionType];
          return (
            <button
              key={actionType}
              className={"action-chip" + (item.result.recommendedAction === actionType ? " is-primary" : "")}
              onClick={(event) => {
                event.stopPropagation();
                onOpenAction(item.id, actionType);
              }}>
              <Icon name={action.icon} size={12} />
              <span>{action.shortLabel}</span>
            </button>
          );
        })}
      </div>

      <div className="board-card-meta">
        <span><Icon name="clock" size={11} />{formatRelativeTime(item.lastRefreshedAt)}</span>
        <span><Icon name="bookmark" size={11} />rev {getBoardRevision(item)}</span>
      </div>

      {lastAction &&
        <div className="board-card-log">
          <Icon name="check" size={12} />
          <span>{lastAction.summary}</span>
        </div>
      }
    </article>
  );
}

function BoardsScreen({ items, notice, onGoAsk, onRefreshAll, onRefreshItem, onOpenItem, onOpenAction }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch = search.trim()
        ? `${item.title} ${item.queryText} ${removeMarkdown(item.result.insight)}`.toLowerCase().includes(search.trim().toLowerCase())
        : true;
      const matchesFilter = filter === "all" ? true : item.result.recommendedAction === filter;
      return matchesSearch && matchesFilter;
    });
  }, [filter, items, search]);

  return (
    <div className="boards">
      <div className="boards-head">
        <div>
          <div className="boards-eyebrow">Panolar</div>
          <h1 className="boards-title">Karar kartları galerisi</h1>
          <p className="boards-sub">Panoya eklenen her bulgu burada canlı kart olarak tutulur. Kartın içindeki küçük tablo statik kimliğini korur, veri ise yenilendikçe değişir.</p>
        </div>
        <div className="boards-head-tools">
          <div className="board-search">
            <Icon name="search" size={14} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Kart, sorgu ya da insight ara" />
          </div>
          <button className="ghost-btn" onClick={onRefreshAll}><Icon name="refresh" size={13} />Tümünü yenile</button>
        </div>
      </div>

      <div className="board-filter-row">
        <span className="board-filter-label"><Icon name="filter" size={12} />Aksiyon odağı</span>
        {[{ id: "all", label: "Tümü" }, { id: "jira", label: "Jira" }, { id: "email", label: "Email" }, { id: "deck", label: "Deck" }].map((option) =>
          <button
            key={option.id}
            className={"filter-chip" + (filter === option.id ? " active" : "")}
            onClick={() => setFilter(option.id)}>
            {option.label}
          </button>
        )}
      </div>

      {notice && <div className="board-notice"><Icon name="check" size={13} />{notice}</div>}

      {!items.length ? (
        <div className="board-empty">
          <div className="empty-card">
            <div className="empty-icon"><Icon name="bookmark" size={14} /></div>
            <div className="empty-title">Henüz panoya eklenmiş kart yok</div>
            <div className="empty-sub">Konuşma ekranındaki `Panoya ekle` ile ilk canlı kartını oluştur.</div>
            <button className="ghost-btn board-empty-cta" onClick={onGoAsk}><Icon name="ask" size={13} />Veri sormaya dön</button>
          </div>
        </div>
      ) : !filteredItems.length ? (
        <div className="board-empty">
          <div className="empty-card">
            <div className="empty-icon"><Icon name="search" size={14} /></div>
            <div className="empty-title">Bu filtre için kart bulunamadı</div>
            <div className="empty-sub">Arama metnini ya da aksiyon filtresini genişletmeyi dene.</div>
          </div>
        </div>
      ) : (
        <div className="board-grid">
          {filteredItems.map((item) =>
            <BoardCard
              key={item.id}
              item={item}
              onOpen={onOpenItem}
              onRefresh={onRefreshItem}
              onOpenAction={onOpenAction} />
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Drawers ----------
function DrawerShell({ title, subtitle, children, onClose }) {
  return (
    <div className="drawer-shell">
      <button className="drawer-backdrop" onClick={onClose} aria-label="Kapat" />
      <aside className="drawer-panel">
        <div className="drawer-head">
          <div>
            <div className="drawer-title">{title}</div>
            {subtitle && <div className="drawer-subtitle">{subtitle}</div>}
          </div>
          <button className="iconbtn" onClick={onClose} title="Kapat"><Icon name="x" size={15} /></button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}

function BoardDetailDrawer({ item, showSqlDefault, onClose, onRefresh, onOpenAction }) {
  return (
    <DrawerShell
      title={item.title}
      subtitle={`Son yenileme ${formatDateTime(item.lastRefreshedAt)} · ${item.result.audience}`}
      onClose={onClose}>
      <div className="drawer-toolbar">
        <span className={"board-action-pill is-" + item.result.recommendedAction}><Icon name={ACTION_DEFS[item.result.recommendedAction].icon} size={12} />{ACTION_DEFS[item.result.recommendedAction].label}</span>
        <button className="ghost-btn" onClick={() => onRefresh(item.id)}><Icon name="refresh" size={13} />Kartı yenile</button>
      </div>

      <BoardStats stats={item.result.stats} />

      <div className="drawer-action-row">
        {Object.keys(ACTION_DEFS).map((actionType) =>
          <button
            key={actionType}
            className={"action-chip" + (item.result.recommendedAction === actionType ? " is-primary" : "")}
            onClick={() => onOpenAction(item.id, actionType)}>
            <Icon name={ACTION_DEFS[actionType].icon} size={12} />
            <span>{ACTION_DEFS[actionType].label}</span>
          </button>
        )}
      </div>

      <ResultBlock data={item.result} showSqlDefault={showSqlDefault} />

      <div className="drawer-section">
        <div className="drawer-section-title">Aksiyon geçmişi</div>
        {item.actionHistory.length ? (
          <div className="activity-list">
            {item.actionHistory.map((entry) =>
              <div key={entry.id} className="activity-item">
                <div className="activity-item-head">
                  <strong>{ACTION_DEFS[entry.type].label}</strong>
                  <span>{formatDateTime(entry.createdAt)}</span>
                </div>
                <div className="activity-item-copy">{entry.summary}</div>
                <div className="activity-item-meta">{entry.detail}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="drawer-empty">Henüz bu karttan tetiklenmiş bir aksiyon yok.</div>
        )}
      </div>
    </DrawerShell>
  );
}

function ActionDrawer({ item, actionType, onClose, onSubmit }) {
  const definition = ACTION_DEFS[actionType];
  const [draft, setDraft] = useState(() => buildActionDraft(item, actionType));

  useEffect(() => {
    setDraft(buildActionDraft(item, actionType));
  }, [actionType, item]);

  return (
    <DrawerShell
      title={definition.label}
      subtitle={`${item.title} kartından aksiyon üret`}
      onClose={onClose}>
      <div className="action-hero">
        <div className="action-hero-copy">
          <span className={"board-action-pill is-" + actionType}><Icon name={definition.icon} size={12} />{definition.shortLabel}</span>
          <p>{removeMarkdown(item.result.insight)}</p>
        </div>
        <div className="action-hero-stats">
          {item.result.stats.map((stat) =>
            <div key={stat.label} className="action-hero-stat">
              <span>{stat.label}</span>
              <strong>{formatMetric(stat.value, stat.type)}</strong>
            </div>
          )}
        </div>
      </div>

      <div className="action-form">
        {ACTION_FORM_FIELDS[actionType].map((field) =>
          <label key={field.key} className="action-field">
            <span>{field.label}</span>
            {field.type === "select" ? (
              <select
                value={draft[field.key]}
                onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}>
                {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : field.multiline ? (
              <textarea
                rows={field.rows || 4}
                value={draft[field.key]}
                onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))} />
            ) : (
              <input
                value={draft[field.key]}
                onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))} />
            )}
          </label>
        )}
      </div>

      <div className="drawer-section">
        <div className="drawer-section-title">Bu aksiyonun veri temeli</div>
        <div className="drawer-empty">{item.result.stats.map((stat) => `${stat.label}: ${formatMetric(stat.value, stat.type)}`).join(" · ")}</div>
      </div>

      <div className="drawer-footer">
        <button className="ghost-btn" onClick={onClose}>Vazgeç</button>
        <button className="primary-btn" onClick={() => onSubmit(item.id, actionType, draft)}>
          <Icon name={definition.icon} size={13} />
          {definition.submitLabel}
        </button>
      </div>
    </DrawerShell>
  );
}

// ---------- Root App ----------
function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [view, setView] = useState("home");
  const [messages, setMessages] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [boardItems, setBoardItems] = useState(readStoredBoardItems);
  const [boardNotice, setBoardNotice] = useState("");
  const [drawer, setDrawer] = useState(null);
  const [selectedSource, setSelectedSource] = useState(() => window.localStorage.getItem(STORAGE_KEYS.source) || DEFAULT_DATA_SOURCE);
  const [hasOpenAiKey, setHasOpenAiKey] = useState(() => Boolean(window.localStorage.getItem(OPENAI_KEY_STORAGE)));
  const [runtimeStatus, setRuntimeStatus] = useState(null);
  const hasConfiguredOpenAiKey = hasOpenAiKey || Boolean(runtimeStatus?.hasServerOpenAiKey || runtimeStatus?.hasRequestOpenAiKey);

  useEffect(() => {
    document.documentElement.style.setProperty("--brand", tweaks.primaryColor);
    document.documentElement.style.setProperty("--brand-on", tweaks.primaryTextOn);
    document.documentElement.dataset.density = tweaks.density;
  }, [tweaks]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.boards, JSON.stringify(boardItems));
  }, [boardItems]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.source, selectedSource);
  }, [selectedSource]);

  useEffect(() => {
    let cancelled = false;
    fetchRuntimeStatus()
      .then((status) => {
        if (!cancelled) setRuntimeStatus(status);
      })
      .catch(() => {
        if (!cancelled) setRuntimeStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [hasOpenAiKey]);

  useEffect(() => {
    if (!boardNotice) return undefined;
    const timeoutId = window.setTimeout(() => setBoardNotice(""), 4200);
    return () => window.clearTimeout(timeoutId);
  }, [boardNotice]);

  useEffect(() => {
    if (drawer && !boardItems.find((item) => item.id === drawer.itemId)) {
      setDrawer(null);
    }
  }, [boardItems, drawer]);

  const ask = async (text) => {
    const id = createId("msg");
    const conversationContext = buildConversationContext(messages);
    setMessages((current) => [...current, { id, text, status: "thinking", result: null, savedToBoard: false, streamText: "" }]);
    setView("convo");
    setSidebarOpen(true);

    try {
      let streamed = "";
      let streamedSql = "";
      const steps = [];
      const renderStream = () => [
        steps.length ? steps.map((step) => `• ${step}`).join("\n") : "",
        streamedSql ? `SQL üretiliyor:\n${streamedSql}` : "",
        streamed
      ].filter(Boolean).join("\n\n");
      const finalPayload = await streamAgentAnswer(text, selectedSource, (event) => {
        if (event.type === "token") streamed += event.token;
        if (event.type === "sql_delta") streamedSql += event.token;
        if (event.type === "sql_done") {
          streamedSql = event.sql || streamedSql;
          steps.push("SQL güvenlik kontrolünden geçiriliyor");
        }
        if ((event.type === "progress" || event.type === "tool") && event.message) steps.push(event.message);
        setMessages((current) =>
          current.map((message) => message.id === id ? { ...message, streamText: renderStream() } : message)
        );
      }, conversationContext);
      const answer = String(finalPayload?.response || streamed || "");
      setMessages((current) =>
        current.map((message) =>
          message.id === id ? { ...message, status: "done", result: buildAgentResult(text, answer, finalPayload), streamText: "" } : message
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent stream unavailable";
      setMessages((current) =>
        current.map((item) =>
          item.id === id ? {
            ...item,
            status: "done",
            streamText: "",
            result: {
              mode: "text",
              question: text,
              intro: `Canlı agent bağlantısı kurulamadı: ${message}`,
              insight: "",
              agentAnswer: "",
              columns: [],
              rows: [],
              stats: [],
              sql: "",
              tables: [],
              citations: [],
              toolCalls: [],
              boardable: false,
              latencyMs: 0,
              generatedAt: new Date().toISOString()
            }
          } : item
        )
      );
    }
  };

  const configureOpenAiKey = () => {
    const existing = window.localStorage.getItem(OPENAI_KEY_STORAGE) || "";
    const next = window.prompt("OpenAI API key", existing ? "••••" + existing.slice(-8) : "");
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed) {
      window.localStorage.removeItem(OPENAI_KEY_STORAGE);
      setHasOpenAiKey(false);
      return;
    }
    if (trimmed.startsWith("••••") && existing) return;
    window.localStorage.setItem(OPENAI_KEY_STORAGE, trimmed);
    setHasOpenAiKey(true);
  };

  const newThread = () => {
    setMessages([]);
    setView("home");
    setDrawer(null);
  };

  const navigate = (target) => {
    if (target === "boards") {
      setView("boards");
      setSidebarOpen(true);
      return;
    }
    setView(getPrimaryBoardView(messages));
    setDrawer(null);
  };

  const openBoards = () => {
    setView("boards");
    setSidebarOpen(true);
  };

  const saveMessageToBoard = (messageId) => {
    const target = messages.find((message) => message.id === messageId);
    if (!target || target.status !== "done" || !target.result) return;

    const existing = boardItems.find((item) => item.sourceMessageId === messageId);
    if (existing) {
      openBoards();
      setDrawer({ kind: "detail", itemId: existing.id });
      return;
    }

    const boardItem = {
      id: createId("board"),
      sourceMessageId: target.id,
      title: target.text,
      queryText: target.text,
      source: selectedSource,
      result: target.result,
      savedAt: new Date().toISOString(),
      lastRefreshedAt: target.result.generatedAt,
      refreshCount: 0,
      actionHistory: []
    };

    setBoardItems((current) => [boardItem, ...current]);
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, savedToBoard: true } : message));
    setBoardNotice("Kart panoya eklendi. Artık Panolar içinde canlı olarak izlenebilir.");
  };

  const refreshBoardItem = async (itemId) => {
    const target = boardItems.find((item) => item.id === itemId);
    if (!target) return;
    setBoardNotice("Kart canlı agent üzerinden yenileniyor.");
    try {
      const nextItem = await refreshBoardItemData(target, selectedSource);
      setBoardItems((current) => current.map((item) => item.id === itemId ? nextItem : item));
      setBoardNotice("Kart canlı agent sonucu ile yenilendi.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent refresh unavailable";
      setBoardNotice(`Kart yenilenemedi: ${message}`);
    }
  };

  const refreshAllBoards = async () => {
    if (!boardItems.length) return;
    setBoardNotice("Panodaki kartlar canlı agent üzerinden yenileniyor.");
    const refreshedItems = [];
    let failed = 0;
    for (const item of boardItems) {
      try {
        refreshedItems.push(await refreshBoardItemData(item, selectedSource));
      } catch {
        failed += 1;
        refreshedItems.push(item);
      }
    }
    setBoardItems(refreshedItems);
    setBoardNotice(failed ? `${failed} kart yenilenemedi; diğerleri canlı agent sonucu ile güncellendi.` : "Panodaki tüm kartlar canlı agent sonucu ile yenilendi.");
  };

  const openBoardItem = (itemId) => {
    openBoards();
    setDrawer({ kind: "detail", itemId });
  };

  const openBoardAction = (itemId, actionType) => {
    openBoards();
    setDrawer({ kind: "action", itemId, actionType });
  };

  const submitBoardAction = (itemId, actionType, payload) => {
    const summary = buildActionSummary(actionType, payload);
    const detail = actionType === "jira"
      ? `${payload.owner} · ${payload.severity}`
      : actionType === "email"
      ? `${payload.channel} · ${payload.goal}`
      : payload.audience;

    setBoardItems((current) =>
      current.map((item) => item.id === itemId ? {
        ...item,
        actionHistory: [{
          id: createId("action"),
          type: actionType,
          status: "completed",
          payload,
          createdAt: new Date().toISOString(),
          summary,
          detail
        }, ...item.actionHistory]
      } : item)
    );

    setBoardNotice(summary);
    setDrawer({ kind: "detail", itemId });
  };

  const activeDrawerItem = drawer ? boardItems.find((item) => item.id === drawer.itemId) : null;

  return (
    <div className="app">
      {sidebarOpen ? (
        <SidebarFull
          activeView={view}
          onCollapse={() => setSidebarOpen(false)}
          onNew={newThread}
          onNavigate={navigate}
          onOpenBoardItem={openBoardItem}
          brandName={tweaks.brandName}
          tenantName={tweaks.tenantName}
          boardItems={boardItems}
          activeBoardId={activeDrawerItem?.id} />
      ) : (
        <SidebarRail
          activeView={view}
          onExpand={() => setSidebarOpen(true)}
          onNew={newThread}
          onGoAsk={() => navigate("ask")}
          onGoBoards={openBoards} />
      )}

      <main className="main">
        {view === "home" &&
          <HomeScreen
            tenantName={tweaks.tenantName}
            onAsk={ask}
            selectedSource={selectedSource}
            onSelectSource={setSelectedSource}
            onConfigureKey={configureOpenAiKey}
            hasOpenAiKey={hasConfiguredOpenAiKey} />}
        {view === "convo" &&
          <ConversationScreen
            messages={messages}
            onAsk={ask}
            onSaveToBoard={saveMessageToBoard}
            onOpenBoards={openBoards}
            boardCount={boardItems.length}
            selectedSource={selectedSource}
            onSelectSource={setSelectedSource}
            onConfigureKey={configureOpenAiKey}
            hasOpenAiKey={hasConfiguredOpenAiKey}
            showSqlDefault={tweaks.showSqlByDefault} />
        }
        {view === "boards" &&
          <BoardsScreen
            items={boardItems}
            notice={boardNotice}
            onGoAsk={() => navigate("ask")}
            onRefreshAll={refreshAllBoards}
            onRefreshItem={refreshBoardItem}
            onOpenItem={openBoardItem}
            onOpenAction={openBoardAction} />
        }
      </main>

      {drawer?.kind === "detail" && activeDrawerItem &&
        <BoardDetailDrawer
          item={activeDrawerItem}
          showSqlDefault={tweaks.showSqlByDefault}
          onClose={() => setDrawer(null)}
          onRefresh={refreshBoardItem}
          onOpenAction={openBoardAction} />
      }

      {drawer?.kind === "action" && activeDrawerItem &&
        <ActionDrawer
          item={activeDrawerItem}
          actionType={drawer.actionType}
          onClose={() => setDrawer(null)}
          onSubmit={submitBoardAction} />
      }

      <Tweaks tweaks={tweaks} setTweak={setTweak} onReset={newThread} />
    </div>
  );
}

// ---------- Tweaks ----------
function Tweaks({ tweaks, setTweak, onReset }) {
  return (
    <TweaksPanel title="Ayarlar">
      <TweakSection label="Marka">
        <TweakText label="Marka adı" value={tweaks.brandName} onChange={(value) => setTweak("brandName", value)} />
        <TweakText label="Müşteri" value={tweaks.tenantName} onChange={(value) => setTweak("tenantName", value)} />
        <TweakColor label="Ana renk" value={tweaks.primaryColor} onChange={(value) => setTweak("primaryColor", value)} />
      </TweakSection>
      <TweakSection label="Düzen">
        <TweakRadio
          label="Yoğunluk"
          value={tweaks.density}
          onChange={(value) => setTweak("density", value)}
          options={[{ value: "compact", label: "Sıkı" }, { value: "comfortable", label: "Rahat" }]} />
        <TweakToggle label="SQL'i varsayılan göster" value={tweaks.showSqlByDefault} onChange={(value) => setTweak("showSqlByDefault", value)} />
      </TweakSection>
      <TweakSection label="Demo">
        <TweakButton label="Ana ekrana dön" onClick={onReset} />
      </TweakSection>
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
