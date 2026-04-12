import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PartnerBotBus } from "../PartnerBot";

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
    __fm_pending_body_replace?: string | null;
  }
}

export default function MailComposeForm() {
  const [sp] = useSearchParams();
  const [to, setTo] = useState(sp.get("to") || "");
  const [subject, setSubject] = useState(sp.get("subject") || "");
  const [body, setBody] = useState(sp.get("body") || "");
  const toRef = useRef(to);
  const subjectRef = useRef(subject);
  const bodyRef = useRef(body);

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
    const safeTo = toRef.current.trim();
    const safeBody = bodyRef.current.trim();
    if (!safeTo || !safeBody) return;

    const API_BASE =
      (import.meta.env.VITE_BACKEND_BASE_URL as string | undefined) ??
      (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
      "http://127.0.0.1:30521";

    const url = `${API_BASE.replace(/\/+$/, "")}/api/mail/send`;

    try {
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
    } catch {
      PartnerBotBus.say("Mailversand fehlgeschlagen (Verbindung).");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as Window;

    w.__fm_set_mail_body = (text: string) => {
      bodyRef.current = text;
      setBody(text);
    };
    w.__fm_set_mail_to = (addr: string) => {
      toRef.current = addr;
      setTo(addr);
    };
    w.__fm_set_mail_subject = (subj: string) => {
      subjectRef.current = subj;
      setSubject(subj);
    };
    w.__fm_get_mail_body = () => bodyRef.current || null;
    w.__fm_get_mail_subject = () => subjectRef.current || null;
    w.__fm_get_mail_to = () => toRef.current || null;
    w.__fm_preview_mail = () => handlePreview();
    w.__fm_send_mail_now = () => {
      void handleSendNow();
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
    };
  }, [handlePreview, handleSendNow]);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100%",
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "linear-gradient(180deg, rgba(17,20,25,0.95), rgba(9,12,16,0.95))",
        boxShadow: "0 16px 30px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.06)",
        padding: 14,
        display: "grid",
        gap: 8,
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontSize: 19, fontWeight: 700, color: "rgba(255,255,255,0.95)", lineHeight: 1.1 }}>E-Mail-Maske</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: -4, marginBottom: 4 }}>
        Von Sprache zu E-Mail: prüfen, anpassen oder direkt per Sprachbefehl versenden.
      </div>

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
        }}
      />

      <textarea
        placeholder="Nachricht"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        style={{
          width: "100%",
          height: 112,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(0,0,0,0.32)",
          color: "#fff",
          padding: 12,
          outline: "none",
          resize: "none",
          boxSizing: "border-box",
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
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
          data-fm-mail="send-now"
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
            cursor: "pointer",
            boxShadow: "0 8px 18px rgba(255,140,0,0.35)",
          }}
        >
          Senden
        </button>
      </div>
    </div>
  );
}
