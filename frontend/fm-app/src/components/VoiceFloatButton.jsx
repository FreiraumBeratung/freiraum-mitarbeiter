import React, { useRef, useState } from "react";
import { api } from "../api/client";

export default function VoiceFloatButton() {
  const [listening, setListening] = useState(false);
  const [last, setLast] = useState(null);
  const recognitionRef = useRef(null);

  const start = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("Browser unterstützt kein SpeechRecognition (empfohlen: Chrome/Edge).");
      return;
    }
    
    const rec = new SR();
    rec.lang = "de-DE";
    rec.continuous = false;
    rec.interimResults = false;
    
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = (e) => {
      console.error("Speech recognition error:", e);
      setListening(false);
    };
    
    rec.onresult = async (e) => {
      const transcript = e.results[0][0].transcript;
      setLast("🗣️ " + transcript);
      
      try {
        // Zero-Typing Flow: direkt /voice/command aufrufen
        const data = await api.voice.command("denis", transcript);
        
        if (data.decision === "ask") {
          // Ask-Mode: Benutzer bestätigen lassen
          const ok = confirm(
            `Intent: ${data.parsed.intent}\n` +
            `Kategorie: ${data.parsed.slots.category || "-"}\n` +
            `Ort: ${data.parsed.slots.location || "-"}\n` +
            `Modus: ${data.parsed.slots.mode || "ask"}\n\n` +
            `${data.reason || "Jetzt in die Queue legen?"}`
          );
          
          if (ok) {
            // Manuell enqueuen via /intent/act
            const result = await api.intent.act("denis", transcript);
            alert(`✅ ${result.queued} Aktion(en) wurden in die Queue gelegt.`);
          }
        } else {
          // Mode add/outreach: bereits enqueued per router decision
          alert(`✅ ${data.enqueued} Aktion(en) in Queue (Modus: ${data.decision}).`);
        }
      } catch (err) {
        console.error("Voice command error:", err);
        alert(`Fehler: ${err.message}`);
      }
    };
    
    recognitionRef.current = rec;
    rec.start();
  };

  const stop = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
    }
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50">
        {!listening ? (
          <button
            onClick={start}
            className="px-4 py-3 rounded-full bg-fr-orange hover:bg-fr-orange-dim text-white shadow-xl transition-all transform hover:scale-110"
            title="Voice Command starten"
          >
            🎤
          </button>
        ) : (
          <button
            onClick={stop}
            className="px-4 py-3 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-xl transition-all animate-pulse"
            title="Voice Command stoppen"
          >
            ⏹
          </button>
        )}
      </div>
      {last && (
        <div className="fixed bottom-20 right-6 bg-gray-900 text-white text-xs p-3 rounded-xl opacity-90 shadow-lg max-w-xs z-50">
          {last}
        </div>
      )}
    </>
  );
}

