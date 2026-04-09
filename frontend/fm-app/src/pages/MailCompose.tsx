import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PartnerBotBus } from "../components/PartnerBot";
import RobotAvatar from "../components/robot/RobotAvatar";

// sayOnce Guard: Prevents duplicate "E-Mail wurde versendet" announcements
// Cooldown: 1200ms (only for mail_sent key)
let __fm_lastSayAt = { mail_sent: 0 };
function sayOnceMailSent(fnSpeak: () => void) {
  const now = Date.now();
  if (now - __fm_lastSayAt.mail_sent < 1200) {
    console.log("[fm-mail][voice] sayOnce: suppressing duplicate mail_sent announcement (cooldown)");
    return;
  }
  __fm_lastSayAt.mail_sent = now;
  fnSpeak();
}

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
    __fm_last_hint?: { kind: string; message: string; ts: number } | null;
    __fm_subject_manually_edited?: boolean;
    __fm_pending_body_replace?: string | null;
  }
}

export default function MailCompose() {
  const [sp] = useSearchParams();
  const [to, setTo] = useState(sp.get("to") || "");
  const [subject, setSubject] = useState(sp.get("subject") || "");
  const [body, setBody] = useState(sp.get("body") || "");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [autosendHint, setAutosendHint] = useState<string | null>(null);

  // Automatische "Vorschau oder sofort senden?" Nachricht entfernt
  // Die Nachricht wird jetzt nur noch vom Voice-Modul gesteuert

  const handlePreview = useCallback(() => {
    window.print();
  }, []);

  const handleSendNow = useCallback(async () => {
    console.log("[fm-mail] handleSendNow gestartet");

    if (!to || !to.trim()) {
      PartnerBotBus.say("Es ist kein Empfänger angegeben.");
      alert("Es ist kein Empfänger angegeben.");
      return;
    }
    if (!body || !body.trim()) {
      PartnerBotBus.say("Der E-Mail-Text ist leer.");
      alert("Der E-Mail-Text ist leer.");
      return;
    }

    const API_BASE =
      (import.meta.env.VITE_BACKEND_BASE_URL as string | undefined) ??
      (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
      "http://127.0.0.1:30521";

    const url = `${API_BASE.replace(/\/+$/, "")}/api/mail/send`;

    console.log("[fm-mail] handleSendNow – sende POST", url);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: to.trim(),
          subject: subject?.trim() || null,
          body: body.trim(),
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        console.error("[fm-mail] Mailversand fehlgeschlagen", response.status, text);
        // Nur TTS, kein blockierendes alert()
        PartnerBotBus.say(`Mailversand fehlgeschlagen (${response.status}).`);
        // Sanfte Fehler-Notification
        setSuccessMessage(`Fehler: Mailversand fehlgeschlagen (${response.status})`);
        setTimeout(() => setSuccessMessage(null), 5000);
        return;
      }

      const data = await response.json().catch(() => ({} as any));
      console.log("[fm-mail] Mailversand erfolgreich", data);
      // HINWEIS: Nur EINE TTS-Ausgabe beim erfolgreichen Versand (mit sayOnce Guard)
      sayOnceMailSent(() => PartnerBotBus.say("Die E-Mail wurde versendet."));
      // Sanfte, nicht-blockierende UI-Notification statt alert()
      setSuccessMessage("E-Mail wurde erfolgreich gesendet.");
      // Nach 4 Sekunden automatisch ausblenden
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      console.error("[fm-mail] Mailversand – Netzwerk/Client-Fehler", err);
      // Nur TTS, kein blockierendes alert()
      PartnerBotBus.say("Mailversand fehlgeschlagen (Verbindung).");
      // Sanfte Fehler-Notification
      setSuccessMessage("Fehler: Mailversand fehlgeschlagen (Verbindung)");
      setTimeout(() => setSuccessMessage(null), 5000);
    }
  }, [to, subject, body]);

  useEffect(() => {
    if (typeof window === "undefined") {
      console.warn("[fm-mail] window ist undefined, kann __fm_send_mail_now nicht registrieren");
      return;
    }

    const w = window as any;

    // Globalen Setter für E-Mail-Body bereitstellen
    w.__fm_set_mail_body = (text: string) => {
      // KI-Text in den Body schreiben
      setBody(text);
    };

    const pending = (window as any).__fm_pending_body_replace;
    if (typeof pending === "string" && pending.trim().length > 0) {
      try {
        (window as any).__fm_set_mail_body(pending);
      } catch {}
      (window as any).__fm_pending_body_replace = null;
    }

    // Globalen Setter für E-Mail-Empfänger bereitstellen
    w.__fm_set_mail_to = (addr: string) => {
      console.log("[fm-mail] __fm_set_mail_to", addr);
      setTo(addr);
    };

    // Globalen Setter für E-Mail-Betreff bereitstellen
    w.__fm_set_mail_subject = (subj: string) => {
      console.log("[fm-mail] __fm_set_mail_subject", subj);
      setSubject(subj);
    };

    // Globalen Getter für E-Mail-Body bereitstellen
    w.__fm_get_mail_body = () => {
      return body || null;
    };

    // Globalen Getter für E-Mail-Betreff bereitstellen
    w.__fm_get_mail_subject = () => {
      return subject || null;
    };

    // Globalen Getter für E-Mail-Empfänger bereitstellen
    w.__fm_get_mail_to = () => {
      return to || null;
    };

    // Vorschau-Hook registrieren
    w.__fm_preview_mail = () => {
      console.log("[fm-mail] preview triggered via window.__fm_preview_mail");
      handlePreview();
    };

    // Senden-Hook registrieren
    w.__fm_send_mail_now = () => {
      console.log("[fm-mail] __fm_send_mail_now aufgerufen – triggere handleSendNow");
      try {
        // handleSendNow ist async, aber wir müssen hier nicht awaiten
        handleSendNow();
      } catch (err) {
        console.error("[fm-mail] Fehler in __fm_send_mail_now/handleSendNow", err);
      }
    };

    console.log("[fm-mail] __fm_send_mail_now, __fm_set_mail_to, __fm_get_mail_body, __fm_get_mail_subject, __fm_get_mail_to registriert");

    // Cleanup beim Unmount
    return () => {
      if (w.__fm_set_mail_body) {
        delete w.__fm_set_mail_body;
      }
      if (w.__fm_set_mail_to) {
        console.log("[fm-mail] __fm_set_mail_to beim Unmount entfernt");
        delete w.__fm_set_mail_to;
      }
      if (w.__fm_set_mail_subject) {
        console.log("[fm-mail] __fm_set_mail_subject beim Unmount entfernt");
        delete w.__fm_set_mail_subject;
      }
      if (w.__fm_get_mail_body) {
        console.log("[fm-mail] __fm_get_mail_body beim Unmount entfernt");
        delete w.__fm_get_mail_body;
      }
      if (w.__fm_get_mail_subject) {
        console.log("[fm-mail] __fm_get_mail_subject beim Unmount entfernt");
        delete w.__fm_get_mail_subject;
      }
      if (w.__fm_get_mail_to) {
        console.log("[fm-mail] __fm_get_mail_to beim Unmount entfernt");
        delete w.__fm_get_mail_to;
      }
      if (w.__fm_preview_mail) {
        console.log("[fm-mail] __fm_preview_mail beim Unmount entfernt");
        delete w.__fm_preview_mail;
      }
      if (w.__fm_send_mail_now) {
        console.log("[fm-mail] __fm_send_mail_now beim Unmount entfernt");
        delete w.__fm_send_mail_now;
      }
    };
  }, [handleSendNow, handlePreview, body, subject, to]);

  useEffect(() => {
    try {
      const prefs = { provider: "piper", voice: "thorsten", rate: 0.92, pitch: 0.95 };
      localStorage.setItem("fm_voice_prefs", JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, []);

  const showHintFromWindow = useCallback(() => {
    const hint = (window as any).__fm_last_hint;
    if (hint && (hint.kind === "autosend_safety_preview" || hint.kind === "missing_body" || hint.kind === "missing_to" || hint.kind === "append_missing_text") && (Date.now() - hint.ts) < 30000) {
      setAutosendHint(hint.message);
      (window as any).__fm_last_hint = null;
      setTimeout(() => setAutosendHint(null), 6000);
    }
  }, []);

  // Prüfe auf UI-Hinweis beim Mount
  useEffect(() => {
    showHintFromWindow();
  }, [showHintFromWindow]);

  // Reagieren, wenn Voice „append_missing_text“ setzt, während Composer schon offen ist
  useEffect(() => {
    const onHint = () => showHintFromWindow();
    window.addEventListener("fm-hint-update", onHint);
    return () => window.removeEventListener("fm-hint-update", onHint);
  }, [showHintFromWindow]);

  return (
    <div className="w-full h-full flex">
      <div className="flex w-full h-full">
        {/* LEFT SIDE - ROBOT */}
        <div className="w-1/2 flex items-center justify-center">
          <RobotAvatar />
        </div>

        {/* RIGHT SIDE - MAIL */}
        <div className="w-1/2 flex items-center justify-center">
          <div className="bg-zinc-900/80 backdrop-blur-md rounded-2xl p-6 w-[400px] shadow-xl">
            <h2 className="text-white text-xl font-semibold mb-4">
              E-Mail verfassen
            </h2>

            <input
              placeholder="An"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full mb-2 p-2 rounded bg-zinc-800 text-white"
            />

            <input
              placeholder="Betreff"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full mb-2 p-2 rounded bg-zinc-800 text-white"
            />

            <textarea
              placeholder="Nachricht"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full mb-4 p-2 rounded bg-zinc-800 text-white h-32"
            />

            <div className="flex justify-between">
              <button className="bg-zinc-700 text-white px-3 py-2 rounded" onClick={handlePreview}>
                Vorschau drucken
              </button>
              <button
                className="bg-orange-500 text-black px-3 py-2 rounded"
                data-fm-mail="send-now"
                onClick={handleSendNow}
              >
                Sofort senden
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

