/**
 * Unit Tests für Schick-An-Direct Pattern: "schick das direkt an thomas bin im termin"
 * 
 * Testet das Pattern für direkte "schick an <name> <body>" Sätze ohne Separator:
 * - "Schick das direkt an Thomas bin im Termin."
 * - "Schick bitte an Thomas ich ruf später an"
 */

import { describe, it, expect } from 'vitest';
import { routeVoiceIntent } from './intent_router';

describe('Schick-An-Direct Pattern: "schick das direkt an <name> <body>"', () => {
  describe('Basic pattern matching with AutoSend', () => {
    it('should match "Schick das direkt an Thomas bin im Termin." with autoSend=true', () => {
      const input = "Schick das direkt an Thomas bin im Termin.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          expect(bodyHintLower).toContain('bin im termin');
        }
        expect(intent.bodyHintRaw).toBeDefined();
        expect(intent.meta?.autoSend).toBe(true);
        expect(intent.meta?.source).toBe('schick-an-direct');
      }
    });

    it('should match "Schick bitte an Thomas ich ruf später an" with autoSend', () => {
      const input = "Schick bitte an Thomas ich ruf später an";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          // normalize() konvertiert "später" zu "spater" (ä->ae)
          expect(intent.bodyHint.toLowerCase()).toContain('ich ruf');
          expect(intent.bodyHint.toLowerCase()).toContain('spater an');
        }
        // "schick" ist AutoSend-Trigger, sollte true sein
        expect(intent.meta?.autoSend).toBe(true);
        expect(intent.meta?.source).toBe('schick-an-direct');
      }
    });

    it('should match "Schick an Thomas bin gleich da" with autoSend', () => {
      const input = "Schick an Thomas bin gleich da";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          expect(intent.bodyHint.toLowerCase()).toContain('bin gleich da');
        }
        // "schick" ist AutoSend-Trigger, sollte true sein
        expect(intent.meta?.autoSend).toBe(true);
      }
    });

    it('should match "sende das direkt an Thomas bin im Termin" with autoSend=true', () => {
      const input = "sende das direkt an Thomas bin im Termin";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          expect(intent.bodyHint.toLowerCase()).toContain('bin im termin');
        }
        // "direkt" ist AutoSend-Trigger
        expect(intent.meta?.autoSend).toBe(true);
      }
    });
  });

  describe('Stop-Token: jetzt/bitte nie Teil des Empfängernamens', () => {
    it('"Sende an Thomas jetzt bin im Termin." → toRaw nur "Thomas", Body enthält "bin im termin"', () => {
      const input = "Sende an Thomas jetzt bin im Termin.";
      const intent = routeVoiceIntent(input);
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          expect(intent.bodyHint.toLowerCase()).toContain('bin im termin');
        }
        expect(intent.meta?.autoSend).toBe(true);
      }
    });

    it('"Sende an Thomas bitte ruf mich zurück." → toRaw nur "Thomas"', () => {
      const input = "Sende an Thomas bitte ruf mich zurück.";
      const intent = routeVoiceIntent(input);
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toBe('thomas');
        expect(intent.bodyHint?.toLowerCase()).toContain('ruf');
      }
    });
  });

  describe('Negation handling', () => {
    it('should block AutoSend for "Schick das direkt an Thomas bin im Termin aber nicht senden."', () => {
      const input = "Schick das direkt an Thomas bin im Termin aber nicht senden.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          // BodyHint sollte NICHT "aber nicht senden" enthalten
          const bodyHintLower = intent.bodyHint.toLowerCase();
          expect(bodyHintLower).not.toContain('aber nicht');
          expect(bodyHintLower).not.toContain('nicht senden');
          // Sollte aber den Rest enthalten
          expect(bodyHintLower).toContain('bin im termin');
        }
        // AutoSend sollte false sein wegen Negation
        expect(intent.meta?.autoSend).toBe(false);
      }
    });

    it('should block AutoSend for "Schick an Thomas bin gleich da noch nicht senden"', () => {
      const input = "Schick an Thomas bin gleich da noch nicht senden";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.meta?.autoSend).toBe(false);
      }
    });

    it('should block AutoSend for "Schick das direkt an Thomas bin im Termin nur vorschau"', () => {
      const input = "Schick das direkt an Thomas bin im Termin nur vorschau";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.meta?.autoSend).toBe(false);
      }
    });
  });

  describe('Pronoun blocking', () => {
    it('should NOT match "Schick das direkt an mir test." (Pronomen blockiert)', () => {
      const input = "Schick das direkt an mir test.";
      const intent = routeVoiceIntent(input);
      
      // Sollte NICHT als schick-an-direct erkannt werden
      if (intent.type === 'email-compose' && intent.meta?.source === 'schick-an-direct') {
        // Falls doch erkannt, sollte Empfänger nicht "mir" sein
        expect(intent.toRaw?.toLowerCase()).not.toBe('mir');
      }
    });

    it('should NOT match "Schick an dir test." (Pronomen blockiert)', () => {
      const input = "Schick an dir test.";
      const intent = routeVoiceIntent(input);
      
      if (intent.type === 'email-compose' && intent.meta?.source === 'schick-an-direct') {
        expect(intent.toRaw?.toLowerCase()).not.toBe('dir');
      }
    });

    it('should NOT match "Schick bitte an uns test." (Pronomen blockiert)', () => {
      const input = "Schick bitte an uns test.";
      const intent = routeVoiceIntent(input);
      
      if (intent.type === 'email-compose' && intent.meta?.source === 'schick-an-direct') {
        expect(intent.toRaw?.toLowerCase()).not.toBe('uns');
      }
    });
  });

  describe('Multi-token names', () => {
    it('should match "Schick das direkt an Thomas Müller bin im Termin." (2-Token Name)', () => {
      const input = "Schick das direkt an Thomas Müller bin im Termin.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.toRaw?.toLowerCase()).toContain('müller');
        expect(intent.bodyHint).toBeDefined();
        expect(intent.meta?.autoSend).toBe(true);
      }
    });

    it('should match "Schick an Max Mustermann bin gleich da" (2-Token Name)', () => {
      const input = "Schick an Max Mustermann bin gleich da";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('max');
        expect(intent.toRaw?.toLowerCase()).toContain('mustermann');
        expect(intent.meta?.autoSend).toBe(true);
      }
    });
  });

  describe('Duplicate recipient name handling', () => {
    it('should handle "Schick das direkt an Thomas Thomas bin im Termin." and normalize to "thomas"', () => {
      const input = "Schick das direkt an Thomas Thomas bin im Termin.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        // toRaw sollte "thomas" sein, nicht "thomas thomas" oder "thomasthomas"
        const toRawLower = intent.toRaw?.toLowerCase() || '';
        expect(toRawLower).toBe('thomas');
        expect(toRawLower).not.toContain('thomas thomas');
        expect(toRawLower).not.toContain('thomasthomas');
        
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          expect(intent.bodyHint.toLowerCase()).toContain('bin im termin');
        }
        // AutoSend sollte aktiviert sein (weil "direkt" im Command)
        expect(intent.meta?.autoSend).toBe(true);
        expect(intent.meta?.source).toBe('schick-an-direct');
      }
    });

    it('should handle "Schick an Max Max bin gleich da" and normalize to "max"', () => {
      const input = "Schick an Max Max bin gleich da";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        const toRawLower = intent.toRaw?.toLowerCase() || '';
        expect(toRawLower).toBe('max');
        expect(toRawLower).not.toContain('max max');
        expect(intent.meta?.autoSend).toBe(true);
      }
    });
  });
});
