import React, { useEffect, useMemo, useState, useRef } from "react";
import AvatarBot from "./AvatarBot";
import type { VoiceState } from "../modules/voice";

type Pose = "neutral" | "tilt-left" | "tilt-right";

function nextPose(current: Pose): Pose {
  if (current === "neutral") return Math.random() > 0.5 ? "tilt-left" : "tilt-right";
  return "neutral";
}

export default function AvatarFrame() {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [pose, setPose] = useState<Pose>("neutral");
  const frameRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ state: VoiceState }>;
      if (custom.detail?.state) {
        setVoiceState(custom.detail.state);
      }
    };
    document.addEventListener("voice-state", handler as EventListener);
    return () => document.removeEventListener("voice-state", handler as EventListener);
  }, []);

  useEffect(() => {
    const handle = window.setInterval(() => {
      setPose((current) => nextPose(current));
    }, 5200);
    return () => window.clearInterval(handle);
  }, []);

  useEffect(() => {
    const node = frameRef.current?.querySelector('[data-testid="avatar-bot"]') as HTMLElement | null;
    if (node) {
      node.style.position = "relative";
      node.style.left = "0";
      node.style.bottom = "0";
      node.style.width = "100%";
      node.style.height = "100%";
      node.style.borderRadius = "18px";
      node.style.boxShadow = "none";
    }
  }, []);

  const listening = voiceState === "listening" || voiceState === "transcribing";
  const poseStyle = useMemo(() => {
    switch (pose) {
      case "tilt-left":
        return { transform: "rotate(-2deg) translateY(-1px)" };
      case "tilt-right":
        return { transform: "rotate(2deg) translateY(-1px)" };
      default:
        return { transform: "rotate(0deg)" };
    }
  }, [pose]);

  return (
    <div
      className={`glass breath ${listening ? "glow-listen" : ""}`}
      style={{
        position: "fixed",
        left: 18,
        bottom: 18,
        width: 160,
        height: 160,
        padding: 12,
        zIndex: 9000,
        transition: "box-shadow 0.3s ease, transform 0.3s ease",
        display: "grid",
        placeItems: "center",
      }}
      ref={frameRef}
    >
      <div className="blink" style={{ width: "100%", height: "100%", transition: "transform 0.4s ease", ...poseStyle }}>
        <AvatarBot />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 10,
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: 11,
          letterSpacing: 0.3,
          textTransform: "uppercase",
          opacity: 0.7,
        }}
      >
        {labelForState(voiceState)}
      </div>
    </div>
  );
}

function labelForState(state: VoiceState): string {
  switch (state) {
    case "listening":
      return "Hört zu";
    case "transcribing":
      return "Versteht";
    case "acting":
      return "Erledigt";
    case "done":
      return "Bereit";
    case "error":
      return "Nochmal?";
    default:
      return "Bereit";
  }
}


