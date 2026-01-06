// frontend/fm-app/src/logic/wizard4/free_dictation.ts

export interface FreeDictationMeta {
  /** Vollständig normalisierte Eingabe (klein, ohne Sonderzeichen) */
  normalized: string;
  /** Rohname aus der Spracheingabe (z. B. "thomas") */
  toNameRaw: string;
  /** Reiner Freitext-Body, ohne Autosend-Phrasen */
  bodyText: string;
  /** Ob aus der Spracheingabe ein AutoSend-Wunsch erkannt wurde */
  autoSend: boolean;
}

/**
 * Phrasen, die einen klaren AutoSend-Wunsch im Free-Diktat signalisieren.
 * Die Eingabe ist bereits komplett kleingeschrieben.
 */
const FREE_DICTATION_AUTOSEND_SNIPPETS: string[] = [
  "und schick sie direkt raus",
  "und schicke sie direkt raus",
  "und schickt sie direkt raus",
  "und schick sie direkt los",
  "und schicke sie direkt los",
  "und schickt die email sofort raus",
  "und schick die email sofort raus",
  "und schicke die email sofort raus",
  "und schickt die e-mail sofort raus",
  "und schick die e-mail sofort raus",
  "und schicke die e-mail sofort raus",
  "und schickt die mail sofort raus",
  "und schick die mail sofort raus",
  "und schicke die mail sofort raus",
  "und schicke es dann auch direkt los",
  "und schick es dann auch direkt los",
  "und schicke es auch direkt los",
  "und schick es auch direkt los",
];

/**
 * Liefert true, wenn im normalisierten Text eine der AutoSend-Phrasen vorkommt.
 * Verwendet eine robuste Regex-basierte Erkennung für flexiblere Varianten.
 */
export function detectFreeDictationAutoSend(normalized: string, explicitAutoSend?: boolean): boolean {
  const text = normalized.toLowerCase().trim();

  // Wenn der Parser bereits explizit autoSend=true gesetzt hat, übernehmen wir das immer.
  if (explicitAutoSend) {
    return true;
  }

  // Zuerst prüfen wir die bekannten Snippets (schneller)
  if (FREE_DICTATION_AUTOSEND_SNIPPETS.some((snippet) => text.includes(snippet))) {
    return true;
  }

  // Robustere Regex-basierte Erkennung für flexiblere Varianten:
  // Wir wollen nur dann AutoSend, wenn klar eine "schick / sende direkt raus / sofort raus"-Absicht erkennbar ist.
  // Dazu nutzen wir eine Kombination aus:
  // - irgendeiner Form von "schick / schicke / schickt"
  // - UND einem "direkt / sofort / gleich"
  // - UND einem "raus / los / weg"
  //
  // Damit decken wir u.a. ab:
  // - "und schick sie direkt raus"
  // - "und schicke es auch direkt los"
  // - "und schicke es dann auch direkt los"
  // - "und schickt die email sofort raus"
  // - "und schick die mail direkt raus"
  // usw.
  const hasSchickVerb = /\bschick(?:e|t)?\b/.test(text);
  const hasTimeWord = /\b(direkt|sofort|gleich)\b/.test(text);
  const hasDirectionWord = /\b(raus|los|weg)\b/.test(text);

  if (hasSchickVerb && hasTimeWord && hasDirectionWord) {
    return true;
  }

  // Zusätzlich erlauben wir AutoSend bei klaren "sende ... direkt an" Mustern
  // (z.B. "sende bitte folgende email direkt an thomas ...").
  const sendDirectPattern = /\bsende\b.*\bdirekt\b.*\ban\b/.test(text);
  if (sendDirectPattern) {
    return true;
  }

  return false;
}

/**
 * Entfernt bekannte AutoSend-Phrasen aus dem Body-Text, falls vorhanden.
 * Arbeitet bewusst relativ tolerant, damit auch leicht abgewandelte Varianten
 * keine Artefakte im Mail-Body hinterlassen.
 */
export function stripFreeDictationAutoSend(text: string): string {
  let result = text;

  // Case-insensitive Ersetzung: für jeden Snippet suchen und im Original-Text entfernen
  for (const snippet of FREE_DICTATION_AUTOSEND_SNIPPETS) {
    const regex = new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    result = result.replace(regex, " ");
  }

  // Zusätzlich: Robuste Regex-Muster für Varianten wie "und schicke es auch direkt los"
  // Diese müssen ebenfalls aus dem Body entfernt werden
  const robustPatterns = [
    /\bund\s+schick(?:e|t)?\s+(?:sie|es|die\s+(?:nachricht|email|e-mail|mail))\s+(?:auch\s+)?(?:dann\s+)?auch\s+(?:direkt|sofort)\s+(?:raus|los|weg)\b/gi,
    /\bund\s+schick(?:e|t)?\s+(?:sie|es|die\s+(?:nachricht|email|e-mail|mail))\s+(?:direkt|sofort)\s+(?:raus|los|weg)\b/gi,
  ];

  for (const pattern of robustPatterns) {
    result = result.replace(pattern, " ");
  }

  // Mehrfach-Leerzeichen entfernen und trimmen
  result = result.replace(/\s+/g, " ").trim();

  return result;
}

/**
 * Versucht, aus einem normalisierten Sprachbefehl ein FreeDictationMeta zu erzeugen.
 * Wird in intent_router.ts vor den "Umgangssprache-Mail" Intents aufgerufen.
 */
export function parseFreeDictation(normalizedInput: string): FreeDictationMeta | null {
  let normalized = normalizedInput.trim().toLowerCase();

  // AutoSend aus komplettem Satz erkennen (BEVOR Pattern-Matching)
  // Wir nutzen die robuste Erkennung mit optionalem explicitAutoSend-Parameter
  let autoSend = detectFreeDictationAutoSend(normalized, false);

  // AutoSend-Phrasen aus dem normalisierten Text entfernen (damit Patterns sauber matchen)
  let workText = normalized;
  for (const snippet of FREE_DICTATION_AUTOSEND_SNIPPETS) {
    const idx = workText.indexOf(snippet);
    if (idx !== -1) {
      workText = (workText.slice(0, idx) + workText.slice(idx + snippet.length)).trim();
      break; // Nur erste Phrase entfernen
    }
  }

  // 1) "sende bitte folgende nachricht an thomas und schick sie direkt raus hi thomas ..."
  const patterns: RegExp[] = [
    // sende folgende nachricht/email/mail an {name} ...
    // Unterstützt mehrteilige Namen wie "freiraum beratung"
    /^sende(?: bitte)? folgende(?:r|) (?:nachricht|email|e-mail|mail) (?:direkt )?an (?<name>[a-z ]+?)\s+(?<body>.+)$/i,

    // sende folgende nachricht/email/mail an {name} ...
    /^sende(?: bitte)? folgende(?: nachricht| email| e-mail| mail)? an (?<name>[a-z ]+?)\s+(?<body>.+)$/i,

    // schreibe bitte folgendes an {name} ...
    /^schreib(?:e)?(?: bitte)? folgendes an (?<name>[a-z ]+?)\s+(?<body>.+)$/i,

    // schreib(e) {name} bitte folgendes ...
    /^schreib(?:e)? (?<name>[a-z ]+?)(?: bitte)? folgendes\s+(?<body>.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = workText.match(pattern);
    if (match && match.groups) {
      const rawName = (match.groups["name"] || "").trim();
      let body = (match.groups["body"] || "").trim();

      // Autosend-Phrasen ggf. aus dem Body entfernen (falls sie dort stehen)
      body = stripFreeDictationAutoSend(body);

      if (!rawName || !body) {
        continue;
      }

      // Finale AutoSend-Erkennung: Prüfe nochmal auf robuste Muster im kompletten normalisierten Text
      // Dies stellt sicher, dass auch Varianten wie "und schicke es auch direkt los" erkannt werden
      const finalAutoSend = detectFreeDictationAutoSend(normalized, autoSend);

      return {
        normalized,
        toNameRaw: rawName,
        bodyText: body,
        autoSend: finalAutoSend,
      };
    }
  }

  return null;
}

