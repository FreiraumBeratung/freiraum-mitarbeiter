import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import MailComposeForm from "../components/mail/MailComposeForm";
import MobileVoiceButton from "../components/voice/MobileVoiceButton";
import { backendBase } from "../lib/backendBase";
import { clearStoredSessionToken } from "../lib/sessionToken";
import { warmMic } from "../lib/micPermission";
import { releaseMicSession } from "../modules/stt";
import { voice } from "../modules/voice";
import { unlockTtsPlayback } from "../modules/voice/tts";
import {
  clearSelectedMailContext,
  getSelectedMailContext,
  setSelectedMailContext,
  type SelectedMailContext,
} from "../modules/mail/selectedMailContext";
import { type VoiceState } from "../modules/voice";
import { getSendReviewMode, setSendReviewMode, type SendReviewMode } from "../modules/voice/send_review_mode";
import {
  bumpDailyMailStats,
  readDailyMailStats,
  senderAvatarColor,
  senderInitial,
} from "../lib/fmInboxChrome";
import { fmTitleFont, fmWarmPage } from "../lib/fmVisual";

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

type MicrosoftAuthStatus = {
  ok: boolean;
  connected?: boolean;
  loggedIn?: boolean;
  oauthConfigured?: boolean;
  accountEmail?: string | null;
  accountDisplayName?: string | null;
  accountId?: string | null;
  isAdmin?: boolean;
};

type LearnedContactItem = {
  email: string;
  display_name: string;
  aliases: string[];
  source: string;
};

const INBOX_AUTO_REFRESH_MS = 60_000;
const INBOX_PAGE_SIZE = 80;
const OPENED_UIDS_STORAGE_KEY = "fm_exchange_opened_uids_v1";

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

function fmtListTime(value?: string | null): string {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  if (startOfLocalDay(new Date()) === startOfLocalDay(dt)) {
    return dt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  }
  return dt.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
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

function startOfLocalDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function dayGroupLabel(value?: string | null): string {
  if (!value) return "Ohne Datum";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "Ohne Datum";
  const diffDays = Math.round((startOfLocalDay(new Date()) - startOfLocalDay(dt)) / 86_400_000);
  if (diffDays === 0) return "Heute";
  if (diffDays === 1) return "Gestern";
  return dt.toLocaleDateString("de-DE", { day: "numeric", month: "long" });
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
  const [inboxReady, setInboxReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mailboxMode, setMailboxMode] = useState<"inbox" | "sent">("inbox");
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<InboxMessageDetailResponse | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceErrorHint, setVoiceErrorHint] = useState<string | null>(null);
  const [sendBanner, setSendBanner] = useState<string | null>(null);
  const [activeContext, setActiveContext] = useState<SelectedMailContext | null>(() => getSelectedMailContext());
  const [query, setQuery] = useState("");
  const [msAuth, setMsAuth] = useState<MicrosoftAuthStatus | null>(null);
  const [msAuthLoading, setMsAuthLoading] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<LearnedContactItem[]>([]);
  const [manualName, setManualName] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [composeSheetOpen, setComposeSheetOpen] = useState(false);
  const [composeSheetEntered, setComposeSheetEntered] = useState(false);
  const [sendReviewMode, setSendReviewModeState] = useState<SendReviewMode>(() => getSendReviewMode());
  const [inboxTotal, setInboxTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draftHasContent, setDraftHasContent] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [dailyStats, setDailyStats] = useState(() => readDailyMailStats());
  const [sentFolderTotal, setSentFolderTotal] = useState(0);
  const [heldInboxUnread, setHeldInboxUnread] = useState(0);
  const [heldInboxTotal, setHeldInboxTotal] = useState(0);
  const [openedUids, setOpenedUids] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(OPENED_UIDS_STORAGE_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.filter((v) => typeof v === "string" && v.trim().length > 0));
    } catch {
      return new Set();
    }
  });
  const inboxLoadInFlightRef = useRef(false);
  const inboxReloadQueuedRef = useRef(false);
  const loadInboxRef = useRef<(options?: { silent?: boolean; append?: boolean }) => Promise<void>>(async () => {});
  const itemsRef = useRef<InboxItem[]>([]);
  const mailboxModeRef = useRef(mailboxMode);
  mailboxModeRef.current = mailboxMode;
  const mailboxInitRef = useRef(true);
  const detailOpenRef = useRef(false);
  const sendBannerTimerRef = useRef<number | null>(null);

  const visibleItems = useMemo(() => {
    const normalized = items.map((item) => ({
      ...item,
      subject: cut(stripHtml(item.subject) || "(ohne Betreff)", 80),
      fromName: item.fromName ? cut(stripHtml(item.fromName), 36) : null,
      fromEmail: item.fromEmail ? cut(stripHtml(item.fromEmail), 40) : null,
      preview: item.preview ? cut(stripHtml(item.preview), 88) : null,
    }));
    const q = query.trim().toLowerCase();
    let next = normalized;
    if (unreadOnly && mailboxMode === "inbox") {
      next = next.filter((item) => item.isRead === false && !openedUids.has(item.uid));
    }
    if (!q) return next;
    return next.filter((item) =>
      `${item.subject} ${item.fromName || ""} ${item.fromEmail || ""} ${item.preview || ""}`.toLowerCase().includes(q)
    );
  }, [items, query, unreadOnly, mailboxMode, openedUids]);

  const loadInbox = useCallback(async (options?: { silent?: boolean; append?: boolean }) => {
    if (inboxLoadInFlightRef.current) {
      inboxReloadQueuedRef.current = true;
      return;
    }
    inboxLoadInFlightRef.current = true;
    const silent = options?.silent === true;
    const append = options?.append === true;
    const requestedMailbox = mailboxMode;
    const hasExistingItems = itemsRef.current.length > 0;
    if (append) {
      setLoadingMore(true);
    } else if (!silent && !hasExistingItems) {
      setLoading(true);
      setError(null);
    }
    try {
      const offset = append ? itemsRef.current.length : 0;
      const limit = append
        ? INBOX_PAGE_SIZE
        : Math.min(120, Math.max(INBOX_PAGE_SIZE, itemsRef.current.length || INBOX_PAGE_SIZE));
      const inboxUrl = `${backendBase()}/api/mail/inbox?limit=${limit}&offset=${offset}&mailbox=${requestedMailbox}`;
      let res = await fetch(inboxUrl);
      if ((res.status === 401 || res.status === 503) && !append) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        res = await fetch(inboxUrl);
        if (res.status === 401 || res.status === 503) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
          res = await fetch(inboxUrl);
        }
      }
      const data = (await res.json()) as InboxResponse;
      if (!res.ok || !data?.ok) throw new Error("inbox_pending");
      if (mailboxModeRef.current !== requestedMailbox) {
        inboxReloadQueuedRef.current = true;
        return;
      }
      const incoming = data.items || [];
      if (append) {
        const seen = new Set(itemsRef.current.map((item) => item.uid));
        setItems([...itemsRef.current, ...incoming.filter((item) => item?.uid && !seen.has(item.uid))]);
      } else {
        setItems(incoming);
      }
      setInboxTotal(typeof data.total === "number" ? data.total : incoming.length);
      setInboxReady(true);
      setError(null);
    } catch {
      if (itemsRef.current.length === 0) {
        setError(null);
      }
    } finally {
      inboxLoadInFlightRef.current = false;
      setLoading(false);
      setLoadingMore(false);
      if (inboxReloadQueuedRef.current) {
        inboxReloadQueuedRef.current = false;
        void loadInboxRef.current({ silent: itemsRef.current.length > 0 });
      }
    }
  }, [mailboxMode]);

  const openMessage = useCallback(
    async (item: InboxItem) => {
      if (!item?.uid) return;
      setComposeSheetOpen(false);
      setSelectedUid(item.uid);
      setSelectedMailContext(buildContext(item));
      setDetailOpen(true);
      setDraftHasContent(false);
      setOpenedUids((prev) => {
        if (prev.has(item.uid)) return prev;
        const next = new Set(prev);
        next.add(item.uid);
        return next;
      });
      setDetailLoading(true);
      setDetailError(null);
      try {
        window.__fm_set_mail_body?.("");
        window.__fm_set_mail_to?.("");
        window.__fm_set_mail_subject?.("");
      } catch {
        /* ignore */
      }
      unlockTtsPlayback();
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

  const closeComposeSheet = useCallback(() => {
    setComposeSheetOpen(false);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    setComposeSheetOpen(false);
    setDetailData(null);
    setDetailError(null);
    setSelectedUid(null);
    clearSelectedMailContext();
    setDraftHasContent(false);
    releaseMicSession();
    void voice.stop();
    try {
      window.__fm_set_mail_to?.("");
      window.__fm_set_mail_subject?.("");
      window.__fm_set_mail_body?.("");
    } catch {
      // ignore
    }
  }, []);

  const loadMicrosoftAuthStatus = useCallback(async () => {
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
  }, []);

  const logoutAndResetSetup = useCallback(async () => {
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
        clearStoredSessionToken();
      } catch {
        // ignore
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ausloggen fehlgeschlagen.");
    } finally {
      setMsAuthLoading(false);
    }
  }, []);

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
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    loadInboxRef.current = loadInbox;
  }, [loadInbox]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(OPENED_UIDS_STORAGE_KEY, JSON.stringify(Array.from(openedUids)));
    } catch {
      // ignore private mode / quota
    }
  }, [openedUids]);

  useEffect(() => {
    void loadInbox();
    void loadMicrosoftAuthStatus();
    void warmMic();
  }, [loadInbox, loadMicrosoftAuthStatus]);

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
      setError(null);
      setInboxReady(false);
      inboxLoadInFlightRef.current = false;
      void loadMicrosoftAuthStatus();
      void loadInbox();
    };
    window.addEventListener("fm-mail-setup-complete", onSetupDone);
    return () => window.removeEventListener("fm-mail-setup-complete", onSetupDone);
  }, [loadInbox, loadMicrosoftAuthStatus]);

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
      if (window.sessionStorage.getItem(stateBridgeKey) === "1") return;
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
    if (!contactsOpen) return;
    void loadLearnedContacts();
  }, [contactsOpen, loadLearnedContacts]);

  useEffect(() => {
    const handler = (e: CustomEvent<{ state: VoiceState }>) => {
      const next = e.detail?.state || "idle";
      setVoiceState(next);
      if (next === "listening" || next === "transcribing" || next === "acting") {
        setVoiceErrorHint(null);
      }
    };
    document.addEventListener("voice-state", handler as EventListener);
    const onHint = () => {
      const msg = (window as any).__fm_last_hint?.message;
      setVoiceErrorHint(typeof msg === "string" && msg.trim() ? msg : null);
    };
    window.addEventListener("fm-hint-update", onHint);
    const onMailSent = (event: Event) => {
      const message =
        (event as CustomEvent<{ message?: string }>).detail?.message || "Die E-Mail wurde versendet.";
      setSendBanner(message);
      if (sendBannerTimerRef.current) window.clearTimeout(sendBannerTimerRef.current);
      sendBannerTimerRef.current = window.setTimeout(() => setSendBanner(null), 4200);
      setVoiceErrorHint(null);
      try {
        const w = window as any;
        if (w.__fm_last_hint) w.__fm_last_hint = null;
      } catch {
        /* ignore */
      }
      releaseMicSession();
      void voice.stop();
      setDailyStats(bumpDailyMailStats("sent"));
      if (detailOpenRef.current) {
        setDailyStats(bumpDailyMailStats("replied"));
      }
      window.setTimeout(() => {
        if (inboxLoadInFlightRef.current) {
          inboxReloadQueuedRef.current = true;
          return;
        }
        void loadInboxRef.current({ silent: true });
      }, 900);
    };
    window.addEventListener("fm-mail-sent", onMailSent);
    return () => {
      document.removeEventListener("voice-state", handler as EventListener);
      window.removeEventListener("fm-hint-update", onHint);
      window.removeEventListener("fm-mail-sent", onMailSent);
      if (sendBannerTimerRef.current) window.clearTimeout(sendBannerTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setItems([]);
    setInboxTotal(0);
    setInboxReady(false);
    setLoading(true);
    setError(null);
    if (mailboxMode !== "inbox") {
      setUnreadOnly(false);
    }
    if (mailboxInitRef.current) {
      mailboxInitRef.current = false;
      return;
    }
    closeDetail();
  }, [mailboxMode, closeDetail]);

  useEffect(() => {
    if (mailboxMode !== "inbox") return;
    setHeldInboxUnread(items.filter((item) => item.isRead === false && !openedUids.has(item.uid)).length);
    if (inboxTotal > 0) setHeldInboxTotal(inboxTotal);
  }, [mailboxMode, items, openedUids, inboxTotal]);

  useEffect(() => {
    if (mailboxMode === "sent" && inboxTotal > 0) {
      setSentFolderTotal(inboxTotal);
    }
  }, [mailboxMode, inboxTotal]);

  useEffect(() => {
    const syncDay = () => setDailyStats(readDailyMailStats());
    const id = window.setInterval(syncDay, 60_000);
    document.addEventListener("visibilitychange", syncDay);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", syncDay);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadSentTotal = async () => {
      try {
        const res = await fetch(`${backendBase()}/api/mail/inbox?limit=1&offset=0&mailbox=sent`);
        const data = (await res.json()) as InboxResponse;
        if (cancelled || !res.ok || !data?.ok || typeof data.total !== "number") return;
        setSentFolderTotal(Math.max(0, data.total));
      } catch {
        // Zahl bleibt 0, bis Gesendet einmal geladen wurde.
      }
    };
    void loadSentTotal();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onChanged = (event: Event) => {
      const next = (event as CustomEvent<{ context: SelectedMailContext | null }>).detail?.context ?? null;
      setActiveContext(next);
    };
    window.addEventListener("fm-selected-mail-context", onChanged as EventListener);
    return () => window.removeEventListener("fm-selected-mail-context", onChanged as EventListener);
  }, []);

  useEffect(() => {
    (window as any).__fm_mobile_shell = true;
    setSendReviewMode(getSendReviewMode());
    return () => {
      (window as any).__fm_mobile_shell = false;
    };
  }, []);

  useEffect(() => {
    detailOpenRef.current = detailOpen;
  }, [detailOpen]);

  useEffect(() => {
    const onComposeOpen = () => {
      const ignoreUntil = Number((window as any).__fm_ignore_compose_open_until || 0);
      if (ignoreUntil && Date.now() < ignoreUntil) return;
      setDraftHasContent(true);
      if (detailOpenRef.current) return;
      setComposeSheetOpen(true);
      try {
        navigator.vibrate?.(16);
      } catch {
        // ignore
      }
    };
    window.addEventListener("fm-mobile-compose-open", onComposeOpen);
    return () => window.removeEventListener("fm-mobile-compose-open", onComposeOpen);
  }, []);

  useEffect(() => {
    if (!composeSheetOpen || detailOpen) {
      setComposeSheetEntered(false);
      return;
    }
    setComposeSheetEntered(false);
    let innerId = 0;
    const outerId = window.requestAnimationFrame(() => {
      innerId = window.requestAnimationFrame(() => setComposeSheetEntered(true));
    });
    return () => {
      window.cancelAnimationFrame(outerId);
      window.cancelAnimationFrame(innerId);
    };
  }, [composeSheetOpen, detailOpen]);

  const context = activeContext;
  const inboxHiddenForCompose = composeSheetOpen && !detailOpen;
  const replyTarget = cut(
    stripHtml(
      detailData?.fromName ||
        context?.fromName ||
        detailData?.fromEmail ||
        context?.fromEmail ||
        "Absender"
    ),
    42
  );
  const headerTitle = detailOpen
    ? `Antwort an ${replyTarget}`
    : inboxHiddenForCompose
      ? "Neue Mail"
      : mailboxMode === "sent"
        ? "Gesendet"
        : "Posteingang";
  const showAccountEmail = Boolean(msAuth?.accountEmail) && !detailOpen && !inboxHiddenForCompose;
  const inboxHasMore = !detailOpen && !inboxHiddenForCompose && items.length > 0 && items.length < inboxTotal;
  const unreadCount = heldInboxUnread;
  const answeredOfOpen = `${dailyStats.repliedToday} von ${heldInboxUnread + dailyStats.repliedToday}`;

  const toggleUnreadFilter = () => {
    if (mailboxMode !== "inbox") {
      setMailboxMode("inbox");
      setUnreadOnly(true);
      return;
    }
    setUnreadOnly((prev) => !prev);
  };

  const voiceHint =
    voiceState === "listening"
      ? "Hört zu…"
      : voiceState === "transcribing"
        ? "Versteht…"
        : voiceState === "acting"
          ? "Führt aus…"
          : voiceErrorHint
            ? voiceErrorHint
          : inboxHiddenForCompose
            ? "Entwurf prüfen – sag senden oder tippe Senden"
            : detailOpen
              ? sendReviewMode === "sofort"
                ? "Sofort – sprechen sendet die Antwort"
                : "Prüfen – Entwurf zuerst ansehen"
              : sendReviewMode === "sofort"
                ? "Neue Mail per Sprache – Sofort gilt bei geöffneter Mail"
                : "Neue Mail per Sprache";

  const reviewModeToggle = (
    <div
      role="group"
      aria-label="Senden prüfen oder sofort"
      style={{
        flexShrink: 0,
        display: "flex",
        borderRadius: 999,
        border: "1px solid rgba(255,166,77,0.28)",
        overflow: "hidden",
        background: "rgba(255,115,0,0.08)",
      }}
    >
      {(["pruefen", "sofort"] as SendReviewMode[]).map((mode) => {
        const active = sendReviewMode === mode;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={active}
            onClick={() => {
              setSendReviewModeState(mode);
              setSendReviewMode(mode);
            }}
            style={{
              height: 32,
              padding: "0 10px",
              border: "none",
              background: active ? "rgba(255,115,0,0.86)" : "transparent",
              color: active ? "#111" : "rgba(255,214,170,0.88)",
              fontSize: 11,
              fontWeight: active ? 700 : 500,
            }}
          >
            {mode === "pruefen" ? "Prüfen" : "Sofort"}
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: fmWarmPage,
        color: "#fff",
      }}
    >
      {sendBanner ? (
        <div
          role="status"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 80,
            padding: "calc(10px + env(safe-area-inset-top, 0px)) 16px 12px",
            background: "linear-gradient(180deg, rgba(46, 140, 90, 0.96), rgba(28, 92, 58, 0.94))",
            borderBottom: "1px solid rgba(180, 255, 210, 0.28)",
            color: "#f3fff8",
            fontSize: 15,
            fontWeight: 700,
            textAlign: "center",
            letterSpacing: "0.01em",
            boxShadow: "0 10px 28px rgba(0,0,0,0.35)",
          }}
        >
          {sendBanner}
        </div>
      ) : null}
      <header
        style={{
          flexShrink: 0,
          padding: "calc(12px + env(safe-area-inset-top, 0px)) 16px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {!detailOpen && !inboxHiddenForCompose ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span aria-hidden="true" style={sparkStyle} />
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.01em", whiteSpace: "nowrap" }}>
                <span style={{ color: "#fff" }}>Freiraum</span>{" "}
                <span style={{ color: "rgba(255,166,77,0.98)" }}>Mitarbeiter</span>
              </div>
            </div>
            {reviewModeToggle}
          </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {detailOpen || inboxHiddenForCompose ? (
            <button
              type="button"
              onClick={detailOpen ? closeDetail : closeComposeSheet}
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
                fontSize: detailOpen ? 17 : 26,
                fontWeight: 700,
                lineHeight: 1.15,
                fontFamily: fmTitleFont,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {detailOpen ? (
                <>
                  Antwort an <span style={{ color: "rgba(255,166,77,0.98)" }}>{replyTarget}</span>
                </>
              ) : (
                headerTitle
              )}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>{voiceHint}</div>
            {showAccountEmail ? (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.42)", marginTop: 2 }}>
                {msAuth?.accountEmail}
              </div>
            ) : null}
          </div>
          {detailOpen || inboxHiddenForCompose ? reviewModeToggle : null}
        </div>
        {!detailOpen && !inboxHiddenForCompose ? (
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            <label style={searchWrapStyle}>
              <span aria-hidden="true" style={searchIconStyle}>
                ⌕
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="In Mails suchen..."
                style={searchInputStyle}
              />
            </label>
            <div
              style={{
                display: "flex",
                flexWrap: "nowrap",
                gap: 5,
                overflowX: "auto",
              }}
            >
              <button type="button" onClick={() => setMailboxMode("inbox")} style={tabStyle(mailboxMode === "inbox")}>
                Inbox
                {heldInboxTotal > 0 ? (
                  <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 600, opacity: 0.72 }}>{heldInboxTotal}</span>
                ) : null}
              </button>
              <button type="button" onClick={() => setMailboxMode("sent")} style={tabStyle(mailboxMode === "sent")}>
                Gesendet
              </button>
              <button
                type="button"
                onClick={() => void loadInbox()}
                style={quietTabStyle}
              >
                Aktualisieren
              </button>
              {msAuth?.isAdmin ? (
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = "/admin";
                  }}
                  style={quietTabStyle}
                  title="Angemeldete Konten verwalten"
                >
                  Verwaltung
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void logoutAndResetSetup()}
                disabled={msAuthLoading}
                style={quietTabStyle}
                title="Ausloggen und Konto wechseln"
              >
                Ausloggen
              </button>
              <button
                type="button"
                onClick={() => setContactsOpen((v) => !v)}
                style={contactsOpen ? tabStyle(true) : quietTabStyle}
              >
                Kontakte
              </button>
            </div>
            <div style={statGridStyle}>
              <button type="button" onClick={toggleUnreadFilter} style={statCardStyle(unreadOnly && mailboxMode === "inbox", true)}>
                <StatGlyph kind="unread" />
                <span style={statValueStyle}>{heldInboxUnread}</span>
                <span style={statLabelStyle}>Ungelesen</span>
              </button>
              <div style={statCardStyle(false)}>
                <StatGlyph kind="sent" />
                <span style={statValueStyle}>{sentFolderTotal}</span>
                <span style={statLabelStyle}>Gesendet</span>
              </div>
              <div style={statCardStyle(false)}>
                <StatGlyph kind="today" />
                <span style={statValueStyle}>{dailyStats.sentToday}</span>
                <span style={statLabelStyle}>Heute</span>
              </div>
              <div style={statCardStyle(false)}>
                <StatGlyph kind="done" />
                <span style={{ ...statValueStyle, fontSize: 13 }}>{answeredOfOpen}</span>
                <span style={statLabelStyle}>Beantwortet</span>
              </div>
            </div>
            {contactsOpen ? (
              <div
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.04)",
                  padding: 10,
                  display: "grid",
                  gap: 8,
                }}
              >
                <input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Name"
                  style={fieldStyle}
                />
                <input
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  placeholder="E-Mail"
                  style={fieldStyle}
                />
                <button
                  type="button"
                  onClick={() => void addManualContact()}
                  disabled={contactsLoading}
                  style={tabStyle(false)}
                >
                  Kontakt hinzufügen
                </button>
                {contactsLoading ? (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.62)" }}>Kontakte werden geladen...</div>
                ) : null}
                {contactsError ? (
                  <div style={{ fontSize: 11, color: "rgba(255,170,170,0.92)" }}>{contactsError}</div>
                ) : null}
                {!contactsLoading && contacts.length === 0 ? (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.56)" }}>Keine Personenkontakte gespeichert.</div>
                ) : null}
                <div style={{ maxHeight: 140, overflowY: "auto", display: "grid", gap: 6 }}>
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
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.93)" }}>{c.display_name}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.62)" }}>{c.email}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void deleteContact(c.email)}
                        disabled={contactsLoading}
                        style={tabStyle(false)}
                      >
                        Löschen
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      <div
        style={{
          flex: inboxHiddenForCompose ? 0 : detailOpen ? "0 1 auto" : 1,
          minHeight: inboxHiddenForCompose ? 0 : 0,
          maxHeight: detailOpen ? "36vh" : undefined,
          overflowY: inboxHiddenForCompose ? "hidden" : "auto",
          padding: inboxHiddenForCompose ? 0 : "10px 12px 8px",
          display: inboxHiddenForCompose ? "none" : "block",
        }}
      >
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
                  borderRadius: 18,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.045)",
                  padding: 14,
                  marginBottom: 4,
                  maxHeight: "100%",
                  overflow: "auto",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 999,
                      flexShrink: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 15,
                      fontWeight: 700,
                      color: "#fff",
                      background: senderAvatarColor(detailData.fromEmail || detailData.fromName || detailData.uid),
                    }}
                  >
                    {senderInitial(detailData.fromName, detailData.fromEmail)}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 15,
                            fontWeight: 700,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {detailData.fromName || detailData.fromEmail || "Unbekannt"}
                        </div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.48)", marginTop: 2 }}>
                          {mailboxMode === "sent" ? "Gesendet" : "an: mich"}
                        </div>
                      </div>
                      {detailData.receivedAt ? (
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", flexShrink: 0 }}>
                          {fmtDate(detailData.receivedAt)}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 650, marginTop: 12 }}>{stripHtml(detailData.subject)}</div>
                <div
                  style={{
                    fontSize: 14,
                    lineHeight: 1.45,
                    color: "rgba(255,255,255,0.86)",
                    marginTop: 10,
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
            {!inboxReady ? (
              <div style={{ padding: 16, color: "rgba(255,255,255,0.62)", fontSize: 14, lineHeight: 1.45 }}>
                Einen Moment Geduld. Gleich erscheint dein Postfach.
              </div>
            ) : null}
            {inboxReady && error ? (
              <div style={{ padding: 16, color: "rgba(255,170,170,0.95)", fontSize: 14 }}>{error}</div>
            ) : null}
            {inboxReady && !loading && !error && visibleItems.length === 0 ? (
              <div style={{ padding: 16, color: "rgba(255,255,255,0.55)", fontSize: 14 }}>
                {unreadOnly
                  ? "Keine ungelesenen Nachrichten."
                  : "Keine Nachrichten. Unten auf das Mikro tippen, um eine neue Mail zu diktieren."}
              </div>
            ) : null}
            {visibleItems.map((item, index) => {
              const unread = item.isRead === false && !openedUids.has(item.uid);
              const active = item.uid === selectedUid;
              const group = dayGroupLabel(item.receivedAt);
              const prevGroup = index > 0 ? dayGroupLabel(visibleItems[index - 1]?.receivedAt) : null;
              const showGroup = group !== prevGroup;
              return (
                <div key={item.uid}>
                  {showGroup ? (
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        color: "rgba(255,255,255,0.42)",
                        padding: index === 0 ? "2px 4px 8px" : "12px 4px 8px",
                      }}
                    >
                      {group}
                    </div>
                  ) : null}
                <button
                  type="button"
                  onClick={() => void openMessage(item)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    borderRadius: 16,
                    border: active ? "1px solid rgba(255,166,77,0.72)" : "1px solid rgba(255,255,255,0.08)",
                    background: active ? "rgba(255,115,0,0.10)" : "rgba(255,255,255,0.045)",
                    boxShadow: active ? "0 0 22px rgba(255,115,0,0.16)" : "none",
                    color: "#fff",
                    padding: "12px 12px",
                    marginBottom: 8,
                    cursor: "pointer",
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                    boxSizing: "border-box",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 999,
                      flexShrink: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 15,
                      fontWeight: 700,
                      color: "#fff",
                      background: senderAvatarColor(item.fromEmail || item.fromName || item.uid),
                    }}
                  >
                    {senderInitial(item.fromName, item.fromEmail)}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: unread ? 700 : 600,
                        color: unread ? "rgba(255,255,255,0.99)" : "rgba(255,255,255,0.94)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.fromName || item.fromEmail || "Unbekannt"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.48)" }}>
                        {fmtListTime(item.receivedAt)}
                      </div>
                      {unread ? (
                        <span
                          aria-hidden="true"
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            background: "rgba(255,140,40,0.95)",
                          }}
                        />
                      ) : null}
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
                  </div>
                </button>
                </div>
              );
            })}
            {inboxHasMore ? (
              <button
                type="button"
                onClick={() => void loadInbox({ append: true })}
                disabled={loadingMore}
                style={{
                  width: "100%",
                  height: 40,
                  margin: "4px 0 10px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.05)",
                  color: "rgba(255,255,255,0.86)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: loadingMore ? "wait" : "pointer",
                }}
              >
                {loadingMore ? "Weitere Nachrichten…" : "Weitere laden"}
              </button>
            ) : null}
            {!loading && visibleItems.length > 0 ? (
              <div style={{ padding: "2px 4px 8px", fontSize: 11, color: "rgba(255,255,255,0.42)" }}>
                {unreadCount} ungelesen · {visibleItems.length} sichtbar
                {unreadOnly ? " · Filter an" : ""}
              </div>
            ) : null}
          </div>
        )}

      </div>

      <div
        style={
          detailOpen
            ? { flex: 1, minHeight: 0, overflowY: "auto", padding: "0 12px 8px" }
            : inboxHiddenForCompose
              ? {
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  padding: "10px 12px 8px",
                  transform: composeSheetEntered ? "translateY(0)" : "translateY(28px)",
                  opacity: composeSheetEntered ? 1 : 0,
                  transition: "transform 280ms ease, opacity 280ms ease",
                }
              : { position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }
        }
        aria-hidden={!detailOpen && !inboxHiddenForCompose}
      >
        <MailComposeForm compact mode={detailOpen ? "reply" : "compose"} />
      </div>

      <div
        style={{
          flexShrink: 0,
          borderTop: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(16,12,9,0.94)",
        }}
      >
        <MobileVoiceButton />
      </div>
    </div>
  );
}

function StatGlyph({ kind }: { kind: "unread" | "sent" | "today" | "done" }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      {kind === "unread" ? (
        <path
          fill="none"
          stroke="rgba(255,166,77,0.95)"
          strokeWidth="2"
          strokeLinejoin="round"
          d="M3.5 7.5h17v11h-17zM3.5 8.2l8.5 6.2 8.5-6.2"
        />
      ) : null}
      {kind === "sent" ? (
        <path
          fill="rgba(255,166,77,0.95)"
          d="M3.2 11.2l16.8-7.4-6.2 16.6-2.6-6.4-8-2.8z"
        />
      ) : null}
      {kind === "today" ? (
        <path
          fill="none"
          stroke="rgba(255,166,77,0.95)"
          strokeWidth="2"
          strokeLinejoin="round"
          d="M6 5.5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2zM8 4v3M16 4v3M4 10h16"
        />
      ) : null}
      {kind === "done" ? (
        <path
          fill="none"
          stroke="rgba(120,210,160,0.95)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5 12.5l5 5 9-10"
        />
      ) : null}
    </svg>
  );
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    height: 28,
    borderRadius: 999,
    border: active ? "1px solid rgba(255,115,0,0.95)" : "1px solid rgba(255,255,255,0.12)",
    background: active
      ? "linear-gradient(180deg, rgba(255,166,77,0.95), rgba(255,115,0,0.90))"
      : "rgba(255,255,255,0.06)",
    color: active ? "#111" : "rgba(255,255,255,0.86)",
    padding: "0 10px",
    fontSize: 11,
    fontWeight: active ? 700 : 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
  };
}

const sparkStyle: React.CSSProperties = {
  width: 14,
  height: 14,
  flexShrink: 0,
  background: "rgba(255,140,40,0.98)",
  clipPath: "polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%)",
};

const searchWrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  height: 40,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.05)",
  padding: "0 12px",
};

const searchIconStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.45)",
  fontSize: 16,
  lineHeight: 1,
};

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: 38,
  border: "none",
  background: "transparent",
  color: "#fff",
  fontSize: 16,
  outline: "none",
};

const statGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 6,
};

function statCardStyle(active: boolean, clickable = false): React.CSSProperties {
  return {
    borderRadius: 12,
    border: active ? "1px solid rgba(255,166,77,0.7)" : "1px solid rgba(255,255,255,0.08)",
    background: active ? "rgba(255,115,0,0.16)" : "rgba(255,255,255,0.045)",
    boxShadow: active ? "0 0 16px rgba(255,115,0,0.14)" : "none",
    padding: "8px 6px 7px",
    minHeight: 58,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 2,
    color: "#fff",
    cursor: clickable ? "pointer" : "default",
    textAlign: "left",
  };
}

const statValueStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  lineHeight: 1.1,
  color: "rgba(255,255,255,0.96)",
};

const statLabelStyle: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: "0.02em",
  color: "rgba(255,255,255,0.52)",
};

const quietTabStyle: React.CSSProperties = {
  height: 26,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.78)",
  padding: "0 8px",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const fieldStyle: React.CSSProperties = {
  height: 32,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(0,0,0,0.25)",
  color: "#fff",
  padding: "0 10px",
  fontSize: 12,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};
