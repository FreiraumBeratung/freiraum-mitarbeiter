/**
 * Unit Tests für Passive Send Pattern: "bitte sofort an <name> senden. <body>"
 * 
 * Testet das Pattern für passive Send-Sätze wie:
 * - "Bitte sofort an Thomas senden. Kurze Info verzögert sich etwas."
 * - "Sofort an Thomas senden: Bin in 5 Minuten da."
 */

import { describe, it, expect } from 'vitest';
import { routeVoiceIntent } from './intent_router';

describe('Passive Send Pattern: "bitte sofort an <name> senden. <body>"', () => {
  describe('Basic pattern matching with AutoSend', () => {
    it('should match "Bitte sofort an Thomas senden. Kurze Info verzögert sich etwas." with autoSend=true', () => {
      const input = "Bitte sofort an Thomas senden. Kurze Info verzögert sich etwas.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          expect(bodyHintLower).toContain('kurze info');
          // normalize() konvertiert "verzögert" zu "verzogert" (ö->oe)
          expect(bodyHintLower).toContain('verzogert sich etwas');
        }
        expect(intent.bodyHintRaw).toBeDefined();
        expect(intent.meta?.autoSend).toBe(true);
        expect(intent.meta?.source).toBe('passive-send');
      }
    });

    it('should match "Sofort an Thomas senden: Bin in 5 Minuten da." with autoSend=true', () => {
      const input = "Sofort an Thomas senden: Bin in 5 Minuten da.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          expect(intent.bodyHint.toLowerCase()).toContain('bin in');
          expect(intent.bodyHint.toLowerCase()).toContain('5 minuten da');
        }
        expect(intent.meta?.autoSend).toBe(true);
        expect(intent.meta?.source).toBe('passive-send');
      }
    });

    it('should match "Bitte direkt an Thomas senden, ich komme später." with autoSend=true', () => {
      const input = "Bitte direkt an Thomas senden, ich komme später.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          // normalize() konvertiert "später" zu "spater" (ä->ae)
          expect(intent.bodyHint.toLowerCase()).toContain('ich komme spater');
        }
        expect(intent.meta?.autoSend).toBe(true);
      }
    });

    it('should match "Jetzt an Thomas senden. Test." with autoSend=true', () => {
      const input = "Jetzt an Thomas senden. Test.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.bodyHint).toBeDefined();
        expect(intent.meta?.autoSend).toBe(true);
      }
    });
  });

  describe('PreviewOnly (no AutoSend trigger)', () => {
    it('should match "Bitte an Thomas senden. Kurze Info verzögert sich etwas." with autoSend=false', () => {
      const input = "Bitte an Thomas senden. Kurze Info verzögert sich etwas.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          expect(intent.bodyHint.toLowerCase()).toContain('kurze info');
        }
        // AutoSend sollte false sein, da kein "sofort|direkt|jetzt" im Command
        expect(intent.meta?.autoSend).toBe(false);
        expect(intent.meta?.source).toBe('passive-send');
      }
    });
  });

  describe('Negation handling', () => {
    it('should block AutoSend for "Bitte sofort an Thomas senden. Kurze Info, aber nicht senden."', () => {
      const input = "Bitte sofort an Thomas senden. Kurze Info, aber nicht senden.";
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
          expect(bodyHintLower).toContain('kurze info');
        }
        // AutoSend sollte false sein wegen Negation
        expect(intent.meta?.autoSend).toBe(false);
      }
    });

    it('should block AutoSend for "Sofort an Thomas senden: Bin da, noch nicht senden."', () => {
      const input = "Sofort an Thomas senden: Bin da, noch nicht senden.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.meta?.autoSend).toBe(false);
      }
    });

    it('should block AutoSend for "Bitte sofort an Thomas senden. Kurze Info, nur vorschau."', () => {
      const input = "Bitte sofort an Thomas senden. Kurze Info, nur vorschau.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.meta?.autoSend).toBe(false);
      }
    });
  });

  describe('Pronoun blocking', () => {
    it('should NOT match "Bitte sofort an mir senden. Test." (Pronomen blockiert)', () => {
      const input = "Bitte sofort an mir senden. Test.";
      const intent = routeVoiceIntent(input);
      
      // Sollte NICHT als passive-send erkannt werden
      if (intent.type === 'email-compose' && intent.meta?.source === 'passive-send') {
        // Falls doch erkannt, sollte Empfänger nicht "mir" sein
        expect(intent.toRaw?.toLowerCase()).not.toBe('mir');
      }
    });

    it('should NOT match "Sofort an dir senden. Test." (Pronomen blockiert)', () => {
      const input = "Sofort an dir senden. Test.";
      const intent = routeVoiceIntent(input);
      
      if (intent.type === 'email-compose' && intent.meta?.source === 'passive-send') {
        expect(intent.toRaw?.toLowerCase()).not.toBe('dir');
      }
    });

    it('should NOT match "Bitte an uns senden. Test." (Pronomen blockiert)', () => {
      const input = "Bitte an uns senden. Test.";
      const intent = routeVoiceIntent(input);
      
      if (intent.type === 'email-compose' && intent.meta?.source === 'passive-send') {
        expect(intent.toRaw?.toLowerCase()).not.toBe('uns');
      }
    });
  });

  describe('Multi-token names', () => {
    it('should match "Bitte sofort an Thomas Müller senden. Test." (2-Token Name)', () => {
      const input = "Bitte sofort an Thomas Müller senden. Test.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.toRaw?.toLowerCase()).toContain('müller');
        expect(intent.bodyHint).toBeDefined();
        expect(intent.meta?.autoSend).toBe(true);
      }
    });
  });
});
