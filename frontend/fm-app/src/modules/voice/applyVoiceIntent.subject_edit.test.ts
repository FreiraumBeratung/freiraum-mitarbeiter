/**
 * Unit Tests: applyVoiceIntent subject-edit ruft NUR subject-setter auf (kein to/body).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processVoiceCommand } from './index';
import { clearSelectedMailContext, setSelectedMailContext } from '../mail/selectedMailContext';

const noop = () => {};
const fakeNavigate = noop as any;

describe('applyVoiceIntent subject-edit', () => {
  let setSubject: ReturnType<typeof vi.fn>;
  let getSubject: ReturnType<typeof vi.fn>;
  let setTo: ReturnType<typeof vi.fn>;
  let setBody: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setSubject = vi.fn();
    getSubject = vi.fn(() => "Hallo");
    setTo = vi.fn();
    setBody = vi.fn();
    (globalThis as any).window.__fm_set_mail_subject = setSubject;
    (globalThis as any).window.__fm_get_mail_subject = getSubject;
    (globalThis as any).window.__fm_set_mail_to = setTo;
    (globalThis as any).window.__fm_set_mail_body = setBody;
  });

  afterEach(() => {
    delete (globalThis as any).window.__fm_set_mail_subject;
    delete (globalThis as any).window.__fm_get_mail_subject;
    delete (globalThis as any).window.__fm_set_mail_to;
    delete (globalThis as any).window.__fm_set_mail_body;
    clearSelectedMailContext();
  });

  it('Subject-Set ruft NUR __fm_set_mail_subject auf (kein to/body)', async () => {
    processVoiceCommand('ändere den betreff auf Rückruf', fakeNavigate);
    await new Promise((r) => setTimeout(r, 50));

    expect(setSubject).toHaveBeenCalledWith('Rückruf');
    expect(setTo).not.toHaveBeenCalled();
    expect(setBody).not.toHaveBeenCalled();
  });

  it('Subject-Set via "den betreff zu ..." ruft NUR __fm_set_mail_subject auf', async () => {
    processVoiceCommand('den betreff zu guten tag', fakeNavigate);
    await new Promise((r) => setTimeout(r, 50));

    expect(String(setSubject.mock.calls[0]?.[0] ?? "").toLowerCase()).toBe('guten tag');
    expect(setTo).not.toHaveBeenCalled();
    expect(setBody).not.toHaveBeenCalled();
  });

  it('Subject-Set via "den betreff ..." ruft NUR __fm_set_mail_subject auf', async () => {
    processVoiceCommand('den betreff guten tag', fakeNavigate);
    await new Promise((r) => setTimeout(r, 50));

    expect(String(setSubject.mock.calls[0]?.[0] ?? "").toLowerCase()).toBe('guten tag');
    expect(setTo).not.toHaveBeenCalled();
    expect(setBody).not.toHaveBeenCalled();
  });

  it('ASR + Kontext: "änder im betreff auf ..." bleibt Subject-Set', async () => {
    setSelectedMailContext({
      uid: "ctx-subject",
      messageId: "<ctx-subject@test>",
      subject: "AW: Test",
      fromEmail: "ctx@example.com",
      fromName: "Context User",
    });
    processVoiceCommand('änder im betreff auf rückruf morgen', fakeNavigate);
    await new Promise((r) => setTimeout(r, 50));

    expect(setSubject).toHaveBeenCalledWith('Rückruf Morgen');
    expect(setTo).not.toHaveBeenCalled();
    expect(setBody).not.toHaveBeenCalled();
  });

  it('ASR + Kontext: "im betreff Hallo durch Tag" bleibt Subject-Replace-Part', async () => {
    setSelectedMailContext({
      uid: "ctx-subject-replace",
      messageId: "<ctx-subject-replace@test>",
      subject: "AW: Hallo",
      fromEmail: "ctx@example.com",
      fromName: "Context User",
    });
    processVoiceCommand('im betreff hallo durch tag', fakeNavigate);
    await new Promise((r) => setTimeout(r, 80));

    expect(setSubject).toHaveBeenCalled();
    const finalSubject = String(setSubject.mock.calls.at(-1)?.[0] ?? "");
    expect(finalSubject.toLowerCase()).toContain("tag");
    expect(finalSubject.toLowerCase()).not.toContain("hallo");
  });

  it('ASR + Kontext: "änder im betreff Angebot zu Anfrage" bleibt Subject-Replace-Part', async () => {
    setSelectedMailContext({
      uid: "ctx-subject-replace-zu",
      messageId: "<ctx-subject-replace-zu@test>",
      subject: "Angebot Nr. 1935",
      fromEmail: "ctx@example.com",
      fromName: "Context User",
    });
    getSubject.mockImplementation(() => "Angebot Nr. 1935");

    processVoiceCommand("änder im betreff angebot zu anfrage", fakeNavigate);
    await new Promise((r) => setTimeout(r, 80));

    expect(setSubject).toHaveBeenCalled();
    const finalSubject = String(setSubject.mock.calls.at(-1)?.[0] ?? "");
    expect(finalSubject.toLowerCase()).toContain("anfrage");
    expect(finalSubject.toLowerCase()).not.toContain("angebot");
  });
});
