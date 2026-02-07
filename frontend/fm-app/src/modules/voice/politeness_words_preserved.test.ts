/**
 * Unit Test: Höflichkeitswörter (mal, eben, kurz, bitte, noch) bleiben bei Email-Intents erhalten.
 */

import { describe, it, expect } from 'vitest';
import { routeVoiceIntent } from './intent_router';

describe('Politeness words preserved for email-intent', () => {
  it('"Schreibe an Thomas Betreff Rückruf ruf mich mal eben kurz zurück" -> bodyHint must contain "ruf mich mal eben kurz zurück"', () => {
    const intent = routeVoiceIntent('Schreibe an Thomas Betreff Rückruf ruf mich mal eben kurz zurück');
    expect(intent.type).toBe('email-compose');
    const body = ((intent as any).bodyHint ?? '').toLowerCase();
    expect(body).toContain('ruf mich');
    expect(body).toContain('mal');
    expect(body).toContain('eben');
    expect(body).toContain('kurz');
    expect(body).toContain('zurück');
  });
});
