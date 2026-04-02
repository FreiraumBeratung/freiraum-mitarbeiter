import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processVoiceCommand } from "./index";

const noop = () => {};
const fakeNavigate = noop as any;

describe("applyVoiceIntent sentence-insert-nth", () => {
  let body = "";
  let setBody: ReturnType<typeof vi.fn>;
  let getBody: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    body = "Hallo Thomas. Ich bin im Termin. Ich melde mich später.";
    setBody = vi.fn((next: string) => {
      body = next;
    });
    getBody = vi.fn(() => body);
    (globalThis as any).window = (globalThis as any).window ?? {};
    (globalThis as any).window.__fm_set_mail_body = setBody;
    (globalThis as any).window.__fm_get_mail_body = getBody;
  });

  afterEach(() => {
    delete (globalThis as any).window.__fm_set_mail_body;
    delete (globalThis as any).window.__fm_get_mail_body;
  });

  it("Insert after numeric", async () => {
    processVoiceCommand("Füge nach Satz 2 ein Danke dir.", fakeNavigate);
    await new Promise((r) => setTimeout(r, 260));
    expect(body).toBe("Hallo Thomas. Ich bin im Termin. Danke dir. Ich melde mich später.");
  });

  it("Insert before numeric", async () => {
    processVoiceCommand("Füge vor Satz 3 ein Kurze Info.", fakeNavigate);
    await new Promise((r) => setTimeout(r, 260));
    expect(body).toBe("Hallo Thomas. Ich bin im Termin. Kurze Info. Ich melde mich später.");
  });

  it("Insert after ordinal word", async () => {
    processVoiceCommand("Füge nach dem zweiten Satz ein Danke dir.", fakeNavigate);
    await new Promise((r) => setTimeout(r, 260));
    expect(body).toBe("Hallo Thomas. Ich bin im Termin. Danke dir. Ich melde mich später.");
  });

  it("Insert before first", async () => {
    processVoiceCommand("Füge vor dem ersten Satz ein Hi Thomas.", fakeNavigate);
    await new Promise((r) => setTimeout(r, 260));
    expect(body).toBe("Hi Thomas. Hallo Thomas. Ich bin im Termin. Ich melde mich später.");
  });

  it("Invalid index -> no-op", async () => {
    const before = body;
    processVoiceCommand("Füge nach Satz 9 ein X.", fakeNavigate);
    await new Promise((r) => setTimeout(r, 260));
    expect(body).toBe(before);
  });

  it("ASR dot after 'ein' is sanitized", async () => {
    processVoiceCommand("Füge nach Satz 2 ein. Danke dir.", fakeNavigate);
    await new Promise((r) => setTimeout(r, 260));
    expect(body).toBe("Hallo Thomas. Ich bin im Termin. Danke dir. Ich melde mich später.");
  });

  it("ASR alias Vorsatz 3 inserts before sentence 3", async () => {
    processVoiceCommand("Füge Vorsatz 3 ein Kurze Info.", fakeNavigate);
    await new Promise((r) => setTimeout(r, 260));
    expect(body).toBe("Hallo Thomas. Ich bin im Termin. Kurze Info. Ich melde mich später.");
  });

  it("Synonym: Ergänze nach Satz 2 Danke dir", async () => {
    processVoiceCommand("Ergänze nach Satz 2 Danke dir", fakeNavigate);
    await new Promise((r) => setTimeout(r, 260));
    expect(body).toBe("Hallo Thomas. Ich bin im Termin. Danke dir. Ich melde mich später.");
  });

  it("Synonym: Pack nach Satz 2 Danke dir rein", async () => {
    processVoiceCommand("Pack nach Satz 2 Danke dir rein", fakeNavigate);
    await new Promise((r) => setTimeout(r, 260));
    expect(body).toBe("Hallo Thomas. Ich bin im Termin. Danke dir. Ich melde mich später.");
  });
});

