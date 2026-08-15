export type SendReviewMode = "pruefen" | "sofort";

const STORAGE_KEY = "fm_send_review_mode";

function readWindowMode(): SendReviewMode | null {
  if (typeof window === "undefined") return null;
  const raw = (window as any).__fm_send_review_mode;
  if (raw === "pruefen" || raw === "sofort") return raw;
  return null;
}

function readStoredMode(): SendReviewMode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "pruefen" || raw === "sofort") return raw;
  } catch {
    // ignore private mode / quota
  }
  return null;
}

export function getSendReviewMode(): SendReviewMode {
  return readWindowMode() ?? readStoredMode() ?? "pruefen";
}

export function setSendReviewMode(mode: SendReviewMode): void {
  if (mode !== "pruefen" && mode !== "sofort") return;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore private mode / quota
  }
  (window as any).__fm_send_review_mode = mode;
}

export function isImmediateSendMode(): boolean {
  return getSendReviewMode() === "sofort";
}
