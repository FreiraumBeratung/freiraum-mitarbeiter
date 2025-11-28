// frontend/fm-app/src/utils/email_text_utils.ts

/**
 * Bereinigt KI-Antworten, damit nur der eigentliche E-Mail-Text in den Body kommt.
 * Entfernt Meta-Phrasen wie "Natürlich!", "Hier ist eine mögliche Antwort:", etc.
 */
export function cleanEmailBodyFromAi(raw: string): string {
  if (!raw) return "";

  let text = raw.trim();

  // Häufige Phrasen am Anfang entfernen
  const PREFIXES = [
    "natürlich!",
    "natürlich.",
    "natürlich,",
    "gerne!",
    "gerne.",
    "gerne,",
    "hier ist eine mögliche antwort:",
    "hier ist eine mögliche formulierung:",
    "hier ist ein möglicher text:",
    "hier ist der text:",
    "hier ist eine formulierung:",
    "hier ist eine antwort:",
    "falls du noch etwas spezifisches im sinn hast,",
    "falls du noch etwas anpassen möchtest,",
    "falls du noch fragen hast,",
    "falls du noch etwas brauchst,",
    "wenn du noch fragen hast,",
    "wenn du noch etwas brauchst,",
    "wenn du noch etwas anpassen möchtest,",
  ];

  const lower = text.toLowerCase();

  for (const prefix of PREFIXES) {
    if (lower.startsWith(prefix)) {
      // schneide bis nach dem Prefix + evtl. nachfolgendem Zeilenumbruch
      const idx = lower.indexOf(prefix) + prefix.length;
      text = text.slice(idx).trimStart();
      break;
    }
  }

  // Wenn es deutsche Anführungszeichen gibt, nimm nur den Inhalt dazwischen
  const startQuote = text.indexOf("\u201E"); // „ (opening)
  const endQuote = text.lastIndexOf("\u201D"); // " (closing)
  if (startQuote !== -1 && endQuote !== -1 && endQuote > startQuote) {
    text = text.slice(startQuote + 1, endQuote).trim();
  }

  // Sicherheitshalber überflüssige führende/trailing Leerzeilen entfernen
  text = text.replace(/^\s+|\s+$/g, "");

  return text;
}

