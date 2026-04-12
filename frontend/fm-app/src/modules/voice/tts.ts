const PIPER_TTS_URL = "http://localhost:30521/api/voice/tts";
const DEFAULT_VOICE = "de_DE-thorsten-medium";

function emitTtsEvent(
  type: "start" | "end" | "error",
  detail: { text: string; provider: "piper" | "webspeech"; reason?: string }
) {
  if (typeof window === "undefined") return;
  document.dispatchEvent(new CustomEvent("fm-tts", { detail: { type, ...detail } }));
}

async function tryPiperTts(text: string): Promise<boolean> {
  try {
    const response = await fetch(PIPER_TTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: DEFAULT_VOICE }),
    });

    if (!response.ok) {
      console.warn("[fm-voice] Piper TTS antwortet mit Status:", response.status);
      return false;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    const cleanup = () => {
      URL.revokeObjectURL(url);
      audio.onplaying = null;
      audio.onended = null;
      audio.onerror = null;
    };

    audio.onplaying = () => {
      emitTtsEvent("start", { text, provider: "piper" });
    };
    audio.onended = () => {
      emitTtsEvent("end", { text, provider: "piper" });
      cleanup();
    };
    audio.onerror = () => {
      emitTtsEvent("error", { text, provider: "piper", reason: "playback_error" });
      cleanup();
    };

    await audio.play();
    return true;
  } catch (error) {
    console.warn("[fm-voice] Piper TTS nicht erreichbar:", error);
    return false;
  }
}

function fallbackWebSpeech(text: string) {
  if (typeof window === "undefined") {
    console.warn("[fm-voice] Kein Browser-Kontext, WebSpeech nicht verfügbar.");
    return;
  }

  if (!("speechSynthesis" in window)) {
    console.warn("[fm-voice] WebSpeech API nicht verfügbar, keine TTS-Ausgabe möglich.");
    return;
  }

  const synth = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "de-DE";
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  const germanVoices = synth.getVoices().filter((v) => v.lang?.toLowerCase().startsWith("de"));
  if (germanVoices.length > 0) {
    utterance.voice = germanVoices[0];
  }

  utterance.onstart = () => {
    emitTtsEvent("start", { text, provider: "webspeech" });
  };
  utterance.onend = () => {
    emitTtsEvent("end", { text, provider: "webspeech" });
  };
  utterance.onerror = () => {
    emitTtsEvent("error", { text, provider: "webspeech", reason: "speech_error" });
  };

  if (synth.getVoices().length === 0) {
    synth.onvoiceschanged = () => {
      const voices = synth.getVoices().filter((v) => v.lang?.toLowerCase().startsWith("de"));
      if (voices.length > 0) utterance.voice = voices[0];
      synth.speak(utterance);
    };
    return;
  }

  synth.speak(utterance);
}

export async function speak(text: string) {
  if (!text || !text.trim()) return;
  const ok = await tryPiperTts(text);
  if (ok) return;
  console.warn("[fm-voice] Piper nicht verfügbar, fallback auf WebSpeech.");
  fallbackWebSpeech(text);
}
