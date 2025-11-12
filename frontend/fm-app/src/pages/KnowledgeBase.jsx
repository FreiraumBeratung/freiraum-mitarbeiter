import React, { useEffect, useState } from "react";
import { api } from "../api/client";
import { Button } from "../components/Button";

export default function KnowledgeBase() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ topic: "", tags: "", content: "" });
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const data = await api.kb.list();
      setItems(data || []);
    } catch (err) {
      console.error("KB load error:", err);
    } finally {
      setLoading(false);
    }
  };

  const add = async () => {
    if (!form.topic || !form.content) {
      alert("Bitte Thema und Inhalt ausfüllen!");
      return;
    }
    try {
      setLoading(true);
      const body = {
        topic: form.topic,
        tags: form.tags ? form.tags.split(",").map(s => s.trim()).filter(s => s) : [],
        content: form.content
      };
      await api.kb.create(body);
      setForm({ topic: "", tags: "", content: "" });
      await load();
    } catch (err) {
      console.error("KB create error:", err);
      alert(`Fehler: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const search = async (q) => {
    if (!q) {
      const input = prompt("Suchbegriff eingeben:");
      if (!input) return;
      q = input;
    }
    try {
      const data = await api.kb.search(q);
      const results = data.results || [];
      if (results.length === 0) {
        alert("Keine Treffer gefunden.");
        return;
      }
      const msg = results.map(r =>
        `#${r.id} ${r.topic} (${(r.score * 100).toFixed(0)}%)\n${r.snippet}`
      ).join("\n\n");
      alert("Top Treffer:\n\n" + msg);
    } catch (err) {
      console.error("KB search error:", err);
      alert(`Fehler: ${err.message}`);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="fr-card p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-fr-orange mb-2">📚 Wissensbasis</h1>
        <p className="text-fr-muted text-sm">CRUD + schnelle lokale Suche</p>
      </div>

      <div className="grid gap-4 max-w-3xl mb-6">
        <div>
          <label className="block text-sm font-medium mb-1 text-fr-text">Thema</label>
          <input
            className="w-full p-2 rounded bg-gray-800 border border-fr-border text-fr-text"
            placeholder="z. B. SHK Kriterien"
            value={form.topic}
            onChange={e => setForm({ ...form, topic: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-fr-text">Tags (kommagetrennt)</label>
          <input
            className="w-full p-2 rounded bg-gray-800 border border-fr-border text-fr-text"
            placeholder="leads, shk, sauerland"
            value={form.tags}
            onChange={e => setForm({ ...form, tags: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-fr-text">Inhalt</label>
          <textarea
            className="w-full p-2 rounded bg-gray-800 border border-fr-border text-fr-text min-h-[160px]"
            placeholder="Vollständiger Inhalt des Wissensartikels..."
            value={form.content}
            onChange={e => setForm({ ...form, content: e.target.value })}
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={add} disabled={loading}>
            ➕ Hinzufügen
          </Button>
          <Button onClick={() => search()} variant="secondary" disabled={loading}>
            🔍 Suchen
          </Button>
          <Button onClick={load} variant="secondary" disabled={loading}>
            🔄 Aktualisieren
          </Button>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {items.length === 0 ? (
          <div className="text-center py-8 text-fr-muted">
            Keine Einträge vorhanden. Erstelle den ersten!
          </div>
        ) : (
          items.map(i => (
            <div key={i.id} className="fr-card p-4 border border-fr-border">
              <div className="font-semibold text-fr-text mb-1">{i.topic}</div>
              {(i.tags || []).length > 0 && (
                <div className="text-xs text-fr-muted mb-2">
                  {(i.tags || []).map(t => (
                    <span key={t} className="mr-2 px-2 py-1 bg-gray-800 rounded">#{t}</span>
                  ))}
                </div>
              )}
              <div className="text-sm text-fr-text whitespace-pre-wrap mt-2">{i.content}</div>
              <div className="text-xs text-fr-muted mt-2">
                Erstellt: {new Date(i.created_at).toLocaleString("de-DE")}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

















