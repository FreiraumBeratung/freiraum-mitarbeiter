import React from "react";

type Props = {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
};

export default function Toggle({ value, onChange, label, hint }: Props) {
  return (
    <div
      className="glass card"
      style={{
        padding: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div>
        <div className="section-title">{label}</div>
        {hint && <div className="sub">{hint}</div>}
      </div>
      <button
        className={`toggle pulse ${value ? "on" : ""}`}
        onClick={() => onChange(!value)}
        aria-label={label}
      >
        <span className="toggle-dot" />
      </button>
    </div>
  );
}


