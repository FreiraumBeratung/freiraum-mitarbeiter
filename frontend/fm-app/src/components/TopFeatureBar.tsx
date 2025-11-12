import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import GlassChip from "./GlassChip";

const features = [
  { path: "/control-center", label: "Control Center", icon: "⚙️" },
  { path: "/kontakte", label: "Leads", icon: "📋" },
  { path: "/mail/compose", label: "E-Mail", icon: "📧" },
  { path: "/lead-radar", label: "Lead-Radar", icon: "🎯" },
  { path: "/voice-diagnostics", label: "Voice-Diag", icon: "🎤" },
  { path: "/leads-real", label: "Leads Real", icon: "🔍" },
  { path: "/exports", label: "Exporte", icon: "📊" },
];

export default function TopFeatureBar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div
      className="sticky top-0 z-50 w-full border-b border-white/10 backdrop-blur-md"
      style={{
        background: "rgba(12, 13, 15, 0.85)",
      }}
    >
      <div className="max-w-full overflow-x-auto">
        <div className="flex items-center gap-3 px-4 py-3">
          {features.map((feat) => (
            <GlassChip
              key={feat.path}
              icon={feat.icon}
              label={feat.label}
              active={location.pathname === feat.path}
              onClick={() => navigate(feat.path)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

