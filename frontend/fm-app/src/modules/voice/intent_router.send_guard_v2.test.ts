/**
 * Unit Tests Send-Command-Guard v2: "Lass die Nachricht zukommen" etc. bei offenem Composer → email-send
 * Verhindert Falscherkennung als whatsapp-style-preview-smart (to=lass, body=Die Nachricht zukommen).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { routeVoiceIntent } from './intent_router';

describe('Send-Command-Guard v2 (composer open + send phrase → email-send)', () => {
  let originalSendMailNow: unknown;

  beforeEach(() => {
    originalSendMailNow = (globalThis as any).window?.__fm_send_mail_now;
  });

  afterEach(() => {
    if (typeof (globalThis as any).window !== 'undefined') {
      (globalThis as any).window.__fm_send_mail_now = originalSendMailNow;
    }
  });

  it('A: composer open; input "Lass die Nachricht zukommen." => type=email-send', () => {
    (globalThis as any).window.__fm_send_mail_now = () => {};
    const intent = routeVoiceIntent('Lass die Nachricht zukommen.');
    expect(intent.type).toBe('email-send');
  });

  it('B: composer open; input "Schick die E-Mail raus." => type=email-send', () => {
    (globalThis as any).window.__fm_send_mail_now = () => {};
    const intent = routeVoiceIntent('Schick die E-Mail raus.');
    expect(intent.type).toBe('email-send');
  });

  it('C: composer open; input "Schick die Nachricht raus." => type=email-send', () => {
    (globalThis as any).window.__fm_send_mail_now = () => {};
    const intent = routeVoiceIntent('Schick die Nachricht raus.');
    expect(intent.type).toBe('email-send');
  });

  it('D: composer NOT open; input "Lass die Nachricht zukommen." => NICHT email-send', () => {
    delete (globalThis as any).window.__fm_send_mail_now;
    const intent = routeVoiceIntent('Lass die Nachricht zukommen.');
    expect(intent.type).not.toBe('email-send');
  });
});
