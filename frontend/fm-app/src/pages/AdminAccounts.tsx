import React, { useCallback, useEffect, useState } from "react";
import { backendBase } from "../lib/backendBase";

type AdminAccountItem = {
  id: string;
  email: string;
  displayName?: string;
  provider?: string;
  licenseActive?: boolean;
  lastLoginAt?: string | null;
  mailboxConnected?: boolean;
  isAdmin?: boolean;
};

export default function AdminAccounts() {
  const [adminKey, setAdminKey] = useState(() => {
    try {
      return window.sessionStorage.getItem("fm_admin_key") || "";
    } catch {
      return "";
    }
  });
  const [sessionAdmin, setSessionAdmin] = useState(false);
  const [items, setItems] = useState<AdminAccountItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const headersFor = useCallback(() => {
    const headers: Record<string, string> = {};
    if (!sessionAdmin && adminKey.trim()) {
      headers["X-FM-Admin-Key"] = adminKey.trim();
    }
    return headers;
  }, [adminKey, sessionAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (adminKey.trim()) {
        window.sessionStorage.setItem("fm_admin_key", adminKey);
      }
      const res = await fetch(`${backendBase()}/api/admin/accounts`, {
        credentials: "include",
        headers: headersFor(),
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
  }, [adminKey, headersFor]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${backendBase()}/api/admin/me`, { credentials: "include" });
        const data = await res.json().catch(() => null);
        if (!cancelled && data?.isAdmin) {
          setSessionAdmin(true);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (sessionAdmin) {
      void load();
    }
  }, [sessionAdmin, load]);

  const setLicense = async (accountId: string, active: boolean) => {
    setError(null);
    try {
      const res = await fetch(`${backendBase()}/api/admin/accounts/license`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...headersFor() },
        body: JSON.stringify({ accountId, active }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || "Lizenz konnte nicht geändert werden.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lizenz konnte nicht geändert werden.");
    }
  };

  const removeAccount = async (accountId: string, email: string) => {
    if (!window.confirm(`Konto ${email} wirklich löschen?`)) return;
    setError(null);
    try {
      const res = await fetch(`${backendBase()}/api/admin/accounts/delete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...headersFor() },
        body: JSON.stringify({ accountId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || "Konto konnte nicht gelöscht werden.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Konto konnte nicht gelöscht werden.");
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: "0 auto", color: "#fff" }}>
      <a href="/mail/compose" style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
        ← Zurück zur App
      </a>
      <h1 style={{ fontSize: 22, margin: "12px 0 8px" }}>Verwaltung</h1>
      <p style={{ color: "rgba(255,255,255,0.62)", fontSize: 13, marginBottom: 16 }}>
        Du siehst nur, wer sich angemeldet hat. Mails, Kontakte und Inhalte bleiben unsichtbar.
      </p>
      {sessionAdmin ? (
        <div style={{ fontSize: 12, color: "rgba(180,220,255,0.9)", marginBottom: 16, display: "flex", gap: 8, alignItems: "center" }}>
          <span>Angemeldet als Admin-E-Mail.</span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            style={{
              height: 28,
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
              padding: "0 10px",
              fontSize: 12,
            }}
          >
            Aktualisieren
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="Admin-Schlüssel (nur Fallback)"
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
      )}
      {error ? <div style={{ color: "rgba(255,170,170,0.95)", marginBottom: 12 }}>{error}</div> : null}
      {items.length === 0 && !error && !loading ? (
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Noch keine Konten.</div>
      ) : null}
      {items.length === 1 && items[0]?.isAdmin ? (
        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginBottom: 12, lineHeight: 1.45 }}>
          Das bist du. Sobald sich ein Mitarbeiter anmeldet, erscheint das Konto hier — dann kannst du die Lizenz pausieren oder löschen.
        </div>
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
              {item.licenseActive ? "Lizenz aktiv" : "Lizenz pausiert"} ·{" "}
              {item.mailboxConnected ? "Mailbox verbunden" : "Mailbox getrennt"}
              {item.isAdmin ? " · Admin" : ""}
              {item.lastLoginAt ? ` · zuletzt ${new Date(item.lastLoginAt).toLocaleString("de-DE")}` : ""}
            </div>
            {item.isAdmin ? (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.42)", marginTop: 8 }}>
                Admin-Konto — Lizenz bleibt aktiv.
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => void setLicense(item.id, !item.licenseActive)}
                  style={{
                    height: 28,
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.16)",
                    background: "rgba(255,255,255,0.08)",
                    color: "#fff",
                    padding: "0 10px",
                    fontSize: 12,
                  }}
                >
                  {item.licenseActive ? "Lizenz pausieren" : "Lizenz fortsetzen"}
                </button>
                <button
                  type="button"
                  onClick={() => void removeAccount(item.id, item.email)}
                  style={{
                    height: 28,
                    borderRadius: 8,
                    border: "1px solid rgba(255,120,120,0.35)",
                    background: "rgba(180,50,50,0.25)",
                    color: "#fff",
                    padding: "0 10px",
                    fontSize: 12,
                  }}
                >
                  Löschen
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
