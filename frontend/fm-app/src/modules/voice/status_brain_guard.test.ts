/**
 * Unit Tests: Status-Brain darf Email-Intents nicht hijacken.
 * "Schreibe an Thomas ... es geht um den Termin" darf NICHT Status-Brain (IN_MEETING) werden.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { routeVoiceIntent } from './intent_router';

describe('Status-Brain Guard: email-intent pattern must skip Status-Brain', () => {
  beforeEach(() => {
    (window as any).__fm_guided_mail_context = null;
    delete (window as any).__fm_set_mail_body;
    delete (window as any).__fm_get_mail_body;
  });

  it('"Schreibe an Thomas es geht um den Termin" must NOT be status-brain', () => {
    const intent = routeVoiceIntent('Schreibe an Thomas es geht um den Termin');
    expect(intent.type).toBe('email-compose');
    expect((intent as any).meta?.source).not.toBe('status-brain');
  });

  it('"schreibe an Thomas betreff ruckruf ruf mich zurück" must NOT be status-brain', () => {
    const intent = routeVoiceIntent('schreibe an Thomas betreff ruckruf ruf mich zurück');
    expect(intent.type).toBe('email-compose');
    expect((intent as any).meta?.source).not.toBe('status-brain');
  });

  it('"Sende an Dennis hi thomas hier ist der text" must NOT be status-brain', () => {
    const intent = routeVoiceIntent('Sende an Dennis hi thomas hier ist der text');
    expect(intent.type).toBe('email-compose');
    expect((intent as any).meta?.source).not.toBe('status-brain');
  });

  it('"Schreibe an Peter" keeps bodyHint explicitly empty', () => {
    const intent = routeVoiceIntent('Schreibe an Peter.');
    expect(intent.type).toBe('email-compose');
    expect((intent as any).toRaw).toBe('Peter');
    expect((intent as any).bodyHint).toBe('');
  });

  it('"Schreibe Hallo" treats Hallo as body, not recipient', () => {
    const intent = routeVoiceIntent('Schreibe Hallo.');
    expect(intent.type).toBe('email-compose');
    expect((intent as any).toRaw ?? null).toBe(null);
    expect((intent as any).bodyHint).toBe('Hallo');
  });

  it('guided flow: recipient follow-up keeps existing draft body', () => {
    (window as any).__fm_guided_mail_context = {
      stage: 'need_recipient',
      bodyText: 'Hallo.',
      subjectHint: 'Kurze Info',
      ts: Date.now(),
    };
    const intent = routeVoiceIntent('Peter');
    expect(intent.type).toBe('email-compose');
    expect((intent as any).toRaw).toBe('Peter');
    expect((intent as any).bodyHint).toBe('Hallo.');
  });

  it('guided flow: "neuen Text" opens replacement prompt', () => {
    (window as any).__fm_guided_mail_context = {
      stage: 'recipient_set_choice',
      bodyText: 'Hallo.',
      subjectHint: 'Kurze Info',
      recipientName: 'Peter',
      ts: Date.now(),
    };
    const intent = routeVoiceIntent('neuen Text');
    expect(intent.type).toBe('email-body-replace-all');
    expect((intent as any).payload?.text).toBe('');
  });

  it('guided flow: "behalten und senden" reuses recipient/email and enables autosend', () => {
    (window as any).__fm_guided_mail_context = {
      stage: 'recipient_set_choice',
      bodyText: 'Hallo.',
      subjectHint: 'Kurze Info',
      recipientName: 'Peter',
      recipientEmail: 'peter@example.com',
      ts: Date.now(),
    };
    const intent = routeVoiceIntent('Behalten und senden.');
    expect(intent.type).toBe('email-compose');
    expect((intent as any).toRaw).toBe('Peter');
    expect((intent as any).to).toBe('peter@example.com');
    expect((intent as any).bodyHint).toBe('Hallo.');
    expect((intent as any).meta?.autoSend).toBe(true);
  });

  it('guided flow: "neuer Text ...<inhalt>" sets inline replacement', () => {
    (window as any).__fm_guided_mail_context = {
      stage: 'recipient_set_choice',
      bodyText: 'Hallo.',
      subjectHint: 'Kurze Info',
      recipientName: 'Peter',
      recipientEmail: 'peter@example.com',
      ts: Date.now(),
    };
    const intent = routeVoiceIntent('Neuer Text ja Hallo Peter hier ist Dennis');
    expect(intent.type).toBe('email-compose');
    expect((intent as any).bodyHint).toBe('Hallo Peter hier ist Dennis');
    expect((intent as any).to).toBe('peter@example.com');
  });

  it('global fallback: "Neuer Text." routes to replace-all when composer is open', () => {
    (window as any).__fm_get_mail_body = () => 'Hallo.';
    (window as any).__fm_get_mail_subject = () => 'Kurze Info';
    (window as any).__fm_get_mail_to = () => 'peter@example.com';
    (window as any).__fm_set_mail_body = () => {};
    const intent = routeVoiceIntent('Neuer Text.');
    expect(intent.type).toBe('email-body-replace-all');
    expect((intent as any).payload?.text).toBe('');
    expect((window as any).__fm_guided_mail_context?.stage).toBe('awaiting_new_text');
  });
});
