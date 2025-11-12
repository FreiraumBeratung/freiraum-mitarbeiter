import { useEffect, useState } from 'react';

export function useToast(){
  const [msg,setMsg] = useState(null);
  const show = (m)=>{ setMsg(m); setTimeout(()=>setMsg(null), 3000); };
  const node = msg ? <div className='fixed right-6 bottom-6 z-50 fr-card px-4 py-3 border-fr-orange text-sm shadow-fr_glow'>{msg}</div> : null;
  return { show, node };
}

export function Loader({label='Lade...'}){ 
  return <div className='text-sm text-fr_muted'>{label}</div>;
}






















