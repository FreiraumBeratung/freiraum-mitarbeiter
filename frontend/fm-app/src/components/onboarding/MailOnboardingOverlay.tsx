import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { createPortal } from "react-dom";

type MailSetupStatus = {
  ok: boolean;
  provider?: "graph" | "imap_smtp" | null;
  onboardingComplete?: boolean;
  graph?: { connected?: boolean; configured?: boolean };
};

type MicrosoftAuthStatus = {
  ok: boolean;
  connected?: boolean;
  oauthConfigured?: boolean;
};

function isAbortLikeError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string };
  const message = String(e.message || "").toLowerCase();
  return e.name === "AbortError" || message.includes("aborted");
}

function backendBase(): string {
  return (
    (import.meta.env.VITE_BACKEND_BASE_URL as string | undefined) ??
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
    "http://127.0.0.1:30521"
  ).replace(/\/+$/, "");
}

export default function MailOnboardingOverlay() {
  const location = useLocation();
  const [setupStatus, setSetupStatus] = useState<MailSetupStatus | null>(() => {
    try {
      const cached = window.localStorage.getItem("fm_mail_onboarding_complete");
      if (cached === "1") {
        return { ok: true, onboardingComplete: true };
      }
    } catch {
      // ignore localStorage errors
    }
    return null;
  });
  const [msAuth, setMsAuth] = useState<MicrosoftAuthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<"graph" | "imap_smtp" | "">("");
  const [phase, setPhase] = useState<"splash" | "provider" | "graph" | "imap">("splash");
  const [submitting, setSubmitting] = useState(false);

  const [imapEmail, setImapEmail] = useState("");
  const [imapPassword, setImapPassword] = useState("");
  const [useAdvanced, setUseAdvanced] = useState(false);
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState("993");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUseTls, setSmtpUseTls] = useState(true);
  const [smtpUseSsl, setSmtpUseSsl] = useState(false);
  const splashTimer = useRef<number | null>(null);
  const [splashVisible, setSplashVisible] = useState(false);
  const activeRequestControllerRef = useRef<AbortController | null>(null);
  const submittingFailsafeTimerRef = useRef<number | null>(null);

  const isMailWorkspace = useMemo(() => {
    const path = location.pathname || "";
    return path === "/" || path.startsWith("/mail/compose");
  }, [location.pathname]);

  const shouldShow = !!(isMailWorkspace && (!setupStatus || !setupStatus.onboardingComplete));

  const loadStatuses = useCallback(async () => {
    setError(null);
    const setupController = new AbortController();
    const authController = new AbortController();
    const timeout = window.setTimeout(() => {
      setupController.abort();
      authController.abort();
    }, 3500);
    try {
      const [setupRes, authRes] = await Promise.all([
        fetch(`${backendBase()}/api/setup/mail/status`, { signal: setupController.signal }),
        fetch(`${backendBase()}/api/auth/microsoft/status`, { signal: authController.signal }),
      ]);
      const setupData = (await setupRes.json()) as MailSetupStatus;
      const authData = (await authRes.json()) as MicrosoftAuthStatus;
      if (!setupRes.ok || !setupData?.ok) {
        throw new Error("Setup-Status konnte nicht geladen werden.");
      }
      setSetupStatus(setupData);
      setMsAuth(authData);
      try {
        window.localStorage.setItem("fm_mail_onboarding_complete", setupData.onboardingComplete ? "1" : "0");
      } catch {
        // ignore localStorage errors
      }
      if (setupData.provider === "graph" || setupData.provider === "imap_smtp") {
        setProvider(setupData.provider);
      }
    } catch (err) {
      if (!isAbortLikeError(err)) {
        setError(err instanceof Error ? err.message : "Setup konnte nicht geladen werden.");
      }
      setSetupStatus((prev) => prev ?? { ok: true, onboardingComplete: false });
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  const abortActiveRequest = useCallback(() => {
    if (activeRequestControllerRef.current) {
      activeRequestControllerRef.current.abort();
      activeRequestControllerRef.current = null;
    }
  }, []);

  const fetchWithTimeout = useCallback(
    async (url: string, init: RequestInit, timeoutMs: number): Promise<Response> => {
      abortActiveRequest();
      const controller = new AbortController();
      activeRequestControllerRef.current = controller;
      const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, { ...init, signal: controller.signal });
      } finally {
        window.clearTimeout(timeout);
        if (activeRequestControllerRef.current === controller) {
          activeRequestControllerRef.current = null;
        }
      }
    },
    [abortActiveRequest]
  );

  useEffect(() => {
    void loadStatuses();
  }, [loadStatuses]);

  useEffect(() => {
    return () => {
      abortActiveRequest();
      if (submittingFailsafeTimerRef.current) {
        window.clearTimeout(submittingFailsafeTimerRef.current);
        submittingFailsafeTimerRef.current = null;
      }
    };
  }, [abortActiveRequest]);

  useEffect(() => {
    if (!shouldShow) return;
    setPhase("splash");
    setSplashVisible(false);
    window.setTimeout(() => setSplashVisible(true), 40);
    if (splashTimer.current) window.clearTimeout(splashTimer.current);
    splashTimer.current = window.setTimeout(() => setPhase("provider"), 1400);
    return () => {
      if (splashTimer.current) {
        window.clearTimeout(splashTimer.current);
        splashTimer.current = null;
      }
    };
  }, [shouldShow]);

  useEffect(() => {
    const params = new URLSearchParams(location.search || "");
    if (!params.has("ms_oauth")) return;
    void loadStatuses();
    if (params.get("ms_oauth") === "connected") {
      setProvider("graph");
      setPhase("graph");
    }
  }, [location.search, loadStatuses]);

  const persistProvider = useCallback(async (nextProvider: "graph" | "imap_smtp") => {
    const res = await fetchWithTimeout(
      `${backendBase()}/api/setup/mail/provider`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: nextProvider }),
      },
      12000
    );
    if (!res.ok) throw new Error("Provider konnte nicht gespeichert werden.");
  }, [fetchWithTimeout]);

  const connectMicrosoft = useCallback(async () => {
    const res = await fetch(`${backendBase()}/api/auth/microsoft/start`);
    const data = (await res.json()) as { ok?: boolean; authUrl?: string };
    if (!res.ok || !data?.ok || !data?.authUrl) {
      throw new Error("Microsoft OAuth Start fehlgeschlagen.");
    }
    window.location.href = data.authUrl;
  }, []);

  const completeGraphSetup = useCallback(async () => {
    const res = await fetch(`${backendBase()}/api/setup/mail/graph/complete`, { method: "POST" });
    if (!res.ok) {
      throw new Error("Graph-Setup konnte nicht abgeschlossen werden.");
    }
  }, []);

  const runImapSetup = useCallback(async () => {
    if (!imapEmail.trim() || !imapPassword.trim()) {
      throw new Error("Bitte E-Mail und Passwort eingeben.");
    }
    const payload: Record<string, unknown> = {
      email: imapEmail.trim(),
      password: imapPassword,
      useAdvanced,
    };
    if (useAdvanced) {
      payload.imapHost = imapHost.trim();
      payload.imapPort = Number(imapPort) || 993;
      payload.smtpHost = smtpHost.trim();
      payload.smtpPort = Number(smtpPort) || 587;
      payload.smtpUseTls = smtpUseTls;
      payload.smtpUseSsl = smtpUseSsl;
    }
    const res = await fetchWithTimeout(
      `${backendBase()}/api/setup/mail/imap/setup`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      25000
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = (data && (data.detail?.message || data.detail)) || "IMAP-Setup fehlgeschlagen.";
      throw new Error(String(detail));
    }
  }, [imapEmail, imapPassword, useAdvanced, imapHost, imapPort, smtpHost, smtpPort, smtpUseTls, smtpUseSsl, fetchWithTimeout]);

  const startSubmittingGuard = useCallback(() => {
    if (submittingFailsafeTimerRef.current) {
      window.clearTimeout(submittingFailsafeTimerRef.current);
    }
    submittingFailsafeTimerRef.current = window.setTimeout(() => {
      setSubmitting(false);
      setError((prev) => prev || "Verbindung dauert zu lange. Bitte erneut versuchen.");
    }, 30000);
  }, []);

  const stopSubmittingGuard = useCallback(() => {
    if (submittingFailsafeTimerRef.current) {
      window.clearTimeout(submittingFailsafeTimerRef.current);
      submittingFailsafeTimerRef.current = null;
    }
  }, []);

  if (!isMailWorkspace) return null;

  if (!shouldShow) return null;

  return createPortal(
    <div style={styles.overlay}>
      <div style={styles.cardLarge}>
        {phase === "splash" ? (
          <div style={styles.splashWrap}>
            <img
              src="/branding/freiraum-logo.png"
              alt="Freiraum"
              style={{
                ...styles.logoLarge,
                transform: splashVisible ? "rotate(0deg) scale(1)" : "rotate(-10deg) scale(0.84)",
                opacity: splashVisible ? 1 : 0.35,
              }}
            />
            <div style={styles.subtleTitle}>Freiraum Mitarbeiter wird geladen</div>
          </div>
        ) : (
          <div style={styles.contentWrap}>
            <div style={styles.headerWrap}>
              <img src="/branding/freiraum-logo.png" alt="Freiraum" style={styles.logoMedium} />
              <h2 style={styles.heading}>Womit möchten Sie sich verbinden?</h2>
              <p style={styles.subHeading}>
                
              </p>
            </div>

            {phase === "provider" && (
              <div style={styles.providerGrid}>
                <button
                  onClick={() => {
                    abortActiveRequest();
                    setSubmitting(false);
                    stopSubmittingGuard();
                    setProvider("graph");
                    setPhase("graph");
                  }}
                  style={{ ...styles.providerCard, ...styles.providerCardGraph }}
                >
                  <div style={styles.providerTitle}>Microsoft Graph</div>
                  <div style={styles.providerDesc}></div>
                </button>
                <button
                  onClick={() => {
                    abortActiveRequest();
                    setSubmitting(false);
                    stopSubmittingGuard();
                    setProvider("imap_smtp");
                    setPhase("imap");
                  }}
                  style={{ ...styles.providerCard, ...styles.providerCardImap }}
                >
                  <div style={styles.providerTitle}>IMAP / SMTP</div>
                  <div style={styles.providerDesc}></div>
                </button>
              </div>
            )}

            {phase === "graph" && (
              <div style={styles.stepWrap}>
                <div style={styles.stepText}>Mit Microsoft anmelden und danach Setup abschließen.</div>
                <div style={styles.actionRow}>
                  <button
                    disabled={submitting}
                    onClick={async () => {
                      if (submitting) return;
                      setSubmitting(true);
                      startSubmittingGuard();
                      setError(null);
                      try {
                        await persistProvider("graph");
                        await connectMicrosoft();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Microsoft Verbindung fehlgeschlagen.");
                        setSubmitting(false);
                        stopSubmittingGuard();
                      }
                    }}
                    style={styles.btnSecondary}
                  >
                    Microsoft verbinden
                  </button>
                  <button
                    disabled={submitting || !msAuth?.connected}
                    onClick={async () => {
                      if (submitting) return;
                      setSubmitting(true);
                      startSubmittingGuard();
                      setError(null);
                      try {
                        await persistProvider("graph");
                        await completeGraphSetup();
                        await loadStatuses();
                        window.dispatchEvent(new CustomEvent("fm-mail-setup-complete"));
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Graph-Setup fehlgeschlagen.");
                      } finally {
                        setSubmitting(false);
                        stopSubmittingGuard();
                      }
                    }}
                    style={{
                      ...styles.btnPrimary,
                      ...(submitting || !msAuth?.connected ? styles.btnDisabled : {}),
                    }}
                  >
                    Setup abschließen
                  </button>
                  <button
                    onClick={() => {
                      abortActiveRequest();
                      setSubmitting(false);
                      stopSubmittingGuard();
                      setPhase("provider");
                    }}
                    style={styles.btnGhost}
                  >
                    Zurück
                  </button>
                </div>
              </div>
            )}

            {phase === "imap" && (
              <div style={styles.stepWrap}>
                <input
                  value={imapEmail}
                  onChange={(e) => setImapEmail(e.target.value)}
                  placeholder="E-Mail-Adresse"
                  style={styles.input}
                />
                <input
                  type="password"
                  value={imapPassword}
                  onChange={(e) => setImapPassword(e.target.value)}
                  placeholder="Passwort / App-Passwort"
                  style={styles.input}
                />
                <label style={styles.checkboxRow}>
                  <input type="checkbox" checked={useAdvanced} onChange={(e) => setUseAdvanced(e.target.checked)} />
                  Erweiterte Einstellungen
                </label>
                {useAdvanced && (
                  <div style={styles.advancedGrid}>
                    <input value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder="IMAP Host" style={styles.inputSmall} />
                    <input value={imapPort} onChange={(e) => setImapPort(e.target.value)} placeholder="IMAP Port" style={styles.inputSmall} />
                    <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="SMTP Host" style={styles.inputSmall} />
                    <input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="SMTP Port" style={styles.inputSmall} />
                    <label style={styles.checkboxSmall}><input type="checkbox" checked={smtpUseTls} onChange={(e) => setSmtpUseTls(e.target.checked)} /> STARTTLS</label>
                    <label style={styles.checkboxSmall}><input type="checkbox" checked={smtpUseSsl} onChange={(e) => setSmtpUseSsl(e.target.checked)} /> SSL</label>
                  </div>
                )}
                <div style={styles.actionRow}>
                  <button
                    disabled={submitting}
                    onClick={async () => {
                      if (submitting) return;
                      setSubmitting(true);
                      startSubmittingGuard();
                      setError(null);
                      try {
                        await persistProvider("imap_smtp");
                        await runImapSetup();
                        await loadStatuses();
                        window.dispatchEvent(new CustomEvent("fm-mail-setup-complete"));
                      } catch (err) {
                        if (isAbortLikeError(err)) {
                          setError("Verbindung dauert zu lange. Bitte erneut versuchen oder Erweiterte Einstellungen nutzen.");
                        } else {
                          setError(err instanceof Error ? err.message : "IMAP/SMTP Setup fehlgeschlagen.");
                        }
                      } finally {
                        setSubmitting(false);
                        stopSubmittingGuard();
                      }
                    }}
                    style={{
                      ...styles.btnPrimaryBlue,
                      ...(submitting ? styles.btnDisabled : {}),
                    }}
                  >
                    IMAP/SMTP einrichten
                  </button>
                  <button
                    onClick={() => {
                      abortActiveRequest();
                      setSubmitting(false);
                      stopSubmittingGuard();
                      setPhase("provider");
                    }}
                    style={styles.btnGhost}
                  >
                    Zurück
                  </button>
                </div>
              </div>
            )}

            {submitting && <div style={styles.progressText}>Verbindung wird geprüft...</div>}
            {error && <div style={styles.errorText}>{error}</div>}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 1400,
    background: "rgba(0,0,0,0.93)",
    backdropFilter: "blur(10px)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "24px",
  },
  card: {
    width: "min(900px, 92vw)",
    borderRadius: 28,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
    boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: 24,
    padding: "32px",
  },
  cardLarge: {
    width: "min(1100px, 94vw)",
    minHeight: "min(76vh, 820px)",
    borderRadius: 28,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
    boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    padding: "34px",
  },
  splashWrap: {
    minHeight: 360,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: 26,
  },
  contentWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  headerWrap: {
    textAlign: "center",
  },
  logoLarge: {
    width: "min(540px, 86vw)",
    maxWidth: "100%",
    filter: "drop-shadow(0 18px 45px rgba(0,0,0,0.65))",
    transition: "transform 0.75s ease, opacity 0.75s ease",
  },
  logoMedium: {
    width: "min(360px, 72vw)",
    maxWidth: "100%",
    marginBottom: 14,
  },
  subtleTitle: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  heading: {
    color: "white",
    fontSize: 32,
    fontWeight: 700,
    margin: 0,
  },
  subHeading: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    marginTop: 8,
    marginBottom: 0,
  },
  providerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 14,
  },
  providerCard: {
    borderRadius: 20,
    padding: "20px 18px",
    textAlign: "left",
    cursor: "pointer",
    border: "1px solid rgba(255,255,255,0.2)",
    color: "white",
  },
  providerCardGraph: {
    background: "rgba(78,196,126,0.18)",
    borderColor: "rgba(112,237,161,0.4)",
  },
  providerCardImap: {
    background: "rgba(98,180,255,0.16)",
    borderColor: "rgba(139,198,255,0.4)",
  },
  providerTitle: {
    fontSize: 22,
    fontWeight: 700,
  },
  providerDesc: {
    marginTop: 6,
    color: "rgba(255,255,255,0.78)",
    fontSize: 14,
  },
  stepWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  stepText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.78)",
  },
  actionRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 6,
  },
  btnSecondary: {
    height: 40,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.28)",
    background: "rgba(255,255,255,0.12)",
    color: "white",
    padding: "0 16px",
    cursor: "pointer",
    fontSize: 14,
  },
  btnPrimary: {
    height: 40,
    borderRadius: 999,
    border: "1px solid rgba(112,237,161,0.46)",
    background: "rgba(78,196,126,0.28)",
    color: "rgba(225,255,237,0.98)",
    padding: "0 16px",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  },
  btnPrimaryBlue: {
    height: 40,
    borderRadius: 999,
    border: "1px solid rgba(129,178,255,0.55)",
    background: "rgba(129,178,255,0.28)",
    color: "rgba(228,239,255,0.98)",
    padding: "0 16px",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  },
  btnGhost: {
    height: 40,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.24)",
    background: "transparent",
    color: "rgba(255,255,255,0.85)",
    padding: "0 16px",
    cursor: "pointer",
    fontSize: 14,
  },
  btnDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
  },
  input: {
    height: 44,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.24)",
    background: "rgba(0,0,0,0.3)",
    color: "white",
    padding: "0 12px",
    fontSize: 14,
    outline: "none",
  },
  inputSmall: {
    height: 40,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.24)",
    background: "rgba(0,0,0,0.3)",
    color: "white",
    padding: "0 10px",
    fontSize: 13,
    outline: "none",
  },
  checkboxRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
  },
  advancedGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 8,
    marginTop: 2,
  },
  checkboxSmall: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
  },
  errorText: {
    color: "rgba(255,174,174,0.95)",
    fontSize: 13,
  },
  progressText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
  },
};

