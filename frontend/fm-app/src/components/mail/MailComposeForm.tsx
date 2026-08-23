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
    __fm_begin_next_dictation?: () => void;
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
  const ignoreUntil = Number((window as any).__fm_ignore_compose_open_until || 0);
  if (ignoreUntil && Date.now() < ignoreUntil) return;
  window.dispatchEvent(new CustomEvent("fm-mobile-compose-open"));
}

const ATTACH_ACCEPT =
  "image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,.doc,.docx,.xls,.xlsx,.ppt,.pptx";
const ATTACH_MAX_FILES = 3;
const ATTACH_MAX_BYTES = 4 * 1024 * 1024;
const ATTACH_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

type OutgoingAttachment = {
  id: string;
  filename: string;
  contentType: string;
  contentBase64: string;
  size: number;
};

function safeAttachName(name: string): string {
  const base = String(name || "anhang").split(/[/\\]/).pop() || "anhang";
  const cleaned = base.replace(/[^A-Za-z0-9._\- äöüÄÖÜß()]/g, "_").replace(/^[.\s_]+|[.\s_]+$/g, "");
  return (cleaned || "anhang").slice(0, 120);
}

function guessAttachType(file: File): string {
  const type = String(file.type || "").toLowerCase().split(";")[0];
  if (ATTACH_ALLOWED_TYPES.has(type)) return type;
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "pdf") return "application/pdf";
  if (ext === "txt") return "text/plain";
  if (ext === "doc") return "application/msword";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "xls") return "application/vnd.ms-excel";
  if (ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === "ppt") return "application/vnd.ms-powerpoint";
  if (ext === "pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  return "";
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("read-failed"));
    reader.readAsDataURL(file);
  });
}

function isEchoOfLastSent(text: string): boolean {
  if (typeof window === "undefined") return false;
  const last = String((window as any).__fm_last_sent_body || "").trim().toLowerCase();
  const next = String(text || "").trim().toLowerCase();
  return Boolean(last && next && last === next);
}

export default function MailComposeForm({
  compact = false,
  mode = "compose",
}: {
  compact?: boolean;
  mode?: "compose" | "reply";
}) {
  const [sp] = useSearchParams();
  const [to, setTo] = useState(sp.get("to") || "");
  const [subject, setSubject] = useState(sp.get("subject") || "");
  const [body, setBody] = useState(sp.get("body") || "");
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<OutgoingAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const toRef = useRef(to);
  const subjectRef = useRef(subject);
  const bodyRef = useRef(body);
  const sendingRef = useRef(false);
  const attachmentsRef = useRef<OutgoingAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    toRef.current = to;
  }, [to]);

  useEffect(() => {
    subjectRef.current = subject;
  }, [subject]);

  useEffect(() => {
    bodyRef.current = body;
  }, [body]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  const handlePreview = useCallback(() => {
    window.print();
  }, []);

  const handleSendNow = useCallback(async () => {
    if (sendingRef.current) {
      return;
    }
    const safeTo = toRef.current.trim();
    const safeBody = bodyRef.current.trim();
    const files = attachmentsRef.current.slice(0, ATTACH_MAX_FILES);
    if (!safeTo || (!safeBody && files.length === 0)) {
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
          body: safeBody || " ",
          attachments: files.map((file) => ({
            filename: file.filename,
            contentType: file.contentType,
            contentBase64: file.contentBase64,
          })),
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
      (w as any).__fm_last_sent_body = safeBody.toLowerCase();
      attachmentsRef.current = [];
      setAttachments([]);
      setAttachError(null);
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
    attachmentsRef.current = [];
    setAttachments([]);
    setAttachError(null);
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

  const addAttachments = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setAttachError(null);
    const next = [...attachmentsRef.current];
    for (const file of Array.from(fileList)) {
      if (next.length >= ATTACH_MAX_FILES) {
        setAttachError("Höchstens drei Anhänge.");
        break;
      }
      if (file.size > ATTACH_MAX_BYTES) {
        setAttachError(`${safeAttachName(file.name)} ist größer als 4 MB.`);
        continue;
      }
      const contentType = guessAttachType(file);
      if (!contentType) {
        setAttachError("Dieser Dateityp ist nicht erlaubt.");
        continue;
      }
      try {
        const contentBase64 = await readFileAsBase64(file);
        if (!contentBase64) {
          setAttachError("Anhang konnte nicht gelesen werden.");
          continue;
        }
        next.push({
          id: `${Date.now()}-${next.length}-${safeAttachName(file.name)}`,
          filename: safeAttachName(file.name),
          contentType,
          contentBase64,
          size: file.size,
        });
      } catch {
        setAttachError("Anhang konnte nicht gelesen werden.");
      }
    }
    attachmentsRef.current = next;
    setAttachments(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as Window;

    w.__fm_set_mail_body = (text: string) => {
      if (isEchoOfLastSent(text)) return;
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
    w.__fm_begin_next_dictation = () => {
      bodyRef.current = "";
      setBody("");
      (w as any).__fm_last_sent_body = "";
      w.__fm_pending_body_replace = null;
      w.__fm_wizard4_last_draft = null;
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
      delete w.__fm_begin_next_dictation;
    };
  }, [handlePreview, handleSendNow, handleResetDraft]);

  const readyToSend = Boolean(to.trim() && (body.trim() || attachments.length > 0));

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100%",
        borderRadius: 18,
        border: compact ? "1px solid rgba(255,166,77,0.28)" : "1px solid rgba(255,255,255,0.12)",
        background: compact
          ? "linear-gradient(180deg, rgba(28,20,14,0.95), rgba(12,10,8,0.95))"
          : "linear-gradient(180deg, rgba(17,20,25,0.95), rgba(9,12,16,0.95))",
        boxShadow: compact
          ? "0 16px 30px rgba(0,0,0,0.42), 0 0 24px rgba(255,115,0,0.08), inset 0 1px 0 rgba(255,255,255,0.06)"
          : "0 16px 30px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.06)",
        padding: 14,
        display: "grid",
        gap: 8,
        boxSizing: "border-box",
      }}
    >
      {compact ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.95)", lineHeight: 1.1 }}>
            {mode === "reply" ? "Entwurf deiner Antwort" : "Neue Mail"}
          </div>
          {readyToSend ? (
            <span
              style={{
                flexShrink: 0,
                borderRadius: 999,
                border: "1px solid rgba(120, 210, 160, 0.35)",
                background: "rgba(46, 140, 90, 0.22)",
                color: "rgba(210, 255, 226, 0.96)",
                fontSize: 10,
                fontWeight: 700,
                padding: "4px 8px",
              }}
            >
              Bereit zum Senden
            </span>
          ) : null}
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
          height: compact ? 120 : 112,
          borderRadius: 12,
          border: compact ? "1px solid rgba(255,166,77,0.62)" : "1px solid rgba(255,255,255,0.12)",
          background: "rgba(0,0,0,0.32)",
          color: "#fff",
          padding: 12,
          outline: "none",
          fontSize: 16,
          resize: "none",
          boxSizing: "border-box",
          boxShadow: compact ? "inset 0 0 0 1px rgba(255,115,0,0.08)" : "none",
        }}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept={ATTACH_ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          void addAttachments(event.target.files);
        }}
      />
      {attachments.length > 0 ? (
        <div style={{ display: "grid", gap: 6 }}>
          {attachments.map((file) => (
            <div
              key={file.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                borderRadius: 10,
                border: "1px solid rgba(255,166,77,0.28)",
                background: "rgba(255,115,0,0.08)",
                padding: "6px 8px",
              }}
            >
              <div style={{ minWidth: 0, fontSize: 12, color: "rgba(255,255,255,0.9)" }}>
                {file.filename}
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = attachmentsRef.current.filter((item) => item.id !== file.id);
                  attachmentsRef.current = next;
                  setAttachments(next);
                }}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "rgba(255,214,170,0.9)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Weg
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {attachError ? (
        <div style={{ fontSize: 12, color: "rgba(255,174,174,0.95)" }}>{attachError}</div>
      ) : null}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {compact ? null : (
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
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              borderRadius: 10,
              border: "1px solid rgba(255,166,77,0.45)",
              background: "rgba(255,115,0,0.16)",
              color: "#fff",
              padding: "6px 12px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Anhang
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
