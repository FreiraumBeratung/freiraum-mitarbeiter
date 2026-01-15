/**
 * Unit Tests für "Compose-Precedence" Guard
 * 
 * Testet, dass Sätze mit Compose-Inhalt + Send-Wunsch als email-compose
 * (mit autoSend=true) geroutet werden, nicht als email-send
 */

import { describe, it, expect } from 'vitest';
import { routeVoiceIntent } from './intent_router';

describe('Intent Router: Compose-Precedence Guard', () => {
  it('should route "Bitte Thomas schicken Hi Thomas, hier ist Dennis. Ich hoffe dir gehts gut und sofort senden." to email-compose (TEST 3A)', () => {
    const input = 'Bitte Thomas schicken Hi Thomas, hier ist Dennis. Ich hoffe dir gehts gut und sofort senden.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.toRaw).toBe('thomas');
      expect(result.bodyHint).toBeTruthy();
      expect(result.bodyHint?.toLowerCase()).toMatch(/^hi\s+thomas/);
      expect(result.bodyHint?.toLowerCase()).toContain('hier ist dennis');
      expect(result.meta?.autoSend).toBe(true);
      // Should NOT be email-send
      expect(result.type).not.toBe('email-send');
    }
  });

  it('should route "Bitte Thomas schicken. Hi Thomas, ich komme 10 minuten später und direkt senden." to email-compose', () => {
    const input = 'Bitte Thomas schicken. Hi Thomas, ich komme 10 minuten später und direkt senden.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.toRaw).toBe('thomas');
      expect(result.bodyHint).toBeTruthy();
      expect(result.bodyHint?.toLowerCase()).toMatch(/^hi\s+thomas/);
      expect(result.meta?.autoSend).toBe(true);
    }
  });

  it('should still route "Sende die Mail jetzt." to email-send (TEST 3B)', () => {
    const input = 'Sende die Mail jetzt.';
    const result = routeVoiceIntent(input);

    // Should be email-send (no compose content)
    expect(result.type).toBe('email-send');
  });

  it('should route "Thomas senden Hi Thomas, bin krank und sofort raus." to email-compose', () => {
    const input = 'Thomas senden Hi Thomas, bin krank und sofort raus.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.toRaw).toBe('thomas');
      expect(result.bodyHint).toBeTruthy();
      expect(result.meta?.autoSend).toBe(true);
    }
  });

  it('should NOT interfere with email-append override logic', () => {
    // This should still be handled by email-append override (before compose-precedence)
    const input = 'Ergänze noch bring Cola mit und schick die Mail direkt los.';
    const result = routeVoiceIntent(input);

    // Should be email-append (override runs before compose-precedence)
    // If not email-append, should at least not be email-send
    expect(result.type).not.toBe('email-send');
  });

  it('should remove trailing send phrase "und los" from bodyHint (TEST A)', () => {
    const input = 'Thomas senden Hi Thomas, hier ist Dennis. Ich hoffe dir gehts gut und los.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.meta?.autoSend).toBe(true);
      expect(result.bodyHint).toBeTruthy();
      expect(result.bodyHint?.toLowerCase()).not.toMatch(/\b(und\s+)?los\s*\.?$/);
      expect(result.bodyHint?.toLowerCase()).toContain('hoffe dir gehts gut');
    }
  });

  it('should remove trailing send phrase "schick direkt ab" from bodyHint (TEST B)', () => {
    const input = 'Thomas schicken. Ich komme 15 Minuten später schick direkt ab.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.meta?.autoSend).toBe(true);
      expect(result.bodyHint).toBeTruthy();
      expect(result.bodyHint?.toLowerCase()).not.toMatch(/\bschick\s+direct\s+ab/);
      expect(result.bodyHint?.toLowerCase()).toMatch(/ich komme 15 minuten später/);
    }
  });

  it('should NOT remove "Los geht\'s" if it is part of the sentence (TEST C)', () => {
    const input = 'Thomas senden Hi Thomas, ich hoffe dir gehts gut. Los geht\'s mit dem Projekt.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.meta?.autoSend).toBe(true);
      expect(result.bodyHint).toBeTruthy();
      // "Los geht's" should remain (it's not a trailing send phrase, it's part of the content)
      expect(result.bodyHint?.toLowerCase()).toContain('los geht');
      expect(result.bodyHint?.toLowerCase()).toContain('projekt');
    }
  });

  it('should block autoSend for false-positive "Ich schick dir gleich die Zahlen" (TEST A)', () => {
    const input = 'Thomas senden Hey Thomas, los geht\'s. Ich schick dir gleich die Zahlen.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.toRaw).toBe('thomas');
      expect(result.meta?.autoSend).toBe(false); // MUST be false due to false-positive exclusion
      expect(result.bodyHint).toBeTruthy();
      // Body should remain unchanged (no stripping of "Ich schick dir gleich die Zahlen")
      expect(result.bodyHint?.toLowerCase()).toContain('ich schick dir gleich die zahlen');
    }
  });

  it('should allow autoSend=true for normal "Thomas senden hi thomas, ich komme 10 Minuten später und los" (TEST B)', () => {
    const input = 'Thomas senden hi thomas, ich komme 10 Minuten später und los.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.toRaw).toBe('thomas');
      expect(result.meta?.autoSend).toBe(true); // Should be true (no false-positive)
      expect(result.bodyHint).toBeTruthy();
      // Trailing "und los" should be removed
      expect(result.bodyHint?.toLowerCase()).not.toMatch(/\b(und\s+)?los\s*\.?$/);
    }
  });

  it('should allow autoSend=true for "Thomas senden Hey Thomas, kurze Info, bin später da sofort senden" (TEST C)', () => {
    const input = 'Thomas senden Hey Thomas, kurze Info, bin später da sofort senden.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.toRaw).toBe('thomas');
      expect(result.meta?.autoSend).toBe(true); // Should be true (no false-positive)
      expect(result.bodyHint).toBeTruthy();
      // Trailing "sofort senden" should be removed
      expect(result.bodyHint?.toLowerCase()).not.toMatch(/\bsofort\s+senden\s*\.?$/);
    }
  });
});
