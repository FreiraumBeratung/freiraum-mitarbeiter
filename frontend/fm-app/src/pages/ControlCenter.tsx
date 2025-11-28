import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Backdrop from "../components/layout/Backdrop";
import GlassCard from "../components/ui/GlassCard";
import SectionHeader from "../components/ui/SectionHeader";
import TogglePill from "../components/ui/TogglePill";
import VoicePTT from "../components/VoicePTT";
import { voice } from "../modules/voice";

const BACKEND = "http://127.0.0.1:30521";

export default function ControlCenter() {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState<any>(null);
  const [feats, setFeats] = useState<any>({});
  const [log, setLog] = useState<string>("");
  const [categories, setCategories] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("shk");
  const [selectedCity, setSelectedCity] = useState("Arnsberg");
  const [osmHunting, setOsmHunting] = useState(false);

  async function refresh() {
    try {
      const [a, b] = await Promise.all([
        fetch(`${BACKEND}/api/system/config`).then((r) => r.json()),
        fetch(`${BACKEND}/api/system/features`).then((r) => r.json()),
      ]);
      setCfg(a);
      setFeats(b?.features || {});
    } catch (e) {
      setLog("Backend nicht erreichbar.");
    }
  }

  useEffect(() => {
    refresh();
    // Load categories and cities
    fetch(`${BACKEND}/voice/intent/categories`)
      .then((r) => r.json())
      .then((data) => {
        if (data.categories) setCategories(data.categories);
      })
      .catch(() => {});
    fetch(`${BACKEND}/voice/intent/cities`)
      .then((r) => r.json())
      .then((data) => {
        if (data.cities) setCities(data.cities);
      })
      .catch(() => {});
  }, []);

  async function startOSMHunt() {
    setOsmHunting(true);
    setLog("Starte OSM-Suche...");
    try {
      const resp = await fetch(`${BACKEND}/lead_hunter/osm/hunt_async`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: selectedCategory,
          location: selectedCity,
          enrich: true,
        }),
      });
      const data = await resp.json();
      if (data.ok && data.result) {
        setLog(`Gefunden: ${data.result.found} Leads`);
        // Navigate to results page with data
        navigate("/leads/osm/results", { state: { result: data.result } });
      } else {
        setLog(`Fehler: ${data.error || "Unbekannter Fehler"}`);
      }
    } catch (e: any) {
      setLog(`Fehler: ${e.message}`);
    } finally {
      setOsmHunting(false);
    }
  }

  function setLocal(key: string, v: boolean) {
    const cur = JSON.parse(localStorage.getItem("fm_feature_toggles") || "{}");
    cur[key] = v;
    localStorage.setItem("fm_feature_toggles", JSON.stringify(cur));
    setLog(`Toggle ${key} -> ${v}`);
  }

  function getLocal(key: string, fallback = false) {
    const cur = JSON.parse(localStorage.getItem("fm_feature_toggles") || "{}");
    return key in cur ? !!cur[key] : fallback;
  }

  const groups = [
    {
      title: "Kommunikation",
      items: [
        {
          k: "voice_ptt",
          label: "Push-to-Talk",
          hint: "Mikro halten, sprechen, loslassen → Antwort",
        },
        {
          k: "tts",
          label: "Text-zu-Sprache (TTS)",
          hint: "Ruhige, klare Stimme",
        },
        {
          k: "stt",
          label: "Sprache-zu-Text (STT)",
          hint: "Lokal (Whisper)",
        },
      ],
    },
    {
      title: "Vertrieb",
      items: [
        {
          k: "lead_hunter",
          label: "Lead-Hunter (Real-Mode)",
          hint: "CSV/OSM/HWK/Meister",
        },
        {
          k: "lead_radar",
          label: "Lead-Radar-Score",
          hint: "Scoring, Priorisierung",
        },
      ],
    },
    {
      title: "Assistent",
      items: [
        {
          k: "proactive",
          label: "Proaktive Hinweise",
          hint: "Nächste Schritte, Erinnerungen",
        },
        {
          k: "reminders",
          label: "Nachfassungen",
          hint: "Ruhige Erinnerungen",
        },
      ],
    },
    {
      title: "Daten & Tools",
      items: [
        {
          k: "kb",
          label: "Wissensbasis",
          hint: "Dein Brain",
        },
        {
          k: "calendar",
          label: "Kalender",
          hint: "Termine",
        },
        {
          k: "exports",
          label: "Exporte",
          hint: "XLSX/CSV/JSON/MD",
        },
      ],
    },
  ];


  return (
    <>
      <Backdrop />
      <div className="relative z-10" style={{ padding: 18, maxWidth: 1200, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div>
            <div className="text-2xl font-bold tracking-tight">
              Freiraum Mitarbeiter — Control Center
            </div>
            <div className="text-sm text-freiraum-sub">
              Enterprise-Glasoberfläche • Schwarz-Orange • ruhig & souverän
            </div>
          </div>
          <div className="glass-card p-4">
            <div style={{ textAlign: "right" }}>
              <div className="fr-pill px-2 py-1 text-xs">
                REAL_MODE (Backend): {String(cfg?.real_mode)}
              </div>
              <div className="fr-pill px-2 py-1 text-xs mt-1">
                LEAD_PROVIDER: {cfg?.env?.LEAD_PROVIDER || "?"}
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mb-4 hide-local-nav">
          <Link
            to="/control-center"
            className="fr-pill px-4 py-2 text-sm border-b-2 border-freiraum-orange text-freiraum-text"
            style={{ textDecoration: 'none' }}
          >
            Übersicht
          </Link>
          <Link
            to="/leads-real"
            className="fr-pill px-4 py-2 text-sm text-freiraum-sub hover:text-freiraum-text"
            style={{ textDecoration: 'none' }}
          >
            Leads
          </Link>
          <Link
            to="/lead-radar"
            className="fr-pill px-4 py-2 text-sm text-freiraum-sub hover:text-freiraum-text"
            style={{ textDecoration: 'none' }}
          >
            Lead-Radar
          </Link>
          <Link
            to="/voice-diagnostics"
            className="fr-pill px-4 py-2 text-sm text-freiraum-sub hover:text-freiraum-text"
            style={{ textDecoration: 'none' }}
          >
            Voice-Diag
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {groups.map((g) => (
            <div key={g.title} className="glass-card p-6">
              <SectionHeader title={g.title} />
              <div className="grid gap-3 mt-5">
                {g.items.map((it) => {
                  const present = feats[it.k] ?? true;
                  const val = getLocal(it.k, present);
                  return (
                    <TogglePill
                      key={it.k}
                      on={val}
                      label={`${it.label} ${present ? "" : "(nicht installiert)"}`}
                      desc={it.hint}
                      onClick={() => {
                        setLocal(it.k, !val);
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-5">
              <SectionHeader title="Push-to-Talk" subtitle="Zum Sprechen halten. Loslassen → Antwort." />
              <button
                className="fr-btn fr-pill px-3 py-1 text-xs"
                onClick={refresh}
              >
                Status neu laden
              </button>
            </div>
            <div className="flex items-center justify-center py-4">
              <VoicePTT />
            </div>
          </div>

          <div className="glass-card p-6">
            <SectionHeader title="Lead Radar — OSM Suche" />
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block mb-2 text-xs text-freiraum-sub">
                  Kategorie
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="fr-glass w-full px-3 py-2 rounded-lg border border-white/12 bg-white/5 text-white text-sm"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block mb-2 text-xs text-freiraum-sub">
                  Stadt
                </label>
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="fr-glass w-full px-3 py-2 rounded-lg border border-white/12 bg-white/5 text-white text-sm"
                >
                  {cities.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              className="fr-btn w-full fr-pill py-3 font-semibold bg-freiraum-orange/20 hover:bg-freiraum-orange/30 border-freiraum-orange/40"
              onClick={startOSMHunt}
              disabled={osmHunting}
            >
              {osmHunting ? "Suche läuft..." : "OSM-Suche starten"}
            </button>
          </div>
        </div>

        {log && (
          <div className="glass-card mt-6 p-5">
            <pre className="text-sm whitespace-pre-wrap text-freiraum-text">{log}</pre>
          </div>
        )}
      </div>
    </>
  );
}

