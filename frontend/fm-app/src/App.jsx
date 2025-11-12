import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom'
import AvatarFrame from './components/AvatarFrame'
import PTTBar from './components/PTTBar'

import './styles/voice.css'
import './styles/avatar.css'
import './styles/freiraum-ux.css'

import Dashboard from './pages/Dashboard'
import Leads from './pages/Leads.jsx'
import Reports from './pages/Reports.jsx'
import Followups from './pages/Followups.jsx'
import Settings from './pages/Settings.jsx'
import KnowledgeBase from './pages/KnowledgeBase.jsx'
import Sequences from './pages/Sequences.jsx'
import Calendar from './pages/Calendar.jsx'
import LeadsHunterAsync from './pages/LeadsHunterAsync.jsx'
import LeadsRealMode from './pages/LeadsRealMode'
import VoiceDiagnostics from './pages/VoiceDiagnostics'
import ControlCenter from './pages/ControlCenter'
import LeadRadar from './pages/LeadRadar'
import LeadsOSMResults from './pages/LeadsOSMResults'
import MailCompose from './pages/MailCompose'
import Exports from './pages/Exports'

import Backdrop from './components/layout/Backdrop'
import PartnerBot from './components/PartnerBot'
import HeroFloatCanvas from './components/HeroFloatCanvas'
import TopFeatureBar from './components/TopFeatureBar'
import { voiceUi } from './modules/voice/state'
import { routeVoiceIntent } from './modules/voice/intent_router'

export default function App () {
  return (
    <BrowserRouter>
      <HeroFloatCanvas />
      <Backdrop />
      <div className="min-h-dvh w-full relative overflow-x-hidden">
        <HeaderLink />
        <HotkeyNavigate />
        <TopFeatureBar />
        <VoiceIntentListener />
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/kontakte" element={<Leads />} />
          <Route path="/berichte" element={<Reports />} />
          <Route path="/nachfassungen" element={<Followups />} />
          <Route path="/einstellungen" element={<Settings />} />
          <Route path="/wissensbasis" element={<KnowledgeBase />} />
          <Route path="/ablaufplaene" element={<Sequences />} />
          <Route path="/kalender" element={<Calendar />} />
          <Route path="/kontakt-suche-async" element={<LeadsHunterAsync />} />
          <Route path="/voice-diagnostics" element={<VoiceDiagnostics />} />
          <Route path="/leads-real" element={<LeadsRealMode />} />
          <Route path="/control-center" element={<ControlCenter />} />
          <Route path="/lead-radar" element={<LeadRadar />} />
          <Route path="/leads/osm/results" element={<LeadsOSMResults />} />
          <Route path="/mail/compose" element={<MailCompose />} />
          <Route path="/exports" element={<Exports />} />
        </Routes>
        <VoiceOSMListener />
        <AvatarBotFrame />
        <PTTBar />
      </div>
    </BrowserRouter>
  )
}

function AvatarBotFrame() {
  const [pose, setPose] = React.useState("idle");
  
  React.useEffect(() => {
    // Subscribe to voiceUi for PTT state
    const fn = (p) => setPose(p);
    voiceUi.subs.add(fn);
    setPose(voiceUi.pose); // Initial state
    return () => {
      voiceUi.subs.delete(fn);
    };
  }, []);

  // Also listen to legacy voice-state events for backward compatibility
  React.useEffect(() => {
    const handler = (e) => {
      if (e && e.detail && e.detail.state) {
        const state = e.detail.state;
        // Map legacy states to new pose system
        if (state === "listening" || state === "transcribing") {
          setPose("listen");
        } else if (state === "acting") {
          setPose("speak");
        } else {
          setPose("idle");
        }
      }
    };
    document.addEventListener("voice-state", handler);
    return () => document.removeEventListener("voice-state", handler);
  }, []);

  return <PartnerBot pose={pose} />;
}

function VoiceOSMListener() {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (e) => {
      if (e && e.detail && e.detail.result) {
        navigate("/leads/osm/results", { state: { result: e.detail.result } });
      }
    };
    document.addEventListener("voice-osm-success", handler);
    return () => document.removeEventListener("voice-osm-success", handler);
  }, [navigate]);
  return null;
}

function VoiceIntentListener() {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (e) => {
      if (e && e.detail && e.detail.text) {
        routeVoiceIntent(e.detail.text, navigate);
      }
    };
    document.addEventListener("voice-navigate", handler);
    return () => document.removeEventListener("voice-navigate", handler);
  }, [navigate]);
  return null;
}

function HeaderLink () {
  return (
    <div style={{ position: 'fixed', top: 10, right: 14, zIndex: 9999, display: 'flex', gap: 10 }}>
      <NavLink to="/control-center" label="Control Center" />
      <NavLink to="/lead-radar" label="Lead-Radar" />
      <NavLink to="/voice-diagnostics" label="Voice-Diagnostics" />
      <NavLink to="/leads-real" label="Leads Real" />
    </div>
  )
}

function NavLink ({ to, label }) {
  return (
    <Link
      to={to}
      style={{
        padding: '6px 10px',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,.18)',
        background: 'rgba(255,255,255,.06)',
        color: '#fff',
        textDecoration: 'none'
      }}
    >
      {label}
    </Link>
  )
}

function HotkeyNavigate () {
  const navigate = useNavigate()
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        navigate('/voice-diagnostics')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])
  return null
}
