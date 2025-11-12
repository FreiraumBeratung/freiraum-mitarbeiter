import { useState } from 'react';
import { api } from '../api/client';

export default function Leads(){
  const [busy,setBusy] = useState(false);
  const [msg,setMsg] = useState(null);
  const [err,setErr] = useState(null);

  const handle = async (e, kind)=>{
    const file = e.target.files?.[0];
    if(!file) return;
    setBusy(true); setErr(null); setMsg(null);
    try{
      const res = kind==='csv' ? await api.leads.importCsv(file) : await api.leads.importXlsx(file);
      setMsg(JSON.stringify(res));
    }catch(e){ setErr(e.message) } finally{ setBusy(false); e.target.value='' }
  }

  return (
    <div className='fr-card p-6'>
      <div className='h1'>Leads</div>
      <div className='mt-2 text-fr_muted'>CSV/XLSX importieren</div>

      <div className='mt-6 flex gap-4'>
        <label className='fr-btn cursor-pointer'>
          CSV importieren
          <input type='file' accept='.csv' className='hidden' onChange={(e)=>handle(e,'csv')}/>
        </label>
        <label className='fr-btn cursor-pointer'>
          XLSX importieren
          <input type='file' accept='.xlsx' className='hidden' onChange={(e)=>handle(e,'xlsx')}/>
        </label>
      </div>

      {busy && <div className='mt-4 text-fr_muted text-sm'>Lade...</div>}
      {err && <div className='mt-4 text-red-400 text-sm'>Fehler: {err}</div>}
      {msg && <pre className='mt-4 text-xs bg-black/30 p-3 rounded-xl border border-fr_border whitespace-pre-wrap'>{msg}</pre>}
    </div>
  )
}


