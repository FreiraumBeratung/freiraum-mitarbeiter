import React from "react";

const BACKEND = "http://127.0.0.1:30521";

export default function LeadRadar() {
  const [rows, setRows] = React.useState<any[]>([]);
  const [scored, setScored] = React.useState<any[]>([]);
  const [log, setLog] = React.useState("");

  async function pickAndScore() {
    try {
      const r = await fetch(`${BACKEND}/api/exports/list`).then((x) => x.json());
      const last = r?.files?.find((f: any) => f.name.endsWith(".json"));
      if (!last) {
        setLog("Kein Export gefunden.");
        return;
      }
      const data = await fetch(`${BACKEND}/api/exports/${last.name}`).then((x) => x.json());
      setRows(data || []);
      const scoredResp = await fetch(`${BACKEND}/api/lead_radar/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data || []),
      }).then((x) => x.json());
      setScored(scoredResp?.items || []);
    } catch (e) {
      setLog(`Fehler beim Laden/Scoring: ${e}`);
    }
  }

  React.useEffect(() => {
    pickAndScore();
  }, []);

  return (
    <div style={{ padding: 18, maxWidth: 1400, margin: "0 auto" }}>
      <h1 className="title" style={{ fontSize: 24 }}>
        Lead-Radar
      </h1>
      <div className="sub">Scoring deiner zuletzt exportierten Leads</div>
      <div style={{ marginTop: 10 }}>
        <button className="fr-btn" onClick={pickAndScore}>
          Neu laden & scoren
        </button>
      </div>
      {log && (
        <pre className="glass" style={{ padding: 10, marginTop: 10 }}>
          {log}
        </pre>
      )}
      <div
        className="glass"
        style={{ marginTop: 12, padding: 12, overflow: "auto", maxHeight: "60vh" }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Firma</th>
              <th>Ort</th>
              <th>Kat.</th>
              <th>Telefon</th>
              <th>E-Mail</th>
              <th>Website</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {scored.map((r, i) => (
              <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,.1)" }}>
                <td>{r.company || ""}</td>
                <td>{r.city || ""}</td>
                <td>{r.category || ""}</td>
                <td>{r.phone || ""}</td>
                <td>{r.email || ""}</td>
                <td>{r.website || ""}</td>
                <td>
                  <span className="badge">{r.score}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


