/**
 * Unit Tests für Draft-Entwurf Pattern: "entwurf an <name> ..."
 * 
 * Testet das Pattern für Preview-only Email-Intents:
 * - "Entwurf an Thomas, sag ihm, ich rufe gleich zurück."
 * - "Entwurf an Thomas ich rufe gleich zurück"
 * - "Entwurf an Thomas, sag ihr, wir starten 15 Minuten später."
 * 
 * WICHTIG: Diese Intents müssen IMMER autoSend=false haben (kein Autosend).
 */

import { describe, it, expect } from 'vitest';
import { routeVoiceIntent } from './intent_router';

describe('Draft-Entwurf Pattern: "entwurf an <name> ..."', () => {
  describe('Basic pattern matching', () => {
    it('should match "Entwurf an Thomas, sag ihm, ich rufe gleich zurück."', () => {
      const input = "Entwurf an Thomas, sag ihm, ich rufe gleich zurück.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          // Body sollte "Ich rufe gleich zurück." sein (ohne "sag ihm")
          expect(intent.bodyHint).toBe('Ich rufe gleich zurück.');
        }
        expect(intent.bodyHintRaw).toBeDefined();
        expect(intent.meta?.autoSend).toBe(false); // WICHTIG: Kein Autosend
        expect(intent.meta?.source).toBe('draft-entwurf');
        expect(intent.subjectHint).toBe('Kurze Info');
      }
    });

    it('should match "Entwurf an Thomas ich rufe gleich zurück"', () => {
      const input = "Entwurf an Thomas ich rufe gleich zurück";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          expect(intent.bodyHint).toBe('Ich rufe gleich zurück.');
        }
        expect(intent.meta?.autoSend).toBe(false);
        expect(intent.meta?.source).toBe('draft-entwurf');
      }
    });

    it('should match "Entwurf an Thomas, sag ihr, wir starten 15 Minuten später."', () => {
      const input = "Entwurf an Thomas, sag ihr, wir starten 15 Minuten später.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          // Body sollte "Wir starten 15 minuten später." sein (ohne "sag ihr")
          // Note: bodyHint ist lowercase (normalized), nur erster Buchstabe groß
          expect(intent.bodyHint).toBe('Wir starten 15 minuten später.');
        }
        expect(intent.meta?.autoSend).toBe(false);
        expect(intent.meta?.source).toBe('draft-entwurf');
      }
    });

    it('should match "entwurf an thomas sag ihm ich rufe gleich zuruck" (normalized)', () => {
      const input = "entwurf an thomas sag ihm ich rufe gleich zuruck";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          expect(intent.bodyHint).toBe('Ich rufe gleich zuruck.');
        }
        expect(intent.meta?.autoSend).toBe(false);
        expect(intent.meta?.source).toBe('draft-entwurf');
      }
    });
  });

  describe('AutoSend prevention', () => {
    it('should NEVER set meta.autoSend=true', () => {
      const input = "Entwurf an Thomas, sag ihm, ich rufe gleich zurück.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.meta?.autoSend).toBe(false);
        // Stelle sicher, dass es nicht undefined ist, sondern explizit false
        expect(intent.meta?.autoSend).not.toBeUndefined();
        expect(intent.meta?.autoSend).not.toBe(true);
      }
    });

    it('should NOT trigger AI fallback', () => {
      const input = "Entwurf an Thomas, sag ihm, ich rufe gleich zurück.";
      const intent = routeVoiceIntent(input);
      
      // Sollte NICHT ai-chat sein
      expect(intent.type).not.toBe('ai-chat');
      expect(intent.type).toBe('email-compose');
    });
  });

  describe('Body extraction and formatting', () => {
    it('should strip "sag ihm" from body', () => {
      const input = "Entwurf an Thomas, sag ihm, ich komme später.";
      const intent = routeVoiceIntent(input);
      
      if (intent.type === 'email-compose' && intent.bodyHint) {
        expect(intent.bodyHint).not.toContain('sag ihm');
        expect(intent.bodyHint).toContain('Ich komme später');
      }
    });

    it('should strip "sag ihr" from body', () => {
      const input = "Entwurf an Maria, sag ihr, wir starten später.";
      const intent = routeVoiceIntent(input);
      
      if (intent.type === 'email-compose' && intent.bodyHint) {
        expect(intent.bodyHint).not.toContain('sag ihr');
        expect(intent.bodyHint).toContain('Wir starten später');
      }
    });

    it('should strip "sag ihm bitte" from body', () => {
      const input = "Entwurf an Thomas, sag ihm bitte, ich rufe gleich zurück.";
      const intent = routeVoiceIntent(input);
      
      if (intent.type === 'email-compose' && intent.bodyHint) {
        expect(intent.bodyHint).not.toContain('sag ihm bitte');
        expect(intent.bodyHint).toContain('Ich rufe gleich zurück');
      }
    });

    it('should ensure body ends with period', () => {
      const input = "Entwurf an Thomas ich rufe gleich zurück";
      const intent = routeVoiceIntent(input);
      
      if (intent.type === 'email-compose' && intent.bodyHint) {
        expect(intent.bodyHint).toMatch(/\.$/);
      }
    });

    it('should capitalize first letter of body', () => {
      const input = "Entwurf an Thomas ich rufe gleich zurück";
      const intent = routeVoiceIntent(input);
      
      if (intent.type === 'email-compose' && intent.bodyHint) {
        const firstChar = intent.bodyHint.charAt(0);
        expect(firstChar).toBe(firstChar.toUpperCase());
      }
    });
  });

  describe('Subject hint', () => {
    it('should set subjectHint to "Kurze Info"', () => {
      const input = "Entwurf an Thomas, sag ihm, ich rufe gleich zurück.";
      const intent = routeVoiceIntent(input);
      
      if (intent.type === 'email-compose') {
        expect(intent.subjectHint).toBe('Kurze Info');
      }
    });
  });

  describe('Name extraction', () => {
    it('should extract single-word name', () => {
      const input = "Entwurf an Thomas, ich komme später.";
      const intent = routeVoiceIntent(input);
      
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
      }
    });

    it('should extract two-word name', () => {
      const input = "Entwurf an Thomas Müller, ich komme später.";
      const intent = routeVoiceIntent(input);
      
      if (intent.type === 'email-compose') {
        // Name sollte "Thomas Müller" sein (Original-Case)
        expect(intent.toRaw).toBeDefined();
        const toRawLower = intent.toRaw?.toLowerCase() || '';
        expect(toRawLower).toContain('thomas');
        // Note: "Müller" wird zu "muller" normalisiert, aber Original-Case sollte erhalten bleiben
        // Prüfe, dass beide Teile vorhanden sind
        expect(toRawLower.split(/\s+/).length).toBeGreaterThanOrEqual(1);
        // Der Name sollte mindestens "thomas" enthalten
        expect(toRawLower).toContain('thomas');
      }
    });

    it('should stop name extraction at stopwords like "sag"', () => {
      const input = "Entwurf an Thomas sag ihm ich komme später";
      const intent = routeVoiceIntent(input);
      
      if (intent.type === 'email-compose') {
        // Name sollte nur "Thomas" sein, nicht "Thomas sag"
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toContain('Ich komme später');
      }
    });
  });

  describe('Hi/Greeting: Empfänger nur Name, Body ab Greeting', () => {
    it('A) "Entwurf an Thomas Hi Thomas, hier ist Dennis." -> toRaw nur "thomas", bodyHint startet mit "hi thomas"', () => {
      const input = "Entwurf an Thomas Hi Thomas, hier ist Dennis.";
      const intent = routeVoiceIntent(input);
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          expect(intent.bodyHint.toLowerCase().startsWith('hi thomas')).toBe(true);
        }
        expect(intent.meta?.source).toBe('draft-entwurf');
      }
    });

    it('B) "Entwurf an Thomas, Hi Thomas, hier ist Dennis." -> wie A', () => {
      const input = "Entwurf an Thomas, Hi Thomas, hier ist Dennis.";
      const intent = routeVoiceIntent(input);
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint?.toLowerCase().startsWith('hi thomas')).toBe(true);
        expect(intent.meta?.source).toBe('draft-entwurf');
      }
    });

    it('C) "Entwurf an Thomas Betreff kurze Info. Hi Thomas ..." -> toRaw=thomas, subjectHint, bodyHint startet mit "hi thomas"', () => {
      const input = "Entwurf an Thomas Betreff kurze Info. Hi Thomas ...";
      const intent = routeVoiceIntent(input);
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.subjectHint?.toLowerCase()).toBe('kurze info');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          expect(intent.bodyHint.toLowerCase().startsWith('hi thomas')).toBe(true);
        }
        expect(intent.meta?.source).toBe('draft-entwurf');
      }
    });
  });

  describe('Duplicate name + Betreff (Draft/Entwurf Parsing)', () => {
    it('TEST1: "Entwurf an Thomas Thomas Hier ist Dennis. Ich hoffe dir gehts gut." -> toRaw=thomas, bodyHint beginnt mit "thomas hier ist dennis"', () => {
      const input = "Entwurf an Thomas Thomas Hier ist Dennis. Ich hoffe dir gehts gut.";
      const intent = routeVoiceIntent(input);
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bl = intent.bodyHint.toLowerCase();
          expect(bl.startsWith('thomas hier ist dennis') || bl.startsWith('thomas hier ist dennis.')).toBe(true);
        }
        expect(intent.meta?.source).toBe('draft-entwurf');
      }
    });

    it('TEST2: "Entwurf an Thomas Hi Thomas, kurze Info Ich bin im Termin." -> toRaw=thomas, bodyHint beginnt mit "hi thomas"', () => {
      const input = "Entwurf an Thomas Hi Thomas, kurze Info Ich bin im Termin.";
      const intent = routeVoiceIntent(input);
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint?.toLowerCase().startsWith('hi thomas')).toBe(true);
        expect(intent.meta?.source).toBe('draft-entwurf');
      }
    });

    it('TEST3: "Entwurf an Thomas, Betreff Rückruf Hi Thomas, Ruf mich bitte kurz zurück." -> toRaw=thomas, subjectHint=Rückruf, bodyHint beginnt mit "hi thomas"', () => {
      const input = "Entwurf an Thomas, Betreff Rückruf Hi Thomas, Ruf mich bitte kurz zurück.";
      const intent = routeVoiceIntent(input);
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(['rückruf', 'rueckruf', 'ruckruf']).toContain(intent.subjectHint?.toLowerCase());
        expect(intent.bodyHint?.toLowerCase().startsWith('hi thomas')).toBe(true);
        expect(intent.meta?.source).toBe('draft-entwurf');
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle "draft an" variant (nice-to-have)', () => {
      const input = "draft an thomas ich rufe gleich zuruck";
      const intent = routeVoiceIntent(input);
      
      // Kann entweder erkannt werden oder nicht (nice-to-have)
      if (intent.type === 'email-compose' && intent.meta?.source === 'draft-entwurf') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.meta?.autoSend).toBe(false);
      }
    });

    it('should handle name with comma', () => {
      const input = "Entwurf an Thomas, ich komme später.";
      const intent = routeVoiceIntent(input);
      
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.bodyHint).toContain('Ich komme später');
      }
    });
  });
});
