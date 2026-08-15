import React, { useCallback, useState } from "react";
import { backendBase } from "../lib/backendBase";

type AdminAccountItem = {
  id: string;
  email: string;
  displayName?: string;
  provider?: string;
  licenseActive?: boolean;
  lastLoginAt?: string | null;
  mailboxConnected?: boolean;
};

export default function AdminAccounts() {
  const [adminKey, setAdminKey] = useState(() => {
    try {
      return window.sessionStorage.getItem("fm_admin_key") || "";
    } catch {
      return "";
    }
  });
  const [items, setItems] = useState<AdminAccountItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      window.sessionStorage.setItem("fm_admin_key", adminKey);
      const res = await fetch(`${backendBase()}/api/admin/accounts`, {
        credentials: "include",
        headers: { "X-FM-Admin-Key": adminKey },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.detail || "Admin-Zugang fehlgeschlagen.");
      }
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : "Admin-Zugang fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: "0 auto", color: "#fff" }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Pilot-Konten</h1>
      <p style={{ color: "rgba(255,255,255,0.62)", fontSize: 13, marginBottom: 16 }}>
        Du siehst nur, wer sich angemeldet hat. Mails, Kontakte und Inhalte bleiben unsichtbar.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          type="password"
          value={adminKey}
          onChange={(e) => setAdminKey(e.target.value)}
          placeholder="Admin-Schlüssel"
          style={{
            flex: 1,
            height: 36,
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(255,255,255,0.06)",
            color: "#fff",
            padding: "0 10px",
          }}
        />
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || !adminKey.trim()}
          style={{
            height: 36,
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(120,180,255,0.22)",
            color: "#fff",
            padding: "0 14px",
          }}
        >
          Laden
        </button>
      </div>
      {error ? <div style={{ color: "rgba(255,170,170,0.95)", marginBottom: 12 }}>{error}</div> : null}
      {items.length === 0 && !error && !loading ? (
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Noch keine Konten.</div>
      ) : null}
      <div style={{ display: "grid", gap: 8 }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 10,
              padding: "10px 12px",
              background: "rgba(255,255,255,0.04)",
            }}
          >
            <div style={{ fontWeight: 700 }}>{item.displayName || item.email}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{item.email}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              {item.provider === "microsoft" ? "Microsoft" : "IMAP / SMTP"} ·{" "}
              {item.licenseActive ? "Lizenz aktiv" : "ohne Lizenz"} ·{" "}
              {item.mailboxConnected ? "Mailbox verbunden" : "Mailbox getrennt"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
