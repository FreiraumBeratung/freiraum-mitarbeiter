import React from "react";

export default function GlassToggle({
  checked,
  onChange,
  label,
  sub,
}: {
  checked: boolean;
  onChange: (b: boolean) => void;
  label: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl p-4 bg-white/5 backdrop-blur-md border border-white/10 hover:border-white/20 transition">
      <div>
        <div className="text-sm text-white/90">{label}</div>
        {sub && <div className="text-xs text-white/50">{sub}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 rounded-full transition ${
          checked ? "bg-orange-500/70" : "bg-neutral-700/70"
        }`}
      >
        <span
          className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-black transition-transform shadow ${
            checked ? "translate-x-6" : ""
          }`}
        />
      </button>
    </div>
  );
}

