// frontend/fm-app/src/modules/ai/index.ts

export interface AiChatOptions {
  context?: string;
}

export interface AiChatResponse {
  reply: string;
}

// Falls es bereits eine zentrale API-Base gibt, diese nutzen.
// Ansonsten hier hart auf localhost:30521 verweisen.
const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ||
  "http://127.0.0.1:30521";

export async function askAssistant(
  message: string,
  options: AiChatOptions = {}
): Promise<string> {
  const payload = {
    message,
    context: options.context ?? null,
  };

  console.log("[fm-ai] Request an /api/ai/chat gesendet:", payload);

  const res = await fetch(`${API_BASE}/api/ai/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error("[fm-ai] KI-Request fehlgeschlagen:", res.status, await res.text());
    throw new Error("KI-Antwort konnte nicht geladen werden.");
  }

  const data = (await res.json()) as AiChatResponse;
  console.log("[fm-ai] Response von /api/ai/chat:", data);
  return data.reply;
}

