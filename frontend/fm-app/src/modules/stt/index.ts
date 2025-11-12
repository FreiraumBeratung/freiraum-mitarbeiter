export async function recordAndTranscribe(
  maxMs = 6000,
  signal?: AbortSignal
): Promise<string | null> {
  if (signal?.aborted) return null;
  // Prefer backend STT first
  try {
    const health = await fetch("http://127.0.0.1:30521/api/stt/health").then((r) =>
      r.json()
    );
    if (health?.provider === "local" && health?.ok) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      let resolved = false;
      const done = new Promise<Blob>((resolve) => {
        recorder.ondataavailable = (e) => chunks.push(e.data);
        recorder.onstop = () => resolve(new Blob(chunks, { type: "audio/webm" }));
      });
      const abortHandler = () => {
        if (resolved) return;
        resolved = true;
        try {
          if (recorder.state !== "inactive") recorder.stop();
        } catch {
          /* ignore */
        }
        stream.getTracks().forEach((track) => track.stop());
      };
      signal?.addEventListener("abort", abortHandler, { once: true });
      recorder.start();
      await new Promise((res) => setTimeout(res, maxMs));
      recorder.stop();
      const audioBlob = await done;
      stream.getTracks().forEach((track) => track.stop());
      signal?.removeEventListener("abort", abortHandler);
      if (signal?.aborted) return null;

      const form = new FormData();
      form.append("file", audioBlob, "voice.webm");
      const resp = await fetch("http://127.0.0.1:30521/api/stt/transcribe", {
        method: "POST",
        body: form,
      });
      if (resp.ok) {
        const j = await resp.json();
        const text = (j?.text || "").trim();
        if (text) return text;
      }
    }
  } catch {
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


