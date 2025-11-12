import React, { useEffect, useMemo, useRef, useState } from "react";
import { voice, type VoiceState } from "../modules/voice";
import { getVoicePrefs, setVoicePrefs } from "../modules/tts/settings";

type Prefs = ReturnType<typeof getVoicePrefs>;

export default function PTTBar() {
  const [state, setState] = useState<VoiceState>("idle");
  const [level, setLevel] = useState(0);
  const [prefs, updatePrefs] = useState<Prefs>(getVoicePrefs());
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>();

  useEffect(() => {
    const onVoiceState = (event: Event) => {
      const custom = event as CustomEvent<{ state: VoiceState }>;
      if (custom.detail?.state) {
        setState(custom.detail.state);
      }
    };
    document.addEventListener("voice-state", onVoiceState as EventListener);
    return () => document.removeEventListener("voice-state", onVoiceState as EventListener);
  }, []);

  useEffect(() => {
    if (state !== "listening" && state !== "transcribing") {
      stopMonitor();
    }
  }, [state]);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<Prefs>;
      if (custom.detail) {
        updatePrefs(custom.detail);
      }
    };
    document.addEventListener("voice-prefs", handler as EventListener);
    return () => document.removeEventListener("voice-prefs", handler as EventListener);
  }, []);

  const busy = state !== "idle" && state !== "done" && state !== "error";

  const press = async () => {
    await startMonitor();
    await voice.start();
  };

  const release = async () => {
    await voice.stop();
    stopMonitor();
  };

  const changeRate = (value: number) => {
    setVoicePrefs({ rate: value });
    updatePrefs(getVoicePrefs());
  };

  const changePitch = (value: number) => {
    setVoicePrefs({ pitch: value });
    updatePrefs(getVoicePrefs());
  };

  const stateLabel = useMemo(() => {
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
  }, [state]);

  return (
    <div
      className="glass"
      style={{
        position: "fixed",
        right: 18,
        bottom: 18,
        padding: "18px 20px",
        width: 240,
        display: "grid",
        gap: 12,
        zIndex: 9050,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 600, letterSpacing: 0.4 }}>Push-to-Talk</span>
        <span style={{ fontSize: 12, opacity: 0.7 }}>{stateLabel}</span>
      </div>

      <div
        className={`breath ${state === "listening" ? "glow-listen" : ""}`}
        style={{
          width: 90,
          height: 90,
          borderRadius: "50%",
          margin: "0 auto",
          display: "grid",
          placeItems: "center",
          background:
            state === "listening"
              ? "linear-gradient(145deg, rgba(255,106,0,.92), rgba(255,141,0,.82))"
              : "linear-gradient(145deg, rgba(30,30,30,.9), rgba(18,18,18,.9))",
          color: "#fff",
          cursor: "pointer",
          border: "1px solid rgba(255,255,255,.15)",
          transition: "all .25s ease",
          boxShadow: state === "listening" ? "0 18px 40px rgba(255,106,0,.45)" : "0 12px 28px rgba(0,0,0,.45)",
          userSelect: "none",
        }}
        onMouseDown={press}
        onMouseUp={release}
        onMouseLeave={busy ? undefined : release}
        onTouchStart={(event) => {
          event.preventDefault();
          press();
        }}
        onTouchEnd={(event) => {
          event.preventDefault();
          release();
        }}
        onTouchCancel={release}
      >
        <span style={{ fontSize: 28, fontWeight: 600 }}>{busy ? "🎙️" : "🎤"}</span>
      </div>

      <div>
        <label style={{ fontSize: 12, opacity: 0.75 }}>Pegel</label>
        <div
          style={{
            marginTop: 6,
            height: 10,
            borderRadius: 999,
            background: "rgba(255,255,255,.08)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.min(100, Math.round(level * 100))}%`,
              transition: "width 0.1s linear",
              background: "linear-gradient(90deg, rgba(255,115,0,.8), rgba(255,165,0,.9))",
            }}
          />
        </div>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        <div>
          <label style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.75 }}>
            <span>Tempo</span>
            <span>{prefs.rate.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="0.70"
            max="1.15"
            step="0.01"
            value={prefs.rate}
            onChange={(event) => changeRate(parseFloat(event.target.value))}
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <label style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.75 }}>
            <span>Tonhöhe</span>
            <span>{prefs.pitch.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="0.80"
            max="1.20"
            step="0.01"
            value={prefs.pitch}
            onChange={(event) => changePitch(parseFloat(event.target.value))}
            style={{ width: "100%" }}
          />
        </div>
      </div>
    </div>
  );

  async function startMonitor() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return;
      stopMonitor();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((sum, value) => sum + value, 0) / data.length;
        setLevel(avg / 255);
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch {
      // ignore audio meter errors
    }
  }

  function stopMonitor() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = undefined;
    analyserRef.current = null;
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {
        /* ignore */
      }
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setLevel(0);
  }
}


