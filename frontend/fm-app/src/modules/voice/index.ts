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
import { parseWizard4Intent } from "../../logic/wizard4/intent";
import { generateWizard4Subject } from "../../logic/wizard4/subject";
import { generateWizard4Body } from "../../logic/wizard4/body";
import { buildWizard4EmailFromInput } from "../../logic/wizard4/email";
import { buildStatusEmailBody } from "../../logic/wizard4/status_brain";

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
  }
}

// Wizard4Intent global registrieren für Konsolen-Tests
(window as any).parseWizard4Intent = parseWizard4Intent;
console.log('[fm-voice] Wizard4Intent global registriert.');
(window as any).generateWizard4Subject = generateWizard4Subject;
console.log('[fm-voice] Wizard4Subject global registriert.');
(window as any).generateWizard4Body = generateWizard4Body;
console.log('[fm-voice] Wizard4Body global registriert.');
(window as any).buildWizard4EmailFromInput = buildWizard4EmailFromInput;
console.log('[fm-voice] Wizard4Email builder global registriert.');

// AutoSend 4.0 – globales Flag
const WIZARD4_AUTOSEND_ENABLED = true;

const BACKEND = "http://127.0.0.1:30521";

/**
 * Extrahiert eine E-Mail-Adresse aus einem Text per Regex.
 * Gibt die erste gefundene E-Mail-Adresse zurück oder null.
 */
function extractEmailFromText(text: string): string | null {
  if (!text) return null;
  const t = String(text).trim();

  // 1) Standard-Regex: findet saubere E-Mail direkt im Text
  const m = t.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (m && m[0]) return m[0];

  // 2) TLD-Cut-Fallback: schneidet alles nach bekannten TLDs ab
  // Beispiel: "freiraumberatung@web.deine" -> "freiraumberatung@web.de"
  const lower = t.toLowerCase();
  const tlds = ['.de', '.com', '.net', '.org', '.eu', '.io'];

  const atPos = lower.indexOf('@');
  if (atPos < 1) return null;

  // nur ein begrenztes Fenster betrachten, damit keine riesigen Texte matchen
  const window = lower.slice(0, Math.min(lower.length, atPos + 64));

  let bestEnd = -1;
  for (const tld of tlds) {
    const idx = window.indexOf(tld, atPos);
    if (idx !== -1) {
      const end = idx + tld.length;
      if (end > bestEnd) bestEnd = end;
    }
  }

  if (bestEnd !== -1) {
    const candidate = t.slice(0, bestEnd);
    return candidate.trim();
  }

  return null;
}

/**
 * Prüft, ob eine E-Mail-Adresse strict gültig ist.
 * Verwendet eine solide Basis-Validierung für unsere Zwecke.
 */
function isStrictValidEmail(email: string): boolean {
  if (!email) return false;
  const e = email.trim();
  // sehr solide Basis-Validierung für unsere Zwecke
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

/**
 * Prüft, ob im sourceText eine klare "Sofort senden"-Phrase vorkommt.
 * Nur wenn eine dieser Phrasen enthalten ist, erlauben wir sendMode = "sendNow".
 */
function shouldSendNowFromSourceText(sourceText?: string): boolean {
  if (!sourceText) return false;

  const normalized = sourceText
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  // KLARE SEND-PHRASEN – MASSIV ERWEITERT FÜR ROBUSTE ERKENNUNG
  // Wenn einer dieser Begriffe im gesamten erkannten Text vorkommt: sendMode = "sendNow"
  const autoSendTriggers = [
    // Basis-Varianten
    "sende",
    "senden",
    "schick sie",
    "schick die mail",
    "direkt raus",
    "sofort raus",
    "sofort senden",
    "direkt senden",
    "bitte abschicken",
    "nachricht direkt los",
    "nachricht direkt raus",
    "mail direkt raus",
    "ohne vorschau senden",
    // Erweiterte Varianten
    "schick sie sofort raus",
    "schicke sie sofort raus",
    "schick die mail sofort raus",
    "schick die nachricht sofort raus",
    "direkt rausschicken",
    "sende die mail direkt raus",
    "sende die nachricht direkt raus",
    "schick sie los",
    "schick die nachricht los",
    "schick die mail los",
    "und schick sie los",
    "und sende sie los",
    "einfach direkt senden",
    "bitte direkt rausschicken",
    "schick die sofort raus",
    "schick sofort raus",
    "schick direkt raus",
    "direkt raushauen",
    "direkt losschicken",
    "hau raus",
    "schick die nachricht direkt los",
    "schick die mail direkt los",
    "schick sie direkt los"
  ];

  for (const trigger of autoSendTriggers) {
    if (normalized.includes(trigger)) {
      console.log("[autosend] klare Autosend-Phrase erkannt:", trigger);
      return true;
    }
  }

  return false;
}

/**
 * Prüft, ob ein Token ein ungültiger Empfänger-Name ist (Pronomen, zu kurz, etc.)
 * TASK 4: Extended to include "es" as pronoun
 */
function isInvalidRecipientToken(name: string): boolean {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim().toLowerCase();
  if (trimmed.length < 2) return true;
  const invalidTokens = ['sie', 'ihn', 'ihr', 'ihm', 'mir', 'mich', 'dir', 'dich', 'uns', 'euch', 'es', 'jemand', 'jemanden', 'irgendwen', 'irgendjemand'];
  return invalidTokens.includes(trimmed);
}

/**
 * Bereinigt einen Namen für die Contact-Resolver-Anfrage
 * Entfernt führende Artikel/Präpositionen, nachgestellte Füllwörter, Kommata
 * Normalisiert für toleranteres Matching (z.B. "freiraum beratung" -> "freiraumberatung")
 */
function cleanNameForResolver(raw?: string | null): string | null {
  if (!raw) return null;

  // In Kleinbuchstaben umwandeln
  let text = raw.trim().toLowerCase();

  if (!text) return null;

  // Kommata und Sonderzeichen entfernen (außer Leerzeichen)
  text = text.replace(/[,.;:!?]/g, " ");

  // Mehrfach-Spaces reduzieren
  text = text.replace(/\s+/g, " ");

  // Führende und nachgestellte Füllwörter entfernen
  const leadingStopWords = ["dem", "den", "der", "die", "das", "bei", "an", "am", "im", "in", "vom", "zum", "zur", "bitte"];
  const trailingStopWords = ["eine", "einen", "ein", "ne", "nen", "kurze", "kurzen", "kurz", "mail", "email", "e-mail", "bitte"];

  let parts = text.split(" ").filter(Boolean);

  // Vorne Stopwörter entfernen
  while (parts.length > 0 && leadingStopWords.includes(parts[0])) {
    parts.shift();
  }

  // Hinten Stopwörter entfernen
  while (parts.length > 0 && trailingStopWords.includes(parts[parts.length - 1])) {
    parts.pop();
  }

  if (parts.length === 0) {
    return null;
  }

  const cleaned = parts.join(" ").trim();
  if (!cleaned) return null;

  // Normalisierung für toleranteres Matching:
  // "freiraum beratung" -> "freiraumberatung" (Leerzeichen entfernen für besseres Matching)
  // ABER: nur wenn es ein zusammengesetzter Name ist (mehrere Wörter)
  // Für einzelne Namen wie "thomas" bleibt es bei "thomas"
  const normalizedForMatching = cleaned.replace(/\s+/g, "");

  // Log für Debugging
  console.log('[fm-voice][wizard4][contact-resolver] Name bereinigt:', {
    original: raw,
    cleaned: cleaned,
    normalizedForMatching: normalizedForMatching
  });

  // Wir geben beide Varianten zurück - der Resolver kann beide versuchen
  // Für jetzt geben wir die normalisierte Version zurück (ohne Leerzeichen)
  // Das ermöglicht "freiraum beratung" -> "freiraumberatung" Matching
  return normalizedForMatching;
}

/**
 * Extrahiert den Empfängernamen aus einem normalisierten Transcript.
 * Unterstützt umgangssprachliche Mail-Sätze auf Deutsch.
 * 
 * @param normalized - Bereits normalisierter Text (lowercase, ohne Satzzeichen)
 * @returns Extrahierter Name oder null
 */
function extractRecipientNameFromTranscript(normalized: string): string | null {
  if (!normalized || !normalized.trim()) return null;
  
  let text = normalized.trim().toLowerCase();
  
  // Entferne Satzzeichen und Kommas
  text = text.replace(/[.,;:!?]/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  
  if (!text) return null;
  
  // Muster: "hau dem/den/der/die <NAME> ... mail"
  // Muster: "schreib dem/den <NAME> ... mail"
  const patterns = [
    /^(?:hau|schreib|schreibe|mach|mache)\s+(?:dem|den|der|die|das|einem|einen|an)\s+([^]+?)(?:\s+(?:ne|eine)\s+mail|\s+mail\s+|\s+e-mail|\s+email|\s+aber\s+|\s+und\s+|\s+bitte\s+|\s+nur\s+|\s+sofort\s+|\s+schick\s+)/i,
    /^(?:hau|schreib|schreibe|mach|mache)\s+(?:dem|den|der|die|das|einem|einen|an)\s+([^]+?)$/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      let name = match[1].trim();
      
      // Entferne führende Artikel/Stopwords
      name = name.replace(/^(dem|den|der|die|das|einem|einen|an)\s+/i, '');
      
      // Schneide an Konnektoren ab
      const connectors = [' aber ', ' und ', ' bitte ', ' nur ', ' sofort ', ' schick ', ' schicken ', ' raus ', ' rausschicken ', ' sie ', ' kurz ', ' kurze ', ' kurzen ', ' kurzne ', ' eben ', ' ne mail', ' eine mail', ' mail ', ' e mail ', ' e-mail ', ' email ', ' email'];
      for (const conn of connectors) {
        const idx = name.indexOf(conn);
        if (idx !== -1) {
          name = name.substring(0, idx);
        }
      }
      
      name = name.trim();
      if (name.length >= 2) {
        return name;
      }
    }
  }
  
  // Fallback: Muster "mail an <NAME>"
  const mailAnPattern = /mail\s+an\s+(?:dem|den|der|die|das|einem|einen)?\s*([^]+?)(?:\s+aber\s+|\s+und\s+|\s+bitte\s+|\s+nur\s+|\s+sofort\s+|$)/i;
  const mailAnMatch = text.match(mailAnPattern);
  if (mailAnMatch && mailAnMatch[1]) {
    let name = mailAnMatch[1].trim();
    name = name.replace(/^(dem|den|der|die|das|einem|einen)\s+/i, '');
    
    const connectors = [' aber ', ' und ', ' bitte ', ' nur ', ' sofort ', ' schick ', ' schicken ', ' raus ', ' rausschicken ', ' sie ', ' kurz ', ' kurze ', ' kurzen ', ' kurzne ', ' eben ', ' mail ', ' e mail ', ' e-mail ', ' email '];
    for (const conn of connectors) {
      const idx = name.indexOf(conn);
      if (idx !== -1) {
        name = name.substring(0, idx);
      }
    }
    
    name = name.trim();
    if (name.length >= 2) {
      return name;
    }
  }
  
  return null;
}

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
let lastTranscript: string = ""; // Für Wizard4Intent-Parsing

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
        // HINWEIS: Diese Ausgabe "Erledigt, Erinnerung ist gesetzt" gehört ausschließlich
        // zur Reminder-/Termin-Logik und darf NICHT im E-Mail-Kontext (Wizard 2/3) ausgelöst werden.
        
        // Prüfung: Wenn E-Mail-Kontext vorhanden ist, KEINEN Reminder setzen
        const lowerText = (text || "").toLowerCase();
        const isEmailKeywordInText =
          lowerText.includes("mail") ||
          lowerText.includes("e-mail") ||
          lowerText.includes("email") ||
          lowerText.includes("schreibe") ||
          lowerText.includes("schreib");
        
        // Prüfe auch lastAction, um E-Mail-Kontext zu erkennen (z.B. bei Wizard-2-Befehlen im laufenden Composer)
        const lastAction = getLastAction();
        const isEmailContextFromAction =
          lastAction &&
          (lastAction.kind === "email-compose" ||
           lastAction.description.toLowerCase().includes("e-mail") ||
           lastAction.description.toLowerCase().includes("mail"));

        if (isEmailKeywordInText || isEmailContextFromAction) {
          // E-Mail-Kontext erkannt -> Reminder-Intent ignorieren, damit Wizard3 übernimmt
          console.log("[fm-voice] Reminder-Intent im E-Mail-Kontext erkannt – ignoriert, damit Wizard3 übernimmt");
          return;
        }

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
 * Entfernt Sende-Phrasen aus dem Body-Text (z.B. "Schick sie." am Ende)
 */
function stripSendPhraseFromBody(body: string | null | undefined): string {
  if (body == null) {
    return "";
  }

  const raw = String(body);

  if (!raw.trim()) {
    return raw;
  }

  // Entfernt End-Phrasen wie:
  // "Schick sie."
  // "schick sie raus."
  // "schick sie sofort raus."
  const cleaned = raw.replace(
    /\s*schick sie(\s+(sofort\s+raus|raus))?[.!]?\s*$/i,
    ""
  );

  // Überflüssige Leerzeichen/Zeilenumbrüche am Ende weg,
  // normale Formatierung bleibt.
  return cleaned.replace(/\s+$/s, "");
}

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

  // Body setzen (auch wenn leer - wichtig für previewOnly)
  // body kann null, "" oder ein String sein - nur null sollte ignoriert werden
  if (body !== null && typeof window !== "undefined" && (window as any).__fm_set_mail_body) {
    const cleanedBody = stripSendPhraseFromBody(body);
    console.log(`${logPrefix}: __fm_set_mail_body gesetzt`, cleanedBody === '' ? '(leer)' : cleanedBody);
    (window as any).__fm_set_mail_body(cleanedBody);
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

  function normalizeEmailForAutoSend(raw: string): string | null {
    if (!raw) return null;
    const text = String(raw).trim();

    // finde irgendwas, was wie eine mail beginnt
    const start = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+/);
    if (!start) return null;

    const s = start[0];
    const lower = (s + text.slice(s.length)).toLowerCase();

    const tlds = ['.de', '.com', '.net', '.org', '.eu', '.io'];

    // suche die erste erlaubte tld NACH dem @
    const atPos = lower.indexOf('@');
    if (atPos < 1) return null;

    let bestEnd = -1;
    for (const tld of tlds) {
      const idx = lower.indexOf(tld, atPos);
      if (idx !== -1) {
        const end = idx + tld.length;
        if (end > bestEnd) bestEnd = end;
      }
    }
    if (bestEnd === -1) return null;

    const candidate = (s + text.slice(s.length)).slice(0, bestEnd).trim();

    // final strict check (keine spaces, genau ein @, dot tld vorhanden)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(candidate)) return null;

    // Zusätzlich: TLD muss in allowlist sein
    const candLower = candidate.toLowerCase();
    if (!tlds.some(t => candLower.endsWith(t))) return null;

    return candidate;
  }

  if (intent.type === "email-compose") {
    console.log("[fm-voice] email-compose intent:", intent);
    
    // WICHTIG: Ganzer Block wird in async IIFE gepackt, damit Resolver awaited werden kann
    (async () => {
      const w = window as any;
      let didAutoSend = false;
      
      // ============================================================
      // PHASE 1: Basis-Draft aus Intent erstellen (OHNE finalen Body-Style)
      // ============================================================
      const rawText = lastTranscript || intent.bodyHint || intent.toRaw || "";
      let wizard4Draft: any = null;
      
      if (rawText && typeof w.buildWizard4EmailFromInput === 'function') {
        try {
          wizard4Draft = w.buildWizard4EmailFromInput(rawText);
          // sourceText wird bereits in buildWizard4EmailFromInput gesetzt
          console.log('[fm-voice][wizard4] email draft from input:', rawText, wizard4Draft);
          console.log('[fm-voice][wizard4][debug] emailIntent snapshot', {
            to: (intent as any)?.to,
            toRaw: (intent as any)?.toRaw,
            draftToEmail: (wizard4Draft as any)?.toEmail,
          });
          
          w.__fm_wizard4_last_draft = wizard4Draft;
        } catch (err) {
          console.error('[fm-voice][wizard4] Fehler beim Bauen des Wizard4EmailDraft:', err);
        }
      } else {
        console.log(
          '[fm-voice][wizard4] kein rawText oder buildWizard4EmailFromInput nicht verfügbar',
          { rawText }
        );
      }
      
      // TASK 4: Pronoun safety check
      // Prüfe ob toName ein Pronomen ist und setze auf null
      if (wizard4Draft && wizard4Draft.toName && isInvalidRecipientToken(wizard4Draft.toName)) {
        wizard4Draft.toName = null;
        console.log('[wizard4][safety-pronoun] toName invalid (pronoun) -> cleared:', wizard4Draft.toName);
      }
      
      // TASK 4: Also check intent.toRaw for pronouns
      if (intent && (intent as any).toRaw && isInvalidRecipientToken((intent as any).toRaw)) {
        console.log('[wizard4][safety-pronoun] intent.toRaw is pronoun -> cleared:', (intent as any).toRaw);
        (intent as any).toRaw = undefined;
        // Clear wizard4Draft.toName as well if it was set from toRaw
        if (wizard4Draft) {
          wizard4Draft.toName = null;
        }
      }
      
      // Fallback: Empfängername aus Transcript extrahieren, wenn intent.toRaw fehlt und draft.toName null
      if (wizard4Draft && (!(intent as any)?.toRaw || !(intent as any).toRaw.trim()) && (!wizard4Draft.toName || !wizard4Draft.toName.trim())) {
        const normalizedTranscript = (lastTranscript || "").toLowerCase().replace(/[.,;:!?]/g, ' ').replace(/\s+/g, ' ').trim();
        const candidateName = extractRecipientNameFromTranscript(normalizedTranscript);
        if (candidateName) {
          wizard4Draft.toName = candidateName;
          console.log('[fm-voice][wizard4][debug] extracted toName fallback:', candidateName);
        }
      }
      
      // ============================================================
      // SENDMODE-LOGIK: Priorität 1) Intent-Meta, 2) Text-Trigger
      // ============================================================
      if (wizard4Draft) {
        const emailIntent: any = intent;
        const statusMeta = emailIntent?.meta?.statusEmail;
        const freeDictationMeta = emailIntent?.meta?.freeDictationMeta || null;
        
        // Standard: immer erstmal auf "previewOnly"
        let sendMode: "previewOnly" | "sendNow" = "previewOnly";
        
        // Generische AutoSend-Erkennung nur, wenn KEIN Free-Diktat
        if (!freeDictationMeta) {
          // 1. Prio: explizites AutoSend aus dem Intent-Meta
          if (statusMeta?.autoSend) {
            sendMode = "sendNow";
            console.log('[autosend] sendMode = sendNow (AutoSend aus Intent-Meta erkannt)');
          } else {
            // 2. Prio: bestehende Text-Trigger-Logik (massiv erweitert)
            if (shouldSendNowFromSourceText(wizard4Draft.sourceText)) {
              sendMode = "sendNow";
              console.log('[autosend] sendMode = sendNow (klare Send-Phrase im Text erkannt)');
            } else {
              sendMode = "previewOnly";
              console.log('[autosend] sendMode = previewOnly (keine klare Send-Phrase)');
            }
          }
        }
        
        // A3.4 – Free-Dictation: AutoSend optional erlauben (nach allgemeiner Logik, damit es sich durchsetzt)
        if (freeDictationMeta) {
          // TASK 4: Pronoun safety - prevent AutoSend if toName is a pronoun
          const currentToName = wizard4Draft?.toName || emailIntent?.toRaw || '';
          if (freeDictationMeta.autoSend) {
            // Check if toName or toRaw is a pronoun
            if (currentToName && isInvalidRecipientToken(currentToName)) {
              sendMode = "previewOnly";
              console.log('[wizard4][safety-pronoun] AutoSend cancelled: pronoun detected in toName/toRaw:', currentToName);
            } else {
              sendMode = "sendNow";
              console.log('[autosend][free-dictation] AutoSend aktiv (A3.4), sendMode = sendNow.');
            }
          } else {
            sendMode = "previewOnly";
            console.log('[autosend][free-dictation] Kein AutoSend-Wunsch erkannt, sendMode = previewOnly.');
          }
        }
        
        // TASK 4: Final pronoun safety check - prevent AutoSend if toName is still a pronoun
        if (sendMode === "sendNow" && wizard4Draft) {
          const finalToName = wizard4Draft.toName || emailIntent?.toRaw || '';
          if (finalToName && isInvalidRecipientToken(finalToName)) {
            sendMode = "previewOnly";
            console.log('[wizard4][safety-pronoun] AutoSend cancelled (final check): pronoun detected:', finalToName);
          }
        }
        
        wizard4Draft.sendMode = sendMode;
        console.log('[autosend] final sendMode:', wizard4Draft.sendMode, 'sourceText:', wizard4Draft.sourceText);
      }
      
      // ============================================================
      // PHASE 2: Contact Resolver anwenden (toEmail + toName aktualisieren)
      // ============================================================
      let finalToEmail: string | null = null;
      let safeAutoSendEmail: string | null = null;
      
      try {
        // Kandidaten aus intent + draft extrahieren
        const fromIntentToRaw = (intent && typeof (intent as any).toRaw === 'string') 
          ? String((intent as any).toRaw).trim() 
          : '';
        const fromIntentTo = (intent && typeof (intent as any).to === 'string') 
          ? String((intent as any).to).trim() 
          : '';
        const fromDraftName = (wizard4Draft && typeof wizard4Draft.toName === 'string') 
          ? wizard4Draft.toName.trim() 
          : '';
        const fromDraftToEmail = (wizard4Draft && typeof wizard4Draft.toEmail === 'string') 
          ? wizard4Draft.toEmail.trim() 
          : '';
        
        // Resolver-Pipeline:
        // 1) intent.toEmail (falls im Intent direkt erkannt) -> direkt verwenden
        // 2) draft.toEmail (falls vorhanden) -> verwenden
        // 3) resolveContact(toName) via JSON -> verwenden
        // 4) sonst: kein AutoSend, Draft bleibt offen
        
        // Schritt 1 & 2: Prüfe auf vorhandene E-Mail
        const primary = fromIntentTo || fromDraftToEmail || fromIntentToRaw;
        const extracted = primary ? extractEmailFromText(primary) : null;
        
        if (extracted && isStrictValidEmail(extracted)) {
          finalToEmail = extracted;
        }
        
        // Basis-Zeichenkette für den Resolver in dieser Priorität:
        const baseForResolver = fromIntentToRaw || fromIntentTo || fromDraftName || fromDraftToEmail || '';
        
        // Bereinige diese Basis mit der Helper-Funktion
        const cleanedForResolver = cleanNameForResolver(baseForResolver);
        const finalNameForResolver = cleanedForResolver || baseForResolver;
        
        // Schritt 3: Contact Resolver (nur wenn noch keine E-Mail vorhanden) - JETZT MIT AWAIT
        if (!finalToEmail && finalNameForResolver && finalNameForResolver.trim()) {
          console.log('[fm-voice][wizard4][contact-resolver] Versuche Kontakt aufzulösen:', finalNameForResolver);
          
          try {
            const resolveUrl = `/api/contacts/resolve?name=${encodeURIComponent(finalNameForResolver)}`;
            const resolveResponse = await fetch(resolveUrl);
            
            if (resolveResponse.ok) {
              const resolveData = await resolveResponse.json();
              console.log('[fm-voice][wizard4][contact-resolver] Response:', resolveData);
              
              if (resolveData.ok && resolveData.email && isStrictValidEmail(resolveData.email)) {
                finalToEmail = resolveData.email;
                console.log('[fm-voice][wizard4][contact-resolver] Kontakt aufgelöst:', finalNameForResolver, '->', finalToEmail);
                
                // Draft-Felder setzen, damit AutoSend-Guard die E-Mail erkennt
                if (wizard4Draft) {
                  wizard4Draft.toEmail = resolveData.email;
                  if ((wizard4Draft as any).to !== undefined) {
                    (wizard4Draft as any).to = resolveData.email;
                  }
                  
                  // Anzeigenamen aus Resolver-Response übernehmen (für saubere Anrede)
                  const resolvedDisplayName =
                    resolveData?.matchedContact?.displayName ||
                    resolveData?.matchedContact?.name ||
                    wizard4Draft.toName;
                  
                  if (resolvedDisplayName && typeof resolvedDisplayName === 'string') {
                    wizard4Draft.toName = resolvedDisplayName;
                  }
                  
                  console.log('[fm-voice][wizard4][debug] resolver applied:', {
                    toEmail: wizard4Draft.toEmail,
                    to: (wizard4Draft as any).to,
                    toName: wizard4Draft.toName
                  });
                  
                  // safeAutoSendEmail aktualisieren, damit der Guard die E-Mail erkennt
                  safeAutoSendEmail = normalizeEmailForAutoSend(resolveData.email);
                  
                  // Debug-Info in Draft speichern (optional, für spätere UI-Anzeige)
                  (wizard4Draft as any).toResolvedFrom = finalNameForResolver;
                  (wizard4Draft as any).contactResolution = {
                    matchedContact: resolveData.matchedContact,
                    debug: resolveData.debug
                  };
                }
              } else {
                console.log('[fm-voice][wizard4][contact-resolver] Kein Match gefunden für:', finalNameForResolver, resolveData.debug?.result);
              }
            } else {
              console.warn('[fm-voice][wizard4][contact-resolver] API-Fehler:', resolveResponse.status);
            }
          } catch (err) {
            console.error('[fm-voice][wizard4][contact-resolver] Fehler beim Auflösen:', err);
            // Fehler nicht blockierend, wir versuchen es einfach nicht
          }
        }
        
        // AutoSend-safe Normalisierung
        safeAutoSendEmail = normalizeEmailForAutoSend(finalToEmail || primary || '');
        
        console.log('[fm-voice][wizard4][debug] to-resolver', {
          fromIntentToRaw,
          fromIntentTo,
          fromDraftName,
          fromDraftToEmail,
          primary,
          extracted,
          finalToEmail,
          safeAutoSendEmail,
          resolvedInput: finalNameForResolver,
          resolvedViaContactResolver: finalToEmail && wizard4Draft && finalNameForResolver && !fromIntentTo && !fromDraftToEmail,
        });
      } catch (err) {
        console.error('[fm-voice][wizard4][debug] to-resolver error', err);
      }
      
      // ============================================================
      // PHASE 3: Body neu bauen MIT finalen toName/toEmail (nach Resolver)
      // ============================================================
      // Helper-Funktionen für Body-Bau (aus email.ts kopiert, da nicht exportiert)
      function normalizeTextForBody(text: string): string {
        let normalized = text.toLowerCase();
        normalized = normalized.replace(/\s+/g, ' ').trim();
        return normalized;
      }
      
      function stripSendNowPhrasesForBody(text: string): string {
        const sendNowPhrases = [
          'sofort raus',
          'schick sie sofort raus',
          'schick sofort raus',
          'schick raus',
          'hau raus'
        ];
        
        let result = text;
        for (const phrase of sendNowPhrases) {
          const idx = result.toLowerCase().indexOf(phrase.toLowerCase());
          if (idx !== -1) {
            result = result.substring(0, idx).trim();
            break;
          }
        }
        
        return result;
      }
      
      function extractContentFromSourceForBody(source: string): { core: string | null; marker: "dass" | "wegen" | "free" | null } {
        if (!source || !source.trim()) {
          return { core: null, marker: null };
        }
        
        const normalized = normalizeTextForBody(source);
        let core: string | null = null;
        let marker: "dass" | "wegen" | "free" | null = null;
        
        // a) "dass " im Satz
        const dassIdx = normalized.indexOf('dass ');
        if (dassIdx !== -1) {
          core = source.substring(dassIdx + 'dass '.length);
          core = stripSendNowPhrasesForBody(core);
          marker = 'dass';
        }
        // b) "wegen " im Satz
        else if (normalized.indexOf('wegen ') !== -1) {
          const wegenIdx = normalized.indexOf('wegen ');
          core = source.substring(wegenIdx + 'wegen '.length);
          core = stripSendNowPhrasesForBody(core);
          marker = 'wegen';
        }
        // c) ":" im originalen sourceText
        else if (source.includes(':')) {
          const colonIdx = source.indexOf(':');
          core = source.substring(colonIdx + 1);
          core = stripSendNowPhrasesForBody(core);
          marker = 'free';
        }
        // d) Nach "mail" noch Inhalt
        else {
          const mailPatterns = ['mail,', 'mail ', 'email ', 'e-mail ', 'mail.', 'email.', 'e-mail.'];
          let mailIdx = -1;
          for (const pattern of mailPatterns) {
            const idx = normalized.indexOf(pattern);
            if (idx !== -1) {
              mailIdx = idx + pattern.length;
              break;
            }
          }
          
          if (mailIdx !== -1 && mailIdx < source.length) {
            core = source.substring(mailIdx);
            core = stripSendNowPhrasesForBody(core);
            marker = 'free';
          }
        }
        
        // e) Wenn core nach trim leer ist
        if (!core || !core.trim()) {
          return { core: null, marker: null };
        }
        
        return { core: core.trim(), marker };
      }
      
      function formatRecipientNameForBody(raw?: string | null): string {
        if (!raw) return "dir";
        
        let text = raw.trim().toLowerCase();
        if (!text) return "dir";
        text = text.replace(/\s+/g, " ");
        if (text === "freiraum beratung") {
          return "Freiraum Beratung";
        }
        if (text === "freiraumberatung") {
          return "Freiraumberatung";
        }
        const parts = text.split(" ");
        const formatted = parts
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
        return formatted || "dir";
      }
      
      function ensureSentenceEndsForBody(text: string): string {
        const trimmed = text.trim();
        if (!trimmed) return text;
        const last = trimmed[trimmed.length - 1];
        if ([".", "!", "?"].includes(last)) {
          return trimmed;
        }
        return `${trimmed}.`;
      }
      
      function buildBodyFromSource(sourceText: string, toName?: string | null): string | null {
        const extracted = extractContentFromSourceForBody(sourceText);
        
        if (!extracted.core || !extracted.marker) {
          return null;
        }
        
        let coreTrimmed = extracted.core.trim();
        if (!coreTrimmed) {
          return null;
        }
        
        if (coreTrimmed.endsWith(':')) {
          coreTrimmed = coreTrimmed.slice(0, -1).trim();
        }
        
        const name = formatRecipientNameForBody(toName);
        let body: string;
        
        if (extracted.marker === 'dass') {
          let inner = coreTrimmed.replace(/^,?\s*/, "");
          inner = inner.replace(/^dass\s+/i, "");
          inner = inner.trim();
          inner = inner.replace(/[.!?]+$/, "").trim();
          
          const sentence = `ich wollte dir nur kurz Bescheid geben, dass ${inner}`;
          body = `Hi ${name},\n\n${ensureSentenceEndsForBody(sentence)}`;
          
        } else if (extracted.marker === 'wegen') {
          let inner = coreTrimmed.replace(/^,?\s*/, "").trim();
          inner = inner.replace(/[.!?]+$/, "").trim();
          
          const sentence = `ich wollte dir kurz wegen ${inner} schreiben`;
          body = `Hi ${name},\n\n${ensureSentenceEndsForBody(sentence)}`;
          
        } else {
          let freeText = coreTrimmed;
          freeText = freeText.replace(/,\s+meld(e|st|en)/i, " und meld$1");
          
          body = `Hi ${name},\n\n${ensureSentenceEndsForBody(freeText)}`;
        }
        
        return body;
      }
      
      // JETZT Body neu bauen mit finalen toName/toEmail (nach Resolver)
      // Status-Gehirn hat Priorität - überschreibt den vorherigen Body mit korrekter Anrede
      if (wizard4Draft && wizard4Draft.sourceText) {
        const source = wizard4Draft.sourceText.trim();
        if (source) {
          // Prüfe, ob es eine Status-Mail ist (via meta.statusEmail)
          const emailIntent: any = intent;
          const statusMeta = emailIntent?.meta?.statusEmail;
          const freeDictationMeta = emailIntent?.meta?.freeDictationMeta;
          
          // Sicherstellen, dass Anrede NIEMALS "Hi dem," wird
          // Priorität: 1) Resolver-Name, 2) StatusMeta.toNameRaw (sauber extrahiert), 3) leer
          const resolvedContactName = wizard4Draft.toName || "";
          const toDisplayName = 
            resolvedContactName ||
            (statusMeta?.toNameRaw && statusMeta.toNameRaw.trim()) ||
            (freeDictationMeta?.toNameRaw && freeDictationMeta.toNameRaw.trim()) ||
            "";
          
          // A3.4 – Free-Diktat: Body 1:1 aus bodyHint übernehmen (kein Status-Gehirn)
          // Free-Diktat hat IMMER Priorität vor Status-Logik
          // Also handles "lass-uns" intents (which use the same freeDictationMeta structure)
          if (freeDictationMeta) {
            const freeDictationBody = freeDictationMeta.bodyText || intent.bodyHint || "";
            if (freeDictationBody.trim().length > 0) {
              wizard4Draft.body = freeDictationBody.trim();
              const intentSource = (emailIntent as any)?.meta?.source || 'free-dictation';
              console.debug('[fm-voice][wizard4][body] Free-Diktat Body 1:1 übernommen', { 
                sourceText: wizard4Draft.sourceText, 
                toName: wizard4Draft.toName, 
                resolvedContactName,
                toDisplayName,
                body: wizard4Draft.body,
                isFreeDictation: true,
                intentSource: intentSource
              });
            }
          }
          // TASK 2: Also check for lass-uns intents that might not have freeDictationMeta
          // (fallback for any edge cases)
          else if ((emailIntent as any)?.meta?.source === 'lass-uns' && intent.bodyHint) {
            const lassUnsBody = intent.bodyHint.trim();
            if (lassUnsBody.length > 0) {
              wizard4Draft.body = lassUnsBody;
              console.debug('[fm-voice][wizard4][body] Lass-uns Body 1:1 übernommen', { 
                sourceText: wizard4Draft.sourceText, 
                toName: wizard4Draft.toName, 
                resolvedContactName,
                toDisplayName,
                body: wizard4Draft.body,
                isLassUns: true
              });
            }
          }
          // Verwende das neue Status-Gehirn für Status-Mails (nur wenn KEIN Free-Diktat)
          else if (statusMeta?.isStatus && !freeDictationMeta) {
            const statusResult = buildStatusEmailBody({
              rawText: statusMeta.rawText || source,
              statusText: statusMeta.statusText || undefined,
              toDisplayName: toDisplayName || undefined,
            });
            
            if (statusResult && statusResult.trim().length > 0) {
              wizard4Draft.body = statusResult.trim();
              console.debug('[fm-voice][wizard4][body] styled from Status-Gehirn nach Resolver', { 
                sourceText: wizard4Draft.sourceText, 
                toName: wizard4Draft.toName, 
                resolvedContactName,
                toDisplayName,
                body: wizard4Draft.body,
                isStatus: true
              });
            }
          }
          // Fallback: Alte Logik für non-Status-Mails (nur wenn KEIN Free-Diktat)
          else if (!freeDictationMeta) {
            // Extrahiere bodyHint aus dem Intent (message-Feld)
            const bodyHint = wizard4Draft.intent?.message || null;
            
            const statusResult = buildStatusEmailBody({
              rawText: source,
              statusText: bodyHint || null,
              toDisplayName: toDisplayName || undefined,
            });
            
            if (statusResult && statusResult.trim().length > 0) {
              wizard4Draft.body = statusResult.trim();
              console.debug('[fm-voice][wizard4][body] styled from Status-Gehirn nach Resolver', { 
                sourceText: wizard4Draft.sourceText, 
                toName: wizard4Draft.toName,
                toDisplayName,
                body: wizard4Draft.body
              });
            }
          }
          // Wenn Body leer ist, bleibt der vorhandene Body erhalten (Fallback)
        }
      }
      
      console.debug('[fm-voice][wizard4][debug] draft nach Body-Build:', wizard4Draft);
      
      // Empfänger ins UI setzen (wenn möglich)
      if (finalToEmail && typeof (w as any).__fm_set_mail_to === 'function') {
        console.log('[fm-voice] email-compose (Wizard4): __fm_set_mail_to (resolved)', finalToEmail);
        try {
          (w as any).__fm_set_mail_to(finalToEmail);
        } catch (err) {
          console.error('[fm-voice] Fehler beim Setzen von __fm_set_mail_to (resolved):', err);
        }
      }
      
      // Betreff bestimmen (Wizard4 hat Vorrang - IMMER draft.subject verwenden wenn vorhanden)
      // Bei Status-Mails und Free-Diktat: immer neutrale "Kurze Info" setzen
      const emailIntentForSubject: any = intent;
      const statusMetaForSubject = emailIntentForSubject?.meta?.statusEmail;
      const freeDictationMetaForSubject = emailIntentForSubject?.meta?.freeDictationMeta;
      
      let subject = (wizard4Draft && wizard4Draft.subject) || intent.subjectHint || null;
      
      // Wenn Status-Mail oder Free-Diktat → Betreff auf neutrale Standardzeile setzen
      if (statusMetaForSubject?.isStatus || freeDictationMetaForSubject) {
        subject = "Kurze Info";
      }
      
      // Body-Prio: 1) Wizard4-Body, 2) bodyHint, 3) leerer String
      // Body IMMER aus dem Draft übernehmen, wenn vorhanden (unabhängig von sendMode)
      // Bei Free-Diktat: Falls Draft-Body leer, bodyHint verwenden (1:1)
      let bodyForUi =
        typeof wizard4Draft?.body === "string" && wizard4Draft.body.trim().length > 0
          ? wizard4Draft.body
          : (intent.bodyHint ?? "").trim();
      
      // Free-Diktat: Falls Body immer noch leer, direkt aus freeDictationMeta nehmen
      // Also handles "lass-uns" intents (which use the same freeDictationMeta structure)
      if (freeDictationMetaForSubject && (!bodyForUi || bodyForUi.trim().length === 0)) {
        bodyForUi = freeDictationMetaForSubject.bodyText || intent.bodyHint || "";
        const intentSource = (emailIntentForSubject as any)?.meta?.source || 'free-dictation';
        console.log('[fm-voice][wizard4][free-dictation] Body aus meta.freeDictationMeta.bodyText übernommen:', bodyForUi.substring(0, 80), 'source:', intentSource);
      }
      // TASK 2: Fallback for lass-uns intents without freeDictationMeta (edge case)
      else if ((emailIntentForSubject as any)?.meta?.source === 'lass-uns' && intent.bodyHint && (!bodyForUi || bodyForUi.trim().length === 0)) {
        bodyForUi = intent.bodyHint;
        console.log('[fm-voice][wizard4][lass-uns] Body aus intent.bodyHint übernommen:', bodyForUi.substring(0, 80));
      }
      
      // Default-Body für sendNow wenn leer (damit AutoSend nicht wegen leerem Text scheitert)
      let body: string | null = bodyForUi;
      if (wizard4Draft?.sendMode === 'sendNow' && (!body || body.trim().length === 0)) {
        body = 'Moin, kurze Info.';
        wizard4Draft.body = body;
        console.log('[fm-voice][wizard4] Default-Body gesetzt (sendNow, body leer)');
      } else {
        body = bodyForUi || null;
      }
      
      // ============================================================
      // PHASE 4: UI-Updates und AutoSend
      // ============================================================
      
      // URL-Parameter für Navigation (optional, für Fallback-Rendering)
      const params = new URLSearchParams();
      if (finalToEmail) params.set("to", finalToEmail);
      if (subject) params.set("subject", subject);
      if (body) params.set("body", body);
      const qs = params.toString();
      
      navigate(`/mail/compose${qs ? `?${qs}` : ""}`);
      showTransitionMessage("Bereite E-Mail vor …");
      triggerEmotion("idea");
      
      // Warte kurz, damit die MailCompose-Komponente gemountet ist
      setTimeout(() => {
      // Setze E-Mail-Felder über Helper-Funktion mit Wizard4-Daten
      applyEmailToComposeUI({
        to: finalToEmail,
        subject: subject,
        body: body,
        logPrefix: "[fm-voice] email-compose (Wizard4)",
      });
      
      // Stelle sicher, dass finalToEmail IMMER gesetzt wird (auch wenn schon gesetzt)
      if (finalToEmail && typeof w.__fm_set_mail_to === 'function') {
        try {
          w.__fm_set_mail_to(finalToEmail);
          console.log('[fm-voice][wizard4] __fm_set_mail_to aufgerufen (vor AutoSend):', finalToEmail);
        } catch (err) {
          console.error('[fm-voice] Fehler beim Setzen von __fm_set_mail_to (vor AutoSend):', err);
        }
      }
      
      // Zusätzliches Logging für Debugging
      if (wizard4Draft) {
        // Logge den FINALEN Body, der wirklich ins UI gesetzt wurde
        const finalBody = body || '';
        console.log('[fm-voice][wizard4] Email-Felder gesetzt:', {
          to: finalToEmail,
          subject: subject,
          body: finalBody,
          sendMode: wizard4Draft.sendMode,
          toName: wizard4Draft.toName,
          draftBody: wizard4Draft.body,
          usedBodyHint: !wizard4Draft && !!intent.bodyHint
        });
        
        if (wizard4Draft.toName && !finalToEmail) {
          console.log('[fm-voice][wizard4] Hinweis: Nur Name erkannt, keine E-Mail-Adresse:', wizard4Draft.toName);
        }
      }
      
      // -----------------------------
      // AutoSend 4.0 – Wizard 4 (mit Retry-Logik)
      // -----------------------------
      try {
        const canAutoSend =
          WIZARD4_AUTOSEND_ENABLED &&
          wizard4Draft &&
          wizard4Draft.sendMode === 'sendNow' &&
          typeof w.__fm_send_mail_now === 'function' &&
          safeAutoSendEmail !== null;
        
        if (canAutoSend) {
          console.log('[fm-voice][wizard4] AutoSend: starte Retry-Logik.', {
            to: safeAutoSendEmail,
            subject: wizard4Draft.subject,
            sendMode: wizard4Draft.sendMode,
          });
          
          // Retry-Logik: Warte bis Empfänger wirklich im UI steht
          let retryCount = 0;
          const maxRetries = 5;
          
          const trySend = () => {
            // Stelle sicher, dass safeAutoSendEmail im UI steht
            if (safeAutoSendEmail && typeof w.__fm_set_mail_to === 'function') {
              try {
                w.__fm_set_mail_to(safeAutoSendEmail);
                console.log('[fm-voice][wizard4] AutoSend: safeAutoSendEmail ins UI gesetzt:', safeAutoSendEmail);
              } catch (err) {
                console.error('[fm-voice][wizard4] AutoSend: Fehler beim Setzen von safeAutoSendEmail:', err);
              }
            }
            
            const currentTo = (typeof w.__fm_get_mail_to === 'function') ? String(w.__fm_get_mail_to() || '') : '';
            
            if (currentTo && currentTo.includes('@')) {
              console.log('[fm-voice][wizard4] AutoSend: Empfänger steht im UI, sende jetzt.', { currentTo, safeAutoSendEmail });
              didAutoSend = true;
              w.__fm_send_mail_now();
            } else if (retryCount < maxRetries) {
              retryCount++;
              console.log('[fm-voice][wizard4] AutoSend: Empfänger noch nicht im UI, retry in 200ms.', { 
                currentTo, 
                retryCount, 
                maxRetries,
                safeAutoSendEmail
              });
              setTimeout(trySend, 200);
            } else {
              console.warn('[fm-voice][wizard4] AutoSend: Abbruch nach', maxRetries, 'Retries. Empfänger nicht im UI gesetzt.', { 
                currentTo,
                expectedTo: safeAutoSendEmail
              });
              // AutoSend fehlgeschlagen, zeige prepared-Nachricht
              if (!didAutoSend) {
                PartnerBotBus.say("Alles klar, ich habe die E-Mail vorbereitet. Du kannst sie jetzt prüfen oder senden.");
              }
            }
          };
          
          // Starte Retry-Logik nach kurzer Verzögerung
          setTimeout(trySend, 150);
        } else {
          console.log('[fm-voice][wizard4] AutoSend nicht ausgeführt.', {
            autosendEnabled: WIZARD4_AUTOSEND_ENABLED,
            hasDraft: !!wizard4Draft,
            sendMode: wizard4Draft ? wizard4Draft.sendMode : null,
            hasSafeAutoSendEmail: safeAutoSendEmail !== null,
            hasSendFn: typeof w.__fm_send_mail_now === 'function',
          });
          // AutoSend nicht ausgeführt, zeige prepared-Nachricht
          if (!didAutoSend) {
            PartnerBotBus.say("Alles klar, ich habe die E-Mail vorbereitet. Du kannst sie jetzt prüfen oder senden.");
          }
        }
      } catch (err) {
        console.error('[fm-voice][wizard4] Fehler beim AutoSend:', err);
        // Bei Fehler zeige prepared-Nachricht
        if (!didAutoSend) {
          PartnerBotBus.say("Alles klar, ich habe die E-Mail vorbereitet. Du kannst sie jetzt prüfen oder senden.");
        }
      }
    }, 100);
    
    // lastAction setzen für spätere KI-Integration
    const recipient = finalToEmail || (wizard4Draft && wizard4Draft.toName) || "Unbekannt";
    const description = `E-Mail an ${recipient}.`;
    setLastAction({ kind: "email-compose", description });
    })(); // Ende des async IIFE
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

    if (typeof window !== "undefined" && typeof (window as any).__fm_send_mail_now === "function") {
      const sendFn = (window as any).__fm_send_mail_now;
      console.log("[fm-voice] typeof window.__fm_send_mail_now:", typeof sendFn);

      try {
        // Funktion WIRKLICH ausführen
        const maybePromise = sendFn();

        // Falls die Funktion ein Promise zurückgibt, optional loggen
        if (maybePromise && typeof (maybePromise as any).then === "function") {
          (maybePromise as Promise<unknown>)
            .then(() => {
              console.log("[fm-voice] applyVoiceIntent(email-send) – __fm_send_mail_now erfolgreich abgeschlossen");
            })
            .catch((err) => {
              console.error("[fm-voice] applyVoiceIntent(email-send) – Fehler beim E-Mail-Versand", err);
            });
        } else {
          console.log("[fm-voice] applyVoiceIntent(email-send) – __fm_send_mail_now synchron ausgeführt");
        }
      } catch (err) {
        console.error("[fm-voice] applyVoiceIntent(email-send) – Ausnahme beim Aufruf von __fm_send_mail_now", err);
      }
    } else {
      console.warn("[fm-voice] applyVoiceIntent(email-send) – __fm_send_mail_now ist nicht verfügbar");
      // Fallback: Versuche Button-Klick
      try {
        const btn = document.querySelector<HTMLButtonElement>('[data-fm-mail="send-now"]');
        if (btn) {
          console.log("[fm-voice] Fallback: klicke Button [data-fm-mail=\"send-now\"]");
          btn.click();
        } else {
          console.warn("[fm-voice] Fallback fehlgeschlagen: Button [data-fm-mail=\"send-now\"] nicht gefunden");
        }
      } catch (err) {
        console.error("[fm-voice] Fehler beim DOM-Fallback für email-send", err);
      }
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
  lastTranscript = transcript; // Für Wizard4Intent-Parsing speichern
  const intent = routeVoiceIntent(transcript);
  applyVoiceIntent(intent, navigate);
}