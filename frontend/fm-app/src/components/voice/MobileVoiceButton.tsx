import React, { useEffect, useRef, useState } from "react";

import { probeBackendSttHealth, requestRecorderStop } from "../../modules/stt";
import { voice, type VoiceState } from "../../modules/voice";
import { unlockTtsPlayback } from "../../modules/voice/tts";

function httpsMicUrl(): string | null {
  if (typeof window === "undefined") return null;
  if (window.isSecureContext) return null;
  const host = window.location.hostname || "";
  if (!host || host === "localhost" || host === "127.0.0.1") return null;
  return `https://${host}:5174`;
}

function statusLabel(state: VoiceState, insecureUrl: string | null): string {
  if (insecureUrl) {
    return `Safari blockiert HTTP-Mikrofon. Öffne ${insecureUrl} und bestätige die Warnung.`;
  }
  switch (state) {
    case "listening":
      return "Hört zu – nochmal antippen zum Stoppen";
    case "transcribing":
      return "Versteht…";
    case "acting":
      return "Führt aus…";
    case "error":
      return "Noch einmal antippen";
    default:
      return "Antippen, sprechen, nochmal antippen";
  }
}

function MicIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"
      />
    </svg>
  );
}

export default function MobileVoiceButton() {
  const [state, setState] = useState<VoiceState>("idle");
  const lastToggleAtRef = useRef(0);
  const insecureUrl = httpsMicUrl();

  useEffect(() => {
    void probeBackendSttHealth();
    const handler = (e: CustomEvent<{ state: VoiceState }>) => {
      setState(e.detail?.state || "idle");
    };
    document.addEventListener("voice-state", handler as EventListener);
    return () => {
      document.removeEventListener("voice-state", handler as EventListener);
    };
  }, []);

  const busy = state === "transcribing" || state === "acting";
  const listening = state === "listening";

  const toggle = async (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    unlockTtsPlayback();
    const now = Date.now();
    if (now - lastToggleAtRef.current < 350) return;
    lastToggleAtRef.current = now;
    if (busy) return;
    if (listening) {
      // Nur Recorder stoppen, Tracks erst nach onstop – sonst ist die iOS-Aufnahme leer.
      requestRecorderStop();
      unlockTtsPlayback();
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
        padding: "10px 16px calc(88px + env(safe-area-inset-bottom, 0px))",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.62)",
          minHeight: 16,
          textAlign: "center",
          WebkitUserSelect: "none",
          userSelect: "none",
        }}
      >
        {statusLabel(state, insecureUrl)}
      </div>
      {listening ? (
        <style>
          {`@keyframes fm-mic-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(255,115,0,.45), 0 0 26px rgba(255,115,0,.7); }
            50% { box-shadow: 0 0 0 12px rgba(255,115,0,.12), 0 0 38px rgba(255,140,0,.9); }
          }`}
        </style>
      ) : null}
      <button
        type="button"
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          void toggle(e);
        }}
        aria-label={statusLabel(state, insecureUrl)}
        style={{
          width: 76,
          height: 76,
          borderRadius: 9999,
          background: listening
            ? "rgba(255,115,0,.92)"
            : busy
              ? "rgba(255,140,0,.45)"
              : "rgba(255,255,255,.12)",
          border: listening || busy ? "1px solid rgba(255,180,80,.7)" : "1px solid rgba(255,255,255,.22)",
          color: "#fff",
          cursor: busy ? "wait" : "pointer",
          boxShadow: listening ? "0 0 28px rgba(255,115,0,.55)" : "0 8px 18px rgba(0,0,0,.4)",
          animation: listening ? "fm-mic-pulse 1.35s ease-in-out infinite" : undefined,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          WebkitUserSelect: "none",
          userSelect: "none",
          WebkitTouchCallout: "none",
          touchAction: "manipulation",
        }}
      >
        <MicIcon />
      </button>
    </div>
  );
}
