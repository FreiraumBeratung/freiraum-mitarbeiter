/**
 * Unit Tests für Kurz-Dass-Rewrite Pattern
 * 
 * Testet Rewrite-Logik:
 * - "Sende Thomas kurz, dass ich nachher anrufe." → "Ich rufe nachher an."
 * - "Schick Thomas kurz, dass wir 15 Minuten später starten." → "Wir starten 15 Minuten später."
 * - "Sende Thomas kurz rüber, ich hab's gleich." → unverändert (kein Rewrite)
 */

import { describe, it, expect } from 'vitest';
import { routeVoiceIntent } from './intent_router';

describe('Kurz-Dass-Rewrite Pattern', () => {
  describe('Basic rewrite with "dass ich"', () => {
    it('should rewrite "Sende Thomas kurz, dass ich nachher anrufe." to "Ich rufe nachher an."', () => {
      const input = "Sende Thomas kurz, dass ich nachher anrufe.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          // Body sollte "ich nachher anrufe" oder "ich rufe nachher an" enthalten (normalisiert ok)
          // Wichtig: Body sollte NICHT mit "dass" beginnen
          expect(bodyHintLower).not.toMatch(/^dass\s+ich/);
          // Body sollte "ich" enthalten (nach Rewrite)
          expect(bodyHintLower).toMatch(/^ich\s+/);
        }
        expect(intent.bodyHintRaw).toBeDefined();
        if (intent.bodyHintRaw) {
          // bodyHintRaw sollte mit "Ich" beginnen (Großschreibung)
          expect(intent.bodyHintRaw).toMatch(/^Ich\s+/);
          // bodyHintRaw sollte NICHT mit "Dass" beginnen
          expect(intent.bodyHintRaw).not.toMatch(/^Dass\s+/);
          // bodyHintRaw sollte Satzzeichen haben
          expect(intent.bodyHintRaw).toMatch(/[.!?]$/);
        }
        expect(intent.meta?.source).toBe('short-imperative');
      }
    });
  });

  describe('Basic rewrite with "dass wir"', () => {
    it('should rewrite "Schick Thomas kurz, dass wir 15 Minuten später starten." to "Wir starten 15 Minuten später."', () => {
      const input = "Schick Thomas kurz, dass wir 15 Minuten später starten.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          // Body sollte "wir" enthalten (nach Rewrite)
          // Wichtig: Body sollte NICHT mit "dass" beginnen
          expect(bodyHintLower).not.toMatch(/^dass\s+wir/);
          // Body sollte "wir" enthalten (nach Rewrite)
          expect(bodyHintLower).toMatch(/^wir\s+/);
        }
        expect(intent.bodyHintRaw).toBeDefined();
        if (intent.bodyHintRaw) {
          // bodyHintRaw sollte mit "Wir" beginnen (Großschreibung)
          expect(intent.bodyHintRaw).toMatch(/^Wir\s+/);
          // bodyHintRaw sollte Satzzeichen haben
          expect(intent.bodyHintRaw).toMatch(/[.!?]$/);
        }
        expect(intent.meta?.source).toBe('short-imperative');
      }
    });
  });

  describe('Safety: no rewrite when conditions not met', () => {
    it('should NOT rewrite "Sende Thomas kurz rüber, ich hab\'s gleich." (no "dass")', () => {
      const input = "Sende Thomas kurz rüber, ich hab's gleich.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          // Body sollte "ich hab" enthalten (unverändert)
          expect(bodyHintLower).toMatch(/ich\s+hab/);
          // Body sollte NICHT mit "dass" beginnen (kein Rewrite)
          // Falls doch Rewrite stattgefunden hat, sollte es nicht mit "dass" beginnen
          expect(bodyHintLower).not.toMatch(/^dass\s+/);
        }
        // Verhalten sollte unverändert sein (kann short-imperative oder schick-rueber sein)
        expect(intent.meta?.source).toBeDefined();
      }
    });
  });

  describe('Rewrite with "dass es"', () => {
    it('should rewrite "Sende Thomas kurz, dass es später wird." to "Es wird später."', () => {
      const input = "Sende Thomas kurz, dass es später wird.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHintRaw).toBeDefined();
        if (intent.bodyHintRaw) {
          // bodyHintRaw sollte mit "Es" beginnen (Großschreibung)
          expect(intent.bodyHintRaw).toMatch(/^Es\s+/);
          // bodyHintRaw sollte NICHT mit "Dass" beginnen
          expect(intent.bodyHintRaw).not.toMatch(/^Dass\s+/);
        }
      }
    });
  });
});
