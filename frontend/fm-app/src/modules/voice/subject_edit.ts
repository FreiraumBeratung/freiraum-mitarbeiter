/**
 * Subject-Edit Polishing: Separator, Tokenize, Normalize, Dedupe
 * Pure functions, keine Dependencies.
 */

export type SubjectSeparator = " – " | " - ";

const HYPHEN_KEYWORDS = /\b(?:strich|bindestrich|minus|dash)\b/i;
const EN_DASH = " – ";
const HYPHEN = " - ";
const SEP_REGEX = /\s*[–\-]\s*/; // En-Dash oder Hyphen mit optionalen Spaces

/** Nutzt currentSubject oder rawCommand, um den bevorzugten Separator zu ermitteln. */
export function detectPreferredSeparator(
  currentSubject: string,
  rawCommand: string
): SubjectSeparator {
  const cur = (currentSubject ?? "").trim();
  const cmd = (rawCommand ?? "").trim();

  if (HYPHEN_KEYWORDS.test(cmd)) return HYPHEN;
  if (cur.includes(EN_DASH)) return EN_DASH;
  if (cur.includes(HYPHEN)) return HYPHEN;
  return EN_DASH;
}

/** Zerlegt Subject in Tokens (nach " – " oder " - " oder mehrfachen Spaces). */
export function tokenizeSubject(subject: string): string[] {
  if (!subject || typeof subject !== "string") return [];
  const s = subject.trim();
  if (!s) return [];
  return s.split(SEP_REGEX).map((t) => t.trim()).filter(Boolean);
}

/** Satzzeichen am Token-Ende entfernen (. , : ; ! ?, auch mehrfach). */
function stripPunctuation(s: string): string {
  return (s ?? "").replace(/[.,:;!?]+$/g, "").trim();
}

/** Mehrfach-Spaces innerhalb des Tokens zusammenführen. */
function collapseSpaces(s: string): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** Capitalize: erster Buchstabe groß, Rest wie gesprochen. B2B bleibt B2B. */
export function normalizeToken(token: string): string {
  if (!token || typeof token !== "string") return "";
  let t = collapseSpaces(stripPunctuation(token));
  if (!t) return "";
  const words = t.split(/\s+/).filter(Boolean);
  return words
    .map((w) => {
      if (w === w.toUpperCase() && w.length > 1) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

/** Tokens mit Separator zusammenfügen. Bei 1 Token: kein Separator. */
export function joinTokens(tokens: string[], sep: SubjectSeparator): string {
  if (!tokens?.length) return "";
  if (tokens.length === 1) return tokens[0];
  return tokens.join(sep);
}

/** Set: ersetzt gesamten Betreff. Behandelt Text als 1 String, nur trimmen. */
export function subjectSet(newSubjectRaw: string): string {
  if (newSubjectRaw == null || typeof newSubjectRaw !== "string") return "";
  const t = newSubjectRaw.trim();
  if (!t) return "";
  return normalizeToken(t);
}

/** Append: Token ans Ende (deduped), mit gewähltem Separator. */
export function subjectAppend(
  currentSubject: string,
  addRaw: string,
  rawCommand: string
): string {
  const cur = (currentSubject ?? "").trim();
  const add = (addRaw ?? "").trim();
  if (!add) return cur;

  const sep = detectPreferredSeparator(cur, rawCommand);
  const rawTokens = tokenizeSubject(cur);
  const tokens = rawTokens.map((t) => normalizeToken(t)).filter(Boolean);
  const addTokens = tokenizeSubject(add).map(normalizeToken).filter(Boolean);

  const seen = new Set<string>(tokens.map((t) => t.toLowerCase()));
  for (const tok of addTokens) {
    const key = tok.toLowerCase();
    if (!seen.has(key)) {
      tokens.push(tok);
      seen.add(key);
    }
  }
  return joinTokens(tokens, sep);
}

/** Replace-Part: Token-wise oder Fallback Substring. */
export function subjectReplacePart(
  currentSubject: string,
  fromRaw: string,
  toRaw: string,
  rawCommand: string
): string {
  const cur = (currentSubject ?? "").trim();
  const from = (fromRaw ?? "").trim();
  const to = (toRaw ?? "").trim();
  if (!from) return cur;

  const sep = detectPreferredSeparator(cur, rawCommand);
  const tokens = tokenizeSubject(cur);
  const fromNorm = normalizeToken(from).toLowerCase();
  const toNorm = normalizeToken(to);

  let changed = false;
  const newTokens: string[] = [];
  const seen = new Set<string>();

  for (const t of tokens) {
    const tn = normalizeToken(t);
    const key = tn.toLowerCase();
    if (key === fromNorm) {
      if (!seen.has(toNorm.toLowerCase())) {
        newTokens.push(toNorm);
        seen.add(toNorm.toLowerCase());
        changed = true;
      }
    } else {
      if (!seen.has(key)) {
        newTokens.push(tn);
        seen.add(key);
      }
    }
  }

  if (changed) return joinTokens(newTokens, sep);

  const idx = cur.toLowerCase().indexOf(fromNorm);
  if (idx >= 0) {
    const matchLen = fromNorm.length;
    const before = cur.slice(0, idx);
    const after = cur.slice(idx + matchLen);
    return before + toNorm + after;
  }
  return cur;
}

/** Clear: Betreff wird leerer String. */
export function subjectClear(): string {
  return "";
}
