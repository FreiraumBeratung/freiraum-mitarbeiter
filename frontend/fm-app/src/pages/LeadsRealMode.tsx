import React, { useEffect, useMemo, useState } from "react";

const BACKEND = "http://127.0.0.1:30521";

type ProviderOption = "csv" | "web_permitted" | "handwerksregister" | "meistersuche" | "osm_poi";
type BackendConfig = { real_mode?: boolean } & Record<string, unknown>;
type ExportMap = Record<string, string>;

function pathToFileHref(path: string): string {
  if (!path) return "#";
  const normalized = path.replace(/\\/g, "/");
  if (normalized.startsWith("file:///")) return normalized;
  if (/^[a-zA-Z]:/.test(normalized)) {
    return `file:///${normalized}`;
  }
  return `file:///${normalized}`;
}

export default function LeadsRealMode() {
  const [realMode, setRealMode] = useState(false);
  const [provider, setProvider] = useState<ProviderOption>("csv");
  const [category, setCategory] = useState("shk");
  const [location, setLocation] = useState("Sundern");
  const [log, setLog] = useState<string>("Bereit.");
  const [backendConfig, setBackendConfig] = useState<BackendConfig | null>(null);
  const [lastExport, setLastExport] = useState<ExportMap | null>(null);
  const [syncWithConfig, setSyncWithConfig] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchConfig = async () => {
      try {
        const resp = await fetch(`${BACKEND}/api/system/config`);
        if (!resp.ok) return;
        const json = (await resp.json()) as BackendConfig;
        if (!cancelled) {
          setBackendConfig(json);
          if (syncWithConfig && typeof json.real_mode === "boolean") {
            setRealMode(json.real_mode);
          }
        }
      } catch {
        if (!cancelled) setBackendConfig(null);
      }
    };

    fetchConfig();
    const interval = window.setInterval(fetchConfig, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [syncWithConfig]);

  const run = async () => {
    if (!realMode) {
      setLog("Real Mode ist AUS. Bitte oben aktivieren (REAL_MODE=on in backend/.env).");
      return;
    }
    setLog("Starte echte Lead-Suche …");
    try {
      const resp = await fetch(`${BACKEND}/lead_hunter/run_real`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, location }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        setLog(`Fehler (${resp.status}): ${text}`);
        return;
      }
      const data = await resp.json();
      const exp = (data?.export || {}) as ExportMap;
      setLastExport(exp);
      setLog(
        `Fertig. Exporte: CSV=${exp.csv || "?"}, XLSX=${exp.xlsx || "?"}, JSON=${exp.json || "?"}, Report=${
          exp.md || "?"
        }`
      );
    } catch (error: any) {
      setLog(`Netzwerk/Server-Fehler: ${error?.message || error}`);
    }
  };

  const tip = useMemo(() => {
    switch (provider) {
      case "csv":
        return "CSV-Modus: Datei backend/data/inputs/leads_seed.csv wird eingelesen (Filter nach Kategorie/Ort).";
      case "web_permitted":
        return "Web (Allowlist): Nur Domains aus ALLOWLIST_DOMAINS werden gecrawlt. Rate-Limits & Retry aktiv.";
      case "handwerksregister":
        return "Handwerksregister: nutzt offizielle Registereinträge – Backend-Provider in der .env aktivieren.";
      case "meistersuche":
        return "Meistersuche: greift auf zulässige Meister-Verzeichnisse zu (nur erlaubte Domains).";
      case "osm_poi":
        return "OSM-Modus: Arzt, Steuerberater, Handel, Makler etc. über OpenStreetMap-Taxonomie.";
      default:
        return "";
    }
  }, [provider]);

  const exportLinks = useMemo(() => {
    if (!lastExport) return [];
    return Object.entries(lastExport)
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => ({
        key,
        label: key.toUpperCase(),
        path: value,
        href: pathToFileHref(value),
      }));
  }, [lastExport]);

  return (
    <div style={{ padding: 16, maxWidth: 860, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Leads — Real Mode</h1>
      <p style={{ opacity: 0.8, marginTop: 6 }}>
        Echtes Lead-Hunting mit kontrollierten Quellen. Beachte DSGVO, AGB und robots.txt.
      </p>
      <div style={{ marginTop: 8, fontSize: 13, opacity: 0.8 }}>
        Backend REAL_MODE: {typeof backendConfig?.real_mode === "boolean" ? (
          <strong>{backendConfig.real_mode ? "aktiv" : "aus"}</strong>
        ) : (
          <span>unbekannt</span>
        )}
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
        <section>
          <label style={{ display: "block", opacity: 0.8 }}>Real Mode</label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={realMode}
              onChange={(e) => {
                setRealMode(e.target.checked);
                setSyncWithConfig(false);
              }}
            />
            <span>{realMode ? "EIN" : "AUS"}</span>
          </label>
          <div style={{ opacity: 0.7, marginTop: 4 }}>
            Backend benötigt REAL_MODE=on in <code>backend/.env</code>.
          </div>
        </section>

        <section>
          <label style={{ display: "block", opacity: 0.8 }}>Provider (zur Info)</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as ProviderOption)}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,.18)",
              background: "rgba(255,255,255,.06)",
              color: "#fff",
            }}
          >
            <option value="csv">CSV (lokale Liste)</option>
            <option value="web_permitted">Web (Allowlist)</option>
            <option value="handwerksregister">Handwerksregister</option>
            <option value="meistersuche">Meistersuche</option>
            <option value="osm_poi">ALLE GEWERBE (OSM)</option>
          </select>
          <div style={{ opacity: 0.7, marginTop: 6 }}>{tip}</div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ display: "block", opacity: 0.8 }}>Kategorie</label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(255,255,255,.06)",
                color: "#fff",
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", opacity: 0.8 }}>Ort</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(255,255,255,.06)",
                color: "#fff",
              }}
            />
          </div>
        </section>

        <section style={{ display: "flex", gap: 10 }}>
          <button onClick={run} style={buttonStyle()}>
            Echte Suche starten
          </button>
        </section>

        <pre style={preStyle()}>{log}</pre>

        {exportLinks.length > 0 && (
          <div className="glass" style={{ padding: 12 }}>
            <strong>Letzter Export</strong>
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              {exportLinks.map((item) => (
                <a
                  key={item.key}
                  href={item.href}
                  style={{ color: "#ff8a2b", textDecoration: "none" }}
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.label} → {item.path}
                </a>
              ))}
            </div>
          </div>
        )}

        <section className="glass" style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "rgba(255,115,0,.08)", border: "1px solid rgba(255,115,0,.2)" }}>
          <strong>🆕 OSM Booster verfügbar</strong>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9 }}>
            Neuer Endpoint: <code>/lead_hunter/osm/hunt_async</code>
          </div>
          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>
            Direkter Zugriff auf OSM Overpass API mit Scoring. Unterstützt: SHK, Elektro, Ärzte, Steuerberater, Makler, Handel, Galabau.
          </div>
        </section>

        <section style={{ marginTop: 12, padding: 12, border: "1px solid rgba(255,255,255,.12)", borderRadius: 12 }}>
          <strong>Konfiguration (backend/.env)</strong>
          <pre style={preStyle()}>
{`REAL_MODE=${realMode ? "on" : "off"}
LEAD_PROVIDER=${provider}
CSV_INPUT=backend\\data\\inputs\\leads_seed.csv
ALLOWLIST_DOMAINS=example.com/allowed
RL_MAX_RPS=0.8
RL_MAX_CONCURRENCY=2
RL_RETRY_MAX=2
RL_RETRY_BACKOFF_MS=800`}
          </pre>
          <div style={{ opacity: 0.7 }}>Nach Änderungen Backend neu starten.</div>
        </section>
      </div>
    </div>
  );
}

function buttonStyle(): React.CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,.2)",
    background: "rgba(255,115,0,.16)",
    color: "#fff",
    cursor: "pointer",
  };
}

function preStyle(): React.CSSProperties {
  return {
    padding: 10,
    borderRadius: 8,
    background: "rgba(255,255,255,.06)",
    overflowX: "auto",
    fontSize: 13,
    lineHeight: 1.5,
  };
}


