import React from "react";

export default function GlassChip({
  label,
  active,
  onClick,
  className = "",
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const classes = ["chip", active ? "chip-active" : "", className].filter(Boolean).join(" ").trim();
  return (
    <button className={classes} onClick={onClick} aria-label={label} title={label}>
      <span style={{ color: "#FF7300", fontWeight: 600 }}>{label}</span>
    </button>
  );
}