// === FILE: src/voice/ptt.js ===
export function createRecognizer({ onText }){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR) return { supported:false };
  
  const r = new SR();
  r.lang = 'de-DE';
  r.interimResults = false;
  r.continuous = false;
  
  r.onresult = (e)=> {
    const t = Array.from(e.results).map(x=>x[0].transcript).join(' ').trim();
    if(t) onText && onText(t);
  };
  
  r.onerror = ()=>{};
  
  return { supported:true, start: ()=> r.start(), stop: ()=> r.stop() };
}
// === END FILE ===




















