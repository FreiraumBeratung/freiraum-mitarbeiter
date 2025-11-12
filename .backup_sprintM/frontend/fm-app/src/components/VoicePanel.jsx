import React, { useState, useRef } from "react";
import { api } from "../api/client";
import { Button } from "./Button";

export default function VoicePanel() {
  const [listening, setListening] = useState(false);
  const [log, setLog] = useState([]);
  const recognitionRef = useRef(null);

  const startListening = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      alert("Browser unterstützt kein SpeechRecognition. Bitte Chrome oder Edge verwenden.");
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "de-DE";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = (e) => {
      console.error("SpeechRecognition error:", e);
      setLog((prev) => [...prev, "❌ Fehler: " + e.error]);
      setListening(false);
    };
    recognition.onresult = async (e) => {
      const transcript = e.results[0][0].transcript;
      setLog((prev) => [...prev.slice(-19), "🗣️ " + transcript]);
      
      try {
        const body = { user_id: "denis", role: "user", text: transcript };
        const data = await api.character.event(body);
        setLog((prev) => [...prev.slice(-19), "🤖 " + data.mood + " (Sentiment: " + data.sentiment?.toFixed?.(2) + ")"]);
        speak(data.mood);
      } catch (err) {
        setLog((prev) => [...prev.slice(-19), "❌ API Fehler: " + err.message]);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const speak = (text) => {
    if (!("speechSynthesis" in window)) {
      setLog((prev) => [...prev.slice(-19), "⚠️ TTS nicht verfügbar"]);
      return;
    }
    const synth = window.speechSynthesis;
    const utter = new SpeechSynthesisUtterance("Alles klar, Denis. Stimmung erkannt: " + text);
    utter.lang = "de-DE";
    utter.rate = 1.0;
    synth.speak(utter);
  };

  return (
    <div className="fr-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="h2">🎙️ Sprachsteuerung</div>
        {!listening ? (
          <Button onClick={startListening} variant="primary">
            Starten
          </Button>
        ) : (
          <Button onClick={stopListening} variant="ghost" className="bg-red-600 hover:bg-red-700 text-white border-red-600">
            Stoppen
          </Button>
        )}
      </div>
      <div className="mt-2 text-sm max-h-48 overflow-y-auto space-y-1 text-fr-text">
        {log.length === 0 ? (
          <div className="text-fr-muted text-xs">Keine Aktivität...</div>
        ) : (
          log.map((l, i) => (
            <div key={i} className="text-xs">{l}</div>
          ))
        )}
      </div>
    </div>
  );
}




