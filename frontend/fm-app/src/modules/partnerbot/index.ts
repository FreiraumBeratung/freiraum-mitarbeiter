import { speak } from "../voice/tts";

export type PartnerBotPose =
  | "idle"
  | "listen"
  | "speak"
  | "thumbs"
  | "wave"
  | "lightbulb"
  | "confused"
  | "thinking";

type SayCallback = (text: string) => void;
type PoseCallback = (pose: PartnerBotPose) => void;
type EmoteCallback = (symbol: string) => void;

const subscribers = {
  pose: new Set<PoseCallback>(),
  say: new Set<SayCallback>(),
  emote: new Set<EmoteCallback>(),
};

function notifyPose(pose: PartnerBotPose) {
  subscribers.pose.forEach((fn) => fn(pose));
}

function notifySay(text: string, options?: { mute?: boolean }) {
  subscribers.say.forEach((fn) => fn(text));
  if (!options?.mute) {
    speak(text);
  }
}

export const PartnerBotBus = {
  onPose(cb: PoseCallback) {
    subscribers.pose.add(cb);
    return () => subscribers.pose.delete(cb);
  },
  onSay(cb: SayCallback) {
    subscribers.say.add(cb);
    return () => subscribers.say.delete(cb);
  },
  onEmote(cb: EmoteCallback) {
    subscribers.emote.add(cb);
    return () => subscribers.emote.delete(cb);
  },

  pose(pose: PartnerBotPose) {
    notifyPose(pose);
  },
  say(text: string, options?: { mute?: boolean }) {
    notifySay(text, options);
  },
  poseAndSay(pose: PartnerBotPose, text: string, options?: { mute?: boolean }) {
    notifyPose(pose);
    notifySay(text, options);
  },
  emitEmote(symbol: string) {
    subscribers.emote.forEach((fn) => fn(symbol));
  },
};

