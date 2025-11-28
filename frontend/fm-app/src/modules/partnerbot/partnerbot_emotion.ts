import { PartnerBotBus } from "./index";

export type EmotionKind = "success" | "idea" | "greeting" | "error" | "thinking" | "idle-pulse";

export function triggerEmotion(kind: EmotionKind) {
  switch (kind) {
    case "success":
      PartnerBotBus.pose("thumbs");
      PartnerBotBus.emitEmote("👍");
      return;
    case "idea":
      PartnerBotBus.pose("lightbulb");
      PartnerBotBus.emitEmote("💡");
      return;
    case "greeting":
      PartnerBotBus.pose("wave");
      PartnerBotBus.emitEmote("👋");
      return;
    case "error":
      PartnerBotBus.pose("confused");
      PartnerBotBus.emitEmote("❓");
      return;
    case "thinking":
      PartnerBotBus.pose("thinking");
      PartnerBotBus.emitEmote("🤔");
      return;
    case "idle-pulse":
      PartnerBotBus.pose("idle");
      PartnerBotBus.emitEmote("•");
      return;
  }
}

