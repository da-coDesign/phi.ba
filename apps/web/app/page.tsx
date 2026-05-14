"use client";

import { ChatKit, useChatKit } from "@openai/chatkit-react";
import Script from "next/script";
import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const AUTH_HEADERS = {
  "content-type": "application/json",
  authorization: "Bearer dev-admin-token",
  "x-tenant-id": "tenant_fibabanka"
};

export default function PhiBaHome() {
  const [open, setOpen] = useState(false);

  return (
    <main className="prototype-shell" aria-label="phi.ba">
      <Script src="https://cdn.platform.openai.com/deployments/chatkit/chatkit.js" strategy="afterInteractive" />
      <iframe className="prototype-frame" src="/phi-ba.html" title="phi.ba" />

      <button className="flow-launcher" type="button" onClick={() => setOpen(true)}>
        OpenAI Flow
      </button>

      {open && (
        <section className="flow-drawer" aria-label="OpenAI Agent Builder workflow">
          <header className="flow-head">
            <div>
              <span>Agent Builder</span>
              <strong>phi.ba live flow</strong>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close OpenAI Flow">
              Close
            </button>
          </header>
          <OpenAIFlow />
        </section>
      )}
    </main>
  );
}

function OpenAIFlow() {
  const [error, setError] = useState("");
  const { control } = useChatKit({
    api: {
      async getClientSecret(existing) {
        if (existing) return existing;
        setError("");
        const response = await fetch(`${API_BASE}/api/v1/openai/chatkit/session`, {
          method: "POST",
          headers: AUTH_HEADERS
        });
        const payload = await response.json();
        if (!response.ok) {
          const message = payload?.error?.message ?? "Unable to create ChatKit session.";
          setError(message);
          throw new Error(message);
        }
        const secret = payload?.data?.client_secret ?? payload?.client_secret;
        if (typeof secret !== "string") {
          const message = "ChatKit session did not return a client secret.";
          setError(message);
          throw new Error(message);
        }
        return secret;
      }
    },
    locale: "tr-TR",
    theme: {
      colorScheme: "light",
      radius: "soft",
      density: "normal",
      color: {
        accent: {
          primary: "#9FD8C0",
          level: 2
        }
      },
      typography: {
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        fontFamilyMono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
      }
    },
    composer: {
      placeholder: "phi.ba agent workflow'a sor..."
    },
    startScreen: {
      greeting: "phi.ba workflow hazır",
      prompts: [
        { label: "Kart onay oranı", prompt: "Kart onay oranı neden düştü?" },
        { label: "NPL riski", prompt: "Bu çeyrekte en yüksek NPL baskısı nerede?" },
        { label: "Aksiyon öner", prompt: "Bu bulguyu hangi aksiyona çevirmeliyiz?" }
      ]
    },
    onError(event) {
      const message = event.error instanceof Error ? event.error.message : "ChatKit error.";
      setError(message);
    }
  });

  return (
    <div className="flow-body">
      {error && (
        <div className="flow-error">
          <strong>Workflow bağlanamadı</strong>
          <span>{error}</span>
        </div>
      )}
      <ChatKit control={control} className="flow-chatkit" />
    </div>
  );
}
