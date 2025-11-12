import React, { useEffect, useRef, useState } from "react";
import { createPttController, PttState } from "../modules/voice/ptt";
import { voiceUi } from "../modules/voice/state";
import { voice } from "../modules/voice";

export default function VoicePTT({
  onTranscript,
}: {
  onTranscript?: (t: string) => void;
}) {
  const [state, setState] = useState<PttState>("idle");
  const [level, setLevel] = useState(0);
  const ctrlRef = useRef<ReturnType<typeof createPttController>>();
  const isHoldingRef = useRef(false);

  useEffect(() => {
    ctrlRef.current = createPttController({
      onState: (s) => {
        setState(s);
        // Update voiceUi for PartnerBot
        if (s === "listening") voiceUi.set("listen");
        else if (s === "speaking") voiceUi.set("speak");
        else voiceUi.set("idle");
      },
      onLevel: (r) => setLevel(r),
      onStart: async () => {
        isHoldingRef.current = true;
        // Trigger existing voice.start() to handle STT
        // Voice.start() will request its own mic, but PTT controller manages UI state
        voice.start().catch(() => {
          // If voice.start fails, stop PTT
          ctrlRef.current?.stopHold();
        });
      },
      onStop: async () => {
        isHoldingRef.current = false;
        // Trigger existing voice.stop()
        await voice.stop();
      },
    });

    const down = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        const target = e.target as HTMLElement;
        // Don't intercept if typing in input fields
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        if (!isHoldingRef.current) {
          ctrlRef.current?.startHold();
        }
      }
    };

    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (isHoldingRef.current) {
          ctrlRef.current?.stopHold();
        }
      }
    };

    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);

    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      ctrlRef.current?.dispose();
    };
  }, []);

  const ring = Math.min(1, level * 6);

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        title="Push-to-Talk (halten oder Space)"
        onMouseDown={() => {
          if (!isHoldingRef.current) {
            ctrlRef.current?.startHold();
          }
        }}
        onMouseUp={() => {
          if (isHoldingRef.current) {
            ctrlRef.current?.stopHold();
          }
        }}
        onMouseLeave={() => {
          if (isHoldingRef.current && state === "listening") {
            ctrlRef.current?.stopHold();
          }
        }}
        className={`rounded-full h-16 w-16 flex items-center justify-center shadow-lg transition-all duration-200 border ${
          state === "listening"
            ? "bg-orange-500/20 border-orange-400"
            : "bg-neutral-900/60 border-neutral-700"
        }`}
      >
        <div className="relative">
          <div className="h-8 w-8 rounded-full bg-neutral-800" />
          <div
            className="absolute inset-0 rounded-full"
            style={{
              boxShadow: `0 0 ${6 + ring * 12}px ${ring * 8}px rgba(255,115,0,0.45)`,
            }}
          />
        </div>
      </button>
      {state === "listening" && (
        <div className="w-32 h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-orange-500 rounded-full transition-all duration-150"
            style={{
              width: `${Math.min(100, Math.max(2, level * 100))}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}

