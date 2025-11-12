// Simple event emitter for PartnerBot messages and poses
type Pose = "idle" | "listen" | "speak" | "walk" | "wave" | "thumbs";

export const PartnerBotBus = {
  pose: "idle" as Pose,
  message: "" as string,
  subs: new Set<(data: { pose: Pose; message?: string }) => void>(),

  setPose(p: Pose) {
    this.pose = p;
    this.notify({ pose: p });
  },

  say(text: string, duration = 4000) {
    this.message = text;
    this.notify({ pose: this.pose, message: text });
    if (duration > 0) {
      setTimeout(() => {
        this.message = "";
        this.notify({ pose: this.pose });
      }, duration);
    }
  },

  poseAndSay(p: Pose, text: string, duration = 4000) {
    this.setPose(p);
    this.say(text, duration);
    if (p !== "idle" && p !== "listen" && p !== "speak") {
      setTimeout(() => {
        this.setPose("idle");
      }, Math.min(duration, 3000));
    }
  },

  notify(data: { pose: Pose; message?: string }) {
    this.subs.forEach((fn) => fn(data));
  },
};

