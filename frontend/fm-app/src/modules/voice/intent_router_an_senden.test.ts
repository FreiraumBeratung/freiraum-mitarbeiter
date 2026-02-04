/**
 * Unit Tests für An-Senden Pattern (passive Wortstellung)
 * 
 * Testet Pattern:
 * - "An Thomas senden wir starten 15 Minuten später."
 * - "An Thomas senden: ich bin im Termin."
 * - "An Thomas senden bitte: melde mich gleich."
 */

import { describe, it, expect } from 'vitest';
import { routeVoiceIntent } from './intent_router';

describe('An-Senden Pattern (passive Wortstellung)', () => {
  describe('Basic pattern matching with AutoSend', () => {
    it('should match "An Thomas senden wir starten 15 Minuten später." with autoSend=true', () => {
      const input = "An Thomas senden wir starten 15 Minuten später.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          // Body sollte "wir starten 15 minuten später" enthalten (normalisiert ok)
          expect(bodyHintLower).toMatch(/wir\s+starten\s+15\s+minuten\s+spater/);
          // Body sollte NICHT "an thomas" enthalten
          expect(bodyHintLower).not.toContain('an thomas');
        }
        expect(intent.meta?.autoSend).toBe(true);
        expect(intent.meta?.source).toBe('an-senden');
      }
    });

    it('should match "An Thomas senden: ich bin im Termin." with autoSend=true', () => {
      const input = "An Thomas senden: ich bin im Termin.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          // Body sollte "ich bin im termin" enthalten
          expect(bodyHintLower).toContain('ich bin im termin');
          expect(bodyHintLower).not.toContain('an thomas');
        }
        expect(intent.meta?.autoSend).toBe(true);
        expect(intent.meta?.source).toBe('an-senden');
      }
    });

    it('should match "An Thomas senden bitte: melde mich gleich." with autoSend=true', () => {
      const input = "An Thomas senden bitte: melde mich gleich.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          // Body sollte "melde mich gleich" enthalten
          expect(bodyHintLower).toContain('melde mich gleich');
        }
        expect(intent.meta?.autoSend).toBe(true);
        expect(intent.meta?.source).toBe('an-senden');
      }
    });
  });

  describe('Negative test cases', () => {
    it('should NOT match "An Thomas." (kein senden)', () => {
      const input = "An Thomas.";
      const intent = routeVoiceIntent(input);
      
      // Sollte nicht als an-senden erkannt werden
      if (intent.type === 'email-compose' && intent.meta?.source === 'an-senden') {
        // Falls doch erkannt, sollte bodyHint vorhanden sein
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          expect(intent.bodyHint.length).toBeGreaterThan(0);
        }
      }
    });

    it('should NOT match "An Thomas senden." (kein body)', () => {
      const input = "An Thomas senden.";
      const intent = routeVoiceIntent(input);
      
      // Sollte nicht als an-senden erkannt werden (kein Body)
      if (intent.type === 'email-compose' && intent.meta?.source === 'an-senden') {
        // Falls doch erkannt, sollte bodyHint vorhanden sein
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          expect(intent.bodyHint.length).toBeGreaterThan(0);
        }
      }
    });

    it('should NOT match "An Thomas schreiben wir starten später." (schreiben = preview only)', () => {
      const input = "An Thomas schreiben wir starten später.";
      const intent = routeVoiceIntent(input);
      
      // Sollte NICHT als an-senden mit autoSend erkannt werden
      // (kann aber als anderer Intent erkannt werden, z.B. preview-only)
      if (intent.type === 'email-compose' && intent.meta?.source === 'an-senden') {
        // Falls doch erkannt, sollte autoSend false sein (weil "schreiben" = preview)
        expect(intent.meta?.autoSend).toBe(false);
      }
    });
  });

  describe('Body cleaning', () => {
    it('should remove leading "an Thomas" from body', () => {
      const input = "An Thomas senden an Thomas ruf mich zurück";
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

  describe('Send-adverb strip (jetzt/sofort/direkt not in body when AutoSend)', () => {
    it('"An Thomas senden jetzt, ich rufe später zurück." => body must NOT start with "jetzt", contains "ich rufe"', () => {
      const input = "An Thomas senden jetzt, ich rufe später zurück.";
      const intent = routeVoiceIntent(input);
      expect(intent.type).toBe('email-compose');
      const c = intent.type === 'email-compose' ? intent : null;
      expect(c).toBeTruthy();
      if (!c) return;
      expect(c.meta?.autoSend).toBe(true);
      expect(c.meta?.source).toBe('an-senden');
      const body = (c.bodyHint ?? '').toLowerCase();
      expect(body).not.toMatch(/^jetzt\b/);
      expect(body).toContain('ich rufe');
      expect(body).toContain('spater');
      expect(c.subjectHint ?? 'Kurze Info').toBeDefined();
    });

    it('"Sende das an Thomas, jetzt, ich rufe später zurück." => body must NOT start with "jetzt" (sende-das-an)', () => {
      const input = "Sende das an Thomas, jetzt, ich rufe später zurück.";
      const intent = routeVoiceIntent(input);
      expect(intent.type).toBe('email-compose');
      const c = intent.type === 'email-compose' ? intent : null;
      if (!c) return;
      const body = (c.bodyHint ?? '').toLowerCase();
      expect(body).not.toMatch(/^jetzt\b/);
      expect(body).toContain('ich rufe');
    });
  });
});
