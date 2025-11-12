import { parseIntentDE } from "./intent";
import { voiceState } from "./state";
import { speakSmart } from "../tts";
import { recordAndTranscribe } from "../stt";
import { routeVoiceIntent } from "./intent_router";

const BACKEND = "http://127.0.0.1:30521";

export type VoiceState = "idle" | "listening" | "transcribing" | "acting" | "done" | "error";

function dispatchState(s: VoiceState) {
  document.dispatchEvent(new CustomEvent("voice-state", { detail: { state: s } }));
}

export class VoiceController {
  state: VoiceState = "idle";
  lastText = "";
  private abortController: AbortController | null = null;

  setState(s: VoiceState) {
    this.state = s;
    dispatchState(s);
  }

  async start() {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // ignore lack of user prompt
    }
    this.abortController = new AbortController();
    this.setState("listening");
    const text = await recordAndTranscribe(6500, this.abortController.signal);
    if (this.abortController.signal.aborted) {
      this.setState("idle");
      return;
    }
    if (!text) {
      this.setState("error");
      return;
    }
    this.lastText = text;
    this.setState("transcribing");
    await this.route(text);
  }

  async stop() {
    if (this.abortController && !this.abortController.signal.aborted) {
      this.abortController.abort();
      this.setState("idle");
    }
  }

  async route(text: string) {
    const intent = parseIntentDE(text || "");
    this.setState("acting");
    try {
      // Try voice intent router first (navigation commands)
      // Dispatch event for App.jsx to handle navigation
      const navigateEvent = new CustomEvent("voice-navigate", {
        detail: { text },
      });
      document.dispatchEvent(navigateEvent);
      // Note: intent_router handles navigation and returns true if handled
      // We continue with backend intents regardless to support both flows

      // Try OSM Intent first (new endpoint)
      if (intent.type === "lead_hunt" && (intent.payload.category || intent.payload.location)) {
        try {
          const osmResp = await fetch(`${BACKEND}/voice/intent`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          }).then((r) => r.json()).catch(() => null);
          
          if (osmResp?.ok && osmResp?.result) {
            // OSM Hunt successful
            const found = osmResp.result.found || 0;
            voiceState.lastOSMResult = osmResp.result;
            // Dispatch event for UI navigation
            document.dispatchEvent(new CustomEvent("voice-osm-success", { 
              detail: { result: osmResp.result } 
            }));
            await speakSmart(`Gefunden: ${found} Leads. Ergebnisse werden angezeigt.`);
            this.setState("done");
            return;
          }
        } catch (e) {
          // Fall through to legacy endpoint
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
        await speakSmart("Verstanden. Ich starte die Suche.");
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
        await speakSmart("Erledigt. Erinnerung ist gesetzt.");
      } else if (intent.type === "cancel") {
        if (voiceState.lastLeadTaskId) {
          await fetch(`${BACKEND}/lead_hunter/cancel/${voiceState.lastLeadTaskId}`, {
            method: "POST",
          }).catch(() => {});
          voiceState.lastLeadTaskId = null;
          await speakSmart("Alles klar. Ich stoppe die letzte Suche.");
        } else {
          await speakSmart("Es gibt nichts zu stoppen.");
        }
      } else {
        await speakSmart("Das habe ich nicht eindeutig verstanden.");
      }
      this.setState("done");
    } catch {
      this.setState("error");
      await speakSmart("Da gab es ein Problem bei der Ausführung.");
    }
  }
}

export const voice = new VoiceController();