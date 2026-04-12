export type SelectedMailContext = {
  uid: string;
  messageId: string | null;
  subject: string | null;
  fromEmail: string | null;
  fromName: string | null;
  receivedAt?: string | null;
};

declare global {
  interface Window {
    __fm_selected_mail_context?: SelectedMailContext | null;
    __fm_get_selected_mail_context?: () => SelectedMailContext | null;
    __fm_clear_selected_mail_context?: () => void;
  }
}

const STORAGE_KEY = "fm_selected_mail_context_v1";

function emitContextChanged(context: SelectedMailContext | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("fm-selected-mail-context", { detail: { context } }));
}

export function getSelectedMailContext(): SelectedMailContext | null {
  if (typeof window === "undefined") return null;
  const current = window.__fm_selected_mail_context;
  if (current && current.uid) return current;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SelectedMailContext;
    if (parsed && parsed.uid) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export function setSelectedMailContext(context: SelectedMailContext | null) {
  if (typeof window === "undefined") return;
  window.__fm_selected_mail_context = context;
  window.__fm_get_selected_mail_context = () => getSelectedMailContext();
  window.__fm_clear_selected_mail_context = () => clearSelectedMailContext();
  try {
    if (context) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  emitContextChanged(context);
}

export function clearSelectedMailContext() {
  setSelectedMailContext(null);
}

