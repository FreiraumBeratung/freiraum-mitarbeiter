export function splitIntoSentences(text: string): string[] {
  const src = (text ?? "").toString().replace(/\r\n/g, "\n").trim();
  if (!src) return [];

  const out: string[] = [];
  let current = "";

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    const next = i + 1 < src.length ? src[i + 1] : "";
    current += ch;

    const isTerminator = ch === "." || ch === "!" || ch === "?";
    const isBoundaryAfter = next === "" || next === " " || next === "\n";
    if (isTerminator && isBoundaryAfter) {
      const s = current.trim();
      if (s) out.push(s);
      current = "";
    }
  }

  const rest = current.trim();
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

export function joinSentences(sentences: string[]): string {
  return (sentences ?? [])
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function deleteLastNSentences(
  text: string,
  n: number
): { before: string; after: string } {
  const before = (text ?? "").toString();
  const sentences = splitIntoSentences(before);
  if (!sentences.length) return { before, after: "" };
  const count = Math.max(1, Math.min(5, Number.isFinite(n) ? Math.floor(n) : 1));
  const keep = Math.max(0, sentences.length - count);
  const after = joinSentences(sentences.slice(0, keep));
  return { before, after };
}

export function replaceFirstNSentences(
  text: string,
  n: number,
  replacement: string
): { before: string; after: string } {
  const before = (text ?? "").toString();
  const sentences = splitIntoSentences(before);
  const count = Math.max(1, Math.min(5, Number.isFinite(n) ? Math.floor(n) : 1));
  const replRaw = (replacement ?? "").toString().trim();
  const replacementParts = splitIntoSentences(replRaw);
  const normalizedReplacement =
    replacementParts.length > 0 ? joinSentences(replacementParts) : replRaw;
  const replSentences = normalizedReplacement ? [normalizedReplacement] : [];
  const after = joinSentences([...replSentences, ...sentences.slice(count)]);
  return { before, after };
}

