// === FILE: src/voice/intent.js ===
import { api } from "../api/client";

// Normalisiere @-Zeichen in Voice-Input
function normalizeEmail(text) {
  // Ersetze "at" zwischen E-Mail-Teilen durch "@"
  // z.B. "freiraumberatung at web.de" -> "freiraumberatung@web.de"
  let normalized = text;
  
  // Pattern: Wort + "at" + Domain (z.B. "web.de", "gmail.com")
  normalized = normalized.replace(/\b(\w+)\s+at\s+(\w+\.\w+)\b/gi, '$1@$2');
  
  // Pattern: Wort + "at" + Domain ohne Leerzeichen
  normalized = normalized.replace(/(\w+)\s*at\s*(\w+\.\w+)/gi, '$1@$2');
  
  // Pattern: "at" als Wort zwischen zwei Wörtern (z.B. "test at example dot com")
  normalized = normalized.replace(/\b(\w+)\s+at\s+(\w+)\s+dot\s+(\w+)\b/gi, '$1@$2.$3');
  
  return normalized;
}

export async function routeIntent(text, ctx){
  // Normalisiere E-Mail-Adressen
  const normalizedText = normalizeEmail(text);
  const t = (normalizedText||"").toLowerCase();
  
  // Extrahiere E-Mail-Adresse falls vorhanden
  const emailMatch = normalizedText.match(/([\w.-]+@[\w.-]+\.\w+)/i);
  const extractedEmail = emailMatch ? emailMatch[1] : null;
  
  // E-Mail senden
  if(t.includes("mail") || t.includes("schreibe") || t.includes("sende")) {
    if(extractedEmail) {
      // E-Mail mit extrahierter Adresse
      if(t.includes("testmail") || t.includes("test")) {
        return api.mail.sendTest(extractedEmail);
      }
      // Generische Mail-Funktion würde hier kommen
      return {ok:true, hint:`E-Mail an ${extractedEmail} vorbereitet.`};
    }
    if(t.includes("testmail") || t.includes("test")) {
      return api.mail.sendTest(ctx?.email || "freiraumberatung@web.de");
    }
  }
  
  if(t.includes("kpi") || t.includes("report") || t.includes("zeig kpi")) {
    return api.reports.kpis();
  }
  
  if(t.includes("angebot") && (t.includes("demo") || t.includes("erzeuge"))) {
    return api.offers.draft({
      customer:"Demo GmbH",
      items:[{name:"Artikel Demo",qty:1,unit_price:100.0}]
    });
  }
  
  if(t.includes("lead") && (t.includes("suche") || t.includes("jage") || t.includes("hunt"))) {
    // Default Lead-Hunt Parameter
    return api.leadHunter.hunt({
      category: "shk",
      location: "sauerland",
      count: 20,
      save_to_db: true,
      export_excel: false
    }).catch(err => {
      return {ok:false, hint:"Lead-Hunt fehlgeschlagen. Bitte andere Parameter verwenden oder im LeadsHunter-Panel manuell suchen."};
    });
  }
  
  if(t.includes("lead") && t.includes("import")) {
    return {ok:true, hint:"Bitte Datei im Leads-Panel hochladen."};
  }
  
  if(t.includes("follow") || t.includes("nachfassen")) {
    return api.followups.due();
  }
  
  if(t.includes("essen") || t.includes("abends")) {
    return {tip:"Vorschlag: gegrilltes Hähnchen & Salat (low carb)."};
  }
  
  return {ok:false, hint:"Ich habe dich nicht ganz verstanden. Sag z. B. 'Erzeuge Demo-Angebot', 'Sende Testmail an freiraumberatung@web.de' oder 'Zeig KPIs'."};
}
// === END FILE ===





