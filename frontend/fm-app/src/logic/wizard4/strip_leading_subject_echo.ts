/**
 * Entfernt führendes Subject-Echo am Body-Anfang (z.B. "Rückruf. Hi Thomas" -> "Hi Thomas").
 * Case-insensitive; Umlaute ä/ö/ü werden für den Abgleich wie a/o/u behandelt.
 */
export function stripLeadingSubjectEcho(body: string, subject: string | undefined): string {
  if (!body || typeof body !== 'string') return body || '';
  if (!subject || typeof subject !== 'string' || !subject.trim()) return body;
  const sub = subject.trim();
  const forPattern = sub.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ä/g, '[aä]').replace(/ö/g, '[oö]').replace(/ü/g, '[uü]')).join('\\s+');
  const re = new RegExp(`^\\s*${forPattern}\\s*[.,:;!?]?\\s*`, 'i');
  return body.replace(re, '').trim();
}
