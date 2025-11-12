import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function Reports(){
  const [kpi,setKpi] = useState(null);
  const [err,setErr] = useState(null);

  useEffect(()=>{
    (async()=>{
      try{ setKpi(await api.reports.kpis()); } catch(e){ setErr(e.message) }
    })();
  },[]);

  return (
    <div className='fr-card p-6'>
      <div className='h1'>Reports</div>
      {err && <div className='text-red-400 text-sm mt-2'>Fehler: {err}</div>}

      <div className='mt-6 grid md:grid-cols-3 gap-4'>
        {kpi ? Object.entries(kpi).map(([k,v])=>(
          <div key={k} className='fr-card p-5'>
            <div className='h2'>{k}</div>
            <div className='mt-2 text-3xl font-semibold'>{String(v)}</div>
          </div>
        )): <div className='text-fr_muted text-sm'>Lade…</div>}
      </div>
    </div>
  )
}


