import React, { useEffect, useState } from "react";
import { api } from "../api/client";
import { Button } from "../components/Button";
import { Field, Input, Textarea } from "../components/Form";

export default function PersonalityPage() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ tone: "", humor: "", formality: "", focus: "", style_notes: "" });

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await api.character.profile("denis");
        setProfile(data);
        setForm({
          tone: data.tone || "",
          humor: data.humor || "",
          formality: data.formality || "",
          focus: (data.focus || []).join(", "),
          style_notes: data.style_notes || "",
        });
      } catch (err) {
        console.error("PersonalityPage load error:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const save = async () => {
    try {
      const body = {
        user_id: "denis",
        tone: form.tone,
        humor: form.humor,
        formality: form.formality,
        focus: form.focus.split(",").map((f) => f.trim()).filter(Boolean),
        style_notes: form.style_notes,
      };
      const data = await api.character.setProfile(body);
      setProfile(data);
      alert("Profil aktualisiert!");
    } catch (err) {
      console.error("PersonalityPage save error:", err);
      alert("Fehler beim Speichern: " + err.message);
    }
  };

  if (loading) return <div className="fr-card p-6"><div className="text-fr-muted">Lade Profil...</div></div>;

  return (
    <div className="fr-card p-6">
      <div className="h1 mb-4 text-fr-orange">🧠 Persönlichkeits-Profil</div>
      <div className="grid gap-4 max-w-2xl">
        <Field label="TON">
          <Input
            value={form.tone}
            onChange={(e) => setForm({ ...form, tone: e.target.value })}
            placeholder="partnerschaftlich, direkt, motivierend"
          />
        </Field>
        <Field label="HUMOR">
          <Input
            value={form.humor}
            onChange={(e) => setForm({ ...form, humor: e.target.value })}
            placeholder="dezent"
          />
        </Field>
        <Field label="FORMALITÄT">
          <Input
            value={form.formality}
            onChange={(e) => setForm({ ...form, formality: e.target.value })}
            placeholder="mittel"
          />
        </Field>
        <Field label="FOKUS (kommagetrennt)">
          <Input
            value={form.focus}
            onChange={(e) => setForm({ ...form, focus: e.target.value })}
            placeholder="SHK, ERP, E-Mail, Leads"
          />
        </Field>
        <Field label="STIL-NOTIZEN">
          <Textarea
            value={form.style_notes}
            onChange={(e) => setForm({ ...form, style_notes: e.target.value })}
            placeholder="Schwarz-Orange, High-End ERP Look, klare Sprache."
          />
        </Field>
      </div>
      <div className="mt-6">
        <Button onClick={save} variant="primary">
          Speichern
        </Button>
      </div>
    </div>
  );
}



















