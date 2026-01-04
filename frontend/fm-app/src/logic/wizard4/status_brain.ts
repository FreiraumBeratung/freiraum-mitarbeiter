// status_brain.ts
// Gehirn-Modul für Status-E-Mails im Wizard 4

export type StatusCategory =
  | "LATE"
  | "NO_TIME_TODAY"
  | "REPLY_TOMORROW"
  | "ON_THE_WAY"
  | "SICK"
  | "VACATION"
  | "IN_MEETING"
  | "DRIVING"
  | "CONFIRM_APPOINTMENT"
  | "CANCEL_APPOINTMENT"
  | "RESCHEDULE_APPOINTMENT"
  | "GENERIC";

export interface StatusBrainInput {
  rawText: string;          // kompletter erkannter Satz (normalisiert oder original)
  statusText?: string | null; // extrahierter Status-Teil (z.B. "ich spater komme")
  toDisplayName?: string | null; // aufgelöster Anzeigename ("Thomas")
}

/**
 * Ermittelt auf Basis des Textes die Status-Kategorie.
 */
export function detectStatusCategory(input: StatusBrainInput): StatusCategory {
  const base = (input.statusText || input.rawText || "").toLowerCase();

  // --------------------
  // 1 – unterwegs
  // --------------------
  if (
    base.includes("unterwegs") ||
    base.includes("bin unterwegs") ||
    base.includes("auf dem weg") ||
    base.includes("bin auf dem weg")
  ) {
    return "ON_THE_WAY";
  }

  // --------------------
  // 2 – krank
  // --------------------
  if (
    base.includes("krank") ||
    base.includes("liege flach") ||
    base.includes("erkältet") ||
    base.includes("fieber")
  ) {
    return "SICK";
  }

  // --------------------
  // 3 – urlaub
  // --------------------
  if (
    base.includes("urlaub") ||
    (base.includes("frei") && base.includes("bin"))
  ) {
    return "VACATION";
  }

  // --------------------
  // 4 – im termin
  // --------------------
  if (
    base.includes("termin") ||
    base.includes("meeting") ||
    base.includes("besprechung") ||
    base.includes("bin gleich in einem")
  ) {
    return "IN_MEETING";
  }

  // --------------------
  // 5 – fahre / lenke
  // --------------------
  if (
    base.includes("auto") ||
    base.includes("am fahren") ||
    base.includes("ich fahre") ||
    base.includes("lenke")
  ) {
    return "DRIVING";
  }

  // --------------------
  // 6 – heute keine zeit mehr
  // --------------------
  if (
    base.includes("heute") &&
    (base.includes("nicht mehr") ||
      base.includes("schaffe es heute nicht") ||
      base.includes("komme heute nicht mehr dazu"))
  ) {
    return "NO_TIME_TODAY";
  }

  // --------------------
  // 7 – morgen / später
  // --------------------
  if (base.includes("morgen") || base.includes("erst morgen")) {
    return "REPLY_TOMORROW";
  }

  // --------------------
  // 8 – ich komme später / verspätet / verzögert
  // --------------------
  if (
    base.includes("spater komme") ||
    base.includes("später komme") ||
    base.includes("komme spater") ||
    base.includes("komme später") ||
    base.includes("verspatet") ||
    base.includes("verspätet") ||
    base.includes("später") ||
    base.includes("spater") ||
    base.includes("verzögert sich") ||
    base.includes("verzoegert sich") ||
    base.includes("dauert noch") ||
    base.includes("schaffe es nicht rechtzeitig") ||
    base.includes("nicht rechtzeitig")
  ) {
    return "LATE";
  }

  // --------------------
  // 9 – krank / Ausfall (erweitert)
  // --------------------
  if (
    base.includes("krank") ||
    base.includes("liege flach") ||
    base.includes("erkältet") ||
    base.includes("fieber") ||
    base.includes("falle aus") ||
    base.includes("gesundheitlich") ||
    base.includes("nicht fit") ||
    base.includes("nicht einsatzfähig") ||
    base.includes("nicht einsatzfaehig")
  ) {
    return "SICK";
  }

  // --------------------
  // 10 – unterwegs (erweitert)
  // --------------------
  if (
    base.includes("unterwegs") ||
    base.includes("bin unterwegs") ||
    base.includes("auf dem weg") ||
    base.includes("bin auf dem weg") ||
    base.includes("fahre gerade") ||
    base.includes("bin draußen") ||
    base.includes("bin draussen")
  ) {
    return "ON_THE_WAY";
  }

  // --------------------
  // 11 – heute nicht mehr (erweitert)
  // --------------------
  if (
    (base.includes("heute") &&
      (base.includes("nicht mehr") ||
        base.includes("schaffe es heute nicht") ||
        base.includes("komme heute nicht mehr dazu"))) ||
    base.includes("schaffe ich heute nicht") ||
    base.includes("komme heute nicht mehr dazu")
  ) {
    return "NO_TIME_TODAY";
  }

  // --------------------
  // 12 – morgen / später möglich (erweitert)
  // --------------------
  if (
    base.includes("morgen") ||
    base.includes("erst morgen") ||
    base.includes("morgen möglich") ||
    base.includes("morgen moeglich") ||
    base.includes("morgen melde ich mich")
  ) {
    return "REPLY_TOMORROW";
  }

  return "GENERIC";
}

/**
 * Baut den eigentlichen Body-Text für Status-Mails.
 * Gibt nur den Body zurück, Subject macht der Aufrufer selbst.
 */
export function buildStatusEmailBody(input: StatusBrainInput): string {
  const category = detectStatusCategory(input);
  const name = (input.toDisplayName || "").trim();
  const hasName = name.length > 0;

  const greetingLine = hasName ? `Hi ${name},` : "Hi,";

  // Spezielle Fälle mit eigenen Body-Strukturen
  if (category === "NO_TIME_TODAY") {
    const noTimeBody = `ich wollte dir nur kurz informieren, dass ich es heute leider nicht mehr schaffe. Ich melde mich später nochmal.`;
    const linesNoTime = [
      greetingLine,
      "",
      noTimeBody,
      "",
    ];
    return linesNoTime.join("\n");
  }

  if (category === "REPLY_TOMORROW") {
    const tomorrowBody = `kurze Info: Ich kann mich erst morgen darum kümmern. Ich melde mich dann nochmal.`;
    const linesTomorrow = [
      greetingLine,
      "",
      tomorrowBody,
      "",
    ];
    return linesTomorrow.join("\n");
  }

  // Standard-Fälle mit "ich wollte dir nur kurz Bescheid geben"
  let statusSentence: string;

  switch (category) {
    case "LATE":
      statusSentence = "dass ich heute etwas später komme.";
      break;

    case "ON_THE_WAY":
      statusSentence =
        "dass ich gerade unterwegs bin und mich später nochmal melde.";
      break;

    case "SICK":
      statusSentence =
        "dass ich aktuell krank bin und es heute leider nicht schaffe.";
      break;

    case "VACATION":
      statusSentence =
        "dass ich momentan im Urlaub bin und mich danach wieder melde.";
      break;

    case "IN_MEETING":
      statusSentence =
        "dass ich gleich in einem Termin bin und mich danach wieder melde.";
      break;

    case "DRIVING":
      statusSentence =
        "dass ich gerade am Fahren bin und mich später nochmal bei dir melde.";
      break;

    default:
      statusSentence =
        "dass ich mich später nochmal bei dir melde.";
      break;
  }

  const lines: string[] = [
    greetingLine,
    "",
    `ich wollte dir nur kurz Bescheid geben, ${statusSentence}`,
    "",
  ];

  return lines.join("\n");
}
