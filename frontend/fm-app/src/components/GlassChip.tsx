import React from "react";

export default function GlassChip({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`chip chip-pulse px-4 py-2 rounded-full flex items-center gap-2 text-sm font-medium transition-all duration-200 ${
        active
          ? "bg-orange-500/25 border-orange-500/60 text-orange-100"
          : "bg-white/5 border-white/20 text-white/80 hover:bg-white/8 hover:border-white/30"
      }`}
      style={{
        border: "1px solid",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span>{label}</span>
    </button>
  );
}

