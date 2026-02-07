/**
 * Unit Tests Append-Guard: "Füge folgendes hinzu ...", "Ergänze ..." bei offenem Composer → email-append
 * Verhindert Falscherkennung als whatsapp-style-preview-smart (to=füge, subject=Kurze Info, body=Folgendes hinzu).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { routeVoiceIntent } from './intent_router';

describe('Append-Guard (composer open + append phrase → email-append)', () => {
  let originalGetBody: unknown;
  let originalSetBody: unknown;

  beforeEach(() => {
    const w = (globalThis as any).window;
    originalGetBody = w?.__fm_get_mail_body;
    originalSetBody = w?.__fm_set_mail_body;
  });

  afterEach(() => {
    const w = (globalThis as any).window;
    if (w) {
      w.__fm_get_mail_body = originalGetBody;
      w.__fm_set_mail_body = originalSetBody;
    }
  });

  it('A: composer open; "Füge folgendes hinzu. Thomas, bitte ruf mich schnell zurück." => email-append', () => {
    (globalThis as any).window.__fm_get_mail_body = () => '';
    (globalThis as any).window.__fm_set_mail_body = () => {};
    const intent = routeVoiceIntent('Füge folgendes hinzu. Thomas, bitte ruf mich schnell zurück.');
    expect(intent.type).toBe('email-append');
    if (intent.type === 'email-append') {
      expect(intent.payload.appendText).toBe('Thomas, bitte ruf mich schnell zurück.');
    }
  });

  it('B: composer open; "Ergänze noch bitte: Und es ist dringend." => email-append', () => {
    (globalThis as any).window.__fm_get_mail_body = () => '';
    (globalThis as any).window.__fm_set_mail_body = () => {};
    const intent = routeVoiceIntent('Ergänze noch bitte: Und es ist dringend.');
    expect(intent.type).toBe('email-append');
    if (intent.type === 'email-append') {
      expect(intent.payload.appendText).toBe('Und es ist dringend.');
    }
  });

  it('C: composer NOT open; "Füge folgendes hinzu ..." => NICHT email-append', () => {
    delete (globalThis as any).window.__fm_get_mail_body;
    delete (globalThis as any).window.__fm_set_mail_body;
    const intent = routeVoiceIntent('Füge folgendes hinzu ...');
    expect(intent.type).not.toBe('email-append');
  });

  it('D: composer open; "Hängen dran. Danke dir." => email-append, appendText="Danke dir."', () => {
    (globalThis as any).window.__fm_get_mail_body = () => '';
    (globalThis as any).window.__fm_set_mail_body = () => {};
    const intent = routeVoiceIntent('Hängen dran. Danke dir.');
    expect(intent.type).toBe('email-append');
    if (intent.type === 'email-append') {
      expect(intent.payload.appendText).toBe('Danke dir.');
    }
  });

  it('E: composer open; "Hänge dran: Ich bin gleich im Termin." => appendText="Ich bin gleich im Termin."', () => {
    (globalThis as any).window.__fm_get_mail_body = () => '';
    (globalThis as any).window.__fm_set_mail_body = () => {};
    const intent = routeVoiceIntent('Hänge dran: Ich bin gleich im Termin.');
    expect(intent.type).toBe('email-append');
    if (intent.type === 'email-append') {
      expect(intent.payload.appendText).toBe('Ich bin gleich im Termin.');
    }
  });

  it('F: composer open; "Häng dran danke." => appendText="danke."', () => {
    (globalThis as any).window.__fm_get_mail_body = () => '';
    (globalThis as any).window.__fm_set_mail_body = () => {};
    const intent = routeVoiceIntent('Häng dran danke.');
    expect(intent.type).toBe('email-append');
    if (intent.type === 'email-append') {
      expect(intent.payload.appendText).toBe('danke.');
    }
  });
});
