import { backendBase } from "../../lib/backendBase";

export async function consumeMicrosoftClaimFromUrl(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search || "");
  const claim = (params.get("fm_claim") || "").trim();
  if (!claim) return false;
  try {
    const res = await fetch(`${backendBase()}/api/auth/microsoft/claim`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim }),
    });
    if (!res.ok) return false;
    params.delete("fm_claim");
    const next = params.toString();
    const path = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash || ""}`;
    window.history.replaceState({}, "", path);
    window.dispatchEvent(new CustomEvent("fm-mail-setup-complete"));
    return true;
  } catch {
    return false;
  }
}
