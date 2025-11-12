import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Button } from '../components/Button.jsx';
import { Loader } from '../components/Toast.jsx';

export default function Inbox(){
  const [state,setState] = useState({ loading:true, data:null, err:null });
  const [to,setTo] = useState('');

  const load = async()=>{
    try{
      setState(s=>({...s,loading:true,err:null}));
      const data = await api.mail.check();
      setState({ loading:false, data, err:null });
    }catch(e){
      setState({ loading:false, data:null, err:e.message });
    }
  };

  useEffect(()=>{ load() },[]);

  return (
    <div className='fr-card p-6'>
      <div className='h1'>Inbox</div>
      <div className='mt-2 text-fr_muted'>IMAP/SMTP Status</div>

      <div className='mt-6 space-y-3'>
        {state.loading && <Loader/>}
        {state.err && <div className='text-red-400 text-sm'>Fehler: {state.err}</div>}
        {state.data && (
          <div className='grid md:grid-cols-2 gap-4'>
            <div className='fr-card p-4'>
              <div className='h2'>IMAP</div>
              <div className='mt-2 text-sm'>{String(state.data?.imap?.ok)}</div>
              {state.data?.imap?.reason && <div className='text-fr_muted text-xs mt-1'>{state.data.imap.reason}</div>}
            </div>
            <div className='fr-card p-4'>
              <div className='h2'>SMTP</div>
              <div className='mt-2 text-sm'>{String(state.data?.smtp?.ok)}</div>
              {state.data?.smtp?.reason && <div className='text-fr_muted text-xs mt-1'>{state.data.smtp.reason}</div>}
            </div>
          </div>
        )}
      </div>

      <div className='mt-6 flex items-center gap-3'>
        <input className='fr-btn px-3 py-2 w-64' placeholder='Testmail an...' value={to} onChange={e=>setTo(e.target.value)} />
        <Button onClick={async()=>{ await api.mail.sendTest(to); await load(); }}>Testmail senden</Button>
      </div>
    </div>
  )
}


