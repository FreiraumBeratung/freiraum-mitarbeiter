import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeVoiceIntent } from "./intent_router";

describe("intent_router sentence-insert-nth", () => {
  beforeEach(() => {
    (globalThis as any).window = (globalThis as any).window ?? {};
    (globalThis as any).window.__fm_get_mail_body = vi.fn(() => "A. B. C.");
    (globalThis as any).window.__fm_set_mail_body = vi.fn();
  });

  afterEach(() => {
    if ((globalThis as any).window) {
      delete (globalThis as any).window.__fm_get_mail_body;
      delete (globalThis as any).window.__fm_set_mail_body;
    }
  });

  it("Füge nach Satz 2 ein Danke dir. -> sentence-insert-nth after", () => {
    const intent = routeVoiceIntent("Füge nach Satz 2 ein Danke dir.");
    expect(intent.type).toBe("sentence-insert-nth");
    if (intent.type === "sentence-insert-nth") {
      expect(intent.payload.position).toBe("after");
      expect(intent.payload.n).toBe(2);
      expect(intent.payload.text.length).toBeGreaterThan(0);
    }
  });

  it("Füge vor dem dritten Satz ein Kurze Info. -> sentence-insert-nth before", () => {
    const intent = routeVoiceIntent("Füge vor dem dritten Satz ein Kurze Info.");
    expect(intent.type).toBe("sentence-insert-nth");
    if (intent.type === "sentence-insert-nth") {
      expect(intent.payload.position).toBe("before");
      expect(intent.payload.n).toBe(3);
    }
  });

  it("Setze vor Satz 1 ein Hi Thomas. -> sentence-insert-nth before", () => {
    const intent = routeVoiceIntent("Setze vor Satz 1 ein Hi Thomas.");
    expect(intent.type).toBe("sentence-insert-nth");
    if (intent.type === "sentence-insert-nth") {
      expect(intent.payload.position).toBe("before");
      expect(intent.payload.n).toBe(1);
    }
  });

  it("Insert-Command darf nicht als email-compose enden", () => {
    const intent = routeVoiceIntent("Füge nach dem zweiten Satz ein Danke dir.");
    expect(intent.type).not.toBe("email-compose");
  });

  it("ASR alias: 'Vorsatz 3' -> sentence-insert-nth before n=3", () => {
    const intent = routeVoiceIntent("Füge Vorsatz 3 ein Kurze Info.");
    expect(intent.type).toBe("sentence-insert-nth");
    if (intent.type === "sentence-insert-nth") {
      expect(intent.payload.position).toBe("before");
      expect(intent.payload.n).toBe(3);
    }
    expect(intent.type).not.toBe("email-compose");
  });

  it("ASR alias: 'Füge Vorsatz 3 hinzu. Hallo.' -> sentence-insert-nth before n=3", () => {
    const intent = routeVoiceIntent("Füge Vorsatz 3 hinzu. Hallo.");
    expect(intent.type).toBe("sentence-insert-nth");
    if (intent.type === "sentence-insert-nth") {
      expect(intent.payload.position).toBe("before");
      expect(intent.payload.n).toBe(3);
      expect(intent.payload.text).toBe("Hallo");
    }
    expect(intent.type).not.toBe("email-compose");
  });

  it("ASR alias no-op: 'Füge Vorsatz 3 hinzu' -> unknown", () => {
    const intent = routeVoiceIntent("Füge Vorsatz 3 hinzu");
    expect(intent.type).toBe("unknown");
    expect(intent.type).not.toBe("email-compose");
  });

  it("Synonym: Ergänze nach Satz 2 ... -> sentence-insert-nth after", () => {
    const intent = routeVoiceIntent("Ergänze nach Satz 2 Danke dir");
    expect(intent.type).toBe("sentence-insert-nth");
    if (intent.type === "sentence-insert-nth") {
      expect(intent.payload.position).toBe("after");
      expect(intent.payload.n).toBe(2);
    }
    expect(intent.type).not.toBe("email-compose");
  });

  it("Synonym: Ergänze nach Satz 2. ... -> sentence-insert-nth after", () => {
    const intent = routeVoiceIntent("Ergänze nach Satz 2. Danke dir");
    expect(intent.type).toBe("sentence-insert-nth");
    if (intent.type === "sentence-insert-nth") {
      expect(intent.payload.position).toBe("after");
      expect(intent.payload.n).toBe(2);
    }
    expect(intent.type).not.toBe("email-compose");
    expect(intent.type).not.toBe("email-append");
  });

  it("Synonym: Pack nach Satz 2 ... rein -> sentence-insert-nth after", () => {
    const intent = routeVoiceIntent("Pack nach Satz 2 Danke dir rein");
    expect(intent.type).toBe("sentence-insert-nth");
    if (intent.type === "sentence-insert-nth") {
      expect(intent.payload.position).toBe("after");
      expect(intent.payload.n).toBe(2);
    }
    expect(intent.type).not.toBe("email-compose");
  });

  it("Synonym: Pack nach Satz 2. ... rein -> sentence-insert-nth after", () => {
    const intent = routeVoiceIntent("Pack nach Satz 2. Danke dir rein");
    expect(intent.type).toBe("sentence-insert-nth");
    if (intent.type === "sentence-insert-nth") {
      expect(intent.payload.position).toBe("after");
      expect(intent.payload.n).toBe(2);
    }
    expect(intent.type).not.toBe("email-compose");
    expect(intent.type).not.toBe("email-append");
  });

  it("Synonym: Ergänze nach Satz 2 -> no-op, kein append", () => {
    const intent = routeVoiceIntent("Ergänze nach Satz 2");
    expect(intent.type).toBe("unknown");
    expect(intent.type).not.toBe("email-append");
    expect(intent.type).not.toBe("email-compose");
  });

  it("Insert-before synonym: Ergänze vor Satz 2 Kurze Info -> before n=2", () => {
    const intent = routeVoiceIntent("Ergänze vor Satz 2 Kurze Info");
    expect(intent.type).toBe("sentence-insert-nth");
    if (intent.type === "sentence-insert-nth") {
      expect(intent.payload.position).toBe("before");
      expect(intent.payload.n).toBe(2);
      expect(intent.payload.text).toBe("Kurze Info");
    }
    expect(intent.type).not.toBe("email-append");
    expect(intent.type).not.toBe("email-compose");
  });

  it("Insert-before synonym: Ergänze vor Satz 2. Kurze Info -> before n=2", () => {
    const intent = routeVoiceIntent("Ergänze vor Satz 2. Kurze Info");
    expect(intent.type).toBe("sentence-insert-nth");
    if (intent.type === "sentence-insert-nth") {
      expect(intent.payload.position).toBe("before");
      expect(intent.payload.n).toBe(2);
    }
    expect(intent.type).not.toBe("email-append");
    expect(intent.type).not.toBe("email-compose");
  });

  it("Insert-before synonym: Pack vor Satz 3 Hallo rein -> before n=3", () => {
    const intent = routeVoiceIntent("Pack vor Satz 3 Hallo rein");
    expect(intent.type).toBe("sentence-insert-nth");
    if (intent.type === "sentence-insert-nth") {
      expect(intent.payload.position).toBe("before");
      expect(intent.payload.n).toBe(3);
    }
    expect(intent.type).not.toBe("email-append");
    expect(intent.type).not.toBe("email-compose");
  });

  it("Insert-before ordinal: Ergänze vor dem zweiten Satz Kurze Info -> before n=2", () => {
    const intent = routeVoiceIntent("Ergänze vor dem zweiten Satz Kurze Info");
    expect(intent.type).toBe("sentence-insert-nth");
    if (intent.type === "sentence-insert-nth") {
      expect(intent.payload.position).toBe("before");
      expect(intent.payload.n).toBe(2);
    }
    expect(intent.type).not.toBe("email-append");
    expect(intent.type).not.toBe("email-compose");
  });

  it("Insert-before synonym no-op: Ergänze vor Satz 2 -> unknown", () => {
    const intent = routeVoiceIntent("Ergänze vor Satz 2");
    expect(intent.type).toBe("unknown");
    expect(intent.type).not.toBe("email-append");
    expect(intent.type).not.toBe("email-compose");
  });

  it("ASR alias before: Ergänze Vorsatz 2 Kurze Info -> before n=2", () => {
    const intent = routeVoiceIntent("Ergänze Vorsatz 2 Kurze Info");
    expect(intent.type).toBe("sentence-insert-nth");
    if (intent.type === "sentence-insert-nth") {
      expect(intent.payload.position).toBe("before");
      expect(intent.payload.n).toBe(2);
      expect(intent.payload.text).toBe("Kurze Info");
    }
    expect(intent.type).not.toBe("email-append");
    expect(intent.type).not.toBe("email-compose");
  });

  it("ASR alias before: Ergänze Vorsatz 2. Kurze Info -> before n=2", () => {
    const intent = routeVoiceIntent("Ergänze Vorsatz 2. Kurze Info");
    expect(intent.type).toBe("sentence-insert-nth");
    if (intent.type === "sentence-insert-nth") {
      expect(intent.payload.position).toBe("before");
      expect(intent.payload.n).toBe(2);
      expect(intent.payload.text).toBe("Kurze Info");
    }
    expect(intent.type).not.toBe("email-append");
    expect(intent.type).not.toBe("email-compose");
  });

  it("ASR alias before: Pack Vorsatz 3 Guten Tag rein -> before n=3", () => {
    const intent = routeVoiceIntent("Pack Vorsatz 3 Guten Tag rein");
    expect(intent.type).toBe("sentence-insert-nth");
    if (intent.type === "sentence-insert-nth") {
      expect(intent.payload.position).toBe("before");
      expect(intent.payload.n).toBe(3);
    }
    expect(intent.type).not.toBe("email-append");
    expect(intent.type).not.toBe("email-compose");
  });

  it("ASR alias before: Pack Vorsatz 3. Guten Tag rein -> before n=3", () => {
    const intent = routeVoiceIntent("Pack Vorsatz 3. Guten Tag rein");
    expect(intent.type).toBe("sentence-insert-nth");
    if (intent.type === "sentence-insert-nth") {
      expect(intent.payload.position).toBe("before");
      expect(intent.payload.n).toBe(3);
    }
    expect(intent.type).not.toBe("email-append");
    expect(intent.type).not.toBe("email-compose");
  });

  it("ASR alias before no-op: Ergänze Vorsatz 2 -> unknown", () => {
    const intent = routeVoiceIntent("Ergänze Vorsatz 2");
    expect(intent.type).toBe("unknown");
    expect(intent.type).not.toBe("email-append");
    expect(intent.type).not.toBe("email-compose");
  });

  it("Hauptrouter before: Ergänze vor Satz 2 Guten Tag -> before n=2", () => {
    const intent = routeVoiceIntent("Ergänze vor Satz 2 Guten Tag");
    expect(intent.type).toBe("sentence-insert-nth");
    if (intent.type === "sentence-insert-nth") {
      expect(intent.payload.position).toBe("before");
      expect(intent.payload.n).toBe(2);
      expect(intent.payload.text).toBe("Guten Tag");
    }
    expect(intent.type).not.toBe("email-append");
    expect(intent.type).not.toBe("email-compose");
  });
});

