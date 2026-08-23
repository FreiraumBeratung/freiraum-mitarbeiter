import { backendBase } from "../../lib/backendBase";
import { acquireMicStream, releaseWarmMic, warmMic } from "../../lib/micPermission";

let cachedLocalSttHealthAtMs = 0;
let cachedLocalSttHealthOk = false;
const LOCAL_STT_HEALTH_CACHE_MS = 120000;
const COMMAND_MODE_MAX_RECORD_MS = 7000;
const STT_HEALTH_PROBE_MS = 30000;

let lastHealthProbeAtMs = 0;
let lastHealthProbeOk = false;

export async function probeBackendSttHealth(): Promise<boolean> {
  const now = Date.now();
  if (lastHealthProbeAtMs > 0 && now - lastHealthProbeAtMs < STT_HEALTH_PROBE_MS) {
    return lastHealthProbeOk;
  }
  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${backendBase()}/api/stt/health`, {
      credentials: "include",
      signal: controller.signal,
    });
    window.clearTimeout(timeoutId);
    const data = await res.json().catch(() => ({ ok: false }));
    lastHealthProbeOk = Boolean(res.ok && data?.ok);
  } catch {
    lastHealthProbeOk = false;
  }
  lastHealthProbeAtMs = Date.now();
  if (lastHealthProbeOk) {
    cachedLocalSttHealthOk = true;
    cachedLocalSttHealthAtMs = Date.now();
  }
  if (typeof window !== "undefined") {
    (window as any).__fm_backend_stt_ready = lastHealthProbeOk;
    (window as any).__fm_prefer_backend_stt = lastHealthProbeOk;
  }
  return lastHealthProbeOk;
}

function isBackendSttReady(): boolean {
  if (typeof window !== "undefined" && (window as any).__fm_backend_stt_ready) return true;
  const now = Date.now();
  if (lastHealthProbeOk && now - lastHealthProbeAtMs < STT_HEALTH_PROBE_MS) return true;
  if (cachedLocalSttHealthOk && now - cachedLocalSttHealthAtMs < LOCAL_STT_HEALTH_CACHE_MS) return true;
  return false;
}

let activeMicStream: MediaStream | null = null;
let activeRecorder: MediaRecorder | null = null;

export function requestRecorderStop(): void {
  try {
    if (activeRecorder && activeRecorder.state !== "inactive") {
      if (typeof activeRecorder.requestData === "function") {
        activeRecorder.requestData();
      }
      activeRecorder.stop();
    }
  } catch {
    /* ignore */
  }
}

function stopTracks(media: MediaStream | null | undefined): void {
  if (!media) return;
  try {
    media.getTracks().forEach((track) => {
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
        media.removeTrack(track);
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }
}

function endMicCapture(media?: MediaStream | null): void {
  try {
    if (activeRecorder?.stream) stopTracks(activeRecorder.stream);
  } catch {
    /* ignore */
  }
  stopTracks(media);
  if (activeMicStream && activeMicStream !== media) {
    stopTracks(activeMicStream);
  }
  activeRecorder = null;
  activeMicStream = null;
  releaseWarmMic();
}

export function releaseMicSession(): void {
  requestRecorderStop();
  endMicCapture(activeMicStream);
}

export async function recordAndTranscribe(
  maxMs = 60000,
  signal?: AbortSignal,
  opts?: { onListening?: () => void }
): Promise<string | null> {
  const logSttTiming = (payload: Record<string, unknown>) => {
    const parts = Object.entries(payload).map(([key, value]) => `${key}=${String(value)}`);
    console.log(`[fm-stt][timing] ${parts.join(" ")}`);
    console.log("[fm-stt][timing][json]", JSON.stringify(payload));
  };

  const nowMs = (): number => {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  };
  const downsampleTo16kMono = (input: Float32Array, sourceRate: number): Int16Array => {
    const targetRate = 16000;
    if (sourceRate <= 0) return new Int16Array(0);
    const ratio = sourceRate / targetRate;
    const length = Math.max(1, Math.floor(input.length / ratio));
    const out = new Int16Array(length);
    let pos = 0;
    for (let i = 0; i < length; i += 1) {
      const nextPos = Math.min(input.length, Math.floor((i + 1) * ratio));
      let sum = 0;
      let count = 0;
      for (let j = pos; j < nextPos; j += 1) {
        sum += input[j];
        count += 1;
      }
      const sample = count > 0 ? sum / count : 0;
      const clamped = Math.max(-1, Math.min(1, sample));
      out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      pos = nextPos;
    }
    return out;
  };

  const pcm16ToWavBlob = (pcm: Int16Array, sampleRate: number): Blob => {
    const channels = 1;
    const bytesPerSample = 2;
    const blockAlign = channels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcm.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    let offset = 0;
    const writeStr = (text: string) => {
      for (let i = 0; i < text.length; i += 1) {
        view.setUint8(offset + i, text.charCodeAt(i));
      }
      offset += text.length;
    };

    writeStr("RIFF");
    view.setUint32(offset, 36 + dataSize, true);
    offset += 4;
    writeStr("WAVE");
    writeStr("fmt ");
    view.setUint32(offset, 16, true);
    offset += 4;
    view.setUint16(offset, 1, true); // PCM
    offset += 2;
    view.setUint16(offset, channels, true);
    offset += 2;
    view.setUint32(offset, sampleRate, true);
    offset += 4;
    view.setUint32(offset, byteRate, true);
    offset += 4;
    view.setUint16(offset, blockAlign, true);
    offset += 2;
    view.setUint16(offset, 16, true);
    offset += 2;
    writeStr("data");
    view.setUint32(offset, dataSize, true);
    offset += 4;

    for (let i = 0; i < pcm.length; i += 1) {
      view.setInt16(offset, pcm[i], true);
      offset += 2;
    }

    return new Blob([buffer], { type: "audio/wav" });
  };

  const toBackendWav = async (audioBlob: Blob): Promise<Blob> => {
    try {
      const AudioCtx =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return audioBlob;
      const ctx = new AudioCtx();
      try {
        const arr = await audioBlob.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arr.slice(0));
        const channel = decoded.numberOfChannels > 0 ? decoded.getChannelData(0) : new Float32Array(0);
        if (!channel.length) return audioBlob;
        const pcm = downsampleTo16kMono(channel, decoded.sampleRate);
        if (!pcm.length) return audioBlob;
        return pcm16ToWavBlob(pcm, 16000);
      } finally {
        await ctx.close().catch(() => undefined);
      }
    } catch {
      return audioBlob;
    }
  };

  const fetchWithTimeout = async (url: string, init: RequestInit = {}, timeoutMs = 3000) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const mergedSignal = init.signal ?? controller.signal;
      return await fetch(url, { ...init, signal: mergedSignal });
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const pickRecorderMime = (): string => {
    const candidates = ["audio/mp4", "audio/aac", "audio/webm;codecs=opus", "audio/webm"];
    for (const type of candidates) {
      try {
        if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
          return type;
        }
      } catch {
        /* ignore */
      }
    }
    return "";
  };

  if (signal?.aborted) return null;

  // Prefer backend STT first
  let usedBackendRecorder = false;
  try {
    const sttStartedAtMs = nowMs();
    const stream = await acquireMicStream();
    if (signal?.aborted) {
      endMicCapture(stream);
      return null;
    }
    if (!stream) {
      throw new Error("microphone-unavailable");
    }
    const healthAlreadyReady = isBackendSttReady();
    const healthPromise = healthAlreadyReady
      ? Promise.resolve({ provider: "local", ok: true, cached: true })
      : fetchWithTimeout(`${backendBase()}/api/stt/health`, {}, 1200)
          .then((r) => r.json())
          .catch(() => ({ ok: false }));
    usedBackendRecorder = true;
    activeMicStream = stream;
    if (typeof window !== "undefined") {
      (window as any).__fm_mic_granted = true;
    }
    if (signal?.aborted) {
      endMicCapture(stream);
      return null;
    }
    const mimeType = pickRecorderMime();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    activeRecorder = recorder;
    const chunks: BlobPart[] = [];
    const blobType = mimeType || "audio/webm";
    const done = new Promise<Blob>((resolve) => {
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        // Tracks erst hier stoppen – vorher ist die iOS-Aufnahme oft leer.
        endMicCapture(stream);
        resolve(new Blob(chunks, { type: blobType }));
      };
    });
    let resolveStopRequest: (() => void) | null = null;
    const stopRequested = new Promise<void>((resolve) => {
      resolveStopRequest = resolve;
    });
    const abortHandler = () => {
      resolveStopRequest?.();
    };
    signal?.addEventListener("abort", abortHandler, { once: true });
    if (signal?.aborted) {
      endMicCapture(stream);
      signal.removeEventListener("abort", abortHandler);
      return null;
    }
    const recordStartedAtMs = nowMs();
    try {
      recorder.start(100);
    } catch {
      recorder.start();
    }
    opts?.onListening?.();
    const healthCheckedAtMs = nowMs();
    await Promise.race([new Promise((res) => setTimeout(res, maxMs)), stopRequested]);
    try {
      if (recorder.state !== "inactive") recorder.stop();
    } catch {
      /* ignore */
    }
    const audioBlob = await done;
    endMicCapture(stream);
    void warmMic();
    signal?.removeEventListener("abort", abortHandler);
    const recordFinishedAtMs = nowMs();
    const recordedMs = Math.max(0, Math.round(recordFinishedAtMs - recordStartedAtMs));
    const health = await healthPromise;
    if (!health?.ok) {
      cachedLocalSttHealthOk = false;
      throw new Error("stt-unhealthy");
    }
    cachedLocalSttHealthOk = true;
    cachedLocalSttHealthAtMs = Date.now();
    if (typeof window !== "undefined") {
      (window as any).__fm_backend_stt_ready = true;
      (window as any).__fm_prefer_backend_stt = true;
    }
    if (!audioBlob || audioBlob.size < 200) {
      if (typeof window !== "undefined") {
        (window as any).__fm_stt_last_error = "stt-empty";
      }
      return null;
    }

    const backendBlob = await toBackendWav(audioBlob);
    const wavReadyAtMs = nowMs();
    const filename = backendBlob.type === "audio/wav" ? "voice.wav" : "voice.webm";
    const form = new FormData();
    form.append("file", backendBlob, filename);
    const isLikelyCommandMode = recordedMs <= COMMAND_MODE_MAX_RECORD_MS;
    const sttMode = isLikelyCommandMode ? "command" : "dictation";
    form.append("mode", sttMode);
    const transcribeTimeoutMs = isLikelyCommandMode ? 30000 : 120000;
    const resp = await fetchWithTimeout(
      `${backendBase()}/api/stt/transcribe`,
      {
        method: "POST",
        body: form,
        credentials: "include",
      },
      transcribeTimeoutMs
    );
    const transcribeDoneAtMs = nowMs();
    if (resp.ok) {
      const j = await resp.json();
      const jsonParsedAtMs = nowMs();
      const text = (j?.text || "").trim();
      const backendFastProfileUsed =
        typeof j?.fast_profile_used === "boolean" ? j.fast_profile_used : null;
      const backendFallbackUsed =
        typeof j?.fallback_used === "boolean" ? j.fallback_used : null;
      const backendCommandExeUsed =
        typeof j?.command_exe_used === "boolean" ? j.command_exe_used : null;
      logSttTiming({
        mode: sttMode,
        backendFastProfileUsed,
        backendFallbackUsed,
        backendCommandExeUsed,
        healthCached: !!(health as any)?.cached,
        warmed: usedWarmStream,
        healthMs: Math.max(0, Math.round(healthCheckedAtMs - sttStartedAtMs)),
        recordMs: recordedMs,
        wavConvertMs: Math.max(0, Math.round(wavReadyAtMs - recordFinishedAtMs)),
        transcribeMs: Math.max(0, Math.round(transcribeDoneAtMs - wavReadyAtMs)),
        jsonMs: Math.max(0, Math.round(jsonParsedAtMs - transcribeDoneAtMs)),
        totalMs: Math.max(0, Math.round(jsonParsedAtMs - sttStartedAtMs)),
        textLength: text.length,
      });
      if (text) return text;
    }
    logSttTiming({
      mode: sttMode,
      backendFastProfileUsed: null,
      backendFallbackUsed: null,
      backendCommandExeUsed: null,
      healthCached: !!(health as any)?.cached,
      warmed: usedWarmStream,
      healthMs: Math.max(0, Math.round(healthCheckedAtMs - sttStartedAtMs)),
      recordMs: recordedMs,
      wavConvertMs: Math.max(0, Math.round(wavReadyAtMs - recordFinishedAtMs)),
      transcribeMs: Math.max(0, Math.round(transcribeDoneAtMs - wavReadyAtMs)),
      totalMs: Math.max(0, Math.round(transcribeDoneAtMs - sttStartedAtMs)),
      textLength: 0,
      emptyText: true,
    });
    if (typeof window !== "undefined") {
      (window as any).__fm_stt_last_error = "stt-empty";
    }
    return null;
  } catch (err) {
    endMicCapture(activeMicStream);
    if (usedBackendRecorder || (typeof window !== "undefined" && (window as any).__fm_prefer_backend_stt)) {
      (window as any).__fm_stt_last_error =
        err instanceof Error ? err.message : "microphone-unavailable";
      return null;
    }
    // fall back to browser API
  }

  const SR: any = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = "de-DE";
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  return new Promise((resolve) => {
    let finished = false;
    rec.onresult = (ev: any) => {
      if (finished) return;
      finished = true;
      const txt = ev?.results?.[0]?.[0]?.transcript || "";
      resolve(txt || null);
    };
    rec.onerror = () => {
      if (finished) return;
      finished = true;
      resolve(null);
    };
    rec.onend = () => {
      if (finished) return;
      finished = true;
      resolve(null);
    };
    try {
      rec.start();
    } catch {
      resolve(null);
    }
    const abortHandler = () => {
      if (finished) return;
      finished = true;
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      resolve(null);
    };
    signal?.addEventListener("abort", abortHandler, { once: true });
    setTimeout(() => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      signal?.removeEventListener?.("abort", abortHandler);
    }, maxMs + 1500);
  });
}

function releaseIdleMic(): void {
  if (activeRecorder && activeRecorder.state !== "inactive") return;
  if (activeMicStream) {
    stopTracks(activeMicStream);
    activeMicStream = null;
  }
  activeRecorder = null;
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    releaseMicSession();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) releaseMicSession();
  });
  document.addEventListener("voice-state", (event) => {
    const next = (event as CustomEvent<{ state?: string }>).detail?.state;
    if (next === "idle" || next === "error" || next === "done") {
      releaseIdleMic();
    }
  });
}


