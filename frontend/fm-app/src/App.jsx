import React, { useEffect, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";

import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads.jsx";
import Reports from "./pages/Reports.jsx";
import Followups from "./pages/Followups.jsx";
import Settings from "./pages/Settings.jsx";
import KnowledgeBase from "./pages/KnowledgeBase.jsx";
import Sequences from "./pages/Sequences.jsx";
import Calendar from "./pages/Calendar.jsx";
import LeadsHunterAsync from "./pages/LeadsHunterAsync.jsx";
import LeadsRealMode from "./pages/LeadsRealMode";
import VoiceDiagnostics from "./pages/VoiceDiagnostics";
import ControlCenter from "./pages/ControlCenter";
import LeadRadar from "./pages/LeadRadar";
import LeadsOSMResults from "./pages/LeadsOSMResults";
import MailCompose from "./pages/MailCompose";
import Exports from "./pages/Exports";

import Backdrop from "./components/layout/Backdrop";
import TopFeatureBar from "./components/TopFeatureBar";
import HeroFloatCanvas from "./components/HeroFloatCanvas";
import PartnerBot, { PartnerBotBus } from "./components/PartnerBot";
import VoiceButton from "./components/VoiceButton";
import { processVoiceCommand } from "./modules/voice";
import { voiceUi } from "./modules/voice/state";
import { TransitionOverlay } from "./components/TransitionOverlay";

export function showTransitionMessage(msg) {
  if (typeof window === "undefined") return;
  const handler = window.__fm_transition_message;
  if (typeof handler === "function" && msg) {
    handler(msg);
  }
}

function VoiceOSMListener() {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (event) => {
      if (event && event.detail && event.detail.result) {
        navigate("/leads/osm/results", { state: { result: event.detail.result } });
      }
    };
    document.addEventListener("voice-osm-success", handler);
    return () => document.removeEventListener("voice-osm-success", handler);
  }, [navigate]);
  return null;
}

function VoicePoseBridge() {
  useEffect(() => {
    const handler = (event) => {
      if (event && event.detail && event.detail.state) {
        const state = event.detail.state;
        if (state === "listening" || state === "transcribing") {
          voiceUi.pose = "listen";
          PartnerBotBus.pose("listen");
        } else if (state === "acting") {
          voiceUi.pose = "speak";
          PartnerBotBus.pose("speak");
        } else {
          voiceUi.pose = "idle";
          PartnerBotBus.pose("idle");
        }
      }
    };
    document.addEventListener("voice-state", handler);
    return () => document.removeEventListener("voice-state", handler);
  }, []);
  return null;
}

function VoiceIntentListener() {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (event) => {
      const detail = event.detail || {};
      const text = detail.text || "";
      if (text) {
        processVoiceCommand(text, navigate);
      }
    };
    document.addEventListener("voice:final", handler);
    return () => document.removeEventListener("voice:final", handler);
  }, [navigate]);
  return null;
}

function WarmVoicePrefs() {
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("fm_voice_prefs") || "{}");
      const rate = typeof stored?.rate === "number" ? stored.rate : 0.92;
      const pitch = typeof stored?.pitch === "number" ? stored.pitch : 0.95;
      const requiresUpdate = stored?.provider !== "piper" || stored?.voice !== "thorsten";
      if (requiresUpdate) {
        localStorage.setItem(
          "fm_voice_prefs",
          JSON.stringify({ provider: "piper", voice: "thorsten", rate, pitch })
        );
      }
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}

function Shell() {
  return (
    <>
      <HeroFloatCanvas />
      <Backdrop />
      <TopFeatureBar />
      <VoiceIntentListener />
      <VoiceOSMListener />
      <VoicePoseBridge />
      <WarmVoicePrefs />
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/kontakte" element={<Leads />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/berichte" element={<Reports />} />
        <Route path="/nachfassungen" element={<Followups />} />
        <Route path="/einstellungen" element={<Settings />} />
        <Route path="/wissensbasis" element={<KnowledgeBase />} />
        <Route path="/ablaufplaene" element={<Sequences />} />
        <Route path="/kalender" element={<Calendar />} />
        <Route path="/kontakt-suche-async" element={<LeadsHunterAsync />} />
        <Route path="/voice-diagnostics" element={<VoiceDiagnostics />} />
        <Route path="/leads-real" element={<LeadsRealMode />} />
        <Route path="/leads/real" element={<LeadsRealMode />} />
        <Route path="/control-center" element={<ControlCenter />} />
        <Route path="/lead-radar" element={<LeadRadar />} />
        <Route path="/leads/osm/results" element={<LeadsOSMResults />} />
        <Route path="/mail/compose" element={<MailCompose />} />
        <Route path="/exports" element={<Exports />} />
      </Routes>
      <div className="ptt-compact">
        <VoiceButton />
      </div>
      <PartnerBot />
    </>
  );
}

export default function App() {
  const [transitionMessage, setTransitionMessage] = useState(null);
  const transitionTimer = useRef(null);

  useEffect(() => {
    window.__fm_transition_message = (msg) => {
      if (!msg) return;
      setTransitionMessage(msg);
      if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
      transitionTimer.current = window.setTimeout(() => setTransitionMessage(null), 700);
    };
    return () => {
      window.__fm_transition_message = undefined;
      if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    };
  }, []);

  return (
    <BrowserRouter>
      {transitionMessage && <TransitionOverlay message={transitionMessage} />}
      <Shell />
    </BrowserRouter>
  );
}
