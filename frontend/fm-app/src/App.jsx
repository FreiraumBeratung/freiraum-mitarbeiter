import React, { useEffect, useRef, useState } from "react";
import { BrowserRouter, HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";

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
import FreiraumLayout from "./layouts/FreiraumLayout";
import MobileMailShell from "./layouts/MobileMailShell";
import RobotAvatar from "./components/robot/RobotAvatar";
import MailComposeForm from "./components/mail/MailComposeForm";
import ExchangeInboxPanel from "./components/mail/ExchangeInboxPanel";
import MailOnboardingOverlay from "./components/onboarding/MailOnboardingOverlay";
import LicensePausedOverlay from "./components/onboarding/LicensePausedOverlay";
import { useIsMobile } from "./hooks/useIsMobile";
import { installApiCredentials } from "./lib/backendBase";
import { consumeMicrosoftClaimFromUrl } from "./modules/auth/microsoftClaim";
import AdminAccounts from "./pages/AdminAccounts";

import Backdrop from "./components/layout/Backdrop";
import TopFeatureBar from "./components/TopFeatureBar";
import HeroFloatCanvas from "./components/HeroFloatCanvas";
import PartnerBot, { PartnerBotBus } from "./components/PartnerBot";
import VoiceButton from "./components/VoiceButton";
import { processVoiceCommand } from "./modules/voice";
import { voiceUi } from "./modules/voice/state";
import { TransitionOverlay } from "./components/TransitionOverlay";

installApiCredentials();

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
  const location = useLocation();
  const isMobile = useIsMobile();
  const path = location.pathname || "";
  const isMailWorkspace = path === "/" || path === "/mail/compose" || path.startsWith("/mail/compose/");
  const isAdminWorkspace = path === "/admin";

  useEffect(() => {
    void consumeMicrosoftClaimFromUrl();
  }, [location.search]);

  const mailComposeLayout = isMobile ? (
    <MobileMailShell />
  ) : (
    <FreiraumLayout
      robot={<RobotAvatar />}
      composer={<MailComposeForm />}
      exchange={<ExchangeInboxPanel />}
      ptt={<VoiceButton />}
    />
  );

  return (
    <>
      {!isMailWorkspace && !isAdminWorkspace && <Backdrop />}
      {!isMailWorkspace && !isAdminWorkspace && (
        <div className="h-20 flex items-center px-6 border-b border-neutral-800">
          <TopFeatureBar />
        </div>
      )}
      <VoiceIntentListener />
      <VoiceOSMListener />
      <VoicePoseBridge />
      <WarmVoicePrefs />
      <div className="flex-1 min-h-0 overflow-hidden">
        <Routes>
          <Route path="/" element={<Navigate to="/mail/compose" replace />} />
          <Route path="/admin" element={<AdminAccounts />} />
          <Route path="/dashboard" element={<Navigate to="/mail/compose" replace />} />
          <Route path="/kontakte" element={<Navigate to="/mail/compose" replace />} />
          <Route path="/leads" element={<Navigate to="/mail/compose" replace />} />
          <Route path="/berichte" element={<Navigate to="/mail/compose" replace />} />
          <Route path="/nachfassungen" element={<Navigate to="/mail/compose" replace />} />
          <Route path="/einstellungen" element={<Navigate to="/mail/compose" replace />} />
          <Route path="/wissensbasis" element={<Navigate to="/mail/compose" replace />} />
          <Route path="/ablaufplaene" element={<Navigate to="/mail/compose" replace />} />
          <Route path="/kalender" element={<Navigate to="/mail/compose" replace />} />
          <Route path="/kontakt-suche-async" element={<Navigate to="/mail/compose" replace />} />
          <Route path="/voice-diagnostics" element={<Navigate to="/mail/compose" replace />} />
          <Route path="/leads-real" element={<Navigate to="/mail/compose" replace />} />
          <Route path="/leads/real" element={<Navigate to="/mail/compose" replace />} />
          <Route path="/control-center" element={<Navigate to="/mail/compose" replace />} />
          <Route path="/lead-radar" element={<Navigate to="/mail/compose" replace />} />
          <Route path="/leads/osm/results" element={<Navigate to="/mail/compose" replace />} />
          <Route path="/mail/compose" element={mailComposeLayout} />
          <Route path="/exports" element={<Navigate to="/mail/compose" replace />} />
        </Routes>
      </div>
      {isMailWorkspace || isAdminWorkspace ? null : (
        <div className="ptt-compact">
          <VoiceButton />
        </div>
      )}
      {/* <PartnerBot /> */}
      <MailOnboardingOverlay />
      <LicensePausedOverlay />
    </>
  );
}

export default function App() {
  const Router =
    typeof window !== "undefined" && window.location?.protocol === "file:"
      ? HashRouter
      : BrowserRouter;
  const isMobile = useIsMobile();
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
    <Router>
      <div className="h-screen flex flex-col overflow-hidden bg-black text-white">
        {!isMobile && (
          <div className="fixed inset-0 -z-10">
            <HeroFloatCanvas />
          </div>
        )}
        {transitionMessage && <TransitionOverlay message={transitionMessage} />}
        <Shell />
      </div>
    </Router>
  );
}
