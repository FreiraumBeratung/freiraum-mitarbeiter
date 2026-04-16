import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearSelectedMailContext,
  getSelectedMailContext,
  setSelectedMailContext,
  type SelectedMailContext,
} from "../../modules/mail/selectedMailContext";

const OPENED_UIDS_STORAGE_KEY = "fm_exchange_opened_uids_v1";
const INBOX_AUTO_REFRESH_MS = 60_000;

type InboxItem = {
  uid: string;
  messageId?: string | null;
  subject: string;
  fromName?: string | null;
  fromEmail?: string | null;
  receivedAt?: string | null;
  preview?: string | null;
  isRead?: boolean;
};

type InboxResponse = {
  ok: boolean;
  total: number;
  items: InboxItem[];
};

type MicrosoftAuthStatus = {
  ok: boolean;
  connected?: boolean;
  oauthConfigured?: boolean;
  expiresInSec?: number;
};

function backendBase(): string {
  return (
    (import.meta.env.VITE_BACKEND_BASE_URL as string | undefined) ??
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
    "http://127.0.0.1:30521"
  ).replace(/\/+$/, "");
}

function decodeHtmlEntities(input: string): string {
  if (!input) return "";
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripHtml(input?: string | null): string {
  if (!input) return "";
  return decodeHtmlEntities(input)
    .replace(/<!doctype[^>]*>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cut(input: string, maxLen: number): string {
  if (!input) return "";
  if (input.length <= maxLen) return input;
  return `${input.slice(0, maxLen - 1).trimEnd()}…`;
}

function fmtDate(value?: string | null): string {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ExchangeInboxPanel() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [activeContext, setActiveContext] = useState<SelectedMailContext | null>(null);
  const [openedUids, setOpenedUids] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(OPENED_UIDS_STORAGE_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set();
      const sanitized = parsed.filter((v) => typeof v === "string" && v.trim().length > 0);
      return new Set(sanitized);
    } catch {
      return new Set();
    }
  });
  const [msAuth, setMsAuth] = useState<MicrosoftAuthStatus | null>(null);
  const [msAuthLoading, setMsAuthLoading] = useState(false);
  const inboxLoadInFlightRef = useRef(false);

  const normalizedItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        subject: cut(stripHtml(item.subject) || "(ohne Betreff)", 90),
        fromName: item.fromName ? cut(stripHtml(item.fromName), 40) : null,
        fromEmail: item.fromEmail ? cut(stripHtml(item.fromEmail), 40) : null,
        preview: item.preview ? cut(stripHtml(item.preview), 94) : null,
      })),
    [items]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return normalizedItems;
    return normalizedItems.filter((item) =>
      `${item.subject} ${item.fromName || ""} ${item.fromEmail || ""} ${item.preview || ""}`.toLowerCase().includes(q)
    );
  }, [normalizedItems, query]);

  const visible = useMemo(() => filtered.slice(0, 20), [filtered]);
  const unreadVisible = useMemo(
    () => visible.filter((item) => item.isRead === false && !openedUids.has(item.uid)).length,
    [visible, openedUids]
  );

  function buildContext(item: InboxItem): SelectedMailContext {
    return {
      uid: item.uid,
      messageId: item.messageId || null,
      subject: item.subject || null,
      fromEmail: item.fromEmail || null,
      fromName: item.fromName || null,
      receivedAt: item.receivedAt || null,
    };
  }

  function applySelection(item: InboxItem | null) {
    if (!item?.uid) {
      setSelectedUid(null);
      clearSelectedMailContext();
      setActiveContext(null);
      return;
    }
    setSelectedUid(item.uid);
    setOpenedUids((prev) => {
      const next = new Set(prev);
      next.add(item.uid);
      return next;
    });
    const context = buildContext(item);
    setSelectedMailContext(context);
    setActiveContext(context);
  }

  const loadInbox = useCallback(async () => {
    if (inboxLoadInFlightRef.current) {
      return;
    }
    inboxLoadInFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const inboxUrl = `${backendBase()}/api/mail/inbox?limit=50&offset=0`;
      let res = await fetch(inboxUrl);
      if (res.status === 503) {
        // Initiale IMAP-Anmeldung kann kurz verzögert sein -> stiller Einmal-Retry.
        await new Promise((resolve) => setTimeout(resolve, 900));
        res = await fetch(inboxUrl);
      }
      const data = (await res.json()) as InboxResponse;
      if (!res.ok || !data?.ok) throw new Error("Inbox konnte nicht geladen werden.");
      const nextItems = data.items || [];
      setItems(nextItems);
      setTotal(data.total || 0);
      const persisted = getSelectedMailContext();
      const bySelectedUid = selectedUid ? nextItems.find((it) => it.uid === selectedUid) : null;
      const byPersistedUid = persisted?.uid ? nextItems.find((it) => it.uid === persisted.uid) : null;
      applySelection(bySelectedUid || byPersistedUid || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inbox konnte nicht geladen werden.");
    } finally {
      inboxLoadInFlightRef.current = false;
      setLoading(false);
    }
  }, [selectedUid]);

  const loadMicrosoftAuthStatus = async () => {
    try {
      const res = await fetch(`${backendBase()}/api/auth/microsoft/status`);
      const data = (await res.json()) as MicrosoftAuthStatus;
      if (res.ok && data?.ok) {
        setMsAuth(data);
      } else {
        setMsAuth({ ok: false, connected: false, oauthConfigured: false });
      }
    } catch {
      setMsAuth({ ok: false, connected: false, oauthConfigured: false });
    }
  };

  const connectMicrosoft = async () => {
    setMsAuthLoading(true);
    try {
      const res = await fetch(`${backendBase()}/api/auth/microsoft/start`);
      const data = (await res.json()) as { ok?: boolean; authUrl?: string };
      if (!res.ok || !data?.ok || !data?.authUrl) {
        throw new Error("Microsoft OAuth Start fehlgeschlagen.");
      }
      const authUrl = data.authUrl.replace(
        "redirect_uri=http%3A%2F%2F127.0.0.1%3A30521%2Fapi%2Fauth%2Fmicrosoft%2Fcallback",
        "redirect_uri=http%3A%2F%2Flocalhost%3A30521%2Fapi%2Fauth%2Fmicrosoft%2Fcallback"
      );
      window.location.href = authUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Microsoft OAuth Start fehlgeschlagen.";
      setError(msg);
    } finally {
      setMsAuthLoading(false);
    }
  };

  const disconnectMicrosoft = async () => {
    setMsAuthLoading(true);
    try {
      await fetch(`${backendBase()}/api/auth/microsoft/logout`, { method: "POST" });
    } catch {
      // no-op
    } finally {
      await loadMicrosoftAuthStatus();
      setMsAuthLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const hasResult = params.has("ms_oauth");
    const hasCodeState = params.has("code") && params.has("state");
    const hasAzureError = params.has("error");
    if (hasResult || (!hasCodeState && !hasAzureError)) return;
    const state = params.get("state") || "";
    if (state) {
      const stateBridgeKey = `fm_ms_oauth_bridge_${state}`;
      if (window.sessionStorage.getItem(stateBridgeKey) === "1") {
        return;
      }
      window.sessionStorage.setItem(stateBridgeKey, "1");
    }

    const callback = new URL(`${backendBase()}/api/auth/microsoft/callback`);
    const passThroughKeys = ["code", "state", "error", "error_description", "session_state"];
    for (const key of passThroughKeys) {
      const value = params.get(key);
      if (value) callback.searchParams.set(key, value);
    }
    window.location.href = callback.toString();
  }, []);

  useEffect(() => {
    void loadInbox();
    void loadMicrosoftAuthStatus();
  }, [loadInbox]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void loadInbox();
    }, INBOX_AUTO_REFRESH_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [loadInbox]);

  useEffect(() => {
    const current = getSelectedMailContext();
    setActiveContext(current);
    const onChanged = (event: Event) => {
      const next = (event as CustomEvent<{ context: SelectedMailContext | null }>).detail?.context ?? null;
      setActiveContext(next);
    };
    window.addEventListener("fm-selected-mail-context", onChanged as EventListener);
    return () => {
      window.removeEventListener("fm-selected-mail-context", onChanged as EventListener);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(OPENED_UIDS_STORAGE_KEY, JSON.stringify(Array.from(openedUids)));
    } catch {
      // ignore localStorage errors (private mode/quota)
    }
  }, [openedUids]);

  return (
    <div
      style={{
        height: "100%",
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: 42,
          minHeight: 42,
          borderRadius: 12,
          background: "rgba(255,255,255,0.05)",
          marginBottom: 12,
          padding: "0 10px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Suche in Inbox..."
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            outline: "none",
            color: "rgba(255,255,255,0.85)",
            fontSize: 12,
          }}
        />
        <button
          onClick={() => void loadInbox()}
          style={{
            height: 26,
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.10)",
            color: "rgba(255,255,255,0.85)",
            padding: "0 10px",
            fontSize: 11,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Aktualisieren
        </button>
        <button
          onClick={() => {
            if (msAuth?.connected) {
              void disconnectMicrosoft();
            } else {
              void connectMicrosoft();
            }
          }}
          disabled={msAuthLoading || (msAuth?.oauthConfigured === false && !msAuth?.connected)}
          style={{
            height: 26,
            borderRadius: 999,
            border: msAuth?.connected
              ? "1px solid rgba(112,237,161,0.38)"
              : "1px solid rgba(255,255,255,0.18)",
            background: msAuth?.connected ? "rgba(78,196,126,0.18)" : "rgba(255,255,255,0.10)",
            color: msAuth?.connected ? "rgba(210,255,225,0.95)" : "rgba(255,255,255,0.85)",
            padding: "0 10px",
            fontSize: 11,
            cursor: msAuthLoading ? "wait" : "pointer",
            whiteSpace: "nowrap",
          }}
          title={msAuth?.connected ? "Microsoft Konto trennen" : "Mit Microsoft verbinden"}
        >
          {msAuth?.connected ? "Microsoft verbunden" : "Microsoft verbinden"}
        </button>
      </div>

      <div
        style={{
          minHeight: 32,
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.04)",
          marginBottom: 10,
          padding: "6px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.74)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={
            activeContext
              ? `${activeContext.subject || "(ohne Betreff)"} • ${activeContext.fromName || activeContext.fromEmail || "Unbekannt"}`
              : "Kein aktiver Mail-Kontext"
          }
        >
          {activeContext
            ? `Aktiver Kontext: ${activeContext.subject || "(ohne Betreff)"}`
            : "Aktiver Kontext: keiner"}
        </div>
        <button
          onClick={() => applySelection(null)}
          disabled={!activeContext}
          style={{
            height: 22,
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.18)",
            background: activeContext ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
            color: activeContext ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.44)",
            padding: "0 10px",
            fontSize: 10,
            cursor: activeContext ? "pointer" : "not-allowed",
            whiteSpace: "nowrap",
          }}
        >
          Kontext lösen
        </button>
      </div>
      {msAuth && (
        <div
          style={{
            marginBottom: 8,
            fontSize: 10,
            color: msAuth.connected ? "rgba(142,243,181,0.88)" : "rgba(255,255,255,0.55)",
            paddingLeft: 2,
          }}
        >
          {msAuth.connected
            ? `Microsoft OAuth aktiv${typeof msAuth.expiresInSec === "number" ? ` (${Math.max(0, Math.floor(msAuth.expiresInSec / 60))}m)` : ""}`
            : msAuth.oauthConfigured === false
            ? "Microsoft OAuth nicht konfiguriert (Backend ENV prüfen)"
            : "Microsoft OAuth nicht verbunden"}
        </div>
      )}

      <div
        style={{
          minHeight: 0,
          flex: 1,
          borderRadius: 16,
          background: "rgba(255,255,255,0.04)",
          padding: 10,
          overflowY: "auto",
          overflowX: "hidden",
          display: "grid",
          gap: 8,
        }}
      >
        {loading && <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12 }}>Inbox wird geladen...</div>}
        {error && <div style={{ color: "rgba(255,170,170,0.92)", fontSize: 12 }}>{error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: "rgba(255,255,255,0.58)", fontSize: 12 }}>Keine Nachrichten gefunden.</div>
        )}
        {!loading &&
          !error &&
          visible.map((item) => {
            const selected = item.uid === selectedUid;
            const fromLabel = item.fromName || item.fromEmail || "Unbekannt";
            const isUnread = item.isRead === false && !openedUids.has(item.uid);
            return (
              <button
                key={item.uid}
                onClick={() => applySelection(item)}
                style={{
                  width: "100%",
                  borderRadius: 12,
                  border: selected
                    ? "1px solid rgba(255,255,255,0.30)"
                    : isUnread
                    ? "1px solid rgba(129,178,255,0.42)"
                    : "1px solid rgba(255,255,255,0.13)",
                  background: selected
                    ? "rgba(255,255,255,0.15)"
                    : isUnread
                    ? "linear-gradient(180deg, rgba(56,98,160,0.24), rgba(255,255,255,0.08))"
                    : "rgba(255,255,255,0.08)",
                  color: "#fff",
                  padding: "9px 11px",
                  textAlign: "left",
                  cursor: "pointer",
                  boxSizing: "border-box",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        background: isUnread ? "rgba(129,178,255,0.95)" : "rgba(255,255,255,0.24)",
                        boxShadow: isUnread ? "0 0 0 3px rgba(129,178,255,0.18)" : "none",
                        flexShrink: 0,
                      }}
                    />
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: isUnread ? 700 : 600,
                        color: isUnread ? "rgba(255,255,255,0.99)" : "rgba(255,255,255,0.94)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {item.subject}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.52)", flexShrink: 0 }}>{fmtDate(item.receivedAt)}</div>
                </div>
                <div style={{ marginTop: 3, fontSize: 11, color: "rgba(255,255,255,0.66)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {fromLabel}
                </div>
                {item.preview && (
                  <div style={{ marginTop: 2, fontSize: 11, color: "rgba(255,255,255,0.52)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.preview}
                  </div>
                )}
              </button>
            );
          })}

        {!loading && !error && (
          <div style={{ paddingTop: 2, fontSize: 10, color: "rgba(255,255,255,0.42)" }}>
            {unreadVisible} ungelesen · {visible.length} sichtbar / {filtered.length} gefiltert / {total} gesamt
          </div>
        )}
      </div>
    </div>
  );
}

