import React, { useState, useEffect, useRef } from "react";
import { api } from "../api/client";
import { motion, AnimatePresence } from "framer-motion";

export default function VoiceOverlay() {
  const [listening, setListening] = useState(false);
  const [recognized, setRecognized] = useState("");
  const [context, setContext] = useState([]);
  const [visible, setVisible] = useState(true);
  const recRef = useRef(null);

  // Lade Context beim Mounten
  useEffect(() => {
    loadContext();
  }, []);

  const loadContext = async () => {
    try {
      const data = await api.voice.contextList();
      if (data.ok && data.entries) {
        setContext(data.entries || []);
      }
    } catch (e) {
      console.error("Context load error:", e);
    }
  };

  function startListen() {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      alert("Speech API nicht verfügbar. Bitte Chrome oder Edge verwenden.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRecognition();
    rec.lang = "de-DE";
    rec.continuous = false;
    rec.interimResults = false;

    rec.onresult = async (e) => {
      const text = e.results[0][0].transcript;
      setRecognized(text);
      
      try {
        // Aktualisiere Context-Memory
        await api.voice.contextUpdate({
          user: "denis",
          message: text,
          mood: "neutral"
        });
        await loadContext(); // Refresh context
      } catch (err) {
        console.error("Context update error:", err);
      }
    };

    rec.onend = () => {
      setListening(false);
    };

    rec.onerror = (e) => {
      console.error("Speech recognition error:", e);
      setListening(false);
    };

    rec.start();
    setListening(true);
    recRef.current = rec;
  };

  const stopListen = () => {
    if (recRef.current) {
      recRef.current.stop();
      setListening(false);
    }
  };

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-24 right-6 z-[80]"
      >
        <div className="glass p-4 w-72 rounded-xl border border-white/10 shadow-2xl">
          <div className="flex justify-between items-center mb-3">
            <span className="font-semibold text-orange-400 flex items-center gap-2">
              🎙️ Deep Voice
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setVisible(false)}
                className="text-xs px-2 py-1 rounded border border-white/20 text-gray-400 hover:bg-white/10 transition-colors"
                title="Verstecken"
              >
                ✕
              </button>
              <button
                onClick={listening ? stopListen : startListen}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                  listening
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white shadow-lg"
                }`}
              >
                {listening ? "⏹ Stopp" : "▶ Start"}
              </button>
            </div>
          </div>

          <div className="mb-3 min-h-[3rem] max-h-32 overflow-y-auto text-xs text-gray-300 bg-black/20 rounded-lg p-2 border border-white/5">
            {listening ? (
              <div className="flex items-center gap-2 text-orange-400 animate-pulse">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                Sprich jetzt …
              </div>
            ) : recognized ? (
              <div className="text-gray-200">
                <span className="text-orange-400">Erkannt:</span> {recognized}
              </div>
            ) : (
              <div className="text-gray-400">Bereit für Spracheingabe</div>
            )}
          </div>

          {/* Context Memory Preview */}
          {context.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <div className="text-xs text-gray-400 mb-2">Context Memory ({context.length} Einträge)</div>
              <div className="max-h-24 overflow-y-auto space-y-1">
                {context.slice(-3).reverse().map((entry, i) => (
                  <div key={i} className="text-xs text-gray-500 bg-black/20 rounded px-2 py-1 truncate">
                    {new Date(entry.ts).toLocaleTimeString('de-DE')}: {entry.msg}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

