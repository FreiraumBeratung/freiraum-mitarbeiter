import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import GlassChip from "./GlassChip";
import { PartnerBotBus } from "../modules/partnerbot";

const items = [
  { label: "Control Center", path: "/control-center" },
  { label: "Leads", path: "/leads" },
  { label: "E-Mail", path: "/mail/compose" },
  { label: "Lead-Radar", path: "/lead-radar" },
  { label: "Voice-Diagnostics", path: "/voice-diagnostics" },
  { label: "Leads Real", path: "/leads/real" },
  { label: "Exporte", path: "/exports" },
];

export default function TopFeatureBar() {
  const nav = useNavigate();
  const loc = useLocation();
  const [pulseToken, setPulseToken] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const off = PartnerBotBus.onPose(() => {
      setPulseToken(Date.now().toString());
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setPulseToken(null);
        timerRef.current = null;
      }, 350);
    });
    return () => {
      off();
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div style={{position:"sticky", top:0, zIndex:40, backdropFilter:"blur(10px)", background:"rgba(0,0,0,.45)", borderBottom:"1px solid rgba(255,255,255,.08)"}}>
      <div style={{display:"flex", gap:12, padding:"10px 14px", overflowX:"auto"}}>
        {items.map(it => (
          <GlassChip
            key={it.path}
            label={it.label}
            active={loc.pathname===it.path}
            onClick={()=>nav(it.path)}
            className={pulseToken ? "animate-pulseShort" : ""}
          />
        ))}
      </div>
    </div>
  );
}