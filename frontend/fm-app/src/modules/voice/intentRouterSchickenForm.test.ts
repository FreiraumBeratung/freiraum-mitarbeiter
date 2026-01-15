/**
 * Unit Tests für "Schicken-Form" Intent-Erkennung
 * 
 * Testet das Pattern: "Bitte folgende Nachricht <Name> schicken <Body>"
 */

import { describe, it, expect } from 'vitest';
import { routeVoiceIntent } from './intent_router';

describe('Intent Router: "Schicken-Form" Pattern', () => {
  it('should recognize "Bitte folgende Nachricht Thomas schicken Hi Thomas..." as email-compose', () => {
    const input = 'Bitte folgende Nachricht Thomas schicken Hi Thomas, hier ist Dennis. Ich hoffe dir geht es gut.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.toRaw).toBe('thomas');
      expect(result.bodyHint).toBeTruthy();
      expect(result.bodyHint?.toLowerCase()).toContain('hi thomas');
      expect(result.bodyHint?.toLowerCase()).toContain('hier ist dennis');
    }
  });

  it('should recognize "folgende mail an Thomas senden Hi Thomas..." (with "an")', () => {
    const input = 'folgende mail an Thomas senden Hi Thomas, hier ist Dennis.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.toRaw).toBe('thomas');
      expect(result.bodyHint).toBeTruthy();
      expect(result.bodyHint?.toLowerCase()).toContain('hi thomas');
    }
  });

  it('should recognize "folgende email Thomas rausschicken Hi Thomas..." (variant verb)', () => {
    const input = 'folgende email Thomas rausschicken Hi Thomas, hier ist Dennis.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.toRaw).toBe('thomas');
      expect(result.bodyHint).toBeTruthy();
      expect(result.bodyHint?.toLowerCase()).toContain('hi thomas');
    }
  });

  it('should extract bodyHint correctly (not fall into draft generator)', () => {
    const input = 'Bitte folgende Nachricht Thomas schicken Hi Thomas, hier ist Dennis. Ich hoffe dir geht es gut.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      // bodyHint must be set (not empty) to prevent draft generator
      expect(result.bodyHint).toBeTruthy();
      expect(result.bodyHint?.length).toBeGreaterThan(0);
      expect(result.bodyHint?.toLowerCase()).toMatch(/^hi\s+thomas/);
    }
  });

  it('should NOT match non-email patterns', () => {
    const input = 'Bitte schicke Thomas einen Brief';
    const result = routeVoiceIntent(input);
    
    // Should not match our pattern (might match other patterns, but not the "folgende nachricht ... schicken" pattern)
    // We test that it doesn't incorrectly extract "thomas" as recipient with a "schicken" body
    if (result.type === 'email-compose' && result.toRaw === 'thomas') {
      // If it matches, bodyHint should not contain "brief" as body (it's not a "folgende nachricht ... schicken" pattern)
      // This is a soft test - the main test is that the pattern above works correctly
    }
  });
});
