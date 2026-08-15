/**
 * Additive Umgangssprache für Benachrichtigen/Senden.
 * Greift nur, wenn die bestehenden lass-wissen-Patterns nicht matchen.
 */

const LEADING_FILLER_RE = /^(?:(?:he+|hey|hi|hallo|äh+|ähm+|hm+|also|ja|so)[\s,]+)+/i;

const INVALID_NOTIFY_NAMES = new Set([
  "uns",
  "eine",
  "einer",
  "einem",
  "der",
  "die",
  "das",
  "den",
  "dem",
  "mal",
  "bitte",
  "folgendes",
  "folgende",
  "wissen",
  "ihn",
  "sie",
  "ihr",
  "ihm",
  "denen",
  "mir",
  "mich",
  "dir",
  "dich",
  "euch",
  "es",
  "schnell",
  "kurz",
  "eben",
  "heute",
  "morgen",
  "spaeter",
  "später",
  "gleich",
  "jetzt",
  "sofort",
  "direkt",
  "nachricht",
  "mail",
  "email",
  "jemand",
  "sag",
  "sagen",
  "lass",
  "las",
  "du",
  "ich",
  "wir",
]);

const SOFT_CMD = String.raw`(?:bitte|schnell|mal\s+eben|mal|kurz|direkt|sofort)`;

export type ColloquialNotifyMatch = {
  toName: string;
  bodyRaw: string;
  autoSend: boolean;
};

export function stripSpokenLeadFillers(value: string): string {
  return (value || "").replace(LEADING_FILLER_RE, "").trim();
}

export function isValidNotifyName(name: string): boolean {
  const t = (name || "").trim();
  if (t.length < 2 || t.length > 40) return false;
  if (INVALID_NOTIFY_NAMES.has(t.toLowerCase())) return false;
  return /^[a-zäöüß][a-zäöüß\-']+$/i.test(t);
}

function hasBlockingNegation(text: string): boolean {
  return (
    /\bnicht\s+(?:senden|schicken|abschicken|rausschicken|verschicken)\b/i.test(text) ||
    /\b(?:nur|bloß|bloss)\s+(?:zeigen|vorzeigen|anzeigen|entwurf)\b/i.test(text) ||
    /\b(?:preview|vorschau)\b/i.test(text)
  );
}

function stripLeadingDass(body: string): string {
  return body.replace(/^(?:dass|daß)\s+/i, "").trim();
}

function autoSendForMatch(original: string, kind: "kannst-du" | "lass"): boolean {
  if (hasBlockingNegation(original)) return false;
  if (kind === "kannst-du") return true;
  const prefix = original.slice(0, Math.max(0, original.toLowerCase().search(/\bwissen\b/)));
  return /\b(bitte|schnell|mal\s+eben|direkt|sofort)\b/i.test(prefix);
}

export function parseColloquialNotifyCommand(original: string): ColloquialNotifyMatch | null {
  const orig = (original || "").trim();
  if (!orig) return null;
  const rest = stripSpokenLeadFillers(orig);
  if (!rest) return null;

  const patterns: Array<{ re: RegExp; kind: "kannst-du" | "lass" }> = [
    {
      kind: "kannst-du",
      re: new RegExp(
        String.raw`^(?:kannst|könntest|kann)\s+du\s+([a-zäöüß][a-zäöüß\-']+)\s+(?:${SOFT_CMD}\s+)*wissen\s+lassen(?:\s+(?:dass|daß))?\s*[:.,]?\s*(.+)$`,
        "i"
      ),
    },
    {
      kind: "kannst-du",
      re: new RegExp(
        String.raw`^(?:kannst|könntest|kann)\s+du\s+([a-zäöüß][a-zäöüß\-']+)\s+(?:${SOFT_CMD}\s+)*(?:sagen|bescheid\s+sagen)(?:\s+(?:dass|daß))?\s*[:.,]?\s*(.+)$`,
        "i"
      ),
    },
    {
      kind: "lass",
      re: new RegExp(
        String.raw`^la(?:ss|s)\s+([a-zäöüß][a-zäöüß\-']+)\s+(?:${SOFT_CMD}\s+|folgendes\s+)*wissen(?:\s+lassen)?(?:\s+(?:dass|daß))?\s*[:.,]?\s*(.+)$`,
        "i"
      ),
    },
  ];

  for (const pattern of patterns) {
    const match = rest.match(pattern.re);
    if (!match?.[1] || !match[2]) continue;
    const toName = match[1].trim();
    let bodyRaw = stripLeadingDass(match[2].trim());
    if (!isValidNotifyName(toName) || bodyRaw.length < 3) continue;
    return {
      toName,
      bodyRaw,
      autoSend: autoSendForMatch(rest, pattern.kind),
    };
  }
  return null;
}

export function isColloquialNotifySendPhrase(text: string): boolean {
  const match = parseColloquialNotifyCommand(text);
  return Boolean(match?.autoSend);
}

export function isPoliteAssistantMailCommand(text: string): boolean {
  const t = (text || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (
    /\b(kannst|könntest|kann)\s+du\s+(?:bitte\s+)?(?:folgende[ns]?\s+)?(?:nachricht|mail|e-?mail)\b/i.test(
      t
    )
  ) {
    return true;
  }
  const politeNotify = t.match(
    /\b(kannst|könntest|kann)\s+du\s+([a-zäöüß][a-zäöüß\-']+)\s+(?:bitte\s+|schnell\s+|mal\s+eben\s+|mal\s+|kurz\s+)*(?:wissen\s+lassen|sagen)\b/i
  );
  if (politeNotify?.[2] && isValidNotifyName(politeNotify[2])) return true;
  return Boolean(parseColloquialNotifyCommand(text));
}
