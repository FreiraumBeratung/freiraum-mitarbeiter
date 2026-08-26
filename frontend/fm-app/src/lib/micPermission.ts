let warmStream: MediaStream | null = null;
let warmPromise: Promise<MediaStream | null> | null = null;
let micGeneration = 0;

function markGranted(): void {
  if (typeof window !== "undefined") {
    (window as any).__fm_mic_granted = true;
  }
}

function liveAudioTracks(stream: MediaStream | null | undefined): MediaStreamTrack[] {
  return (stream?.getAudioTracks() ?? []).filter((track) => track.readyState === "live");
}

function hardStopStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  try {
    stream.getTracks().forEach((track) => {
      try {
        track.enabled = false;
      } catch {
        /* ignore */
      }
      try {
        track.stop();
      } catch {
        /* ignore */
      }
      try {
        stream.removeTrack(track);
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }
}

export function getWarmMicStream(): MediaStream | null {
  if (warmStream && liveAudioTracks(warmStream).length > 0) return warmStream;
  if (warmStream) {
    hardStopStream(warmStream);
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

  const generation = micGeneration;
  warmPromise = (async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (generation !== micGeneration) {
        hardStopStream(stream);
        return null;
      }
      warmStream = stream;
      markGranted();
      void waitTrackUnmuted(stream);
      return stream;
    } catch {
      return null;
    } finally {
      if (warmPromise) warmPromise = null;
    }
  })();

  return warmPromise;
}

export async function acquireMicStream(): Promise<MediaStream | null> {
  if (warmStream || warmPromise) {
    releaseWarmMic();
  }
  const stream = await warmMic();
  if (stream && warmStream === stream) {
    warmStream = null;
  }
  return stream;
}

export function releaseWarmMic(): void {
  micGeneration += 1;
  warmPromise = null;
  if (!warmStream) return;
  hardStopStream(warmStream);
  warmStream = null;
}

export async function ensureMicPermission(): Promise<void> {
  if (typeof window === "undefined") return;
  const w = window as any;
  if (w.__fm_mic_granted === true || getWarmMicStream()) {
    markGranted();
    return;
  }
  try {
    const perm = await navigator.permissions.query({ name: "microphone" as PermissionName });
    if (perm.state === "granted") markGranted();
  } catch {
    /* iOS kennt die Permission-API oft nicht. Kein getUserMedia hier:
       Stream öffnen und sofort wieder killen macht die nächste Aufnahme still. */
  }
}
