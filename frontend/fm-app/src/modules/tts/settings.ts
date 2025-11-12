export type VoicePrefs = { rate: number; pitch: number };

const KEY = "fm_voice_prefs";
const DEF: VoicePrefs = { rate: 0.92, pitch: 0.95 };

export function getVoicePrefs(): VoicePrefs {
  try {
    return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return DEF;
  }
}

export function setVoicePrefs(prefs: Partial<VoicePrefs>) {
  const current = getVoicePrefs();
  const next = { ...current, ...prefs };
  localStorage.setItem(KEY, JSON.stringify(next));
  document.dispatchEvent(new CustomEvent("voice-prefs", { detail: next }));
}




