const { useState, useEffect, useRef, useMemo } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "brandName": "phi.ba",
  "tenantName": "Fibabanka",
  "primaryColor": "#9FD8C0",
  "primaryTextOn": "#0E1F1A",
  "density": "comfortable",
  "showSqlByDefault": true
} /*EDITMODE-END*/;

// ---------- Icons ----------
const Icon = ({ name, size = 16, stroke = 1.6 }) => {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round" };
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
    case "folder":return <svg {...common}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" /></svg>;
    case "ask":return <svg {...common}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /></svg>;
    case "chat":return <svg {...common}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    case "check":return <svg {...common}><path d="M5 12l5 5L20 7" /></svg>;
    case "chevron":return <svg {...common}><path d="M9 6l6 6-6 6" /></svg>;
    case "x":return <svg {...common}><path d="M6 6l12 12M18 6L6 18" /></svg>;
    case "settings":return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>;
    default:return null;
  }
};

// ---------- Mock data & responses (Fintech / Türkçe) ----------
const SAMPLE_PROMPTS = [
"Son 30 günde işlem hacmine göre en çok kullanılan 10 segment",
"Bu çeyrekte en yüksek NPL oranına sahip ürünler hangileri?",
"18 Nisan'da kart onay oranı neden düştü?",
"Mobil bankacılıktan gelen müşterilerin 90 günlük tutunması"];


const HISTORY = {};

const DEMO_RESPONSE = {
  question: "Son 30 günde işlem hacmine göre en çok kullanılan 10 segment",
  intro: "`islemler` tablosu `musteriler` ve `urunler` ile birleştirildi, son 30 güne filtrelendi. Başarısız ve iade işlemleri hariç tutuldu.",
  sql: `SELECT
  u.ad                AS urun,
  m.segment           AS segment,
  COUNT(*)            AS islem_adedi,
  SUM(i.tutar)        AS islem_hacmi
FROM islemler i
JOIN musteriler m ON m.id = i.musteri_id
JOIN urunler   u ON u.id = i.urun_id
WHERE i.gerceklesme_tarihi >= NOW() - INTERVAL '30 days'
  AND i.durum = 'basarili'
GROUP BY 1, 2
ORDER BY islem_hacmi DESC
LIMIT 10;`,
  tables: ["islemler", "musteriler", "urunler"],
  rows: [
  ["Kredi Kartı — Premium", "Üst Gelir", 184210, 91428000],
  ["Konut Kredisi", "Bireysel", 9120, 76452000],
  ["Vadeli Mevduat (TL)", "Üst Gelir", 41820, 62580000],
  ["EFT/Havale", "KOBİ", 312400, 58500000],
  ["Ticari Kredi", "KOBİ", 6210, 51000000],
  ["İhtiyaç Kredisi", "Bireysel", 28940, 47894000],
  ["Kredi Kartı — Standart", "Bireysel", 510420, 42840000],
  ["Yatırım Fonu", "Üst Gelir", 18400, 36800000],
  ["POS İşlemleri", "KOBİ", 982100, 33150000],
  ["KMH", "Bireysel", 198800, 29280000]],

  insight: "Hacmi üst gelir segmenti taşıyor — ilk 10'un **%38'i** bu segmentten. Premium kredi kartı tek başına haftalık bazda **%22** yukarıda; chargeback oranı stabil."
};

const THINKING_STEPS = [
"Soruyu netleştiriyorum",
"Şema ve metrikleri kontrol ediyorum",
"En doğru sorgu planını kuruyorum"];

const THINKING_MIN_MS = 1600;
const THINKING_MAX_MS = 3400;

function getThinkingDuration(text) {
  return Math.max(
    THINKING_MIN_MS,
    Math.min(THINKING_MAX_MS, 1250 + text.trim().length * 32));
}

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
function SidebarRail({ onExpand, onNew, brandName }) {
  return (
    <aside className="rail">
      <button className="rail-btn rail-logo" onClick={onExpand} title="Menüyü aç">
        <svg viewBox="0 0 24 24" width="22" height="22">
          <circle cx="12" cy="12" r="10" fill="var(--brand)" />
          <circle cx="12" cy="12" r="3.2" fill="var(--ink)" />
        </svg>
      </button>
      <button className="rail-btn" onClick={onExpand} title="Kenar çubuğu"><Icon name="sidebar" size={18} /></button>
      <button className="rail-btn" onClick={onNew} title="Yeni konu"><Icon name="plus" size={18} /></button>
      <button className="rail-btn" title="Ara"><Icon name="search" size={18} /></button>
      <div className="rail-spacer" />
      <button className="rail-btn" title="Veri kaynakları"><Icon name="db" size={18} /></button>
      <button className="rail-btn" title="Ayarlar"><Icon name="settings" size={16} /></button>
    </aside>);

}

function SidebarFull({ onCollapse, onNew, activeId, onPick, brandName, tenantName }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <Logo name={brandName} />
        <button className="iconbtn" onClick={onCollapse} title="Daralt"><Icon name="sidebar" size={16} /></button>
      </div>

      <button className="new-thread" onClick={onNew}>
        <Icon name="plus" size={14} />
        <span>Yeni Sorgu
</span>
        <kbd>⌘N</kbd>
      </button>

      <div className="search-box">
        <Icon name="search" size={14} />
        <input placeholder="Konularda ara" />
      </div>

      <div className="nav-group">
        <div className="nav-label">Çalışma alanı</div>
        <a className="nav-item active"><Icon name="ask" size={14} /><span>Sor</span></a>
        <a className="nav-item"><Icon name="folder" size={14} /><span>Projeler</span></a>
        <a className="nav-item"><Icon name="chart" size={14} /><span>Panolar</span></a>
        <a className="nav-item"><Icon name="db" size={14} /><span>Veri kaynakları</span><span className="pill">3</span></a>
      </div>

      <div className="history history-empty">
        <div className="empty-card">
          <div className="empty-icon"><Icon name="chat" size={14} /></div>
          <div className="empty-title">Henüz konu yok</div>
          <div className="empty-sub">Sorduğun her şey burada birikecek.</div>
        </div>
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
    </aside>);

}

// ---------- Ask Box ----------
function AskBox({ value, onChange, onSubmit, big, placeholder, chips }) {
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
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder || "Verilerinle ilgili her şeyi sor…"} />
      
      <div className="askbox-row">
        <div className="askbox-chips">
          {(chips || ["FBCAPRD", "FBDWHPRD", "FBDWH", "FBDWHPRD_CDO"]).map((c) =>
          <button key={c} className="chip"><Icon name="db" size={11} /><span>{c}</span></button>
          )}
          <button className="chip chip-add"><Icon name="plus" size={11} /></button>
        </div>
        <button
          className="ask-send"
          disabled={!value.trim()}
          onClick={onSubmit}
          title="Gönder (↵)">
          <Icon name="send" size={14} />
        </button>
      </div>
    </div>);

}

// ---------- Home Screen ----------
function HomeScreen({ tenantName, onAsk }) {
  const [v, setV] = useState("");
  return (
    <div className="home">
      <div className="home-glow" />
      <div className="home-inner">
        <div className="home-eyebrow">Fibabanka</div>
        <h1 className="home-title">Verine ne sormak istersin?</h1>
        <p className="home-sub">Düz Türkçe sor. SQL'i ben yazarım, üretim veri ambarında çalıştırırım ve sonucu yorumlarım.</p>

        <div className="home-ask">
          <AskBox
            big
            value={v}
            onChange={setV}
            onSubmit={() => v.trim() && onAsk(v.trim())}
            placeholder="örn. Son 30 günde işlem hacmine göre en çok kullanılan 10 ürün" />
        </div>
      </div>
    </div>);

}

// ---------- Conversation pieces ----------
function ChartBars({ rows }) {
  const max = Math.max(...rows.map((r) => r[3]));
  const fmt = (n) => {
    if (n >= 1e6) return "₺" + (n / 1e6).toFixed(1).replace(".", ",") + " Mn";
    if (n >= 1e3) return "₺" + (n / 1e3).toFixed(1).replace(".", ",") + " B";
    return "₺" + n.toLocaleString("tr-TR");
  };
  return (
    <div className="bars">
      {rows.map((r, i) => {
        const pct = r[3] / max * 100;
        return (
          <div key={i} className="bar-row">
            <div className="bar-label" title={r[0]}>{r[0]}</div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: pct + "%" }} />
              <span className="bar-val">{fmt(r[3])}</span>
            </div>
          </div>);

      })}
    </div>);

}

function ResultBlock({ data, showSqlDefault }) {
  const [tab, setTab] = useState("chart");
  const [showSql, setShowSql] = useState(showSqlDefault);
  return (
    <div className="result">
      <div className="result-head">
        <div className="result-tabs">
          <button className={tab === "chart" ? "rt active" : "rt"} onClick={() => setTab("chart")}><Icon name="chart" size={12} />Grafik</button>
          <button className={tab === "table" ? "rt active" : "rt"} onClick={() => setTab("table")}><Icon name="table" size={12} />Tablo</button>
        </div>
        <div className="result-meta">
          <span className="meta-pill"><span className="dot ok" />10 satır · 284ms</span>
          <button className="meta-btn" onClick={() => setShowSql((s) => !s)}>
            <Icon name="code" size={12} />
            <span>SQL'i {showSql ? "gizle" : "göster"}</span>
          </button>
          <button className="meta-btn"><Icon name="share" size={12} /></button>
        </div>
      </div>

      {showSql &&
      <div className="sql-block">
          <div className="sql-head">
            <span className="sql-label">Üretilen SQL · postgres</span>
            <div className="sql-actions">
              {data.tables.map((t) => <span key={t} className="table-pill"><Icon name="db" size={10} />{t}</span>)}
              <button className="meta-btn"><Icon name="copy" size={11} /></button>
            </div>
          </div>
          <pre className="sql"><code>{highlightSql(data.sql)}</code></pre>
        </div>
      }

      <div className="result-body">
        {tab === "chart" ? <ChartBars rows={data.rows} /> :
        <div className="table-wrap">
            <table>
              <thead><tr><th>ürün</th><th>segment</th><th className="num">işlem adedi</th><th className="num">hacim</th></tr></thead>
              <tbody>
                {data.rows.map((r, i) =>
              <tr key={i}>
                    <td>{r[0]}</td>
                    <td><span className="cat-pill">{r[1]}</span></td>
                    <td className="num mono">{r[2].toLocaleString("tr-TR")}</td>
                    <td className="num mono strong">₺{r[3].toLocaleString("tr-TR")}</td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        }
      </div>

      <div className="result-foot">
        <div className="insight">
          <Icon name="spark" size={12} />
          <span>{data.insight.split("**").map((s, i) => i % 2 ? <b key={i}>{s}</b> : s)}</span>
        </div>
      </div>
    </div>);

}

function highlightSql(sql) {
  const kw = /\b(SELECT|FROM|JOIN|ON|WHERE|AND|OR|GROUP BY|ORDER BY|LIMIT|AS|SUM|NOW|INTERVAL|DESC|ASC)\b/g;
  const parts = [];
  let lastIdx = 0;
  let m;
  let key = 0;
  while ((m = kw.exec(sql)) !== null) {
    if (m.index > lastIdx) parts.push(sql.slice(lastIdx, m.index));
    parts.push(<span key={key++} className="sql-kw">{m[0]}</span>);
    lastIdx = m.index + m[0].length;
  }
  parts.push(sql.slice(lastIdx));
  return parts;
}

function UserBubble({ text }) {
  return (
    <div className="msg msg-user">
      <div className="bubble bubble-user">{text}</div>
    </div>);

}

function AgentMessage({ q, data, showSqlDefault, isLast }) {
  return (
    <div className="msg msg-agent">
      <div className="agent-avatar">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <circle cx="12" cy="12" r="10" fill="var(--brand)" />
          <circle cx="12" cy="12" r="3.2" fill="var(--ink)" />
        </svg>
      </div>
      <div className="agent-body">
        <div className="agent-intro">{data.intro.split("`").map((s, i) => i % 2 ? <code key={i}>{s}</code> : s)}</div>
        <ResultBlock data={data} showSqlDefault={showSqlDefault} />
        <div className="msg-actions">
          <button className="msg-act"><Icon name="thumbs-up" size={13} /></button>
          <button className="msg-act"><Icon name="thumbs-down" size={13} /></button>
          <button className="msg-act"><Icon name="copy" size={13} /></button>
          <button className="msg-act"><Icon name="share" size={13} /></button>
          <span className="sep" />
          <button className="msg-act msg-act-ghost"><Icon name="plus" size={13} />Panoya ekle</button>
        </div>
      </div>
    </div>);

}

function ThinkingMessage() {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setStepIdx((idx) => (idx + 1) % THINKING_STEPS.length);
    }, 850);
    return () => window.clearInterval(tick);
  }, []);

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
            <span>Düşünüyor</span>
          </div>
          <div className="thinking-title">{THINKING_STEPS[stepIdx]}</div>
          <div className="thinking-sub">Yanıtı hemen dökmek yerine önce soruyu anlamlandırıp en tutarlı cevabı hazırlıyorum.</div>
          <div className="thinking-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    </div>);

}

// ---------- Conversation Screen ----------
function ConversationScreen({ messages, onAsk, showSqlDefault }) {
  const [v, setV] = useState("");
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
          <button className="ghost-btn"><Icon name="share" size={13} />Paylaş</button>
          <button className="ghost-btn"><Icon name="plus" size={13} />Kaydet</button>
          <button className="iconbtn"><Icon name="more" size={14} /></button>
        </div>
      </div>

      <div className="convo-scroll" ref={scrollRef}>
        <div className="convo-inner">
          {messages.map((m, i) =>
          <React.Fragment key={m.id}>
              <UserBubble text={m.text} />
              {m.status === "done" ?
            <AgentMessage q={m.text} data={DEMO_RESPONSE} showSqlDefault={showSqlDefault} isLast={i === messages.length - 1} /> :
            <ThinkingMessage />}
            </React.Fragment>
          )}
        </div>
      </div>

      <div className="convo-composer">
        <div className="composer-inner">
          <AskBox
            value={v}
            onChange={setV}
            onSubmit={() => {if (v.trim()) {onAsk(v.trim());setV("");}}}
            placeholder="Devam sorusu sor… (örn. bunu haftalık olarak ayır)" />
          
          <div className="composer-foot">
            <span>Göndermek için ↵ · Yeni satır için ⇧↵ · Tablo seçmek için @</span>
          </div>
        </div>
      </div>
    </div>);

}

// ---------- Root App ----------
function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [view, setView] = useState("home");
  const [messages, setMessages] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const timeoutsRef = useRef(new Map());
  const nextMessageIdRef = useRef(1);

  useEffect(() => {
    document.documentElement.style.setProperty("--brand", tweaks.primaryColor);
    document.documentElement.style.setProperty("--brand-on", tweaks.primaryTextOn);
    document.documentElement.dataset.density = tweaks.density;
  }, [tweaks]);

  useEffect(() => () => {
    timeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutsRef.current.clear();
  }, []);

  const markMessageDone = (id) => {
    setMessages((items) =>
    items.map((item) => item.id === id ? { ...item, status: "done" } : item)
    );
    const timeoutId = timeoutsRef.current.get(id);
    if (timeoutId) window.clearTimeout(timeoutId);
    timeoutsRef.current.delete(id);
  };

  const ask = (text) => {
    const id = nextMessageIdRef.current++;
    setMessages((m) => [...m, { id, text, status: "thinking" }]);
    setView("convo");
    setSidebarOpen(true);
    const timeoutId = window.setTimeout(() => markMessageDone(id), getThinkingDuration(text));
    timeoutsRef.current.set(id, timeoutId);
  };
  const newThread = () => {
    timeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutsRef.current.clear();
    setMessages([]);
    setView("home");
  };

  return (
    <div className="app">
      {sidebarOpen ?
      <SidebarFull
        onCollapse={() => setSidebarOpen(false)}
        onNew={newThread}
        brandName={tweaks.brandName}
        tenantName={tweaks.tenantName} /> :
      <SidebarRail
        onExpand={() => setSidebarOpen(true)}
        onNew={newThread}
        brandName={tweaks.brandName} />}

      <main className="main">
        {view === "home" ?
        <HomeScreen tenantName={tweaks.tenantName} onAsk={ask} /> :
        <ConversationScreen messages={messages} onAsk={ask} showSqlDefault={tweaks.showSqlByDefault} />}
      </main>

      <Tweaks tweaks={tweaks} setTweak={setTweak} onReset={newThread} />
    </div>);

}

// ---------- Tweaks ----------
function Tweaks({ tweaks, setTweak, onReset }) {
  return (
    <TweaksPanel title="Ayarlar">
      <TweakSection label="Marka">
        <TweakText label="Marka adı" value={tweaks.brandName} onChange={(v) => setTweak("brandName", v)} />
        <TweakText label="Müşteri" value={tweaks.tenantName} onChange={(v) => setTweak("tenantName", v)} />
        <TweakColor label="Ana renk" value={tweaks.primaryColor} onChange={(v) => setTweak("primaryColor", v)} />
      </TweakSection>
      <TweakSection label="Düzen">
        <TweakRadio label="Yoğunluk"
        value={tweaks.density}
        onChange={(v) => setTweak("density", v)}
        options={[{ value: "compact", label: "Sıkı" }, { value: "comfortable", label: "Rahat" }]} />
        <TweakToggle label="SQL'i varsayılan göster" value={tweaks.showSqlByDefault} onChange={(v) => setTweak("showSqlByDefault", v)} />
      </TweakSection>
      <TweakSection label="Demo">
        <TweakButton label="Ana ekrana dön" onClick={onReset} />
      </TweakSection>
    </TweaksPanel>);

}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
