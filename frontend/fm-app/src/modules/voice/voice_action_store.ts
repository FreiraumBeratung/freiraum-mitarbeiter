export type VoiceActionKind = "navigate" | "email-compose" | "other";

export interface VoiceActionEntry {
  kind: VoiceActionKind;
  description: string;
  timestamp: number;
}

let lastAction: VoiceActionEntry | null = null;

export function setLastAction(entry: Omit<VoiceActionEntry, "timestamp">) {
  lastAction = {
    ...entry,
    timestamp: Date.now(),
  };
  console.log("[fm-voice] lastAction set:", lastAction);
}

export function getLastAction(): VoiceActionEntry | null {
  return lastAction;
}

