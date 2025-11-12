import React from "react";
import { useNavigate } from "react-router-dom";
import Backdrop from "../components/layout/Backdrop";
import GlassCard from "../components/ui/GlassCard";
import SectionHeader from "../components/ui/SectionHeader";

const BACKEND = "http://127.0.0.1:30521";

export default function Exports() {
  const navigate = useNavigate();

  const handleExport = async (type: "csv" | "pdf" | "xlsx" | "json") => {
    try {
      const url = `${BACKEND}/api/reports/export.${type}`;
      window.location.href = url;
    } catch (error) {
      console.error("Export error:", error);
    }
  };

  return (
    <>
      <Backdrop />
      <div className="relative z-10" style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Exporte</h1>
          <p className="text-white/60">Daten exportieren in verschiedenen Formaten</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="glass-card p-6">
            <SectionHeader title="CSV Export" subtitle="Komma-getrennte Werte" />
            <button
              onClick={() => handleExport("csv")}
              className="fr-btn fr-pill w-full mt-4 px-4 py-3 bg-freiraum-orange/20 hover:bg-freiraum-orange/30 border-freiraum-orange/40"
            >
              CSV herunterladen
            </button>
          </div>

          <div className="glass-card p-6">
            <SectionHeader title="PDF Export" subtitle="Portable Document Format" />
            <button
              onClick={() => handleExport("pdf")}
              className="fr-btn fr-pill w-full mt-4 px-4 py-3 bg-freiraum-orange/20 hover:bg-freiraum-orange/30 border-freiraum-orange/40"
            >
              PDF herunterladen
            </button>
          </div>

          <div className="glass-card p-6">
            <SectionHeader title="XLSX Export" subtitle="Excel-kompatibles Format" />
            <button
              onClick={() => handleExport("xlsx")}
              className="fr-btn fr-pill w-full mt-4 px-4 py-3 bg-freiraum-orange/20 hover:bg-freiraum-orange/30 border-freiraum-orange/40"
            >
              XLSX herunterladen
            </button>
          </div>

          <div className="glass-card p-6">
            <SectionHeader title="JSON Export" subtitle="Strukturierte Daten" />
            <button
              onClick={() => handleExport("json")}
              className="fr-btn fr-pill w-full mt-4 px-4 py-3 bg-freiraum-orange/20 hover:bg-freiraum-orange/30 border-freiraum-orange/40"
            >
              JSON herunterladen
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

