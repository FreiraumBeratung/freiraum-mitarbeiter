import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import MailComposeForm from "../components/mail/MailComposeForm";
import MobileVoiceButton from "../components/voice/MobileVoiceButton";
import {
  clearSelectedMailContext,
  getSelectedMailContext,
  setSelectedMailContext,
  type SelectedMailContext,
} from "../modules/mail/selectedMailContext";
import { type VoiceState } from "../modules/voice";

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

type InboxMessageDetailResponse = {
  ok: boolean;
  uid: string;
  messageId?: string | null;
  subject: string;
  fromName?: string | null;
  fromEmail?: string | null;
  receivedAt?: string | null;
  bodyText: string;
  bodyHtml?: string | null;
};

const INBOX_AUTO_REFRESH_MS = 60_000;

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

export default function MobileMailShell() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mailboxMode, setMailboxMode] = useState<"inbox" | "sent">("inbox");
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<InboxMessageDetailResponse | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [hasDraft, setHasDraft] = useState(false);
  const [activeContext, setActiveContext] = useState<SelectedMailContext | null>(() => getSelectedMailContext());
  const inboxLoadInFlightRef = useRef(false);
  const itemsRef = useRef<InboxItem[]>([]);
  const mailboxInitRef = useRef(true);

  const visibleItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        subject: cut(stripHtml(item.subject) || "(ohne Betreff)", 80),
        fromName: item.fromName ? cut(stripHtml(item.fromName), 36) : null,
        fromEmail: item.fromEmail ? cut(stripHtml(item.fromEmail), 40) : null,
        preview: item.preview ? cut(stripHtml(item.preview), 88) : null,
      })),
    [items]
  );

  const loadInbox = useCallback(async (options?: { silent?: boolean }) => {
    if (inboxLoadInFlightRef.current) return;
    inboxLoadInFlightRef.current = true;
    const silent = options?.silent === true;
    if (!silent && itemsRef.current.length === 0) {
      setLoading(true);
      setError(null);
    }
    try {
      const inboxUrl = `${backendBase()}/api/mail/inbox?limit=50&offset=0&mailbox=${mailboxMode}`;
      let res = await fetch(inboxUrl);
      if (res.status === 503) {
        await new Promise((resolve) => setTimeout(resolve, 900));
        res = await fetch(inboxUrl);
      }
      const data = (await res.json()) as InboxResponse;
      if (!res.ok || !data?.ok) throw new Error("Postfach konnte nicht geladen werden.");
      setItems(data.items || []);
      setError(null);
    } catch (err) {
      if (itemsRef.current.length === 0) {
        setError(err instanceof Error ? err.message : "Postfach konnte nicht geladen werden.");
      }
    } finally {
      inboxLoadInFlightRef.current = false;
      setLoading(false);
    }
  }, [mailboxMode]);

  const openMessage = useCallback(
    async (item: InboxItem) => {
      if (!item?.uid) return;
      setSelectedUid(item.uid);
      setSelectedMailContext(buildContext(item));
      setDetailOpen(true);
      setDetailLoading(true);
      setDetailError(null);
      try {
        const res = await fetch(
          `${backendBase()}/api/mail/inbox/${encodeURIComponent(item.uid)}?mailbox=${mailboxMode}`
        );
        const data = (await res.json()) as InboxMessageDetailResponse;
        if (!res.ok || !data?.ok) throw new Error("Nachricht konnte nicht geöffnet werden.");
        setDetailData(data);
      } catch (err) {
        setDetailData(null);
        setDetailError(err instanceof Error ? err.message : "Nachricht konnte nicht geöffnet werden.");
      } finally {
        setDetailLoading(false);
      }
    },
    [mailboxMode]
  );

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    setDetailData(null);
    setDetailError(null);
    setSelectedUid(null);
    clearSelectedMailContext();
  }, []);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      void loadInbox({ silent: true });
    }, INBOX_AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [loadInbox]);

  useEffect(() => {
    const onSetupDone = () => {
      void loadInbox({ silent: true });
    };
    window.addEventListener("fm-mail-setup-complete", onSetupDone);
    return () => window.removeEventListener("fm-mail-setup-complete", onSetupDone);
  }, [loadInbox]);

  useEffect(() => {
    const handler = (e: CustomEvent<{ state: VoiceState }>) => {
      setVoiceState(e.detail?.state || "idle");
    };
    document.addEventListener("voice-state", handler as EventListener);
    return () => document.removeEventListener("voice-state", handler as EventListener);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => {
      const to = window.__fm_get_mail_to?.() || "";
      const subject = window.__fm_get_mail_subject?.() || "";
      const body = window.__fm_get_mail_body?.() || "";
      setHasDraft(Boolean(to.trim() || subject.trim() || body.trim()));
    }, 400);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (mailboxInitRef.current) {
      mailboxInitRef.current = false;
      return;
    }
    closeDetail();
  }, [mailboxMode, closeDetail]);

  useEffect(() => {
    const onChanged = (event: Event) => {
      const next = (event as CustomEvent<{ context: SelectedMailContext | null }>).detail?.context ?? null;
      setActiveContext(next);
    };
    window.addEventListener("fm-selected-mail-context", onChanged as EventListener);
    return () => window.removeEventListener("fm-selected-mail-context", onChanged as EventListener);
  }, []);

  const context = activeContext;
  const headerTitle = detailOpen
    ? cut(stripHtml(detailData?.subject || context?.subject || "Nachricht"), 42)
    : mailboxMode === "sent"
      ? "Gesendet"
      : "Posteingang";

  const voiceHint =
    voiceState === "listening"
      ? "Hört zu…"
      : voiceState === "transcribing"
        ? "Versteht…"
        : voiceState === "acting"
          ? "Führt aus…"
          : context
            ? `Antwort an ${context.fromName || context.fromEmail || "Absender"}`
            : "Neue Mail per Sprache";

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#07090d",
        color: "#fff",
      }}
    >
      <header
        style={{
          flexShrink: 0,
          padding: "12px 16px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {detailOpen ? (
            <button
              type="button"
              onClick={closeDetail}
              style={{
                height: 32,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.08)",
                color: "#fff",
                padding: "0 12px",
                fontSize: 13,
              }}
            >
              ← Zurück
            </button>
          ) : null}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {headerTitle}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>{voiceHint}</div>
          </div>
          {!detailOpen ? (
            <button
              type="button"
              onClick={() => void loadInbox()}
              style={{
                height: 32,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.88)",
                padding: "0 12px",
                fontSize: 12,
              }}
            >
              Neu
            </button>
          ) : null}
        </div>
        {!detailOpen ? (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={() => setMailboxMode("inbox")}
              style={tabStyle(mailboxMode === "inbox")}
            >
              Inbox
            </button>
            <button
              type="button"
              onClick={() => setMailboxMode("sent")}
              style={tabStyle(mailboxMode === "sent")}
            >
              Gesendet
            </button>
          </div>
        ) : null}
      </header>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 12px 8px" }}>
        {detailOpen ? (
          <div>
            {detailLoading ? (
              <div style={{ padding: 16, color: "rgba(255,255,255,0.6)", fontSize: 14 }}>Nachricht wird geladen…</div>
            ) : null}
            {detailError ? (
              <div style={{ padding: 16, color: "rgba(255,170,170,0.95)", fontSize: 14 }}>{detailError}</div>
            ) : null}
            {detailData ? (
              <div
                style={{
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.05)",
                  padding: 14,
                  marginBottom: 12,
                }}
              >
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.72)" }}>
                  {detailData.fromName || detailData.fromEmail || "Unbekannt"}
                </div>
                {detailData.receivedAt ? (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                    {fmtDate(detailData.receivedAt)}
                  </div>
                ) : null}
                <div style={{ fontSize: 15, fontWeight: 650, marginTop: 8 }}>{stripHtml(detailData.subject)}</div>
                <div
                  style={{
                    fontSize: 14,
                    lineHeight: 1.45,
                    color: "rgba(255,255,255,0.86)",
                    marginTop: 12,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {detailData.bodyText || stripHtml(detailData.bodyHtml) || "(kein Text)"}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div>
            {loading ? (
              <div style={{ padding: 16, color: "rgba(255,255,255,0.6)", fontSize: 14 }}>Postfach wird geladen…</div>
            ) : null}
            {error ? (
              <div style={{ padding: 16, color: "rgba(255,170,170,0.95)", fontSize: 14 }}>{error}</div>
            ) : null}
            {!loading && !error && visibleItems.length === 0 ? (
              <div style={{ padding: 16, color: "rgba(255,255,255,0.55)", fontSize: 14 }}>
                Keine Nachrichten. Unten auf das Mikro tippen, um eine neue Mail zu diktieren.
              </div>
            ) : null}
            {visibleItems.map((item) => {
              const unread = item.isRead === false;
              const active = item.uid === selectedUid;
              return (
                <button
                  key={item.uid}
                  type="button"
                  onClick={() => void openMessage(item)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    borderRadius: 14,
                    border: active ? "1px solid rgba(255,170,95,0.55)" : "1px solid rgba(255,255,255,0.08)",
                    background: unread ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                    color: "#fff",
                    padding: "12px 12px",
                    marginBottom: 8,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: unread ? 700 : 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.fromName || item.fromEmail || "Unbekannt"}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.48)", flexShrink: 0 }}>
                      {fmtDate(item.receivedAt)}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      marginTop: 3,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.subject}
                  </div>
                  {item.preview ? (
                    <div
                      style={{
                        fontSize: 12,
                        color: "rgba(255,255,255,0.5)",
                        marginTop: 3,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.preview}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}

      </div>

      <div
        style={
          detailOpen || hasDraft
            ? { flexShrink: 0, maxHeight: "42%", overflowY: "auto", padding: "0 12px 8px" }
            : { position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }
        }
        aria-hidden={!(detailOpen || hasDraft)}
      >
        <MailComposeForm />
      </div>

      <div
        style={{
          flexShrink: 0,
          borderTop: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(7,9,13,0.96)",
        }}
      >
        <MobileVoiceButton />
      </div>
    </div>
  );
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    height: 30,
    borderRadius: 999,
    border: active ? "1px solid rgba(255,170,95,0.62)" : "1px solid rgba(255,255,255,0.16)",
    background: active ? "rgba(255,152,55,0.2)" : "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.92)",
    padding: "0 14px",
    fontSize: 12,
    cursor: "pointer",
  };
}
