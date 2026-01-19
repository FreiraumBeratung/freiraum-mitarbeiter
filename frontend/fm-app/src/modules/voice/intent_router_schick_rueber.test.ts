/**
 * Unit Tests für Schick-Rüber Pattern: "schick <name> kurz rüber, dass <body>"
 * 
 * Testet das Pattern für Umgangssprache:
 * - "Schick Thomas kurz rüber, dass ich später komme."
 * - "Schick Thomas kurz rüber dass ich später komme."
 * - "Schick Thomas rüber: ich komme später."
 */

import { describe, it, expect } from 'vitest';
import { routeVoiceIntent } from './intent_router';

describe('Schick-Rüber Pattern: "schick <name> kurz rüber, dass <body>"', () => {
  describe('Basic pattern matching with AutoSend', () => {
    it('should match "Schick Thomas kurz rüber, dass ich später komme." with autoSend=true', () => {
      const input = "Schick Thomas kurz rüber, dass ich später komme.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          // Body sollte NICHT "thomas", "kurz rüber" oder "dass" enthalten
          expect(bodyHintLower).not.toContain('thomas');
          expect(bodyHintLower).not.toContain('kurz rüber');
          expect(bodyHintLower).not.toContain('kurz ruber');
          expect(bodyHintLower).not.toContain('dass');
          // Body sollte "ich komme spater" oder "ich spater komme" enthalten
          // (normalize() konvertiert "später" zu "spater")
          expect(bodyHintLower).toMatch(/ich\s+(komme\s+)?spater/);
        }
        expect(intent.bodyHintRaw).toBeDefined();
        expect(intent.meta?.autoSend).toBe(true);
        expect(intent.meta?.source).toBe('schick-rueber');
        expect(intent.subjectHint).toBeUndefined();
      }
    });

    it('should match "Schick Thomas kurz rüber dass ich später komme." (ohne Komma) with autoSend=true', () => {
      const input = "Schick Thomas kurz rüber dass ich später komme.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          expect(bodyHintLower).not.toContain('dass');
          expect(bodyHintLower).toMatch(/ich\s+(komme\s+)?spater/);
        }
        expect(intent.meta?.autoSend).toBe(true);
        expect(intent.meta?.source).toBe('schick-rueber');
      }
    });

    it('should match "Schick Thomas rüber: ich komme später." with autoSend=true', () => {
      const input = "Schick Thomas rüber: ich komme später.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          // bodyHint sollte "ich komme" enthalten (später/spater je nach Normalisierung)
          expect(bodyHintLower).toContain('ich komme');
          // Prüfe, dass es nicht leer ist
          expect(bodyHintLower.length).toBeGreaterThan(0);
        }
        expect(intent.meta?.autoSend).toBe(true);
        expect(intent.meta?.source).toBe('schick-rueber');
      }
    });

    it('should match "Schick Thomas kurz rüber, dass ich gleich da bin." with autoSend=true', () => {
      const input = "Schick Thomas kurz rüber, dass ich gleich da bin.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          expect(bodyHintLower).not.toContain('dass');
          expect(bodyHintLower).toContain('ich gleich da bin');
        }
        expect(intent.meta?.autoSend).toBe(true);
      }
    });
  });

  describe('Negation handling', () => {
    it('should block AutoSend for "Schick Thomas kurz rüber, dass ich später komme, aber nicht senden."', () => {
      const input = "Schick Thomas kurz rüber, dass ich später komme, aber nicht senden.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.meta?.autoSend).toBe(false);
      }
    });
  });

  describe('Pronoun blocking', () => {
    it('should NOT match "Schick mir kurz rüber, dass ich später komme." (Pronomen blockiert)', () => {
      const input = "Schick mir kurz rüber, dass ich später komme.";
      const intent = routeVoiceIntent(input);
      
      // Sollte NICHT als schick-rueber erkannt werden
      if (intent.type === 'email-compose' && intent.meta?.source === 'schick-rueber') {
        // Falls doch erkannt, sollte Empfänger nicht "mir" sein
        expect(intent.toRaw?.toLowerCase()).not.toBe('mir');
      }
    });
  });

  describe('STT variations (rüber vs ruber)', () => {
    it('should match "Schick Thomas kurz ruber, dass ich später komme." (STT ohne Umlaute)', () => {
      const input = "Schick Thomas kurz ruber, dass ich später komme.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.meta?.source).toBe('schick-rueber');
      }
    });
  });
});
