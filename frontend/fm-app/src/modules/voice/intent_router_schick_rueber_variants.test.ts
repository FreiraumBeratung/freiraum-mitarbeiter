/**
 * Unit Tests für Schick-Rüber Pattern Varianten (ohne "dass")
 * 
 * Testet erweiterte Varianten:
 * - "Schick Thomas kurz rüber, bin im Termin, melde mich gleich."
 * - "Schick Thomas kurz rüber, bitte, ich bin gleich da."
 * - "Schick Thomas rüber, ich habs gleich."
 * - "Schick Thomas kurz rüber, dass sich alles um 10 Minuten verschiebt."
 */

import { describe, it, expect } from 'vitest';
import { routeVoiceIntent } from './intent_router';

describe('Schick-Rüber Pattern Variants (ohne "dass")', () => {
  describe('Variants without "dass"', () => {
    it('should match "Schick Thomas kurz rüber, bin im Termin, melde mich gleich."', () => {
      const input = "Schick Thomas kurz rüber, bin im Termin, melde mich gleich.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          // Body sollte "bin im termin" enthalten (nach Normalisierung)
          expect(bodyHintLower).toContain('bin im termin');
          expect(bodyHintLower).not.toContain('thomas');
          expect(bodyHintLower).not.toContain('rüber');
          expect(bodyHintLower).not.toContain('ruber');
        }
        expect(intent.meta?.autoSend).toBe(true);
        expect(intent.meta?.source).toBe('schick-rueber');
      }
    });

    it('should match "Schick Thomas kurz rüber, bitte, ich bin gleich da."', () => {
      const input = "Schick Thomas kurz rüber, bitte, ich bin gleich da.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          // Body sollte "ich bin gleich da" enthalten
          expect(bodyHintLower).toContain('ich bin gleich da');
          expect(bodyHintLower).not.toContain('bitte');
        }
        expect(intent.meta?.autoSend).toBe(true);
      }
    });

    it('should match "Schick Thomas rüber, ich habs gleich."', () => {
      const input = "Schick Thomas rüber, ich habs gleich.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        // WICHTIG: toRaw sollte "thomas" sein, NICHT "thomasrüber" oder "thomasruber"
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.toRaw?.toLowerCase()).not.toContain('ruber');
        expect(intent.toRaw?.toLowerCase()).not.toContain('rüber');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          // Body sollte "ich hab" enthalten
          expect(bodyHintLower).toContain('ich hab');
        }
        expect(intent.meta?.autoSend).toBe(true);
      }
    });

    it('should match "Schick Thomas kurz rüber, dass sich alles um 10 Minuten verschiebt."', () => {
      const input = "Schick Thomas kurz rüber, dass sich alles um 10 Minuten verschiebt.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          // Body sollte "verschiebt sich um 10 minuten" enthalten
          // (nicht "sich alles ..." am Anfang)
          expect(bodyHintLower).toContain('verschiebt sich um 10 minuten');
          expect(bodyHintLower).toContain('alles');
          // Body sollte NICHT mit "sich" beginnen (sollte zu "Alles verschiebt sich..." normalisiert werden)
          expect(bodyHintLower).not.toMatch(/^sich\s+/);
        }
        expect(intent.meta?.autoSend).toBe(true);
      }
    });
  });

  describe('Short-Imperative fix (rüber/ruber should not be part of name)', () => {
    it('should NOT have "ruber" in toRaw for "Schick Thomas rüber, ich bin da."', () => {
      const input = "Schick Thomas rüber, ich bin da.";
      const intent = routeVoiceIntent(input);
      
      // Sollte als schick-rueber erkannt werden, nicht als short-imperative
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.toRaw?.toLowerCase()).not.toContain('ruber');
        expect(intent.toRaw?.toLowerCase()).not.toContain('rüber');
      }
    });
  });
});
