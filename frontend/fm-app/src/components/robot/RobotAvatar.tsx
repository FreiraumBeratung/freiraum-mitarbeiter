import React, { useEffect, useMemo, useRef, useState } from "react";
import { PartnerBotBus, type PartnerBotPose } from "../../modules/partnerbot";

type AvatarUiState = "idle" | "listening" | "thinking" | "speaking" | "success" | "error";
type ThinkingTier = "light" | "deep";
type SuccessVariant = "thumbs" | "nod" | "open";
type SpeechTone = "neutral" | "positive" | "focused" | "warning";
type StatusMode = "always" | "auto";

function estimateSpeechDurationMs(text: string): number {
  const len = (text || "").trim().length;
  const estimated = len * 62;
  return Math.max(1400, Math.min(9000, estimated));
}

function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function buildSeededRandom(seed: number): () => number {
  let x = seed || 123456789;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 10000) / 10000;
  };
}

function buildSpeechFrames(text: string): Array<{ at: number; open: number }> {
  const source = (text || "").trim();
  if (!source) return [];
  const rnd = buildSeededRandom(hashText(source));
  const parts = source.match(/\w+|[.,!?;:]/g) || [];
  const frames: Array<{ at: number; open: number }> = [];
  let time = 0;
  for (const part of parts) {
    if (/^[.,!?;:]$/.test(part)) {
      frames.push({ at: time, open: 0.12 });
      time += part === "," || part === ";" ? 190 : 290;
      continue;
    }
    const len = Math.max(1, Math.min(12, part.length));
    const beat = 120 + len * 12;
    frames.push({ at: time, open: 0.32 + rnd() * 0.25 });
    frames.push({ at: time + beat * 0.45, open: 0.78 - rnd() * 0.18 });
    frames.push({ at: time + beat * 0.86, open: 0.22 + rnd() * 0.12 });
    time += beat;
  }
  frames.push({ at: time + 110, open: 0.14 });
  return frames;
}

function isSuccessSpeech(text: string): boolean {
  return /(e-?mail|mail).*(versendet|gesendet|verschickt|raus)|erfolgreich/i.test(text || "");
}

function isErrorSpeech(text: string): boolean {
  return /fehlgeschlagen|fehler|bitte erneut|nicht geklappt|konnte nicht/i.test(text || "");
}

function classifySpeechTone(text: string): SpeechTone {
  const t = (text || "").toLowerCase();
  if (!t) return "neutral";
  if (isErrorSpeech(t)) return "warning";
  if (isSuccessSpeech(t)) return "positive";
  if (/\?|bitte|kannst du|möchtest du|soll ich/i.test(t)) return "focused";
  return "neutral";
}

function computeSpeechEnergy(text: string): number {
  const t = (text || "").trim();
  if (!t) return 0.3;
  const words = t.split(/\s+/).length;
  const emph = (t.match(/[!?]/g) || []).length;
  return Math.max(0.3, Math.min(1, 0.35 + words / 28 + emph * 0.06));
}

export default function RobotAvatar() {
  const [uiState, setUiState] = useState<AvatarUiState>("idle");
  const [mouthOpen, setMouthOpen] = useState(0.15);
  const [blinkClosed, setBlinkClosed] = useState(false);
  const [showThinkingPulse, setShowThinkingPulse] = useState(false);
  const [microPhase, setMicroPhase] = useState(0);
  const [reactionBoost, setReactionBoost] = useState<"none" | "success" | "error">("none");
  const [thinkingTier, setThinkingTier] = useState<ThinkingTier>("light");
  const [successVariant, setSuccessVariant] = useState<SuccessVariant>("thumbs");
  const [speechTone, setSpeechTone] = useState<SpeechTone>("neutral");
  const [speechEnergy, setSpeechEnergy] = useState(0.45);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [statusMode, setStatusMode] = useState<StatusMode>("always");
  const [showStatusBadge, setShowStatusBadge] = useState(true);
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);

  const speechTimerRef = useRef<number | null>(null);
  const pulseTimerRef = useRef<number | null>(null);
  const reactionTimerRef = useRef<number | null>(null);
  const speechFrameTimersRef = useRef<number[]>([]);
  const fallbackSpeakStartRef = useRef<number | null>(null);
  const pendingSpeechTextRef = useRef<string>("");
  const activeSpeechTextRef = useRef<string>("");
  const thinkingTierTimerRef = useRef<number | null>(null);
  const statusTimerRef = useRef<number | null>(null);
  const lastReactionAtRef = useRef(0);
  const personaModeRef = useRef<"formal" | "energetic">("formal");

  const triggerReaction = (kind: "success" | "error", sourceText?: string) => {
    const now = Date.now();
    if (now - lastReactionAtRef.current < 620) return;
    lastReactionAtRef.current = now;

    if (kind === "success") {
      const seed = hashText(sourceText || activeSpeechTextRef.current || "");
      const bucket = seed % 3;
      setSuccessVariant(bucket === 0 ? "thumbs" : bucket === 1 ? "nod" : "open");
    }
    setUiState(kind);
    setReactionBoost(kind);
    if (reactionTimerRef.current) window.clearTimeout(reactionTimerRef.current);
    reactionTimerRef.current = window.setTimeout(() => {
      setReactionBoost("none");
      setUiState("idle");
      setSpeechTone("neutral");
      setSpeechEnergy(0.45);
    }, 900);
  };

  useEffect(() => {
    return () => {
      if (speechTimerRef.current) window.clearTimeout(speechTimerRef.current);
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
      if (reactionTimerRef.current) window.clearTimeout(reactionTimerRef.current);
      if (fallbackSpeakStartRef.current) window.clearTimeout(fallbackSpeakStartRef.current);
      if (thinkingTierTimerRef.current) window.clearTimeout(thinkingTierTimerRef.current);
      if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
      speechFrameTimersRef.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("fm_robot_persona");
      if (raw === "energetic" || raw === "formal") {
        personaModeRef.current = raw;
      }
      const statusPref = localStorage.getItem("fm_robot_status_mode");
      if (statusPref === "auto" || statusPref === "always") {
        setStatusMode(statusPref);
      }
      const debugPref = localStorage.getItem("fm_robot_debug_overlay");
      if (debugPref === "1") setShowDebugOverlay(true);
      const reducedPref = localStorage.getItem("fm_robot_reduced_motion");
      if (reducedPref === "1") setReducedMotion(true);
    } catch {
      /* ignore */
    }
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (media.matches) setReducedMotion(true);
    }
  }, []);

  useEffect(() => {
    if (uiState !== "thinking") {
      setThinkingTier("light");
      if (thinkingTierTimerRef.current) window.clearTimeout(thinkingTierTimerRef.current);
      return;
    }
    setThinkingTier("light");
    if (thinkingTierTimerRef.current) window.clearTimeout(thinkingTierTimerRef.current);
    thinkingTierTimerRef.current = window.setTimeout(() => setThinkingTier("deep"), 1550);
  }, [uiState]);

  useEffect(() => {
    if (statusMode === "always") {
      setShowStatusBadge(true);
      if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
      return;
    }
    setShowStatusBadge(true);
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
    const hold =
      uiState === "speaking" || uiState === "thinking" || uiState === "listening" ? 1600 : 1050;
    statusTimerRef.current = window.setTimeout(() => setShowStatusBadge(false), hold);
  }, [uiState, statusMode]);

  useEffect(() => {
    const onTtsEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string; text?: string }>).detail;
      const type = detail?.type;
      const text = detail?.text || pendingSpeechTextRef.current || activeSpeechTextRef.current || "";

      if (type === "start") {
        if (fallbackSpeakStartRef.current) window.clearTimeout(fallbackSpeakStartRef.current);
        activeSpeechTextRef.current = text;
        pendingSpeechTextRef.current = text;
        setSpeechTone(classifySpeechTone(text));
        setSpeechEnergy(computeSpeechEnergy(text));
        setUiState("speaking");

        speechFrameTimersRef.current.forEach((id) => window.clearTimeout(id));
        speechFrameTimersRef.current = [];
        const frames = buildSpeechFrames(text);
        frames.forEach((frame) => {
          const id = window.setTimeout(() => setMouthOpen(frame.open), frame.at);
          speechFrameTimersRef.current.push(id);
        });
      } else if (type === "end" || type === "error") {
        speechFrameTimersRef.current.forEach((id) => window.clearTimeout(id));
        speechFrameTimersRef.current = [];
        if (speechTimerRef.current) window.clearTimeout(speechTimerRef.current);
        if (fallbackSpeakStartRef.current) window.clearTimeout(fallbackSpeakStartRef.current);
        setMouthOpen(0.15);

        const spoken = activeSpeechTextRef.current || text;
        activeSpeechTextRef.current = "";
        pendingSpeechTextRef.current = "";

        if (type === "error" || isErrorSpeech(spoken)) triggerReaction("error");
        else if (isSuccessSpeech(spoken)) triggerReaction("success", spoken);
        else {
          setUiState("idle");
          setSpeechTone("neutral");
          setSpeechEnergy(0.45);
        }
      }
    };

    document.addEventListener("fm-tts", onTtsEvent);
    return () => document.removeEventListener("fm-tts", onTtsEvent);
  }, []);

  useEffect(() => {
    const onVoiceState = (event: Event) => {
      const detail = (event as CustomEvent<{ state?: string }>).detail;
      const state = detail?.state || "idle";
      if (state === "listening") setUiState("listening");
      else if (state === "transcribing" || state === "acting") setUiState("thinking");
      else if (state === "error") {
        triggerReaction("error");
      } else if (state === "done") {
        if (!activeSpeechTextRef.current) setUiState("idle");
      } else if (!activeSpeechTextRef.current) setUiState("idle");
    };

    document.addEventListener("voice-state", onVoiceState);
    return () => document.removeEventListener("voice-state", onVoiceState);
  }, []);

  useEffect(() => {
    const offPose = PartnerBotBus.onPose((pose: PartnerBotPose) => {
      if (pose === "listen") setUiState("listening");
      else if (pose === "speak") setUiState("thinking");
      else if (pose === "thinking" || pose === "lightbulb") setUiState("thinking");
      else if (pose === "thumbs") triggerReaction("success");
      else if (pose === "confused") triggerReaction("error");
      else setUiState("idle");
    });

    const offSay = PartnerBotBus.onSay((text: string) => {
      pendingSpeechTextRef.current = text || "";
      setSpeechTone(classifySpeechTone(text));
      setSpeechEnergy(computeSpeechEnergy(text));
      if (fallbackSpeakStartRef.current) window.clearTimeout(fallbackSpeakStartRef.current);
      fallbackSpeakStartRef.current = window.setTimeout(() => {
        if (!activeSpeechTextRef.current && pendingSpeechTextRef.current) {
          activeSpeechTextRef.current = pendingSpeechTextRef.current;
          setUiState("speaking");
          speechFrameTimersRef.current.forEach((id) => window.clearTimeout(id));
          speechFrameTimersRef.current = [];
          const frames = buildSpeechFrames(activeSpeechTextRef.current);
          frames.forEach((frame) => {
            const id = window.setTimeout(() => setMouthOpen(frame.open), frame.at);
            speechFrameTimersRef.current.push(id);
          });
          if (speechTimerRef.current) window.clearTimeout(speechTimerRef.current);
          const timelineDuration = frames.length > 0 ? frames[frames.length - 1].at + 260 : estimateSpeechDurationMs(activeSpeechTextRef.current);
          speechTimerRef.current = window.setTimeout(() => {
            speechFrameTimersRef.current.forEach((id) => window.clearTimeout(id));
            speechFrameTimersRef.current = [];
            setMouthOpen(0.15);
            const spoken = activeSpeechTextRef.current;
            activeSpeechTextRef.current = "";
            pendingSpeechTextRef.current = "";
            if (isSuccessSpeech(spoken)) triggerReaction("success", spoken);
            else if (isErrorSpeech(spoken)) triggerReaction("error");
            else {
              setUiState("idle");
              setSpeechTone("neutral");
              setSpeechEnergy(0.45);
            }
          }, timelineDuration);
        }
      }, 720);
    });

    return () => {
      offPose();
      offSay();
    };
  }, []);

  useEffect(() => {
    if (uiState === "thinking") {
      const id = window.setInterval(() => {
        setMouthOpen((prev) => (prev > 0.2 ? 0.14 : 0.24));
      }, 420);
      return () => window.clearInterval(id);
    }
    setMouthOpen(0.15);
  }, [uiState]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setMicroPhase((p) => p + 1);
    }, 340);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const loop = () => {
      const next = 3200 + Math.random() * 2500;
      pulseTimerRef.current = window.setTimeout(() => {
        if (typeof document !== "undefined" && document.hidden) {
          loop();
          return;
        }
        setBlinkClosed(true);
        window.setTimeout(() => setBlinkClosed(false), 120);
        loop();
      }, next);
    };
    loop();
    return () => {
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (uiState !== "thinking") {
      setShowThinkingPulse(false);
      return;
    }
    setShowThinkingPulse(true);
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setShowThinkingPulse((v) => !v);
    }, 560);
    return () => window.clearInterval(id);
  }, [uiState]);

  const stateLabel = useMemo(() => {
    if (uiState === "listening") return "Ich höre zu";
    if (uiState === "thinking") return thinkingTier === "deep" ? "Ich analysiere" : "Ich denke nach";
    if (uiState === "speaking") return "Ich spreche";
    if (uiState === "success") return "Erledigt";
    if (uiState === "error") return "Bitte erneut";
    return "Bereit";
  }, [uiState, thinkingTier]);

  const eyeFill =
    uiState === "error" || speechTone === "warning"
      ? "#3f1616"
      : uiState === "success" || speechTone === "positive"
      ? "#102b17"
      : speechTone === "focused"
      ? "#14202d"
      : "#0f1720";
  const effectiveMouthOpen = reducedMotion ? 0.28 : mouthOpen;
  const mouthWidth = uiState === "speaking" ? 30 : uiState === "success" ? 32 : 28;
  const mouthHeight = uiState === "speaking" ? 4 + Math.round(effectiveMouthOpen * 10) : uiState === "error" ? 4 : 5;
  const mouthY = uiState === "speaking" ? 70 - Math.round(effectiveMouthOpen * 2) : 72;
  const chestFill =
    uiState === "success"
      ? "rgba(82, 210, 130, 0.55)"
      : uiState === "error"
      ? "rgba(234, 102, 102, 0.55)"
      : uiState === "thinking"
      ? showThinkingPulse
        ? "rgba(120, 200, 255, 0.68)"
        : "rgba(120, 200, 255, 0.38)"
      : "rgba(80,190,255,0.45)";
  const toneChestTint =
    speechTone === "positive"
      ? "rgba(102, 225, 142, 0.42)"
      : speechTone === "warning"
      ? "rgba(235, 120, 120, 0.44)"
      : speechTone === "focused"
      ? "rgba(140, 200, 255, 0.44)"
      : chestFill;
  const shellFilter =
    uiState === "speaking"
      ? "drop-shadow(0 0 12px rgba(123,195,255,0.28))"
      : uiState === "success"
      ? "drop-shadow(0 0 14px rgba(85,220,145,0.26))"
      : uiState === "error"
      ? "drop-shadow(0 0 14px rgba(255,110,110,0.24))"
      : "none";
  const motionFactor = reducedMotion ? 0 : 1;
  const motionTransition = reducedMotion ? "none" : "transform 160ms ease-out";
  const contextGestureScale = speechTone === "warning" ? 0.58 : speechTone === "focused" ? 0.76 : 1;
  const personaScale = personaModeRef.current === "energetic" ? 1.25 : 1.0;
  const microShift = Math.sin(microPhase * 0.45) * 0.85 * motionFactor;
  const headTransform =
    uiState === "thinking"
      ? `rotate(${Math.sin(microPhase * (thinkingTier === "deep" ? 0.36 : 0.55)) * -2.2 * motionFactor}deg) translateY(${(1 + Math.cos(microPhase * 0.5) * (thinkingTier === "deep" ? 1.4 : 0.9)) * motionFactor}px)`
      : uiState === "speaking"
      ? `translateY(${(-1 + Math.sin(microPhase * 0.7) * (0.5 + speechEnergy * 0.4)) * motionFactor}px)`
      : reactionBoost === "success"
      ? successVariant === "nod"
        ? `translateY(${Math.abs(Math.sin(microPhase * 1.4)) * -2.6 * motionFactor}px)`
        : `translateY(${Math.abs(Math.sin(microPhase * 0.9)) * -2.3 * motionFactor}px)`
      : reactionBoost === "error"
      ? `rotate(${Math.sin(microPhase * 1.2) * -2.2 * motionFactor}deg)`
      : `translateY(${microShift * 0.45}px)`;
  const bodyTransform =
    uiState === "thinking"
      ? `translateY(${Math.sin(microPhase * 0.4) * 0.65 * motionFactor}px)`
      : reactionBoost === "success"
      ? `translateY(${Math.abs(Math.sin(microPhase * 1.0)) * -1.6 * motionFactor}px)`
      : "none";
  const armSwing =
    uiState === "speaking"
      ? Math.sin(microPhase * 0.9) * (2.3 + speechEnergy * 2.2) * personaScale * motionFactor * contextGestureScale
      : uiState === "thinking"
      ? Math.sin(microPhase * 0.55) * (thinkingTier === "deep" ? 1.2 : 2.1) * motionFactor * contextGestureScale
      : uiState === "listening"
      ? Math.sin(microPhase * 0.35) * 1.1 * motionFactor * contextGestureScale
      : Math.sin(microPhase * 0.28) * 0.8 * motionFactor * contextGestureScale;
  const leftArmTransform =
    reactionBoost === "success" && successVariant === "open"
      ? `rotate(${(12 + Math.sin(microPhase * 0.8) * 1.6) * motionFactor}deg)`
      : reactionBoost === "error"
      ? `rotate(${(7 + Math.sin(microPhase * 1.2) * 1.8) * motionFactor}deg)`
      : `rotate(${armSwing}deg)`;
  const rightArmTransform =
    reactionBoost === "success"
      ? successVariant === "thumbs"
        ? `rotate(${(-30 + Math.sin(microPhase * 0.9) * 2.2) * motionFactor}deg) translateY(${-2 * motionFactor}px)`
        : successVariant === "open"
        ? `rotate(${(-16 + Math.sin(microPhase * 0.8) * 1.8) * motionFactor}deg)`
        : `rotate(${(-8 + Math.sin(microPhase * 0.8) * 1.1) * motionFactor}deg)`
      : reactionBoost === "error"
      ? `rotate(${(-7 + Math.sin(microPhase * 1.2) * 1.8) * motionFactor}deg)`
      : `rotate(${-armSwing}deg)`;
  const legAmp = (uiState === "speaking" ? 1.1 + speechEnergy * 0.95 : 1.1) * motionFactor * contextGestureScale;
  const leftLegTransform = `rotate(${Math.sin(microPhase * 0.5) * legAmp}deg)`;
  const rightLegTransform = `rotate(${Math.sin(microPhase * 0.5 + Math.PI) * legAmp}deg)`;

  return (
    <div
      className="avatar-bot avatar-breathe"
      data-testid="avatar-bot"
      style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div style={{ position: "relative", width: 340, height: 540, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", width: 300, height: 300, borderRadius: 999, background: "radial-gradient(circle, rgba(255,255,255,0.2) 0%, rgba(120,190,255,0.12) 50%, rgba(0,0,0,0) 78%)", filter: "blur(74px)" }} />
        {showStatusBadge && (
          <div
            style={{
              position: "absolute",
              top: -6,
              left: "50%",
              transform: "translateX(-50%)",
              height: 24,
              minWidth: 110,
              borderRadius: 999,
              padding: "0 12px",
              fontSize: 11,
              color: "rgba(255,255,255,0.86)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background:
                uiState === "success"
                  ? "rgba(55,170,110,0.24)"
                  : uiState === "error"
                  ? "rgba(185,76,76,0.25)"
                  : "rgba(22,30,40,0.48)",
              border: "1px solid rgba(255,255,255,0.14)",
              backdropFilter: "blur(8px)",
              letterSpacing: 0.2,
              transition: reducedMotion ? "none" : "opacity 200ms ease-out, transform 200ms ease-out",
            }}
          >
            {stateLabel}
          </div>
        )}
        {showDebugOverlay && (
          <div
            style={{
              position: "absolute",
              right: -6,
              top: 56,
              minWidth: 142,
              borderRadius: 12,
              padding: "8px 10px",
              fontSize: 10,
              lineHeight: 1.35,
              background: "rgba(11,15,21,0.78)",
              border: "1px solid rgba(255,255,255,0.14)",
              color: "rgba(220,230,243,0.88)",
              backdropFilter: "blur(6px)",
            }}
          >
            <div>state: {uiState}</div>
            <div>think: {thinkingTier}</div>
            <div>tone: {speechTone}</div>
            <div>energy: {speechEnergy.toFixed(2)}</div>
            <div>persona: {personaModeRef.current}</div>
            <div>status: {statusMode}</div>
            <div>motion: {reducedMotion ? "reduced" : "full"}</div>
          </div>
        )}
        <svg width="300" height="500" viewBox="0 0 300 500" role="img" aria-label="Humanoider Roboter">
          <defs>
            <linearGradient id="shell" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#dde4ec" />
            </linearGradient>
            <linearGradient id="joint" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#b9c3d0" />
              <stop offset="100%" stopColor="#8e9aa8" />
            </linearGradient>
          </defs>

          {/* head */}
          <g
            style={{
              transformOrigin: "150px 55px",
              transform: headTransform,
              transition: motionTransition,
            }}
          >
            <rect x="104" y="12" width="92" height="84" rx="20" fill="url(#shell)" stroke="rgba(0,0,0,0.15)" />
            <rect x="96" y="39" width="8" height="26" rx="4" fill="url(#joint)" />
            <rect x="196" y="39" width="8" height="26" rx="4" fill="url(#joint)" />
            <ellipse cx="134" cy="50" rx="5.5" ry={blinkClosed ? 1.2 : 5.5} fill={eyeFill} />
            <ellipse cx="166" cy="50" rx="5.5" ry={blinkClosed ? 1.2 : 5.5} fill={eyeFill} />
            <rect
              x={150 - mouthWidth / 2}
              y={mouthY}
              width={mouthWidth}
              height={mouthHeight}
              rx={Math.max(2.75, mouthHeight / 2)}
              fill={
                uiState === "success"
                  ? "rgba(48,130,70,0.55)"
                  : uiState === "error"
                  ? "rgba(120,42,42,0.58)"
                  : "rgba(30,40,52,0.42)"
              }
            />
          </g>

          {/* neck */}
          <rect x="133" y="102" width="34" height="16" rx="7" fill="url(#joint)" stroke="rgba(0,0,0,0.12)" />

          {/* torso */}
          <g style={{ filter: shellFilter, transformOrigin: "150px 220px", transform: bodyTransform, transition: motionTransition }}>
            <path d="M93 129 C104 116, 124 112, 150 112 C176 112, 196 116, 207 129 C215 138, 218 156, 218 182 C218 224, 214 258, 205 268 C196 278, 104 278, 95 268 C86 258, 82 224, 82 182 C82 156, 85 138, 93 129 Z" fill="url(#shell)" stroke="rgba(0,0,0,0.12)" />
          </g>
          <circle cx="150" cy="154" r="12" fill={toneChestTint} />
          <rect x="120" y="184" width="60" height="66" rx="16" fill="#e7edf4" stroke="rgba(0,0,0,0.1)" />

          {/* left arm with subtle motion */}
          <g style={{ transformOrigin: "86px 145px", transform: leftArmTransform, transition: motionTransition }}>
            <path d="M78 145 C68 156, 67 176, 72 196 C75 209, 75 220, 71 233 C66 251, 68 274, 78 288 C82 293, 89 294, 94 289 C98 285, 99 278, 95 272 C87 258, 85 247, 89 232 C93 215, 92 200, 87 186 C84 177, 84 166, 90 156 C94 149, 93 141, 87 138 C84 136, 80 139, 78 145 Z" fill="url(#shell)" stroke="rgba(0,0,0,0.12)" />
            <circle cx="84" cy="212" r="5.5" fill="#ccd6e2" stroke="rgba(0,0,0,0.12)" />
            <ellipse cx="91" cy="292" rx="6.5" ry="5.5" fill="#dbe3ec" stroke="rgba(0,0,0,0.12)" />
          </g>

          {/* right arm with subtle motion and success thumbs-up */}
          <g style={{ transformOrigin: "214px 145px", transform: rightArmTransform, transition: motionTransition }}>
            <path d="M222 145 C232 156, 233 176, 228 196 C225 209, 225 220, 229 233 C234 251, 232 274, 222 288 C218 293, 211 294, 206 289 C202 285, 201 278, 205 272 C213 258, 215 247, 211 232 C207 215, 208 200, 213 186 C216 177, 216 166, 210 156 C206 149, 207 141, 213 138 C216 136, 220 139, 222 145 Z" fill="url(#shell)" stroke="rgba(0,0,0,0.12)" />
            <circle cx="216" cy="212" r="5.5" fill="#ccd6e2" stroke="rgba(0,0,0,0.12)" />
            <ellipse cx="209" cy="292" rx="6.5" ry="5.5" fill="#dbe3ec" stroke="rgba(0,0,0,0.12)" />
          </g>

          {/* hip */}
          <rect x="106" y="276" width="88" height="30" rx="14" fill="#e7edf4" stroke="rgba(0,0,0,0.1)" />

          {/* legs with subtle motion */}
          <g style={{ transformOrigin: "126px 309px", transform: leftLegTransform, transition: motionTransition }}>
            <path d="M115 309 C109 318, 108 338, 112 356 C116 373, 118 391, 114 408 C112 417, 117 425, 126 426 C135 427, 142 421, 142 412 C141 395, 139 379, 136 361 C133 344, 134 327, 138 314 C141 305, 137 299, 128 299 C123 299, 118 302, 115 309 Z" fill="url(#shell)" stroke="rgba(0,0,0,0.12)" />
            <circle cx="126" cy="362" r="6.5" fill="#ccd6e2" stroke="rgba(0,0,0,0.12)" />
            <ellipse cx="128" cy="423" rx="24" ry="7" fill="#d6e0ea" stroke="rgba(0,0,0,0.12)" />
          </g>
          <g style={{ transformOrigin: "174px 309px", transform: rightLegTransform, transition: motionTransition }}>
            <path d="M185 309 C191 318, 192 338, 188 356 C184 373, 182 391, 186 408 C188 417, 183 425, 174 426 C165 427, 158 421, 158 412 C159 395, 161 379, 164 361 C167 344, 166 327, 162 314 C159 305, 163 299, 172 299 C177 299, 182 302, 185 309 Z" fill="url(#shell)" stroke="rgba(0,0,0,0.12)" />
            <circle cx="174" cy="362" r="6.5" fill="#ccd6e2" stroke="rgba(0,0,0,0.12)" />
            <ellipse cx="172" cy="423" rx="24" ry="7" fill="#d6e0ea" stroke="rgba(0,0,0,0.12)" />
          </g>
        </svg>
      </div>
    </div>
  );
}
