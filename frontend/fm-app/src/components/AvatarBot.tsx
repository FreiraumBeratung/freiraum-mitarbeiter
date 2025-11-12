import React from "react";

export default function AvatarBot() {
  return (
    <div
      data-testid="avatar-bot"
      className="avatar-bot avatar-breathe avatar-blink"
      style={{
        position: "fixed",
        left: 18,
        bottom: 18,
        width: 108,
        height: 108,
        borderRadius: 16,
        background: "linear-gradient(145deg, rgba(30,30,30,.9), rgba(10,10,10,.9))",
        border: "1px solid rgba(255,255,255,.08)",
        boxShadow: "0 8px 24px rgba(0,0,0,.35)",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "grid",
          placeItems: "center",
          color: "#ff7300",
          fontSize: 24,
        }}
      >
        🤖
      </div>
    </div>
  );
}





