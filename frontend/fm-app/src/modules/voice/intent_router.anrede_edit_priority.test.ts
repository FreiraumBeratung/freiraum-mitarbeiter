import { describe, expect, it } from "vitest";
import { routeVoiceIntent } from "./intent_router";

describe("intent-router anrede edit priority", () => {
  it('"Ersetze die Anrede durch Hallo." -> wizard2-edit-anrede (not email-compose)', () => {
    const intent = routeVoiceIntent("Ersetze die Anrede durch Hallo.");
    expect(intent.type).toBe("wizard2-edit-anrede");
    expect(intent.type).not.toBe("email-compose");
    if (intent.type === "wizard2-edit-anrede") {
      expect(intent.newAnrede).toBe("Hallo");
    }
  });

  it('"Mach aus der Anrede Guten Tag." -> wizard2-edit-anrede', () => {
    const intent = routeVoiceIntent("Mach aus der Anrede Guten Tag.");
    expect(intent.type).toBe("wizard2-edit-anrede");
    if (intent.type === "wizard2-edit-anrede") {
      expect(intent.newAnrede).toBe("Guten Tag");
    }
  });

  it('"Mach aus der Anrede Pizza." -> wizard2-edit-anrede (free greeting value)', () => {
    const intent = routeVoiceIntent("Mach aus der Anrede Pizza.");
    expect(intent.type).toBe("wizard2-edit-anrede");
    expect(intent.type).not.toBe("ai-chat");
    if (intent.type === "wizard2-edit-anrede") {
      expect(intent.newAnrede).toBe("Pizza");
    }
  });

  it('"Anrede: Team Freiraum" -> wizard2-edit-anrede', () => {
    const intent = routeVoiceIntent("Anrede: Team Freiraum");
    expect(intent.type).toBe("wizard2-edit-anrede");
    if (intent.type === "wizard2-edit-anrede") {
      expect(intent.newAnrede).toBe("Team Freiraum");
    }
  });

  it('"Setze die Anrede auf Moin zusammen." -> wizard2-edit-anrede', () => {
    const intent = routeVoiceIntent("Setze die Anrede auf Moin zusammen.");
    expect(intent.type).toBe("wizard2-edit-anrede");
    if (intent.type === "wizard2-edit-anrede") {
      expect(intent.newAnrede).toBe("Moin zusammen");
    }
  });
});

