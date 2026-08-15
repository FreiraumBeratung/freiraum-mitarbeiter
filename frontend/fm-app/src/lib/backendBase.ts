export function backendBase(): string {
  try {
    if (typeof window !== "undefined") {
      const protocol = window.location?.protocol || "";
      if (protocol === "file:") return "http://127.0.0.1:30521";
      // Same-Origin, damit das Login-Cookie (fm_sid) über den Vite-Proxy bleibt.
      if (protocol === "http:" || protocol === "https:") {
        const origin = window.location.origin;
        if (origin) return origin.replace(/\/+$/, "");
      }
    }
  } catch {
    /* ignore */
  }

  const fromEnv = (
    (typeof import.meta !== "undefined"
      ? ((import.meta as any).env?.VITE_BACKEND_BASE_URL as string | undefined) ||
        ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined) ||
        ((import.meta as any).env?.VITE_API_BASE as string | undefined)
      : undefined) || ""
  ).replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  return "http://127.0.0.1:30521";
}

export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, credentials: init?.credentials ?? "include" });
}

export function installApiCredentials(): void {
  if (typeof window === "undefined") return;
  if ((window as any).__fm_fetch_patched) return;
  (window as any).__fm_fetch_patched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : String((input as Request).url || "");
    const looksLikeAppApi =
      url.includes("/api/") ||
      url.includes("/voice/") ||
      url.startsWith(backendBase()) ||
      url.includes(":30521/");
    if (!looksLikeAppApi) return originalFetch(input, init);
    return originalFetch(input, { ...init, credentials: init?.credentials ?? "include" });
  };
}
