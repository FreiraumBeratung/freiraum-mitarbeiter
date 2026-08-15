import { backendBase } from "../../lib/backendBase";

const DEFAULT_VOICE = "de_DE-thorsten-medium";
const SILENCE_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

let unlockedAudioCtx: AudioContext | null = null;
let keepAliveSource: AudioBufferSourceNode | null = null;
let primedAudio: HTMLAudioElement | null = null;

function piperUrls(): string[] {
  const base = backendBase();
  return [`${base}/api/tts/speak`, `${base}/api/voice/tts`];
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
      if (!unlockedAudioCtx) {
        unlockedAudioCtx = new Ctx();
        unlockedAudioCtx.onstatechange = () => {
          if (unlockedAudioCtx && unlockedAudioCtx.state !== "running") {
            keepAliveSource = null;
          }
        };
      }
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
      primedAudio.setAttribute("webkit-playsinline", "true");
      primedAudio.preload = "auto";
    }
    primedAudio.loop = true;
    primedAudio.src = SILENCE_WAV;
    void primedAudio.play().catch(() => undefined);
  } catch {
    /* ignore */
  }
}

function isAudioCtxRunning(): boolean {
  return Boolean(unlockedAudioCtx && unlockedAudioCtx.state === "running");
}

async function playPcmViaUnlockedContext(data: ArrayBuffer, text: string): Promise<boolean> {
  if (!unlockedAudioCtx) return false;
  try {
    await unlockedAudioCtx.resume();
    if (!isAudioCtxRunning()) return false;
    const decoded = await unlockedAudioCtx.decodeAudioData(data.slice(0));
    if (!isAudioCtxRunning()) return false;
    const src = unlockedAudioCtx.createBufferSource();
    src.buffer = decoded;
    src.connect(unlockedAudioCtx.destination);
    emitTtsEvent("start", { text, provider: "piper" });
    src.onended = () => {
      emitTtsEvent("end", { text, provider: "piper" });
    };
    src.start();
    return isAudioCtxRunning();
  } catch {
    return false;
  }
}

function playViaHtmlAudio(data: ArrayBuffer, mimeType: string, text: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    try {
      const blob = new Blob([data], { type: mimeType || "audio/mpeg" });
      const objectUrl = URL.createObjectURL(blob);
      const audio = primedAudio || new Audio();
      primedAudio = audio;
      audio.setAttribute("playsinline", "true");
      audio.setAttribute("webkit-playsinline", "true");
      audio.loop = false;
      const cleanup = () => {
        URL.revokeObjectURL(objectUrl);
        audio.onplaying = null;
        audio.onended = null;
        audio.onerror = null;
      };
      audio.onplaying = () => {
        emitTtsEvent("start", { text, provider: "piper" });
        finish(true);
      };
      audio.onended = () => {
        emitTtsEvent("end", { text, provider: "piper" });
        cleanup();
      };
      audio.onerror = () => {
        emitTtsEvent("error", { text, provider: "piper", reason: "playback_error" });
        cleanup();
        finish(false);
      };
      audio.src = objectUrl;
      const playResult = audio.play();
      if (playResult && typeof playResult.then === "function") {
        playResult.catch(() => finish(false));
      }
      window.setTimeout(() => {
        finish(!audio.paused);
      }, 800);
    } catch {
      finish(false);
    }
  });
}

async function tryPiperTts(text: string): Promise<boolean> {
  for (const url of piperUrls()) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text, voice: DEFAULT_VOICE }),
      });

      if (!response.ok) continue;

      const buffer = await response.arrayBuffer();
      if (!buffer || buffer.byteLength < 64) continue;
      const mimeType = (response.headers.get("content-type") || "audio/wav").split(";")[0];
      if (await playPcmViaUnlockedContext(buffer, text)) return true;
      if (await playViaHtmlAudio(buffer, mimeType, text)) return true;
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
    const voices = synth.getVoices();
    const germanVoices = voices.filter((v) => v.lang?.toLowerCase().startsWith("de"));
    const maleHint = /male|männlich|martin|stefan|andreas|yannick|nils|thorsten|google deutsch/i;
    const male = germanVoices.find((v) => maleHint.test(`${v.name} ${v.voiceURI}`));
    if (male) {
      utterance.voice = male;
      return;
    }
    const notFemale = germanVoices.find((v) => !/anna|helena|siri|female|weiblich|petra|marlene/i.test(v.name));
    if (notFemale) utterance.voice = notFemale;
    else if (germanVoices.length > 0) utterance.voice = germanVoices[0];
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
  unlockTtsPlayback();
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
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const appleTouch = /iPad|iPhone|iPod/i.test(ua);
  if (appleTouch) return;
  fallbackWebSpeech(text);
}
