import React from "react";

export default function AssistantPanel() {
  return (
    <div style={{
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "30px"
    }}>
      <div className="w-32 h-32 bg-red-500 mb-10" />

      <div style={{
        width: "100px",
        height: "100px",
        borderRadius: "50%",
        background: "orange",
        boxShadow: "0 0 40px orange"
      }} />

      <div style={{
        display: "flex",
        gap: "20px"
      }}>
        <div style={{
          width: "10px",
          height: "10px",
          borderRadius: "50%",
          background: "white"
        }} />
        <div style={{
          width: "10px",
          height: "10px",
          borderRadius: "50%",
          background: "white"
        }} />
      </div>

      <div style={{
        width: "120px",
        height: "60px",
        borderRadius: "12px",
        background: "#333"
      }} />

      <div style={{ color: "#aaa" }}>
        Bereit
      </div>

    </div>
  );
}
