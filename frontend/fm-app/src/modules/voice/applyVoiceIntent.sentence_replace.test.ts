import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processVoiceCommand } from "./index";

const noop = () => {};
const fakeNavigate = noop as any;

describe("applyVoiceIntent sentence-replace", () => {
  let body = "";
  let setBody: ReturnType<typeof vi.fn>;
  let getBody: ReturnType<typeof vi.fn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    body = "Hier ist Dennis. Ich bin gerade im Termin. Ich melde mich später.";
    setBody = vi.fn((next: string) => {
      body = next;
    });
    getBody = vi.fn(() => body);
    (globalThis as any).window = (globalThis as any).window ?? {};
    (globalThis as any).window.__fm_set_mail_body = setBody;
    (globalThis as any).window.__fm_get_mail_body = getBody;
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    delete (globalThis as any).window.__fm_set_mail_body;
    delete (globalThis as any).window.__fm_get_mail_body;
    warnSpy.mockRestore();
  });

  it("T1: Ersetze den ersten Satz durch Hey Thomas.", async () => {
    processVoiceCommand("Ersetze den ersten Satz durch Hey Thomas.", fakeNavigate);
    await new Promise((r) => setTimeout(r, 260));
    expect(body).toBe("Hey Thomas. Ich bin gerade im Termin. Ich melde mich später.");
  });

  it("T2: Ersetze den letzten Satz durch Ich rufe dich morgen an.", async () => {
    processVoiceCommand("Ersetze den letzten Satz durch Ich rufe dich morgen an.", fakeNavigate);
    await new Promise((r) => setTimeout(r, 260));
    expect(body).toBe("Hier ist Dennis. Ich bin gerade im Termin. Ich rufe dich morgen an.");
  });

  it("T3: Ersetze Satz 2 durch Kurze Info.", async () => {
    processVoiceCommand("Ersetze Satz 2 durch Kurze Info.", fakeNavigate);
    await new Promise((r) => setTimeout(r, 260));
    expect(body).toBe("Hier ist Dennis. Kurze Info. Ich melde mich später.");
  });

  it("T4: Ersetze Satz 9 durch X. -> no-op + invalid index Log", async () => {
    const before = body;
    processVoiceCommand("Ersetze Satz 9 durch X.", fakeNavigate);
    await new Promise((r) => setTimeout(r, 260));
    expect(body).toBe(before);
    expect(
      warnSpy.mock.calls.some((c) => String(c[0]).includes("replace invalid index"))
    ).toBe(true);
  });

  it("ASR: Er setzte den ersten Satz durch. Hey Thomas.", async () => {
    processVoiceCommand("Er setzte den ersten Satz durch. Hey Thomas.", fakeNavigate);
    await new Promise((r) => setTimeout(r, 260));
    expect(body).toBe("Hey Thomas. Ich bin gerade im Termin. Ich melde mich später.");
  });

  it("Synonym: Mach aus Satz 2 Ich rufe dich morgen an", async () => {
    processVoiceCommand("Mach aus Satz 2 Ich rufe dich morgen an", fakeNavigate);
    await new Promise((r) => setTimeout(r, 260));
    expect(body).toBe("Hier ist Dennis. Ich rufe dich morgen an. Ich melde mich später.");
  });

  it("Synonym: Mach aus Satz 2 folgendes Ich rufe dich morgen an", async () => {
    processVoiceCommand("Mach aus Satz 2 folgendes Ich rufe dich morgen an", fakeNavigate);
    await new Promise((r) => setTimeout(r, 260));
    expect(body).toBe("Hier ist Dennis. Ich rufe dich morgen an. Ich melde mich später.");
  });
});

