// === FILE: src/components/PTT.jsx ===
import { useEffect, useRef, useState } from "react";
import { createRecognizer } from "../voice/ptt";
import { routeIntent } from "../voice/intent";

export default function PTT({ profile }){
  const [log,setLog] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const recRef = useRef(null);
  
  useEffect(()=>{ 
    const onHeard = (text) => {
      setLog(l => [{me:true, text, ts:Date.now()}, ...l].slice(0,20));
      setIsListening(false);
      
      routeIntent(text, { email: profile?.email || profile?.greeting_name }).then(res=>{
        const responseText = res?.hint || res?.tip || JSON.stringify(res);
        setLog(l => [{me:false, text: responseText, ts:Date.now()}, ...l].slice(0,20));
      }).catch(err=>{
        setLog(l => [{me:false, text: `Fehler: ${err.message}`, ts:Date.now()}, ...l].slice(0,20));
      });
    };
    
    recRef.current = createRecognizer({ 
      onText: onHeard
    }); 
  },[profile]);
  
  const startListening = ()=>{
    const isSupported = recRef.current?.supported ?? false;
    if(!isSupported){
      setLog(l => [{me:false, text: "Web Speech API wird von diesem Browser nicht unterstützt. Bitte Chrome oder Edge verwenden.", ts:Date.now()}, ...l].slice(0,20));
      return;
    }
    setIsListening(true);
    try{
      recRef.current.start();
      setLog(l => [{me:false, text: "🎤 Höre zu...", ts:Date.now()}, ...l].slice(0,20));
    }catch(e){
      setIsListening(false);
      setLog(l => [{me:false, text: `Fehler beim Starten: ${e.message}`, ts:Date.now()}, ...l].slice(0,20));
    }
  };
  
  const stopListening = ()=>{
    setIsListening(false);
    try{
      recRef.current?.stop();
    }catch(e){}
  };
  
  const isSupported = recRef.current?.supported ?? false;
  
  return (
    <div className="fr-card p-4">
      <div className="h2">Push-to-Talk</div>
      {!isSupported && (
        <div className="mt-2 text-xs text-red-400">
          ⚠️ Web Speech API nicht verfügbar. Bitte Chrome oder Edge verwenden.
        </div>
      )}
      
      <div className="mt-3 flex gap-3">
        <button 
          className={`fr-btn ${isListening ? 'bg-red-500' : ''}`} 
          onClick={startListening}
          disabled={isListening}
        >
          {isListening ? '🎤 Höre...' : 'Sprechen'}
        </button>
        <button 
          className="fr-btn fr-btn--ghost" 
          onClick={stopListening}
          disabled={!isListening}
        >
          Stop
        </button>
      </div>
      
      <div className="mt-4 text-xs text-fr-muted">
        Beispiele: „Erzeuge Demo-Angebot“, „Sende Testmail“, „Zeig KPIs“.
      </div>
      
      <div className="mt-4 space-y-2 max-h-64 overflow-auto text-xs">
        {log.length === 0 ? (
          <div className="text-fr-muted text-xs">Keine Aktivität...</div>
        ) : (
          log.map((m,i)=>(
            <div key={i} className={m.me ? "text-fr-text" : "text-fr-muted"}>
              {m.me ? "🧑‍💼" : "🤖"} {m.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
// === END FILE ===

