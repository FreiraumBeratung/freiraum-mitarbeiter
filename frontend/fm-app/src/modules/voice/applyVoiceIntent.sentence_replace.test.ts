import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processVoiceCommand } from "./index";
import { clearSelectedMailContext, setSelectedMailContext } from "../mail/selectedMailContext";

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
    clearSelectedMailContext();
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

  it("Neu: Ersetze Satz 2 mit Ich melde mich morgen", async () => {
    processVoiceCommand("Ersetze Satz 2 mit Ich melde mich morgen", fakeNavigate);
    await new Promise((r) => setTimeout(r, 260));
    expect(body).toBe("Hier ist Dennis. Ich melde mich morgen. Ich melde mich später.");
  });

  it("Neu: Tausche Satz 1 gegen Hallo Max", async () => {
    processVoiceCommand("Tausche Satz 1 gegen Hallo Max", fakeNavigate);
    await new Promise((r) => setTimeout(r, 260));
    expect(body).toBe("Hallo Max. Ich bin gerade im Termin. Ich melde mich später.");
  });

  it("Neu: Ändere Satz 3 zu Ich rufe dich heute an", async () => {
    processVoiceCommand("Ändere Satz 3 zu Ich rufe dich heute an", fakeNavigate);
    await new Promise((r) => setTimeout(r, 260));
    expect(body).toBe("Hier ist Dennis. Ich bin gerade im Termin. Ich rufe dich heute an.");
  });

  it("ASR: Ersätze Satz 3 durch Ich liebe Dich", async () => {
    processVoiceCommand("Ersätze Satz 3 durch Ich liebe Dich.", fakeNavigate);
    await new Promise((r) => setTimeout(r, 260));
    expect(body).toBe("Hier ist Dennis. Ich bin gerade im Termin. Ich liebe Dich.");
  });

  it('ASR: Ersätze Satz 1 durch "guten morgen" -> sauber ohne Zusatzzeichen', async () => {
    processVoiceCommand('Ersätze Satz 1 durch "guten morgen".', fakeNavigate);
    await new Promise((r) => setTimeout(r, 260));
    expect(body).toBe("Guten morgen. Ich bin gerade im Termin. Ich melde mich später.");
  });

  it("Neu: Ersetze Satz 5 mit Test -> no-op", async () => {
    const before = body;
    processVoiceCommand("Ersetze Satz 5 mit Test", fakeNavigate);
    await new Promise((r) => setTimeout(r, 260));
    expect(body).toBe(before);
    expect(
      warnSpy.mock.calls.some((c) => String(c[0]).includes("replace-nth no-op (index out of range)"))
    ).toBe(true);
  });

  it("ASR + Kontext: 'Löschatz 2' bleibt Satz-Delete (nicht Kontext-Reply)", async () => {
    setSelectedMailContext({
      uid: "ctx-1",
      messageId: "<ctx-1@test>",
      subject: "AW: Test",
      fromEmail: "ctx@example.com",
      fromName: "Context User",
    });

    processVoiceCommand("Löschatz 2.", fakeNavigate);
    await new Promise((r) => setTimeout(r, 260));
    expect(body).toBe("Hier ist Dennis. Ich melde mich später.");
  });

  it("ASR + Kontext: 'Machaus Satz 2 ...' bleibt Satz-Replace", async () => {
    setSelectedMailContext({
      uid: "ctx-2",
      messageId: "<ctx-2@test>",
      subject: "AW: Test",
      fromEmail: "ctx@example.com",
      fromName: "Context User",
    });

    processVoiceCommand("Machaus Satz 2 Hallo Max.", fakeNavigate);
    await new Promise((r) => setTimeout(r, 260));
    expect(body).toBe("Hier ist Dennis. Hallo Max. Ich melde mich später.");
  });

  it("ASR + Kontext: 'Löschesatz 2' bleibt Satz-Delete", async () => {
    setSelectedMailContext({
      uid: "ctx-3",
      messageId: "<ctx-3@test>",
      subject: "AW: Test",
      fromEmail: "ctx@example.com",
      fromName: "Context User",
    });

    processVoiceCommand("Löschesatz 2", fakeNavigate);
    await new Promise((r) => setTimeout(r, 260));
    expect(body).toBe("Hier ist Dennis. Ich melde mich später.");
  });

  it("Mini-Kommando + Kontext: 'Text löschen' bleibt Body-Clear", async () => {
    setSelectedMailContext({
      uid: "ctx-4",
      messageId: "<ctx-4@test>",
      subject: "AW: Test",
      fromEmail: "ctx@example.com",
      fromName: "Context User",
    });

    processVoiceCommand("Text löschen", fakeNavigate);
    await new Promise((r) => setTimeout(r, 260));
    expect(body).toBe("");
  });
});

