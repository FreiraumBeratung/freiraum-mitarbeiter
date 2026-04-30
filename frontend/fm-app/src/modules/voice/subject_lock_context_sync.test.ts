import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncSubjectLockWithContext } from "./index";

describe("syncSubjectLockWithContext", () => {
  beforeEach(() => {
    (globalThis as any).window = (globalThis as any).window ?? {};
    (globalThis as any).window.__fm_subject_locked = false;
    (globalThis as any).window.__fm_subject_locked_value = null;
    (globalThis as any).window.__fm_subject_lock_context_uid = null;
    (globalThis as any).window.__fm_subject_manually_edited = false;
    (globalThis as any).window.__fm_wizard4_last_draft = { meta: { subjectLocked: true } };
  });

  afterEach(() => {
    delete (globalThis as any).window.__fm_subject_locked;
    delete (globalThis as any).window.__fm_subject_locked_value;
    delete (globalThis as any).window.__fm_subject_lock_context_uid;
    delete (globalThis as any).window.__fm_subject_manually_edited;
    delete (globalThis as any).window.__fm_wizard4_last_draft;
  });

  it("stores first context uid without reset", () => {
    syncSubjectLockWithContext({ uid: "ctx-1" });
    expect((globalThis as any).window.__fm_subject_lock_context_uid).toBe("ctx-1");
    expect((globalThis as any).window.__fm_subject_locked).toBe(false);
  });

  it("resets lock flags when context uid changes", () => {
    (globalThis as any).window.__fm_subject_locked = true;
    (globalThis as any).window.__fm_subject_locked_value = "Guten Tag";
    (globalThis as any).window.__fm_subject_lock_context_uid = "ctx-1";
    (globalThis as any).window.__fm_subject_manually_edited = true;

    syncSubjectLockWithContext({ uid: "ctx-2" });

    expect((globalThis as any).window.__fm_subject_locked).toBe(false);
    expect((globalThis as any).window.__fm_subject_locked_value).toBeNull();
    expect((globalThis as any).window.__fm_subject_manually_edited).toBe(false);
    expect((globalThis as any).window.__fm_subject_lock_context_uid).toBe("ctx-2");
    expect((globalThis as any).window.__fm_wizard4_last_draft?.meta?.subjectLocked).toBe(false);
  });
});

