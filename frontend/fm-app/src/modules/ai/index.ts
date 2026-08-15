// frontend/fm-app/src/modules/ai/index.ts

export interface AiChatOptions {
  context?: string;
}

export interface AiChatResponse {
  reply: string;
}

import { backendBase } from "../../lib/backendBase";

const API_BASE = backendBase();

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

