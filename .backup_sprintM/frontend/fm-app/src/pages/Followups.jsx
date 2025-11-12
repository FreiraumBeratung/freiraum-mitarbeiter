import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Button } from '../components/Button.jsx';

export default function Followups(){
  const [rows,setRows] = useState([]);
  const [err,setErr] = useState(null);

  const load = async()=>{
    try{
      setErr(null);
      const r = await api.followups.due();
      setRows(r || []);
    }catch(e){ setErr(e.message) }
  }
  useEffect(()=>{ load() },[]);

  const toggle = async(id)=>{
    await api.followups.toggle(id);
    await load();
  }

  return (
    <div className='fr-card p-6'>
      <div className='h1'>Follow-ups fällig</div>
      {err && <div className='text-red-400 text-sm mt-2'>Fehler: {err}</div>}

      <div className='mt-4 space-y-2'>
        {(rows||[]).map((x)=>(
          <div key={x.id} className='fr-card p-4 flex items-center justify-between'>
            <div>
              <div className='font-medium'>{x.contact ?? 'Kontakt'}</div>
              <div className='text-xs text-fr_muted'>Due: {x.due_at ?? '—'}</div>
            </div>
            <Button onClick={()=>toggle(x.id)}>Erledigt</Button>
          </div>
        ))}
        {(!rows || rows.length===0) && <div className='text-fr_muted text-sm'>Keine fälligen Follow-ups.</div>}
      </div>
    </div>
  )
}


