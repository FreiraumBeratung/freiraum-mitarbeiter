export type Wizard3OneShotPayload = {
  rawText: string; // komplette Original-Sprachnachricht
};

export type VoiceIntent =
  | { type: "navigate"; target: "control-center" | "lead-radar" | "leads" | "mail-compose" | "voice-diagnostics" }
  | { type: "email-compose"; toRaw?: string; to?: string; subjectHint?: string; bodyHint?: string }
  | { type: "wizard3-one-shot"; payload: Wizard3OneShotPayload }
  | { type: "wizard2-edit-anrede"; newAnrede: string }
  | { type: "wizard2-edit-subject"; newSubject: string }
  | { type: "wizard2-rewrite-body"; instruction: string }
  | { type: "wizard2-edit-anrede-and-rewrite"; newAnrede: string; instruction: string }
  | { type: "email-send" }
  | { type: "email-preview" }
  | { type: "leads-filter"; range: "today" | "yesterday" | "week" }
  | { type: "last-action" }
  | { type: "ai-chat"; query: string }
  | { type: "unknown" };

function normalize(text: string) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const matchAny = (text: string, candidates: string[]) => candidates.some((c) => text.includes(c));

/**
 * Extrahiert eine E-Mail-Adresse aus einem Text per Regex.
 * Gibt die erste gefundene E-Mail-Adresse zurück oder null.
 */
function extractEmailAddress(text: string): string | null {
  if (!text) return null;
  const match = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0] : null;
}

function normalizeRecipient(raw: string): string {
  const original = (raw || "").trim();
  if (!original) return original;

  const lowered = original.toLowerCase();

  // Nur anfassen, wenn es nach E-Mail klingt
  if (
    !lowered.includes(" at ") &&
    !lowered.includes("@") &&
    !lowered.includes(" punkt ")
  ) {
    return original;
  }

  let s = lowered;

  s = s.replace(/\s+at\s+/g, "@");

  s = s.replace(/\s+punkt\s+de\b/g, ".de");
  s = s.replace(/\s+punkt\s+com\b/g, ".com");
  s = s.replace(/\s+punkt\s+net\b/g, ".net");
  s = s.replace(/\s+punkt\s+org\b/g, ".org");

  s = s.replace(/\s+punkt\s+/g, ".");

  s = s.replace(/\s+/g, "");

  return s;
}

/**
 * Prüft, ob ein Sprachbefehl eine E-Mail mit Inhalt beschreibt (Wizard3-OneShot).
 * Erkennt sowohl klassische Befehle ("Schreibe X eine Mail wegen Y") als auch lockere Formulierungen
 * ("Meine Freiraum Beratung mit web.de eine Mail. Es geht um Pizza.").
 */
function detectWizard3OneShot(raw: string, normalized: string): VoiceIntent | null {
  const n = normalized.trim();

  // Hilfsflags für die Erkennung
  const hasMailKeyword =
    n.includes(" mail") ||
    n.includes("email") ||
    n.includes("e mail") ||
    n.includes("eine mail");

  // Varianten, wie sie im Log vorkommen:
  // - "freiraum beratung at web punkt d"
  // - "freiraum beratung mit web de"
  // - "freiraumberatung@web.de"
  const hasFreiraumAddress =
    n.includes("freiraum beratung") ||
    n.includes("freiraumberatung") ||
    n.includes("freiraum, beratung") ||
    n.includes("freiraum beratung mit web de") ||
    n.includes("freiraum beratung mit web punkt d") ||
    n.includes("freiraum beratung at web punkt d") ||
    n.includes("freiraumberatung web de") ||
    n.includes("freiraumberatung@web.de") ||
    n.includes("freiraum beratung mit web punkt de");

  // Klassische „schreib(e) eine Mail"-Formulierungen
  const hasCommandVerb =
    n.startsWith("schreibe ") ||
    n.startsWith("schreib ") ||
    n.includes("schreibe eine mail") ||
    n.includes("schreib eine mail") ||
    n.includes("schreib mal eine mail");

  // Inhaltliche Hinweise (zeigt, dass es um eine Mail mit Inhalt geht)
  const hasContentHint =
    /\bwegen\b/.test(n) ||
    /\bsag\b/.test(n) ||
    /\bfrag\b/.test(n) ||
    /\bdass\b/.test(n) ||
    /\btermin\b/.test(n) ||
    /\bangebot\b/.test(n) ||
    /\bes geht um\b/.test(n) ||
    /\bgeht um\b/.test(n) ||
    /\bum\b/.test(n);

  // STARKES Muster: klassischer Befehl
  const strongPattern = hasMailKeyword && hasFreiraumAddress && hasCommandVerb && hasContentHint;

  // ENTSPANNTERES Muster: lockere Formulierungen wie
  // "meine freiraum beratung mit web de eine mail ..."
  // oder "freiraum beratung mit web de eine mail. es geht um pizza."
  const relaxedPattern =
    hasMailKeyword &&
    hasFreiraumAddress &&
    hasContentHint &&
    !hasCommandVerb; // Kein explizites "schreibe", aber trotzdem Mail + Adresse + Inhalt

  if (!strongPattern && !relaxedPattern) {
    return null;
  }

  // Wenn wir hier sind, behandeln wir den Befehl als Wizard3-OneShot-Mail
  console.log("[fm-voice] detectWizard3OneShot: Wizard3-OneShot erkannt für:", raw);

  return {
    type: "wizard3-one-shot",
    payload: {
      rawText: raw.trim(),
    },
  };
}

/**
 * Extrahiert eine Anrede aus dem rohen Text.
 * Beispiele: "Anrede auf Guten Tag" -> "Guten Tag"
 */
function extractGreetingFromRaw(raw: string): string | null {
  const text = raw.trim();

  // Muster: "Anrede auf X", "Anrede in X", "Anrede zu X"
  // Wir stoppen bei Komma, Punkt, "und" oder Satzende.
  const re = /anrede\s+(?:auf|in|zu)\s+(.+?)(?:,|\.|\bund\b|$)/i;
  const match = text.match(re);
  if (!match) {
    return null;
  }

  let greeting = match[1].trim();

  // Beispiel: "Mahlzeit" oder "Guten Tag"
  // Eventuelle Rest-Wörter wie "und" am Ende entfernen:
  greeting = greeting.replace(/\bund\b.*$/i, "").trim();

  if (!greeting) {
    return null;
  }

  // Ersten Buchstaben groß schreiben (Rest so lassen)
  greeting = greeting[0].toUpperCase() + greeting.slice(1);

  return greeting;
}

/**
 * Extrahiert einen Betreff aus dem rohen Text.
 * Beispiele: "Betreff auf Termin" -> "Termin"
 */
function extractSubjectFromRaw(raw: string): string | null {
  const text = raw.trim();

  // Muster: "Betreff auf X" oder "Betreff zu X"
  const re = /betreff\s+(?:auf|zu)\s+(.+?)(?:,|\.|$)/i;
  const match = text.match(re);
  if (!match) {
    return null;
  }

  let subject = match[1].trim();

  if (!subject) {
    return null;
  }

  // Punkt am Ende entfernen
  subject = subject.replace(/[.!?]\s*$/g, "").trim();

  // ersten Buchstaben groß machen (z.B. "termin" -> "Termin")
  subject = subject[0].toUpperCase() + subject.slice(1);

  return subject;
}

/**
 * Extrahiert die Anweisung für Text-Umschreibung aus dem rohen Text.
 * Findet Marker wie "mach den text" und extrahiert alles danach.
 */
function extractInstructionFromRaw(raw: string): string | null {
  const lower = raw.toLowerCase();

  const markers = [
    "mach den text",
    "macht den text",
    "mach mal den text",
    "mache den text",
    "mach den text ein bisschen",
    "macht den text ein bisschen",
    "füge hinzu",
    "fuge hinzu",
    "füge noch hinzu",
    "erwähne",
    "erwaehne",
    "erwähnen",
    "erwaehnen",
    "schreib die mail",
    "schreibe die mail",
    "schreib die e mail",
    "schreib die email"
  ];

  let idx = -1;
  for (const marker of markers) {
    const i = lower.indexOf(marker);
    if (i !== -1 && (idx === -1 || i < idx)) {
      idx = i;
    }
  }

  // Kein Marker gefunden -> keine klare Instruktion
  if (idx === -1) {
    return null;
  }

  let instruction = raw.slice(idx).trim();

  // Typische Füllwörter am Anfang entfernen
  instruction = instruction.replace(/^(und\s+)?/i, "").trim();

  // Punkt/Satzzeichen am Ende entfernen
  instruction = instruction.replace(/[.!?]\s*$/g, "").trim();

  return instruction || null;
}

/**
 * Hilfsfunktion: Ersten Buchstaben groß schreiben.
 */
function capitalizeFirstWord(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Normalisiert eine Anrede-Phrase: Extrahiert nur die eigentliche Anrede,
 * max. 3 Wörter, ohne "und/aber" usw.
 * Erkennt konkrete Grußformen wie "Guten Tag", "Hallo", etc.
 */
function normalizeGreeting(input: string): string | null {
  const s = input.toLowerCase().trim();
  
  // Nur konkrete Grußformen erkennen, keine Stilbeschreibungen wie "locker", "formell", etc.
  // z.B. "guten morgen macht den text aber kurz" → "guten morgen"
  const candidates: { key: string; value: string }[] = [
    { key: "guten tag", value: "Guten Tag" },
    { key: "guten morgen", value: "Guten Morgen" },
    { key: "guten abend", value: "Guten Abend" },
    { key: "hallo", value: "Hallo" },
    { key: "moin", value: "Moin" },
    { key: "mahlzeit", value: "Mahlzeit" },
    { key: "servus", value: "Servus" },
    { key: "hi", value: "Hi" },
    { key: "hey", value: "Hey" },
  ];

  for (const c of candidates) {
    if (s.startsWith(c.key)) {
      return c.value;
    }
  }

  // Keine bekannte Grußform erkannt -> null zurückgeben
  // (z.B. "locker", "formell", "ernst" sind keine Grußformen)
  return null;
}

/**
 * Erkennt Wizard2-Intents (Anrede/Betreff/Text bearbeiten).
 * Robuste Erkennung für umgangssprachliche Formulierungen.
 * 
 * Unterstützt:
 * - Betreff-Änderungen ("ändere den Betreff auf X")
 * - Anrede-Änderungen ("ändere die Anrede auf X" oder "die Anrede auf X")
 * - Text-Umschreibungen ("mach den Text lockerer")
 * - Kombinationen ("ändere die Anrede auf X und mach den Text Y")
 * - Löschen des gesamten Textes ("lösche den gesamten Text")
 * - Unterscheidung zwischen konkreter Anrede vs. Stilbeschreibung
 */
function detectWizard2Intent(normalized: string, raw: string): VoiceIntent | null {
  // 1) Normalisieren
  let n = normalized.toLowerCase().trim();
  const rawTrimmed = raw.trim();

  // Prüfung: Termin-Intent darf NICHT auslösen, wenn E-Mail-Kontext vorhanden ist
  const lower = n;
  const isEmailContext =
    lower.includes("mail") ||
    lower.includes("e-mail") ||
    lower.includes("email") ||
    lower.includes("schreibe") ||
    lower.includes("schreib");
  const mentionsTermin = lower.includes("termin");

  if (mentionsTermin && isEmailContext) {
    // Termin im E-Mail-Kontext -> Wizard3 soll übernehmen, nicht Wizard2
    return null;
  }

  // typische STT-Fehler glätten
  n = n.replace(/\bdie andere\b/g, "die anrede"); // "die andere" -> "die anrede"
  n = n.replace(/\bandere die andere\b/g, "ändere die anrede");
  // Optional: "Anträge" -> "Anrede" (STT-Fehler)
  n = n.replace(/\bantrage\b/g, "anrede");
  n = n.replace(/\banträge\b/g, "anrede");

  // 2) Löschen des gesamten Textes (ganz früh prüfen)
  if (n.includes("losche den gesamten text") || n.includes("lösche den gesamten text")) {
    console.log("[fm-voice] detectWizard2Intent -> wizard2-rewrite-body (Lösche gesamten Text):", rawTrimmed);
    return {
      type: "wizard2-rewrite-body",
      instruction: rawTrimmed, // volle Original-Aussage als Anweisung
    };
  }

  // 3) --- Betreff ändern ---
  // Beispiele aus Logs:
  // - "ändere den betreff auf termin morgen"
  // - "andere den betreff zu pizza"
  // - "änder den betreff in xyz"
  // - "mach den betreff zu pizza"
  // - "mach den betreff auf xyz"

  // Variante 1: "ändere/ander/andere den betreff ..."
  {
    const subjectMatch = n.match(
      /(ander|ändere|aendere|änder|andere)\s+den\s+betreff\s*(?:auf|zu|in)?\s+(.+)/
    );
    if (subjectMatch) {
      const subjectRaw = subjectMatch[2].trim();
      if (subjectRaw) {
        // Entferne Satzzeichen am Ende
        const cleanSubject = subjectRaw.replace(/[.,!?]\s*$/, "").trim();
        console.log("[fm-voice] detectWizard2Intent -> wizard2-edit-subject:", cleanSubject);
        return {
          type: "wizard2-edit-subject",
          newSubject: cleanSubject,
        };
      }
    }
  }

  // Variante 2: "mach den betreff ..."
  {
    const subjectMatch2 = n.match(
      /mach\s+den\s+betreff\s*(?:auf|zu|in)?\s+(.+)/
    );
    if (subjectMatch2) {
      const subjectRaw = subjectMatch2[1].trim();
      if (subjectRaw) {
        // Entferne Satzzeichen am Ende
        const cleanSubject = subjectRaw.replace(/[.,!?]\s*$/, "").trim();
        console.log("[fm-voice] detectWizard2Intent -> wizard2-edit-subject (mach):", cleanSubject);
        return {
          type: "wizard2-edit-subject",
          newSubject: cleanSubject,
        };
      }
    }
  }

  // 4) --- Text komplett oder teilweise ändern ---
  // Beispiel:
  // "ändere den text komplett in eine kleine geschichte"
  // "ander den text in ..."
  // "andere den text komplett ..."
  if (n.startsWith("andere den text") || n.startsWith("änder den text") || n.startsWith("ändere den text")) {
    console.log("[fm-voice] detectWizard2Intent -> wizard2-rewrite-body (Text ändern):", rawTrimmed);
    return {
      type: "wizard2-rewrite-body",
      instruction: rawTrimmed,
    };
  }

  // 5) Keywords für Text-Änderungen
  const textKeywords = [
    "mach den text",
    "macht den text",
    "den text etwas",
    "den text sehr",
    "text lockerer",
    "text formell",
    "text formeller",
    "text lustiger",
    "text kurzer",
    "text kurz",
    "füge hinzu",
    "fuge hinzu",
    "erwähne",
    "erwahne",
    "erzähle einen witz",
    "erzahle einen witz",
    "witz im text",
    "lustige geschichte",
    "sehr lustige geschichte",
  ];

  const hasTextRewriteKeyword = textKeywords.some((k) => n.includes(k));

  // 6) --- "Schreib in die Anrede X und in den Text ..." ---
  {
    const m = n.match(/schreib in die anrede (.+?) und in den text (.+)/);
    if (m) {
      const anredeRaw = m[1].trim();
      const greeting = normalizeGreeting(anredeRaw);
      const instruction = rawTrimmed;

      if (greeting) {
        console.log("[fm-voice] detectWizard2Intent -> wizard2-edit-anrede-and-rewrite (Schreib in die Anrede):", { newAnrede: greeting, instruction });
        return {
          type: "wizard2-edit-anrede-and-rewrite",
          newAnrede: greeting,
          instruction,
        };
      }
      // falls kein gültiges Greeting -> späterer rewrite-body-Fallback
    }
  }

  // 7) --- "Mach als Anrede Guten Morgen, lösche den bestehenden Text ..." ---
  {
    const m = n.match(/mach als anrede (.+?),(.*)/);
    if (m) {
      const anredeRaw = m[1].trim();
      const greeting = normalizeGreeting(anredeRaw);
      const instruction = rawTrimmed;

      if (greeting) {
        console.log("[fm-voice] detectWizard2Intent -> wizard2-edit-anrede-and-rewrite (Mach als Anrede mit Komma):", { newAnrede: greeting, instruction });
        return {
          type: "wizard2-edit-anrede-and-rewrite",
          newAnrede: greeting,
          instruction,
        };
      }
    }
  }

  // 8) --- "Mach als Anrede Guten Morgen ..." (ohne Komma) ---
  {
    const m = n.match(/mach als anrede (guten morgen|guten tag|guten abend|moin|mahlzeit|hallo|servus|hi|hey)(.*)/);
    if (m) {
      const anredeRaw = m[1].trim();
      const greeting = normalizeGreeting(anredeRaw);
      const instruction = rawTrimmed;

      if (greeting) {
        console.log("[fm-voice] detectWizard2Intent -> wizard2-edit-anrede-and-rewrite (Mach als Anrede ohne Komma):", { newAnrede: greeting, instruction });
        return {
          type: "wizard2-edit-anrede-and-rewrite",
          newAnrede: greeting,
          instruction,
        };
      }
    }
  }

  // 9) --- Stil-Anrede + Text-Stil ohne konkrete Grußform ---
  // Beispiel: "mach die anrede locker und den text ernst"
  // -> KEINE konkrete Grußform ("Locker" ist kein Greeting)
  //    deshalb: nur Rewrite
  const matchAnredeTextStyle = n.match(/mach die anrede (.+?) und den text (.+)/);
  if (matchAnredeTextStyle) {
    const anredePart = matchAnredeTextStyle[1].trim(); // z.B. "locker"
    const textPart = matchAnredeTextStyle[2].trim();   // z.B. "ernst"

    const greeting = normalizeGreeting(anredePart);
    if (!greeting) {
      // Stil-Anweisung, keine echte Anrede -> Rewrite des gesamten Textes
      console.log("[fm-voice] detectWizard2Intent -> wizard2-rewrite-body (Stil-Anrede ohne konkrete Grußform):", rawTrimmed);
      return {
        type: "wizard2-rewrite-body",
        instruction: rawTrimmed,
      };
    }
    // Falls echte Anrede erkannt wurde (z.B. "mach die anrede guten tag und den text ernst"),
    // wird das später in der Anrede-Basis-Match-Logik behandelt
  }

  // 10) --- Anrede + Text gleichzeitig ändern ---
  // Beispiele:
  // - "ändere die anrede auf mahlzeit und füge dann im text hinzu, dass ich telefonisch erreichbar bin"
  // - "ändere die anrede auf guten tag und erwähne im text, dass ich telefonisch erreichbar bin"
  {
    const m = n.match(
      /(andere|ändere|aendere)\s+die\s+anrede\s+auf\s+(.+?)\s+und\s+(.+)/
    );
    if (m) {
      const greetingRaw = m[2].trim();
      const greeting =
        normalizeGreeting(greetingRaw) ||
        (greetingRaw.length > 0
          ? greetingRaw.charAt(0).toUpperCase() + greetingRaw.slice(1)
          : greetingRaw);

      const instruction = rawTrimmed;

      if (greeting) {
        console.log("[fm-voice] detectWizard2Intent -> wizard2-edit-anrede-and-rewrite (Anrede+Text-Kombi):", { newAnrede: greeting, instruction });
        return {
          type: "wizard2-edit-anrede-and-rewrite",
          newAnrede: greeting,
          instruction,
        };
      }
      // Falls greeting nicht erkannt werden kann, kümmert sich späterer Fallback
    }
  }

  // 11) --- Stil-Änderung für Anrede + Text (verschiedene Varianten) ---
  // Beispiele:
  // - "mache die anrede und text formeller"
  // - "mach die anrede und text formeller"
  // - "mache den text und die anrede formeller"
  // - "mach den text und die anrede formeller"
  // - "mach die texte und die anrede formeller"
  if (
    n.includes("mache die anrede und text formeller") ||
    n.includes("mach die anrede und text formeller") ||
    n.includes("mache den text und die anrede formeller") ||
    n.includes("mach den text und die anrede formeller") ||
    n.includes("mach die texte und die anrede formeller")
  ) {
    console.log("[fm-voice] detectWizard2Intent -> wizard2-rewrite-body (Stil: Anrede+Text formeller):", rawTrimmed);
    return {
      type: "wizard2-rewrite-body",
      instruction: rawTrimmed,
    };
  }

  // 12) Spezialfall:
  // "mach die anrede und den text ..." -> NUR Rewrite, Anrede bleibt erhalten
  if (n.includes("mach die anrede und den text") || n.includes("mach die anrede und text")) {
    console.log("[fm-voice] detectWizard2Intent -> wizard2-rewrite-body (Anrede+Text ohne neue Anrede):", rawTrimmed);
    return {
      type: "wizard2-rewrite-body",
      instruction: rawTrimmed,
    };
  }

  // 13) Short-Form-Anrede ("die anrede auf X" ohne "ändere")
  const anredeShortMatch = n.match(/die\s+anrede\s+auf\s+(.+)/);
  if (anredeShortMatch) {
    const anredeRaw = anredeShortMatch[1].trim();
    const greeting = normalizeGreeting(anredeRaw);
    if (greeting) {
      // Nur Anrede (keine Text-Komponente prüfen, das wird später behandelt)
      console.log("[fm-voice] detectWizard2Intent -> wizard2-edit-anrede (Short-Form):", greeting);
      return {
        type: "wizard2-edit-anrede",
        newAnrede: greeting,
      };
    }
    // Wenn kein Greeting erkannt wird, lassen wir das hier durchfallen,
    // und ggf. später als rewrite-body behandeln.
  }

  // 14) Anrede-Basis-Match (mit "ändere" oder "mach")
  // Wir versuchen, den Teil nach "die anrede" zu greifen.
  // Beispiele:
  // - ändere die anrede auf guten tag und mach den text formeller
  // - ändere die anrede guten morgen und füge hinzu, dass ...
  // - mach die anrede locker und den text ernst (wird bereits in Schritt 6 behandelt)
  const anredeBaseMatch = n.match(
    /(?:ander|ändere|aendere|änder|mach|mache)\s+die\s+anrede(?:\s+auf)?\s+(.+)/
  );

  let greetingPhrase: string | null = null;
  let instructionFromAnredePart: string | null = null;

  if (anredeBaseMatch) {
    const rest = anredeBaseMatch[1].trim();

    // versuche, an "und"/"aber"/"," zu splitten,
    // um Anrede und Rest-Anweisung zu trennen
    const split = rest.split(/\b(?:und|aber)\b/);
    const rawGreeting = split[0].trim();
    
    // Prüfe, ob es eine konkrete Anrede ist oder nur Stilbeschreibung
    greetingPhrase = normalizeGreeting(rawGreeting);
    
    // Wenn normalizeGreeting null zurückgibt, ist es keine konkrete Anrede
    // (z.B. "formell", "locker", "sehr ernst")
    if (!greetingPhrase) {
      // KEINE echte Grußform, z.B. "formell, den text auch sehr formell"
      // → kein edit-anrede, nur rewrite
      console.log("[fm-voice] detectWizard2Intent -> wizard2-rewrite-body (keine konkrete Anrede, nur Stil):", rawTrimmed);
      return {
        type: "wizard2-rewrite-body",
        instruction: rawTrimmed,
      };
    }

    if (split.length > 1) {
      // alles nach dem ersten "und/aber" als Instruktion
      instructionFromAnredePart = rest.slice(rest.indexOf(split[1])).trim();
    }
  }

  // 15) Wenn wir Anrede + Text-Keywords haben -> Kombi-Intent
  if (greetingPhrase && hasTextRewriteKeyword) {
    console.log("[fm-voice] detectWizard2Intent -> wizard2-edit-anrede-and-rewrite:", { newAnrede: greetingPhrase, instruction: instructionFromAnredePart || rawTrimmed });
    return {
      type: "wizard2-edit-anrede-and-rewrite",
      newAnrede: greetingPhrase,
      instruction: instructionFromAnredePart || rawTrimmed,
    };
  }

  // 16) Nur Anrede (ohne Text-Keywords)
  if (greetingPhrase && !hasTextRewriteKeyword) {
    console.log("[fm-voice] detectWizard2Intent -> wizard2-edit-anrede:", greetingPhrase);
    return {
      type: "wizard2-edit-anrede",
      newAnrede: greetingPhrase,
    };
  }

  // 17) Nur Text-Änderung (ohne explizite Anrede-Änderung)
  if (!greetingPhrase && hasTextRewriteKeyword) {
    console.log("[fm-voice] detectWizard2Intent -> wizard2-rewrite-body:", rawTrimmed);
    return {
      type: "wizard2-rewrite-body",
      instruction: rawTrimmed,
    };
  }

  // 11) Wenn nichts passt -> kein Wizard2
  return null;
}

/**
 * Versucht, einen E-Mail-Compose-Befehl aus dem gesprochenen Text zu extrahieren.
 * Beispiele:
 *  - "schreibe freiraumberatung@web.de eine email"
 *  - "schreibe freiraum beratung at web punkt de eine mail"
 *  - "schreib max mustermann eine mail wegen angebot"
 */
function parseEmailCompose(text: string): { toRaw: string; bodyHint?: string } | null {
  const original = text.trim();
  if (!original) return null;

  const lowered = original.toLowerCase();

  if (!lowered.startsWith("schreib")) {
    return null;
  }

  // Schlagwörter für "mail"
  const mailKeywords = [" email", " e-mail", " mail"];

  const idxMail = mailKeywords
      .map((kw) => lowered.indexOf(kw))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)[0];
    
    if (idxMail === undefined) {
      return null;
  }

  // Alles zwischen "schreibe" und "email/mail" ist der Empfänger-Teil
  // "schreibe freiraumberatung@web.de eine email"
  // lowered: "schreibe freiraumberatung@web.de eine email"
  // -> nach "schreibe " bis " email"
    const afterVerb = lowered.replace(/^schreib(e)?\s+/, "");
    const beforeMail = afterVerb.split(/\s+(email|e-?mail|mail)\b/)[0];
    
  const rawRecipient = beforeMail.trim();
    if (!rawRecipient) return null;

  let toRaw = normalizeRecipient(rawRecipient);
  
  // Alles NACH dem Mail-Keyword als bodyHint verwenden (optional)
  // Beispiel: "schreibe max mustermann eine email wegen angebot heizung"
  const restAfterMailMatch = afterVerb.split(/\s+(email|e-?mail|mail)\b/)[2] || "";
  const bodyHint = restAfterMailMatch.trim() || undefined;

  return {
    toRaw,
    bodyHint,
  };
}

/**
 * Routet Voice-Intents basierend auf dem gesprochenen Text.
 * 
 * Reihenfolge:
 * 1. Wizard3-OneShot (E-Mail mit Inhalt aus einem Satz)
 * 2. E-Mail-Compose (einfache E-Mail-Erstellung)
 * 3. Navigation/Leads/etc.
 * 4. E-Mail-Send/Preview
 * 5. Wizard2 (Anrede/Betreff/Text bearbeiten) - bevorzugt wenn E-Mail-Kontext aktiv
 * 6. ai-chat Fallback
 * 
 * E-Mail-bezogene Voice-Kommandos (Anrede/Betreff/Text) im E-Mail-Kontext
 * laufen immer zuerst durch Wizard2, bevor sie in ai-chat fallen.
 */
export function routeVoiceIntent(raw: string): VoiceIntent {
  const original = (raw || "").trim();
  const text = normalize(original);

  console.log("[fm-voice] routeVoiceIntent raw:", original);
  console.log("[fm-voice] routeVoiceIntent normalized:", text);

  if (!text) {
    return { type: "unknown" };
  }

  // 1) Wizard3-OneShot: E-Mail mit Inhalt erkennen (VOR email-compose)
  const wizard3 = detectWizard3OneShot(original, text);
  if (wizard3) {
    console.log("[fm-voice] routeVoiceIntent -> wizard3-one-shot (E-Mail + Inhalt erkannt)");
    return wizard3;
  }

  // 2) E-Mail-Compose Versuch mit einfacher Heuristik (nur wenn kein Wizard3)
  const emailParsed = parseEmailCompose(original);
  if (emailParsed) {
    console.log("[fm-voice] routeVoiceIntent -> email-compose (parsed):", emailParsed);
    
    // Zusätzlich: E-Mail-Adresse per Regex extrahieren (falls vorhanden)
    const extractedEmail = extractEmailAddress(original);
    
    const intent: VoiceIntent = {
      type: "email-compose",
      toRaw: emailParsed.toRaw,
      subjectHint: undefined,
      bodyHint: emailParsed.bodyHint,
    };
    
    // Wenn eine E-Mail-Adresse per Regex gefunden wurde, diese als 'to' setzen
    if (extractedEmail) {
      intent.to = extractedEmail;
      console.log("[fm-voice] E-Mail-Adresse per Regex extrahiert:", extractedEmail);
    }
    
    return intent;
  }

  // navigation
  if (matchAny(text, ["control center", "kontrollzentrum", "kontroll zentrum", "startseite", "dashboard", "uebersicht"])) {
    return { type: "navigate", target: "control-center" };
  }

  if (
    matchAny(text, ["lead radar", "leadradar", "leads radar", "lied radar", "liedradar", "lead scoring", "scoring ansicht"]) ||
    (text.includes("radar") && (text.includes("lead") || text.includes("lied")))
  ) {
    return { type: "navigate", target: "lead-radar" };
  }

  if (
    matchAny(text, ["leads", "zeige leads", "meine leads", "kontakte", "kontakte anzeigen", "kundenliste", "kunden anzeigen"])
  ) {
    return { type: "navigate", target: "leads" };
  }

  if (
    matchAny(text, [
      "voice diagnostics",
      "mikrofon test",
      "mikrofontest",
      "sprach diagnose",
      "sprache testen",
      "mikrofon einstellen",
    ])
  ) {
    return { type: "navigate", target: "voice-diagnostics" };
  }

  if (
    matchAny(text, [
      "email schreiben",
      "schreibe eine email",
      "schreib eine email",
      "schreibe eine mail",
      "schreib eine mail",
      "mail verfassen",
      "neue email",
    ]) &&
    !text.includes(" an ")
  ) {
      return { type: "navigate", target: "mail-compose" };
  }

  // leads filters
  if (
    (text.includes("leads") || text.includes("kunden") || text.includes("kontakte")) &&
    (text.includes("heute") || text.includes("von heute"))
  ) {
    return { type: "leads-filter", range: "today" };
  }
  if (
    (text.includes("leads") || text.includes("kunden") || text.includes("kontakte")) &&
    (text.includes("gestern") || text.includes("von gestern"))
  ) {
    return { type: "leads-filter", range: "yesterday" };
  }
  if (
    (text.includes("leads") || text.includes("kunden") || text.includes("kontakte")) &&
    (text.includes("diese woche") || text.includes("in dieser woche"))
  ) {
    return { type: "leads-filter", range: "week" };
  }

  if (
    text.includes("letzte aktion") ||
    text.includes("was war meine letzte aktion") ||
    text.includes("was habe ich zuletzt gemacht") ||
    text.includes("was war das letzte was ich gemacht habe")
  ) {
    return { type: "last-action" };
  }

  // --- E-Mail Senden / Vorschau ---
  // Beispiele:
  // "sende die mail"
  // "schick die email los"
  // "schicke die mail bitte"
  // "mach eine vorschau"
  // "zeige mir die email-vorschau"
  const SEND_PATTERNS = [
    "sende die mail bitte",
    "sende die email bitte",
    "schick die mail los",
    "schicke die mail los",
    "schick die email los",
    "schicke die email los",
    "schicke bitte die mail ab",
    "schicke bitte die email ab",
    "schick die mail ab",
    "schick die email ab",
    "sofort senden",
    "mail jetzt senden",
    "email jetzt senden",
    "schick sie los",
    "schicke sie los",
    "sende die mail",
    "sende die email",
    "schick die mail",
    "schicke die mail",
    "schick die email",
    "schicke die email",
    "schick email los",
    "schick die mail los",
    "schick die email los",
    "email senden",
    "e mail senden",
    "mail senden",
  ];

  if (SEND_PATTERNS.some((p) => text.includes(p))) {
    console.log("[fm-voice] intent matched: email-send", { normalizedText: text });
    return { type: "email-send" };
  }

  if (
    text.includes("mach eine vorschau") ||
    text.includes("mach die vorschau") ||
    text.includes("zeige mir die vorschau") ||
    text.includes("zeig mir die vorschau") ||
    text.includes("zeige mir die email vorschau") ||
    text.includes("zeig mir die email vorschau")
  ) {
    console.log("[fm-voice] routeVoiceIntent -> email-preview");
    return { type: "email-preview" };
  }

  // 5) Wizard2-Intents (Anrede/Betreff/Text bearbeiten)
  // Prüfe E-Mail-Kontext (wenn verfügbar)
  let isEmailContext = false;
  try {
    // Dynamischer Import, um Zirkelabhängigkeiten zu vermeiden
    const { getLastAction } = require("./voice_action_store");
    const lastAction = getLastAction();
    isEmailContext = lastAction && lastAction.kind === "email-compose";
  } catch {
    // getLastAction nicht verfügbar, ignoriere
  }

  const hasEmailEditKeyword =
    text.includes("anrede") ||
    text.includes("betreff") ||
    text.includes("text ") ||
    text.includes("mach den text") ||
    text.includes("mach die anrede") ||
    text.includes("mach als anrede") ||
    text.includes("schreib in die anrede") ||
    text.includes("losche den gesamten text") ||
    text.includes("lösche den gesamten text");

  // Wenn E-Mail-Kontext aktiv ist und E-Mail-Edit-Keywords vorhanden, bevorzuge Wizard2
  if (isEmailContext && hasEmailEditKeyword) {
    const wizard2 = detectWizard2Intent(text, original);
    if (wizard2) {
      console.log("[fm-voice] routeVoiceIntent -> Wizard2 (E-Mail-Kontext erkannt)");
      return wizard2;
    }
  }

  // Wizard2-Fallback: Auch ohne expliziten E-Mail-Kontext prüfen
  const wizard2Fallback = detectWizard2Intent(text, original);
  if (wizard2Fallback) {
    console.log("[fm-voice] routeVoiceIntent -> Wizard2 (Fallback)");
    return wizard2Fallback;
  }

  // Fallback: alles, was nicht gematcht wurde, geht an die KI
  // (Wir erlauben der KI damit, freie Fragen, Smalltalk und komplexe Aufgaben zu beantworten.)
  return {
    type: "ai-chat",
    query: original,
  };

  // return { type: "unknown" };  // dieser Return wird dadurch effektiv nie erreicht
}
