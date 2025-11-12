import { PartnerBotBus } from "../../components/PartnerBotBus";

export function routeVoiceIntent(text: string, navigate: (path: string) => void): boolean {
  const lower = text.toLowerCase().trim();

  // Pattern 1: Mail/E-Mail
  const mailPattern = /schreib(e)?\s+.*?(?:mail|e-?mail)\s+an\s+([^\s@]+@[^\s]+)(?:\s+(.+))?/i;
  const mailMatch = text.match(mailPattern);
  if (mailMatch) {
    const to = mailMatch[2] || "";
    const body = mailMatch[3] || "";
    const params = new URLSearchParams();
    if (to) params.set("to", to);
    if (body) params.set("body", body);
    navigate(`/mail/compose?${params.toString()}`);
    PartnerBotBus.poseAndSay("thumbs", "Alles klar – soll ich direkt senden oder vorher zeigen?", 5000);
    return true;
  }

  // Pattern 2: Leads/Kontakte
  if (/(?:lead|leads|kontakte)\s+(?:suchen|anzeigen|zeigen|öffnen)/i.test(lower)) {
    navigate("/kontakte");
    PartnerBotBus.poseAndSay("wave", "Leads werden angezeigt.", 3000);
    return true;
  }

  // Pattern 3: Lead-Radar
  if (/(?:lead-?)?radar/i.test(lower)) {
    navigate("/lead-radar");
    PartnerBotBus.poseAndSay("wave", "Lead-Radar geöffnet.", 3000);
    return true;
  }

  // Pattern 4: Diagnose/Voice/Mikro
  if (/(?:diagnose|voice|mikro|mikrofon)/i.test(lower)) {
    navigate("/voice-diagnostics");
    PartnerBotBus.poseAndSay("wave", "Voice-Diagnostics geöffnet.", 3000);
    return true;
  }

  // Pattern 5: Control/Übersicht/Start
  if (/(?:control|übersicht|start|hauptmenü)/i.test(lower)) {
    navigate("/control-center");
    PartnerBotBus.poseAndSay("wave", "Control Center geöffnet.", 3000);
    return true;
  }

  // Pattern 6: Exporte
  if (/(?:export|exporte|daten\s+exportieren)/i.test(lower)) {
    navigate("/exports");
    PartnerBotBus.poseAndSay("wave", "Exporte geöffnet.", 3000);
    return true;
  }

  return false;
}

