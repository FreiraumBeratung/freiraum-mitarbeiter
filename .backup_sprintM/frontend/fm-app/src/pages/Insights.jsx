import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { Button } from '../components/Button.jsx'

function KindBadge({k}){
  const map = { discount:'Rabatt', followup:'Follow-up', lead:'Lead', tip:'Hinweis' }
  return <span className='fr-badge'>{map[k]||k}</span>
}

export default function Insights(){
  const [rows,setRows] = useState([])
  const [err,setErr] = useState(null)

  const load = async()=>{
    try{ setErr(null); setRows(await api.insights.fetch()) }catch(e){ setErr(e.message) }
  }
  useEffect(()=>{ load() },[])

  const consume = async(id)=>{ await api.insights.consume(id); await load() }

  const handleAction = async(r)=>{
    if(r.kind==='discount'){ alert('Rabatt-Entwurf (Stub) – später mit Angebots-Editor verknüpfen.') }
    else if(r.kind==='followup'){ await api.insights.log({ contact_email:r?.data?.email||'', contact_name:r?.data?.name||'', channel:'note', direction:'out', notes:'Follow-up geplant', meta:{from:'insights'} }); alert('Follow-up Stub geloggt.') }
  }

  return (
    <div className='fr-card p-6'>
      <div className='h1'>Insights</div>
      {err && <div className='text-red-400 text-sm mt-2'>Fehler: {err}</div>}

      <div className='mt-4 space-y-3'>
        {rows.map(r=> (
          <div key={r.id} className='fr-card p-4 flex items-center justify-between'>
            <div className='min-w-0'>
              <div className='flex items-center gap-2'>
                <KindBadge k={r.kind}/>
                <div className='font-medium truncate'>{r.title}</div>
                <div className='text-xs text-fr-muted'>(Score {r.score?.toFixed?.(2)})</div>
              </div>
              {r.detail && <div className='text-sm text-fr-muted mt-1'>{r.detail}</div>}
            </div>
            <div className='flex gap-2'>
              <Button onClick={()=>handleAction(r)}>Übernehmen</Button>
              <Button className='fr-btn--ghost' onClick={()=>consume(r.id)}>Später</Button>
            </div>
          </div>
        ))}
        {rows.length===0 && <div className='text-fr-muted text-sm'>Keine Vorschläge – der Assistent lernt noch.</div>}
      </div>
    </div>
  )
}



