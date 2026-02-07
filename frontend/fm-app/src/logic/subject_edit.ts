/**
 * Subject-Edit: Betreff setzen, anhängen, löschen, ersetzen
 * Robuste Regex + Synonyme; nur wenn "betreff" vorkommt.
 */

export type SubjectEditIntent =
  | { type: 'email-subject-set'; value: string }
  | { type: 'email-subject-append'; value: string }
  | { type: 'email-subject-clear' }
  | { type: 'email-subject-replace'; value: string }
  | { type: 'email-subject-replace-part'; from: string; to: string };

const FILLER = /\b(?:bitte|noch|mal|eben)\b/gi;

/** trim, collapse spaces; Wörter kapitalisieren: erstes Zeichen groß, rest klein, außer ALLCAPS behalten */
export function normalizeSubjectToken(s: string): string {
  if (!s || typeof s !== 'string') return '';
  let t = s.trim().replace(/\s+/g, ' ').replace(/[.,:;]+$/g, '').trim();
  t = t.replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const words = t.split(/\s+/).filter(Boolean);
  return words
    .map((w) => {
      if (w === w.toUpperCase() && w.length > 1) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

function normForMatch(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nur matchen wenn "betreff" vorkommt (außer bei Clear, da kommt es ohnehin vor) */
function hasBetreff(raw: string, normalized: string): boolean {
  return /\bbetreff\b/i.test(raw) || /\bbetreff\b/i.test(normalized);
}

/**
 * Parst Subject-Edit Intent aus Rohinput.
 * Robuste Regex + Synonyme; nur wenn "betreff" vorkommt.
 */
export function parseSubjectEditIntent(raw: string): SubjectEditIntent | null {
  const o = (raw ?? '').trim();
  const t = normForMatch(o);
  const oTrim = o.replace(/[.,;:!?]+$/, '').trim();

  if (!hasBetreff(o, t)) return null;

  // CLEAR: betreff löschen|leeren|entfernen
  if (
    /^betreff\s+(?:loschen|leeren|entfernen)$/i.test(t) ||
    /^entferne\s+(?:den\s+)?betreff$/i.test(t) ||
    /^lösche\s+(?:den\s+)?betreff$/i.test(t) ||
    /^loesche\s+(?:den\s+)?betreff$/i.test(t)
  ) {
    return { type: 'email-subject-clear' };
  }

  // REPLACE-PART: "ersetze im betreff ALT durch NEU" / "ersetz im betreff" / "ändere im betreff X zu Y"
  const replacePartRe = /^(?:ersetze?|ersetz)\s+im\s+betreff\s+(.+?)\s+durch\s+(.+?)(?:\s+ersetzen)?$/i;
  const replacePartRe2 = /^im\s+betreff\s+(.+?)\s+durch\s+(.+)$/i;
  const replacePartRe3 = /^(?:ändere|aendere)\s+im\s+betreff\s+(.+?)\s+zu\s+(.+)$/i;
  const replacePartRe4 = /^mach\s+aus\s+(.+?)\s+(?:->|durch|zu)\s+(.+)$/i;
  for (const re of [replacePartRe, replacePartRe2, replacePartRe3, replacePartRe4]) {
    const m = oTrim.match(re);
    if (m?.[1] && m?.[2]) {
      const from = normalizeSubjectToken(m[1]);
      const to = normalizeSubjectToken(m[2]);
      if (from.length > 0 && to.length > 0) {
        return { type: 'email-subject-replace-part', from, to };
      }
    }
  }

  // REPLACE (full): "ersetze den betreff durch X", "mach aus dem betreff X"
  const replaceReList: RegExp[] = [
    /^ersetze\s+(?:den\s+)?betreff\s+durch\s+(.+)$/i,
    /^mach\s+aus\s+dem\s+betreff\s+(.+)$/i,
  ];
  for (const re of replaceReList) {
    const m = oTrim.match(re);
    if (m?.[1]) {
      const val = normalizeSubjectToken(m[1]);
      if (val.length > 0) return { type: 'email-subject-replace', value: val };
    }
  }

  // SET: "ändere den betreff auf X", "betreff auf", "setze den betreff auf", "mach den betreff", "betreff lautet"
  const setReList: RegExp[] = [
    /^(?:ändere|aendere)\s+(?:den\s+)?betreff\s+auf\s+(.+)$/i,
    /^(?:setz|setze)\s+(?:den\s+)?betreff\s+auf\s+(.+)$/i,
    /^mach\s+(?:den\s+)?betreff\s+(.+)$/i,
    /^betreff\s+ist\s+(.+)$/i,
    /^betreff\s+auf\s+(.+)$/i,
    /^betreff\s+lautet\s+(.+)$/i,
    /^betreff\s+(.+)$/i,
    /^mach\s+als\s+betreff\s+(.+)$/i,
    /^betreff\s*:\s*(.+)$/i,
  ];
  for (const re of setReList) {
    const m = oTrim.match(re);
    if (m?.[1]) {
      const val = normalizeSubjectToken(m[1]);
      if (val.length > 0) return { type: 'email-subject-set', value: val };
    }
  }

  // APPEND: "füge beim betreff", "füge im betreff", "häng beim betreff", "hänge beim betreff", "pack beim betreff", "setz beim betreff noch"
  const appendReList: Array<{ re: RegExp; stripEnd: boolean }> = [
    { re: /^(?:füge|fuege|fuge)\s+(?:beim|im)\s+betreff\s+(.+?)\s+hinzu$/i, stripEnd: false },
    { re: /^(?:füge|fuege|fuge)\s+betreff\s+(.+?)\s+hinzu$/i, stripEnd: false },
    { re: /^(?:häng|hänge|hängen|haeng|hange|hangen)\s+(?:beim|im)\s+betreff\s+(.+?)\s+dran$/i, stripEnd: false },
    { re: /^pack\s+(?:beim|im)\s+betreff\s+(.+?)\s+(?:dazu|hinzu|dran)$/i, stripEnd: false },
    { re: /^(?:setz|setze)\s+(?:beim|im)\s+betreff\s+(.+?)\s+(?:noch\s+)?(?:dazu|hinzu|dran)$/i, stripEnd: false },
    { re: /^(?:ergänze|erganze)\s+(?:beim|im)\s+betreff\s+(.+)$/i, stripEnd: true },
  ];
  for (const { re, stripEnd } of appendReList) {
    const m = oTrim.match(re);
    if (m?.[1]) {
      let rawVal = m[1];
      if (stripEnd) rawVal = rawVal.replace(/\s*(?:hinzu|dazu|dran)\s*$/i, '').trim();
      const val = normalizeSubjectToken(rawVal);
      if (val.length > 0) return { type: 'email-subject-append', value: val };
    }
  }

  return null;
}

/**
 * Wendet SubjectEditIntent auf aktuellen Betreff an.
 * Append: Dedupe (Token schon vorhanden -> nicht doppelt).
 * Replace-part: case-insensitive, erste Vorkommen; from nicht gefunden => current unverändert.
 */
export function applySubjectEdit(current: string, intent: SubjectEditIntent): string {
  const cur = (current ?? '').trim().replace(/\s+/g, ' ');

  switch (intent.type) {
    case 'email-subject-clear':
      return '';

    case 'email-subject-set':
    case 'email-subject-replace':
      return intent.value;

    case 'email-subject-append': {
      if (!cur) return intent.value;
      const tokens = cur.split(/\s+/).filter(Boolean);
      const appendTokens = intent.value.split(/\s+/).filter(Boolean);
      const curLower = new Set(tokens.map((t) => t.toLowerCase()));
      for (const tok of appendTokens) {
        if (!curLower.has(tok.toLowerCase())) {
          tokens.push(tok);
          curLower.add(tok.toLowerCase());
        }
      }
      return tokens.join(' ');
    }

    case 'email-subject-replace-part': {
      const fromNorm = intent.from.toLowerCase();
      const curLower = cur.toLowerCase();
      const idx = curLower.indexOf(fromNorm);
      if (idx < 0) return cur;
      const matchedLen = fromNorm.length;
      return cur.slice(0, idx) + intent.to + cur.slice(idx + matchedLen);
    }

    default:
      return cur;
  }
}
