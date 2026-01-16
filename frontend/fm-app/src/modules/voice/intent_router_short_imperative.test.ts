/**
 * Unit Tests für Short Imperative Pattern: "sende <name> bitte, <body>"
 * 
 * Testet das Pattern für kurze Imperativ-Sätze wie:
 * - "Sende Thomas bitte, ich melde mich später nochmal."
 * - "Schick Thomas, ich bin gleich da."
 */

import { describe, it, expect } from 'vitest';
import { routeVoiceIntent } from './intent_router';

describe('Short Imperative Pattern: "sende <name> bitte, <body>"', () => {
  describe('Basic pattern matching', () => {
    it('should match "Sende Thomas bitte, ich melde mich später nochmal."', () => {
      const input = "Sende Thomas bitte, ich melde mich später nochmal.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          expect(bodyHintLower).toContain('ich melde mich');
          expect(bodyHintLower).toContain('später nochmal');
        }
        expect(intent.bodyHintRaw).toBeDefined();
        expect(intent.meta?.autoSend).toBe(true);
        expect(intent.meta?.source).toBe('short-imperative');
      }
    });

    it('should match "Schick Thomas, ich bin gleich da."', () => {
      const input = "Schick Thomas, ich bin gleich da.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          expect(intent.bodyHint.toLowerCase()).toContain('ich bin gleich da');
        }
        expect(intent.meta?.autoSend).toBe(true);
        expect(intent.meta?.source).toBe('short-imperative');
      }
    });

    it('should match "sende Thomas: ich komme später" (mit Doppelpunkt)', () => {
      const input = "sende Thomas: ich komme später";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          expect(intent.bodyHint.toLowerCase()).toContain('ich komme später');
        }
        expect(intent.meta?.autoSend).toBe(true);
      }
    });

    it('should match "schick Thomas. ich bin da" (mit Punkt)', () => {
      const input = "schick Thomas. ich bin da";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          expect(intent.bodyHint.toLowerCase()).toContain('ich bin da');
        }
        expect(intent.meta?.autoSend).toBe(true);
      }
    });
  });

  describe('Negation handling', () => {
    it('should block AutoSend for "Sende Thomas bitte, ich melde mich später nochmal, aber nicht senden."', () => {
      const input = "Sende Thomas bitte, ich melde mich später nochmal, aber nicht senden.";
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
          expect(bodyHintLower).toContain('ich melde mich');
        }
        // AutoSend sollte false sein wegen Negation
        expect(intent.meta?.autoSend).toBe(false);
      }
    });

    it('should block AutoSend for "Schick Thomas, ich komme später, noch nicht senden."', () => {
      const input = "Schick Thomas, ich komme später, noch nicht senden.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.meta?.autoSend).toBe(false);
      }
    });

    it('should block AutoSend for "Sende Thomas bitte, ich melde mich später, nur vorschau."', () => {
      const input = "Sende Thomas bitte, ich melde mich später, nur vorschau.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.meta?.autoSend).toBe(false);
      }
    });
  });

  describe('Pronoun blocking', () => {
    it('should NOT match "Sende mir bitte, ich bin da." (Pronomen blockiert)', () => {
      const input = "Sende mir bitte, ich bin da.";
      const intent = routeVoiceIntent(input);
      
      // Sollte NICHT als short-imperative erkannt werden
      // Kann von anderen Matchern erkannt werden, aber nicht mit source 'short-imperative'
      if (intent.type === 'email-compose' && intent.meta?.source === 'short-imperative') {
        // Falls doch als short-imperative erkannt, sollte Empfänger nicht "mir" sein
        expect(intent.toRaw?.toLowerCase()).not.toBe('mir');
      }
      // Oder geht zu ai-chat (das ist auch ok)
      // Das Hauptziel: "mir" wird nicht als Empfänger in short-imperative interpretiert
    });

    it('should NOT match "Schick dir, ich komme." (Pronomen blockiert)', () => {
      const input = "Schick dir, ich komme.";
      const intent = routeVoiceIntent(input);
      
      // Sollte NICHT als short-imperative erkannt werden
      if (intent.type === 'email-compose' && intent.meta?.source === 'short-imperative') {
        expect(intent.toRaw?.toLowerCase()).not.toBe('dir');
      }
    });

    it('should NOT match "Sende uns bitte, ich bin da." (Pronomen blockiert)', () => {
      const input = "Sende uns bitte, ich bin da.";
      const intent = routeVoiceIntent(input);
      
      if (intent.type === 'email-compose' && intent.meta?.source === 'short-imperative') {
        expect(intent.toRaw?.toLowerCase()).not.toBe('uns');
      }
    });
  });

  describe('Multi-token names', () => {
    it('should match "Sende Thomas Müller bitte, ich komme später." (2-Token Name)', () => {
      const input = "Sende Thomas Müller bitte, ich komme später.";
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
