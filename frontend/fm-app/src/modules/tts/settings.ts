export type VoicePrefs = {
  rate: number;
  pitch: number;
  provider: "piper";
  voice: "thorsten";
};

const KEY = "fm_voice_prefs";
const DEF: VoicePrefs = { rate: 0.92, pitch: 0.95, provider: "piper", voice: "thorsten" };

export function getVoicePrefs(): VoicePrefs {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { ...DEF, ...stored, provider: "piper", voice: "thorsten" };
  } catch {
    return DEF;
  }
}

export function setVoicePrefs(prefs: Partial<VoicePrefs>) {
  const current = getVoicePrefs();
  const next: VoicePrefs = {
    ...current,
    ...prefs,
    provider: "piper",
    voice: "thorsten",
  };
  localStorage.setItem(KEY, JSON.stringify(next));
  document.dispatchEvent(new CustomEvent("voice-prefs", { detail: next }));
}




