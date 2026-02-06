/**
 * Resolves the email subject for voice commands.
 *
 * Rules:
 * - Rule 1: If subjectHint is provided (user explicitly spoke a subject) => use it
 * - Rule 2: If draftSubject is provided (from intent or stripSubjectCommand) => use it (auch bei sendNow!)
 * - Rule 3: If autoSend+sendNow and no subject => "Kurze Info"
 * - Rule 4: Fallback => "Kurze Info"
 *
 * WICHTIG: draftSubject wird auch bei sendNow verwendet, wenn explizit gesetzt (z.B. "Betreff X" im Body).
 */
export function resolveVoiceEmailSubject(args: {
  subjectHint?: string | null;
  draftSubject?: string | null;
  sendMode?: "sendNow" | "previewOnly" | string;
  autoSend?: boolean;
}): string {
  const { subjectHint, draftSubject, sendMode, autoSend } = args;

  // Rule 1: If user explicitly provided a subject (intent), use it
  if (subjectHint && subjectHint.trim().length > 0) {
    return subjectHint.trim();
  }

  // Rule 2: If draftSubject is provided (from stripSubjectCommand or intent), use it – auch bei sendNow
  if (draftSubject && draftSubject.trim().length > 0) {
    return draftSubject.trim();
  }

  // Rule 3: If AutoSend+sendNow and no subject => "Kurze Info"
  if (autoSend === true && sendMode === "sendNow") {
    return "Kurze Info";
  }

  // Rule 4: Fallback
  return "Kurze Info";
}
