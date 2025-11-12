import React, { useEffect, useState } from "react";

import { voice, type VoiceState } from "../modules/voice";

export default function VoiceButton() {
  const [state, setState] = useState<VoiceState>("idle");

  useEffect(() => {
    const handler = (e: CustomEvent<{ state: VoiceState }>) => {
      const st = e.detail?.state || "idle";
      setState(st);
      const node = document.querySelector("[data-testid='avatar-bot']");
      if (!node) return;
      if (st === "listening") node.classList.add("avatar-listening");
      else node.classList.remove("avatar-listening");
    };
    document.addEventListener("voice-state", handler as EventListener);
    return () => document.removeEventListener("voice-state", handler as EventListener);
  }, []);

  const press = async () => {
    await voice.start();
  };

  const release = async () => {
    await voice.stop();
  };

  return (
    <div style={{ position: "fixed", right: 18, bottom: 18, zIndex: 9999 }}>
      <button
        onMouseDown={press}
        onMouseUp={release}
        onMouseLeave={release}
        onTouchStart={press}
        onTouchEnd={release}
        onTouchCancel={release}
        title="Push-to-Talk"
        style={{
          width: 66,
          height: 66,
          borderRadius: 9999,
          background: state === "listening" ? "rgba(255,115,0,.9)" : "rgba(255,255,255,.10)",
          border: "1px solid rgba(255,255,255,.25)",
          backdropFilter: "blur(8px)",
          color: "#fff",
          fontSize: 24,
          cursor: "pointer",
          boxShadow:
            state === "listening"
              ? "0 0 24px rgba(255,115,0,.6)"
              : "0 4px 14px rgba(0,0,0,.35)",
        }}
      >
        🎤
      </button>
    </div>
  );
}


