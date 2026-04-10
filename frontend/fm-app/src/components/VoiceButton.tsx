import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { voice, type VoiceState } from "../modules/voice";

export default function VoiceButton() {
  const [state, setState] = useState<VoiceState>("idle");
  const location = useLocation();
  const isMailWorkspace = (location.pathname || "").startsWith("/mail/compose");

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

  const listening = state === "listening";

  return (
    <div
      className="glass-card"
      style={{
        padding: 10,
        borderRadius: 9999,
        background: "rgba(14,16,19,0.78)",
        border: "1px solid rgba(255,255,255,.14)",
        boxShadow: "0 16px 34px rgba(0,0,0,.45)",
        transform: isMailWorkspace ? "translateY(-22px)" : "none",
        transition: "transform 180ms ease",
      }}
    >
      <button
        onMouseDown={press}
        onMouseUp={release}
        onMouseLeave={release}
        onTouchStart={press}
        onTouchEnd={release}
        onTouchCancel={release}
        title="Push-to-Talk"
        style={{
          width: 72,
          height: 72,
          borderRadius: 9999,
          background: listening ? "rgba(255,115,0,.9)" : "rgba(255,255,255,.10)",
          border: "1px solid rgba(255,255,255,.25)",
          backdropFilter: "blur(8px)",
          color: "#fff",
          fontSize: 24,
          cursor: "pointer",
          boxShadow: listening ? "0 0 24px rgba(255,115,0,.6)" : "0 4px 14px rgba(0,0,0,.35)",
          margin: "0 auto",
        }}
      >
        🎤
      </button>
    </div>
  );
}

function label(state: VoiceState) {
  switch (state) {
    case "listening":
      return "Hört zu";
    case "transcribing":
      return "Versteht";
    case "acting":
      return "Führt aus";
    case "done":
      return "Bereit";
    case "error":
      return "Bitte erneut";
    default:
      return "Bereit";
  }
}


