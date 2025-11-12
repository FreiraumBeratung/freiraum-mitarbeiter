import { getVoicePrefs } from "./settings";

export async function speakSmart(text: string) {
  const prefs = getVoicePrefs();
  try {
    const health = await fetch("http://127.0.0.1:30521/api/tts/health").then((r) =>
      r.json()
    );
    if (health?.provider === "local" && health?.ok) {
      const resp = await fetch("http://127.0.0.1:30521/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (resp.ok) {
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        await audio.play();
        return;
      }
    }
  } catch {
    // fall back to browser TTS
  }

  if (!("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;

  const say = () => {
    const voices = synth.getVoices();
    const de = voices.find(
      (v) => /de(-|_|$)/i.test(v.lang) || /german/i.test(v.name)
    );
    const u = new SpeechSynthesisUtterance(text);
    if (de) u.voice = de;
    u.lang = de?.lang || "de-DE";
    u.rate = prefs.rate;
    u.pitch = prefs.pitch;
    u.volume = 1.0;
    synth.cancel();
    synth.speak(u);
  };
  synth.getVoices().length === 0 ? (synth.onvoiceschanged = say) : say();
}
