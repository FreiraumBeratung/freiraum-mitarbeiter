import React from "react";

export default function RobotAvatar() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      {/* SOFT GLOW BACKGROUND */}
      <div
        style={{
          position: "absolute",
          width: 260,
          height: 260,
          borderRadius: "9999px",
          background: "rgba(249,115,22,0.14)",
          filter: "blur(80px)",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
        }}
      >
        {/* HEAD */}
        <div
          style={{
            width: 144,
            height: 144,
            borderRadius: 16,
            background: "linear-gradient(to bottom, rgb(39 39 42), rgb(24 24 27))",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 0 40px rgba(255,140,0,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ display: "flex", gap: 24 }}>
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: "9999px",
                background: "rgb(251 146 60)",
                boxShadow: "0 0 12px rgba(255,140,0,0.9)",
              }}
            />
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: "9999px",
                background: "rgb(251 146 60)",
                boxShadow: "0 0 12px rgba(255,140,0,0.9)",
              }}
            />
          </div>
        </div>

        {/* NECK */}
        <div
          style={{
            width: 48,
            height: 24,
            background: "rgb(39 39 42)",
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        />

        {/* BODY */}
        <div
          style={{
            width: 128,
            height: 176,
            borderRadius: 16,
            background: "linear-gradient(to bottom, rgb(39 39 42), rgb(24 24 27))",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 0 30px rgba(255,140,0,0.15)",
          }}
        />

        {/* STATUS */}
        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, letterSpacing: 0.3 }}>
          Bereit
        </div>
      </div>
    </div>
  );
}
