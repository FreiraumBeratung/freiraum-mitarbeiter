import React, { useEffect, useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const BACKEND = "http://127.0.0.1:30521";

export default function LeadsOSMResults() {
  const location = useLocation();
  const navigate = useNavigate();
  const [allLeads, setAllLeads] = useState<any[]>([]);
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  
  // Filter State
  const [scoreMin, setScoreMin] = useState(0);
  const [onlyWithEmail, setOnlyWithEmail] = useState(false);
  const [onlyWithPhone, setOnlyWithPhone] = useState(false);
  
  // Filtered Leads
  const leads = useMemo(() => {
    return allLeads.filter((lead) => {
      if (lead.score < scoreMin) return false;
      if (onlyWithEmail && !lead.email) return false;
      if (onlyWithPhone && !lead.phone) return false;
      return true;
    });
  }, [allLeads, scoreMin, onlyWithEmail, onlyWithPhone]);

  useEffect(() => {
    // Get data from navigation state or fetch
    if (location.state?.result) {
      setAllLeads(location.state.result.leads || []);
      setCategory(location.state.result.category || "");
      setCity(location.state.result.city || "");
    }
  }, [location]);

  async function handleExport() {
    if (leads.length === 0) {
      alert("Keine Leads zum Exportieren");
      return;
    }
    
    setExporting(true);
    try {
      // Create export request
      const resp = await fetch(`${BACKEND}/lead_hunter/osm/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads,
          category,
          city,
        }),
      });
      
      if (resp.ok) {
        // Get filename from Content-Disposition header or generate one
        const contentDisposition = resp.headers.get("Content-Disposition");
        let filename = "osm_leads_export.xlsx";
        if (contentDisposition) {
          const matches = contentDisposition.match(/filename="?(.+)"?/);
          if (matches) filename = matches[1];
        }
        
        // Download blob
        const blob = await resp.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        const data = await resp.json().catch(() => ({}));
        alert(`Export-Fehler: ${data.error || "Unbekannter Fehler"}`);
      }
    } catch (e: any) {
      alert(`Export-Fehler: ${e.message}`);
    } finally {
      setExporting(false);
    }
  }
  
  async function handleExportPdf() {
    if (leads.length === 0) {
      alert("Keine Leads zum Exportieren");
      return;
    }
    
    setExportingPdf(true);
    try {
      const resp = await fetch(`${BACKEND}/lead_hunter/osm/export_pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads,
          category,
          city,
        }),
      });
      
      if (resp.ok) {
        const contentDisposition = resp.headers.get("Content-Disposition");
        let filename = "osm_leads_report.pdf";
        if (contentDisposition) {
          const matches = contentDisposition.match(/filename="?(.+)"?/);
          if (matches) filename = matches[1];
        }
        
        const blob = await resp.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        const data = await resp.json().catch(() => ({}));
        alert(`PDF-Export-Fehler: ${data.error || "Unbekannter Fehler"}`);
      }
    } catch (e: any) {
      alert(`PDF-Export-Fehler: ${e.message}`);
    } finally {
      setExportingPdf(false);
    }
  }

  // Count leads with lat/lon for map badge
  const leadsWithGeo = useMemo(() => {
    return leads.filter((lead) => lead.lat && lead.lon).length;
  }, [leads]);
  
  return (
    <div style={{ padding: 18, maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h1 className="title" style={{ fontSize: 24 }}>
            OSM Lead-Ergebnisse
          </h1>
          <div className="sub">
            {category && city ? `${category.toUpperCase()} in ${city}` : "Leads"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="fr-btn" onClick={handleExport} disabled={exporting || leads.length === 0}>
            {exporting ? "Exportiert..." : "📊 Excel"}
          </button>
          <button className="fr-btn" onClick={handleExportPdf} disabled={exportingPdf || leads.length === 0}>
            {exportingPdf ? "Exportiert..." : "📄 PDF"}
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="glass" style={{ padding: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 13, opacity: 0.8 }}>Score Min:</label>
            <input
              type="range"
              min="0"
              max="100"
              value={scoreMin}
              onChange={(e) => setScoreMin(Number(e.target.value))}
              style={{ width: 100 }}
            />
            <span style={{ fontSize: 12, minWidth: 30 }}>{scoreMin}</span>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={onlyWithEmail}
              onChange={(e) => setOnlyWithEmail(e.target.checked)}
            />
            <span style={{ fontSize: 13 }}>Nur mit E-Mail</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={onlyWithPhone}
              onChange={(e) => setOnlyWithPhone(e.target.checked)}
            />
            <span style={{ fontSize: 13 }}>Nur mit Telefon</span>
          </label>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            {leadsWithGeo > 0 && (
              <span className="badge" style={{ fontSize: 11 }}>
                🗺️ {leadsWithGeo} mit Geo-Daten
              </span>
            )}
            <span className="badge">
              Gefiltert: {leads.length} / {allLeads.length}
            </span>
          </div>
        </div>
      </div>

      <div className="glass" style={{ padding: 12, marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span className="badge">Gefunden: {allLeads.length} Leads (gefiltert: {leads.length})</span>
          <button
            className="fr-btn"
            onClick={() => navigate("/control-center")}
            style={{ fontSize: 12, padding: "6px 10px" }}
          >
            Zurück
          </button>
        </div>

        <div style={{ overflow: "auto", maxHeight: "70vh" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,.2)" }}>
                <th style={{ textAlign: "left", padding: 8 }}>Firma</th>
                <th style={{ textAlign: "left", padding: 8 }}>Ort</th>
                <th style={{ textAlign: "left", padding: 8 }}>Telefon</th>
                <th style={{ textAlign: "left", padding: 8 }}>E-Mail</th>
                <th style={{ textAlign: "left", padding: 8 }}>Website</th>
                <th style={{ textAlign: "left", padding: 8 }}>Score</th>
                <th style={{ textAlign: "left", padding: 8 }}>Quelle</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead, i) => (
                <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,.1)" }}>
                  <td style={{ padding: 8 }}>{lead.company || ""}</td>
                  <td style={{ padding: 8 }}>{lead.city || ""}</td>
                  <td style={{ padding: 8 }}>{lead.phone || ""}</td>
                  <td style={{ padding: 8 }}>{lead.email || ""}</td>
                  <td style={{ padding: 8 }}>
                    {lead.website ? (
                      <a href={lead.website} target="_blank" rel="noreferrer" style={{ color: "#ff7300" }}>
                        {lead.website}
                      </a>
                    ) : (
                      ""
                    )}
                  </td>
                  <td style={{ padding: 8 }}>
                    <span className="badge">{lead.score || 0}</span>
                  </td>
                  <td style={{ padding: 8 }}>
                    <span className="badge" style={{ fontSize: 10 }}>
                      {lead.source || "osm"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

