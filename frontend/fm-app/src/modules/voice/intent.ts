export type Intent =
  | { type: "lead_hunt"; payload: { category: string; location?: string } }
  | { type: "reminder"; payload: { title: string; when?: string } }
  | { type: "cancel" }
  | { type: "unknown"; text: string };

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function parseIntentDE(text: string): Intent {
  const t = norm(text);

  if (/starte.*shk/.test(t) && /sundern/.test(t)) {
    return { type: "lead_hunt", payload: { category: "shk", location: "Sundern" } };
  }

  if (/(erinnere mich|termin).*(morgen).*(11|elf)/.test(t) && /arnsberg/.test(t)) {
    const when = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(11, 0, 0, 0);
      return d.toISOString();
    })();
    return { type: "reminder", payload: { title: "Nachfassung Arnsberg 11:00", when } };
  }

  if (/(abbrechen|stopp|stop|halt)/.test(t)) {
    return { type: "cancel" };
  }

  if (/(suche|finde).*(lead|firma|betriebe|kontakte)/.test(t) || /lead.*suche/.test(t)) {
    let category = "demo";
    if (/shk|sanit[aä]r|heizung|klima/.test(t)) category = "shk";
    else if (/elektro|elektrik/.test(t)) category = "elektro";
    else if (/makler|immobilien/.test(t)) category = "makler";
    else if (/gala|garten|landschaft/.test(t)) category = "gala";
    const m = t.match(/\bin\s+([a-zäöüß\- ]{2,})$/i);
    const location = m ? m[1].trim() : undefined;
    return { type: "lead_hunt", payload: { category, location } };
  }

  if (/erinnere mich|termin|nachfassung/.test(t)) {
    let title = "Nachfassung";
    const m1 = t.match(/morgen(?: um)? (\d{1,2})(?:[:\.](\d{2}))?/);
    let when: string | undefined;
    if (m1) {
      const hh = parseInt(m1[1], 10);
      const mm = m1[2] ? parseInt(m1[2], 10) : 0;
      const dt = new Date();
      dt.setDate(dt.getDate() + 1);
      dt.setHours(hh, mm, 0, 0);
      when = dt.toISOString();
    }
    return { type: "reminder", payload: { title, when } };
  }

  return { type: "unknown", text };
}