let warmStream: MediaStream | null = null;
let warmPromise: Promise<MediaStream | null> | null = null;

function markGranted(): void {
  if (typeof window !== "undefined") {
    (window as any).__fm_mic_granted = true;
  }
}

function liveAudioTracks(stream: MediaStream | null | undefined): MediaStreamTrack[] {
  return (stream?.getAudioTracks() ?? []).filter((track) => track.readyState === "live");
}

export function getWarmMicStream(): MediaStream | null {
  if (warmStream && liveAudioTracks(warmStream).length > 0) return warmStream;
  if (warmStream) {
    try {
      warmStream.getTracks().forEach((track) => track.stop());
    } catch {
      /* ignore */
    }
    warmStream = null;
  }
  return null;
}

async function waitTrackUnmuted(stream: MediaStream): Promise<void> {
  const track = liveAudioTracks(stream)[0];
  if (!track || !track.muted) return;
  await new Promise<void>((resolve) => {
    const done = () => {
      track.removeEventListener("unmute", done);
      resolve();
    };
    track.addEventListener("unmute", done, { once: true });
    window.setTimeout(done, 400);
  });
}

export async function warmMic(): Promise<MediaStream | null> {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
  const existing = getWarmMicStream();
  if (existing) return existing;
  if (warmPromise) return warmPromise;

  warmPromise = (async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      warmStream = stream;
      markGranted();
      void waitTrackUnmuted(stream);
      return stream;
    } catch {
      return null;
    } finally {
      warmPromise = null;
    }
  })();

  return warmPromise;
}

export function releaseWarmMic(): void {
  warmPromise = null;
  if (!warmStream) return;
  try {
    warmStream.getTracks().forEach((track) => track.stop());
  } catch {
    /* ignore */
  }
  warmStream = null;
}

export async function ensureMicPermission(): Promise<void> {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
  const w = window as any;

  try {
    const perm = await navigator.permissions.query({ name: "microphone" as PermissionName });
    if (perm.state === "denied") return;
    if (perm.state === "granted") {
      markGranted();
      return;
    }
  } catch {
    /* iOS kann die Permission-API auslassen – dann einmal getUserMedia. */
  }

  if (getWarmMicStream() || w.__fm_mic_granted === true) {
    markGranted();
    return;
  }

  const stream = await warmMic();
  if (stream) releaseWarmMic();
}
