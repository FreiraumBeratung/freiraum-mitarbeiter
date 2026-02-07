/**
 * Unit Tests für Send-Command-Guard: Reiner Send-Befehl bei offenem Composer → email-send (kein AI)
 *
 * Verhindert, dass "Abschicken." bei PreviewOnly-Draft den AI-Fallback triggert.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { routeVoiceIntent } from './intent_router';

describe('Send-Command-Guard (Composer open + pure send phrase → email-send)', () => {
  let originalSendMailNow: unknown;

  beforeEach(() => {
    originalSendMailNow = (globalThis as any).window?.__fm_send_mail_now;
  });

  afterEach(() => {
    if (typeof (globalThis as any).window !== 'undefined') {
      (globalThis as any).window.__fm_send_mail_now = originalSendMailNow;
    }
  });

  it('A: composer open, "Abschicken." → email-send (kein ai-chat)', () => {
    (globalThis as any).window.__fm_send_mail_now = () => {};
    const intent = routeVoiceIntent('Abschicken.');
    expect(intent.type).toBe('email-send');
    expect(intent).not.toMatchObject({ type: 'ai-chat' });
  });

  it('B: composer closed, "Abschicken." → NICHT email-send', () => {
    delete (globalThis as any).window.__fm_send_mail_now;
    const intent = routeVoiceIntent('Abschicken.');
    expect(intent.type).not.toBe('email-send');
    expect(intent.type).toBe('ai-chat');
  });

  it('C: composer open, "Schick die Nachricht raus." → email-send', () => {
    (globalThis as any).window.__fm_send_mail_now = () => {};
    const intent = routeVoiceIntent('Schick die Nachricht raus.');
    expect(intent.type).toBe('email-send');
  });
});
