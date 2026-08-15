import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearSelectedMailContext,
  getSelectedMailContext,
  setSelectedMailContext,
  type SelectedMailContext,
} from "../../modules/mail/selectedMailContext";
import { backendBase } from "../../lib/backendBase";

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

type InboxMessageDetailResponse = {
  ok: boolean;
  uid: string;
  messageId?: string | null;
  subject: string;
  fromName?: string | null;
  fromEmail?: string | null;
  to: string[];
  receivedAt?: string | null;
  bodyText: string;
  bodyHtml?: string | null;
};

type MicrosoftAuthStatus = {
  ok: boolean;
  connected?: boolean;
  oauthConfigured?: boolean;
  expiresInSec?: number;
};

type LearnedContactItem = {
  email: string;
  display_name: string;
  aliases: string[];
  source: string;
};

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

function sanitizeHtmlForDetail(input?: string | null): string {
  if (!input) return "";
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return input;
  const parser = new DOMParser();
  const doc = parser.parseFromString(input, "text/html");

  doc.querySelectorAll("script,style,iframe,object,embed,base,meta,link,form,input,button,textarea,select").forEach((el) =>
    el.remove()
  );

  doc.querySelectorAll("*").forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      const rawValue = (attr.value || "").trim();
      const value = rawValue.toLowerCase();
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
        return;
      }
      if ((name === "href" || name === "src") && value) {
        const allowed =
          value.startsWith("http://") ||
          value.startsWith("https://") ||
          value.startsWith("mailto:") ||
          value.startsWith("cid:") ||
          value.startsWith("data:image/");
        if (!allowed) {
          el.removeAttribute(attr.name);
        }
      }
    });
  });

  doc.querySelectorAll("a[href]").forEach((a) => {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer nofollow");
  });

  return doc.body?.innerHTML || "";
}

export default function ExchangeInboxPanel() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [mailboxMode, setMailboxMode] = useState<"inbox" | "sent">("inbox");
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
  const hasLoadedInboxSuccessfullyRef = useRef(false);
  const itemsRef = useRef<InboxItem[]>([]);
  const selectedUidRef = useRef<string | null>(null);
  const loadInboxRef = useRef<((options?: { silent?: boolean }) => Promise<void>) | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<InboxMessageDetailResponse | null>(null);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<LearnedContactItem[]>([]);
  const [manualName, setManualName] = useState("");
  const [manualEmail, setManualEmail] = useState("");

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

  const visible = useMemo(() => filtered.slice(0, 50), [filtered]);
  const unreadVisible = useMemo(
    () => visible.filter((item) => item.isRead === false && !openedUids.has(item.uid)).length,
    [visible, openedUids]
  );
  const sanitizedDetailHtml = useMemo(
    () => (detailData?.bodyHtml ? sanitizeHtmlForDetail(detailData.bodyHtml) : ""),
    [detailData?.bodyHtml]
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

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    selectedUidRef.current = selectedUid;
  }, [selectedUid]);

  const loadInbox = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (inboxLoadInFlightRef.current) {
      return;
    }
    inboxLoadInFlightRef.current = true;
    const hasExistingItems = itemsRef.current.length > 0;
    const showBlockingLoading = !silent && !hasExistingItems;
    if (showBlockingLoading) {
      setLoading(true);
      setError(null);
    } else {
      setRefreshing(true);
    }
    try {
      const inboxUrl = `${backendBase()}/api/mail/inbox?limit=50&offset=0&mailbox=${mailboxMode}`;
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
      setError(null);
      hasLoadedInboxSuccessfullyRef.current = true;
      const persisted = getSelectedMailContext();
      const currentSelectedUid = selectedUidRef.current;
      const bySelectedUid = currentSelectedUid ? nextItems.find((it) => it.uid === currentSelectedUid) : null;
      const byPersistedUid = persisted?.uid ? nextItems.find((it) => it.uid === persisted.uid) : null;
      applySelection(bySelectedUid || byPersistedUid || null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Inbox konnte nicht geladen werden.";
      const isBootstrapFetchFailure =
        !hasLoadedInboxSuccessfullyRef.current &&
        itemsRef.current.length === 0 &&
        message === "Inbox konnte nicht geladen werden.";
      setError(isBootstrapFetchFailure ? "Verbindung wird aufgebaut..." : message);
    } finally {
      inboxLoadInFlightRef.current = false;
      if (showBlockingLoading) {
        setLoading(false);
      }
      setRefreshing(false);
    }
  }, [mailboxMode]);

  useEffect(() => {
    loadInboxRef.current = loadInbox;
  }, [loadInbox]);

  const openMessageDetail = useCallback(async (item: InboxItem) => {
    if (!item?.uid) return;
    applySelection(item);
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await fetch(
        `${backendBase()}/api/mail/inbox/${encodeURIComponent(item.uid)}?mailbox=${mailboxMode}`
      );
      const data = (await res.json()) as InboxMessageDetailResponse;
      if (!res.ok || !data?.ok) {
        throw new Error("Nachricht konnte nicht geöffnet werden.");
      }
      setDetailData(data);
    } catch (err) {
      setDetailData(null);
      setDetailError(err instanceof Error ? err.message : "Nachricht konnte nicht geöffnet werden.");
    } finally {
      setDetailLoading(false);
    }
  }, [mailboxMode]);

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

  const logoutAndResetSetup = async () => {
    setMsAuthLoading(true);
    try {
      const resetRes = await fetch(`${backendBase()}/api/setup/mail/reset`, { method: "POST" });
      if (!resetRes.ok && resetRes.status !== 401) {
        throw new Error("Ausloggen fehlgeschlagen.");
      }
      try {
        await fetch(`${backendBase()}/api/auth/microsoft/logout`, { method: "POST" });
      } catch {
        // no-op
      }

      try {
        window.localStorage.setItem("fm_mail_onboarding_complete", "0");
      } catch {
        // ignore localStorage errors
      }
      window.location.reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ausloggen fehlgeschlagen.";
      setError(msg);
    } finally {
      setMsAuthLoading(false);
    }
  };

  const loadLearnedContacts = useCallback(async () => {
    setContactsLoading(true);
    setContactsError(null);
    try {
      const res = await fetch(`${backendBase()}/api/contacts/learned?personOnly=true&limit=250`);
      const data = (await res.json()) as { ok?: boolean; items?: LearnedContactItem[] };
      if (!res.ok || !data?.ok) {
        throw new Error("Kontakte konnten nicht geladen werden.");
      }
      setContacts(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setContactsError(err instanceof Error ? err.message : "Kontakte konnten nicht geladen werden.");
    } finally {
      setContactsLoading(false);
    }
  }, []);

  const addManualContact = useCallback(async () => {
    const name = manualName.trim();
    const email = manualEmail.trim();
    if (!name || !email) {
      setContactsError("Bitte Name und E-Mail ausfüllen.");
      return;
    }
    setContactsLoading(true);
    setContactsError(null);
    try {
      const res = await fetch(`${backendBase()}/api/contacts/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name, email, aliases: [name] }),
      });
      if (!res.ok) {
        throw new Error("Kontakt konnte nicht gespeichert werden.");
      }
      setManualName("");
      setManualEmail("");
      await loadLearnedContacts();
    } catch (err) {
      setContactsError(err instanceof Error ? err.message : "Kontakt konnte nicht gespeichert werden.");
    } finally {
      setContactsLoading(false);
    }
  }, [manualName, manualEmail, loadLearnedContacts]);

  const deleteContact = useCallback(async (email: string) => {
    if (!email) return;
    setContactsLoading(true);
    setContactsError(null);
    try {
      const res = await fetch(`${backendBase()}/api/contacts/learned?email=${encodeURIComponent(email)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Kontakt konnte nicht gelöscht werden.");
      }
      await loadLearnedContacts();
    } catch (err) {
      setContactsError(err instanceof Error ? err.message : "Kontakt konnte nicht gelöscht werden.");
    } finally {
      setContactsLoading(false);
    }
  }, [loadLearnedContacts]);

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
      void loadInbox({ silent: true });
    }, INBOX_AUTO_REFRESH_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [loadInbox]);

  useEffect(() => {
    const onSetupDone = () => {
      void loadMicrosoftAuthStatus();
      void loadInbox({ silent: true });
    };
    window.addEventListener("fm-mail-setup-complete", onSetupDone);
    return () => {
      window.removeEventListener("fm-mail-setup-complete", onSetupDone);
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

  useEffect(() => {
    setSelectedUid(null);
    setDetailOpen(false);
    setDetailData(null);
    setDetailError(null);
    clearSelectedMailContext();
    setActiveContext(null);
    void loadInboxRef.current?.({ silent: true });
  }, [mailboxMode]);

  useEffect(() => {
    if (!contactsOpen) return;
    void loadLearnedContacts();
  }, [contactsOpen, loadLearnedContacts]);

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
          onClick={() => setMailboxMode("inbox")}
          style={{
            height: 26,
            borderRadius: 999,
            border: mailboxMode === "inbox" ? "1px solid rgba(255,170,95,0.62)" : "1px solid rgba(255,255,255,0.18)",
            background: mailboxMode === "inbox" ? "rgba(255,152,55,0.18)" : "rgba(255,255,255,0.10)",
            color: "rgba(255,255,255,0.9)",
            padding: "0 10px",
            fontSize: 11,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Inbox
        </button>
        <button
          onClick={() => setMailboxMode("sent")}
          style={{
            height: 26,
            borderRadius: 999,
            border: mailboxMode === "sent" ? "1px solid rgba(255,170,95,0.62)" : "1px solid rgba(255,255,255,0.18)",
            background: mailboxMode === "sent" ? "rgba(255,152,55,0.18)" : "rgba(255,255,255,0.10)",
            color: "rgba(255,255,255,0.9)",
            padding: "0 10px",
            fontSize: 11,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Gesendet
        </button>
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
          title={msAuth?.connected ? "Verbindung trennen" : "Verbinden"}
        >
          {msAuth?.connected ? "Verbunden" : "Verbinden"}
        </button>
        <button
          onClick={() => {
            void logoutAndResetSetup();
          }}
          disabled={msAuthLoading}
          style={{
            height: 26,
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.10)",
            color: "rgba(255,255,255,0.85)",
            padding: "0 10px",
            fontSize: 11,
            cursor: msAuthLoading ? "wait" : "pointer",
            whiteSpace: "nowrap",
          }}
          title="Ausloggen und Konto wechseln"
        >
          Ausloggen
        </button>
        <button
          onClick={() => setContactsOpen((v) => !v)}
          style={{
            height: 26,
            borderRadius: 999,
            border: contactsOpen ? "1px solid rgba(255,165,92,0.55)" : "1px solid rgba(255,255,255,0.18)",
            background: contactsOpen ? "rgba(255,145,43,0.18)" : "rgba(255,255,255,0.10)",
            color: "rgba(255,255,255,0.88)",
            padding: "0 10px",
            fontSize: 11,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
          title="Kontakte anzeigen und verwalten"
        >
          Kontakte
        </button>
      </div>

      {contactsOpen && (
        <div
          style={{
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.04)",
            marginBottom: 10,
            padding: 10,
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="Name"
              style={{
                height: 30,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(0,0,0,0.25)",
                color: "#fff",
                padding: "0 10px",
                fontSize: 12,
                flex: 1,
              }}
            />
            <input
              value={manualEmail}
              onChange={(e) => setManualEmail(e.target.value)}
              placeholder="E-Mail"
              style={{
                height: 30,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(0,0,0,0.25)",
                color: "#fff",
                padding: "0 10px",
                fontSize: 12,
                flex: 1.3,
              }}
            />
            <button
              onClick={() => {
                void addManualContact();
              }}
              disabled={contactsLoading}
              style={{
                height: 30,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.9)",
                padding: "0 12px",
                fontSize: 11,
                cursor: contactsLoading ? "wait" : "pointer",
              }}
            >
              Kontakt hinzufügen
            </button>
          </div>

          {contactsLoading && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.62)" }}>Kontakte werden geladen...</div>}
          {contactsError && <div style={{ fontSize: 11, color: "rgba(255,170,170,0.92)" }}>{contactsError}</div>}
          {!contactsLoading && contacts.length === 0 && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.56)" }}>Keine Personenkontakte gespeichert.</div>
          )}
          {!contactsLoading && contacts.length > 0 && (
            <div style={{ maxHeight: 150, overflowY: "auto", display: "grid", gap: 6 }}>
              {contacts.map((c) => (
                <div
                  key={c.email}
                  style={{
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.03)",
                    padding: "6px 8px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.93)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.display_name}
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.62)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.email}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      void deleteContact(c.email);
                    }}
                    disabled={contactsLoading}
                    style={{
                      height: 24,
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.18)",
                      background: "rgba(255,255,255,0.08)",
                      color: "rgba(255,255,255,0.85)",
                      padding: "0 10px",
                      fontSize: 10,
                      cursor: contactsLoading ? "wait" : "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Löschen
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
      {refreshing && items.length > 0 && (
        <div style={{ marginBottom: 8, fontSize: 10, color: "rgba(255,255,255,0.52)", paddingLeft: 2 }}>
          Aktualisiert im Hintergrund...
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
        {detailOpen && (
          <div
            style={{
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(9,12,16,0.82)",
              padding: 12,
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <button
                onClick={() => setDetailOpen(false)}
                style={{
                  height: 24,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.9)",
                  padding: "0 10px",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                ← Zurück
              </button>
              {detailData?.receivedAt && (
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.52)" }}>{fmtDate(detailData.receivedAt)}</div>
              )}
            </div>
            {detailLoading && <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>Nachricht wird geladen...</div>}
            {detailError && <div style={{ color: "rgba(255,170,170,0.92)", fontSize: 12 }}>{detailError}</div>}
            {!detailLoading && !detailError && detailData && (
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.96)" }}>
                  {detailData.subject || "(ohne Betreff)"}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.72)" }}>
                  Von: {detailData.fromName || detailData.fromEmail || "Unbekannt"}
                </div>
                {detailData.to?.length > 0 && (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                    An: {detailData.to.join(", ")}
                  </div>
                )}
                {detailData.bodyHtml ? (
                  <div
                    style={{
                      marginTop: 4,
                      maxHeight: 300,
                      overflowY: "auto",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.1)",
                      background: "rgba(255,255,255,0.03)",
                      padding: "10px 11px",
                      fontSize: 12,
                      lineHeight: 1.45,
                      color: "rgba(255,255,255,0.88)",
                      wordBreak: "break-word",
                    }}
                    dangerouslySetInnerHTML={{ __html: sanitizedDetailHtml }}
                  />
                ) : (
                  <div
                    style={{
                      marginTop: 4,
                      maxHeight: 220,
                      overflowY: "auto",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.1)",
                      background: "rgba(255,255,255,0.03)",
                      padding: "10px 11px",
                      whiteSpace: "pre-wrap",
                      fontSize: 12,
                      lineHeight: 1.45,
                      color: "rgba(255,255,255,0.86)",
                    }}
                  >
                    {detailData.bodyText || "(kein Textinhalt)"}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {loading && items.length === 0 && (
          <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12 }}>Inbox wird geladen...</div>
        )}
        {error && (
          <div
            style={{
              color: error === "Verbindung wird aufgebaut..." ? "rgba(255,255,255,0.62)" : "rgba(255,170,170,0.92)",
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}
        {!loading && visible.length === 0 && (
          <div style={{ color: "rgba(255,255,255,0.58)", fontSize: 12 }}>
            {mailboxMode === "sent" ? "Keine gesendeten Nachrichten gefunden." : "Keine Nachrichten gefunden."}
          </div>
        )}
        {!loading &&
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
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.52)" }}>{fmtDate(item.receivedAt)}</div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void openMessageDetail(item);
                      }}
                      style={{
                        cursor: "pointer",
                        height: 18,
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.2)",
                        background: "rgba(255,255,255,0.08)",
                        color: "rgba(255,255,255,0.82)",
                        fontSize: 10,
                        padding: "0 8px",
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                    >
                      Öffnen
                    </button>
                  </div>
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

        {!loading && (
          <div style={{ paddingTop: 2, fontSize: 10, color: "rgba(255,255,255,0.42)" }}>
            {unreadVisible} ungelesen · {visible.length} sichtbar / {filtered.length} gefiltert / {total} gesamt
          </div>
        )}
      </div>
    </div>
  );
}

