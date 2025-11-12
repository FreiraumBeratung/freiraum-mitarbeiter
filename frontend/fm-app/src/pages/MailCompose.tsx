import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PartnerBotBus } from "../components/PartnerBotBus";
import GlassCard from "../components/ui/GlassCard";
import Backdrop from "../components/layout/Backdrop";

const BACKEND = "http://127.0.0.1:30521";

export default function MailCompose() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    // Prefill from query params (voice intent)
    const toParam = searchParams.get("to");
    const bodyParam = searchParams.get("body");
    if (toParam) setTo(toParam);
    if (bodyParam) setBody(decodeURIComponent(bodyParam));

    // Show PartnerBot message if opened via voice
    if (toParam || bodyParam) {
      PartnerBotBus.poseAndSay("thumbs", "Alles klar – soll ich direkt senden oder vorher zeigen?", 5000);
    }
  }, [searchParams]);

  const handlePreview = () => {
    setPreview(true);
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const resp = await fetch(`${BACKEND}/api/mail/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, body }),
      });

      if (resp.ok) {
        setToast("E-Mail gesendet!");
        PartnerBotBus.poseAndSay("thumbs", "E-Mail erfolgreich gesendet!", 3000);
        setTimeout(() => navigate("/control-center"), 2000);
      } else {
        throw new Error("Backend error");
      }
    } catch (error) {
      // Graceful fallback if backend endpoint doesn't exist
      setToast("Mail-Senden lokal nicht installiert");
      PartnerBotBus.poseAndSay("wave", "Mail-Senden lokal nicht installiert", 4000);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Backdrop />
      <div className="relative z-10" style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">E-Mail verfassen</h1>
          <p className="text-white/60">Neue Nachricht erstellen und senden</p>
        </div>

        {toast && (
          <GlassCard className="mb-4 p-4 bg-orange-500/20 border-orange-500/40">
            <div className="text-orange-200">{toast}</div>
          </GlassCard>
        )}

        {preview ? (
          <GlassCard className="p-6">
            <div className="mb-4">
              <div className="text-sm text-white/50 mb-1">An:</div>
              <div className="text-white/90">{to || "(leer)"}</div>
            </div>
            <div className="mb-4">
              <div className="text-sm text-white/50 mb-1">Betreff:</div>
              <div className="text-white/90">{subject || "(leer)"}</div>
            </div>
            <div className="mb-6">
              <div className="text-sm text-white/50 mb-1">Nachricht:</div>
              <div className="text-white/90 whitespace-pre-wrap">{body || "(leer)"}</div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setPreview(false)}
                className="fr-btn fr-pill px-4 py-2 bg-white/10 hover:bg-white/20"
              >
                Zurück bearbeiten
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="fr-btn fr-pill px-4 py-2 bg-freiraum-orange/80 hover:bg-freiraum-orange"
              >
                {sending ? "Wird gesendet..." : "Sofort senden"}
              </button>
            </div>
          </GlassCard>
        ) : (
          <GlassCard className="p-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/70 mb-2">An:</label>
                <input
                  type="email"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="fr-input w-full"
                  placeholder="empfaenger@example.com"
                />
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-2">Betreff:</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="fr-input w-full"
                  placeholder="Betreff der E-Mail"
                />
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-2">Nachricht:</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="fr-textarea w-full min-h-[200px]"
                  placeholder="Ihre Nachricht..."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handlePreview}
                  className="fr-btn fr-pill px-4 py-2 bg-white/10 hover:bg-white/20"
                >
                  Zeig mir die Vorschau
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="fr-btn fr-pill px-4 py-2 bg-freiraum-orange/80 hover:bg-freiraum-orange"
                >
                  {sending ? "Wird gesendet..." : "Sofort senden"}
                </button>
              </div>
            </div>
          </GlassCard>
        )}
      </div>
    </>
  );
}

