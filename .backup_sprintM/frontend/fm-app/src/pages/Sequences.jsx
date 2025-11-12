import React, { useEffect, useState } from "react";
import { api } from "../api/client";
import { Button } from "../components/Button";

export default function Sequences() {
  const [list, setList] = useState([]);
  const [leads, setLeads] = useState([]);
  const [form, setForm] = useState({
    name: "Freiraum 3-Step",
    description: "Kurze Erstmail + Follow-ups",
    steps: [
      {
        day_offset: 0,
        subject: "Kurze Info von Freiraum",
        body: "Hallo {{company}}, kurze Info … Freiraum hilft in {{city}} ({{category}})…",
        attach_flyer: true
      },
      {
        day_offset: 3,
        subject: "Kurze Erinnerung",
        body: "Hallo {{company}}, nur kurz nachgefasst …",
        attach_flyer: false
      },
      {
        day_offset: 7,
        subject: "Letzter kurzer Ping",
        body: "Hallo {{company}}, letzter kurzer Ping – 15 Min Kennenlernen?",
        attach_flyer: false
      }
    ]
  });
  const [run, setRun] = useState({ sequence_id: 0, lead_ids: [], attach_flyer: true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      setError(null);
      const [seqData, leadsData] = await Promise.all([
        api.sequences.list().catch(() => []),
        api.leads.list().catch(() => [])
      ]);
      setList(seqData || []);
      setLeads(leadsData || []);
    } catch (err) {
      console.error("Load error:", err);
      setError(err.message || "Fehler beim Laden");
    }
  };

  const createSeq = async () => {
    try {
      setLoading(true);
      setError(null);
      await api.sequences.create(form);
      await load();
      alert("Sequence erstellt!");
    } catch (err) {
      console.error("Create error:", err);
      setError(err.message || "Fehler beim Erstellen");
      alert(`Fehler: ${err.message || "Unbekannter Fehler"}`);
    } finally {
      setLoading(false);
    }
  };

  const runSeq = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.sequences.run(run);
      alert(`Run #${data.id} -> ${data.status}`);
      await load();
    } catch (err) {
      console.error("Run error:", err);
      setError(err.message || "Fehler beim Ausführen");
      alert(`Fehler: ${err.message || "Unbekannter Fehler"}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="fr-card p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-fr-orange mb-2">📧 Sequences</h1>
        <p className="text-fr-muted text-sm">E-Mail-Sequenzen mit Steps und Delays</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="fr-card p-4 bg-gray-900">
          <div className="font-semibold mb-2 text-fr-text">Neue Sequence anlegen</div>
          <input
            className="w-full p-2 mb-2 bg-gray-800 border border-fr-border rounded text-fr-text"
            placeholder="Name"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
          />
          <textarea
            className="w-full p-2 mb-2 bg-gray-800 border border-fr-border rounded text-fr-text"
            placeholder="Beschreibung"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
          />
          <div className="text-sm opacity-80 mb-2 text-fr-text">Steps:</div>
          {form.steps.map((s, idx) => (
            <div key={idx} className="p-2 mb-2 bg-gray-800 rounded border border-fr-border">
              <div className="text-xs opacity-70 text-fr-muted">Tag +{s.day_offset}</div>
              <input
                className="w-full p-1 my-1 bg-gray-900 border border-fr-border rounded text-fr-text"
                value={s.subject}
                onChange={e => {
                  const steps = [...form.steps];
                  steps[idx].subject = e.target.value;
                  setForm({ ...form, steps });
                }}
              />
              <textarea
                className="w-full p-1 my-1 bg-gray-900 border border-fr-border rounded text-fr-text"
                value={s.body}
                onChange={e => {
                  const steps = [...form.steps];
                  steps[idx].body = e.target.value;
                  setForm({ ...form, steps });
                }}
              />
              <label className="text-xs text-fr-text">
                <input
                  type="checkbox"
                  checked={s.attach_flyer}
                  onChange={e => {
                    const steps = [...form.steps];
                    steps[idx].attach_flyer = e.target.checked;
                    setForm({ ...form, steps });
                  }}
                  className="rounded mr-1"
                />
                Flyer anhängen
              </label>
            </div>
          ))}
          <Button onClick={createSeq}>Sequence speichern</Button>
        </div>

        <div className="fr-card p-4 bg-gray-900">
          <div className="font-semibold mb-2 text-fr-text">Sequence ausführen</div>
          <select
            className="w-full p-2 mb-2 bg-gray-800 border border-fr-border rounded text-fr-text"
            value={run.sequence_id}
            onChange={e => setRun({ ...run, sequence_id: parseInt(e.target.value || "0") })}
          >
            <option value={0}>-- wählen --</option>
            {list.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="text-sm opacity-80 mb-1 text-fr-text">Leads auswählen:</div>
          <div className="max-h-48 overflow-auto bg-gray-800 rounded border border-fr-border p-2">
            {leads.map(l => (
              <label key={l.id} className="block text-xs text-fr-text">
                <input
                  type="checkbox"
                  onChange={e => {
                    const set = new Set(run.lead_ids);
                    if (e.target.checked) set.add(l.id);
                    else set.delete(l.id);
                    setRun({ ...run, lead_ids: Array.from(set) });
                  }}
                  className="rounded mr-1"
                />
                #{l.id} {l.company} – {l.email || "-"}
              </label>
            ))}
          </div>
          <label className="text-sm opacity-80 text-fr-text">
            <input
              type="checkbox"
              checked={run.attach_flyer}
              onChange={e => setRun({ ...run, attach_flyer: e.target.checked })}
              className="rounded mr-1"
            />
            Flyer anhängen
          </label>
          <div>
            <Button onClick={runSeq} variant="secondary" className="mt-2">Start</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

