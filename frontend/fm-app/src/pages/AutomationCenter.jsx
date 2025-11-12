import React, { useEffect, useState } from "react";
import { api } from "../api/client";
import { Button } from "../components/Button";

export default function AutomationCenter() {
  const [queue, setQueue] = useState([]);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      const data = await api.automation.queue("denis");
      setQueue(data.items || []);
    } catch (err) {
      setLog(l => [...l.slice(-9), `[Load Error] ${err.message}`]);
    }
  };

  const approve = async (ids, approve = true) => {
    try {
      setLoading(true);
      await api.automation.approve(ids, approve);
      setLog(l => [...l.slice(-9), `[${approve ? 'Approve' : 'Reject'}] ${ids.length} Items`]);
      await load();
    } catch (err) {
      setLog(l => [...l.slice(-9), `[Approve Error] ${err.message}`]);
    } finally {
      setLoading(false);
    }
  };

  const run = async () => {
    try {
      setLoading(true);
      const data = await api.automation.run("denis");
      setLog(l => [...l.slice(-9), `[Run] ${JSON.stringify(data, null, 2)}`]);
      await load();
    } catch (err) {
      setLog(l => [...l.slice(-9), `[Run Error] ${err.message}`]);
    } finally {
      setLoading(false);
    }
  };

  const auto = async () => {
    try {
      setLoading(true);
      const data = await api.automation.auto("denis");
      setLog(l => [...l.slice(-9), `[Auto-Enqueue] ${data.queued || 0} Items`]);
      await load();
    } catch (err) {
      setLog(l => [...l.slice(-9), `[Auto Error] ${err.message}`]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000); // Auto-refresh every 5s
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status) => {
    switch (status) {
      case "queued": return "text-yellow-400";
      case "approved": return "text-blue-400";
      case "running": return "text-orange-400";
      case "done": return "text-green-400";
      case "failed": return "text-red-400";
      case "rejected": return "text-gray-400";
      default: return "text-gray-300";
    }
  };

  return (
    <div className="fr-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-fr-orange mb-1">🤖 Automation Center</h1>
          <p className="text-fr-muted text-sm">Agentic Automation mit Human-in-the-Loop</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={load} disabled={loading} variant="secondary">
            🔄 Refresh
          </Button>
          <Button onClick={auto} disabled={loading} variant="secondary">
            ⚡ Auto-Enqueue
          </Button>
          <Button onClick={run} disabled={loading}>
            ▶️ Run Approved
          </Button>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        {queue.length === 0 ? (
          <div className="text-center py-8 text-fr-muted">
            Keine Aktionen in der Queue. Klicke auf "Auto-Enqueue" um Aktionen zu generieren.
          </div>
        ) : (
          queue.map(q => (
            <div key={q.id} className="fr-card p-4 border border-fr-border">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="font-semibold text-fr-text">{q.title}</div>
                    <span className={`text-xs font-medium ${getStatusColor(q.status)}`}>
                      {q.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-xs text-fr-muted mb-1 font-mono">{q.key}</div>
                  <div className="text-sm text-fr-muted mb-2">{q.reason}</div>
                  <div className="flex items-center gap-4 text-xs text-fr-muted">
                    <span>Score: <span className="text-fr-orange">{(q.score * 100).toFixed(0)}%</span></span>
                    <span>Erstellt: {new Date(q.created_at).toLocaleString("de-DE")}</span>
                    {q.finished_at && (
                      <span>Fertig: {new Date(q.finished_at).toLocaleString("de-DE")}</span>
                    )}
                  </div>
                  {q.result && (
                    <div className="mt-2 p-2 bg-black/20 rounded text-xs font-mono text-fr-muted">
                      {JSON.stringify(q.result, null, 2)}
                    </div>
                  )}
                </div>
                <div className="ml-4 flex gap-2">
                  {q.status === "queued" && (
                    <>
                      <button
                        onClick={() => approve([q.id], true)}
                        disabled={loading}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg text-sm font-medium transition"
                      >
                        ✓ Approve
                      </button>
                      <button
                        onClick={() => approve([q.id], false)}
                        disabled={loading}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg text-sm font-medium transition"
                      >
                        ✗ Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="fr-card p-4 bg-black/20">
        <div className="text-sm font-semibold mb-2 text-fr-text">Logs</div>
        <div className="text-xs font-mono whitespace-pre-wrap max-h-80 overflow-y-auto text-fr-muted">
          {log.length === 0 ? "Keine Logs" : log.join("\n\n")}
        </div>
      </div>
    </div>
  );
}

















