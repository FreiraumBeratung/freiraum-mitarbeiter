const STORAGE_KEY = "fm_sid";

export function getStoredSessionToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return (window.localStorage.getItem(STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function storeSessionToken(token: string | null | undefined): void {
  if (typeof window === "undefined") return;
  const value = (token || "").trim();
  try {
    if (!value) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearStoredSessionToken(): void {
  storeSessionToken("");
}

export function resetMobileZoom(): void {
  if (typeof document === "undefined") return;
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
  const meta = document.querySelector('meta[name="viewport"]');
  if (!(meta instanceof HTMLMetaElement)) {
    window.scrollTo(0, 0);
    return;
  }
  const next = "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover";
  meta.setAttribute("content", `${next}, maximum-scale=1.01`);
  window.setTimeout(() => {
    meta.setAttribute("content", next);
    window.scrollTo(0, 0);
  }, 40);
}
