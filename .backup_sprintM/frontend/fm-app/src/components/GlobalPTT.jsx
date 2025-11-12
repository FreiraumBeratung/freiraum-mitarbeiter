// Globales PTT-Mikrofon - Immer unten zentral, über alle Seiten
import { useEffect, useRef, useState } from "react";
import { createRecognizer } from "../voice/ptt";
import { routeIntent } from "../voice/intent";

export default function GlobalPTT({ profile }) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const recRef = useRef(null);
  const pulseRef = useRef(null);
  const messageTimerRef = useRef(null);

  useEffect(() => {
    const onHeard = async (text) => {
      setIsListening(false);
      setIsProcessing(true);
      
      try {
        // Normalisiere @-Zeichen: "at" -> "@"
        let normalizedText = text;
        normalizedText = normalizedText.replace(/\b(\w+)\s+at\s+(\w+\.\w+)\b/gi, '$1@$2');
        normalizedText = normalizedText.replace(/(\w+)\s*at\s*(\w+\.\w+)/gi, '$1@$2');
        normalizedText = normalizedText.replace(/\b(\w+)\s+at\s+(\w+)\s+dot\s+(\w+)\b/gi, '$1@$2.$3');
        
        setLastMessage({ type: "user", text: normalizedText });
        clearTimeout(messageTimerRef.current);
        
        const res = await routeIntent(normalizedText, { 
          email: profile?.email || profile?.greeting_name || "denis"
        });
        
        // Feedback anzeigen
        if (res?.ok || res?.hint || res?.tip) {
          setLastMessage({ 
            type: "success", 
            text: res.hint || res.tip || "Aktion erfolgreich" 
          });
        } else if (res?.hint) {
          setLastMessage({ type: "info", text: res.hint });
        }
        
        // Nach 3 Sekunden Nachricht ausblenden
        messageTimerRef.current = setTimeout(() => setLastMessage(null), 3000);
      } catch (err) {
        console.error("PTT error:", err);
        setLastMessage({ type: "error", text: err.message || "Fehler bei der Verarbeitung" });
        messageTimerRef.current = setTimeout(() => setLastMessage(null), 5000);
      } finally {
        setIsProcessing(false);
      }
    };

    recRef.current = createRecognizer({
      onText: onHeard,
      lang: "de-DE"
    });
  }, [profile]);

  const startListening = () => {
    const isSupported = recRef.current?.supported ?? false;
    if (!isSupported) {
      alert("Web Speech API wird von diesem Browser nicht unterstützt. Bitte Chrome oder Edge verwenden.");
      return;
    }
    setIsListening(true);
    try {
      recRef.current.start();
      // Pulse-Animation starten
      if (pulseRef.current) {
        pulseRef.current.classList.add("animate-pulse");
      }
    } catch (e) {
      setIsListening(false);
      console.error("PTT start error:", e);
    }
  };

  const stopListening = () => {
    setIsListening(false);
    try {
      recRef.current?.stop();
      if (pulseRef.current) {
        pulseRef.current.classList.remove("animate-pulse");
      }
    } catch (e) {}
  };

  const isSupported = recRef.current?.supported ?? false;

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] flex items-center justify-center pointer-events-auto">
      <button
        ref={pulseRef}
        onClick={isListening ? stopListening : startListening}
        disabled={!isSupported || isProcessing}
        className={`
          w-20 h-20 rounded-full
          flex items-center justify-center
          transition-all duration-300
          shadow-2xl
          border-2
          ${isListening 
            ? "bg-red-500 shadow-red-500/70 scale-110 border-red-300/50" 
            : isProcessing
            ? "bg-orange-400 shadow-orange-400/70 border-orange-300/50"
            : "bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 shadow-orange-500/60 border-orange-300/50 hover:scale-105"
          }
          ${!isSupported ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
          ${isProcessing ? "animate-spin" : ""}
        `}
        title={isListening ? "Stopp" : "Sprachsteuerung starten - Drücke und halte für Eingabe"}
      >
        {isProcessing ? (
          <svg className="w-10 h-10 text-white animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : (
          <svg 
            className={`w-10 h-10 text-white ${isListening ? "animate-pulse" : ""}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        )}
      </button>
      
      {/* Status-Badge */}
      {isListening && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 glass text-white px-4 py-2 rounded-full text-sm whitespace-nowrap border border-white/10 shadow-xl">
          🎤 Höre zu...
        </div>
      )}
      
      {/* Feedback-Nachricht */}
      {lastMessage && (
        <div className={`absolute -top-24 left-1/2 -translate-x-1/2 glass px-4 py-2 rounded-xl text-sm whitespace-nowrap border shadow-xl max-w-xs text-center ${
          lastMessage.type === "error" ? "border-red-500/50 text-red-300" :
          lastMessage.type === "success" ? "border-green-500/50 text-green-300" :
          "border-white/10 text-white"
        }`}>
          {lastMessage.type === "error" && "❌ "}
          {lastMessage.type === "success" && "✅ "}
          {lastMessage.type === "info" && "ℹ️ "}
          {lastMessage.type === "user" && "🗣️ "}
          {lastMessage.text}
        </div>
      )}
    </div>
  );
}

