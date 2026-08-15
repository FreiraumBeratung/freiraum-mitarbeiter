import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { backendBase } from "../lib/backendBase";
import { clearStoredSessionToken } from "../lib/sessionToken";

const PAUSE_TEXT =
  "Ihre Lizenz wurde pausiert. Bitte setzen Sie sich mit Freiraum Beratung in Kontakt.";

export default function LicensePausedOverlay() {
  const [paused, setPaused] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(`${backendBase()}/api/auth/microsoft/status`, { credentials: "include" });
      const data = await res.json().catch(() => null);
      setPaused(Boolean(data?.licensePaused));
    } catch {
      /* ignore network blips */
    }
  }, []);

  useEffect(() => {
    void checkStatus();
    const onPaused = () => setPaused(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkStatus();
    };
    window.addEventListener("fm-license-paused", onPaused);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void checkStatus();
    }, 8000);
    return () => {
      window.removeEventListener("fm-license-paused", onPaused);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [checkStatus]);

  const logout = async () => {
    try {
      await fetch(`${backendBase()}/api/setup/mail/reset`, { method: "POST", credentials: "include" });
    } catch {
      /* ignore */
    }
    try {
      await fetch(`${backendBase()}/api/auth/microsoft/logout`, { method: "POST", credentials: "include" });
    } catch {
      /* ignore */
    }
    clearStoredSessionToken();
    try {
      window.localStorage.setItem("fm_mail_onboarding_complete", "0");
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  if (!paused || typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1600,
        background: "rgba(0,0,0,0.94)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "min(420px, 92vw)",
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.16)",
          background: "rgba(20,20,20,0.96)",
          padding: "28px 22px",
          color: "#fff",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.4 }}>{PAUSE_TEXT}</div>
        <button
          type="button"
          onClick={() => void logout()}
          style={{
            marginTop: 18,
            height: 40,
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.22)",
            background: "rgba(255,255,255,0.1)",
            color: "#fff",
            padding: "0 18px",
            cursor: "pointer",
          }}
        >
          Ausloggen
        </button>
      </div>
    </div>,
    document.body
  );
}
