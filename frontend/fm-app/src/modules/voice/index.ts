import { parseIntentDE } from "./intent";
import { voiceState } from "./state";
import { speak } from "./tts";
import { recordAndTranscribe } from "../stt";
import { PartnerBotBus } from "../partnerbot";
import { triggerEmotion } from "../partnerbot/partnerbot_emotion";
import { showTransitionMessage } from "../../App";
import { routeVoiceIntent, type VoiceIntent } from "./intent_router";
import { getLastAction, setLastAction } from "./voice_action_store";
import type { NavigateFunction } from "react-router-dom";
import { askAssistant } from "../ai";
import { cleanEmailBodyFromAi } from "../../utils/email_text_utils";

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

const BACKEND = "http://127.0.0.1:30521";

interface Wizard3ParseResult {
  to: string | null;
  subject: string | null;
  tone: string | null;
  bodyInstructions: string | null;
  extraInstructions: string | null;
}

export type VoiceState = "idle" | "listening" | "transcribing" | "acting" | "done" | "error";

function dispatchState(s: VoiceState) {
  document.dispatchEvent(new CustomEvent("voice-state", { detail: { state: s } }));
}

let recognition: SpeechRecognition | null = null;

function getRecognition(): SpeechRecognition | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!ctor) return null;
  if (!recognition) {
    recognition = new ctor();
    recognition.lang = "de-DE";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
  }
  return recognition;
}

export class VoiceController {
  state: VoiceState = "idle";
  lastText = "";
  private listening = false;

  setState(s: VoiceState) {
    this.state = s;
    dispatchState(s);
    if (s === "listening" || s === "transcribing") {
      PartnerBotBus.pose("listen");
    } else if (s === "acting") {
      PartnerBotBus.pose("speak");
    } else {
      PartnerBotBus.pose("idle");
    }
  }

  async start() {
    const rec = getRecognition();

    if (!rec) {
      console.warn("[fm-voice] SpeechRecognition nicht verfügbar – fallback auf Recorder.");
      this.listening = true;
      this.setState("listening");
      const text = await recordAndTranscribe(6000);
      this.listening = false;
      if (text) {
        this.handleTranscript(text);
      } else {
        this.setState("error");
      }
      return;
    }

    if (this.listening) {
      return;
    }

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Ignore – Browser kann trotzdem aufnehmen
    }

    this.listening = true;
    rec.onresult = this.handleResult;
    rec.onerror = this.handleError;
    rec.onend = this.handleEnd;

    try {
      rec.start();
      this.setState("listening");
      console.log("[fm-voice] recognition started");
    } catch (err) {
      console.warn("[fm-voice] recognition start failed:", err);
      this.listening = false;
      this.setState("error");
    }
  }

  async stop() {
    const rec = getRecognition();
    if (!rec || !this.listening) {
      this.setState("idle");
      return;
    }
    this.listening = false;
    try {
      rec.stop();
      console.log("[fm-voice] recognition stop requested");
    } catch (err) {
      console.warn("[fm-voice] recognition stop failed:", err);
    }
  }

  private handleResult = (event: SpeechRecognitionEvent | any) => {
    const results = event.results;
    const last = results[results.length - 1];
    const transcript = last?.[0]?.transcript?.trim() || "";
    this.listening = false;
    if (!transcript) {
      this.setState("idle");
      return;
    }
    this.handleTranscript(transcript);
  };

  private handleError = (event: any) => {
    console.warn("[fm-voice] recognition error:", event);
    this.listening = false;
    this.setState("error");
  };

  private handleEnd = () => {
    if (this.listening) return;
    if (this.state === "listening") {
      this.setState("idle");
    }
  };

  private async handleTranscript(text: string) {
    this.lastText = text;
    console.log("[fm-voice] Final transcript:", text);
    document.dispatchEvent(new CustomEvent("voice:final", { detail: { text } }));
    this.setState("transcribing");
    await this.route(text);
  }

  async route(text: string) {
    this.setState("acting");
    try {
      const intent = parseIntentDE(text || "");

      if (intent.type === "lead_hunt" && (intent.payload.category || intent.payload.location)) {
        try {
          const osmResp = await fetch(`${BACKEND}/voice/intent`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          })
            .then((r) => r.json())
            .catch(() => null);

          if (osmResp?.ok && osmResp?.result) {
            const found = osmResp.result.found || 0;
            voiceState.lastOSMResult = osmResp.result;
            document.dispatchEvent(
              new CustomEvent("voice-osm-success", {
                detail: { result: osmResp.result },
              })
            );
            await speak(`Gefunden: ${found} Leads. Ergebnisse werden angezeigt.`);
            return;
          }
        } catch {
          // Fällt zurück auf Legacy-Endpoint unten
        }
      }

      if (intent.type === "lead_hunt") {
        const payload: Record<string, string> = { category: intent.payload.category || "demo" };
        if (intent.payload.location) payload.location = intent.payload.location;
        const resp = await fetch(`${BACKEND}/lead_hunter/hunt_async`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
          .then((r) => r.json())
          .catch(() => null);
        voiceState.lastLeadTaskId = resp?.task_id || null;
        if (voiceState.lastLeadTaskId) {
          await fetch(`${BACKEND}/api/lead_status/last/${voiceState.lastLeadTaskId}`, {
            method: "POST",
          }).catch(() => {});
        }
        await speak("Verstanden. Ich starte die Suche.");
      } else if (intent.type === "reminder") {
        const body: Record<string, unknown> = { title: intent.payload.title || "Nachfassung" };
        if (intent.payload.when) body.when = intent.payload.when;
        await fetch(`${BACKEND}/api/proactive/remember`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        try {
          await fetch(`${BACKEND}/api/proactive/trigger`, { method: "POST" });
        } catch {
          // optional trigger
        }
        await speak("Erledigt. Erinnerung ist gesetzt.");
      } else if (intent.type === "cancel") {
        if (voiceState.lastLeadTaskId) {
          await fetch(`${BACKEND}/lead_hunter/cancel/${voiceState.lastLeadTaskId}`, {
            method: "POST",
          }).catch(() => {});
          voiceState.lastLeadTaskId = null;
          await speak("Alles klar. Ich stoppe die letzte Suche.");
        } else {
          await speak("Es gibt nichts zu stoppen.");
        }
      } else {
        // Unknown intent – UI/PartnerBot informiert separat über Intent-Router
        return;
      }
    } catch (err) {
      console.warn("[fm-voice] route error:", err);
      this.setState("error");
      await speak("Da gab es ein Problem bei der Ausführung.");
      return;
    } finally {
      if (this.state !== "error") {
        this.setState("done");
      }
    }
  }
}

export const voice = new VoiceController();

/**
 * Helper-Funktion zum Setzen der E-Mail-Daten in der MailCompose-UI.
 * Kann sowohl von email-compose als auch von wizard3-one-shot verwendet werden.
 */
function applyEmailToComposeUI(params: {
  to?: string | null;
  subject?: string | null;
  body?: string | null;
  logPrefix?: string;
}) {
  const { to, subject, body, logPrefix = "[fm-voice] email-compose-apply" } = params;

  if (to && typeof window !== "undefined" && (window as any).__fm_set_mail_to) {
    // Normalisiere E-Mail-Adresse (falls nötig)
    const normalizedTo = to
      .replace(/\s+at\s+/gi, "@")
      .replace(/\s+punkt\s+de\b/gi, ".de")
      .replace(/\s+punkt\s+com\b/gi, ".com")
      .replace(/\s+punkt\s+net\b/gi, ".net")
      .replace(/\s+punkt\s+org\b/gi, ".org")
      .replace(/\s+punkt\s+/gi, ".")
      .replace(/\s+/g, "");
    console.log(`${logPrefix}: __fm_set_mail_to`, normalizedTo);
    (window as any).__fm_set_mail_to(normalizedTo);
  }

  if (subject && typeof window !== "undefined" && (window as any).__fm_set_mail_subject) {
    console.log(`${logPrefix}: __fm_set_mail_subject`, subject);
    (window as any).__fm_set_mail_subject(subject);
  }

  if (body && typeof window !== "undefined" && (window as any).__fm_set_mail_body) {
    console.log(`${logPrefix}: __fm_set_mail_body gesetzt`);
    (window as any).__fm_set_mail_body(body);
  }
}

function applyVoiceIntent(intent: VoiceIntent, navigate: NavigateFunction) {
  console.log("[fm-voice] intent result:", intent);

  if (intent.type === "navigate") {
    switch (intent.target) {
      case "control-center":
        navigate("/control-center");
        showTransitionMessage("Öffne Dashboard …");
        triggerEmotion("success");
        PartnerBotBus.say("Ich wechsle zum Control Center.");
        setLastAction({ kind: "navigate", description: "Wechsel zum Control Center." });
        return;
      case "lead-radar":
        navigate("/lead-radar");
        showTransitionMessage("Wechsle zum Lead-Radar …");
        triggerEmotion("success");
        PartnerBotBus.say("Ich öffne den Lead-Radar für dich.");
        setLastAction({ kind: "navigate", description: "Lead-Radar geöffnet." });
        return;
      case "leads":
        navigate("/leads");
        showTransitionMessage("Zeige Leads …");
        triggerEmotion("success");
        PartnerBotBus.say("Hier sind deine Leads.");
        setLastAction({ kind: "navigate", description: "Leads-Übersicht geöffnet." });
        return;
      case "voice-diagnostics":
        navigate("/voice-diagnostics");
        showTransitionMessage("Öffne Sprachdiagnose …");
        triggerEmotion("greeting");
        PartnerBotBus.say("Ich öffne die Voice Diagnostics.");
        setLastAction({ kind: "navigate", description: "Voice Diagnostics geöffnet." });
        return;
      case "mail-compose":
        navigate("/mail/compose");
        showTransitionMessage("Öffne E-Mail …");
        triggerEmotion("idea");
        PartnerBotBus.say("Ich öffne den E-Mail-Composer.");
        setLastAction({ kind: "navigate", description: "E-Mail-Composer geöffnet." });
        return;
    }
  }

  if (intent.type === "wizard3-one-shot") {
    console.log("[fm-voice] wizard3-one-shot erkannt:", intent.payload);
    
    // Bot reagiert sofort
    PartnerBotBus.pose("thinking");
    PartnerBotBus.say("Ich analysiere deine E-Mail-Anfrage …");
    
    // Navigiere ZUERST zum Mail-Compose (damit die Komponente gemountet ist)
    navigate("/mail/compose");
    showTransitionMessage("E-Mail wird vorbereitet …");
    triggerEmotion("idea");
    
    // Asynchron den Wizard3-Flow starten
    wizard3Parse(intent.payload.rawText)
      .then(async (parsed) => {
        console.log("[fm-voice] Wizard3-OneShot Payload:", parsed);
        
        // Body generieren
        const body = await wizard3BuildEmail(
          parsed.bodyInstructions || "",
          parsed.tone,
          parsed.extraInstructions
        );
        
        console.log("[fm-voice] wizard3-one-shot: Body generiert:", body);
        
        // Warte kurz, damit die MailCompose-Komponente gemountet ist
        await new Promise((resolve) => setTimeout(resolve, 100));
        
        // Setze E-Mail-Felder über Helper-Funktion
        applyEmailToComposeUI({
          to: parsed.to,
          subject: parsed.subject,
          body: body,
          logPrefix: "[fm-voice] wizard3-one-shot",
        });
        
        // lastAction setzen
        const recipient = parsed.to || "Unbekannt";
        setLastAction({
          kind: "email-compose",
          description: `E-Mail an ${recipient} mit Inhalt erstellt.`,
        });
        
        // Bot bestätigt
        PartnerBotBus.pose("lightbulb");
        PartnerBotBus.say("Ich habe die E-Mail erstellt. Vorschau oder sofort senden?");
      })
      .catch((err) => {
        console.error("[fm-voice] wizard3-one-shot: Fehler:", err);
        PartnerBotBus.pose("confused");
        PartnerBotBus.say("Beim Erstellen der E-Mail ist ein Fehler aufgetreten. Bitte versuche es erneut.");
      });
    
    return;
  }

  if (intent.type === "email-compose") {
    console.log("[fm-voice] email-compose intent:", intent);
    
    const params = new URLSearchParams();
    if (intent.toRaw) params.set("to", intent.toRaw);
    if (intent.subjectHint) params.set("subject", intent.subjectHint);
    if (intent.bodyHint) params.set("body", intent.bodyHint);
    const qs = params.toString();
    navigate(`/mail/compose${qs ? `?${qs}` : ""}`);
    showTransitionMessage("Bereite E-Mail vor …");
    triggerEmotion("idea");
    
    // Warte kurz, damit die MailCompose-Komponente gemountet ist
    setTimeout(() => {
      // Setze E-Mail-Felder über Helper-Funktion
      applyEmailToComposeUI({
        to: intent.to || intent.toRaw,
        subject: intent.subjectHint,
        body: intent.bodyHint,
        logPrefix: "[fm-voice] email-compose",
      });
    }, 100);
    
    // lastAction setzen für spätere KI-Integration
    const recipient = intent.to || intent.toRaw || "Unbekannt";
    const description = `E-Mail an ${recipient}.`;
    setLastAction({ kind: "email-compose", description });
    
    // NUR diese eine Nachricht sprechen - keine Vorschau, kein Senden, kein Doppel-Audio
    PartnerBotBus.say("Alles klar, ich habe die E-Mail vorbereitet. Was soll ich schreiben?");
    return;
  }

  if (intent.type === "leads-filter") {
    const params = new URLSearchParams({ range: intent.range });
    navigate(`/leads?${params.toString()}`);

    const message =
      intent.range === "today"
        ? "Ich zeige dir die Leads von heute."
        : intent.range === "yesterday"
          ? "Ich zeige dir die Leads von gestern."
          : "Ich zeige dir die Leads dieser Woche.";
    triggerEmotion("success");
    PartnerBotBus.say(message);
    setLastAction({ kind: "other", description: message });
    return;
  }

  if (intent.type === "last-action") {
    triggerEmotion("thinking");
    const last = getLastAction();
    if (!last) {
      PartnerBotBus.say(
        "Ich habe noch keine letzte Aktion gespeichert. Nutze zuerst eine Sprachaktion, zum Beispiel: Öffne den Lead-Radar.",
      );
      return;
    }
    PartnerBotBus.say(`Deine letzte Aktion war: ${last.description}`);
    return;
  }

  if (intent.type === "email-send") {
    console.log("[fm-voice] applyVoiceIntent(email-send) – versuche __fm_send_mail_now aufzurufen");
    try {
      if (typeof window === "undefined") {
        console.warn("[fm-voice] window ist undefined, kann __fm_send_mail_now nicht ausführen");
        PartnerBotBus.pose("confused");
        PartnerBotBus.say("E-Mail-Versand ist gerade nicht verfügbar.");
        return;
      }

      const w = window as any;
      const fn = w.__fm_send_mail_now;

      console.log("[fm-voice] typeof window.__fm_send_mail_now:", typeof fn);

      if (typeof fn === "function") {
        try {
          const last = getLastAction();
          const hasEmail = last && last.kind === "email-compose";
          if (hasEmail) {
            console.log("[fm-voice] rufe window.__fm_send_mail_now() auf …");
            PartnerBotBus.pose("thumbs-up");
            PartnerBotBus.say("Ich sende die E-Mail jetzt ab.");
            fn();
            console.log("[fm-voice] window.__fm_send_mail_now() wurde ohne Exception aufgerufen");
          } else {
            PartnerBotBus.pose("confused");
            PartnerBotBus.say(
              "Ich sehe gerade keine fertige E-Mail, die ich senden kann. Bitte öffne oder erstelle erst eine E-Mail.",
            );
          }
        } catch (err) {
          console.error("[fm-voice] Fehler beim Aufruf von window.__fm_send_mail_now()", err);
          PartnerBotBus.pose("confused");
          PartnerBotBus.say("Beim Senden der E-Mail ist ein Fehler aufgetreten.");
        }
      } else {
        console.warn("[fm-voice] window.__fm_send_mail_now ist keine Funktion – versuche Fallback über Button-Klick");
        try {
          const btn = document.querySelector<HTMLButtonElement>('[data-fm-mail="send-now"]');
          if (btn) {
            console.log("[fm-voice] Fallback: klicke Button [data-fm-mail=\"send-now\"]");
            PartnerBotBus.pose("thumbs-up");
            PartnerBotBus.say("Ich sende die E-Mail jetzt ab.");
            btn.click();
          } else {
            console.warn("[fm-voice] Fallback fehlgeschlagen: Button [data-fm-mail=\"send-now\"] nicht gefunden");
            PartnerBotBus.pose("confused");
            PartnerBotBus.say("E-Mail-Versand ist gerade nicht verfügbar.");
          }
        } catch (err) {
          console.error("[fm-voice] Fehler beim DOM-Fallback für email-send", err);
          PartnerBotBus.pose("confused");
          PartnerBotBus.say("Beim Senden der E-Mail ist ein Fehler aufgetreten.");
        }
      }
    } catch (err) {
      console.error("[fm-voice] Unerwarteter Fehler in applyVoiceIntent(email-send)", err);
      PartnerBotBus.pose("confused");
      PartnerBotBus.say("Beim Senden der E-Mail ist ein Fehler aufgetreten.");
    }
    // GANZ WICHTIG: Für diesen Intent KEINE KI-Anfrage starten, kein /api/ai/chat!
    return;
  }

  if (intent.type === "email-preview") {
    const last = getLastAction();
    if (last && last.kind === "email-compose" && typeof window !== "undefined" && window.__fm_preview_mail) {
      PartnerBotBus.pose("lightbulb");
      PartnerBotBus.say("Ich zeige dir die E-Mail-Vorschau.");
      window.__fm_preview_mail();
    } else {
      PartnerBotBus.pose("confused");
      PartnerBotBus.say(
        "Ich sehe gerade keine E-Mail, für die ich eine Vorschau anzeigen kann.",
      );
    }
    return;
  }

  // -----------------------
  // WIZARD 2 – Nur Anrede ändern
  // -----------------------
  if (intent.type === "wizard2-edit-anrede") {
    console.log("[fm-voice] applyVoiceIntent(wizard2-edit-anrede)", intent.newAnrede);
    handleWizard2EditAnrede(intent.newAnrede).catch((err) => {
      console.error("[fm-voice] handleWizard2EditAnrede Fehler:", err);
    });
    return;
  }

  // -----------------------
  // WIZARD 2 – Nur Body umschreiben
  // -----------------------
  if (intent.type === "wizard2-rewrite-body") {
    console.log("[fm-voice] applyVoiceIntent(wizard2-rewrite-body)", intent.instruction);
    handleWizard2RewriteBody(intent.instruction).catch((err) => {
      console.error("[fm-voice] handleWizard2RewriteBody Fehler:", err);
    });
    return;
  }

  // -----------------------
  // WIZARD 2 – Anrede ändern + Body umschreiben
  // -----------------------
  if (intent.type === "wizard2-edit-anrede-and-rewrite") {
    console.log(
      "[fm-voice] applyVoiceIntent(wizard2-edit-anrede-and-rewrite)",
      { newAnrede: intent.newAnrede, instruction: intent.instruction }
    );
    
    // Nur Rewrite mit forcedGreetingLine aufrufen (kein doppeltes Anrede-Handling)
    handleWizard2RewriteBody(intent.instruction, intent.newAnrede)
      .then(() => {
        // Nur EINE kombinierte Rückmeldung
        PartnerBotBus.say("Anrede und Text wurden aktualisiert.");
      })
      .catch((err) => {
        console.error("[fm-voice] handleWizard2EditAnredeAndRewrite Fehler:", err);
        PartnerBotBus.say("Beim Aktualisieren ist ein Fehler aufgetreten.");
      });
    return;
  }

  // -----------------------
  // WIZARD 2 – Betreff ändern
  // -----------------------
  if (intent.type === "wizard2-edit-subject") {
    console.log("[fm-voice] applyVoiceIntent(wizard2-edit-subject)", intent.newSubject);
    handleWizard2EditSubject(intent.newSubject);
    return;
  }

  if (intent.type === "ai-chat") {
    const query = intent.query;
    console.log("[fm-ai] KI-Anfrage ausgelöst:", query);

    // WICHTIG: Prüfe die VORHERIGE Aktion, BEVOR wir die neue setzen
    const lastActionBefore = getLastAction();
    const hadEmailBefore = lastActionBefore && lastActionBefore.kind === "email-compose";

    // lastAction speichern
    setLastAction({
      kind: "other",
      description: `KI-Anfrage: "${query}"`,
    });

    // Bot reagiert sofort, damit es sich responsiv anfühlt
    PartnerBotBus.pose("thinking");
    PartnerBotBus.say("Ich denke kurz nach …");

    // Asynchron die KI fragen
    // WICHTIG: Wenn eine E-Mail vorher geöffnet war, soll die KI NUR reinen E-Mail-Text zurückgeben
    const enhancedMessage = hadEmailBefore
      ? `Du bist ein E-Mail-Assistent. Erzeuge einen höflichen E-Mail-Text basierend auf der folgenden Anweisung.

Formuliere eine E-Mail, die folgendes ausdrückt:
"${query}"

REGELN:
- Füge KEINE Grußformel am Ende hinzu (z.B. "Viele Grüße", "Mit freundlichen Grüßen" usw.).
- Schreibe KEINE Signatur (kein Name, keine Firma, keine Kontaktdaten).
- Antworte NUR mit dem Text der E-Mail (Anrede + Haupttext), ohne Betreff.
- Keine Erklärungen, keine Einleitungen wie "Natürlich", "Gerne" oder "Hier ist eine mögliche Formulierung".
- Keine Fragen an mich zurück.
- Kein Markdown, keine Anführungszeichen um den gesamten Text.

Antworte ausschließlich mit dem reinen E-Mail-Text, ohne Erklärungen.`.trim()
      : query;

    const enhancedContext = hadEmailBefore
      ? "Dies ist ein Voice-Befehl im Freiraum-Mitarbeiter. Antworte nur mit E-Mail-Text."
      : "Dies ist ein Voice-Befehl im Freiraum-Mitarbeiter.";

    askAssistant(enhancedMessage, {
      context: enhancedContext,
    })
      .then((reply) => {
        // Prüfe, ob eine E-Mail vorher geöffnet war
        if (hadEmailBefore && typeof window !== "undefined" && window.__fm_set_mail_body) {
          // KI-Antwort filtern, bevor sie in den Body geschrieben wird
          const cleaned = cleanEmailBodyFromAi(reply);

          console.log("[fm-mail] AI-Reply raw:", reply);
          console.log("[fm-mail] AI-Reply cleaned:", cleaned);

          // Gefilterte KI-Antwort direkt in den E-Mail-Body schreiben
          window.__fm_set_mail_body(cleaned);

          // Bot reagiert passend
          PartnerBotBus.pose("lightbulb");
          PartnerBotBus.say(
            "Ich habe dir den Text in die E-Mail geschrieben. Vorschau oder sofort senden?",
          );
        } else {
          // Standardverhalten: nur vorlesen / anzeigen
          PartnerBotBus.pose("lightbulb");
          PartnerBotBus.say(reply);
        }
      })
      .catch((err) => {
        console.error("[fm-voice] KI-Fehler:", err);
        PartnerBotBus.pose("confused");
        PartnerBotBus.say(
          "Die KI-Antwort konnte gerade nicht geladen werden. Versuche es bitte später erneut.",
        );
      });

    return;
  }

  // UNKNOWN-FALL kann als absoluter Notfall-Fallback bleiben
  triggerEmotion("error");
  PartnerBotBus.say('Das habe ich nicht verstanden. Sag z. B. "Gehe zum Lead-Radar".');
}

/**
 * Parst einen Sprachbefehl für eine E-Mail mit Inhalt (Wizard3-OneShot).
 * Verwendet AI mit Context "Wizard3-OneShot-Parse" um to, subject, tone, bodyInstructions zu extrahieren.
 */
async function wizard3Parse(raw: string): Promise<Wizard3ParseResult> {
  console.log("[fm-voice] wizard3Parse: Starte AI-Parse Request für:", raw);

  const message = `
Du bist ein Parser für deutsche Sprachbefehle, die eine E-Mail beschreiben.

DU BEKOMMST:
- Einen deutschen Sprachbefehl eines Nutzers (z.B. "Schreibe freiraumberatung at web punkt de eine Mail wegen dem Termin morgen und sag ihm, dass er mich anrufen kann.")
- Der Befehl kann umgangssprachlich, unvollständig oder etwas durcheinander sein.

DEINE AUFGABE:
- Analysiere den vollständigen Sprachbefehl.
- Extrahiere folgende Felder:

  - "to": die E-Mail-Adresse des Empfängers (z.B. "freiraumberatung@web.de").
    - Wenn der Nutzer sie nur beschreibt ("at web punkt de"), normalisiere sie in eine echte Adresse.
  - "subject": einen kurzen, sinnvollen Betreff, der zum gesamten Inhalt passt.
  - "tone": eine grobe Tonalität der Mail, z.B. "freundlich", "professionell", "locker".
  - "bodyInstructions": eine kompakte, aber vollständige Beschreibung dessen, was im eigentlichen E-Mail-Text stehen soll.
    - Hier müssen ALLE wichtigen Inhalte des Sprachbefehls enthalten sein:
      - Worum geht es? (z.B. Termin morgen, Angebot, Rückfrage)
      - Was soll gesagt oder gefragt werden? (z.B. "bitte um Rückruf", "bestätige den Termin", "frage nach einer Uhrzeit")
      - Besondere Hinweise ("kurz halten", "locker", "sehr höflich" etc.)
  - "extraInstructions": optional, nur falls es zusätzliche, feinere Hinweise gibt, die nicht gut in "bodyInstructions" passen.

SEHR WICHTIG – KEINE NAMEN ERFINDEN:
- Du DARFST KEINE neuen Personennamen erfinden.
- Verwende nur Personennamen, die im Sprachbefehl WÖRTLICH vorkommen.
- Wenn im Sprachbefehl nur Pronomen wie "er", "sie", "ihm", "ihn", "ihr" vorkommen,
  dann formuliere bodyInstructions neutral, z.B.:
  - "bitte darum, dass er mich morgen anruft"
  - "frage nach, ob sie Zeit hat"
- Ersetze solche Pronomen NICHT durch konkrete Namen wie "Dennis", "Marvin" usw., wenn diese Namen im Sprachbefehl NICHT vorkommen.
- Wenn der Nutzer ausdrücklich einen Namen nennt (z.B. "sag Dennis, dass er mich anrufen kann"),
  dann darfst du diesen Namen in bodyInstructions verwenden.

WEITERE REGELN:
- Wirf KEINE relevanten Inhalte aus dem Sprachbefehl weg.
- Fasse den Befehl zusammen, aber so, dass keine wichtige Information verloren geht.
- Du darfst Formulierungen leicht glätten, aber der Sinn muss identisch bleiben.

ANTWORTFORMAT:
- Gib ausschließlich ein JSON-Objekt mit GENAU diesen Schlüsseln zurück:
  {
    "to": string | null,
    "subject": string | null,
    "tone": string | null,
    "bodyInstructions": string | null,
    "extraInstructions": string | null
  }

Beispiele (nur zur Orientierung):

- Befehl: "Schreibe freiraumberatung at web punkt de eine Mail wegen dem Termin morgen und sag ihm, dass er mich anrufen kann."
  ➜ bodyInstructions: "Es geht um den Termin morgen. Bitte darum, dass er mich anruft."

- Befehl: "Schreibe freiraumberatung at web punkt de eine Mail wegen dem Termin morgen und sag Dennis, dass er mich anrufen kann."
  ➜ bodyInstructions: "Es geht um den Termin morgen. Bitte Dennis, dich morgen anzurufen."

Sprachbefehl:
${raw}
`.trim();

  try {
    const reply = await askAssistant(message, {
      context: "Wizard3-OneShot-Parse",
    });

    console.log("[fm-voice] wizard3Parse: AI-Reply raw:", reply);

    // Versuche JSON aus der Antwort zu extrahieren
    let parsed: Wizard3ParseResult;
    try {
      // Entferne mögliche Markdown-Code-Blöcke
      const cleaned = reply
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.warn("[fm-voice] wizard3Parse: JSON-Parse fehlgeschlagen, versuche Fallback:", parseErr);
      // Fallback: Versuche JSON-Objekt aus dem Text zu extrahieren
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Kein gültiges JSON in AI-Antwort gefunden");
      }
    }

    console.log("[fm-voice] wizard3Parse: Parsed Result:", parsed);
    return parsed;
  } catch (err) {
    console.error("[fm-voice] wizard3Parse: Fehler:", err);
    throw err;
  }
}

/**
 * Generiert den E-Mail-Body basierend auf bodyInstructions und tone.
 */
async function wizard3BuildEmail(
  bodyInstructions: string,
  tone?: string | null,
  extraInstructions?: string | null
): Promise<string> {
  const body = [
    bodyInstructions,
    tone ? `Tonalität: ${tone}` : null,
    extraInstructions ? `Zusätzliche Hinweise: ${extraInstructions}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const aiPrompt = `
Du bist ein deutscher E-Mail-Assistent.

Du schreibst nur Anrede und Haupttext einer E-Mail, aber KEINE Grußformel und KEINE Signatur am Ende.

REGELN FÜR DIE ANREDE:

1) Wenn im Abschnitt "Kontext" ein Vorname EXPLIZIT wörtlich vorkommt
   (z.B. "Dennis", "Denis", "Marvin", "Leon", "Julian", "Jannik"),
   dann verwende eine persönliche Anrede wie z.B.:
   - "Hallo Dennis," oder
   - "Guten Morgen Marvin," usw.

2) Wenn im Kontext KEIN Vorname vorkommt:
   - Verwende KEINE Anrede mit Namen.
   - Nutze in diesem Fall nur neutrale Anreden wie:
     - "Guten Tag," oder
     - "Guten Morgen," oder
     - "Hallo," (OHNE Namen).
   - Du darfst in diesem Fall KEINEN Namen dazuerfinden.

3) Ignoriere E-Mail-Adressen, Domains und Firmennamen bei der Wahl der Anrede vollständig.
   Beispiele:
   - Aus "freiraumberatung@web.de" darfst du KEINEN Namen ableiten.
   - Aus "Freiraum Beratung" darfst du KEINEN Vornamen ableiten.
   - Nutze ausschliesslich Vornamen, die im Klartext im Kontext vorkommen.

4) Verwende NIEMALS einen Namen in der Anrede, der nicht wortwörtlich im Kontext steht.
   Errate oder erfinde keine Vornamen.

FORMAT-REGELN:

- Füge am Ende KEINE Zeile mit "Viele Grüße", "Mit freundlichen Grüßen",
  "Herzliche Grüße" oder ähnlichen Grußformeln an.
- Schreibe NICHT den Namen des Absenders am Ende.
- Antworte NUR mit dem E-Mail-Text (ohne Erklärungen, ohne JSON, nur reinen Text).
- Schreibe KEINE Betreffzeile und verwende NICHT das Wort "Betreff:".
- Der Betreff wird separat gesetzt, du erzeugst nur den eigentlichen E-Mail-Text (Anrede + Haupttext).

Kontext:
${bodyInstructions}

${tone ? `Tonalität: ${tone}` : ""}
${extraInstructions ? `Zusätzliche Hinweise: ${extraInstructions}` : ""}
`.trim();

  console.log("[fm-voice] wizard3BuildEmail: Starte Body-Generierung mit Prompt:", aiPrompt);

  try {
    const reply = await askAssistant(aiPrompt, {
      context: "Wizard3-BuildEmail",
    });

    // Entferne mögliche Grußformeln am Ende (Fallback)
    const cleaned = cleanEmailBodyFromAi(reply);
    console.log("[fm-voice] wizard3BuildEmail: Body generiert:", cleaned);
    return cleaned;
  } catch (err) {
    console.error("[fm-voice] wizard3BuildEmail: Fehler:", err);
    throw err;
  }
}

/**
 * Holt den aktuellen E-Mail-Body aus der UI.
 */
function getCurrentMailBody(): string | null {
  if (typeof window === "undefined") return null;
  
  // Versuche über globale Getter-Funktion
  if ((window as any).__fm_get_mail_body) {
    return (window as any).__fm_get_mail_body();
  }
  
  // Fallback: Versuche Textarea direkt zu finden
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea[placeholder*="Nachricht"], textarea[placeholder*="Message"]');
  if (textarea) {
    return textarea.value || null;
  }
  
  return null;
}

/**
 * Holt den aktuellen E-Mail-Betreff aus der UI.
 */
function getCurrentMailSubject(): string | null {
  if (typeof window === "undefined") return null;
  
  // Versuche über globale Getter-Funktion
  if ((window as any).__fm_get_mail_subject) {
    return (window as any).__fm_get_mail_subject();
  }
  
  // Fallback: Versuche Input direkt zu finden
  const input = document.querySelector<HTMLInputElement>('input[placeholder*="Betreff"], input[placeholder*="Subject"]');
  if (input) {
    return input.value || null;
  }
  
  return null;
}

/**
 * Extrahiert die erste Zeile (Anrede) aus einem E-Mail-Body.
 */
function extractGreetingLine(body: string): string | null {
  if (!body) return null;
  const lines = body.split("\n");
  const firstLine = lines[0]?.trim();
  if (firstLine && firstLine.length > 0 && !firstLine.includes("Betreff:")) {
    return firstLine;
  }
  return null;
}

/**
 * Entfernt die erste Zeile (Anrede) aus einem E-Mail-Body.
 */
function removeGreetingLine(body: string): string {
  if (!body) return body;
  const lines = body.split("\n");
  if (lines.length <= 1) return body;
  return lines.slice(1).join("\n").trimStart();
}

/**
 * Wizard2: Ändert nur die Anrede im E-Mail-Body.
 */
async function handleWizard2EditAnrede(newAnrede: string, options?: { silent?: boolean }): Promise<void> {
  console.log("[fm-voice] handleWizard2EditAnrede: newAnrede:", newAnrede);
  
  const currentBody = getCurrentMailBody();
  if (!currentBody) {
    console.warn("[fm-voice] handleWizard2EditAnrede: Kein Body gefunden");
    if (!options?.silent) {
      PartnerBotBus.say("Ich sehe gerade keine E-Mail, die ich bearbeiten kann.");
    }
    return;
  }
  
  // Entferne alte Anrede, füge neue hinzu
  const bodyWithoutGreeting = removeGreetingLine(currentBody);
  const newBody = `${newAnrede}\n\n${bodyWithoutGreeting}`.trim();
  
  if (typeof window !== "undefined" && window.__fm_set_mail_body) {
    window.__fm_set_mail_body(newBody);
    console.log("[fm-voice] handleWizard2EditAnrede: Body aktualisiert");
    if (!options?.silent) {
      PartnerBotBus.say("Anrede wurde aktualisiert.");
    }
  }
}

/**
 * Wizard2: Schreibt den E-Mail-Body um basierend auf einer Anweisung.
 */
async function handleWizard2RewriteBody(
  instruction: string,
  forcedGreetingLine?: string
) {
  if (!window.__fm_get_mail_body || !window.__fm_set_mail_body) {
    return;
  }

  const currentBody = (window.__fm_get_mail_body() || "").trim();

  // 1) Anrede + Resttext trennen
  let originalGreeting = "";
  let originalText = "";

  if (currentBody.length > 0) {
    const parts = currentBody.split(/\n\s*\n/);

    if (parts.length === 1) {
      originalGreeting = "";
      originalText = currentBody;
    } else {
      originalGreeting = parts[0].trim();
      originalText = parts.slice(1).join("\n\n").trim();
    }
  }

  // 2) prüfen ob Instruction die Anrede erwähnt
  const lowerInstr = instruction.toLowerCase();
  const mentionsAnrede = lowerInstr.includes("anrede");

  // 3) keepGreeting = true → Anrede bleibt
  const keepGreeting = !mentionsAnrede && !forcedGreetingLine;

  const prompt = `
Du bist ein deutscher E-Mail-Assistent.

Du bekommst:
- die bisherige Anrede in "OriginalAnrede"
- den bisherigen Resttext in "OriginalText"
- eine Anweisung, wie du den Text umschreiben sollst
- optional eine erzwungene neue Anrede ("forcedGreetingLine")
- ein Flag "keepGreeting", das angibt, ob die vorhandene Anrede exakt übernommen werden muss.

REGELN:

1) Antworte NUR mit dem kompletten E-Mail-Text (Anrede + Haupttext),
   ohne Erklärungen, ohne Betreff und OHNE Grußformel am Ende.
   Keine "Viele Grüße", "Mit freundlichen Grüßen", kein Name.
   Kein "Betreff:" schreiben.

2) Wenn keepGreeting = true:
   - Übernimm "OriginalAnrede" 1:1 als Anrede.
   - Schreibe NUR den Haupttext ("OriginalText") entsprechend der Anweisung um.
   - Wenn die Originalanrede leer ist, darfst du eine passende wählen.

3) Wenn keepGreeting = false UND forcedGreetingLine NICHT leer:
   - Verwende forcedGreetingLine 1:1 als Anrede.
   - Schreibe den Text gemäss der Anweisung um.

4) Wenn keepGreeting = false UND forcedGreetingLine leer ist:
   - Du darfst Anrede + Text komplett neu schreiben.

Daten:

OriginalAnrede:
${originalGreeting || "(leer)"}

OriginalText:
${originalText || "(leer)"}

forcedGreetingLine:
${forcedGreetingLine || "(leer)"}

keepGreeting:
${keepGreeting ? "true" : "false"}

Anweisung:
${instruction}
`.trim();

  const aiResponse = await askAssistant(prompt, {
    context: "Wizard2-Rewrite-Body",
  });

  const newBody = (aiResponse || "").trim();
  if (!newBody) {
    console.warn("[fm-voice] handleWizard2RewriteBody: AI-Antwort ist leer");
    return;
  }

  if (typeof window !== "undefined" && typeof window.__fm_set_mail_body === "function") {
    window.__fm_set_mail_body(newBody);
    console.log("[fm-voice] handleWizard2RewriteBody: Body aktualisiert und ins UI geschrieben");
  } else {
    console.warn(
      "[fm-voice] handleWizard2RewriteBody: __fm_set_mail_body nicht verfügbar – Body im UI konnte nicht aktualisiert werden."
    );
  }
}

/**
 * Wizard2: Ändert den Betreff.
 */
function handleWizard2EditSubject(newSubject: string) {
  if (!window.__fm_set_mail_subject) return;

  if (!newSubject) {
    window.__fm_set_mail_subject("");
    return;
  }

  const trimmed = newSubject.trim();
  if (trimmed.length === 0) {
    window.__fm_set_mail_subject("");
    return;
  }

  // Nur ersten Buchstaben groß – Rest unverändert
  const normalized =
    trimmed.charAt(0).toUpperCase() + trimmed.slice(1);

  window.__fm_set_mail_subject(normalized);
}

export function processVoiceCommand(transcript: string, navigate: NavigateFunction) {
  const intent = routeVoiceIntent(transcript);
  applyVoiceIntent(intent, navigate);
}