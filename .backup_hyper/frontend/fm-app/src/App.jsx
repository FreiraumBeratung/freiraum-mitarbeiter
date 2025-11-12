import { useEffect, useMemo, useState } from 'react';
import Background from './components/Background.jsx';
import Sidebar from './components/Sidebar.jsx';
import Topbar from './components/Topbar.jsx';
import { Button } from './components/Button.jsx';
import ProactiveBanner from './components/ProactiveBanner.jsx';

import Dashboard from './pages/Dashboard.jsx';
import Inbox from './pages/Inbox.jsx';
import Angebote from './pages/Angebote.jsx';
import Leads from './pages/Leads.jsx';
import Followups from './pages/Followups.jsx';
import Reports from './pages/Reports.jsx';
import Insights from './pages/Insights.jsx';
import Settings from './pages/Settings.jsx';
import PersonalityPage from './pages/PersonalityPage.jsx';
import DecisionCenter from './pages/DecisionCenter.jsx';
import AutomationCenter from './pages/AutomationCenter.jsx';
import KnowledgeBase from './pages/KnowledgeBase.jsx';
import LeadsHunter from './pages/LeadsHunter.jsx';
import Sequences from './pages/Sequences.jsx';
import Calendar from './pages/Calendar.jsx';
import AuditLog from './pages/AuditLog.jsx';
import AvatarAssistant from './components/AvatarAssistant.jsx';
import GlobalPTT from './components/GlobalPTT.jsx';
import VoiceOverlay from './components/VoiceOverlay.jsx';
import VoiceMicButton from './components/VoiceMicButton.jsx';
import { api } from './api/client';

const texts = [
  'Freiraum Beratung',
  'Automatisierung & Digitalisierung',
  'Individuelle Lösungen für Unternehmen'
];

export default function App(){
  const [active, setActive] = useState('Übersicht');
  const [i, setI] = useState(0);
  const [profile, setProfile] = useState({});

  useEffect(()=>{
    const id = setInterval(()=> setI(x => (x+1)%texts.length), 10000);
    return ()=> clearInterval(id);
  },[]);

  // Lade Profile für PTT
  useEffect(()=>{
    (async()=>{
      try {
        const p = await api.profile.list();
        const m = {};
        p.forEach(x=>{ m[x.key] = x.value; });
        setProfile(m);
      } catch(e){}
    })();
  },[]);

  const Page = useMemo(()=>{
    switch(active){
      case 'Übersicht': return <Dashboard/>;
      case 'Posteingang': return <Inbox/>;
      case 'Angebote': return <Angebote/>;
      case 'Leads': return <Leads/>;
      case 'Nachfassungen': return <Followups/>;
      case 'Berichte': return <Reports/>;
      case 'Vorschläge': return <Insights/>;
      case 'Einstellungen': return <Settings/>;
      case 'Persönlichkeit': return <PersonalityPage/>;
      case 'Entscheidungen': return <DecisionCenter/>;
      case 'Automatisierung': return <AutomationCenter/>;
      case 'KnowledgeBase': return <KnowledgeBase/>;
      case 'Lead-Suche': return <LeadsHunter/>;
      case 'Sequenzen': return <Sequences/>;
      case 'Kalender': return <Calendar/>;
      case 'Audit': return <AuditLog/>;
      default: return <Dashboard/>;
    }
  },[active]);

  return (
    <div className='min-h-screen relative' style={{overflow: "visible"}}>
      <Background/>
      <ProactiveBanner onShowInsights={setActive}/>

      <div className='relative z-10 max-w-[1400px] mx-auto px-4 md:px-6 py-6 flex' style={{overflow: "visible"}}>
        <Sidebar/>

        <main className='flex-1 flex flex-col min-w-0' style={{overflow: "visible"}}>
          <Topbar active={active} onTab={setActive}/>

          {/* Hero / Claim */}
          <section className='py-8'>
            <div className='fr-card p-6 md:p-8 flex items-center justify-between'>
              <div>
                <div className='text-fr-muted text-sm'>Freiraum Mitarbeiter</div>
                <div className='text-2xl md:text-3xl font-semibold mt-1 transition-opacity duration-700'>
                  {texts[i]}
                </div>
              </div>
              <div className='flex gap-3'>
                <Button>PDF Vorschau</Button>
                <Button variant='primary'>Schnellaktion</Button>
              </div>
            </div>
          </section>

          {/* Content */}
          <section className='pb-10'>
            {Page}
          </section>
        </main>
      </div>
      <AvatarAssistant />
      <GlobalPTT profile={profile} />
      <VoiceOverlay />
      <VoiceMicButton />
    </div>
  );
}
