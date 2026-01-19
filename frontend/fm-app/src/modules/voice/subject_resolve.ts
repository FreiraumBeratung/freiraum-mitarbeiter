/**
 * Resolves the email subject for voice commands.
 * 
 * Rules:
 * - If subjectHint is provided (user explicitly spoke a subject) => use it
 * - Else if autoSend === true AND sendMode === "sendNow" => use "Kurze Info"
 * - Else if draftSubject is provided => use it
 * - Else => use "Kurze Info" as fallback
 * 
 * This ensures that when AutoSend is active and no subject was spoken,
 * we don't use stale UI state (e.g., "Termin morgen") but instead use
 * the neutral "Kurze Info" subject.
 */
export function resolveVoiceEmailSubject(args: {
  subjectHint?: string | null;
  draftSubject?: string | null;
  sendMode?: "sendNow" | "previewOnly" | string;
  autoSend?: boolean;
}): string {
  const { subjectHint, draftSubject, sendMode, autoSend } = args;

  // Rule 1: If user explicitly provided a subject, use it
  if (subjectHint && subjectHint.trim().length > 0) {
    return subjectHint.trim();
  }

  // Rule 2: If AutoSend is active (sendNow), use "Kurze Info" instead of stale draftSubject
  if (autoSend === true && sendMode === "sendNow") {
    return "Kurze Info";
  }

  // Rule 3: If draftSubject is provided (previewOnly or other cases), use it
  if (draftSubject && draftSubject.trim().length > 0) {
    return draftSubject.trim();
  }

  // Rule 4: Fallback to "Kurze Info"
  return "Kurze Info";
}
