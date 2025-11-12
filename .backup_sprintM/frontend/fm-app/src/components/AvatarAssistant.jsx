import { useEffect, useState, useRef } from "react";

const STORAGE_KEY = "fm.avatar.visible";

export default function AvatarAssistant() {
  const [visible, setVisible] = useState(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === "true";
  });
  const [speaking, setSpeaking] = useState(false);
  const [tip, setTip] = useState("");

  const tips = [
    "Sag: „Suche 20 SHK in Arnsberg"",
    "Sag: „Welche Follow-ups sind fällig?"",
    "Sag: „Erstelle Demo-Angebot für Müller GmbH"",
    "Sag: „Zeig mir die KPIs""
  ];

  useEffect(() => {
    const t = setInterval(() => {
      setTip(tips[Math.floor(Math.random()*tips.length)]);
    }, 6000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => localStorage.setItem(STORAGE_KEY, String(visible)), [visible]);

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        style={{
          position: "fixed", left: 16, bottom: 16, zIndex: 9999,
          borderRadius: 12, padding: "8px 10px",
          background: "rgba(20,20,20,0.55)", color: "#eee", border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(10px)", fontWeight: 600, cursor: "pointer"
        }}
        title="Assistent anzeigen"
      >🤖 Zeigen</button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: 16, bottom: 16, zIndex: 9999, display: "flex", gap: 12,
      alignItems: "flex-end"
    }}>
      {/* Sprechblase */}
      <div style={{
        maxWidth: 320,
        padding: "10px 12px",
        borderRadius: 14,
        background: "rgba(10,10,10,0.45)",
        border: "1px solid rgba(255,255,255,0.08)",
        color: "#f2f2f2",
        backdropFilter: "blur(14px)",
        boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
        fontSize: 13,
        lineHeight: 1.4,
        transform: "translateY(-6px)",
        transition: "opacity .25s ease"
      }}>
        <div style={{opacity:.9, fontWeight:600, marginBottom:6}}>Hey Denis 👋</div>
        <div style={{opacity:.85}}>
          {tip || "Bereit für Sprachbefehle. Klick unten auf 🎤 und sprich los."}
        </div>
        <div style={{marginTop:8, display:"flex", gap:8}}>
          <button onClick={()=>setTip("Ich habe 3 neue Vorschläge für dich – öffne die Seite „Vorschläge".")}
            style={btnStyle()}>Vorschläge</button>
          <button onClick={()=>setSpeaking(s=>!s)} style={btnStyle(speaking)}>Mund {speaking?"Stop":"Start"}</button>
          <button onClick={()=>setVisible(false)} style={btnGhostStyle()}>Verstecken</button>
        </div>
      </div>

      {/* Avatar */}
      <div style={{
        width: 76, height: 76, borderRadius: 18,
        background: "linear-gradient(145deg, rgba(30,30,30,.9), rgba(10,10,10,.7))",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(12px)",
        display: "grid", placeItems: "center",
        boxShadow: "0 10px 28px rgba(0,0,0,.45)",
        animation: "fmPulse 3s ease-in-out infinite"
      }}>
        <div style={{
          fontSize: 30, transform: speaking ? "translateY(-2px)" : "translateY(0)",
          transition: "transform .12s ease"
        }}>🤖</div>
        {/* Mund / Speaking */}
        <div style={{
          position: "absolute", bottom: 18, width: 28, height: speaking ? 10 : 3,
          background: "#ff7a00", borderRadius: 999,
          boxShadow: "0 0 10px rgba(255,122,0,.6)",
          transition: "height .12s ease"
        }}/>
      </div>

      <style>{`
        @keyframes fmPulse {
          0%,100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
      `}</style>
    </div>
  );
}

function btnStyle(active=false){
  return {
    background: active ? "#ff8f33" : "#ff7a00",
    color: "white", padding: "6px 10px", borderRadius: 10,
    border: "1px solid rgba(0,0,0,.25)", fontWeight: 700, cursor: "pointer"
  };
}

function btnGhostStyle(){
  return {
    background: "rgba(30,30,30,.35)",
    color: "#ddd", padding: "6px 10px", borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.08)", fontWeight: 600, cursor: "pointer"
  };
}
