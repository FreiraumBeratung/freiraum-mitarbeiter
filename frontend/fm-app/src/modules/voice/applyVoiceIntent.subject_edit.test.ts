/**
 * Unit Tests: applyVoiceIntent subject-edit ruft NUR subject-setter auf (kein to/body).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processVoiceCommand } from './index';

const noop = () => {};
const fakeNavigate = noop as any;

describe('applyVoiceIntent subject-edit', () => {
  let setSubject: ReturnType<typeof vi.fn>;
  let setTo: ReturnType<typeof vi.fn>;
  let setBody: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setSubject = vi.fn();
    setTo = vi.fn();
    setBody = vi.fn();
    (globalThis as any).window.__fm_set_mail_subject = setSubject;
    (globalThis as any).window.__fm_set_mail_to = setTo;
    (globalThis as any).window.__fm_set_mail_body = setBody;
  });

  afterEach(() => {
    delete (globalThis as any).window.__fm_set_mail_subject;
    delete (globalThis as any).window.__fm_set_mail_to;
    delete (globalThis as any).window.__fm_set_mail_body;
  });

  it('Subject-Set ruft NUR __fm_set_mail_subject auf (kein to/body)', async () => {
    processVoiceCommand('ändere den betreff auf Rückruf', fakeNavigate);
    await new Promise((r) => setTimeout(r, 50));

    expect(setSubject).toHaveBeenCalledWith('Rückruf');
    expect(setTo).not.toHaveBeenCalled();
    expect(setBody).not.toHaveBeenCalled();
  });
});
