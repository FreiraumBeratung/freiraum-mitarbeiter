import React, { useEffect, useState } from "react";
import { api } from "../api/client";

export default function SettingsVoicePrefs() {
  const [mode, setMode] = useState("ask");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Fetch current preference
    const load = async () => {
      try {
        const list = await api.profile.list();
        const pref = (list || []).find(p => (p.key || "").toLowerCase() === "voice.leads.default_mode");
        if (pref?.value) {
          setMode(pref.value);
        }
      } catch (err) {
        console.error("Failed to load voice prefs:", err);
      }
    };
    load();
  }, []);

  const save = async () => {
    try {
      setLoading(true);
      await api.profile.set("voice.leads.default_mode", mode);
      alert("Voice-Default gespeichert.");
    } catch (err) {
      console.error("Failed to save voice prefs:", err);
      alert(`Fehler: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fr-card p-4">
      <div className="font-semibold mb-2 text-fr-text">🎙️ Voice-Defaults (Kontakte)</div>
      <div className="text-sm text-fr-muted mb-3">
        Standard-Verhalten bei "Such Kontakte …" Voice-Commands
      </div>
      <div className="flex items-center gap-3">
        <select
          className="bg-gray-800 border border-fr-border rounded-lg p-2 text-fr-text"
          value={mode}
          onChange={e => setMode(e.target.value)}
          disabled={loading}
        >
          <option value="ask">Nachfragen</option>
          <option value="add">Nur anlegen</option>
          <option value="outreach">Direkt anschreiben</option>
        </select>
        <button
          onClick={save}
          disabled={loading}
          className="px-4 py-2 bg-fr-orange hover:bg-fr-orange-dim rounded-lg text-white font-medium transition disabled:opacity-50"
        >
          {loading ? "Speichere..." : "Speichern"}
        </button>
      </div>
      <div className="text-xs text-fr-muted mt-2">
        <strong>Nachfragen:</strong> Immer bestätigen lassen<br />
        <strong>Nur anlegen:</strong> Kontakte direkt in Queue (ohne Outreach)<br />
        <strong>Direkt anschreiben:</strong> Kontakte suchen + direkt anschreiben (wenn erlaubt)
      </div>
    </div>
  );
}






