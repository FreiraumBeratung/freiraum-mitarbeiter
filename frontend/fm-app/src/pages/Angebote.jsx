import { useState } from 'react';
import { api } from '../api/client';
import { Button } from '../components/Button.jsx';

export default function Angebote(){
  const [rows,setRows] = useState([]);
  const [busy,setBusy] = useState(false);
  const [err,setErr] = useState(null);

  const createDraft = async()=>{
    try{
      setBusy(true); setErr(null);
      const draft = await api.offers.draft({ customer:'Demo GmbH', items:[{name:'Arbeitszeit', qty:5, unit_price:85},{name:'Material', qty:1, unit_price:129.9}]});
      setRows(r=>[draft, ...r].slice(0,10));
    }catch(e){ setErr(e.message) } finally{ setBusy(false) }
  }

  const openPdf = async(id)=>{
    const url = await api.offers.pdf(id);
    window.open(url, '_blank');
  }

  return (
    <div className='fr-card p-6'>
      <div className='h1'>Angebote</div>
      <div className='mt-2 text-fr_muted'>Draft erzeugen & PDF ansehen</div>

      <div className='mt-6 flex gap-3'>
        <Button onClick={createDraft} disabled={busy}>{busy?'Erzeuge...':'Demo-Draft erzeugen'}</Button>
      </div>

      {err && <div className='text-red-400 text-sm mt-3'>Fehler: {err}</div>}

      <div className='mt-6'>
        <table className='w-full text-sm'>
          <thead className='text-fr_muted'>
            <tr><th className='text-left py-2'>ID</th><th className='text-left'>Kunde</th><th className='text-left'>Total</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r,i)=>(
              <tr key={i} className='border-t border-fr_border'>
                <td className='py-2'>{r?.id ?? r?.offer_id ?? '—'}</td>
                <td>{r?.customer ?? 'Demo GmbH'}</td>
                <td>{r?.total_gross ?? '—'}</td>
                <td><button className='fr-btn fr-btn--ghost' onClick={()=>openPdf(r?.id ?? r?.offer_id)}>PDF</button></td>
              </tr>
            ))}
            {rows.length===0 && <tr><td className='py-6 text-fr_muted' colSpan={4}>Noch keine Drafts in dieser Session.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

