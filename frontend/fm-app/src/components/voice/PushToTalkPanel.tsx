import { useEffect, useState } from "react";
import { Mic, Square } from "lucide-react";
import { motion } from "framer-motion";

type Props = {
  isListening: boolean;
  onPressStart: () => void;
  onPressStop: () => void;
  level?: number;
};

export default function PushToTalkPanel({
  isListening,
  onPressStart,
  onPressStop,
  level = 0,
}: Props) {
  const [held, setHeld] = useState(false);

  const down = () => {
    setHeld(true);
    onPressStart();
  };

  const up = () => {
    setHeld(false);
    onPressStop();
  };

  // Key: Space as PTT (non-invasive) - only when not in input fields
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        const target = e.target as HTMLElement;
        // Don't intercept if typing in input fields
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
          return;
        }
        // Only start if not already listening and not held
        if (!isListening && !held) {
          e.preventDefault();
          down();
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        // Always stop on space release if listening
        if (isListening || held) {
          e.preventDefault();
          up();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [held, isListening]);

  return (
    <div className="fr-glass p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-freiraum-sub">Push-to-Talk</div>
        <div className="text-xs text-freiraum-sub">Leertaste halten</div>
      </div>
      <motion.button
        onMouseDown={down}
        onMouseUp={up}
        onMouseLeave={() => held && up()}
        className={`mt-3 w-full fr-btn fr-pill px-5 py-4 flex items-center justify-center gap-2 ${
          isListening ? "bg-freiraum-orange/30" : "bg-white/10"
        }`}
        whileTap={{ scale: 0.98 }}
      >
        {isListening ? <Square size={20} /> : <Mic size={20} />}
        <span className="font-semibold tracking-wide">
          {isListening ? "Sprechen … loslassen = Ende" : "Zum Sprechen halten"}
        </span>
      </motion.button>
      <div className="mt-3 h-2 w-full bg-white/10 rounded">
        <motion.div
          className="h-2 rounded bg-freiraum-orange"
          style={{
            width: `${Math.min(100, Math.max(2, level * 100))}%`,
          }}
        />
      </div>
    </div>
  );
}

