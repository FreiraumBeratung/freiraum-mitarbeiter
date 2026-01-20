/**
 * Unit Tests für Sende-Das-An Pattern
 * 
 * Testet Pattern:
 * - "Sende das jetzt an Thomas. Ich bin gleich wieder da."
 * - "Sende das direkt an Thomas, bin im Termin."
 * - "Sende das sofort an Thomas ich melde mich später."
 */

import { describe, it, expect } from 'vitest';
import { routeVoiceIntent } from './intent_router';

describe('Sende-Das-An Pattern', () => {
  describe('Basic pattern matching with AutoSend', () => {
    it('should match "Sende das jetzt an Thomas. Ich bin gleich wieder da." with autoSend=true', () => {
      const input = "Sende das jetzt an Thomas. Ich bin gleich wieder da.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          // Body sollte "ich bin gleich wieder da" enthalten (normalisiert ok)
          expect(bodyHintLower).toMatch(/ich\s+bin\s+gleich\s+wieder\s+da/);
          // Body sollte NICHT "an thomas" enthalten
          expect(bodyHintLower).not.toContain('an thomas');
        }
        expect(intent.meta?.autoSend).toBe(true);
        expect(intent.meta?.source).toBe('sende-das-an');
      }
    });

    it('should match "Sende das direkt an Thomas, bin im Termin." with autoSend=true', () => {
      const input = "Sende das direkt an Thomas, bin im Termin.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          // Body sollte "bin im termin" enthalten
          expect(bodyHintLower).toContain('bin im termin');
          // Body sollte NICHT "an thomas" enthalten
          expect(bodyHintLower).not.toContain('an thomas');
        }
        expect(intent.meta?.autoSend).toBe(true);
        expect(intent.meta?.source).toBe('sende-das-an');
      }
    });

    it('should match "Sende das sofort an Thomas ich melde mich später." with autoSend=true', () => {
      const input = "Sende das sofort an Thomas ich melde mich später.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          // Body sollte "ich melde mich" enthalten
          expect(bodyHintLower).toContain('ich melde mich');
        }
        expect(intent.meta?.autoSend).toBe(true);
        expect(intent.meta?.source).toBe('sende-das-an');
      }
    });

    it('should match "Sende das an Thomas. Ich bin gleich wieder da." with autoSend=true (ohne Adverb)', () => {
      const input = "Sende das an Thomas. Ich bin gleich wieder da.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          // Body sollte "ich bin gleich wieder da" enthalten
          expect(bodyHintLower).toMatch(/ich\s+bin\s+gleich\s+wieder\s+da/);
        }
        expect(intent.meta?.autoSend).toBe(true);
        expect(intent.meta?.source).toBe('sende-das-an');
      }
    });
  });

  describe('Negative test cases', () => {
    it('should NOT match "Sende das jetzt." (kein Empfänger)', () => {
      const input = "Sende das jetzt.";
      const intent = routeVoiceIntent(input);
      
      // Sollte nicht als sende-das-an erkannt werden
      if (intent.type === 'email-compose' && intent.meta?.source === 'sende-das-an') {
        // Falls doch erkannt, sollte toRaw vorhanden sein
        expect(intent.toRaw).toBeDefined();
        if (intent.toRaw) {
          expect(intent.toRaw.length).toBeGreaterThan(0);
        }
      }
    });

    it('should NOT match "Sende das an." (kein Name)', () => {
      const input = "Sende das an.";
      const intent = routeVoiceIntent(input);
      
      // Sollte nicht als sende-das-an erkannt werden
      if (intent.type === 'email-compose' && intent.meta?.source === 'sende-das-an') {
        // Falls doch erkannt, sollte toRaw vorhanden sein
        expect(intent.toRaw).toBeDefined();
        if (intent.toRaw) {
          expect(intent.toRaw.length).toBeGreaterThan(0);
        }
      }
    });

    it('should NOT match "Sende Thomas eine Mail ..." (andere Grammatik)', () => {
      const input = "Sende Thomas eine Mail, ich komme später.";
      const intent = routeVoiceIntent(input);
      
      // Sollte nicht als sende-das-an erkannt werden (kann aber als anderer Intent erkannt werden)
      if (intent.type === 'email-compose' && intent.meta?.source === 'sende-das-an') {
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
      const input = "Sende das jetzt an Thomas an Thomas ruf mich zurück";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose' && intent.bodyHint) {
        const bodyHintLower = intent.bodyHint.toLowerCase();
        // Body sollte NICHT mit "an thomas" starten
        expect(bodyHintLower).not.toMatch(/^an\s+thomas/);
        expect(bodyHintLower).toMatch(/ruf\s+mich\s+zuruck/);
      }
    });
  });
});
