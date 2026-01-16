/**
 * Unit Tests für Intent-4.2 Umgangssprache-Mail Fallback
 * 
 * Testet die Body-Extraktion für Muster wie "schick <NAME> eine kurze mail, <BODY>"
 */

import { describe, it, expect } from 'vitest';
import { routeVoiceIntent } from './intent_router';

describe('Intent-4.2: Umgangssprache-Mail Fallback', () => {
  describe('parseSchickMailPattern - Body-Extraktion', () => {
    it('should extract bodyHint from "Schick Thomas eine kurze Mail, ich komme 10 Minuten später."', () => {
      const input = "Schick Thomas eine kurze Mail, ich komme 10 Minuten später.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          expect(bodyHintLower).toContain('ich komme');
          expect(bodyHintLower).toContain('minuten');
          expect(bodyHintLower).toContain('später');
        }
        // AutoSend sollte true sein, da Imperativ erkannt wurde
        expect(intent.meta?.autoSend).toBe(true);
      }
    });

    it('should extract bodyHint from "schick Thomas eine Mail, ich komme 10 Minuten später"', () => {
      const input = "schick Thomas eine Mail, ich komme 10 Minuten später";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          expect(bodyHintLower).toContain('ich komme');
          expect(bodyHintLower).toContain('später');
        }
        expect(intent.meta?.autoSend).toBe(true);
      }
    });

    it('should extract bodyHint from "sende Thomas eine kurze mail, ich komme später"', () => {
      const input = "sende Thomas eine kurze mail, ich komme später";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          expect(bodyHintLower).toContain('ich komme');
          expect(bodyHintLower).toContain('später');
        }
        expect(intent.meta?.autoSend).toBe(true);
      }
    });

    it('should extract bodyHint from "Schick Thomas eine kurze Mail: ich komme später" (mit Doppelpunkt)', () => {
      const input = "Schick Thomas eine kurze Mail: ich komme später";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          const bodyHintLower = intent.bodyHint.toLowerCase();
          expect(bodyHintLower).toContain('ich komme');
          expect(bodyHintLower).toContain('später');
        }
        expect(intent.meta?.autoSend).toBe(true);
      }
    });

    it('should block AutoSend for "Schick Thomas eine kurze Mail, aber nicht senden."', () => {
      const input = "Schick Thomas eine kurze Mail, aber nicht senden.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        // BodyHint sollte NICHT "aber nicht senden" enthalten
        const bodyHint = intent.bodyHint?.toLowerCase() || '';
        expect(bodyHint).not.toContain('aber nicht');
        expect(bodyHint).not.toContain('nicht senden');
        // AutoSend sollte false sein wegen Negation
        expect(intent.meta?.autoSend).toBe(false);
      }
    });

    it('should block AutoSend for "Schick Thomas eine kurze Mail, noch nicht senden."', () => {
      const input = "Schick Thomas eine kurze Mail, noch nicht senden.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.meta?.autoSend).toBe(false);
      }
    });

    it('should block AutoSend for "Schick Thomas eine kurze Mail, nur vorschau."', () => {
      const input = "Schick Thomas eine kurze Mail, nur vorschau.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.meta?.autoSend).toBe(false);
      }
    });

    it('should handle "schick Thomas \'ne kurze mail, ich komme später" (mit \'ne)', () => {
      const input = "schick Thomas 'ne kurze mail, ich komme später";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          expect(intent.bodyHint.toLowerCase()).toContain('ich komme');
        }
        expect(intent.meta?.autoSend).toBe(true);
      }
    });

    it('should extract bodyHint from "schick Thomas eine mail ich komme später" (ohne Komma)', () => {
      const input = "schick Thomas eine mail ich komme später";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.toRaw?.toLowerCase()).toContain('thomas');
        expect(intent.bodyHint).toBeDefined();
        if (intent.bodyHint) {
          expect(intent.bodyHint.toLowerCase()).toContain('ich komme');
        }
        expect(intent.meta?.autoSend).toBe(true);
      }
    });
  });

  describe('Explicit body handling', () => {
    it('should set bodyHintRaw when bodyHint is present', () => {
      const input = "Schick Thomas eine kurze Mail, ich komme 10 Minuten später.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.bodyHint).toBeDefined();
        expect(intent.bodyHintRaw).toBeDefined();
        // bodyHintRaw sollte gleich bodyHint sein (oder ähnlich)
        expect(typeof intent.bodyHintRaw).toBe('string');
      }
    });

    it('should have source meta field set to intent-4.2-umgangssprache', () => {
      const input = "Schick Thomas eine kurze Mail, ich komme 10 Minuten später.";
      const intent = routeVoiceIntent(input);
      
      expect(intent.type).toBe('email-compose');
      if (intent.type === 'email-compose') {
        expect(intent.meta?.source).toBe('intent-4.2-umgangssprache');
      }
    });
  });
});
