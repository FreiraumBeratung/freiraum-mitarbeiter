import React, { useState } from "react";
import { api } from "../api/client";
import { Button } from "../components/Button";

export default function LeadsHunter() {
  const [form, setForm] = useState({
    category: "shk",
    location: "arnsberg",
    count: 20,
    save_to_db: true,
    export_excel: true
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const runHunt = async () => {
    try {
      setLoading(true);
      setResult(null);
      const data = await api.leadHunter.hunt(form);
      setResult(data);
    } catch (err) {
      console.error("Hunt error:", err);
      const errorMsg = err.message || "Unbekannter Fehler";
      setResult({ 
        ok: false,
        found: 0, 
        saved: 0, 
        items: [], 
        leads: [],
        message: `Fehler: ${errorMsg}. Versuche z. B. 'sanitär', 'heizung', 'installateur' oder einen Nachbarort (Neheim, Hüsten, Meschede).`
      });
    } finally {
      setLoading(false);
    }
  };

  const doOutreach = async () => {
    const leads = result?.items || result?.leads || [];
    if (!leads.length) {
      alert("Keine Leads im Ergebnis.");
      return;
    }
    try {
      setLoading(true);
      const data = await api.leadHunter.outreach(leads, true);
      alert(`✅ Gesendet: ${data.sent}, Follow-ups: ${data.followups_created}`);
    } catch (err) {
      console.error("Outreach error:", err);
      alert(`Fehler: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fr-card p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-fr-orange mb-2">🔍 Leads Hunter</h1>
        <p className="text-fr-muted text-sm">Websuche → Leads → Excel/DB → Outreach</p>
      </div>

      <div className="grid gap-4 max-w-2xl mb-6">
        <div>
          <label className="block text-sm font-medium mb-1 text-fr-text">Kategorie</label>
          <input
            className="w-full p-2 rounded bg-gray-800 border border-fr-border text-fr-text"
            placeholder="z.B. shk, elektro, makler"
            value={form.category}
            onChange={e => setForm({ ...form, category: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-fr-text">Ort/Region</label>
          <input
            className="w-full p-2 rounded bg-gray-800 border border-fr-border text-fr-text"
            placeholder="z.B. arnsberg, neheim, sauerland"
            value={form.location}
            onChange={e => setForm({ ...form, location: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-fr-text">Anzahl</label>
          <input
            type="number"
            className="w-full p-2 rounded bg-gray-800 border border-fr-border text-fr-text"
            placeholder="20"
            value={form.count}
            onChange={e => setForm({ ...form, count: parseInt(e.target.value || "20") })}
            min="1"
            max="200"
          />
        </div>
        <div className="flex gap-4">
          <label className="text-sm text-fr-text flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.save_to_db}
              onChange={e => setForm({ ...form, save_to_db: e.target.checked })}
              className="rounded"
            />
            In DB speichern
          </label>
          <label className="text-sm text-fr-text flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.export_excel}
              onChange={e => setForm({ ...form, export_excel: e.target.checked })}
              className="rounded"
            />
            Excel exportieren
          </label>
        </div>
        <div className="flex gap-2">
          <Button onClick={runHunt} disabled={loading}>
            🔍 Suchen
          </Button>
          <Button onClick={doOutreach} variant="secondary" disabled={loading || !result || ((result?.items || result?.leads || []).length === 0)}>
            📧 Direkt anschreiben
          </Button>
        </div>
      </div>

      {result && (
        <div className="fr-card p-4 bg-gray-900">
          <div className="text-sm text-fr-muted mb-4">
            Gefunden: <span className="text-fr-orange font-semibold">{result.found}</span> • 
            Gespeichert: <span className="text-fr-orange font-semibold">{result.saved || 0}</span>
            {result.excel_path && (
              <> • Excel: <span className="text-fr-text">{result.excel_path.split(/[/\\]/).pop()}</span></>
            )}
          </div>
          {result.found === 0 && result.message && (
            <div className="mb-4 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm">
              {result.message || "Keine Treffer mit dieser Kombination. Versuche z. B. 'sanitär', 'heizung', 'installateur' oder einen Nachbarort (Neheim, Hüsten, Meschede)."}
            </div>
          )}
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {(result.items || result.leads || []).length > 0 ? (
              <table className="fr-table w-full">
                <thead>
                  <tr>
                    <th>Firma</th>
                    <th>E-Mail</th>
                    <th>Telefon</th>
                    <th>URL</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.items || result.leads || []).map((l, idx) => (
                    <tr key={idx}>
                      <td className="font-semibold">{l.company || "Unbekannt"}</td>
                      <td>{l.email || "-"}</td>
                      <td>{l.phone || "-"}</td>
                      <td>
                        {l.url ? (
                          <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-fr-orange hover:underline text-xs truncate max-w-xs block">
                            {l.url}
                          </a>
                        ) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8 text-fr-muted">
                Keine Leads gefunden. Versuche andere Suchparameter.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


