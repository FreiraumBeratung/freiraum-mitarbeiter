export type PttState = "idle" | "listening" | "speaking" | "error" | "blocked";

export type PttEvents = {
  onStart?: () => void;
  onStop?: (finalText?: string) => void;
  onError?: (err: Error) => void;
  onLevel?: (rms: number) => void;
  onState?: (s: PttState) => void;
};

export function createPttController(ev: PttEvents = {}) {
  let mediaStream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let raf = 0;
  let wakeLock: any = null;
  let state: PttState = "idle";

  const set = (s: PttState) => {
    state = s;
    ev.onState?.(s);
  };

  async function acquireMic() {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const src = audioCtx.createMediaStreamSource(mediaStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      loopLevel();
      return true;
    } catch (e: any) {
      set("blocked");
      ev.onError?.(e);
      return false;
    }
  }

  function loopLevel() {
    if (!analyser) return;
    const buf = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    ev.onLevel?.(rms);
    raf = requestAnimationFrame(loopLevel);
  }

  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator) {
        // @ts-ignore
        wakeLock = await (navigator as any).wakeLock.request("screen");
      }
    } catch {}
  }

  async function startHold() {
    if (state === "listening") return;
    // Acquire mic for level monitoring
    if (!mediaStream) {
      const ok = await acquireMic();
      if (!ok) {
        set("blocked");
        return;
      }
    }
    await requestWakeLock();
    ev.onStart?.();
    set("listening");
  }

  async function stopHold(finalText?: string) {
    set("speaking");
    ev.onStop?.(finalText);
    set("idle");
  }

  function dispose() {
    cancelAnimationFrame(raf);
    if (analyser) analyser.disconnect();
    if (audioCtx) audioCtx.close();
    mediaStream?.getTracks().forEach((t) => t.stop());
    mediaStream = null;
    analyser = null;
    audioCtx = null;
    try {
      wakeLock?.release?.();
    } catch {}
    set("idle");
  }

  return {
    startHold,
    stopHold,
    dispose,
    get state() {
      return state;
    },
  };
}

