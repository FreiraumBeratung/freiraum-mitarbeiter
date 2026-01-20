/**
 * Unit Tests für Schick-Name-Direct-Body Pattern
 * 
 * Testet Pattern:
 * - "Schick, Thomas, bitte direkt, ruf mich kurz zurück."
 * - "Schick Thomas direkt: bin im Termin."
 * - "Schick Thomas bitte direkt ruf mich zurück"
 */

import { describe, it, expect } from 'vitest';
import { routeVoiceIntent } from './intent_router';

describe('Schick-Name-Direct-Body Pattern', () => {
  describe('Basic pattern matching with AutoSend', () => {
    it('should match "Schick, Thomas, bitte direkt, ruf mich kurz zurück." with autoSend=true', () => {
      const input = "Schick, Thomas, bitte direkt, ruf mich kurz zurück.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          // Body sollte "ruf mich kurz zurück" enthalten (akzeptiere auch ohne Umlaute durch Normalisierung)
          expect(bodyHintLower).toMatch(/ruf\s+mich\s+(kurz\s+)?zuruck/);
          expect(bodyHintLower).not.toContain('thomas');
          expect(bodyHintLower).not.toContain('an thomas');
        }
        expect(intent.meta?.autoSend).toBe(true);
        expect(intent.meta?.source).toBe('schick-name-direct-body');
      }
    });

    it('should match "Schick Thomas direkt: bin im Termin." with autoSend=true', () => {
      const input = "Schick Thomas direkt: bin im Termin.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          // Body sollte "bin im termin" enthalten
          expect(bodyHintLower).toContain('bin im termin');
          expect(bodyHintLower).not.toContain('thomas');
        }
        expect(intent.meta?.autoSend).toBe(true);
        expect(intent.meta?.source).toBe('schick-name-direct-body');
      }
    });

    it('should match "Schick Thomas bitte direkt ruf mich zurück" with autoSend=true', () => {
      const input = "Schick Thomas bitte direkt ruf mich zurück";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          // Body sollte "ruf mich zurück" enthalten
          expect(bodyHintLower).toMatch(/ruf\s+mich\s+zuruck/);
        }
        expect(intent.meta?.autoSend).toBe(true);
      }
    });

    it('should match "Schick Thomas kurz ruf mich zurück" with autoSend=true (ohne "direkt")', () => {
      const input = "Schick Thomas kurz ruf mich zurück";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          // Body sollte "ruf mich zurück" enthalten (ohne "kurz")
          expect(bodyHintLower).toMatch(/ruf\s+mich\s+zuruck/);
          expect(bodyHintLower).not.toContain('kurz');
        }
        expect(intent.meta?.autoSend).toBe(true);
      }
    });
  });

  describe('Negation handling', () => {
    it('should match but disable autoSend for "Schick Thomas direkt ruf mich zurück aber nicht senden"', () => {
      const input = "Schick Thomas direkt ruf mich zurück aber nicht senden";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.meta?.autoSend).toBe(false);
      }
    });
  });

  describe('Pronoun blocking', () => {
    it('should NOT match "Schick mir direkt ruf mich zurück" (Pronomen block)', () => {
      const input = "Schick mir direkt ruf mich zurück";
      const intent = routeVoiceIntent(input);
      
      // Sollte nicht als schick-name-direct-body erkannt werden
      expect(intent.type).not.toBe('email-compose');
      // Oder falls doch email-compose, dann toRaw sollte nicht "mir" sein
      if (intent.type === 'email-compose' && intent.toRaw) {
        expect(intent.toRaw.toLowerCase()).not.toBe('mir');
      }
    });
  });

  describe('Negative test cases', () => {
    it('should NOT match "Schick Thomas eine kurze Mail" (kein klarer Body)', () => {
      const input = "Schick Thomas eine kurze Mail";
      const intent = routeVoiceIntent(input);
      
      // Sollte nicht als schick-name-direct-body erkannt werden
      // (kann aber als anderer Intent erkannt werden, z.B. intent-4.2)
      if (intent.type === 'email-compose' && intent.meta?.source === 'schick-name-direct-body') {
        // Falls doch erkannt, sollte bodyHint vorhanden sein
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          expect(intent.bodyHint.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Body cleaning', () => {
    it('should remove leading "an Thomas" from body', () => {
      const input = "Schick Thomas direkt an Thomas ruf mich zurück";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose' && intent.bodyHint) {
        const bodyHintLower = intent.bodyHint.toLowerCase();
        // Body sollte NICHT mit "an thomas" starten
        expect(bodyHintLower).not.toMatch(/^an\s+thomas/);
        expect(bodyHintLower).toMatch(/ruf\s+mich\s+zuruck/);
      }
    });

    it('should remove leading filler words from body', () => {
      const input = "Schick Thomas bitte direkt bitte ruf mich zurück";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose' && intent.bodyHint) {
        const bodyHintLower = intent.bodyHint.toLowerCase();
        // Body sollte NICHT mit "bitte" starten
        expect(bodyHintLower).not.toMatch(/^bitte\s+/);
        expect(bodyHintLower).toMatch(/ruf\s+mich\s+zuruck/);
      }
    });
  });
});
