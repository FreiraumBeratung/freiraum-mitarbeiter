import { afterEach, describe, expect, it } from "vitest";

import {
  bumpDailyMailStats,
  localDayKey,
  readDailyMailStats,
  senderInitial,
} from "./fmInboxChrome";

describe("fmInboxChrome", () => {
  afterEach(() => {
    window.localStorage.removeItem("fm_daily_mail_stats_v1");
  });

  it("uses a real letter for avatars and never fetches logos", () => {
    expect(senderInitial("PlayStation", "store@sony.com")).toBe("P");
    expect(senderInitial(null, "web.de@example.com")).toBe("W");
  });

  it("counts only real sends and resets on a new local day", () => {
    const first = bumpDailyMailStats("sent");
    const second = bumpDailyMailStats("replied");
    expect(first.sentToday).toBe(1);
    expect(second.sentToday).toBe(1);
    expect(second.repliedToday).toBe(1);
    expect(readDailyMailStats().day).toBe(localDayKey());

    window.localStorage.setItem(
      "fm_daily_mail_stats_v1",
      JSON.stringify({ day: "1999-01-01", sentToday: 9, repliedToday: 4 })
    );
    const reset = readDailyMailStats();
    expect(reset.sentToday).toBe(0);
    expect(reset.repliedToday).toBe(0);
    expect(reset.day).toBe(localDayKey());
  });
});
