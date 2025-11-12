export const voiceState = {
  lastLeadTaskId: null as string | null,
  lastOSMResult: null as any | null,
};

// Voice UI state for PartnerBot avatar
export const voiceUi = {
  pose: "idle" as "idle" | "listen" | "speak",
  subs: new Set<(p: "idle" | "listen" | "speak") => void>(),
  set(p: "idle" | "listen" | "speak") {
    this.pose = p;
    this.subs.forEach((fn) => fn(p));
  },
};




