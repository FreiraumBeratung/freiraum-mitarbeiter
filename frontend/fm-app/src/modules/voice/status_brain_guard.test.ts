/**
 * Unit Tests: Status-Brain darf Email-Intents nicht hijacken.
 * "Schreibe an Thomas ... es geht um den Termin" darf NICHT Status-Brain (IN_MEETING) werden.
 */

import { describe, it, expect } from 'vitest';
import { routeVoiceIntent } from './intent_router';

describe('Status-Brain Guard: email-intent pattern must skip Status-Brain', () => {
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
});
