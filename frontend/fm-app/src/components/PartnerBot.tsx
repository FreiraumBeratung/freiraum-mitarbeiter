import React, { useEffect, useRef, useState } from "react";
import { PartnerBotBus, type PartnerBotPose } from "../modules/partnerbot";
import { triggerEmotion } from "../modules/partnerbot/partnerbot_emotion";

export { PartnerBotBus } from "../modules/partnerbot";

type Pose = PartnerBotPose;
type BotMode = "walking-left" | "walking-right" | "idle" | "sitting";

const BOT_WIDTH = 84;
const SIDE_MARGIN = 32;
const WALK_SPEED = 70;

const randRange = (min: number, max: number) => min + Math.random() * (max - min);
const getBounds = () => {
  if (typeof window === "undefined") return { min: 0, max: 480 };
  return { min: 0, max: Math.max(160, window.innerWidth - BOT_WIDTH - SIDE_MARGIN) };
};

export default function PartnerBot() {
  const boundsRef = useRef(getBounds());
  const initialX = Math.min(boundsRef.current.max * 0.2, 180);

  const [mode, setMode] = useState<BotMode>("walking-right");
  const [pose, setPose] = useState<Pose>("idle");
  const [bubble, setBubble] = useState("");
  const [emote, setEmote] = useState<string | null>(null);
  const [x, setX] = useState(initialX);
  const [facing, setFacing] = useState<1 | -1>(1);

  const xRef = useRef(x);
  const bubbleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    xRef.current = x;
  }, [x]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateBounds = () => {
      boundsRef.current = getBounds();
      setX((prev) => Math.min(boundsRef.current.max, Math.max(boundsRef.current.min, prev)));
    };
    updateBounds();
    window.addEventListener("resize", updateBounds);
    return () => window.removeEventListener("resize", updateBounds);
  }, []);

  useEffect(() => {
    if (mode === "walking-left") setFacing(-1);
    if (mode === "walking-right") setFacing(1);
  }, [mode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (mode !== "walking-left" && mode !== "walking-right") return;
    let frame: number;
    let last = performance.now();

    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      const dt = (now - last) / 1000;
      last = now;
      const dir = mode === "walking-left" ? -1 : 1;
      setX((prev) => {
        const next = prev + dir * WALK_SPEED * dt;
        const { min, max } = boundsRef.current;
        if (next <= min) {
          setMode(Math.random() > 0.5 ? "idle" : "walking-right");
          return min;
        }
        if (next >= max) {
          setMode(Math.random() > 0.5 ? "idle" : "walking-left");
          return max;
        }
        return next;
      });
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pickDirection = (): BotMode => {
      const { max } = boundsRef.current;
      if (max <= 0) return "walking-right";
      const ratio = xRef.current / max;
      if (ratio < 0.25) return "walking-right";
      if (ratio > 0.75) return "walking-left";
      return Math.random() > 0.5 ? "walking-right" : "walking-left";
    };

    let timeout: number;
    if (mode === "walking-left" || mode === "walking-right") {
      timeout = window.setTimeout(() => {
        setMode(Math.random() > 0.6 ? "idle" : "sitting");
      }, randRange(6000, 12000));
    } else if (mode === "idle") {
      timeout = window.setTimeout(() => {
        setMode(Math.random() > 0.4 ? pickDirection() : "sitting");
      }, randRange(3000, 8000));
    } else if (mode === "sitting") {
      timeout = window.setTimeout(() => {
        setMode(pickDirection());
      }, randRange(4000, 10000));
    }
    return () => clearTimeout(timeout);
  }, [mode]);

  useEffect(() => {
    const offSay = PartnerBotBus.onSay((msg) => {
      setBubble(msg);
      if (bubbleTimerRef.current) window.clearTimeout(bubbleTimerRef.current);
      bubbleTimerRef.current = window.setTimeout(() => setBubble(""), 3500);
    });
    const offPose = PartnerBotBus.onPose((nextPose) => setPose(nextPose));
    return () => {
      offSay();
      offPose();
      if (bubbleTimerRef.current) window.clearTimeout(bubbleTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let hideTimer: number | null = null;
    const offEmote = PartnerBotBus.onEmote((symbol) => {
      setEmote(symbol);
      if (hideTimer) {
        window.clearTimeout(hideTimer);
      }
      hideTimer = window.setTimeout(() => {
        setEmote(null);
        hideTimer = null;
      }, 1800);
    });
    return () => {
      offEmote();
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, []);

  const isListening = pose === "listen";
  const isSpeaking = pose === "speak";

  useEffect(() => {
    if (typeof window === "undefined") return;
    let timer: number;
    const schedule = () => {
      const delay = 5000 + Math.random() * 3000;
      timer = window.setTimeout(() => {
        if (!isListening && !isSpeaking) {
          triggerEmotion("idle-pulse");
        }
        schedule();
      }, delay);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [isListening, isSpeaking]);

  const animationClass =
    mode === "sitting" ? "bot-anim bot-sitting" : mode === "idle" ? "bot-anim bot-idle" : "bot-anim bot-walking";

  return (
    <div className="bot-wrap" style={{ transform: `translateX(${Math.round(x)}px)` }}>
      <div className="bot-shell" style={{ transform: `scaleX(${facing})` }}>
        {bubble && (
          <div
            className="bot-bubble"
            style={{
              position: "absolute",
              bottom: "100%",
              left: "50%",
              transform: "translate(-50%, -12px)",
              maxWidth: 300,
            }}
          >
            {bubble}
          </div>
        )}
        {emote && (
          <div
            className="absolute -top-6 left-1/2 -translate-x-1/2 text-2xl animate-fade"
            style={{ pointerEvents: "none" }}
          >
            {emote}
          </div>
        )}
        <div className={animationClass}>
          <div
            style={{
              width: 72,
              height: 92,
              position: "relative",
              filter: "drop-shadow(0 0 14px rgba(255,115,0,.25))",
            }}
          >
            <div
              style={{
                width: 44,
                height: 30,
                borderRadius: 10,
                background: "#0e0f12",
                border: "2px solid rgba(255,255,255,.12)",
                margin: "0 auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-evenly",
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: "#00ffb3",
                  opacity: pose === "listen" ? 1 : 0.8,
                }}
              />
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: "#00ffb3",
                  opacity: pose === "speak" ? 1 : 0.8,
                }}
              />
            </div>
            <div
              style={{
                width: 56,
                height: 44,
                borderRadius: 10,
                background: "#14161a",
                border: "2px solid rgba(255,255,255,.12)",
                margin: "6px auto",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: -10,
                top: 42,
                width: 16,
                height: 6,
                background: "#14161a",
                border: "2px solid rgba(255,255,255,.12)",
                borderRadius: 8,
                transform: pose === "wave" ? "rotate(-25deg)" : "none",
              }}
            />
            <div
              style={{
                position: "absolute",
                right: -10,
                top: 42,
                width: 16,
                height: 6,
                background: "#14161a",
                border: "2px solid rgba(255,255,255,.12)",
                borderRadius: 8,
                transform: pose === "thumbs" ? "rotate(25deg)" : "none",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 14,
                bottom: -4,
                width: 10,
                height: 12,
                background: "#14161a",
                border: "2px solid rgba(255,255,255,.12)",
                borderRadius: 6,
              }}
            />
            <div
              style={{
                position: "absolute",
                right: 14,
                bottom: -4,
                width: 10,
                height: 12,
                background: "#14161a",
                border: "2px solid rgba(255,255,255,.12)",
                borderRadius: 6,
              }}
            />
          </div>
        </div>
        <div className="bot-label">Partner • {pose}</div>
      </div>
    </div>
  );
}
