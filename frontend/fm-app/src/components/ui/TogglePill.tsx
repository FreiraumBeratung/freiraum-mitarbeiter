import { motion } from "framer-motion";

export default function TogglePill({
  on,
  label,
  desc,
  onClick,
}: {
  on: boolean;
  label: string;
  desc?: string;
  onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className="w-full fr-glass fr-btn text-left">
      <div className="flex items-center gap-3 p-4">
        <motion.span
          animate={{
            boxShadow: on
              ? "0 0 0 2px rgba(255,115,0,0.25)"
              : "0 0 0 0 rgba(0,0,0,0)",
          }}
          className={`h-8 w-14 rounded-full relative ${
            on ? "bg-freiraum-orange/80" : "bg-white/10"
          }`}
        >
          <motion.i
            layout
            className={`absolute top-1 h-6 w-6 rounded-full bg-white ${
              on ? "right-1" : "left-1"
            }`}
          />
        </motion.span>
        <div className="flex-1">
          <div className="font-medium">{label}</div>
          {desc && <div className="text-xs text-freiraum-sub">{desc}</div>}
        </div>
      </div>
    </button>
  );
}


