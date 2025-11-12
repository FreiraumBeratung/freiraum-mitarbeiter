import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Button } from '../components/Button.jsx';
import { Field, Input, Textarea } from '../components/Form.jsx';
// PTT entfernt - jetzt globales GlobalPTT in App.jsx
import SettingsVoicePrefs from '../components/SettingsVoicePrefs.jsx';

export default function Settings(){
  const [lic,setLic] = useState(null);
  const [key,setKey] = useState('');
  const [tier,setTier] = useState('BASIS');
  const [profile,setProfile] = useState([]);
  const [profileData,setProfileData] = useState({ food_preferences:'', greeting_name:'Denis', preferred_tone:'professionell' });

  useEffect(()=>{ (async()=>{ try{ setLic(await api.license.get()) }catch{} })() },[]);
  useEffect(()=>{ (async()=>{ try{ const p = await api.profile.list(); setProfile(p); const m = {}; p.forEach(x=>{ m[x.key] = x.value; }); setProfileData({...profileData, ...m}); }catch{} })() },[]);

  const save = async()=>{
    await api.license.set(key, tier);
    setLic(await api.license.get());
  };

  const saveProfile = async(k, v)=>{
    await api.profile.set(k, v);
    const p = await api.profile.list();
    setProfile(p);
  };

  return (
    <div className='fr-card p-6'>
      <div className='h1'>Settings</div>

      <div className='mt-4 grid md:grid-cols-2 gap-6'>
        <div className='fr-card p-4'>
          <div className='h2'>Lizenz</div>
          <div className='mt-2 text-sm'>Aktuell: {JSON.stringify(lic)}</div>
          <div className='mt-4 flex gap-2'>
            <input className='fr-btn px-3 py-2 flex-1' placeholder='Key' value={key} onChange={e=>setKey(e.target.value)}/>
            <select className='fr-btn px-3 py-2' value={tier} onChange={e=>setTier(e.target.value)}>
              <option>BASIS</option><option>PRO</option><option>ENTERPRISE</option>
            </select>
            <Button onClick={save}>Setzen</Button>
          </div>
        </div>

        <div className='fr-card p-4'>
          <div className='h2'>System</div>
          <EnvSnap/>
        </div>
      </div>

      <div className='mt-6 fr-card p-6'>
        <div className='h1'>Persönliche Präferenzen</div>
        <div className='mt-4 grid md:grid-cols-2 gap-4'>
          <Field label='ESSENSPRÄFERENZEN'>
            <Input value={profileData.food_preferences} onChange={e=>{ setProfileData({...profileData, food_preferences:e.target.value}); saveProfile('food_preferences', e.target.value); }} placeholder='z.B. Vegetarisch, keine Nüsse'/>
          </Field>
          <Field label='GRUßNAME'>
            <Input value={profileData.greeting_name} onChange={e=>{ setProfileData({...profileData, greeting_name:e.target.value}); saveProfile('greeting_name', e.target.value); }} placeholder='Denis'/>
          </Field>
          <Field label='KOMUNIKATIONSTON'>
            <Input value={profileData.preferred_tone} onChange={e=>{ setProfileData({...profileData, preferred_tone:e.target.value}); saveProfile('preferred_tone', e.target.value); }} placeholder='professionell, freundlich, etc.'/>
          </Field>
        </div>
      </div>

      <div className='mt-6'>
        <SettingsVoicePrefs />
      </div>

      <div className='mt-6 p-4 rounded-xl glass border border-white/10'>
        <div className='text-sm text-fr-muted mb-2'>
          💡 <strong>Push-to-Talk:</strong> Das globale Mikrofon-Emblem ist immer unten zentral sichtbar. 
          Drücke darauf, um Sprachbefehle zu geben.
        </div>
        <div className='text-xs text-fr-muted'>
          Beispiele: "Erzeuge Demo-Angebot", "Sende Testmail an freiraumberatung@web.de" oder "Zeig KPIs"
        </div>
      </div>

      <div className='mt-8 p-4 rounded-2xl bg-gray-900 border border-gray-800'>
        <div className='font-semibold text-orange-400 mb-1'>Avatar-Assistenz</div>
        <div className='text-sm opacity-80 mb-2'>Der lebendige Assistent unten rechts macht Vorschläge, kann sprechen und Aktionen starten. Per Schalter am Widget kannst du Auto-Sprechen aktivieren/deaktivieren.</div>
        <ul className='text-xs opacity-70 list-disc ml-5'>
          <li>Vorschläge kommen aus /insights/suggestions</li>
          <li>„Denk mal" nutzt /decision/think</li>
          <li>„Starte #1" führt /decision/execute aus</li>
        </ul>
      </div>
    </div>
  )
}

function EnvSnap(){
  const vars = Object.entries(import.meta.env).filter(([k])=>k.startsWith('VITE_'));
  return (
    <div className='mt-2 text-xs text-fr-muted space-y-1'>
      {vars.length ? vars.map(([k,v])=> <div key={k}><b>{k}</b>: {String(v)}</div>) : 'Keine VITE_* Variablen gefunden.'}
    </div>
  )
}


