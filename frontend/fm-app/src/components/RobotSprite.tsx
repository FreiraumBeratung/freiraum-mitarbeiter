import React from "react";

export default function RobotSprite({ listening = false }: { listening?: boolean }) {
  return (
    <div className={`robot ${listening ? "listen-glow" : ""}`}>
      <div
        className="head head-tilt"
        style={{
          transform: listening ? "rotate(-6deg) translateY(-2px)" : "rotate(0)",
        }}
      >
        <div className="eye l blink" />
        <div className="eye r blink" />
      </div>
      <div className="body breath" />
      <div className="arm l" />
      <div className="arm r" />
      <div className="leg l" />
      <div className="leg r" />
    </div>
  );
}


