import React, { useEffect, useMemo, useState } from "react";

import { speakSmart } from "../modules/tts";
import { getVoicePrefs, setVoicePrefs } from "../modules/tts/settings";
import { voiceState } from "../modules/voice/state";
import VoicePTT from "../components/VoicePTT";

const BACKEND = "http://127.0.0.1:30521";

async function getJson(url: string) {
  try {
    const r = await fetch(url);
    return await r.json();
  } catch {
    return null;
  }
}

type MicState = "granted" | "denied" | "prompt" | "unknown";

export default function VoiceDiagnostics() {
  const [apiStatus, setApiStatus] = useState<any>(null);
  const [ttsStatus, setTtsStatus] = useState<any>(null);
  const [sttStatus, setSttStatus] = useState<any>(null);
  const [mic, setMic] = useState<MicState>("unknown");
  const [note, setNote] = useState<string>("");
  const [prefs, setPrefs] = useState(getVoicePrefs());

  useEffect(() => {
    let timer: number;

    const poll = async () => {
      setApiStatus(await getJson(`${BACKEND}/api/system/status`));
      setTtsStatus(await getJson(`${BACKEND}/api/tts/health`));
      setSttStatus(await getJson(`${BACKEND}/api/stt/health`));
      timer = window.setTimeout(poll, 2000);
    };

    poll();

    const detectPermission = async () => {
      try {
        // @ts-ignore
        if (navigator.permissions?.query) {
          // @ts-ignore
          const perm = await navigator.permissions.query({ name: "microphone" });
          setMic((perm.state as MicState) || "unknown");
          perm.onchange = () => setMic((perm.state as MicState) || "unknown");
        } else {
          setMic("unknown");
        }
      } catch {
        setMic("unknown");
      }
    };

    detectPermission();

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail) setPrefs(e.detail);
    };
    document.addEventListener("voice-prefs", handler as EventListener);
    return () => document.removeEventListener("voice-prefs", handler as EventListener);
  }, []);

  const apiOk = apiStatus?.ok === true;
  const ttsOk = ttsStatus?.ok === true;
  const sttOk = sttStatus?.ok === true;
  const provider = ttsStatus?.provider || "unknown";
  const sttProvider = sttStatus?.provider || "unknown";
  const voiceName = ttsStatus?.voice || ttsStatus?.engine || "local";

  const providerHint = useMemo(() => {
    if (provider === "local" && ttsOk) return "Lokaler TTS aktiv (Piper).";
    if (provider === "local" && !ttsOk) {
      return "Lokaler TTS konfiguriert, aber Binary oder Modell fehlen.";
    }
    return "Fallback Browser-TTS.";
  }, [provider, ttsOk]);

  const testSpeak = async () => {
    await speakSmart(
      "Guten Tag, ich bin dein verlässlicher Geschäftspartner. Ich arbeite ruhig, souverän und auf Deutsch."
    );
  };

  const backendProbe = async () => {
    try {
      const resp = await fetch(`${BACKEND}/api/tts/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Hallo Denis. Piper und Whisper laufen lokal." }),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        setNote(`Backend-TTS Probe fehlgeschlagen (${resp.status}). Hinweis: ${txt.slice(0, 120)}`);
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      await audio.play();
      setNote("Backend-TTS Probe erfolgreich (lokaler Piper).");
    } catch {
      setNote("Backend-TTS Probe fehlgeschlagen. Prüfe Piper Installation / backend/.env.");
    }
  };

  const demoLead = async () => {
    const resp = await fetch(`${BACKEND}/lead_hunter/hunt_async`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "shk", location: "Arnsberg" }),
    })
      .then((r) => r.json())
      .catch(() => null);
    voiceState.lastLeadTaskId = resp?.task_id || null;
    if (voiceState.lastLeadTaskId) {
      await fetch(`${BACKEND}/api/lead_status/last/${voiceState.lastLeadTaskId}`, {
        method: "POST",
      }).catch(() => {});
    }
    setNote("Lead-Suche gestartet (SHK Arnsberg).");
    await speakSmart("Verstanden. Ich starte die Suche nach SHK Betrieben in Arnsberg.");
  };

  const demoHSK1 = async () => {
    const resp = await fetch(`${BACKEND}/lead_hunter/hunt_async`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "shk", location: "Sundern" }),
    })
      .then((r) => r.json())
      .catch(() => null);
    voiceState.lastLeadTaskId = resp?.task_id || null;
    if (voiceState.lastLeadTaskId) {
      await fetch(`${BACKEND}/api/lead_status/last/${voiceState.lastLeadTaskId}`, {
        method: "POST",
      }).catch(() => {});
    }
    setNote("Lead-Suche gestartet (SHK Sundern).");
    await speakSmart("Verstanden. Ich starte die Suche nach SHK Betrieben in Sundern.");
  };

  const demoHSK2 = async () => {
    await fetch(`${BACKEND}/api/proactive/remember`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Erinnerung Arnsberg 11", when: "tomorrow" }),
    }).catch(() => {});
    try {
      await fetch(`${BACKEND}/api/proactive/trigger`, { method: "POST" });
    } catch {
      // optional trigger
    }
    setNote("Erinnerung gesetzt: Arnsberg 11");
    await speakSmart("Erledigt. Erinnerung ist gesetzt.");
  };

  const cancelLead = async () => {
    if (voiceState.lastLeadTaskId) {
      await fetch(`${BACKEND}/lead_hunter/cancel/${voiceState.lastLeadTaskId}`, {
        method: "POST",
      }).catch(() => {});
      voiceState.lastLeadTaskId = null;
      setNote("Letzte Suche gestoppt.");
      await speakSmart("Alles klar. Ich stoppe die letzte Suche.");
    } else {
      setNote("Keine aktive Suche gespeichert.");
      await speakSmart("Es gibt nichts zu stoppen.");
    }
  };

  const resetVoice = () => {
    try {
      window.speechSynthesis?.cancel?.();
    } catch {
      // ignore
    }
    voiceState.lastLeadTaskId = null;
    setNote("Voice- und TTS-Status zurückgesetzt.");
  };

  return (
    <div style={{ padding: "16px", maxWidth: 820, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Voice Diagnostics</h1>
      <p style={{ opacity: 0.8, marginBottom: 16 }}>
        Schnelltest für API, TTS, Mikrofon und Standard-Intents.
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        <Row label="Backend Status">
          {apiOk ? "OK" : "Fehler"}{" "}
          {apiStatus ? `(${apiStatus.env}, py ${apiStatus.python})` : ""}
        </Row>
        <Row label="TTS">
          {ttsOk ? "OK" : "Fallback/Fehler"} {`[${provider}] ${voiceName}`} – {providerHint}
        </Row>
        <Row label="STT">
          {sttOk ? "OK" : "Fallback/Fehler"} {`[${sttProvider}]`}
        </Row>
        <Row label="Mikrofon">{mic}</Row>
      </div>

      <div style={{ marginTop: 24, padding: 16, border: "1px solid rgba(255,255,255,.12)", borderRadius: 12 }}>
        <strong style={{ display: "block", marginBottom: 12 }}>Push-to-Talk</strong>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 100 }}>
          <VoicePTT />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <button onClick={testSpeak} style={btn(true)}>
          Klangtest (warm)
        </button>
        <button onClick={backendProbe} style={btn(true)}>
          Backend-TTS Probe
        </button>
        <button onClick={demoLead} style={btn(true)}>
          Lead-Suche Demo
        </button>
        <button onClick={demoHSK1} style={btn(true)} title="Shortcut: SHK in Sundern">
          Shortcut: SHK Sundern
        </button>
        <button onClick={demoHSK2} style={btn(true)} title="Shortcut: Erinnerung Arnsberg 11">
          Shortcut: Erinnerung Arnsberg 11
        </button>
        <button onClick={cancelLead} style={btn(false)}>
          Abbrechen
        </button>
        <button onClick={resetVoice} style={btn(false)}>
          Reset Voice
        </button>
      </div>

      {note && (
        <div style={{ marginTop: 12, opacity: 0.85 }}>
          {note}
        </div>
      )}

      <div
        style={{
          marginTop: 20,
          padding: 12,
          border: "1px solid rgba(255,255,255,.12)",
          borderRadius: 12,
        }}
      >
        <strong>Stimme feinjustieren</strong>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, marginTop: 10 }}>
          <label>Rate</label>
          <input
            type="range"
            min="0.7"
            max="1.1"
            step="0.01"
            value={prefs.rate}
            onChange={(e) => setVoicePrefs({ rate: parseFloat(e.target.value) })}
          />
          <label>Pitch</label>
          <input
            type="range"
            min="0.8"
            max="1.2"
            step="0.01"
            value={prefs.pitch}
            onChange={(e) => setVoicePrefs({ pitch: parseFloat(e.target.value) })}
          />
        </div>
        <div style={{ opacity: 0.75, marginTop: 8 }}>
          Aktuell: rate={prefs.rate.toFixed(2)} pitch={prefs.pitch.toFixed(2)}
        </div>
      </div>

      <div
        style={{
          marginTop: 20,
          padding: 12,
          border: "1px solid rgba(255,255,255,.12)",
          borderRadius: 12,
        }}
      >
        <strong>Lokaler Voice-Stack</strong>
        <p style={{ opacity: 0.8, marginTop: 6 }}>
          Piper + whisper.cpp liegen unter <code>backend/bin</code> und werden über <code>backend/.env</code> konfiguriert.
        </p>
        <pre style={preStyle()}>
{`TTS_PROVIDER=local
PIPER_EXE=bin/piper/piper.exe
PIPER_VOICE=models/piper/de_DE-thorsten-high.onnx

STT_PROVIDER=local
WHISPER_EXE=bin/whisper/main.exe
WHISPER_MODEL=models/whisper/ggml-small.bin`}
        </pre>
        <p style={{ opacity: 0.8 }}>Bei Änderungen Backend neu starten.</p>
      </div>
    </div>
  );
}

function Row(props: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "180px 1fr",
        gap: 8,
        alignItems: "center",
      }}
    >
      <div>{props.label}</div>
      <div>{props.children}</div>
    </div>
  );
}

function btn(primary: boolean): React.CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,.2)",
    background: primary ? "rgba(255,115,0,.12)" : "rgba(255,255,255,.08)",
    color: "#fff",
    cursor: "pointer",
  };
}

function preStyle(): React.CSSProperties {
  return {
    padding: 10,
    borderRadius: 8,
    background: "rgba(255,255,255,.06)",
    overflowX: "auto",
  };
}



