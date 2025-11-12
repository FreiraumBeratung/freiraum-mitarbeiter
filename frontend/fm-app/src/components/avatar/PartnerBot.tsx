import { motion } from "framer-motion";

type Props = { state?: "idle" | "listening" | "speaking" | "thinking" };

export default function PartnerBot({ state = "idle" }: Props) {
  const eyeBlink = {
    scaleY: [1, 1, 1, 0.2, 1],
    transition: { duration: 3.2, repeat: Infinity, repeatDelay: 1.8 },
  };

  const breathe = {
    y: [0, -2, 0, 1, 0],
    transition: { duration: 6, repeat: Infinity, ease: "easeInOut" },
  };

  const glow =
    state === "listening"
      ? "shadow-glow"
      : state === "speaking"
        ? "shadow-[0_0_0_2px_rgba(255,115,0,0.35)]"
        : "shadow-glass";

  return (
    <motion.div className={`fr-glass p-3 ${glow}`} animate={breathe}>
      <div className="relative w-[120px] h-[140px]">
        {/* Body */}
        <motion.div className="absolute inset-x-4 bottom-2 top-10 rounded-xl bg-white/5 border border-white/15" />

        {/* Head */}
        <motion.div
          className="absolute left-1/2 -translate-x-1/2 top-0 w-24 h-16 rounded-2xl bg-white/8 border border-white/15"
          animate={
            state === "thinking"
              ? { rotate: [0, -2, 0, 2, 0] }
              : {}
          }
        >
          {/* Eyes */}
          <div className="absolute inset-0 flex items-center justify-center gap-3">
            <motion.div
              className="h-2 w-5 rounded-full"
              style={{ backgroundColor: "rgba(255, 115, 0, 0.9)" }}
              animate={eyeBlink}
            />
            <motion.div
              className="h-2 w-5 rounded-full"
              style={{ backgroundColor: "rgba(255, 115, 0, 0.9)" }}
              animate={eyeBlink}
            />
          </div>

          {/* Ear tilt on listening */}
          <motion.div
            className="absolute -right-2 top-4 h-4 w-2 rounded bg-white/30"
            animate={state === "listening" ? { rotate: -25 } : { rotate: 0 }}
          />
          <motion.div
            className="absolute -left-2 top-4 h-4 w-2 rounded bg-white/30"
            animate={state === "listening" ? { rotate: 25 } : { rotate: 0 }}
          />
        </motion.div>

        {/* Arms */}
        <motion.div
          className="absolute left-1 top-16 h-10 w-2 rounded bg-white/25"
          animate={
            state === "speaking" ? { rotate: [0, 10, -5, 0] } : {}
          }
        />
        <motion.div
          className="absolute right-1 top-16 h-10 w-2 rounded bg-white/25"
          animate={
            state === "speaking" ? { rotate: [0, -10, 5, 0] } : {}
          }
        />

        {/* Legs */}
        <div className="absolute left-8 bottom-0 h-6 w-2 rounded bg-white/25" />
        <div className="absolute right-8 bottom-0 h-6 w-2 rounded bg-white/25" />
      </div>
      <div className="text-center mt-2 text-xs text-freiraum-sub">
        Partner • {state}
      </div>
    </motion.div>
  );
}

