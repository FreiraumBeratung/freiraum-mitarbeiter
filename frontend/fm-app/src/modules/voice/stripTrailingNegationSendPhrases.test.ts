/**
 * Unit Tests für stripTrailingNegationSendPhrases
 * 
 * Testet das Entfernen von trailing Negations-Kontrollphrasen
 */

import { describe, it, expect } from 'vitest';

// Import der Funktion - sie ist aktuell nicht exported, daher inline test
// Wir testen das Verhalten indirekt über routeVoiceIntent

import { routeVoiceIntent } from './intent_router';

describe('stripTrailingNegationSendPhrases (via lass-wissen)', () => {
  it('removes "aber nicht senden" at end', () => {
    const input = 'Lass Thomas bitte folgendes wissen. Ich bin gleich da, aber nicht senden.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.bodyHint).toBeTruthy();
      // Body sollte OHNE ", aber nicht senden" sein
      expect(result.bodyHint?.toLowerCase()).not.toContain('aber nicht');
      expect(result.bodyHint?.toLowerCase()).not.toContain('nicht senden');
      expect(result.bodyHint?.toLowerCase()).toContain('ich bin gleich da');
      // AutoSend sollte false sein (negation)
      expect(result.meta?.autoSend).toBe(false);
    }
  });

  it('removes "aber nicht schicken" at end', () => {
    const input = 'Lass Thomas folgendes wissen. Ich bin gleich da, aber nicht schicken!';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.bodyHint?.toLowerCase()).not.toContain('aber nicht');
      expect(result.bodyHint?.toLowerCase()).not.toContain('nicht schicken');
      expect(result.bodyHint?.toLowerCase()).toContain('ich bin gleich da');
    }
  });

  it('does NOT change text with "aber nicht" but no send verb', () => {
    const input = 'Lass Thomas folgendes wissen. Ich bin gleich da, aber nicht pünktlich.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      // "aber nicht pünktlich" sollte bleiben (kein Send-Verb)
      expect(result.bodyHint?.toLowerCase()).toContain('aber nicht');
      expect(result.bodyHint?.toLowerCase()).toContain('nicht pünktlich');
    }
  });

  it('removes "noch nicht senden" at end', () => {
    const input = 'Lass Thomas bitte folgendes wissen. Ich bin gleich da, noch nicht senden';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.bodyHint?.toLowerCase()).not.toContain('noch nicht');
      expect(result.bodyHint?.toLowerCase()).not.toContain('nicht senden');
      expect(result.bodyHint?.toLowerCase()).toContain('ich bin gleich da');
      expect(result.meta?.autoSend).toBe(false);
    }
  });
});
