// === FILE: src/components/ProactiveBanner.jsx ===
import { useEffect, useState } from "react";
import { api } from "../api/client";

export default function ProactiveBanner({ onShowInsights }){
  const [count, setCount] = useState(0);

  useEffect(()=>{
    let alive = true;

    async function poll(){
      try{
        const items = await api.insights.fetch();
        if(!alive) return;
        setCount((items||[]).length || 0);
      }catch(_){}
      setTimeout(poll, 30000);
    }
    
    poll();
    return ()=>{ alive=false; };
  },[]);

  if(count<=0) return null;

  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-xl border border-fr-border bg-fr-panel/90 backdrop-blur text-fr-text shadow-fr-soft">
      <span className="font-medium">Freiraum Mitarbeiter</span> hat <span className="font-semibold text-fr-orange">{count}</span> Hinweise. <button onClick={()=>{if(onShowInsights) onShowInsights('Hinweise');}} className="underline ml-2 text-fr-orange hover:text-fr-orange-dim">Anzeigen</button>
    </div>
  );
}
// === END FILE ===

