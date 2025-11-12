import React, { useEffect, useState } from "react";
import { api } from "../api/client";

export default function CharacterGreeting() {
  const [state, setState] = useState(null);
  const [greeting, setGreeting] = useState("");
  const [color, setColor] = useState("from-gray-700 to-gray-900");

  useEffect(() => {
    const fetchState = async () => {
      try {
        const data = await api.character.state("denis");
        setState(data);
        const mood = data.mood || "neutral";
        let g = "";
        if (mood === "positive") g = "🔥 Guten Morgen, Denis! Alles läuft wie geschmiert.";
        else if (mood === "negative") g = "☕ Hey Denis, heute ruhig bleiben – wir kriegen das hin.";
        else g = "👋 Guten Tag Denis – bereit für neue Aufgaben?";
        setGreeting(g);

        if (mood === "positive") setColor("from-orange-500 to-yellow-600");
        else if (mood === "negative") setColor("from-gray-600 to-red-700");
        else setColor("from-gray-700 to-gray-900");
      } catch (err) {
        console.error("CharacterGreeting fetch error:", err);
      }
    };
    fetchState();
    const interval = setInterval(fetchState, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!state) return null;

  return (
    <div
      className={`fr-card p-4 rounded-2xl bg-gradient-to-r ${color} shadow-fr-glow text-white border-fr-border`}
      style={{
        animation: "fadeIn 0.5s ease-in"
      }}
    >
      <div className="text-xl font-semibold">{greeting}</div>
      <div className="text-sm opacity-80 mt-1">
        Stimmung: <b>{state.mood}</b> • Intensität: {state.intensity?.toFixed?.(2) || "0.00"} • Confidence: {state.confidence?.toFixed?.(2) || "0.00"}
      </div>
      {state.recent_topics?.length > 0 && (
        <div className="text-xs opacity-70 mt-1">
          Themen: {state.recent_topics.join(", ")}
        </div>
      )}
    </div>
  );
}



















