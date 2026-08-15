export async function ensureMicPermission(): Promise<void> {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
  const w = window as any;
  if (w.__fm_mic_granted === true) return;

  try {
    const perm = await navigator.permissions.query({ name: "microphone" as PermissionName });
    if (perm.state === "granted") {
      w.__fm_mic_granted = true;
      return;
    }
    if (perm.state === "denied") return;
  } catch {
    /* iOS kann die Permission-API auslassen – dann einmal getUserMedia. */
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    w.__fm_mic_granted = true;
  } catch {
    /* Nutzer hat abgelehnt oder Gerät hat kein Mikro. */
  }
}
