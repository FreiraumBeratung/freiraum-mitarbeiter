import React, { useEffect, useState } from "react";
import { api } from "../api/client";
import { Button } from "../components/Button";

export default function Calendar() {
  const [form, setForm] = useState({
    title: "Besprechung Freiraum",
    start: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
    end: new Date(Date.now() + 5400000).toISOString().slice(0, 16),
    location: "Online",
    attendees: ""
  });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      setError(null);
      const data = await api.calendar.list();
      setItems(data || []);
    } catch (err) {
      console.error("Load error:", err);
      setError(err.message || "Fehler beim Laden");
    }
  };

  const create = async () => {
    try {
      setLoading(true);
      setError(null);
      const body = {
        title: form.title,
        start: new Date(form.start).toISOString(),
        end: new Date(form.end).toISOString(),
        location: form.location,
        attendees: form.attendees ? form.attendees.split(",").map(s => s.trim()) : []
      };
      const data = await api.calendar.create(body);
      alert(`Event #${data.id} erstellt`);
      await load();
    } catch (err) {
      console.error("Create error:", err);
      setError(err.message || "Fehler beim Erstellen");
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
        <h1 className="text-2xl font-bold text-fr-orange mb-2">📆 Kalender</h1>
        <p className="text-fr-muted text-sm">Termine verwalten + optional MS Graph</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="fr-card p-4 bg-gray-900">
          <div className="font-semibold mb-2 text-fr-text">Neuer Termin</div>
          <input
            className="w-full p-2 mb-2 bg-gray-800 border border-fr-border rounded text-fr-text"
            placeholder="Titel"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="datetime-local"
              className="p-2 bg-gray-800 border border-fr-border rounded text-fr-text"
              value={form.start}
              onChange={e => setForm({ ...form, start: e.target.value })}
            />
            <input
              type="datetime-local"
              className="p-2 bg-gray-800 border border-fr-border rounded text-fr-text"
              value={form.end}
              onChange={e => setForm({ ...form, end: e.target.value })}
            />
          </div>
          <input
            className="w-full p-2 my-2 bg-gray-800 border border-fr-border rounded text-fr-text"
            placeholder="Ort"
            value={form.location}
            onChange={e => setForm({ ...form, location: e.target.value })}
          />
          <input
            className="w-full p-2 my-2 bg-gray-800 border border-fr-border rounded text-fr-text"
            placeholder="Attendees (kommagetrennt)"
            value={form.attendees}
            onChange={e => setForm({ ...form, attendees: e.target.value })}
          />
          <Button onClick={create}>Erstellen</Button>
        </div>
        <div className="fr-card p-4 bg-gray-900">
          <div className="font-semibold mb-2 text-fr-text">Letzte Termine</div>
          <div className="grid gap-2 max-h-96 overflow-auto">
            {items.map(i => (
              <div key={i.id} className="p-3 bg-gray-800 rounded-xl border border-fr-border">
                <div className="font-semibold text-fr-text">{i.title}</div>
                <div className="text-xs opacity-75 text-fr-muted">
                  {new Date(i.start).toLocaleString()} – {new Date(i.end).toLocaleString()}
                </div>
                <div className="text-xs opacity-75 text-fr-muted">{i.location}</div>
                <div className="text-xs opacity-75 text-fr-muted">
                  👥 {(i.attendees || []).join(", ") || "-"}
                </div>
                <div className="text-xs opacity-60 text-fr-muted">{i.notes || ""}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

