import React, { useEffect, useState, useRef } from "react";
import { PartnerBotBus } from "./PartnerBotBus";

type Pose = "idle" | "listen" | "speak" | "walk" | "wave" | "thumbs";

export default function PartnerBot({ pose: externalPose }: { pose?: Pose }) {
  const [pose, setPose] = useState<Pose>(externalPose || "idle");
  const [message, setMessage] = useState("");
  const [walkOffset, setWalkOffset] = useState(0);
  const walkIntervalRef = useRef<number | null>(null);
  const idleWalkTimerRef = useRef<number | null>(null);

  // Subscribe to PartnerBotBus
  useEffect(() => {
    const fn = (data: { pose: Pose; message?: string }) => {
      if (data.pose) setPose(data.pose);
      if (data.message !== undefined) setMessage(data.message || "");
    };
    PartnerBotBus.subs.add(fn);
    // Initial state
    setPose(PartnerBotBus.pose);
    setMessage(PartnerBotBus.message);
    return () => {
      PartnerBotBus.subs.delete(fn);
    };
  }, []);

  // External pose override (from voice UI)
  useEffect(() => {
    if (externalPose && externalPose !== "walk" && externalPose !== "wave" && externalPose !== "thumbs") {
      setPose(externalPose);
    }
  }, [externalPose]);

  // Random idle walk animation (every 20-35s)
  useEffect(() => {
    if (pose !== "idle" && pose !== "walk") return;

    const scheduleWalk = () => {
      const delay = 20000 + Math.random() * 15000; // 20-35s
      idleWalkTimerRef.current = window.setTimeout(() => {
        if (pose === "idle") {
          setPose("walk");
          setWalkOffset(0);
          let offset = 0;
          walkIntervalRef.current = window.setInterval(() => {
            offset += 2;
            setWalkOffset(offset);
            if (offset > 300) {
              if (walkIntervalRef.current) {
                clearInterval(walkIntervalRef.current);
                walkIntervalRef.current = null;
              }
              setPose("idle");
              setWalkOffset(0);
              scheduleWalk();
            }
          }, 50);
        }
      }, delay);
    };

    scheduleWalk();

    return () => {
      if (idleWalkTimerRef.current) clearTimeout(idleWalkTimerRef.current);
      if (walkIntervalRef.current) clearInterval(walkIntervalRef.current);
    };
  }, [pose]);

  // Auto-hide message after 4s
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const leftPos = 16 + (pose === "walk" ? walkOffset : 0);

  return (
    <div
      className="fixed bottom-6 z-40 select-none transition-all duration-300"
      style={{ left: `${leftPos}px` }}
      aria-label={`Partner • ${pose}`}
    >
      {/* Speech Bubble */}
      {message && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-4 py-2 rounded-2xl max-w-xs text-sm text-white/90 shadow-lg"
          style={{
            background: "rgba(12, 13, 15, 0.95)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: "1px solid rgba(255,115,0,0.3)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,115,0,0.1)",
          }}
        >
          <div className="relative">
            {message}
            {/* Arrow */}
            <div
              className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
              style={{
                borderLeft: "8px solid transparent",
                borderRight: "8px solid transparent",
                borderTop: "8px solid rgba(12, 13, 15, 0.95)",
              }}
            />
          </div>
        </div>
      )}

      {/* Robot SVG */}
      <div
        className={`transition-transform duration-300 ${
          pose === "walk" ? "animate-[walk_0.5s_ease-in-out_infinite]" : pose === "idle" ? "animate-[breath_3s_ease-in-out_infinite]" : ""
        }`}
      >
        <svg
          width="84"
          height="110"
          viewBox="0 0 84 110"
          className="drop-shadow-[0_0_12px_rgba(255,115,0,0.25)]"
          style={{
            filter: pose === "speak" ? "drop-shadow(0 0 20px rgba(255,115,0,0.5))" : undefined,
          }}
        >
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Legs */}
          <rect
            x="24"
            y="90"
            width="8"
            height="18"
            rx="3"
            fill="#2b2b2b"
            className={pose === "walk" ? "animate-[legLeft_0.5s_ease-in-out_infinite]" : ""}
          />
          <rect
            x="52"
            y="90"
            width="8"
            height="18"
            rx="3"
            fill="#2b2b2b"
            className={pose === "walk" ? "animate-[legRight_0.5s_ease-in-out_infinite]" : ""}
          />
          {/* Body */}
          <rect x="16" y="40" width="52" height="46" rx="10" fill="#1f1f1f" stroke="#3a3a3a" />
          {/* Arms */}
          <rect
            x="6"
            y="48"
            width="8"
            height="28"
            rx="4"
            fill="#2b2b2b"
            className={
              pose === "listen"
                ? "origin-right animate-pulse"
                : pose === "wave" || pose === "thumbs"
                  ? "origin-right animate-[wave_1s_ease-in-out_infinite]"
                  : pose === "walk"
                    ? "origin-right animate-[armLeft_0.5s_ease-in-out_infinite]"
                    : ""
            }
          />
          <rect
            x="70"
            y="48"
            width="8"
            height="28"
            rx="4"
            fill="#2b2b2b"
            className={
              pose === "speak"
                ? "origin-left animate-pulse"
                : pose === "wave" || pose === "thumbs"
                  ? "origin-left animate-[wave_1s_ease-in-out_infinite]"
                  : pose === "walk"
                    ? "origin-left animate-[armRight_0.5s_ease-in-out_infinite]"
                    : ""
            }
          />
          {/* Thumbs up icon for thumbs pose */}
          {pose === "thumbs" && (
            <text x="42" y="65" textAnchor="middle" fontSize="20" fill="#ff7300">
              👍
            </text>
          )}
          {/* Head */}
          <g
            transform={
              pose === "listen"
                ? "translate(0,0) rotate(-6,42,28)"
                : pose === "speak"
                  ? "translate(0,0) rotate(6,42,28)"
                  : ""
            }
          >
            <rect
              x="22"
              y="8"
              width="40"
              height="34"
              rx="10"
              fill="#1a1a1a"
              stroke="#3a3a3a"
              filter="url(#glow)"
            />
            <circle cx="36" cy="25" r="5" fill="#00ffab" />
            <circle cx="52" cy="25" r="5" fill="#00ffab" />
            {/* mouth */}
            <rect
              x="34"
              y="31"
              width="18"
              height="3"
              rx="1.5"
              fill={pose === "speak" ? "#ff7300" : "#444"}
            />
          </g>
        </svg>
      </div>
      <div className="mt-1 text-xs text-neutral-400 text-center" style={{ width: "84px" }}>
        Partner • {pose}
      </div>
      <style>{`
        @keyframes breath {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        @keyframes walk {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes legLeft {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-2px) rotate(-10deg); }
        }
        @keyframes legRight {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-2px) rotate(10deg); }
        }
        @keyframes armLeft {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-15deg); }
        }
        @keyframes armRight {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(15deg); }
        }
        @keyframes wave {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-20deg); }
          75% { transform: rotate(20deg); }
        }
      `}</style>
    </div>
  );
}
