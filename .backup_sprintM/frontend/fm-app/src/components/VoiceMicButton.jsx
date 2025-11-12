import { useRecorder } from "../hooks/useRecorder";
import { api } from "../api/client";

export default function VoiceMicButton() {
  const { recording, start, stop } = useRecorder();

  async function handleRecord() {
    if (!recording) return start();
    const wav = await stop();
    const form = new FormData();
    form.append("file", wav, "voice.wav");
    const BASE = (import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:30521') + '/api';
    const r = await fetch(BASE + "/voice/stt", { method: "POST", body: form }).then(res => res.json());
    const text = r.text;
    await api.voice.command("denis", text);
  }

  return (
    <button
      onClick={handleRecord}
      className={`fixed bottom-4 right-4 px-4 py-4 rounded-full shadow-lg transition ${
        recording ? "bg-red-600" : "bg-orange-500"
      } text-white font-bold`}
    >
      🎤
    </button>
  );
}

