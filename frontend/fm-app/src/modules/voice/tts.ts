import { backendBase } from "../../lib/backendBase";

const DEFAULT_VOICE = "de_DE-thorsten-medium";
const SILENCE_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

let unlockedAudioCtx: AudioContext | null = null;
let keepAliveSource: AudioBufferSourceNode | null = null;
let primedAudio: HTMLAudioElement | null = null;

function piperUrls(): string[] {
  const base = backendBase();
  return [`${base}/api/voice/tts`, `${base}/api/tts/speak`];
}

function emitTtsEvent(
  type: "start" | "end" | "error",
  detail: { text: string; provider: "piper" | "webspeech"; reason?: string }
) {
  if (typeof window === "undefined") return;
  document.dispatchEvent(new CustomEvent("fm-tts", { detail: { type, ...detail } }));
}

export function unlockTtsPlayback() {
  if (typeof window === "undefined") return;
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (Ctx) {
      if (!unlockedAudioCtx) unlockedAudioCtx = new Ctx();
      void unlockedAudioCtx.resume();
      if (unlockedAudioCtx.state === "running" && !keepAliveSource) {
        const buffer = unlockedAudioCtx.createBuffer(1, 1, unlockedAudioCtx.sampleRate);
        keepAliveSource = unlockedAudioCtx.createBufferSource();
        keepAliveSource.buffer = buffer;
        const gain = unlockedAudioCtx.createGain();
        gain.gain.value = 0.0001;
        keepAliveSource.connect(gain);
        gain.connect(unlockedAudioCtx.destination);
        keepAliveSource.loop = true;
        keepAliveSource.start();
      }
    }
  } catch {
    /* ignore */
  }

  try {
    if (!primedAudio) {
      primedAudio = new Audio();
      primedAudio.setAttribute("playsinline", "true");
      primedAudio.preload = "auto";
    }
    primedAudio.src = SILENCE_WAV;
    void primedAudio.play().catch(() => undefined);
  } catch {
    /* ignore */
  }

  try {
    if ("speechSynthesis" in window) {
      const utter = new SpeechSynthesisUtterance(" ");
      utter.volume = 0.01;
      utter.rate = 1;
      window.speechSynthesis.speak(utter);
    }
  } catch {
    /* ignore */
  }
}

async function playPcmViaUnlockedContext(data: ArrayBuffer, text: string): Promise<boolean> {
  if (!unlockedAudioCtx) return false;
  try {
    await unlockedAudioCtx.resume();
    const decoded = await unlockedAudioCtx.decodeAudioData(data.slice(0));
    const src = unlockedAudioCtx.createBufferSource();
    src.buffer = decoded;
    src.connect(unlockedAudioCtx.destination);
    emitTtsEvent("start", { text, provider: "piper" });
    src.onended = () => {
      emitTtsEvent("end", { text, provider: "piper" });
    };
    src.start();
    return true;
  } catch {
    return false;
  }
}

async function tryPiperTts(text: string): Promise<boolean> {
  for (const url of piperUrls()) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: DEFAULT_VOICE }),
      });

      if (!response.ok) continue;

      const buffer = await response.arrayBuffer();
      if (await playPcmViaUnlockedContext(buffer, text)) return true;

      const blob = new Blob([buffer], { type: "audio/wav" });
      const objectUrl = URL.createObjectURL(blob);
      const audio = primedAudio || new Audio();
      audio.setAttribute("playsinline", "true");

      const cleanup = () => {
        URL.revokeObjectURL(objectUrl);
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

      audio.src = objectUrl;
      await audio.play();
      return true;
    } catch (error) {
      console.warn("[fm-voice] Piper TTS nicht erreichbar:", error);
    }
  }
  return false;
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
  try {
    synth.cancel();
  } catch {
    /* ignore */
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "de-DE";
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  const pickVoice = () => {
    const germanVoices = synth.getVoices().filter((v) => v.lang?.toLowerCase().startsWith("de"));
    if (germanVoices.length > 0) utterance.voice = germanVoices[0];
  };
  pickVoice();

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
      pickVoice();
      synth.speak(utterance);
    };
    return;
  }

  synth.speak(utterance);
}

export async function speak(text: string) {
  if (!text || !text.trim()) return;
  if (unlockedAudioCtx && unlockedAudioCtx.state !== "running") {
    try {
      await unlockedAudioCtx.resume();
    } catch {
      /* ignore */
    }
  }
  const ok = await tryPiperTts(text);
  if (ok) return;
  console.warn("[fm-voice] Piper nicht verfügbar, fallback auf WebSpeech.");
  fallbackWebSpeech(text);
}
