import React, { useEffect, useState } from "react";

import { voice, type VoiceState } from "../../modules/voice";

function statusLabel(state: VoiceState): string {
  switch (state) {
    case "listening":
      return "Hört zu – antippen zum Stoppen";
    case "transcribing":
      return "Versteht…";
    case "acting":
      return "Führt aus…";
    case "error":
      return "Bitte erneut antippen";
    default:
      return "Antippen und sprechen";
  }
}

export default function MobileVoiceButton() {
  const [state, setState] = useState<VoiceState>("idle");

  useEffect(() => {
    const handler = (e: CustomEvent<{ state: VoiceState }>) => {
      setState(e.detail?.state || "idle");
    };
    document.addEventListener("voice-state", handler as EventListener);
    return () => document.removeEventListener("voice-state", handler as EventListener);
  }, []);

  const busy = state === "transcribing" || state === "acting";
  const listening = state === "listening";

  const onTap = async () => {
    if (busy) return;
    if (listening) {
      await voice.stop();
      return;
    }
    await voice.start();
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: "8px 16px calc(10px + env(safe-area-inset-bottom))",
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.62)",
          minHeight: 16,
          textAlign: "center",
        }}
      >
        {statusLabel(state)}
      </div>
      <button
        type="button"
        onClick={() => {
          void onTap();
        }}
        disabled={busy}
        aria-label={statusLabel(state)}
        style={{
          width: 76,
          height: 76,
          borderRadius: 9999,
          background: listening ? "rgba(255,115,0,.92)" : "rgba(255,255,255,.12)",
          border: listening ? "1px solid rgba(255,180,80,.7)" : "1px solid rgba(255,255,255,.22)",
          color: "#fff",
          fontSize: 28,
          cursor: busy ? "wait" : "pointer",
          boxShadow: listening ? "0 0 28px rgba(255,115,0,.55)" : "0 8px 18px rgba(0,0,0,.4)",
          opacity: busy ? 0.72 : 1,
        }}
      >
        🎤
      </button>
    </div>
  );
}
