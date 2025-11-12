import React, { useState } from "react";
import { api } from "../api/client";
import { Button } from "../components/Button";

export default function DecisionCenter() {
  const [actions, setActions] = useState([]);
  const [meta, setMeta] = useState(null);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  const think = async () => {
    try {
      setLoading(true);
      const data = await api.decision.think("denis", 5);
      setMeta({ mood: data.mood, intensity: data.intensity, confidence: data.confidence });
      setActions(data.actions || []);
      setLog(prev => [...prev.slice(-9), `[Think] ${data.actions?.length || 0} Actions gefunden`]);
    } catch (err) {
      setLog(prev => [...prev.slice(-9), `[Think Error] ${err.message}`]);
    } finally {
      setLoading(false);
    }
  };

  const execute = async (dry = false) => {
    if (actions.length === 0) {
      alert("Bitte zuerst 'Think' ausführen!");
      return;
    }
    try {
      setLoading(true);
      const data = await api.decision.execute("denis", actions, dry);
      setLog(prev => [...prev.slice(-9), `[Execute ${dry ? 'Dry-Run' : 'Real'}] ${data.results?.length || 0} Actions ausgeführt`]);
      if (!dry) {
        alert(`✅ ${data.results?.filter(r => r.ok).length || 0} von ${data.results?.length || 0} Aktionen erfolgreich`);
      } else {
        alert("✅ Dry-Run abgeschlossen (keine echten Aktionen)");
      }
    } catch (err) {
      setLog(prev => [...prev.slice(-9), `[Execute Error] ${err.message}`]);
      alert(`Fehler: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const runFull = async () => {
    try {
      setLoading(true);
      const data = await api.decision.run("denis", 5, true, false);
      setLog(prev => [...prev.slice(-9), `[Run] Run ID: ${data.run_id}, Executed: ${data.executed}`]);
      alert("✅ Vollständiger Run abgeschlossen!");
      // Refresh actions after run
      await think();
    } catch (err) {
      setLog(prev => [...prev.slice(-9), `[Run Error] ${err.message}`]);
      alert(`Fehler: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      setLoading(true);
      const data = await api.decision.history("denis", 10);
      setHistory(data.items || []);
      setLog(prev => [...prev.slice(-9), `[History] ${data.items?.length || 0} Runs geladen`]);
    } catch (err) {
      setLog(prev => [...prev.slice(-9), `[History Error] ${err.message}`]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fr-card p-6">
      <div className="h1 mb-4 text-fr-orange">🧠 Decision Center</div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <Button onClick={think} disabled={loading} variant="primary">
          Think
        </Button>
        <Button onClick={() => execute(true)} disabled={loading || actions.length === 0} variant="ghost">
          Dry-Run
        </Button>
        <Button onClick={() => execute(false)} disabled={loading || actions.length === 0} variant="primary">
          Execute
        </Button>
        <Button onClick={runFull} disabled={loading} variant="primary">
          Run (Auto)
        </Button>
        <Button onClick={loadHistory} disabled={loading} variant="ghost">
          History
        </Button>
      </div>

      {meta && (
        <div className="fr-card p-4 mb-4 bg-fr-panel">
          <div className="text-sm text-fr-muted">
            Mood: <b className="text-fr-text">{meta.mood}</b> • 
            Intensity: {meta.intensity?.toFixed(2)} • 
            Confidence: {meta.confidence?.toFixed(2)}
          </div>
        </div>
      )}

      <div className="space-y-3 mb-4">
        {actions.map((a, i) => (
          <div key={i} className="fr-card p-4 border-fr-border">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="font-semibold text-fr-text">
                  {a.title} <span className="text-xs text-fr-muted">({(a.score * 100).toFixed(0)}%)</span>
                </div>
                <div className="text-xs text-fr-muted mt-1">{a.key}</div>
                <div className="text-sm text-fr-muted mt-2">{a.reason}</div>
              </div>
            </div>
          </div>
        ))}
        {actions.length === 0 && !loading && (
          <div className="text-fr-muted text-sm text-center py-4">Noch keine Actions – klicke auf "Think".</div>
        )}
        {loading && (
          <div className="text-fr-muted text-sm text-center py-4">Lädt...</div>
        )}
      </div>

      {history.length > 0 && (
        <div className="fr-card p-4 mb-4">
          <div className="h2 mb-2">History</div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {history.map((h, i) => (
              <div key={i} className="text-xs text-fr-muted border-b border-fr-border pb-2">
                Run #{h.id}: {h.executed ? "✅ Executed" : "📋 Planned"} | 
                Mood: {h.mood} | 
                {h.finished_at ? `Finished: ${new Date(h.finished_at).toLocaleString('de-DE')}` : "Not finished"}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="fr-card p-4">
        <div className="text-sm font-semibold mb-2 text-fr-text">Logs</div>
        <div className="text-xs text-fr-muted whitespace-pre-wrap max-h-64 overflow-y-auto font-mono bg-black/20 p-3 rounded-lg">
          {log.length === 0 ? "Keine Logs..." : log.join("\n")}
        </div>
      </div>
    </div>
  );
}



















