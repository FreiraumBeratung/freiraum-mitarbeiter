import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PartnerBotBus } from "../PartnerBot";
import { backendBase } from "../../lib/backendBase";

declare global {
  interface Window {
    __fm_set_mail_body?: (text: string) => void;
    __fm_set_mail_to?: (address: string) => void;
    __fm_set_mail_subject?: (subject: string) => void;
    __fm_get_mail_body?: () => string | null;
    __fm_get_mail_subject?: () => string | null;
    __fm_get_mail_to?: () => string | null;
    __fm_preview_mail?: () => void;
    __fm_send_mail_now?: () => void;
    __fm_reset_mail_draft?: () => void;
    __fm_reset_mail_flow?: () => void;
    __fm_pending_body_replace?: string | null;
    __fm_mobile_shell?: boolean;
    __fm_subject_locked?: boolean;
    __fm_subject_locked_value?: string | null;
    __fm_subject_lock_context_uid?: string | null;
  }
}

function notifyMobileComposeOpen(value: string) {
  if (typeof window === "undefined") return;
  if (!window.__fm_mobile_shell) return;
  if (!String(value || "").trim()) return;
  window.dispatchEvent(new CustomEvent("fm-mobile-compose-open"));
}

export default function MailComposeForm({ compact = false }: { compact?: boolean }) {
  const [sp] = useSearchParams();
  const [to, setTo] = useState(sp.get("to") || "");
  const [subject, setSubject] = useState(sp.get("subject") || "");
  const [body, setBody] = useState(sp.get("body") || "");
  const [sending, setSending] = useState(false);
  const toRef = useRef(to);
  const subjectRef = useRef(subject);
  const bodyRef = useRef(body);
  const sendingRef = useRef(false);

  useEffect(() => {
    toRef.current = to;
  }, [to]);

  useEffect(() => {
    subjectRef.current = subject;
  }, [subject]);

  useEffect(() => {
    bodyRef.current = body;
  }, [body]);

  const handlePreview = useCallback(() => {
    window.print();
  }, []);

  const handleSendNow = useCallback(async () => {
    if (sendingRef.current) {
      return;
    }
    const safeTo = toRef.current.trim();
    const safeBody = bodyRef.current.trim();
    if (!safeTo || !safeBody) {
      PartnerBotBus.say("Zum Senden fehlen Empfänger oder Inhalt. Ich bleibe in der Vorschau.");
      return;
    }

    const url = `${backendBase()}/api/mail/send`;

    try {
      sendingRef.current = true;
      setSending(true);
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: safeTo,
          subject: subjectRef.current?.trim() || null,
          body: safeBody,
        }),
      });

      if (!response.ok) {
        PartnerBotBus.say(`Mailversand fehlgeschlagen (${response.status}).`);
        return;
      }

      PartnerBotBus.say("Die E-Mail wurde versendet.");
      try {
        window.dispatchEvent(
          new CustomEvent("fm-mail-sent", { detail: { message: "Die E-Mail wurde versendet." } })
        );
        navigator.vibrate?.([50, 90, 50]);
      } catch {
        /* ignore */
      }
      const w = window as Window;
      w.__fm_subject_locked = false;
      w.__fm_subject_locked_value = null;
      w.__fm_subject_lock_context_uid = null;
      bodyRef.current = "";
      setBody("");
      w.__fm_pending_body_replace = null;
      w.__fm_wizard4_last_draft = null;
    } catch {
      PartnerBotBus.say("Mailversand fehlgeschlagen (Verbindung).");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, []);

  const handleResetDraft = useCallback(() => {
    toRef.current = "";
    subjectRef.current = "";
    bodyRef.current = "";
    setTo("");
    setSubject("");
    setBody("");
    sendingRef.current = false;
    setSending(false);

    const w = (typeof window !== "undefined" ? (window as any) : null);
    if (w && typeof w.__fm_reset_mail_flow === "function") {
      w.__fm_reset_mail_flow();
    } else if (w) {
      w.__fm_pending_body_replace = null;
      w.__fm_guided_mail_context = null;
      w.__fm_wizard4_last_draft = null;
      w.__fm_subject_locked = false;
      w.__fm_subject_locked_value = null;
      if (typeof w.__fm_clear_selected_mail_context === "function") {
        try { w.__fm_clear_selected_mail_context(); } catch {}
      }
      if (typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent("fm-hint-update"));
      }
    }

    PartnerBotBus.say("Entwurf zurückgesetzt.");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as Window;

    w.__fm_set_mail_body = (text: string) => {
      bodyRef.current = text;
      setBody(text);
      notifyMobileComposeOpen(text);
    };
    w.__fm_set_mail_to = (addr: string) => {
      toRef.current = addr;
      setTo(addr);
      notifyMobileComposeOpen(addr);
    };
    w.__fm_set_mail_subject = (subj: string) => {
      subjectRef.current = subj;
      setSubject(subj);
      notifyMobileComposeOpen(subj);
    };
    w.__fm_get_mail_body = () => bodyRef.current || null;
    w.__fm_get_mail_subject = () => subjectRef.current || null;
    w.__fm_get_mail_to = () => toRef.current || null;
    w.__fm_preview_mail = () => handlePreview();
    w.__fm_send_mail_now = () => {
      void handleSendNow();
    };
    w.__fm_reset_mail_draft = () => {
      handleResetDraft();
    };

    const pending = w.__fm_pending_body_replace;
    if (typeof pending === "string") {
      try {
        w.__fm_set_mail_body(pending);
      } catch {}
      w.__fm_pending_body_replace = null;
    }

    return () => {
      delete w.__fm_set_mail_body;
      delete w.__fm_set_mail_to;
      delete w.__fm_set_mail_subject;
      delete w.__fm_get_mail_body;
      delete w.__fm_get_mail_subject;
      delete w.__fm_get_mail_to;
      delete w.__fm_preview_mail;
      delete w.__fm_send_mail_now;
      delete w.__fm_reset_mail_draft;
    };
  }, [handlePreview, handleSendNow, handleResetDraft]);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100%",
        borderRadius: 18,
        border: compact ? "1px solid rgba(255,166,77,0.18)" : "1px solid rgba(255,255,255,0.12)",
        background: compact
          ? "linear-gradient(180deg, rgba(28,20,14,0.95), rgba(12,10,8,0.95))"
          : "linear-gradient(180deg, rgba(17,20,25,0.95), rgba(9,12,16,0.95))",
        boxShadow: "0 16px 30px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.06)",
        padding: 14,
        display: "grid",
        gap: 8,
        boxSizing: "border-box",
      }}
    >
      {compact ? (
        <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.95)", lineHeight: 1.1 }}>
          Entwurf
        </div>
      ) : (
        <>
          <div style={{ fontSize: 19, fontWeight: 700, color: "rgba(255,255,255,0.95)", lineHeight: 1.1 }}>E-Mail-Maske</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: -4, marginBottom: 4 }}>
            Von Sprache zu E-Mail: prüfen, anpassen oder direkt per Sprachbefehl versenden.
          </div>
        </>
      )}

      <input
        placeholder="An"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        style={{
          width: "100%",
          height: 36,
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(0,0,0,0.32)",
          color: "#fff",
          padding: "0 12px",
          outline: "none",
          boxSizing: "border-box",
          fontSize: 16,
        }}
      />

      <input
        placeholder="Betreff"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        style={{
          width: "100%",
          height: 36,
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(0,0,0,0.32)",
          color: "#fff",
          padding: "0 12px",
          outline: "none",
          boxSizing: "border-box",
          fontSize: 16,
        }}
      />

      <textarea
        placeholder="Nachricht"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        style={{
          width: "100%",
          height: compact ? 88 : 112,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(0,0,0,0.32)",
          color: "#fff",
          padding: 12,
          outline: "none",
          fontSize: 16,
          resize: "none",
          boxSizing: "border-box",
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handlePreview}
            style={{
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
              padding: "6px 12px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Vorschau
          </button>
          <button
            onClick={handleResetDraft}
            style={{
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
              padding: "6px 12px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Zurücksetzen
          </button>
        </div>
        <button
          data-fm-mail="send-now"
          disabled={sending}
          onClick={() => {
            void handleSendNow();
          }}
          style={{
            borderRadius: 10,
            border: "1px solid rgba(255,140,0,0.4)",
            background: "linear-gradient(180deg, rgba(255,166,77,0.95), rgba(255,140,0,0.92))",
            color: "#111",
            fontWeight: 700,
            padding: "6px 14px",
            cursor: sending ? "wait" : "pointer",
            boxShadow: "0 8px 18px rgba(255,140,0,0.35)",
            opacity: sending ? 0.78 : 1,
          }}
        >
          {sending ? "Senden..." : "Senden"}
        </button>
      </div>
    </div>
  );
}
