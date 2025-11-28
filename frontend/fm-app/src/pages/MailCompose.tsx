import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PartnerBotBus } from "../components/PartnerBot";

declare global {
  interface Window {
    __fm_set_mail_body?: (text: string) => void;
    __fm_set_mail_to?: (address: string) => void;
    __fm_set_mail_subject?: (subject: string) => void;
    __fm_get_mail_body?: () => string | null;
    __fm_get_mail_subject?: () => string | null;
    __fm_preview_mail?: () => void;
    __fm_send_mail_now?: () => void;
  }
}

export default function MailCompose() {
  const [sp] = useSearchParams();
  const [to, setTo] = useState(sp.get("to") || "");
  const [subject, setSubject] = useState(sp.get("subject") || "");
  const [body, setBody] = useState(sp.get("body") || "");

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
        PartnerBotBus.say(`Mailversand fehlgeschlagen (${response.status}).`);
        alert(`Mailversand fehlgeschlagen (${response.status}): ${text || "Unbekannter Fehler"}`);
        return;
      }

      const data = await response.json().catch(() => ({} as any));
      console.log("[fm-mail] Mailversand erfolgreich", data);
      PartnerBotBus.say("E-Mail wurde erfolgreich gesendet.");
      alert("E-Mail wurde erfolgreich gesendet.");
    } catch (err) {
      console.error("[fm-mail] Mailversand – Netzwerk/Client-Fehler", err);
      PartnerBotBus.say("Mailversand fehlgeschlagen (Verbindung).");
      alert("Mailversand fehlgeschlagen (Verbindung).");
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

    console.log("[fm-mail] __fm_send_mail_now, __fm_set_mail_to, __fm_get_mail_body, __fm_get_mail_subject registriert");

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
      if (w.__fm_preview_mail) {
        console.log("[fm-mail] __fm_preview_mail beim Unmount entfernt");
        delete w.__fm_preview_mail;
      }
      if (w.__fm_send_mail_now) {
        console.log("[fm-mail] __fm_send_mail_now beim Unmount entfernt");
        delete w.__fm_send_mail_now;
      }
    };
  }, [handleSendNow, handlePreview, body, subject]);

  useEffect(() => {
    try {
      const prefs = { provider: "piper", voice: "thorsten", rate: 0.92, pitch: 0.95 };
      localStorage.setItem("fm_voice_prefs", JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="glass-card" style={{ margin: "16px auto", maxWidth: 980, padding: 18 }}>
      <h2 style={{ fontSize: 22, marginBottom: 10 }}>E-Mail verfassen</h2>
      <div style={{ display: "grid", gap: 10 }}>
        <input
          placeholder="An"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="glass-card"
          style={{ padding: 10 }}
        />
        <input
          placeholder="Betreff"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="glass-card"
          style={{ padding: 10 }}
        />
        <textarea
          placeholder="Nachricht"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          className="glass-card"
          style={{ padding: 10 }}
        />
        <div style={{ display: "flex", gap: 10 }}>
          <button className="chip" onClick={handlePreview}>
            Vorschau drucken
          </button>
          <button
            className="chip chip-active"
            data-fm-mail="send-now"
            onClick={handleSendNow}
          >
            Sofort senden
          </button>
        </div>
      </div>
    </div>
  );
}

