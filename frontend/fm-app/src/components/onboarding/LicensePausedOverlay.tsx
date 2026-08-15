import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { backendBase } from "../../lib/backendBase";
import { fmCardBorder, fmCardGlow, fmTitleFont, fmWarmOverlay } from "../../lib/fmVisual";
import { clearStoredSessionToken } from "../../lib/sessionToken";

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
        background: fmWarmOverlay,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "min(420px, 92vw)",
          borderRadius: 24,
          border: fmCardBorder,
          background: "linear-gradient(180deg, rgba(255,166,77,0.10), rgba(20,16,12,0.96))",
          boxShadow: fmCardGlow,
          padding: "28px 22px",
          color: "#fff",
          textAlign: "center",
        }}
      >
        <img
          src="/branding/freiraum-logo.png"
          alt="Freiraum"
          style={{ width: "min(180px, 52vw)", maxWidth: "100%", marginBottom: 16 }}
        />
        <div
          style={{
            height: 2,
            width: 56,
            margin: "0 auto 16px",
            borderRadius: 99,
            background: "rgba(255,115,0,0.85)",
          }}
        />
        <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.4, fontFamily: fmTitleFont }}>
          {PAUSE_TEXT}
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          style={{
            marginTop: 18,
            height: 40,
            borderRadius: 999,
            border: "1px solid rgba(255,166,77,0.55)",
            background: "rgba(255,115,0,0.18)",
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
