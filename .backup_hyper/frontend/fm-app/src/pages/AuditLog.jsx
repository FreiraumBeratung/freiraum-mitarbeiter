import React, { useEffect, useState } from "react";
import { api } from "../api/client";
import { Button } from "../components/Button";

export default function AuditLog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [userId, setUserId] = useState("");
  const [actionLike, setActionLike] = useState("");
  const [limit, setLimit] = useState(200);

  async function load() {
    setLoading(true);
    try {
      const qs = {
        since: since || undefined,
        until: until || undefined,
        user_id: userId || undefined,
        action_like: actionLike || undefined,
        limit
      };
      const data = await api.audit.list(qs);
      setRows(data || []);
    } catch (e) {
      console.error("Audit load error:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const handleExportPDF = async () => {
    try {
      const qs = {
        since: since || undefined,
        until: until || undefined,
        user_id: userId || undefined,
        action_like: actionLike || undefined,
        limit
      };
      const blob = await api.audit.exportPDF(qs);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audit_report.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("PDF export error:", e);
      alert("PDF-Export fehlgeschlagen. Versuche CSV.");
    }
  };

  const handleExportCSV = async () => {
    try {
      const qs = {
        since: since || undefined,
        until: until || undefined,
        user_id: userId || undefined,
        action_like: actionLike || undefined,
        limit
      };
      const blob = await api.audit.exportCSV(qs);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audit_export.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("CSV export error:", e);
      alert("CSV-Export fehlgeschlagen.");
    }
  };

  const handlePurge = async () => {
    if (!confirm("Wirklich alle Einträge älter als 90 Tage löschen?")) return;
    try {
      await api.audit.purge(90);
      await load();
      alert("Purge erfolgreich.");
    } catch (e) {
      console.error("Purge error:", e);
      alert("Purge fehlgeschlagen.");
    }
  };

  const handleDeleteUser = async () => {
    const uid = prompt("User-ID löschen (DSGVO):", "denis");
    if (!uid) return;
    if (!confirm(`Wirklich alle Audit-Einträge für User "${uid}" löschen?`)) return;
    try {
      await api.audit.deleteUser(uid);
      await load();
      alert("User-Daten gelöscht.");
    } catch (e) {
      console.error("Delete user error:", e);
      alert("Löschen fehlgeschlagen.");
    }
  };

  return (
    <div className="fr-card p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-fr-orange mb-2">📋 Audit-Trail</h1>
        <p className="text-fr-muted text-sm">DSGVO-konforme Protokollierung aller Aktionen</p>
      </div>

      <div className="mb-4 bg-gray-900 rounded-xl p-4 border border-gray-800">
        <div className="font-semibold text-orange-400 mb-3">Filter</div>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
          <input
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-fr-text text-sm"
            placeholder="since (ISO)"
            value={since}
            onChange={e => setSince(e.target.value)}
          />
          <input
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-fr-text text-sm"
            placeholder="until (ISO)"
            value={until}
            onChange={e => setUntil(e.target.value)}
          />
          <input
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-fr-text text-sm"
            placeholder="user_id"
            value={userId}
            onChange={e => setUserId(e.target.value)}
          />
          <input
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-fr-text text-sm"
            placeholder="action contains"
            value={actionLike}
            onChange={e => setActionLike(e.target.value)}
          />
          <input
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-fr-text text-sm"
            type="number"
            min="10"
            max="2000"
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
          />
          <button onClick={load} className="bg-orange-600 hover:bg-orange-500 text-white px-3 py-1 rounded">Aktualisieren</button>
        </div>

        <div className="mt-3 flex gap-2 flex-wrap">
          <button onClick={handleExportPDF} className="border border-gray-700 rounded px-3 py-1 hover:bg-gray-800">Export PDF</button>
          <button onClick={handleExportCSV} className="border border-gray-700 rounded px-3 py-1 hover:bg-gray-800">Export CSV</button>
          <button onClick={handlePurge} className="border border-gray-700 rounded px-3 py-1 hover:bg-gray-800">Älter als 90T löschen</button>
          <button onClick={handleDeleteUser} className="border border-gray-700 rounded px-3 py-1 hover:bg-gray-800">User-Daten löschen</button>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-black/40 text-gray-300">
            <tr>
              <th className="text-left p-2">Zeit (UTC)</th>
              <th className="text-left p-2">User</th>
              <th className="text-left p-2">Aktion</th>
              <th className="text-left p-2">Pfad</th>
              <th className="text-left p-2">Method</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Payload</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="p-2 text-gray-400" colSpan={7}>Lade…</td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td className="p-2 text-gray-400" colSpan={7}>Keine Einträge.</td>
              </tr>
            )}
            {rows.map(r => (
              <tr key={r.id} className="border-t border-gray-800 hover:bg-black/30">
                <td className="p-2 text-fr-text">{r.ts}</td>
                <td className="p-2 text-fr-text">{r.user_id || "-"}</td>
                <td className="p-2 text-fr-text">{r.action}</td>
                <td className="p-2 text-fr-text">{r.path || "-"}</td>
                <td className="p-2 text-fr-text">{r.method || "-"}</td>
                <td className="p-2 text-fr-text">{r.status || "-"}</td>
                <td className="p-2 text-fr-text truncate max-w-[380px]" title={r.payload_json || ""}>
                  {r.payload_json || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

